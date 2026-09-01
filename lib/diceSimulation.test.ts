/**
 * Checks the two claims the dice roll rests on:
 *
 *   1. Every roll that gets shown is a good roll — all five dice on the felt, lying
 *      flat, not stacked.
 *   2. Relabelling the pips makes the die display the value the game decided, for every
 *      combination of landed face and target face.
 *
 * Run with:  npx tsx lib/diceSimulation.test.ts
 */
import assert from 'assert';
import * as THREE from 'three';
import { SimResult, simulateRoll } from './diceSimulation';
import { DIE_HALF, DIE_SIZE, FACE_AXIS, relabelQuaternion, valueFromQuaternion } from './dieFaces';

const REST_Y = DIE_HALF;
const EDGE_MARGIN = DIE_HALF * 1.25;

function boundsFor(aspect: number, height = 10) {
    const width = height * aspect;
    return {
        xMin: -width / 2 + EDGE_MARGIN,
        xMax: width / 2 - EDGE_MARGIN,
        zMin: -height / 2 + EDGE_MARGIN,
        zMax: height / 2 - EDGE_MARGIN,
    };
}

/** The value a viewer sees on top, given the body orientation and the pip relabelling. */
function displayedValue(bodyQuat: THREE.Quaternion, faceRot: THREE.Quaternion): number {
    return valueFromQuaternion(bodyQuat.clone().multiply(faceRot));
}

function testRelabelling() {
    console.log('Test 1: relabelling shows the intended value from any landed face');

    for (let settled = 1; settled <= 6; settled++) {
        // Any body orientation that genuinely lands `settled` face up.
        const axis = FACE_AXIS[settled];
        const bodyQuat = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
        assert.strictEqual(
            valueFromQuaternion(bodyQuat),
            settled,
            `sanity: unrelabelled die with ${settled} up should read ${settled}`
        );

        for (let target = 1; target <= 6; target++) {
            const faceRot = relabelQuaternion(settled, target);
            const shown = displayedValue(bodyQuat, faceRot);
            assert.strictEqual(shown, target, `landed ${settled}, wanted ${target}, showed ${shown}`);

            // A relabelled die must still be a real die: opposite faces sum to seven.
            for (const [a, b] of [[1, 6], [2, 5], [3, 4]] as const) {
                const va = FACE_AXIS[a].clone().applyQuaternion(faceRot);
                const vb = FACE_AXIS[b].clone().applyQuaternion(faceRot);
                assert.ok(
                    va.dot(vb) < -0.999,
                    `faces ${a} and ${b} must stay opposite after relabelling ${settled}->${target}`
                );
            }
        }
    }
    console.log('  PASS (36 face combinations)');
}

function testSimulationQuality() {
    console.log('Test 2: simulated rolls are always legal and readable');

    // Desktop-ish felt, a squarer one, and a deliberately cramped one.
    const shapes: Array<[string, number]> = [
        ['felt 1.23:1', 1.226],
        ['square', 1.0],
        ['narrow 0.75:1', 0.75],
    ];

    for (const [label, aspect] of shapes) {
        const bounds = boundsFor(aspect);
        const runs = 120;
        let totalRejects = 0;
        let failures = 0;
        let totalDuration = 0;
        const started = Date.now();

        for (let i = 0; i < runs; i++) {
            const sim: SimResult | null = simulateRoll({
                seed: 1000 + i * 31,
                count: 5,
                dieSize: DIE_SIZE,
                bounds,
                restY: REST_Y,
            });

            if (!sim) {
                failures++;
                continue;
            }
            totalRejects += sim.rejected;
            totalDuration += sim.durationSec;

            assert.ok(sim.frameCount > 10, 'a roll should have real motion, not a couple of frames');
            assert.strictEqual(sim.settledValues.length, 5);

            const finals: Array<{ x: number; z: number }> = [];
            for (let d = 0; d < 5; d++) {
                const p: Float32Array = sim.positions[d];
                const q: Float32Array = sim.quaternions[d];
                const f: number = sim.frameCount - 1;
                const x = p[f * 3];
                const y = p[f * 3 + 1];
                const z = p[f * 3 + 2];

                assert.ok(x >= bounds.xMin - 0.02 && x <= bounds.xMax + 0.02, `${label}: die ${d} off the felt in x (${x})`);
                assert.ok(z >= bounds.zMin - 0.02 && z <= bounds.zMax + 0.02, `${label}: die ${d} off the felt in z (${z})`);
                assert.ok(Math.abs(y - REST_Y) < 0.02, `${label}: die ${d} not resting on the felt (y=${y})`);

                const quat: THREE.Quaternion = new THREE.Quaternion(q[f * 4], q[f * 4 + 1], q[f * 4 + 2], q[f * 4 + 3]);
                const value: number = sim.settledValues[d];
                assert.strictEqual(
                    valueFromQuaternion(quat),
                    value,
                    `${label}: reported settled value disagrees with the final orientation`
                );

                // Flat, not cocked: the up face normal is essentially vertical.
                const up = FACE_AXIS[value].clone().applyQuaternion(quat);
                assert.ok(up.y > 0.98, `${label}: die ${d} is cocked (up.y=${up.y.toFixed(3)})`);

                finals.push({ x, z });
            }

            for (let a = 0; a < 5; a++) {
                for (let b = a + 1; b < 5; b++) {
                    const dist = Math.hypot(finals[a].x - finals[b].x, finals[a].z - finals[b].z);
                    assert.ok(dist >= DIE_SIZE * 0.999, `${label}: dice ${a} and ${b} overlap (${dist.toFixed(2)})`);
                }
            }

            // And the value the player is told is the value they will see.
            const targets = Array.from({ length: 5 }, (_, d) => ((i + d) % 6) + 1);
            for (let d = 0; d < 5; d++) {
                const f: number = sim.frameCount - 1;
                const q: Float32Array = sim.quaternions[d];
                const quat: THREE.Quaternion = new THREE.Quaternion(q[f * 4], q[f * 4 + 1], q[f * 4 + 2], q[f * 4 + 3]);
                const faceRot = relabelQuaternion(sim.settledValues[d], targets[d]);
                assert.strictEqual(
                    displayedValue(quat, faceRot),
                    targets[d],
                    `${label}: relabelled die should display ${targets[d]}`
                );
            }
        }

        const ms = Date.now() - started;
        console.log(
            `  ${label}: ${runs - failures}/${runs} rolls produced, ` +
            `${(totalRejects / runs).toFixed(2)} rejects per roll, ${(ms / runs).toFixed(1)} ms to generate, ` +
            `${(totalDuration / (runs - failures)).toFixed(2)}s average roll length`
        );
        assert.ok(failures === 0, `${label}: ${failures} rolls could not be produced at all`);
        // Budget: a roll has to feel instant when the player taps.
        assert.ok(ms / runs < 60, `${label}: rolls are too slow to generate (${(ms / runs).toFixed(1)} ms)`);
    }

    console.log('  PASS');
}

function testHeldDiceAreAvoided() {
    console.log('Test 3: thrown dice do not land on top of held dice');

    const bounds = boundsFor(1.226);
    const obstacles = [
        { x: -1.4, y: REST_Y, z: bounds.zMin },
        { x: 0, y: REST_Y, z: bounds.zMin },
    ];

    for (let i = 0; i < 40; i++) {
        const sim: SimResult | null = simulateRoll({
            seed: 5000 + i * 17,
            count: 3,
            dieSize: DIE_SIZE,
            bounds,
            restY: REST_Y,
            obstacles,
        });
        assert.ok(sim, 'should still be able to produce a roll with held dice present');

        const f = sim!.frameCount - 1;
        for (let d = 0; d < 3; d++) {
            const p = sim!.positions[d];
            for (const o of obstacles) {
                const dist = Math.hypot(p[f * 3] - o.x, p[f * 3 + 2] - o.z);
                assert.ok(dist >= DIE_SIZE * 0.95, `thrown die ${d} ended on a held die (${dist.toFixed(2)})`);
            }
        }
    }
    console.log('  PASS');
}

console.log('Running dice simulation tests...\n');
testRelabelling();
testSimulationQuality();
testHeldDiceAreAvoided();
console.log('\nALL TESTS PASSED');

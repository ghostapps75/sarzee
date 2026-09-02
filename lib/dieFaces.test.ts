/**
 * Checks the cube-rotation helpers behind the held-dice tray:
 *
 *   1. CUBE_ROTATIONS is the full rotation group of the cube — 24 distinct orientations,
 *      each of which leaves every face axis on some face axis.
 *   2. nearestCubeRotation squares a die up without changing which face is on top, for
 *      any small tilt and any yaw, and leaves an already-square die exactly as it is.
 *
 * Run with:  npx tsx lib/dieFaces.test.ts
 */
import assert from 'assert';
import * as THREE from 'three';
import { CUBE_ROTATIONS, FACE_AXIS, nearestCubeRotation, relabelQuaternion, valueFromQuaternion } from './dieFaces';

const UP = new THREE.Vector3(0, 1, 0);
const isAxisAligned = (v: THREE.Vector3) => {
    const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)].sort((p, q) => q - p);
    return a[0] > 0.9999 && a[1] < 1e-4 && a[2] < 1e-4;
};

function testGroup() {
    console.log('Test 1: CUBE_ROTATIONS is the 24-element rotation group of the cube');
    assert.strictEqual(CUBE_ROTATIONS.length, 24, `expected 24 orientations, got ${CUBE_ROTATIONS.length}`);

    for (let i = 0; i < CUBE_ROTATIONS.length; i++) {
        for (let j = i + 1; j < CUBE_ROTATIONS.length; j++) {
            assert.ok(Math.abs(CUBE_ROTATIONS[i].dot(CUBE_ROTATIONS[j])) < 0.9999, `orientations ${i} and ${j} coincide`);
        }
        for (const axis of Object.values(FACE_AXIS)) {
            const moved = axis.clone().applyQuaternion(CUBE_ROTATIONS[i]);
            assert.ok(isAxisAligned(moved), `orientation ${i} sends a face axis off-axis`);
        }
    }
    console.log('  ok');
}

function testNearest() {
    console.log('Test 2: nearestCubeRotation keeps the top face and squares the yaw');

    let seed = 12345;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    for (let trial = 0; trial < 500; trial++) {
        // A die that landed `settled` up, turned to a random yaw and tilted up to ~9°,
        // which is as cocked as diceSimulation will accept.
        const settled = 1 + Math.floor(rand() * 6);
        const body = new THREE.Quaternion().setFromUnitVectors(FACE_AXIS[settled], UP);
        const yaw = new THREE.Quaternion().setFromAxisAngle(UP, rand() * Math.PI * 2);
        const tiltAxis = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
        const tilt = new THREE.Quaternion().setFromAxisAngle(tiltAxis, ((rand() - 0.5) * 18 * Math.PI) / 180);
        const q = tilt.multiply(yaw).multiply(body);

        // With a pip relabelling on top, as a real roll has.
        const target = 1 + Math.floor(rand() * 6);
        const faceRot = relabelQuaternion(settled, target);
        const shownBefore = valueFromQuaternion(q.clone().multiply(faceRot));
        assert.strictEqual(shownBefore, target, 'test setup: relabelled die should show the target');

        const square = nearestCubeRotation(q);

        // Same face on top, same value shown.
        assert.strictEqual(valueFromQuaternion(square), valueFromQuaternion(q), `trial ${trial}: top face changed`);
        assert.strictEqual(valueFromQuaternion(square.clone().multiply(faceRot)), target, `trial ${trial}: shown value changed`);

        // Genuinely square: every face axis lands on a world axis.
        for (const axis of Object.values(FACE_AXIS)) {
            assert.ok(isAxisAligned(axis.clone().applyQuaternion(square)), `trial ${trial}: result is not square`);
        }

        // And it is the *nearest* square pose: no group element is closer.
        const closeness = Math.abs(square.dot(q));
        for (const g of CUBE_ROTATIONS) {
            assert.ok(Math.abs(g.dot(q)) <= closeness + 1e-9, `trial ${trial}: a closer orientation exists`);
        }
    }

    // Already square: unchanged (up to sign).
    for (const g of CUBE_ROTATIONS) {
        assert.ok(Math.abs(nearestCubeRotation(g).dot(g)) > 0.9999, 'a square die should not move');
    }
    console.log('  ok');
}

testGroup();
testNearest();
console.log('All dieFaces tests passed');

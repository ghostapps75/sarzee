// lib/diceSimulation.ts
//
// Deterministic dice by way of honest physics.
//
// The problem this solves: a physics roll looks wonderful but can't be told what to
// land on, and it occasionally throws a die off the table or leaves one cocked against
// the rail. A hand-authored animation is controllable but reads as fake, because at some
// point it has to rotate the die into its answer and real dice never do that.
//
// The way out is that a die is a symmetric cube. So:
//
//   1. Simulate a completely free roll, headlessly, in well under a millisecond.
//   2. Throw the result away and re-run if any die left the felt, ended up cocked, or
//      is still moving. Bad rolls are never shown, so dice cannot land off the surface.
//   3. Read which face happened to land up, then rotate the *pips inside the cube* so
//      that face shows the number we already decided on.
//   4. Play back the recorded trajectory.
//
// Step 3 is invisible: opposite faces still sum to seven and the die is still a proper
// right-handed die, because the relabelling is a rotation from the cube's own symmetry
// group. The motion on screen is real rigid-body motion from first to last frame.

import * as CANNON from 'cannon-es';

export interface SimBounds {
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
}

export interface SimOptions {
    seed: number;
    /** How many dice are actually being thrown. */
    count: number;
    dieSize: number;
    bounds: SimBounds;
    /** Resting height of a die's centre above the felt. */
    restY: number;
    /** Held dice, which act as static obstacles the thrown dice can hit. */
    obstacles?: Array<{ x: number; y: number; z: number }>;
    maxAttempts?: number;
}

export interface SimResult {
    /** Number of recorded playback frames. */
    frameCount: number;
    /** Per die: [x,y,z] repeated frameCount times. */
    positions: Float32Array[];
    /** Per die: [x,y,z,w] repeated frameCount times. */
    quaternions: Float32Array[];
    /** The face value that naturally landed up, per die. */
    settledValues: number[];
    durationSec: number;
    /** How many simulations were rejected before this one. Useful when tuning. */
    rejected: number;
}

/** Physics step. Small enough that fast dice can't tunnel through the rails. */
const SIM_DT = 1 / 120;
/** Playback runs at 60fps, so keep every second step. */
const RECORD_EVERY = 2;
const MAX_SIM_SECONDS = 3.2;
/**
 * Not earth gravity in metres — the arena is ~12 units wide. Tuned so a throw reads as a
 * real toss rather than a feather or a bullet, and so a roll lasts about 1.55s. It is
 * paired with DIE_SIZE: smaller dice need weaker gravity to fall the same number of die
 * lengths in the same time, or the roll starts to look hurried.
 */
const GRAVITY = -46;
const SLEEP_LINEAR = 0.16;
const SLEEP_ANGULAR = 0.22;
/** A die resting flat has a face normal within a few degrees of straight up. */
const FLAT_DOT = 0.985;

const FACE_AXES: Array<{ value: number; axis: CANNON.Vec3 }> = [
    { value: 1, axis: new CANNON.Vec3(0, 1, 0) },
    { value: 6, axis: new CANNON.Vec3(0, -1, 0) },
    { value: 3, axis: new CANNON.Vec3(1, 0, 0) },
    { value: 4, axis: new CANNON.Vec3(-1, 0, 0) },
    { value: 2, axis: new CANNON.Vec3(0, 0, 1) },
    { value: 5, axis: new CANNON.Vec3(0, 0, -1) },
];

function mulberry32(seed: number) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Which face is up, and how squarely. `dot` near 1 means the die is lying flat;
 * anything less means it is cocked against a rail or another die.
 */
function upFace(q: CANNON.Quaternion): { value: number; dot: number } {
    let best = { value: 1, dot: -Infinity };
    const out = new CANNON.Vec3();
    for (const { value, axis } of FACE_AXES) {
        q.vmult(axis, out);
        if (out.y > best.dot) best = { value, dot: out.y };
    }
    return best;
}

function buildWorld(dieSize: number, bounds: SimBounds, obstacles: SimOptions['obstacles']) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    (world.solver as CANNON.GSSolver).iterations = 12;
    world.allowSleep = true;

    const felt = new CANNON.Material('felt');
    const die = new CANNON.Material('die');
    world.addContactMaterial(
        new CANNON.ContactMaterial(felt, die, { friction: 0.38, restitution: 0.32 })
    );
    world.addContactMaterial(
        new CANNON.ContactMaterial(die, die, { friction: 0.22, restitution: 0.28 })
    );

    // Floor.
    const floor = new CANNON.Body({ mass: 0, material: felt, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    // Rails. These are the reason a die can never end up on the wooden surround: it is
    // physically fenced in, rather than being nudged back by a clamp after the fact.
    const rails: Array<[CANNON.Vec3, [number, number, number]]> = [
        [new CANNON.Vec3(-1, 0, 0), [bounds.xMax, 0, 0]],
        [new CANNON.Vec3(1, 0, 0), [bounds.xMin, 0, 0]],
        [new CANNON.Vec3(0, 0, -1), [0, 0, bounds.zMax]],
        [new CANNON.Vec3(0, 0, 1), [0, 0, bounds.zMin]],
    ];
    for (const [normal, pos] of rails) {
        const wall = new CANNON.Body({ mass: 0, material: felt, shape: new CANNON.Plane() });
        // A cannon Plane faces +Z by default; rotate it to face into the arena.
        wall.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
        wall.position.set(pos[0], pos[1], pos[2]);
        world.addBody(wall);
    }

    // Held dice sit on the felt and should be bounced off, not passed through.
    const half = dieSize / 2;
    for (const o of obstacles ?? []) {
        const body = new CANNON.Body({
            mass: 0,
            material: die,
            shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
        });
        body.position.set(o.x, o.y, o.z);
        world.addBody(body);
    }

    return { world, dieMaterial: die };
}

function attempt(opts: SimOptions, seed: number): SimResult | null {
    const { count, dieSize, bounds, restY } = opts;
    const half = dieSize / 2;
    const rng = mulberry32(seed);

    const { world, dieMaterial } = buildWorld(dieSize, bounds, opts.obstacles);

    // Throw from just inside the far rail, across and down the table.
    const launchZ = bounds.zMax - half * 0.5;
    const spanX = bounds.xMax - bounds.xMin;

    const bodies: CANNON.Body[] = [];
    for (let i = 0; i < count; i++) {
        const body = new CANNON.Body({
            mass: 1,
            material: dieMaterial,
            shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
            linearDamping: 0.06,
            angularDamping: 0.09,
        });
        body.allowSleep = true;
        body.sleepSpeedLimit = SLEEP_LINEAR;
        body.sleepTimeLimit = 0.22;

        // Stagger the dice across the throwing edge and up in the air so they don't all
        // start interpenetrating.
        const lane = (i - (count - 1) / 2) / Math.max(1, count);
        body.position.set(
            lane * spanX * 0.55 + (rng() - 0.5) * dieSize * 0.4,
            restY + dieSize * (1.6 + rng() * 1.5),
            launchZ + (rng() - 0.5) * dieSize * 0.5
        );
        body.quaternion.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
        // A wide spread of forward speed is what makes the dice come to rest all over the
        // felt instead of bunching at the far end.
        const throwSpeed = 6 + rng() * 14;
        body.velocity.set((rng() - 0.5) * 9, -3 - rng() * 5, -throwSpeed);
        body.angularVelocity.set(
            (rng() - 0.5) * 26,
            (rng() - 0.5) * 26,
            (rng() - 0.5) * 26
        );

        world.addBody(body);
        bodies.push(body);
    }

    const maxSteps = Math.ceil(MAX_SIM_SECONDS / SIM_DT);
    const posFrames: number[][] = Array.from({ length: count }, () => []);
    const quatFrames: number[][] = Array.from({ length: count }, () => []);
    let frames = 0;
    let settledStep = -1;

    for (let step = 0; step < maxSteps; step++) {
        // Single fixed step. (Not `fixedStep`, which paces itself off the wall clock
        // and would barely advance inside a tight headless loop.)
        world.step(SIM_DT);

        if (step % RECORD_EVERY === 0) {
            for (let i = 0; i < count; i++) {
                const b = bodies[i];
                posFrames[i].push(b.position.x, b.position.y, b.position.z);
                quatFrames[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
            }
            frames++;
        }

        const allStill = bodies.every(
            (b) => b.velocity.length() < SLEEP_LINEAR && b.angularVelocity.length() < SLEEP_ANGULAR
        );
        if (allStill && step > 30) {
            settledStep = step;
            break;
        }
    }

    // Never show a roll that didn't finish.
    if (settledStep < 0) return null;

    const settledValues: number[] = [];
    for (let i = 0; i < count; i++) {
        const b = bodies[i];
        const face = upFace(b.quaternion);

        // Cocked against a rail or perched on another die.
        if (face.dot < FLAT_DOT) return null;
        // Resting at the wrong height means it's on top of something.
        if (Math.abs(b.position.y - restY) > dieSize * 0.35) return null;
        // Outside the felt (shouldn't happen with rails, but never trust it).
        if (
            b.position.x < bounds.xMin - 0.01 ||
            b.position.x > bounds.xMax + 0.01 ||
            b.position.z < bounds.zMin - 0.01 ||
            b.position.z > bounds.zMax + 0.01
        ) {
            return null;
        }

        settledValues.push(face.value);
    }

    // Dice should be readable, not in a pile. On a roomy felt we can insist on a little
    // daylight between them; on a cramped one, merely not touching has to be enough or
    // nearly every simulation would be rejected.
    const cells =
        ((bounds.xMax - bounds.xMin) / dieSize) * ((bounds.zMax - bounds.zMin) / dieSize);
    const minSeparation = dieSize * (cells > 20 ? 1.05 : 1.0);
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            const a = bodies[i].position;
            const b = bodies[j].position;
            if (Math.hypot(a.x - b.x, a.z - b.z) < minSeparation) return null;
        }
    }

    // Tail-pad a few frames so playback ends on a clean, motionless pose.
    for (let pad = 0; pad < 4; pad++) {
        for (let i = 0; i < count; i++) {
            const b = bodies[i];
            posFrames[i].push(b.position.x, restY, b.position.z);
            quatFrames[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        }
        frames++;
    }

    return {
        frameCount: frames,
        positions: posFrames.map((f) => new Float32Array(f)),
        quaternions: quatFrames.map((f) => new Float32Array(f)),
        settledValues,
        durationSec: frames * SIM_DT * RECORD_EVERY,
        rejected: 0,
    };
}

/**
 * Runs free simulations until one produces a clean, readable roll. Typically succeeds on
 * the first or second try; each attempt costs well under a millisecond.
 */
export function simulateRoll(opts: SimOptions): SimResult | null {
    const maxAttempts = opts.maxAttempts ?? 32;
    for (let i = 0; i < maxAttempts; i++) {
        const result = attempt(opts, opts.seed + i * 7919);
        if (result) {
            result.rejected = i;
            return result;
        }
    }
    return null;
}

export const PLAYBACK_FPS = 1 / (SIM_DT * RECORD_EVERY);

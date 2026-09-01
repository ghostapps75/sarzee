// lib/dieFaces.ts
import * as THREE from 'three';

/**
 * Edge length of a die, in world units. The arena is ARENA_WORLD_HEIGHT tall, so this is
 * the one number that decides how big dice look — pip size, corner rounding, resting
 * height, spacing and the physics collision box are all derived from it.
 */
export const DIE_SIZE = 1.164;
export const DIE_HALF = DIE_SIZE / 2;

/**
 * Held dice are drawn at their normal size. They used to be enlarged for emphasis, but
 * parked in a tray they are already unmistakable — gold, in a column, off the felt — and
 * an oversized cube seen from 35 degrees off-axis shows so much of its side that it spills
 * out of the recess it is meant to be sitting in.
 */
export const HELD_SCALE = 1.0;

/**
 * Proportions of a die, as fractions of its edge length. Measured from the original
 * 1.45475-unit die so its look is preserved exactly at any size.
 */
export const DIE_PROPORTIONS = {
    pipRadius: 0.06187,
    pipHeight: 0.01512,
    /** How far a pip sits proud of the face. */
    pipProud: 0.01031,
    /** Distance of an outer pip from the centre of a face. */
    pipOffset: 0.16497,
    /** Corner rounding. */
    cornerRadius: 0.09623,
} as const;

/**
 * Which local axis each face's pips sit on. This must match the `<Face>` rotations in
 * components/Die.tsx: 1:+Y, 6:-Y, 3:+X, 4:-X, 2:+Z, 5:-Z.
 */
export const FACE_AXIS: Record<number, THREE.Vector3> = {
    1: new THREE.Vector3(0, 1, 0),
    6: new THREE.Vector3(0, -1, 0),
    3: new THREE.Vector3(1, 0, 0),
    4: new THREE.Vector3(-1, 0, 0),
    2: new THREE.Vector3(0, 0, 1),
    5: new THREE.Vector3(0, 0, -1),
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** The value showing on top of a die with the given orientation. */
export function valueFromQuaternion(q: THREE.Quaternion): number {
    const localUp = WORLD_UP.clone().applyQuaternion(q.clone().invert());
    const ax = Math.abs(localUp.x);
    const ay = Math.abs(localUp.y);
    const az = Math.abs(localUp.z);

    if (ay >= ax && ay >= az) return localUp.y > 0 ? 1 : 6;
    if (ax >= ay && ax >= az) return localUp.x > 0 ? 3 : 4;
    return localUp.z > 0 ? 2 : 5;
}

/**
 * A rotation to apply to the pips *inside* the cube so that `target` ends up on the face
 * the physics simulation actually landed on.
 *
 * Because it maps one face axis onto another, the result is always a member of the cube's
 * own rotation group: opposite faces still sum to seven, the die stays right-handed, and
 * nothing about it looks re-labelled. This is what lets a completely free physics roll
 * produce a predetermined outcome without ever snapping a die into place.
 */
export function relabelQuaternion(settled: number, target: number): THREE.Quaternion {
    const from = FACE_AXIS[target];
    const to = FACE_AXIS[settled];
    if (!from || !to) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(from, to);
}

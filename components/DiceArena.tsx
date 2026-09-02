// components/DiceArena.tsx
'use client';

/*
 * The dice are animated imperatively: one mutable pose buffer is written every frame and
 * copied straight onto the three.js objects, rather than being pushed through React state
 * sixty times a second. That is the standard way to drive react-three-fiber, but it trips
 * two of React 19's experimental hook rules, which assume ordinary declarative rendering.
 * Both are disabled deliberately and only here.
 */
/* eslint-disable react-hooks/immutability, react-hooks/refs */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import Die from './Die';
import { BoardParticles, getBoard, heldSlotCentres } from '@/lib/boards';
import { DIE_HALF, DIE_SIZE, HELD_SCALE, nearestCubeRotation, relabelQuaternion } from '@/lib/dieFaces';
import { PLAYBACK_FPS, SimResult, simulateRoll } from '@/lib/diceSimulation';

export interface DiceArenaHandle {
    roll: () => void;
    rollToResult: (values: number[], opts?: { chaosMs?: number }) => void;
    reset: () => void;
    forceResult: (values: number[]) => void;

    getVisualValues: () => number[];
    getLastEmittedValues: () => number[];
    getRollSeq: () => number;
    triggerCelebrationShake: (intensity?: number) => void;
}

interface DiceArenaProps {
    onTurnComplete?: (results: number[]) => void;
    heldDice: boolean[];
    onDieClick: (index: number) => void;
    canInteract: boolean;
    diceColor?: string;
    showDebugNumbers?: boolean;
    /** Height of the play area in world units; width follows the measured aspect. */
    arenaWorldHeight?: number;
    /** Trim shadows, antialiasing and particle count on small/weak devices. */
    lowPower?: boolean;
    boardId?: string;
    /** Fired the first time a die touches the felt on a roll. */
    onImpact?: () => void;
    /**
     * Fired by `triggerCelebrationShake`. The shake itself is done to the board's DOM by
     * the host, not to the camera: the artwork is a static image behind this canvas, so
     * moving the camera moves the dice against a board that stays put.
     */
    onCelebrationShake?: (intensity: number) => void;
    /**
     * The dice the game currently holds. Used to restore the display when the arena is
     * remounted mid-game — rotating a phone changes the layout, which rebuilds this
     * component, and the dice should come back showing the same faces.
     */
    values?: number[];
}

export { DIE_SIZE } from '@/lib/dieFaces';

/** Height of a die's centre when it is resting on the felt. */
const REST_Y = DIE_HALF;

/** Tap targets aim for at least this many CSS pixels across. */
const MIN_TAP_PX = 42;

/** Gap between dice in the at-rest row, in die widths. */
const REST_GAP = 1.134;

/** Height of the play area in world units. Width follows the measured canvas aspect. */
export const ARENA_WORLD_HEIGHT = 10.0;
const CAMERA_FOV = 47;

/**
 * Distance at which a camera of CAMERA_FOV frames exactly ARENA_WORLD_HEIGHT.
 * Deriving this (rather than hardcoding a camera height) is what guarantees the visible
 * region and the region dice can land in are the same region.
 */
const CAMERA_DISTANCE = ARENA_WORLD_HEIGHT / 2 / Math.tan((CAMERA_FOV * Math.PI) / 360);
const CAMERA_Y = REST_Y + CAMERA_DISTANCE;

/** Keeps a die fully on the felt rather than half over the wooden edge. */
const EDGE_MARGIN = DIE_HALF * 1.25;

/**
 * How far the key light is tilted from vertical, as horizontal distance over height.
 *
 * This matters more than it looks. With a top-down camera, a die's top face mirrors the
 * light straight back at the viewer when the light's tilt matches the die's own outward
 * tilt from the camera — and at that spot the face blows out white and the pips become
 * unreadable. The far corner of the felt sits at a tilt of about 0.69, so anything below
 * that puts a permanent glare patch somewhere on the playing surface. Staying well above
 * it moves the mirror point off the board entirely.
 */
const KEY_LIGHT_TILT = 1.35;

/** Places the key light outside the felt's mirror zone, for a felt of any shape. */
function keyLightPosition(arenaWidth: number, arenaHeight: number): [number, number, number] {
    const y = ARENA_WORLD_HEIGHT * 1.35;
    const reach = KEY_LIGHT_TILT * y;
    const spread = Math.hypot(arenaWidth, arenaHeight) || 1;
    return [(reach * arenaWidth) / spread, y, (reach * arenaHeight) / spread];
}

const clampDie = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

function eulerForValue(value: number): [number, number, number] {
    switch (value) {
        case 1: return [0, 0, 0];
        case 6: return [Math.PI, 0, 0];
        case 2: return [-Math.PI / 2, 0, 0];
        case 5: return [Math.PI / 2, 0, 0];
        case 3: return [0, 0, Math.PI / 2];
        case 4: return [0, 0, -Math.PI / 2];
        default: return [0, 0, 0];
    }
}

/** In-flight playback of one recorded simulation. */
type Playback = {
    sim: SimResult;
    /** simulation body index -> die index. */
    map: number[];
    t: number;
    impacted: boolean;
};

/**
 * Everything the arena needs to know, held in one plain mutable object.
 *
 * It deliberately lives *outside* the <Canvas>: the roll is decided and simulated in
 * ordinary JavaScript, and the scene inside the canvas is only a renderer for it. An
 * earlier version put the imperative API on a component inside the canvas and reached in
 * through a ref, which meant a roll could silently do nothing if that inner tree hadn't
 * finished committing its effects.
 */
type ArenaState = {
    positions: THREE.Vector3[];
    quats: THREE.Quaternion[];
    /** Rotation of the pips inside each cube, so physics can land on any face. */
    faceRot: THREE.Quaternion[];
    playback: Playback | null;
    rollSeq: number;
    lastEmitted: number[];
    heldSlots: Map<number, number>;
    prevHeld: boolean[];
    /**
     * A die's glide between the felt and its tray slot. `turning` is set when the die is
     * picked up: it also settles from the yaw it landed with to its nearest square pose,
     * so parked dice line up with the tray instead of sitting at five different angles.
     */
    heldAnim: Array<{
        moving: boolean;
        t: number;
        from: THREE.Vector3;
        to: THREE.Vector3;
        turning: boolean;
        fromQ: THREE.Quaternion;
        toQ: THREE.Quaternion;
    }>;
    /** Where each die sat before it was held, so un-holding puts it back. */
    preHold: THREE.Vector3[];
};

function createArenaState(): ArenaState {
    return {
        positions: Array.from({ length: 5 }, (_, i) => new THREE.Vector3((i - 2) * DIE_SIZE * REST_GAP, REST_Y, 0)),
        quats: Array.from({ length: 5 }, () => new THREE.Quaternion()),
        faceRot: Array.from({ length: 5 }, () => new THREE.Quaternion()),
        playback: null,
        rollSeq: 0,
        lastEmitted: [1, 1, 1, 1, 1],
        heldSlots: new Map(),
        prevHeld: [false, false, false, false, false],
        heldAnim: Array.from({ length: 5 }, () => ({
            moving: false,
            t: 0,
            from: new THREE.Vector3(),
            to: new THREE.Vector3(),
            turning: false,
            fromQ: new THREE.Quaternion(),
            toQ: new THREE.Quaternion(),
        })),
        preHold: Array.from({ length: 5 }, () => new THREE.Vector3(0, REST_Y, 0)),
    };
}

/** Points a die's chosen face upward, with a random quarter-turn so it isn't uniform. */
function setFaceOn(s: ArenaState, i: number, value: number) {
    const [rx, , rz] = eulerForValue(value);
    const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
    const yaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (Math.floor(Math.random() * 4) * Math.PI) / 2
    );
    s.quats[i].copy(yaw.multiply(qFace));
    s.faceRot[i].identity();
}

/** Renders the dice and advances playback. Purely a view over ArenaState. */
function DiceLayer({
    state,
    heldDice,
    heldSlotPositions,
    canInteract,
    onDieClick,
    diceColor,
    showDebugNumbers,
    arenaWidth,
    arenaHeight,
    tapScale,
    onTurnComplete,
    onImpact,
    boardId,
}: {
    state: ArenaState;
    heldDice: boolean[];
    heldSlotPositions: THREE.Vector3[];
    canInteract: boolean;
    onDieClick: (idx: number) => void;
    diceColor: string;
    showDebugNumbers: boolean;
    arenaWidth: number;
    arenaHeight: number;
    tapScale: number;
    onTurnComplete?: (results: number[]) => void;
    onImpact?: () => void;
    boardId: string;
}) {
    const tmpA = useMemo(() => new THREE.Vector3(), []);
    const tmpB = useMemo(() => new THREE.Vector3(), []);
    const tmpQ = useMemo(() => new THREE.Quaternion(), []);

    // The camera never moves. It used to be shaken on impact and for celebrations, but the
    // board is a static image behind this canvas, so a camera shake moved the dice against
    // a board that stood still — and a parked held die visibly trembled in its tray. Both
    // shakes are now done to the board's DOM by BoardStage, so everything moves together.
    useFrame((_, dt) => {
        // --- held dice bookkeeping ---
        const glide = (i: number, to: THREE.Vector3, square: boolean) => {
            const anim = state.heldAnim[i];
            anim.moving = true;
            anim.t = 0;
            anim.from.copy(state.positions[i]);
            anim.to.copy(to);
            // Square up as it travels: same face up, edges parallel to the tray.
            anim.turning = square;
            if (square) {
                anim.fromQ.copy(state.quats[i]);
                anim.toQ.copy(nearestCubeRotation(state.quats[i]));
            }
        };

        // Released: slide back to the spot on the felt it was picked up from, so it never
        // reappears on top of another die.
        for (let i = 0; i < 5; i++) {
            if (!heldDice[i] && state.prevHeld[i]) {
                state.heldSlots.delete(i);
                glide(i, state.preHold[i], false);
            }
        }

        const previousSlots = new Map(state.heldSlots);
        const currentlyHeld: number[] = [];
        for (let i = 0; i < 5; i++) if (heldDice[i]) currentlyHeld.push(i);

        // Slots are handed out in die order and packed from the top, so the tray always
        // reads as a tidy column with no gaps and nothing stacked.
        state.heldSlots.clear();
        currentlyHeld.forEach((dieIdx, slot) => {
            state.heldSlots.set(dieIdx, slot);
            const justHeld = !state.prevHeld[dieIdx];
            const previous = previousSlots.get(dieIdx);
            if (justHeld) state.preHold[dieIdx].copy(state.positions[dieIdx]);
            // A die moving down a slot because an earlier one was released is already
            // square, so only a fresh pick-up needs to turn.
            if (justHeld || (previous !== undefined && previous !== slot)) {
                glide(dieIdx, heldSlotPositions[slot], justHeld);
            }
        });
        state.prevHeld = [...heldDice];

        for (let i = 0; i < 5; i++) {
            const anim = state.heldAnim[i];
            if (anim.moving) {
                anim.t += dt;
                const u = Math.min(1, anim.t / 0.4);
                const eased = easeOutCubic(u);
                state.positions[i].lerpVectors(anim.from, anim.to, eased);
                if (anim.turning) state.quats[i].slerpQuaternions(anim.fromQ, anim.toQ, eased);
                if (u >= 1) {
                    anim.moving = false;
                    state.positions[i].copy(anim.to);
                    if (anim.turning) state.quats[i].copy(anim.toQ);
                    anim.turning = false;
                }
            } else if (heldDice[i]) {
                const slot = state.heldSlots.get(i);
                if (slot !== undefined) state.positions[i].copy(heldSlotPositions[slot]);
            }
        }

        // --- simulation playback ---
        const pb = state.playback;
        if (!pb) return;

        pb.t += dt;

        const { sim } = pb;
        const exact = pb.t * PLAYBACK_FPS;
        const last = sim.frameCount - 1;
        const i0 = Math.min(last, Math.floor(exact));
        const i1 = Math.min(last, i0 + 1);
        const alpha = i1 === i0 ? 0 : exact - i0;

        for (let n = 0; n < pb.map.length; n++) {
            const dieIdx = pb.map[n];
            const p = sim.positions[n];
            const q = sim.quaternions[n];

            tmpA.set(p[i0 * 3], p[i0 * 3 + 1], p[i0 * 3 + 2]);
            tmpB.set(p[i1 * 3], p[i1 * 3 + 1], p[i1 * 3 + 2]);
            state.positions[dieIdx].copy(tmpA).lerp(tmpB, alpha);

            state.quats[dieIdx].set(q[i0 * 4], q[i0 * 4 + 1], q[i0 * 4 + 2], q[i0 * 4 + 3]);
            tmpQ.set(q[i1 * 4], q[i1 * 4 + 1], q[i1 * 4 + 2], q[i1 * 4 + 3]);
            state.quats[dieIdx].slerp(tmpQ, alpha);
        }

        // First touchdown: a clack, and the board takes the hit (BoardStage thumps the
        // whole stage). This used to shake the camera instead, which made the parked held
        // dice tremble in their tray while the painted board stood perfectly still.
        if (!pb.impacted) {
            for (let n = 0; n < pb.map.length; n++) {
                if (state.positions[pb.map[n]].y <= REST_Y + DIE_SIZE * 0.25) {
                    pb.impacted = true;
                    onImpact?.();
                    break;
                }
            }
        }

        if (exact >= last) {
            state.playback = null;
            onTurnComplete?.(state.lastEmitted.slice());
        }
    });

    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow raycast={() => null}>
                <planeGeometry args={[arenaWidth, arenaHeight]} />
                <shadowMaterial transparent opacity={0.3} />
            </mesh>

            {state.positions.map((_, i) => (
                <Die
                    key={i}
                    index={i}
                    position={state.positions[i]}
                    quaternion={state.quats[i]}
                    faceRotation={state.faceRot[i]}
                    isHeld={!!heldDice[i]}
                    color={diceColor}
                    showDebugNumber={showDebugNumbers}
                    canClick={canInteract}
                    tapScale={tapScale}
                    onClick={() => onDieClick(i)}
                    boardId={boardId}
                />
            ))}
        </>
    );
}

/**
 * Ambient motes over the felt, for the boards whose setting calls for them (see
 * `particles` in lib/boards.ts). Seeded deterministically so a re-render never
 * re-scatters them, and sized to the measured felt so they stay on the playing surface.
 */
function ThemeParticles({
    config,
    width,
    height,
    lowPower,
}: {
    config: BoardParticles;
    width: number;
    height: number;
    lowPower: boolean;
}) {
    const count = Math.max(12, Math.round(config.count * (lowPower ? 0.45 : 1)));
    const pointsRef = useRef<THREE.Points>(null);
    const drifts = config.motion === 'drift';

    const [positions, speeds] = useMemo(() => {
        let seed = 0x5a17ee;
        const rand = () => {
            seed += 0x6d2b79f5;
            let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        const pos = new Float32Array(count * 3);
        const spd = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (rand() - 0.5) * width;
            pos[i * 3 + 1] = rand() * 7;
            pos[i * 3 + 2] = (rand() - 0.5) * height;
            spd[i] = 0.2 + rand() * 0.4;
        }
        return [pos, spd];
    }, [count, width, height]);

    useFrame((three, dt) => {
        if (!pointsRef.current) return;
        const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;
        const t = three.clock.getElapsedTime();

        for (let i = 0; i < count; i++) {
            const xi = i * 3;
            const yi = xi + 1;
            const zi = xi + 2;

            if (drifts) {
                const time = t * 0.08;
                arr[xi] += Math.sin(time + i) * 0.004;
                arr[yi] += Math.cos(time * 0.6 + i) * 0.004;
                arr[zi] += Math.sin(time * 0.4 + i) * 0.004;
            } else {
                arr[yi] += speeds[i] * dt * 0.5;
                arr[xi] += Math.sin(t + i) * 0.002;
                arr[zi] += Math.cos(t * 0.7 + i) * 0.002;

                if (arr[yi] > 6.5) {
                    arr[yi] = 0;
                    arr[xi] = (Math.random() - 0.5) * width;
                    arr[zi] = (Math.random() - 0.5) * height;
                }
            }
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={pointsRef} key={`${count}-${width.toFixed(2)}`}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color={config.color}
                size={0.16}
                transparent
                opacity={0.5}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    );
}

const DiceArena = forwardRef<DiceArenaHandle, DiceArenaProps>((props, ref) => {
    const {
        onTurnComplete,
        onImpact,
        onCelebrationShake,
        heldDice,
        onDieClick,
        canInteract,
        diceColor = '#F5F5DC',
        showDebugNumbers = false,
        arenaWorldHeight = ARENA_WORLD_HEIGHT,
        lowPower = false,
        boardId = 'the-cafe',
        values,
    } = props;

    const state = useRef<ArenaState>(null as unknown as ArenaState);
    if (!state.current) state.current = createArenaState();

    // Dev affordance: lets the live dice poses be inspected from the console.
    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        (window as unknown as Record<string, unknown>).__sarzeeArena = state.current;
    }, []);

    // Show the dice the game already has. Without this, a remount (which happens when the
    // layout switches between the side-by-side and stacked arrangements, i.e. when a phone
    // is rotated) would leave a row of blank ones on the felt.
    const initialValues = useRef(values);
    useEffect(() => {
        const s = state.current;
        const v = initialValues.current;
        if (!v || s.playback) return;
        for (let i = 0; i < 5; i++) setFaceOn(s, i, clampDie(v[i] ?? 1));
        s.lastEmitted = v.map(clampDie);
    }, []);

    // Measure our own box rather than trusting a caller-supplied aspect ratio, so the
    // world the dice roll in is defined by the pixels we actually occupy.
    const hostRef = useRef<HTMLDivElement>(null);
    const [aspect, setAspect] = useState(0);
    const [feltPx, setFeltPx] = useState(0);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const apply = (width: number, height: number) => {
            if (width <= 0 || height <= 0) return;
            const next = width / height;
            setAspect((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
            setFeltPx((prev) => (Math.abs(prev - width) < 1 ? prev : width));
        };
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) apply(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(el);
        const r = el.getBoundingClientRect();
        apply(r.width, r.height);
        return () => observer.disconnect();
    }, []);

    const board = getBoard(boardId);

    /**
     * The canvas spans `board.arena`, which is the felt plus the side trays. The felt has
     * the same vertical extent, so it is exactly the middle slice of the canvas: world
     * height still equals the felt height, and only the visible width grows. That means
     * adding room for the trays changes nothing about how the dice roll.
     */
    const canvasWidth = arenaWorldHeight * (aspect || 1);
    const feltWidthFraction = board.felt.w / board.arena.w;
    const arenaHeight = arenaWorldHeight;
    const arenaWidth = canvasWidth * feltWidthFraction;

    /** World units per unit of image fraction, for placing things off the felt. */
    const worldPerFracY = arenaWorldHeight / board.felt.h;
    const worldPerFracX = worldPerFracY * (board.imgW / board.imgH);
    const feltCentre = {
        x: board.felt.x + board.felt.w / 2,
        y: board.felt.y + board.felt.h / 2,
    };

    const bounds = useMemo(
        () => ({
            xMin: -arenaWidth / 2 + EDGE_MARGIN,
            xMax: arenaWidth / 2 - EDGE_MARGIN,
            zMin: -arenaHeight / 2 + EDGE_MARGIN,
            zMax: arenaHeight / 2 - EDGE_MARGIN,
        }),
        [arenaWidth, arenaHeight]
    );

    const restSpacing = Math.min(DIE_SIZE * REST_GAP, Math.max(0.4, (arenaWidth - 2 * EDGE_MARGIN) / 4));

    const particles = board.particles;

    /**
     * Grow the dice's tap targets on small screens so they stay thumb-sized. A die renders
     * about 57px across on a desktop but only ~21px on a phone.
     */
    const tapScale = useMemo(() => {
        const diePx = feltPx > 0 ? (feltPx * feltWidthFraction * DIE_SIZE) / arenaWidth : 0;
        if (diePx <= 0) return 1.12;
        return Math.min(1.9, Math.max(1.12, MIN_TAP_PX / diePx));
    }, [feltPx, feltWidthFraction, arenaWidth]);

    const keyLight = useMemo(
        () => keyLightPosition(canvasWidth, arenaHeight),
        [canvasWidth, arenaHeight]
    );
    /** Orthographic shadow camera has to cover the whole felt, not the default +/-5. */
    const shadowExtent = Math.max(canvasWidth, arenaHeight) * 1.15;

    /**
     * One slot per die, down the tray in the board frame — off the playing surface.
     *
     * The offsets are pulled in slightly. A die is a solid object, not a decal: its top
     * face sits closer to the camera than the felt does, so a die placed at the felt-plane
     * projection of a slot appears pushed outward from the centre of the view and looks
     * like it is sitting beside the slot rather than in it. Scaling by the ratio of camera
     * distances puts the face the player actually looks at over the slot.
     */
    const parkedParallax =
        (CAMERA_DISTANCE - HELD_SCALE * DIE_HALF) / CAMERA_DISTANCE;

    const heldSlotPositions = useMemo(
        () =>
            heldSlotCentres(board, 5).map(
                (c) =>
                    new THREE.Vector3(
                        (c.x - feltCentre.x) * worldPerFracX * parkedParallax,
                        REST_Y,
                        (c.y - feltCentre.y) * worldPerFracY * parkedParallax
                    )
            ),
        [board, feltCentre.x, feltCentre.y, worldPerFracX, worldPerFracY, parkedParallax]
    );

    // The imperative API is built here, outside the canvas, so it is available as soon as
    // the component exists rather than after the 3D tree has committed.
    useImperativeHandle(
        ref,
        () => {
            const s = state.current;

            const emit = (vals: number[]) => {
                s.lastEmitted = vals.map(clampDie);
                onTurnComplete?.(s.lastEmitted.slice());
            };

            const setFace = (i: number, value: number) => setFaceOn(s, i, value);

            const rollToResult = (values: number[]) => {
                s.rollSeq += 1;
                s.lastEmitted = values.map(clampDie);

                const thrown: number[] = [];
                for (let i = 0; i < 5; i++) if (!heldDice[i]) thrown.push(i);

                if (thrown.length === 0) {
                    emit(values);
                    return;
                }

                // Held dice sit in the tray, off the playing surface, so there is nothing
                // on the felt for a throw to collide with.
                const sim = simulateRoll({
                    seed: 0x5a12ee + s.rollSeq * 7907,
                    count: thrown.length,
                    dieSize: DIE_SIZE,
                    bounds,
                    restY: REST_Y,
                });

                if (!sim) {
                    // Every attempt was rejected. Rather than show a bad roll, place the
                    // dice directly and carry on.
                    thrown.forEach((dieIdx, n) => {
                        setFace(dieIdx, clampDie(values[dieIdx] ?? 1));
                        const cols = Math.max(1, thrown.length);
                        s.positions[dieIdx].set(
                            bounds.xMin + ((n + 0.5) / cols) * (bounds.xMax - bounds.xMin),
                            REST_Y,
                            0
                        );
                    });
                    emit(values);
                    return;
                }

                // Cancel any tray glide still running on a die that is about to be thrown.
                thrown.forEach((dieIdx) => {
                    s.heldAnim[dieIdx].moving = false;
                    s.heldAnim[dieIdx].turning = false;
                });

                thrown.forEach((dieIdx, n) => {
                    s.faceRot[dieIdx].copy(
                        relabelQuaternion(sim.settledValues[n], clampDie(values[dieIdx] ?? 1))
                    );
                });

                s.playback = { sim, map: thrown, t: 0, impacted: false };
            };

            return {
                roll: () => rollToResult([0, 0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6))),
                rollToResult,
                reset: () => {
                    s.playback = null;
                    s.heldSlots.clear();
                    s.prevHeld = [false, false, false, false, false];
                    for (let i = 0; i < 5; i++) {
                        s.positions[i].set((i - 2) * restSpacing, REST_Y, 0);
                        s.quats[i].identity();
                        s.faceRot[i].identity();
                        s.heldAnim[i].moving = false;
                        s.heldAnim[i].turning = false;
                        s.preHold[i].set(0, REST_Y, 0);
                    }
                    s.lastEmitted = [1, 1, 1, 1, 1];
                },
                forceResult: (values: number[]) => {
                    s.rollSeq += 1;
                    s.playback = null;
                    for (let i = 0; i < 5; i++) setFace(i, clampDie(values[i] ?? 1));
                    emit(values);
                },
                getVisualValues: () => s.lastEmitted.slice(),
                getLastEmittedValues: () => s.lastEmitted.slice(),
                getRollSeq: () => s.rollSeq,
                triggerCelebrationShake: (intensity = 1.2) => {
                    onCelebrationShake?.(intensity);
                },
            };
        },
        [heldDice, bounds, restSpacing, onTurnComplete, onCelebrationShake]
    );

    return (
        <div ref={hostRef} className="w-full h-full relative">
            {aspect > 0 && (
                <Canvas
                    shadows={!lowPower}
                    dpr={lowPower ? 1 : [1, 2]}
                    gl={{
                        alpha: true,
                        antialias: !lowPower,
                        powerPreference: lowPower ? 'low-power' : 'high-performance',
                    }}
                    style={{ background: 'transparent', touchAction: 'none' }}
                    camera={{ position: [0, CAMERA_Y, 0], fov: CAMERA_FOV }}
                >
                    <ambientLight intensity={0.62} />
                    <directionalLight
                        position={keyLight}
                        // Brighter than it looks it should be: the light strikes the top
                        // faces at a shallow angle, so it needs more to land the same.
                        intensity={1.5}
                        castShadow={!lowPower}
                        shadow-mapSize={[1024, 1024]}
                        shadow-camera-near={1}
                        shadow-camera-far={80}
                        shadow-camera-left={-shadowExtent}
                        shadow-camera-right={shadowExtent}
                        shadow-camera-top={shadowExtent}
                        shadow-camera-bottom={-shadowExtent}
                        shadow-bias={-0.0012}
                    />
                    {/* Gentle fill from the opposite side so the shaded faces keep some
                        form. Mirrored, so its own glare point is off the felt too. */}
                    <directionalLight
                        position={[-keyLight[0], keyLight[1] * 0.8, -keyLight[2]]}
                        intensity={0.35}
                    />

                    {particles && (
                        <ThemeParticles
                            config={particles}
                            width={arenaWidth}
                            height={arenaHeight}
                            lowPower={lowPower}
                        />
                    )}

                    <DiceLayer
                        state={state.current}
                        heldDice={heldDice}
                        heldSlotPositions={heldSlotPositions}
                        canInteract={canInteract}
                        onDieClick={onDieClick}
                        diceColor={diceColor}
                        showDebugNumbers={showDebugNumbers}
                        arenaWidth={arenaWidth}
                        arenaHeight={arenaHeight}
                        tapScale={tapScale}
                        onTurnComplete={onTurnComplete}
                        onImpact={onImpact}
                        boardId={boardId}
                    />
                </Canvas>
            )}
        </div>
    );
});

DiceArena.displayName = 'DiceArena';
export default DiceArena;

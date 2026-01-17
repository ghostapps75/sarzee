// components/DiceArena.tsx
'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import Die, { DieHandle } from './Die';

export interface DiceArenaHandle {
    roll: () => void;
    rollToResult: (values: number[], opts?: { chaosMs?: number }) => void;
    reset: () => void;
    forceResult: (values: number[]) => void;

    getVisualValues: () => number[];
    getLastEmittedValues: () => number[];
    getRollSeq: () => number;
}

interface DiceArenaProps {
    onTurnComplete?: (results: number[]) => void;
    heldDice: boolean[];
    onDieClick: (index: number) => void;
    canInteract: boolean;
    diceColor?: string;
    showDebugNumbers?: boolean;
    feltAspect?: number;
    arenaWorldHeight?: number;
    isMobile?: boolean;
}

const DIE_SIZE = 1.15; // Slightly larger than original 1.11, but smaller than 1.4
const HALF = DIE_SIZE / 2;

// --- TUNING CONSTANTS for START of roll ---
const FLIGHT_SPIN_MIN = 3.0;  // rad/s (reduced from 5.0 for heavier feel)
const FLIGHT_SPIN_MAX = 14.0;  // reduced from 24.0 for heavier feel
const ARC_MIN = 1.5;          // peak height
const ARC_MAX = 2.2;
const IMPACT_OFFSET_MIN = 0.4; // how far from center it lands
const IMPACT_OFFSET_MAX = 1.0;
const LAUNCH_SPREAD_FACTOR = 0.12; // fraction of arena width

const clampDie = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

function eulerForValue(value: number): [number, number, number] {
    // ... (keep existing helper functions: eulerForValue, mulberry32, easeInOutCubic, easeOutCubic) ...
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

function mulberry32(seed: number) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function easeInOutCubic(x: number) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutCubic(x: number) {
    return 1 - Math.pow(1 - x, 3);
}

function generateLandingPoints({
    count,
    rng,
    minDist,
    xMin,
    xMax,
    zMin,
    zMax,
    avoidPositions,
}: {
    count: number;
    rng: () => number;
    minDist: number;
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
    avoidPositions?: THREE.Vector3[];
}): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const maxAttempts = 900;
    const avoidDist = minDist * 1.5; // Larger buffer around held dice

    for (let i = 0; i < count; i++) {
        let placed = false;

        for (let a = 0; a < maxAttempts; a++) {
            const x = xMin + (xMax - xMin) * rng();
            const z = zMin + (zMax - zMin) * rng();
            const c = new THREE.Vector3(x, 0.62, z);

            let ok = true;
            // Check against already placed points
            for (const p of pts) {
                if (c.distanceTo(p) < minDist) {
                    ok = false;
                    break;
                }
            }
            // Check against held dice positions (avoid collision)
            if (ok && avoidPositions) {
                for (const heldPos of avoidPositions) {
                    if (c.distanceTo(heldPos) < avoidDist) {
                        ok = false;
                        break;
                    }
                }
            }
            if (ok) {
                pts.push(c);
                placed = true;
                break;
            }
        }

        if (!placed) {
            const x = xMin + (xMax - xMin) * rng();
            const z = zMin + (zMax - zMin) * rng();
            pts.push(new THREE.Vector3(x, 0.62, z));
        }
    }

    return pts;
}

type DieAnim = {
    active: boolean;
    finishedMotion: boolean;

    t: number;
    dur: number;

    p0: THREE.Vector3;
    pMid: THREE.Vector3;
    p1: THREE.Vector3;

    q0: THREE.Quaternion;
    qTarget: THREE.Quaternion;

    lastPos: THREE.Vector3;
    rollAccum: THREE.Quaternion;

    arc: number;
    wobbleYaw: number;
    wobblePitch: number;

    // NEW: stable flight spin
    flightAxis: THREE.Vector3;
    flightSpeed: number;

    // NEW: correction computed once at ground start
    groundStarted: boolean;
    groundBaseQuat: THREE.Quaternion; // Add this
    hasGroundCorrection: boolean;
    corrAxis: THREE.Vector3;
    corrAngle: number;

    // NEW: settle unwrapping
    spinAxisGround: THREE.Vector3; // Fixed axis for ground roll
    settleInitialized: boolean;
    settleTime: number;
    settleDuration: number;
    settleStartQuat: THREE.Quaternion;
    settleAxis: THREE.Vector3;
    settleTotalAngle: number;

    // NEW: Monotonic integration
    currentOmega: number;
    accumulatedTheta: number;

    // NEW: Held dice organization
    movingToHeldSlot: boolean;
    heldSlotTime: number;
    heldSlotDuration: number;
    heldStartPos: THREE.Vector3;
    heldTargetPos: THREE.Vector3;
};

function AnimatedDiceLayer({
    heldDice,
    canInteract,
    onDieClick,
    diceColor,
    showDebugNumbers,
    feltAspect,
    arenaWorldHeight,
    onTurnComplete,
    apiRef,
    isMobile,
}: {
    heldDice: boolean[];
    canInteract: boolean;
    onDieClick: (idx: number) => void;
    diceColor: string;
    showDebugNumbers: boolean;
    feltAspect: number;
    arenaWorldHeight: number;
    onTurnComplete?: (results: number[]) => void;
    apiRef: React.MutableRefObject<DiceArenaHandle | null>;
    isMobile?: boolean;
}) {
    const dieRefs = useRef<Array<DieHandle | null>>([null, null, null, null, null]);

    const rollSeqRef = useRef(0);
    const lastEmittedValuesRef = useRef<number[]>([1, 1, 1, 1, 1]);

    const arenaHeight = arenaWorldHeight;
    const arenaWidth = arenaWorldHeight * feltAspect;
    const offsetX = 1.0;

    const positions = useRef<THREE.Vector3[]>(
        Array.from({ length: 5 }, (_, i) => new THREE.Vector3(offsetX + (i - 2) * 1.65, 0.62, 0)) // Adjusted spacing for smaller dice
    );
    const quats = useRef<THREE.Quaternion[]>(Array.from({ length: 5 }, () => new THREE.Quaternion()));

    const anim = useRef<DieAnim[]>(
        Array.from({ length: 5 }, () => ({
            active: false,
            finishedMotion: false,
            t: 0,
            dur: 1.0,
            p0: new THREE.Vector3(),
            pMid: new THREE.Vector3(),
            p1: new THREE.Vector3(),
            q0: new THREE.Quaternion(),
            qTarget: new THREE.Quaternion(),
            lastPos: new THREE.Vector3(),
            rollAccum: new THREE.Quaternion(),
            arc: 2.2,
            wobbleYaw: 0,
            wobblePitch: 0,

            flightAxis: new THREE.Vector3(1, 0, 0),
            flightSpeed: 10,

            groundStarted: false,
            groundBaseQuat: new THREE.Quaternion(), // Initialize this
            hasGroundCorrection: false,
            corrAxis: new THREE.Vector3(1, 0, 0),
            corrAngle: 0,

            spinAxisGround: new THREE.Vector3(1, 0, 0),
            settleInitialized: false,
            settleTime: 0,
            settleDuration: 0.25,
            settleStartQuat: new THREE.Quaternion(),
            settleAxis: new THREE.Vector3(0, 1, 0),
            settleTotalAngle: 0,

            currentOmega: 0,
            accumulatedTheta: 0,

            movingToHeldSlot: false,
            heldSlotTime: 0,
            heldSlotDuration: 0.4,
            heldStartPos: new THREE.Vector3(),
            heldTargetPos: new THREE.Vector3(),
        }))
    );

    // Track previous held state to detect when dice become held
    const prevHeldDice = useRef<boolean[]>([false, false, false, false, false]);

    // PRIORITY 2: Held dice organize into a nice row when held
    const heldSlotPositions = useMemo(() => {
        // Organize held dice in a horizontal row at the bottom of the board
        const bottomZ = -arenaHeight / 2 - 1.0; // Bottom edge
        const centerX = offsetX; // Center horizontally
        const totalWidth = 4 * 1.4; // Width for 5 dice with spacing (adjusted for smaller dice)
        const startX = centerX - totalWidth / 2; // Start position to center the row
        return Array.from({ length: 5 }, (_, i) => {
            return new THREE.Vector3(
                startX + i * 1.4, // Space them out horizontally (adjusted for smaller dice)
                0.75, // Slightly elevated (increased from 0.62) to ensure held dice are visible above board
                bottomZ
            );
        });
    }, [arenaHeight, offsetX]);

    // Track which held dice are in which slots
    const heldSlotAssignment = useRef<Map<number, number>>(new Map()); // dieIndex -> slotIndex

    const emit = (vals: number[]) => {
        const v = vals.map(clampDie);
        lastEmittedValuesRef.current = v;
        requestAnimationFrame(() => onTurnComplete?.(v));
    };

    const cancelAnimForDie = (i: number) => {
        const a = anim.current[i];
        a.active = false;
        a.finishedMotion = false;
        a.t = 0;
        a.groundStarted = false;
        a.hasGroundCorrection = false;
        a.corrAngle = 0;
        a.corrAxis.set(1, 0, 0);
        a.settleInitialized = false;
        a.spinAxisGround.set(1, 0, 0);
        a.currentOmega = 0;
        a.accumulatedTheta = 0;
    };

    const reset = () => {
        for (let i = 0; i < 5; i++) {
            positions.current[i].set(offsetX + (i - 2) * 1.65, 0.62, 0); // Adjusted spacing for smaller dice
            quats.current[i].identity();
            cancelAnimForDie(i);
            anim.current[i].rollAccum.identity();
        }
        lastEmittedValuesRef.current = [1, 1, 1, 1, 1];
    };

    const forceResult = (values: number[]) => {
        rollSeqRef.current += 1;
        for (let i = 0; i < 5; i++) {
            cancelAnimForDie(i);

            const v = clampDie(values[i] ?? 1);
            const [rx, , rz] = eulerForValue(v);
            const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
            const yaw = (Math.floor(Math.random() * 4) * Math.PI) / 2;
            const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            quats.current[i].copy(qYaw.multiply(qFace));
        }
        emit(values);
    };

    const rollToResult = (values: number[], opts?: { chaosMs?: number }) => {
        rollSeqRef.current += 1;
        const seq = rollSeqRef.current;
        const rng = mulberry32(0xabc000 + seq * 97);

        const baseDur = Math.max(0.9, Math.min(1.7, (opts?.chaosMs ?? 1150) / 1000));
        lastEmittedValuesRef.current = values.map(clampDie);

        const launchZ = arenaHeight * 0.36;
        const launchX = offsetX;
        // Tighter launch spread
        const launchSpread = Math.min(2.0, arenaWidth * LAUNCH_SPREAD_FACTOR);

        // PRIORITY 4: Tighten margins to prevent dice from landing outside visual board
        // Increased margins significantly to ensure dice stay well within visible board area
        const marginX = 3.5;  // Significantly increased, especially for left side which was problematic
        const marginZ = 3.2;  // Increased to ensure safe distance from edges
        const xMin = offsetX - arenaWidth / 2 + marginX;
        const xMax = offsetX + arenaWidth / 2 - marginX;
        const zMin = -arenaHeight / 2 + marginZ;
        const zMax = arenaHeight / 2 - marginZ;

        // Collect positions of held dice to avoid when placing new dice
        // Use their organized slot positions, not their current positions
        const heldPositions: THREE.Vector3[] = [];
        for (let i = 0; i < 5; i++) {
            if (heldDice[i]) {
                const slotIndex = heldSlotAssignment.current.get(i);
                if (slotIndex !== undefined) {
                    heldPositions.push(heldSlotPositions[slotIndex].clone());
                } else {
                    // Fallback to current position if slot not assigned yet
                    heldPositions.push(positions.current[i].clone());
                }
            }
        }

        // Only generate landing points for non-held dice
        const nonHeldCount = 5 - heldPositions.length;
        const land = generateLandingPoints({
            count: nonHeldCount,
            rng,
            minDist: 1.4, // Adjusted for smaller dice size
            xMin,
            xMax,
            zMin,
            zMax,
            avoidPositions: heldPositions,
        }).sort(() => rng() - 0.5);

        let landIndex = 0;
        for (let i = 0; i < 5; i++) {
            const a = anim.current[i];

            if (heldDice[i]) {
                cancelAnimForDie(i);
                // Keep dice at current position - don't move it
                // Quaternion is already preserved (keeps current face value)
                continue;
            }

            a.active = true;
            a.finishedMotion = false;
            a.t = 0;
            a.dur = baseDur + (rng() - 0.5) * 0.22;

            a.groundStarted = false;
            a.hasGroundCorrection = false;
            a.corrAngle = 0;
            a.corrAxis.set(1, 0, 0);

            const sx = launchX + (rng() - 0.5) * launchSpread;
            const sz = launchZ + (rng() - 0.5) * 0.75;
            a.p0.set(sx, 0.62, sz);

            a.p1.copy(land[landIndex]);
            landIndex++;

            const impactOffset = IMPACT_OFFSET_MIN + rng() * (IMPACT_OFFSET_MAX - IMPACT_OFFSET_MIN);
            const theta = rng() * Math.PI * 2;
            const ix = a.p1.x + Math.cos(theta) * impactOffset;
            const iz = a.p1.z + Math.sin(theta) * impactOffset;
            a.pMid.set(
                Math.max(xMin, Math.min(xMax, ix)),
                0.62,
                Math.max(zMin, Math.min(zMax, iz))
            );

            a.arc = ARC_MIN + rng() * (ARC_MAX - ARC_MIN);

            // start from current quat
            a.q0.copy(quats.current[i]);

            const v = clampDie(values[i] ?? 1);
            const [rx, , rz] = eulerForValue(v);
            const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
            const yaw = (Math.floor(rng() * 4) * Math.PI) / 2;
            const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            a.qTarget.copy(qYaw.multiply(qFace));

            a.rollAccum.identity();
            a.wobbleYaw = (rng() - 0.5) * 0.55;
            a.wobblePitch = (rng() - 0.5) * 0.55;

            // Randomize flight spin per die, so they don't look cloned
            a.flightAxis.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
            a.flightSpeed = FLIGHT_SPIN_MIN + rng() * (FLIGHT_SPIN_MAX - FLIGHT_SPIN_MIN);

            positions.current[i].copy(a.p0);
            quats.current[i].copy(a.q0);
            a.lastPos.copy(a.p0);
        }
    };

    const roll = () => {
        const vals = [0, 0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
        rollToResult(vals, { chaosMs: 1150 });
    };

    const getVisualValues = () => {
        const vals: number[] = [];
        for (let i = 0; i < 5; i++) {
            vals.push(clampDie(dieRefs.current[i]?.getValue?.() ?? lastEmittedValuesRef.current[i] ?? 1));
        }
        return vals;
    };

    const getLastEmittedValues = () => lastEmittedValuesRef.current.slice();
    const getRollSeq = () => rollSeqRef.current;

    useEffect(() => {
        apiRef.current = {
            roll,
            rollToResult,
            reset,
            forceResult,
            getVisualValues,
            getLastEmittedValues,
            getRollSeq,
        };
        return () => {
            apiRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // temps
    const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
    const tmpDelta = useMemo(() => new THREE.Vector3(), []);
    const tmpAxis = useMemo(() => new THREE.Vector3(), []);
    const tmpQ = useMemo(() => new THREE.Quaternion(), []);
    const tmpPos = useMemo(() => new THREE.Vector3(), []);
    const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
    const tmpWobble = useMemo(() => new THREE.Quaternion(), []);
    const tmpSpin = useMemo(() => new THREE.Quaternion(), []);
    const tmpErr = useMemo(() => new THREE.Quaternion(), []);
    const tmpCorr = useMemo(() => new THREE.Quaternion(), []);

    // NOTE: you can still tune these if you want
    const EPS = 0.010; // ~0.57 deg, finalize threshold

    const wasActiveRef = useRef(false);

    useFrame((_, dt) => {
        let anyActive = false;

        // Check for newly held dice and assign them slots
        // First, handle un-holding (free slots before reassigning)
        for (let i = 0; i < 5; i++) {
            if (!heldDice[i] && prevHeldDice.current[i]) {
                // This die just became un-held - free its slot and reset animation
                heldSlotAssignment.current.delete(i);
                const a = anim.current[i];
                a.movingToHeldSlot = false;
                a.heldSlotTime = 0;
                
                // Move unheld die back to a safe position on the main board area
                // Position it in a clear area to avoid being behind other held dice
                const safeX = offsetX + (i - 2) * 1.65;
                const safeZ = 0; // Center of board
                positions.current[i].set(safeX, 0.62, safeZ); // Ensure Y is at board level
            }
        }
        
        // Then, handle newly held dice and reassign slots compactly
        // Save old slot assignments before clearing
        const oldSlotAssignments = new Map(heldSlotAssignment.current);
        
        // Collect all currently held dice
        const currentlyHeld: number[] = [];
        for (let i = 0; i < 5; i++) {
            if (heldDice[i]) {
                currentlyHeld.push(i);
            }
        }
        
        // Reassign all slots compactly: first held die gets slot 0, second gets slot 1, etc.
        heldSlotAssignment.current.clear();
        for (let idx = 0; idx < currentlyHeld.length; idx++) {
            const dieIndex = currentlyHeld[idx];
            const slotIndex = idx;
            const wasJustHeld = !prevHeldDice.current[dieIndex];
            const oldSlot = oldSlotAssignments.get(dieIndex);
            const slotChanged = oldSlot !== undefined && oldSlot !== slotIndex;
            
            heldSlotAssignment.current.set(dieIndex, slotIndex);
            
            if (wasJustHeld || slotChanged) {
                // This die just became held OR its slot changed - start animation to new slot
                const a = anim.current[dieIndex];
                a.movingToHeldSlot = true;
                a.heldSlotTime = 0;
                a.heldStartPos.copy(positions.current[dieIndex]);
                a.heldTargetPos.copy(heldSlotPositions[slotIndex]);
            }
        }
        
        prevHeldDice.current = [...heldDice];

        for (let i = 0; i < 5; i++) {
            const animState = anim.current[i];
            
            // HELD dice: animate to organized position, then stay there
            if (heldDice[i]) {
                cancelAnimForDie(i);
                
                if (animState.movingToHeldSlot) {
                    // Smoothly animate to held slot position
                    animState.heldSlotTime += dt;
                    const u = Math.min(1, animState.heldSlotTime / animState.heldSlotDuration);
                    const eased = easeOutCubic(u);
                    
                    tmpPos.lerpVectors(animState.heldStartPos, animState.heldTargetPos, eased);
                    positions.current[i].copy(tmpPos);
                    
                    if (u >= 1) {
                        animState.movingToHeldSlot = false;
                        positions.current[i].copy(animState.heldTargetPos);
                    }
                } else {
                    // Already in position - stay there
                    const slotIndex = heldSlotAssignment.current.get(i);
                    if (slotIndex !== undefined) {
                        positions.current[i].copy(heldSlotPositions[slotIndex]);
                    }
                }
                // Quaternion stays as-is (preserves face value)
                continue;
            }

            const a = anim.current[i];
            if (!a.active) continue;
            anyActive = true;

            a.t += dt;
            const u = Math.min(1, a.t / a.dur);

            const flightEnd = 0.55;

            if (!a.finishedMotion) {
                if (u <= flightEnd) {
                    const uf = easeInOutCubic(u / flightEnd);

                    // flight position p0->pMid with arc
                    tmpPos.lerpVectors(a.p0, a.pMid, uf);
                    const arc = Math.sin(Math.PI * uf) * a.arc;
                    tmpPos.y = 0.62 + arc;
                    positions.current[i].copy(tmpPos);

                    // flight spin (stable axis, constant speed)
                    // "Ramp" is built-in because 'a.t' grows.
                    // For a curve, we could do (a.t + 0.5*a.t*a.t) or simpler: just linear is stable.
                    // User asked for "start lower, peak mid-roll".
                    // Let's try a slight easing on the rotation:
                    const spinT = a.t * a.flightSpeed; // Linear for now to ensure stability

                    tmpSpin.setFromAxisAngle(a.flightAxis, spinT);
                    tmpQuat.copy(a.q0).multiply(tmpSpin);

                    quats.current[i].copy(tmpQuat);
                    a.lastPos.copy(tmpPos);
                } else {
                    // ground roll
                    const ug = (u - flightEnd) / (1 - flightEnd);
                    const g = easeOutCubic(ug);

                    // on first ground frame...
                    if (!a.groundStarted) {
                        a.groundStarted = true;


                        // FIX: Capture the Base Orientation ONCE.
                        // Do NOT read quats.current[i] in the update loop anymore.
                        // At this exact moment (first ground frame), quats.current holds the FINAL flight frame orientation.
                        a.groundBaseQuat.copy(quats.current[i]).normalize();

                        // We compute correction relative to this base
                        const base = a.groundBaseQuat;
                        tmpErr.copy(base).invert().multiply(a.qTarget).normalize();

                        const w = THREE.MathUtils.clamp(tmpErr.w, -1, 1);
                        const angle = 2 * Math.acos(w);
                        const s = Math.sqrt(Math.max(0, 1 - w * w));

                        if (s < 1e-5 || !isFinite(angle)) {
                            a.corrAxis.set(1, 0, 0);
                            a.corrAngle = 0;
                            a.hasGroundCorrection = false;
                        } else {
                            a.corrAxis.set(tmpErr.x / s, tmpErr.y / s, tmpErr.z / s).normalize();
                            a.corrAngle = angle;
                            a.hasGroundCorrection = true;
                        }

                        // Capture fixed spin axis at start
                        // Perpendicular to travel direction (pMid -> p1)
                        tmpDelta.subVectors(a.p1, a.pMid).normalize();
                        a.spinAxisGround.crossVectors(tmpDelta, up).normalize();

                        // PRIORITY 4: Reduce spin speed for heavier feel
                        a.currentOmega = a.flightSpeed * 1.1;  // Reduced from 1.35
                        a.accumulatedTheta = 0;

                        // Reset rolling accumulation at ground start
                        a.rollAccum.identity();
                    }

                    // position pMid -> p1
                    tmpPos.lerpVectors(a.pMid, a.p1, g);

                    const bounce = Math.exp(-6 * ug) * Math.abs(Math.sin(ug * Math.PI * 3)) * 0.18;
                    tmpPos.y = 0.62 + bounce;
                    positions.current[i].copy(tmpPos);

                    // CONTINUOUS SPIN via Omega Integration
                    // Piecewise damping: Low damping early (chaos), High damping late (brake)
                    const damping = ug < 0.80 ? 0.5 : 8.0;
                    a.currentOmega *= Math.exp(-damping * dt);

                    // Integrate
                    a.accumulatedTheta += a.currentOmega * dt;

                    // Apply Roll (Fixed Axis)
                    tmpQ.setFromAxisAngle(a.spinAxisGround, a.accumulatedTheta);
                    a.rollAccum.copy(tmpQ);

                    // RECONSTRUCT orientation
                    // quat = groundBase * roll * wobble
                    tmpQuat.copy(a.groundBaseQuat).multiply(a.rollAccum);

                    // wobble decays (smooth "falling into place")
                    // Decays to 0 over final 40% (ug > 0.6)
                    let wobbleEnv = 1.0;
                    if (ug > 0.6) {
                        const wProg = (ug - 0.6) / 0.4;
                        wobbleEnv = 1 - easeInOutCubic(wProg);
                    }
                    // Initial ramp-in still needed? Yes, fast ramp in.
                    const rampIn = Math.min(1, ug * 10);
                    const wobbleAmt = rampIn * wobbleEnv * Math.exp(-1.5 * ug);

                    tmpWobble.setFromEuler(new THREE.Euler(a.wobblePitch * wobbleAmt * 0.5, a.wobbleYaw * wobbleAmt * 0.5, 0));
                    tmpQuat.multiply(tmpWobble);

                    // CONTINUOUS GUIDANCE: "Magnet"
                    // Gently pull towards target orientation during the ground roll.
                    // This ensures that when Settle starts, we are already partially aligned (~25%),
                    // preventing a sudden reversal or snap.
                    if (ug > 0.2) {
                        const guideProg = (ug - 0.2) / 0.8;
                        const guideBlend = easeInOutCubic(guideProg) * 0.25; // Ramp to 25%
                        tmpQuat.slerp(a.qTarget, guideBlend);
                    }

                    quats.current[i].copy(tmpQuat).normalize();
                    a.lastPos.copy(tmpPos);

                    if (u >= 1) {
                        // stop translation. orientation should already be basically right.
                        positions.current[i].copy(a.p1);
                        a.finishedMotion = true;
                    }
                }
            } else {
                // Settle Phase: Monotonic Angular Decay
                // We keep spinning (decaying omega) and slowly blend to target.

                if (!a.settleInitialized) {
                    a.settleInitialized = true;
                    a.settleTime = 0;
                    a.settleDuration = 0.60; // Longer settle to allow spin to die down naturally
                    // We DO NOT reset rollAccum; we continue integrating it.
                }

                a.settleTime += dt;
                const u = Math.min(1, a.settleTime / a.settleDuration);

                // 1. Decay Omega monotonically
                // Decay factor: e.g. -8.0 reduces speed significantly over 0.5s
                a.currentOmega *= Math.exp(-8.0 * dt);

                // Stop small drift
                if (a.currentOmega < 0.05) a.currentOmega = 0;

                // 2. Integrate Theta
                const dTheta = a.currentOmega * dt;

                // 3. Apply rotation around the FIXED spin axis
                if (dTheta > 1e-6) {
                    tmpQ.setFromAxisAngle(a.spinAxisGround, dTheta);
                    a.rollAccum.multiply(tmpQ);
                }

                // 4. Construct base orientation from accumulated spin
                tmpQuat.copy(a.groundBaseQuat).multiply(a.rollAccum);

                // 5. Magnet/Align to target with SMOOTH HANDOFF
                // We start blending where Ground Phase left off (approx 25%)
                // Ramp from 0.25 -> 1.0 over the settle duration.
                const startBlend = 0.25;
                const settleProg = u * u; // Ease in? or Linear?
                // Let's use a curve that ensures we hit 1.0 firmly but starts smooth
                const blend = startBlend + (1 - startBlend) * (1 - Math.pow(1 - u, 3)); // cubic out to 1.0

                if (u >= 1) {
                    quats.current[i].copy(a.qTarget);
                    a.active = false;
                    a.finishedMotion = false;
                } else {
                    quats.current[i].copy(tmpQuat).slerp(a.qTarget, blend).normalize();
                    // Update position for visual stability? p1 is already set.
                    positions.current[i].copy(a.p1);
                }
            }
        }

        const activeNow = anyActive;
        if (wasActiveRef.current && !activeNow) {
            emit(lastEmittedValuesRef.current);
        }
        wasActiveRef.current = activeNow;
    });

    // PRIORITY 1: Disable shadows on mobile for performance
    const enableShadows = !isMobile;

    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offsetX, 0.0, 0]} receiveShadow={enableShadows} raycast={() => null}>
                <planeGeometry args={[arenaWidth, arenaHeight]} />
                <meshStandardMaterial transparent opacity={0} />
            </mesh>

            {positions.current.map((_, i) => (
                <Die
                    key={i}
                    ref={(h) => {
                        dieRefs.current[i] = h;
                    }}
                    index={i}
                    position={positions.current[i]}
                    quaternion={quats.current[i]}
                    isHeld={!!heldDice[i]}
                    color={diceColor}
                    showDebugNumber={showDebugNumbers}
                    canClick={canInteract}
                    onClick={() => onDieClick(i)}
                />
            ))}
        </>
    );
}

const DiceArena = forwardRef<DiceArenaHandle, DiceArenaProps>((props, ref) => {
    const {
        onTurnComplete,
        heldDice,
        onDieClick,
        canInteract,
        diceColor = '#F5F5DC',
        showDebugNumbers = false,
        feltAspect = 1.0,
        arenaWorldHeight = 10.0,
        isMobile = false,
    } = props;

    const apiRef = useRef<DiceArenaHandle | null>(null);
    const [nonce, setNonce] = useState(0);

    useImperativeHandle(
        ref,
        () => ({
            roll: () => apiRef.current?.roll(),
            rollToResult: (values, opts) => apiRef.current?.rollToResult(values, opts),
            reset: () => apiRef.current?.reset(),
            forceResult: (values) => apiRef.current?.forceResult(values),
            getVisualValues: () => apiRef.current?.getVisualValues() ?? [1, 1, 1, 1, 1],
            getLastEmittedValues: () => apiRef.current?.getLastEmittedValues() ?? [1, 1, 1, 1, 1],
            getRollSeq: () => apiRef.current?.getRollSeq() ?? 0,
        }),
        [nonce]
    );

    useEffect(() => {
        setNonce((n) => n + 1);
    }, [feltAspect, arenaWorldHeight]);

    // PRIORITY 1: Performance mode for mobile - disable expensive features
    const cameraY = 17; // Adjusted for smaller dice - closer than original 18 but not as close as 15
    const cameraFov = 47; // Slightly reduced from original 48

    return (
        <div className="w-full h-full relative">
            <Canvas
                shadows={!isMobile}
                gl={{ 
                    alpha: true, 
                    antialias: !isMobile,  // Disable antialias on mobile for performance
                    powerPreference: isMobile ? 'low-power' : 'high-performance',
                }}
                style={{ background: 'transparent', touchAction: 'none' }}
                camera={{ position: [0, cameraY, 0], fov: cameraFov }}
            >
                <ambientLight intensity={0.55} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow={!isMobile} />

                <AnimatedDiceLayer
                    heldDice={heldDice}
                    canInteract={canInteract}
                    onDieClick={onDieClick}
                    diceColor={diceColor}
                    showDebugNumbers={showDebugNumbers}
                    feltAspect={feltAspect}
                    arenaWorldHeight={arenaWorldHeight}
                    onTurnComplete={onTurnComplete}
                    apiRef={apiRef}
                    isMobile={props.isMobile}
                />
            </Canvas>
        </div>
    );
});

DiceArena.displayName = 'DiceArena';
export default DiceArena;

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
}

const DIE_SIZE = 1.11;
const HALF = DIE_SIZE / 2;

const clampDie = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

function eulerForValue(value: number): [number, number, number] {
    switch (value) {
        case 1:
            return [0, 0, 0];
        case 6:
            return [Math.PI, 0, 0];
        case 2:
            return [-Math.PI / 2, 0, 0];
        case 5:
            return [Math.PI / 2, 0, 0];
        case 3:
            return [0, 0, Math.PI / 2];
        case 4:
            return [0, 0, -Math.PI / 2];
        default:
            return [0, 0, 0];
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
}: {
    count: number;
    rng: () => number;
    minDist: number;
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
}): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const maxAttempts = 900;

    for (let i = 0; i < count; i++) {
        let placed = false;

        for (let a = 0; a < maxAttempts; a++) {
            const x = xMin + (xMax - xMin) * rng();
            const z = zMin + (zMax - zMin) * rng();
            const c = new THREE.Vector3(x, 0.62, z);

            let ok = true;
            for (const p of pts) {
                if (c.distanceTo(p) < minDist) {
                    ok = false;
                    break;
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

    // NEW: correction computed once at ground start
    groundStarted: boolean;
    hasGroundCorrection: boolean;
    corrAxis: THREE.Vector3;
    corrAngle: number;
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
}) {
    const dieRefs = useRef<Array<DieHandle | null>>([null, null, null, null, null]);

    const rollSeqRef = useRef(0);
    const lastEmittedValuesRef = useRef<number[]>([1, 1, 1, 1, 1]);

    const arenaHeight = arenaWorldHeight;
    const arenaWidth = arenaWorldHeight * feltAspect;
    const offsetX = 1.0;

    const positions = useRef<THREE.Vector3[]>(
        Array.from({ length: 5 }, (_, i) => new THREE.Vector3(offsetX + (i - 2) * 1.6, 0.62, 0))
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

            groundStarted: false,
            hasGroundCorrection: false,
            corrAxis: new THREE.Vector3(1, 0, 0),
            corrAngle: 0,
        }))
    );

    const heldPos = useMemo(() => {
        const z = arenaHeight * 0.42;
        return Array.from({ length: 5 }, (_, i) => new THREE.Vector3(offsetX + (i - 2) * 1.55, 0.62, z));
    }, [arenaHeight]);

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
    };

    const reset = () => {
        for (let i = 0; i < 5; i++) {
            positions.current[i].set(offsetX + (i - 2) * 1.6, 0.62, 0);
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
        const launchSpread = Math.min(2.4, arenaWidth * 0.2);

        const marginX = 1.35;
        const marginZ = 1.45;
        const xMin = offsetX - arenaWidth / 2 + marginX;
        const xMax = offsetX + arenaWidth / 2 - marginX;
        const zMin = -arenaHeight / 2 + marginZ;
        const zMax = arenaHeight / 2 - marginZ;

        const land = generateLandingPoints({
            count: 5,
            rng,
            minDist: 1.35,
            xMin,
            xMax,
            zMin,
            zMax,
        }).sort(() => rng() - 0.5);

        for (let i = 0; i < 5; i++) {
            const a = anim.current[i];

            if (heldDice[i]) {
                cancelAnimForDie(i);
                positions.current[i].copy(heldPos[i]);
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

            a.p1.copy(land[i]);

            const impactOffset = 1.0 + rng() * 1.0;
            const theta = rng() * Math.PI * 2;
            const ix = a.p1.x + Math.cos(theta) * impactOffset;
            const iz = a.p1.z + Math.sin(theta) * impactOffset;
            a.pMid.set(
                Math.max(xMin, Math.min(xMax, ix)),
                0.62,
                Math.max(zMin, Math.min(zMax, iz))
            );

            a.arc = 2.4 + rng() * 1.4;

            // start from current quat (prevents jump if user spams roll)
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

        for (let i = 0; i < 5; i++) {
            // HELD dice are pinned and NEVER animated
            if (heldDice[i]) {
                cancelAnimForDie(i);
                positions.current[i].copy(heldPos[i]);
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

                    // flight spin (purely visual)
                    tmpAxis.set(0.35, 1, 0.18).normalize();
                    tmpSpin.setFromAxisAngle(tmpAxis, (10 + i) * a.t * 1.9);
                    tmpQuat.copy(a.q0).multiply(tmpSpin);

                    quats.current[i].copy(tmpQuat);
                    a.lastPos.copy(tmpPos);
                } else {
                    // ground roll
                    const ug = (u - flightEnd) / (1 - flightEnd);
                    const g = easeOutCubic(ug);

                    // on first ground frame: compute correction ONCE
                    if (!a.groundStarted) {
                        a.groundStarted = true;

                        const base = quats.current[i].clone(); // current visible quat at transition
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

                        // Reset rolling accumulation at ground start so the correction “budget” works cleanly
                        a.rollAccum.identity();
                    }

                    // position pMid -> p1
                    tmpPos.lerpVectors(a.pMid, a.p1, g);

                    const bounce = Math.exp(-6 * ug) * Math.abs(Math.sin(ug * Math.PI * 3)) * 0.18;
                    tmpPos.y = 0.62 + bounce;
                    positions.current[i].copy(tmpPos);

                    // planar delta drives rolling
                    tmpDelta.subVectors(tmpPos, a.lastPos);
                    tmpDelta.y = 0;

                    const dist = tmpDelta.length();
                    if (dist > 1e-6) {
                        tmpAxis.crossVectors(tmpDelta, up).normalize();

                        // damp roll energy earlier so the end doesn't look like "spin then correct"
                        const fade = 1 - Math.min(1, Math.max(0, (ug - 0.25) / 0.75));
                        const angle = (dist / HALF) * (0.20 + 0.80 * fade);

                        tmpQ.setFromAxisAngle(tmpAxis, angle);
                        a.rollAccum.multiply(tmpQ);
                    }

                    // base orientation for ground: start from transition quat (not q0) + roll
                    // We want continuity and to avoid a "new rule" feeling:
                    tmpQuat.copy(quats.current[i]).multiply(a.rollAccum);

                    // wobble decays
                    const wobbleAmt = Math.exp(-5 * ug);
                    tmpWobble.setFromEuler(new THREE.Euler(a.wobblePitch * wobbleAmt * 0.30, a.wobbleYaw * wobbleAmt * 0.30, 0));
                    tmpQuat.multiply(tmpWobble);

                    // Apply the precomputed correction gradually across the ground phase.
                    // This prevents the "late corrective turn" look.
                    if (a.hasGroundCorrection && a.corrAngle > 1e-4) {
                        const start = 0.00;
                        const end = 0.70; // finish earlier -> no end rotation
                        const tRaw = (ug - start) / (end - start);
                        const t = easeInOutCubic(Math.min(1, Math.max(0, tRaw)));

                        tmpCorr.setFromAxisAngle(a.corrAxis, a.corrAngle * t);
                        tmpQuat.multiply(tmpCorr);
                    }

                    quats.current[i].copy(tmpQuat);
                    a.lastPos.copy(tmpPos);

                    if (u >= 1) {
                        // stop translation. orientation should already be basically right.
                        positions.current[i].copy(a.p1);
                        a.finishedMotion = true;
                    }
                }
            } else {
                // Finished translating: only tiny cleanup to exact face if needed (should be minimal now).
                positions.current[i].copy(a.p1);

                const current = quats.current[i];
                const angleLeft = current.angleTo(a.qTarget);

                if (angleLeft <= EPS) {
                    current.copy(a.qTarget);
                    a.active = false;
                    a.finishedMotion = false;
                } else {
                    // Very gentle final convergence; should be tiny if correction budgeting worked.
                    const maxStep = 1.5 * dt; // rad/sec, intentionally tiny
                    const frac = angleLeft > 1e-6 ? Math.min(1, maxStep / angleLeft) : 1;
                    current.slerp(a.qTarget, frac);
                }
            }
        }

        const activeNow = anyActive;
        if (wasActiveRef.current && !activeNow) {
            emit(lastEmittedValuesRef.current);
        }
        wasActiveRef.current = activeNow;
    });

    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offsetX, 0.0, 0]} receiveShadow raycast={() => null}>
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

    return (
        <div className="w-full h-full relative">
            <Canvas
                shadows
                gl={{ alpha: true, antialias: true }}
                style={{ background: 'transparent', touchAction: 'none' }}
                camera={{ position: [0, 18, 0], fov: 48 }}
            >
                <ambientLight intensity={0.55} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

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
                />
            </Canvas>
        </div>
    );
});

DiceArena.displayName = 'DiceArena';
export default DiceArena;

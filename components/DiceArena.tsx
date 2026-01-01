// components/DiceArena.tsx
'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useBox, usePlane, useContactMaterial } from '@react-three/cannon';
import { Material } from 'cannon-es';
import Die, { DieHandle } from './Die';

export interface DiceArenaHandle {
    roll: () => void;
    reset: () => void;
    forceResult: (values: number[]) => void;

    /** Reads each die's current face-up value (1..6) directly from its quaternion. */
    getVisualValues: () => number[];
    /** The last values emitted to onTurnComplete (normalized 1..6). */
    getLastEmittedValues: () => number[];
    /** Monotonic roll sequence id (increments each roll/forceResult). */
    getRollSeq: () => number;
}

interface DiceArenaProps {
    onTurnComplete?: (results: number[]) => void;
    heldDice: boolean[];
    onDieClick: (index: number) => void;
    canInteract: boolean;
    diceColor?: string;
    debugWalls?: boolean;

    /** Show the debug number above each die (Die.tsx Text overlay). */
    showDebugNumbers?: boolean;

    /** Aspect ratio (width/height) of the felt area the dice are rendered over */
    feltAspect?: number;

    /** Optional tuning */
    arenaWorldHeight?: number;
}

function Floor() {
    usePlane(() => ({
        type: 'Static',
        rotation: [-Math.PI / 2, 0, 0],
        position: [0, 0, 0],
    }));
    return null;
}

function Wall({ position, args }: { position: [number, number, number]; args: [number, number, number] }) {
    useBox(() => ({
        type: 'Static',
        position,
        args,
    }));
    return null;
}

function ArenaBounds({
    width,
    height,
    wallHeight,
    thickness,
    debugWalls,
    offsetX,
}: {
    width: number;
    height: number;
    wallHeight: number;
    thickness: number;
    debugWalls: boolean;
    offsetX: number;
}) {
    const halfW = width / 2;
    const halfH = height / 2;
    const wallY = wallHeight / 2;

    return (
        <>
            <Floor />

            {/* Z walls */}
            <Wall position={[offsetX, wallY, -halfH - thickness / 2]} args={[width + thickness * 2, wallHeight, thickness]} />
            <Wall position={[offsetX, wallY, halfH + thickness / 2]} args={[width + thickness * 2, wallHeight, thickness]} />

            {/* X walls */}
            <Wall position={[-halfW - thickness / 2 + offsetX, wallY, 0]} args={[thickness, wallHeight, height]} />
            <Wall position={[halfW + thickness / 2 + offsetX, wallY, 0]} args={[thickness, wallHeight, height]} />

            {debugWalls && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offsetX, 0.001, 0]} raycast={() => null}>
                    <planeGeometry args={[width, height]} />
                    <meshStandardMaterial transparent opacity={0.12} color="red" />
                </mesh>
            )}
        </>
    );
}

function PhysicsScene({
    arenaWidth,
    arenaHeight,
    wallHeight,
    wallThickness,
    debugWalls,
    diceMaterial,
    floorMaterial,
    startPositions,
    dieRefs,
    heldDice,
    onDieClick,
    canInteract,
    diceColor,
    showDebugNumbers,
    onDieResult,
}: {
    arenaWidth: number;
    arenaHeight: number;
    wallHeight: number;
    wallThickness: number;
    debugWalls: boolean;
    diceMaterial: Material;
    floorMaterial: Material;
    startPositions: Array<[number, number, number]>;
    dieRefs: React.MutableRefObject<Array<DieHandle | null>>;
    heldDice: boolean[];
    onDieClick: (idx: number) => void;
    canInteract: boolean;
    diceColor: string;
    showDebugNumbers: boolean;
    onDieResult: (idx: number, value: number) => void;
}) {
    useContactMaterial(diceMaterial as any, floorMaterial as any, {
        friction: 0.7,
        restitution: 0.12,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
        frictionEquationStiffness: 1e7,
        frictionEquationRelaxation: 3,
    });

    return (
        <>
            <ArenaBounds
                width={arenaWidth}
                height={arenaHeight}
                wallHeight={wallHeight}
                thickness={wallThickness}
                debugWalls={debugWalls}
                offsetX={1.0}
            />

            {startPositions.map((pos, i) => (
                <Die
                    key={i}
                    ref={(h) => {
                        dieRefs.current[i] = h;
                    }}
                    position={pos}
                    isHeld={!!heldDice[i]}
                    heldPosition={
                        // Calculate a nice row at the bottom
                        [
                            (i - 2) * 1.5 + 1.0, // X: Center around offset 1.0, spacing 1.5
                            1.2, // Y: Lift slightly
                            arenaHeight / 2 + 1.2, // Z: On the wood frame (approx 6.2)
                        ]
                    }
                    onResult={(val) => onDieResult(i, val)}
                    onClick={() => onDieClick(i)}
                    canClick={canInteract}
                    physicsMaterial={diceMaterial}
                    color={diceColor}
                    showDebugNumber={showDebugNumbers}
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
        debugWalls = false,
        showDebugNumbers = false,
        feltAspect = 1.0,
        arenaWorldHeight = 10.0,
    } = props;

    const dieRefs = useRef<Array<DieHandle | null>>([null, null, null, null, null]);

    // last known values (what we emit to the engine)
    const resultsRef = useRef<number[]>([1, 1, 1, 1, 1]);
    // per-roll completion flags
    const reportedRef = useRef<boolean[]>([false, false, false, false, false]);
    // ensure we only emit once per roll
    const emittedForSeqRef = useRef<number | null>(null);
    // monotonic roll id
    const rollSeqRef = useRef(0);
    // safety timer in case a die never calls onResult
    const settleTimer = useRef<number | null>(null);
    // last values emitted to the parent
    const lastEmittedValuesRef = useRef<number[]>([1, 1, 1, 1, 1]);

    // used only to keep imperative handle stable if you hot-reload
    const [nonce, setNonce] = useState(0);

    const arenaHeight = arenaWorldHeight;
    const arenaWidth = arenaWorldHeight * feltAspect;

    const wallHeight = 14;
    const wallThickness = 1.9;

    // ONLY used for reset/new-turn seating. We do NOT reseat on roll (held dice must never move).
    const startPositions: Array<[number, number, number]> = useMemo(() => {
        const halfW = arenaWidth / 2;
        const spread = Math.max(1.7, Math.min(2.7, halfW - 1.6));
        const offsetX = 1.0;
        return [
            [-spread + offsetX, 2.1, 0],
            [-spread / 2 + offsetX, 2.1, 0],
            [offsetX, 2.1, 0],
            [spread / 2 + offsetX, 2.1, 0],
            [spread + offsetX, 2.1, 0],
        ];
    }, [arenaWidth]);

    const diceMaterial = useMemo(() => new Material('dice'), []);
    const floorMaterial = useMemo(() => new Material('floor'), []);

    const clearSettleTimer = () => {
        if (settleTimer.current) window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
    };

    const normalize = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

    const emitOnceForCurrentRoll = () => {
        const seq = rollSeqRef.current;
        if (emittedForSeqRef.current === seq) return;
        emittedForSeqRef.current = seq;

        const vals = resultsRef.current.map(normalize);
        lastEmittedValuesRef.current = vals;
        onTurnComplete?.(vals);
    };

    const reset = () => {
        resultsRef.current = [1, 1, 1, 1, 1];
        reportedRef.current = [false, false, false, false, false];
        emittedForSeqRef.current = null;
        lastEmittedValuesRef.current = [1, 1, 1, 1, 1];

        startPositions.forEach((p, i) => dieRefs.current[i]?.resetPosition(p[0], p[1], p[2]));

        clearSettleTimer();
        setNonce((n) => n + 1);
    };

    const roll = () => {
        rollSeqRef.current += 1;
        emittedForSeqRef.current = null;

        reportedRef.current = [false, false, false, false, false];

        for (let i = 0; i < 5; i++) {
            const d = dieRefs.current[i];
            if (!d) continue;

            if (heldDice[i]) {
                // IMPORTANT: Never move held dice, never call roll(), just read its current value.
                const hv = normalize(d.getValue?.() ?? resultsRef.current[i] ?? 1);
                resultsRef.current[i] = hv;
                reportedRef.current[i] = true;
            } else {
                d.roll();
            }
        }

        clearSettleTimer();
        settleTimer.current = window.setTimeout(() => {
            for (let i = 0; i < 5; i++) {
                if (!reportedRef.current[i]) {
                    const v = dieRefs.current[i]?.getValue?.() ?? resultsRef.current[i] ?? 1;
                    resultsRef.current[i] = normalize(v);
                    reportedRef.current[i] = true;
                }
            }
            emitOnceForCurrentRoll();
        }, 4200) as unknown as number;

        setNonce((n) => n + 1);
    };

    const forceResult = (values: number[]) => {
        rollSeqRef.current += 1;
        emittedForSeqRef.current = null;
        reportedRef.current = [true, true, true, true, true];

        for (let i = 0; i < 5; i++) {
            const d = dieRefs.current[i];
            const target = normalize(values[i] || 6);
            if (d) {
                d.snapFlat(target);
                resultsRef.current[i] = target;
            } else {
                resultsRef.current[i] = target;
            }
        }

        clearSettleTimer();
        emitOnceForCurrentRoll();
        setNonce((n) => n + 1);
    };

    const getVisualValues = () => {
        const vals: number[] = [];
        for (let i = 0; i < 5; i++) {
            const d = dieRefs.current[i];
            const v = d?.getValue?.() ?? resultsRef.current[i] ?? 1;
            vals.push(normalize(v));
        }
        return vals;
    };

    const getLastEmittedValues = () => lastEmittedValuesRef.current.slice();

    const getRollSeq = () => rollSeqRef.current;

    useImperativeHandle(
        ref,
        () => ({
            roll,
            reset,
            forceResult,
            getVisualValues,
            getLastEmittedValues,
            getRollSeq,
        }),
        [nonce]
    );

    const handleDieResult = (idx: number, value: number) => {
        if (heldDice[idx]) {
            reportedRef.current[idx] = true;
            resultsRef.current[idx] = normalize(dieRefs.current[idx]?.getValue?.() ?? resultsRef.current[idx] ?? 1);
        } else {
            const v = normalize(value);
            resultsRef.current[idx] = v;
            reportedRef.current[idx] = true;
        }

        if (reportedRef.current.every(Boolean)) {
            clearSettleTimer();
            emitOnceForCurrentRoll();
        }
    };

    useEffect(() => () => clearSettleTimer(), []);

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

                <Physics gravity={[0, -30, 0]}>
                    <PhysicsScene
                        arenaWidth={arenaWidth}
                        arenaHeight={arenaHeight}
                        wallHeight={wallHeight}
                        wallThickness={wallThickness}
                        debugWalls={debugWalls}
                        diceMaterial={diceMaterial}
                        floorMaterial={floorMaterial}
                        startPositions={startPositions}
                        dieRefs={dieRefs}
                        heldDice={heldDice}
                        onDieClick={onDieClick}
                        canInteract={canInteract}
                        diceColor={diceColor}
                        showDebugNumbers={showDebugNumbers}
                        onDieResult={handleDieResult}
                    />
                </Physics>
            </Canvas>
        </div>
    );
});

DiceArena.displayName = 'DiceArena';
export default DiceArena;

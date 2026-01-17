'use client';

import React, { useRef, useImperativeHandle, forwardRef, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, usePlane, useBox, useContactMaterial } from '@react-three/cannon';
import { Environment, ContactShadows, useTexture } from '@react-three/drei';
import Die, { DieHandle } from './Die';
import useSound from 'use-sound';
import { Material } from 'cannon-es';
import WoodenTray from './WoodenTray';
import * as THREE from 'three';

// Safe texture loader
const useTextureWrapper = (url: string) => {
    try {
        return useTexture(url);
    } catch {
        return null;
    }
};

interface DiceArenaProps {
    onTurnComplete?: (results: number[]) => void;
    heldDice: boolean[];
    onDieClick: (index: number) => void;
    canInteract: boolean;
    diceColor?: string;
    feltColor?: string;
}

export interface DiceArenaHandle {
    roll: () => void;
    reset: () => void;
}

function PhysicsContent({ onTurnComplete, heldDice, onDieClick, canInteract, innerRef, diceColor, feltColor }: any) {
    // Materials
    // useMemo represents the "creation" of the material instances once.
    const [diceMat, floorMat] = useMemo(() => {
        return [new Material('dice'), new Material('floor')];
    }, []);

    // Contact Rules
    useContactMaterial(diceMat, diceMat, { friction: 0.0, restitution: 0.5 }); // Slippery against each other
    useContactMaterial(diceMat, floorMat, { friction: 0.5, restitution: 0.5 }); // Grippy on floor

    const diceRefs = useRef<(DieHandle | null)[]>([]);
    // Use a Set to track which dice have reported this turn to avoid double firing
    const reportedDice = useRef<Set<number>>(new Set());
    const currentResults = useRef<number[]>([0, 0, 0, 0, 0]);
    const [playRoll] = useSound('/sounds/roll.mp3');

    useImperativeHandle(innerRef, () => ({
        roll: () => {
            playRoll();
            reportedDice.current.clear();
            diceRefs.current.forEach((die, i) => {
                die?.roll();
            });
        },
        reset: () => {
            diceRefs.current.forEach((die, i) => {
                die?.resetPosition((i - 2) * 1.5, 0, 0);
            });
        }
    }));

    const handleDieResult = (index: number, value: number) => {
        // Only accept the first result per die per roll
        if (reportedDice.current.has(index)) return;

        reportedDice.current.add(index);
        currentResults.current[index] = value;

        console.log(`Arena: Die ${index} reported ${value}. Total reported: ${reportedDice.current.size}`);

        if (reportedDice.current.size === 5) {
            console.log("Arena: All 5 dice reported. Finishing turn.");
            if (onTurnComplete) {
                // Small delay to ensure visual snap happens first
                setTimeout(() => {
                    onTurnComplete([...currentResults.current]);
                }, 500);
            }
        }
    };

    // Play Area Constants
    const PLAY_BOUNDS = { width: 20, height: 20 };
    const wallThickness = 1;
    const wallHeight = 10;

    // Floor Component - Physics Only, NO Raycast
    const FloorWithMat = () => {
        const [ref] = usePlane(() => ({
            rotation: [-Math.PI / 2, 0, 0],
            position: [0, -0.5, 0],
            material: floorMat,
        }));

        return (
            <mesh ref={ref as any} visible={false} raycast={() => null}>
                <planeGeometry args={[60, 60]} />
                <meshBasicMaterial color="#000" />
            </mesh>
        );
    };

    // Wall Component - Physics Only, NO Raycast
    const Wall = ({ args, position }: any) => {
        const [ref] = useBox(() => ({ type: 'Static', args, position, material: floorMat }));
        return <mesh ref={ref as any} visible={false} raycast={() => null}><boxGeometry args={args} /></mesh>;
    };

    return (
        <>
            <FloorWithMat />

            {/* Invisible Walls Enclosing 20x20 PLAY_BOUNDS */}
            <Wall args={[PLAY_BOUNDS.width + wallThickness * 2, wallHeight, wallThickness]} position={[0, 0, -(PLAY_BOUNDS.height / 2 + wallThickness / 2)]} />
            <Wall args={[PLAY_BOUNDS.width + wallThickness * 2, wallHeight, wallThickness]} position={[0, 0, (PLAY_BOUNDS.height / 2 + wallThickness / 2)]} />
            <Wall args={[wallThickness, wallHeight, PLAY_BOUNDS.height]} position={[-(PLAY_BOUNDS.width / 2 + wallThickness / 2), 0, 0]} />
            <Wall args={[wallThickness, wallHeight, PLAY_BOUNDS.height]} position={[(PLAY_BOUNDS.width / 2 + wallThickness / 2), 0, 0]} />

            {/* Visuals - Purely Backdrop */}
            <React.Suspense fallback={null}>
                <group raycast={() => null}>
                    <WoodenTray feltColor={feltColor} />
                </group>
            </React.Suspense>

            {Array.from({ length: 5 }).map((_, i) => (
                <Die
                    key={i}
                    position={[(i - 2) * 1.5, -0.4, 0]}
                    ref={(el) => { diceRefs.current[i] = el; }}
                    isHeld={heldDice[i]}
                    onClick={() => onDieClick(i)}
                    canClick={canInteract}
                    onResult={(val) => handleDieResult(i, val)}
                    physicsMaterial={diceMat}
                    color={diceColor}
                />
            ))}
        </>
    );
}

// Simple Camera Setup
function SimpleCamera() {
    const { camera } = useThree();
    useEffect(() => {
        camera.lookAt(0, 0, 0);
    }, [camera]);
    return null;
}

const DiceArena = forwardRef<DiceArenaHandle, DiceArenaProps>((props, ref) => {
    return (
        <div className="w-full h-full relative">
            <Canvas shadows camera={{ position: [0, 30, 0], fov: 30 }}>
                <SimpleCamera />
                <color attach="background" args={['#020617']} />

                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
                <pointLight position={[-10, 10, -10]} intensity={0.5} />

                <Environment preset="city" />

                <Physics gravity={[0, -30, 0]}>
                    <PhysicsContent {...props} innerRef={ref} />
                </Physics>
            </Canvas>
        </div>
    );
});

DiceArena.displayName = 'DiceArena';
export default DiceArena;

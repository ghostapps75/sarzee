'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import useSound from 'use-sound';

export interface DieHandle {
    getValue: () => number;
}

interface DieProps {
    index: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    isHeld: boolean;
    color?: string;
    showDebugNumber?: boolean;
    canClick: boolean;
    onClick: () => void;
}

const DIE_SIZE = 1.45475; // Increased by 15% then another 10% from original 1.15
const HALF = DIE_SIZE / 2;

const PIP_RADIUS = 0.09; // Proportionally adjusted for new size
const PIP_HEIGHT = 0.022; // Slightly adjusted
const PIP_CENTER_Y = HALF + 0.015;

const Pip = ({ position, pipColor }: { position: [number, number, number]; pipColor?: string }) => (
    <mesh position={position} raycast={() => null}>
        <cylinderGeometry args={[PIP_RADIUS, PIP_RADIUS, PIP_HEIGHT, 32]} />
        <meshBasicMaterial color={pipColor || '#111111'} toneMapped={false} />
    </mesh>
);

const Face = ({ value, rotation, pipColor }: { value: number; rotation: [number, number, number]; pipColor?: string }) => {
    const offset = 0.24;

    const pips = useMemo(() => {
        const p: [number, number, number][] = [];
        switch (value) {
            case 1:
                p.push([0, 0, 0]);
                break;
            case 2:
                p.push([-offset, 0, -offset], [offset, 0, offset]);
                break;
            case 3:
                p.push([-offset, 0, -offset], [0, 0, 0], [offset, 0, offset]);
                break;
            case 4:
                p.push(
                    [-offset, 0, -offset],
                    [offset, 0, -offset],
                    [-offset, 0, offset],
                    [offset, 0, offset]
                );
                break;
            case 5:
                p.push(
                    [-offset, 0, -offset],
                    [offset, 0, -offset],
                    [-offset, 0, offset],
                    [offset, 0, offset],
                    [0, 0, 0]
                );
                break;
            case 6:
                p.push(
                    [-offset, 0, -offset],
                    [offset, 0, -offset],
                    [-offset, 0, 0],
                    [offset, 0, 0],
                    [-offset, 0, offset],
                    [offset, 0, offset]
                );
                break;
        }
        return p;
    }, [value]);

    return (
        <group rotation={rotation} position={[0, 0, 0]} raycast={() => null}>
            {pips.map((pos, i) => (
                <Pip key={i} position={[pos[0], PIP_CENTER_Y, pos[2]]} pipColor={pipColor} />
            ))}
        </group>
    );
};

/** Must match your face rotations: 1:+Y, 6:-Y, 2:+Z, 5:-Z, 3:+X, 4:-X */
function computeValueFromQuaternion(q: THREE.Quaternion) {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const inv = q.clone().invert();
    const localUp = worldUp.applyQuaternion(inv);

    const absX = Math.abs(localUp.x);
    const absY = Math.abs(localUp.y);
    const absZ = Math.abs(localUp.z);

    if (absY >= absX && absY >= absZ) return localUp.y > 0 ? 1 : 6;
    if (absX >= absY && absX >= absZ) return localUp.x > 0 ? 3 : 4;
    return localUp.z > 0 ? 2 : 5;
}

const Die = forwardRef<DieHandle, DieProps>(
    ({ position, quaternion, isHeld, color = '#FFFFFF', showDebugNumber = false, canClick, onClick }, ref) => {
        const [playPop] = useSound('/sounds/pop.mp3', { volume: 0.5 });

        const groupRef = useRef<THREE.Group>(null);
        const [debugValue, setDebugValue] = useState(1);

        // Use white pips for colored dice, black for white dice
        const isColoredDice = color !== '#FFFFFF';
        const pipColor = isColoredDice ? '#FFFFFF' : '#111111';

        // IMPORTANT: copy pose into the actual Three object each frame
        useFrame(() => {
            const g = groupRef.current;
            if (!g) return;
            g.position.copy(position);
            g.quaternion.copy(quaternion);

            if (showDebugNumber) {
                const v = computeValueFromQuaternion(quaternion);
                if (v !== debugValue) setDebugValue(v);
            }
        });

        useImperativeHandle(ref, () => ({
            getValue: () => {
                const v = computeValueFromQuaternion(quaternion);
                return Math.max(1, Math.min(6, Math.round(v)));
            },
        }));

        const handleClick = (e: any) => {
            e.stopPropagation();
            if (!canClick) return;
            playPop();
            onClick();
        };

        return (
            <group ref={groupRef} scale={isHeld ? 1.3 : 1.0}>
                {showDebugNumber && (
                    <Text position={[0, 1.2, 0]} fontSize={0.45} color="black" outlineWidth={0.03} outlineColor="white">
                        {debugValue}
                    </Text>
                )}

                {/* Invisible hitbox */}
                <mesh
                    onClick={handleClick}
                    onPointerOver={() => {
                        if (canClick) document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => (document.body.style.cursor = 'default')}
                    visible
                >
                    <boxGeometry args={[1.3, 1.3, 1.3]} /> {/* Adjusted for smaller dice size */}
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

                <group raycast={() => null}>
                    <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={0.14} smoothness={8}>
                        <meshStandardMaterial 
                            color={isHeld ? '#fbbf24' : color} 
                            roughness={0.15} 
                            metalness={0.3} 
                            envMapIntensity={1.2}
                        />
                    </RoundedBox>

                    <Face value={1} rotation={[0, 0, 0]} pipColor={pipColor} />
                    <Face value={6} rotation={[Math.PI, 0, 0]} pipColor={pipColor} />
                    <Face value={2} rotation={[Math.PI / 2, 0, 0]} pipColor={pipColor} />
                    <Face value={5} rotation={[-Math.PI / 2, 0, 0]} pipColor={pipColor} />
                    <Face value={3} rotation={[0, 0, -Math.PI / 2]} pipColor={pipColor} />
                    <Face value={4} rotation={[0, 0, Math.PI / 2]} pipColor={pipColor} />
                </group>
            </group>
        );
    }
);

Die.displayName = 'Die';
export default Die;

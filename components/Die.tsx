'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useBox } from '@react-three/cannon';
import { Mesh } from 'three';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import useSound from 'use-sound';
import { Material } from 'cannon-es';

export interface DieHandle {
    roll: () => void;
    resetPosition: (x: number, y: number, z: number) => void;
    /** Returns the die's current face-up value (1..6) based on its current quaternion. */
    getValue: () => number;
    snapFlat: (value?: number) => number;
}

interface DieProps {
    position: [number, number, number];
    isHeld: boolean;
    onResult: (value: number) => void;
    onClick: () => void;
    canClick: boolean;
    physicsMaterial?: Material;
    color?: string;
    showDebugNumber?: boolean;
    heldPosition?: [number, number, number];
}

// Die is 0.9, so half extent is 0.45.
const DIE_SIZE = 1.11;
const HALF = DIE_SIZE / 2;

const PIP_RADIUS = 0.085;
const PIP_HEIGHT = 0.02;
const PIP_CENTER_Y = HALF + 0.015;

const Pip = ({ position }: { position: [number, number, number] }) => (
    <mesh position={position} raycast={() => null}>
        <cylinderGeometry args={[PIP_RADIUS, PIP_RADIUS, PIP_HEIGHT, 32]} />
        <meshBasicMaterial color="#111111" toneMapped={false} />
    </mesh>
);

const Face = ({ value, rotation }: { value: number; rotation: [number, number, number] }) => {
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
                <Pip key={i} position={[pos[0], PIP_CENTER_Y, pos[2]]} />
            ))}
        </group>
    );
};

function eulerForValue(value: number): [number, number, number] {
    // Must align with Face rotations:
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

const Die = forwardRef<DieHandle, DieProps>(
    (
        {
            position,
            isHeld,
            onResult,
            onClick,
            canClick,
            physicsMaterial,
            color = '#F5F5DC',
            showDebugNumber = false,
            heldPosition,
        },
        ref
    ) => {
        const [playPop] = useSound('/sounds/pop.mp3', { volume: 0.5 });

        const [meshRef, api] = useBox<Mesh>(() => ({
            mass: 1,
            position,
            args: [DIE_SIZE, DIE_SIZE, DIE_SIZE],
            material: physicsMaterial,
            angularDamping: 0.28,
            linearDamping: 0.06,
        }));

        const velocity = useRef<[number, number, number]>([0, 0, 0]);
        const angVel = useRef<[number, number, number]>([0, 0, 0]);
        const quatRef = useRef(new THREE.Quaternion());

        const isRolling = useRef(false);
        const settleFrames = useRef(0);

        const [debugValue, setDebugValue] = useState(1);

        useEffect(() => api.velocity.subscribe((v) => (velocity.current = [v[0], v[1], v[2]])), [api.velocity]);
        useEffect(() => api.angularVelocity.subscribe((v) => (angVel.current = [v[0], v[1], v[2]])), [api.angularVelocity]);
        useEffect(
            () =>
                api.quaternion.subscribe((q) => {
                    quatRef.current.set(q[0], q[1], q[2], q[3]);
                }),
            [api.quaternion]
        );

        // Held dice cannot be knocked over
        useEffect(() => {
            if (isHeld) {
                api.mass.set(0);
                api.velocity.set(0, 0, 0);
                api.angularVelocity.set(0, 0, 0);
                api.linearFactor.set(0, 0, 0);
                api.angularFactor.set(0, 0, 0);

                if (heldPosition) {
                    api.position.set(heldPosition[0], heldPosition[1], heldPosition[2]);

                    // Snap to perfect face-up rotation
                    const currentVal = computeResultFromQuaternion();
                    const [rx, ry, rz] = eulerForValue(currentVal);
                    api.rotation.set(rx, ry, rz);
                }
            } else {
                api.mass.set(1);
                api.linearFactor.set(1, 1, 1);
                api.angularFactor.set(1, 1, 1);
                api.wakeUp();
            }
        }, [isHeld, api, heldPosition]);

        const computeResultFromQuaternion = () => {
            const worldUp = new THREE.Vector3(0, 1, 0);
            const inv = quatRef.current.clone().invert();
            const localUp = worldUp.applyQuaternion(inv);

            const absX = Math.abs(localUp.x);
            const absY = Math.abs(localUp.y);
            const absZ = Math.abs(localUp.z);

            // Mapping matches the Face rotations below:
            // 1:+Y, 6:-Y, 2:+Z, 5:-Z, 3:+X, 4:-X
            if (absY >= absX && absY >= absZ) return localUp.y > 0 ? 1 : 6;
            if (absX >= absY && absX >= absZ) return localUp.x > 0 ? 3 : 4;
            return localUp.z > 0 ? 2 : 5;
        };

        const finalize = () => {
            const v = computeResultFromQuaternion();
            onResult(v);
            setDebugValue(v);
        };

        useImperativeHandle(ref, () => ({
            roll: () => {
                if (isHeld) {
                    finalize();
                    return;
                }

                isRolling.current = true;
                settleFrames.current = 0;

                api.wakeUp();

                // clear leftover motion
                api.velocity.set(0, 0, 0);
                api.angularVelocity.set(0, 0, 0);

                // Reset position to bottom center for a "throw"
                api.position.set(
                    (Math.random() - 0.5) * 4, // Center width spread
                    4.0, // Mid-air height
                    3.5  // Inside arena (was 9.0 which was out of bounds)
                );

                // randomize starting orientation (prevents “one flip” rolls)
                api.rotation.set(
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2
                );

                // stronger push (more travel)
                const ix = (Math.random() - 0.5) * 10; // Reduced spread
                const iz = -15 - Math.random() * 8; // Throw FORWARD (negative Z)
                const iy = 2 + Math.random() * 3; // Gentle arc

                // apply impulse OFF-CENTER so it tumbles, not just slides
                const px = (Math.random() - 0.5) * 0.35;
                const py = (Math.random() - 0.5) * 0.20;
                const pz = (Math.random() - 0.5) * 0.35;

                api.applyImpulse([ix, iy, iz], [px, py, pz]);

                // stronger spin (more rotations)
                api.applyTorque([
                    (Math.random() - 0.5) * 34,
                    (Math.random() - 0.5) * 34,
                    (Math.random() - 0.5) * 34,
                ]);


                // Safety finalize (ensures we eventually report)
                setTimeout(() => {
                    if (isRolling.current) {
                        isRolling.current = false;
                        finalize();
                    }
                }, 3500);
            },

            resetPosition: (x, y, z) => {
                api.position.set(x, y, z);
                api.velocity.set(0, 0, 0);
                api.angularVelocity.set(0, 0, 0);
                api.rotation.set(0, 0, 0);
                api.wakeUp();
                isRolling.current = false;
                settleFrames.current = 0;
                setDebugValue(1);
            },

            getValue: () => {
                const v = computeResultFromQuaternion();
                return Math.max(1, Math.min(6, Math.round(v)));
            },

            snapFlat: (value?: number) => {
                const current = computeResultFromQuaternion();
                const v = Math.max(1, Math.min(6, Math.round(value ?? current)));
                const [rx, ry, rz] = eulerForValue(v);

                api.velocity.set(0, 0, 0);
                api.angularVelocity.set(0, 0, 0);
                api.rotation.set(rx, ry, rz);
                api.sleep();

                setDebugValue(v);
                return v;
            },
        }));

        useFrame(() => {
            if (!isRolling.current) return;

            const v = velocity.current;
            const w = angVel.current;

            const speed = Math.hypot(v[0], v[1], v[2]);
            const spin = Math.hypot(w[0], w[1], w[2]);

            if (speed < 0.05 && spin < 0.22) settleFrames.current += 1;
            else settleFrames.current = 0;

            if (settleFrames.current > 60) {
                isRolling.current = false;
                finalize();
            }
        });

        const handleClick = (e: any) => {
            e.stopPropagation();
            if (!canClick) return;
            playPop();
            onClick();
        };

        return (
            <mesh ref={meshRef}>
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
                    visible={true}
                >
                    <boxGeometry args={[1.2, 1.2, 1.2]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

                <group raycast={() => null}>
                    <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={0.14} smoothness={8}>
                        <meshStandardMaterial color={isHeld ? '#fbbf24' : color} roughness={0.25} metalness={0.08} />
                    </RoundedBox>

                    <Face value={1} rotation={[0, 0, 0]} />
                    <Face value={6} rotation={[Math.PI, 0, 0]} />
                    <Face value={2} rotation={[Math.PI / 2, 0, 0]} />
                    <Face value={5} rotation={[-Math.PI / 2, 0, 0]} />
                    <Face value={3} rotation={[0, 0, -Math.PI / 2]} />
                    <Face value={4} rotation={[0, 0, Math.PI / 2]} />
                </group>
            </mesh>
        );
    }
);

Die.displayName = 'Die';
export default Die;

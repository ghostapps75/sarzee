'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { getBoard } from '@/lib/boards';
import { DIE_HALF, DIE_PROPORTIONS, DIE_SIZE, HELD_SCALE, valueFromQuaternion } from '@/lib/dieFaces';

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
    boardId?: string;
    /**
     * Rotation applied to the pips *inside* the cube. The physics simulation decides how
     * the die lands; this rotates the labelling so the face that landed up shows the
     * value the game chose. See lib/dieFaces.ts.
     */
    faceRotation?: THREE.Quaternion;
    /**
     * How much wider than the die its tap target should be. Grows on small screens: a die
     * is only ~20px across on a phone, and a hit box that shrinks with it is fiddly to
     * hit. Overlapping boxes are fine — the raycast resolves to whichever die is nearer,
     * which is what "tap near a die" should mean anyway.
     */
    tapScale?: number;
}

// Every dimension is a proportion of the die's edge length, so resizing a die is a
// one-line change in lib/dieFaces.ts rather than five constants that can drift apart.
const PIP_RADIUS = DIE_SIZE * DIE_PROPORTIONS.pipRadius;
const PIP_HEIGHT = DIE_SIZE * DIE_PROPORTIONS.pipHeight;
const PIP_CENTER_Y = DIE_HALF + DIE_SIZE * DIE_PROPORTIONS.pipProud;
const PIP_OFFSET = DIE_SIZE * DIE_PROPORTIONS.pipOffset;
const CORNER_RADIUS = DIE_SIZE * DIE_PROPORTIONS.cornerRadius;
/** Smallest comfortable tap target, as a multiple of the die's edge length. */
const MIN_TAP_SCALE = 1.12;

/** Perceived lightness of a #rrggbb colour, 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const Pip = ({ position, pipColor }: { position: [number, number, number]; pipColor?: string }) => {
    // If the forge theme has orange glowing pips, make them un-tone-mapped for natural blooming glow
    const isMagma = pipColor === '#FF6A00';
    return (
        <mesh position={position} raycast={() => null}>
            <cylinderGeometry args={[PIP_RADIUS, PIP_RADIUS, PIP_HEIGHT, 32]} />
            <meshBasicMaterial color={pipColor || '#111111'} toneMapped={!isMagma} />
        </mesh>
    );
};

const Face = ({ value, rotation, pipColor }: { value: number; rotation: [number, number, number]; pipColor?: string }) => {
    const offset = PIP_OFFSET; // module constant; the layout below only varies with `value`

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <group rotation={rotation} position={[0, 0, 0]} raycast={() => null}>
            {pips.map((pos, i) => (
                <Pip key={i} position={[pos[0], PIP_CENTER_Y, pos[2]]} pipColor={pipColor} />
            ))}
        </group>
    );
};

const Die = forwardRef<DieHandle, DieProps>(
    (
        {
            position,
            quaternion,
            isHeld,
            color = '#FFFFFF',
            showDebugNumber = false,
            canClick,
            onClick,
            boardId = 'the-cafe',
            faceRotation,
            tapScale = MIN_TAP_SCALE,
        },
        ref
    ) => {
        const groupRef = useRef<THREE.Group>(null);
        const faceGroupRef = useRef<THREE.Group>(null);
        const [debugValue, setDebugValue] = useState(1);

        /** Body orientation combined with the pip relabelling: what the player sees. */
        const shownQuat = useMemo(() => new THREE.Quaternion(), []);
        const readShown = () => {
            shownQuat.copy(quaternion);
            if (faceRotation) shownQuat.multiply(faceRotation);
            return shownQuat;
        };

        // Dice appearance is declared per board in lib/boards.ts, so a new theme is a
        // data change rather than another branch here.
        const skin = useMemo(() => {
            if (isHeld) {
                return {
                    color: '#fbbf24', // premium gold for locked dice
                    roughness: 0.1,
                    metalness: 0.4,
                    transparent: false,
                    opacity: 1.0,
                    pipColor: '#111111',
                };
            }

            const board = getBoard(boardId);
            const boardSkin = board.diceSkin;
            const resolvedColor = boardSkin.forceColor ?? color;
            // Pick pips by how light the die actually is, not by whether it happens to be
            // pure white. Cream and amber dice were getting white pips, which all but
            // vanish once a highlight catches the face.
            const autoPip = relativeLuminance(resolvedColor) > 0.52 ? '#1A1A1A' : '#FFFFFF';

            return {
                color: resolvedColor,
                roughness: boardSkin.roughness,
                metalness: boardSkin.metalness,
                transparent: boardSkin.transparent,
                opacity: boardSkin.opacity,
                pipColor: boardSkin.pipColor ?? autoPip,
            };
        }, [boardId, color, isHeld]);

        // The pose vectors are mutated in place by the arena, so copy them onto the
        // three.js objects every frame rather than reacting to prop changes.
        useFrame(() => {
            const g = groupRef.current;
            if (!g) return;
            g.position.copy(position);
            g.quaternion.copy(quaternion);

            const faces = faceGroupRef.current;
            if (faces) {
                if (faceRotation) faces.quaternion.copy(faceRotation);
                else faces.quaternion.identity();
            }

            if (showDebugNumber) {
                const v = valueFromQuaternion(readShown());
                if (v !== debugValue) setDebugValue(v);
            }
        });

        // The pose objects are mutated in place, so this reads live values.
        useImperativeHandle(ref, () => ({
            getValue: () => valueFromQuaternion(readShown()),
        }));

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (!canClick) return;
            onClick();
        };

        return (
            <group ref={groupRef} scale={isHeld ? HELD_SCALE : 1.0}>
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
                    <boxGeometry args={[DIE_SIZE * tapScale, DIE_SIZE * tapScale, DIE_SIZE * tapScale]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>

                <group ref={faceGroupRef} raycast={() => null}>
                    <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={CORNER_RADIUS} smoothness={8} castShadow>
                        <meshStandardMaterial 
                            color={skin.color} 
                            roughness={skin.roughness} 
                            metalness={skin.metalness} 
                            transparent={skin.transparent}
                            opacity={skin.opacity}
                            envMapIntensity={1.2}
                        />
                    </RoundedBox>

                    <Face value={1} rotation={[0, 0, 0]} pipColor={skin.pipColor} />
                    <Face value={6} rotation={[Math.PI, 0, 0]} pipColor={skin.pipColor} />
                    <Face value={2} rotation={[Math.PI / 2, 0, 0]} pipColor={skin.pipColor} />
                    <Face value={5} rotation={[-Math.PI / 2, 0, 0]} pipColor={skin.pipColor} />
                    <Face value={3} rotation={[0, 0, -Math.PI / 2]} pipColor={skin.pipColor} />
                    <Face value={4} rotation={[0, 0, Math.PI / 2]} pipColor={skin.pipColor} />
                </group>
            </group>
        );
    }
);

Die.displayName = 'Die';
export default Die;

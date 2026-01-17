'use client';

import React from 'react';
import * as THREE from 'three';
import { useBox } from '@react-three/cannon';
import { useTexture } from '@react-three/drei';

// Option A: Physics Only Wall
// This component registers a physics body but renders NOTHING.
const TrayWall = ({ position, rotation, args }: any) => {
    const [ref] = useBox(() => ({
        type: 'Static',
        position,
        rotation,
        args,
    }));

    // Physics only. No visible mesh. Ever.
    return <group ref={ref as any} />;
};

export default function WoodenTray({ feltColor }: { feltColor?: string }) {
    // 1. Load the texture
    const texture = useTexture('/textures/reference_board.jpg');

    // 2. Configure for realism
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;

    // 3. Geometry & Layout
    const size = 26;        // Wide tray
    const wallHeight = 3;   // Low walls
    const thickness = 1;
    const floorY = -2;
    const wallY = floorY + wallHeight / 2; // Walls sit ON the floor

    return (
        <group>
            {/* Photo Floor - The ONLY visible part */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow raycast={() => null}>
                <planeGeometry args={[60, 60]} />
                <meshStandardMaterial
                    map={texture}
                    color="#f2f2f2" // Desaturated slightly per instructions
                    roughness={1}
                    metalness={0}
                />
            </mesh>

            {/* Physics-Only Walls (Invisible Boundaries) */}
            {/* Back */}
            <TrayWall position={[0, wallY, -size / 2]} args={[size, wallHeight, thickness]} rotation={[0, 0, 0]} />
            {/* Front */}
            <TrayWall position={[0, wallY, size / 2]} args={[size, wallHeight, thickness]} rotation={[0, 0, 0]} />
            {/* Left */}
            <TrayWall position={[-size / 2, wallY, 0]} args={[thickness, wallHeight, size]} rotation={[0, 0, 0]} />
            {/* Right */}
            <TrayWall position={[size / 2, wallY, 0]} args={[thickness, wallHeight, size]} rotation={[0, 0, 0]} />
        </group>
    );
}

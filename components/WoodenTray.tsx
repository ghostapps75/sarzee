// WoodenTray.tsx
'use client';

import React, { useMemo } from 'react';

type Props = {
    size?: number;
    /** how visible the shadows are (0..1). */
    shadowOpacity?: number;
};

export default function WoodenTray({ size = 24, shadowOpacity = 0.3 }: Props) {
    const planePos: [number, number, number] = useMemo(() => [0, 0.001, 0], []);

    return (
        <group>
            {/* Shadow catcher only (NO physics walls here).
          Physics walls are owned by DiceArena's ArenaBounds to avoid duplicate colliders. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={planePos} receiveShadow raycast={() => null}>
                <planeGeometry args={[size, size]} />
                <shadowMaterial transparent opacity={shadowOpacity} />
            </mesh>
        </group>
    );
}

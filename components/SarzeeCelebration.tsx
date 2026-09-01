'use client';

import { useEffect } from 'react';
import { useGameSounds } from '@/lib/useGameSounds';

type Props = {
    onDismiss: () => void;
};

export default function SarzeeCelebration({ onDismiss }: Props) {
    const playSound = useGameSounds();

    useEffect(() => {
        // The overlay only mounts when the celebration fires, so this runs once per
        // celebration. Volume and file come from lib/sounds.ts like every other sound.
        playSound('sarzee');
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
        // Playing again on every render would retrigger the sound; this is mount-only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
            onClick={onDismiss}
        >
            <div className="relative animate-in zoom-in-50 duration-500 px-8 py-12">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-yellow-400/20 blur-[100px] rounded-full animate-pulse" />

                {/* Semi-opaque background box behind the image */}
                <div className="absolute inset-0 bg-blue-900/40 rounded-2xl backdrop-blur-md border-2 border-blue-600/30 shadow-2xl" />

                <img
                    src="/assets/sarzee_congrats.png"
                    alt="SARZEE!"
                    className="relative w-full h-full max-w-[600px] max-h-[400px] object-contain drop-shadow-2xl z-10"
                />
            </div>
        </div>
    );
}

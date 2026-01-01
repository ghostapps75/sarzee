'use client';

import { useEffect, useState } from 'react';

type Props = {
    onDismiss: () => void;
};

export default function SarzeeCelebration({ onDismiss }: Props) {
    useEffect(() => {
        // Play sound on mount
        const audio = new Audio('/sounds/sarzee.mp3');
        audio.volume = 0.6;
        audio.play().catch((err) => console.warn('Audio play failed:', err));

        // Auto-dismiss after 5 seconds
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
            onClick={onDismiss}
        >
            <div className="relative animate-in zoom-in-50 duration-500">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-yellow-400/20 blur-[100px] rounded-full animate-pulse" />

                <img
                    src="/assets/sarzee_congrats.png"
                    alt="SARZEE!"
                    className="relative max-w-[90vw] max-h-[80vh] object-contain drop-shadow-2xl"
                />
            </div>
        </div>
    );
}

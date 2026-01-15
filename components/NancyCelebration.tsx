'use client';

import { useEffect } from 'react';

type Props = {
    onDismiss: () => void;
};

export default function NancyCelebration({ onDismiss }: Props) {
    useEffect(() => {
        // Play sound on mount
        const audio = new Audio('/sounds/nancy.mp3');
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
            <div className="relative animate-in zoom-in-50 duration-500 px-8 py-12">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-yellow-400/20 blur-[100px] rounded-full animate-pulse" />

                {/* Semi-opaque background box behind the image */}
                <div className="absolute inset-0 bg-blue-900/40 rounded-2xl backdrop-blur-md border-2 border-blue-600/30 shadow-2xl" />

                <img
                    src="/assets/nancy.jpg"
                    alt="NANCY!"
                    className="relative w-full h-full max-w-[600px] max-h-[400px] object-contain drop-shadow-2xl z-10"
                />
            </div>
        </div>
    );
}

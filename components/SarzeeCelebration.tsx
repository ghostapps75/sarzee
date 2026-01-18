'use client';

import { useEffect, useRef } from 'react';

type Props = {
    onDismiss: () => void;
};

// Global singleton to prevent multiple audio instances playing at once
let globalSarzeeAudio: HTMLAudioElement | null = null;
let isPlaying = false;

export default function SarzeeCelebration({ onDismiss }: Props) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const hasPlayedRef = useRef(false);

    useEffect(() => {
        // Only play once per component mount
        if (hasPlayedRef.current) return;
        hasPlayedRef.current = true;

        // Stop any currently playing Sarzee audio
        if (globalSarzeeAudio && isPlaying) {
            globalSarzeeAudio.pause();
            globalSarzeeAudio.currentTime = 0;
            isPlaying = false;
        }

        // Create new audio instance
        const audio = new Audio('/sounds/sarzee.mp3');
        audio.volume = 0.6;
        audioRef.current = audio;
        globalSarzeeAudio = audio;
        isPlaying = true;
        
        const playPromise = audio.play().catch((err) => {
            console.warn('Audio play failed:', err);
            isPlaying = false;
        });

        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000);
        
        // Mark as not playing when audio ends
        audio.addEventListener('ended', () => {
            isPlaying = false;
        });

        return () => {
            clearTimeout(timer);
            // Only clear global if this is still the active instance
            if (audioRef.current === globalSarzeeAudio) {
                globalSarzeeAudio = null;
                isPlaying = false;
            }
        };
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
                    src="/assets/sarzee_congrats.png"
                    alt="SARZEE!"
                    className="relative w-full h-full max-w-[600px] max-h-[400px] object-contain drop-shadow-2xl z-10"
                />
            </div>
        </div>
    );
}

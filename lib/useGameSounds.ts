// lib/useGameSounds.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Tiny audio helper.
 *
 * The previous version took an array literal as its effect dependency, so it allocated a
 * fresh `Audio` element on every single render. This keeps one element per sound for the
 * lifetime of the page and never re-creates them.
 */
export function useGameSounds() {
    const cache = useRef<Map<string, HTMLAudioElement>>(new Map());

    useEffect(() => {
        const elements = cache.current;
        return () => {
            elements.forEach((el) => {
                el.pause();
                el.src = '';
            });
            elements.clear();
        };
    }, []);

    return useCallback((src: string, volume = 1) => {
        if (typeof window === 'undefined') return;
        try {
            let el = cache.current.get(src);
            if (!el) {
                el = new Audio(src);
                el.preload = 'auto';
                cache.current.set(src, el);
            }
            el.volume = volume;
            el.currentTime = 0;
            // Autoplay can reject before the first user gesture; that is not an error
            // worth surfacing, so swallow it rather than logging on every roll.
            void el.play().catch(() => {});
        } catch {
            // Audio is a nice-to-have; never let it break a turn.
        }
    }, []);
}

// lib/useGameSounds.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SOUNDS, SOUND_IDS, SoundId, soundUrl } from './sounds';

/**
 * The game's audio, in one place.
 *
 * Callers ask for a sound by name — `play('roll')` — and the volume comes from the
 * registry in lib/sounds.ts, so levels are set once rather than sprinkled through the
 * components that happen to trigger them.
 *
 * Each sound gets one `Audio` element for the lifetime of the page. An earlier version
 * took an array literal as its effect dependency and so allocated a fresh element on
 * every render.
 */
export function useGameSounds() {
    const elements = useRef<Map<SoundId, HTMLAudioElement>>(new Map());
    const warmed = useRef(false);

    const element = useCallback((id: SoundId) => {
        let el = elements.current.get(id);
        if (!el) {
            el = new Audio(soundUrl(id));
            el.preload = 'auto';
            elements.current.set(id, el);
        }
        return el;
    }, []);

    const play = useCallback(
        (id: SoundId) => {
            if (typeof window === 'undefined') return;
            try {
                const el = element(id);
                el.volume = SOUNDS[id].volume;
                el.currentTime = 0;
                // Browsers reject playback before the first user gesture. That is expected
                // rather than exceptional, so it is swallowed instead of logged per roll.
                void el.play().catch(() => {});
            } catch {
                // Audio is a nice-to-have; never let it break a turn.
            }
        },
        [element]
    );

    /**
     * Warm up the sounds marked `eager` so the first roll or die click isn't waiting on a
     * download. Runs on the first real interaction, which is also the point at which iOS
     * will let us touch audio at all.
     */
    useEffect(() => {
        const warm = () => {
            if (warmed.current) return;
            warmed.current = true;
            for (const id of SOUND_IDS) {
                if (SOUNDS[id].preload === 'eager') element(id).load();
            }
        };

        window.addEventListener('pointerdown', warm, { once: true, passive: true });
        window.addEventListener('keydown', warm, { once: true });
        return () => {
            window.removeEventListener('pointerdown', warm);
            window.removeEventListener('keydown', warm);
        };
    }, [element]);

    useEffect(() => {
        const map = elements.current;
        return () => {
            map.forEach((el) => {
                el.pause();
                el.src = '';
            });
            map.clear();
        };
    }, []);

    return play;
}

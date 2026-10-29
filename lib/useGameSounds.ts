// lib/useGameSounds.ts
'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { SOUNDS, SOUND_IDS, SoundId, soundUrl } from './sounds';

// ---------------------------------------------------------------------------------------
// Mute
//
// One switch for the whole page, kept in localStorage so it survives a reload. Several
// hooks own Audio elements (the game, the celebrations, the page), so the switch lives
// here at module level and every element any of them makes is registered with it: muting
// silences a celebration track that is already playing, not just the next sound.
//
// Muted sounds still play, silently. The celebrations time themselves to their cue's
// playback, so skipping it would change their pacing; `muted` (unlike `volume`) is also
// honoured on iOS.

const MUTE_KEY = 'sarzee_muted';
const muteListeners = new Set<() => void>();
const liveElements = new Set<HTMLAudioElement>();
let muted: boolean | null = null;

function isMuted(): boolean {
    if (muted === null) {
        try {
            muted = typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
        } catch {
            muted = false;
        }
    }
    return muted;
}

export function setSoundsMuted(next: boolean) {
    muted = next;
    try {
        if (next) localStorage.setItem(MUTE_KEY, '1');
        else localStorage.removeItem(MUTE_KEY);
    } catch {
        // Private mode or storage blocked: the switch still works for this visit.
    }
    liveElements.forEach((el) => (el.muted = next));
    muteListeners.forEach((fn) => fn());
}

function subscribeMuted(fn: () => void) {
    muteListeners.add(fn);
    return () => {
        muteListeners.delete(fn);
    };
}

/** Whether sound is off, and the switch. Prerendered as on, then read from storage. */
export function useSoundMuted(): [boolean, (muted: boolean) => void] {
    const value = useSyncExternalStore(subscribeMuted, isMuted, () => false);
    return [value, setSoundsMuted];
}

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
            el.muted = isMuted();
            elements.current.set(id, el);
            liveElements.add(el);
        }
        return el;
    }, []);

    /**
     * Plays a sound and hands back its element, for a caller that needs to follow the
     * playback — the celebrations time themselves to their cue (see `whenSoundDuration`).
     * Null when there is no audio to be had.
     */
    const play = useCallback(
        (id: SoundId): HTMLAudioElement | null => {
            if (typeof window === 'undefined') return null;
            try {
                const el = element(id);
                el.volume = SOUNDS[id].volume;
                el.muted = isMuted();
                el.currentTime = 0;
                // Browsers reject playback before the first user gesture. That is expected
                // rather than exceptional, so it is swallowed instead of logged per roll.
                void el.play().catch(() => {});
                return el;
            } catch {
                // Audio is a nice-to-have; never let it break a turn.
                return null;
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
                liveElements.delete(el);
            });
            map.clear();
        };
    }, []);

    return play;
}

/**
 * Calls back with a sound's length in seconds once the browser knows it: at once if the
 * metadata is already in, otherwise when it arrives. The celebrations use this to fit their
 * animation to whatever file is in public/sounds, so a new cue needs no code change.
 * Returns a function that stops listening.
 */
export function whenSoundDuration(el: HTMLAudioElement | null, cb: (seconds: number) => void): () => void {
    if (!el) return () => {};
    const known = () => Number.isFinite(el.duration) && el.duration > 0;
    if (known()) {
        cb(el.duration);
        return () => {};
    }
    const onMeta = () => {
        if (!known()) return;
        el.removeEventListener('loadedmetadata', onMeta);
        el.removeEventListener('durationchange', onMeta);
        cb(el.duration);
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    return () => {
        el.removeEventListener('loadedmetadata', onMeta);
        el.removeEventListener('durationchange', onMeta);
    };
}

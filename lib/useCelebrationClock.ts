// lib/useCelebrationClock.ts
'use client';

import { RefObject, useEffect, useRef, useState } from 'react';
import { SoundId } from './sounds';
import { useGameSounds, whenSoundDuration } from './useGameSounds';

/** How long a celebration runs when its cue's length isn't known in time. */
export const FALLBACK_CUE_SECONDS = 4;
/** A cue longer than this is treated as this long, so a stray long file can't stall a turn. */
const MAX_CUE_SECONDS = 15;
/** How late a cue may start (it is fetched on first use) and still have the run wait for it. */
const LATE_START_ALLOWANCE = 2;
/** The least time the finished picture is held before the wind-down starts. */
const MIN_HOLD_SECONDS = 0.25;
/** The most a short cue is allowed to hurry the choreography. */
const MAX_RATE = 2;

export interface CelebrationTiming {
    /** A beat after the dice land, so the roll is seen before anything moves. */
    leadIn: number;
    /** Natural length of everything up to the title being fully on show. */
    intro: number;
    /** Natural length of the wind-down: dice going back, title fading. */
    outro: number;
}

export type CelebrationPhase = 'lead-in' | 'intro' | 'hold' | 'outro' | 'done';

export interface CelebrationFrame {
    /**
     * Where the choreography is, in natural seconds: 0 to `intro` is the opening and
     * `intro` to `intro + outro` the wind-down. It stands still at `intro` through the
     * hold, which is the part that stretches to fit the cue.
     */
    tau: number;
    phase: CelebrationPhase;
    /** Wall-clock seconds since the previous frame (capped), for particles and wobble. */
    dt: number;
    /** Wall-clock seconds since the cue started. */
    elapsed: number;
}

interface Options {
    cue: SoundId;
    timing: CelebrationTiming;
    /** After the lead-in, as the cue starts. Not called when reduced motion is asked for. */
    onStart?: () => void;
    /** Every animation frame from the start until the end. Not called under reduced motion. */
    onFrame?: (frame: CelebrationFrame) => void;
    /**
     * Puts everything in its end state. Called exactly once: when the run finishes, when it
     * is skipped, or when the celebration is torn down early.
     */
    onFinish?: () => void;
    /** Tells the host the celebration is over, so it can unmount it. */
    onDone: () => void;
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/**
 * The clock both celebrations run on.
 *
 * Its length comes from the cue: the sound starts with the animation, and once the browser
 * knows how long the file is (and when it actually began playing) the run is fitted to end
 * with it. The animation never waits for the download; until the length is known it plans
 * for FALLBACK_CUE_SECONDS. The opening action keeps its natural pace unless the cue is too
 * short for it, the held picture in the middle absorbs the rest, and the wind-down lands on
 * the cue's last moment. So swapping a file in public/sounds re-times the celebration.
 *
 * While it runs, a transparent layer over the whole window takes the first click or tap,
 * and any key, and skips straight to the end state; nothing underneath sees that input. The
 * layer is gone the moment the celebration ends, so the pad is usable at once.
 */
export function useCelebrationClock({ cue, timing, onStart, onFrame, onFinish, onDone }: Options) {
    const playSound = useGameSounds();
    const [reduced] = useState(prefersReducedMotion);
    const [started, setStarted] = useState(false);

    // The run is mount-only; the latest callbacks are read through a ref.
    const callbacks = useRef({ onStart, onFrame, onFinish, onDone });
    useEffect(() => {
        callbacks.current = { onStart, onFrame, onFinish, onDone };
    });

    const timingRef = useRef(timing);

    useEffect(() => {
        const { leadIn, intro, outro } = timingRef.current;
        let finished = false;
        let raf = 0;
        let startAt = 0;
        let last = 0;
        let tau = 0;
        let phase: CelebrationPhase = 'lead-in';
        /** When the run should end, in seconds after the cue started. */
        let endAt = FALLBACK_CUE_SECONDS;
        let audio: HTMLAudioElement | null = null;
        let stopDuration = () => {};

        const now = () => performance.now();
        const elapsedNow = () => (startAt ? (now() - startAt) / 1000 : 0);

        // Re-plan around the cue whenever we learn something about it, until the
        // wind-down has begun.
        const fitToCue = () => {
            if (!audio || phase === 'outro' || phase === 'done') return;
            const d = audio.duration;
            if (!Number.isFinite(d) || d <= 0) return;
            const length = Math.min(MAX_CUE_SECONDS, d);
            // Playing, or still downloading and about to: end when it does. Refused (no
            // autoplay) or paused: run for its length from the start, as if it had played.
            const followed = audio.paused ? length : elapsedNow() + Math.max(0, length - audio.currentTime);
            // A cue that stalls and never starts must not hold up the turn indefinitely.
            endAt = Math.min(followed, length + LATE_START_ALLOWANCE);
        };

        const teardown = () => {
            finished = true;
            cancelAnimationFrame(raf);
            clearTimeout(leadTimer);
            clearInterval(watchdog);
            stopDuration();
            audio?.removeEventListener('playing', fitToCue);
            window.removeEventListener('keydown', onKey, true);
            catcher.remove();
        };

        const finish = () => {
            if (finished) return;
            teardown();
            phase = 'done';
            callbacks.current.onFinish?.();
            callbacks.current.onDone();
        };

        const frame = (t: number) => {
            if (finished) return;
            const wall = last ? (t - last) / 1000 : 0;
            last = t;
            const elapsed = (t - startAt) / 1000;
            const remaining = endAt - elapsed;

            if (reduced) {
                phase = remaining > 0 ? 'hold' : 'done';
            } else if (tau < intro) {
                // Natural pace, unless what's left wouldn't fit before the cue ends.
                const need = intro - tau + outro;
                const rate = Math.min(MAX_RATE, Math.max(1, need / Math.max(0.05, remaining - MIN_HOLD_SECONDS)));
                tau = Math.min(intro, tau + wall * rate);
                phase = tau < intro ? 'intro' : 'hold';
            } else if (phase === 'hold' && remaining > outro) {
                phase = 'hold';
            } else {
                // The wind-down is paced to finish exactly as the cue does.
                const left = intro + outro - tau;
                const rate = Math.min(MAX_RATE, Math.max(0.5, left / Math.max(0.05, remaining)));
                tau = Math.min(intro + outro, tau + wall * rate);
                phase = tau < intro + outro ? 'outro' : 'done';
            }

            if (!reduced) callbacks.current.onFrame?.({ tau, phase, dt: Math.min(0.1, wall), elapsed });
            if (phase === 'done') {
                finish();
                return;
            }
            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            if (finished) return;
            startAt = now();
            phase = reduced ? 'hold' : 'intro';
            audio = playSound(cue);
            stopDuration = whenSoundDuration(audio, fitToCue);
            // A cue still downloading starts late; line the end up with when it really began.
            audio?.addEventListener('playing', fitToCue);
            setStarted(true);
            if (!reduced) callbacks.current.onStart?.();
            raf = requestAnimationFrame(frame);
        };

        const onKey = (e: KeyboardEvent) => {
            if (MODIFIER_KEYS.has(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            finish();
        };

        // Everything underneath is out of reach while the celebration runs: a tap on a die
        // or a score box would act on dice that are mid-flight. The skip happens on `click`
        // so the whole press, release and click land here and none of it falls through.
        const catcher = document.createElement('div');
        catcher.setAttribute('aria-hidden', 'true');
        catcher.dataset.celebrationSkip = cue;
        Object.assign(catcher.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483000',
            cursor: 'pointer',
            background: 'transparent',
            touchAction: 'manipulation',
        });
        catcher.addEventListener('click', finish);
        document.body.appendChild(catcher);
        window.addEventListener('keydown', onKey, true);

        const leadTimer = setTimeout(start, leadIn * 1000);
        // requestAnimationFrame stops in a background tab (and is throttled in some embedded
        // views). A timer still runs there, so the celebration always ends and play goes on.
        const watchdog = setInterval(() => {
            if (startAt && elapsedNow() > endAt + 1.5) finish();
        }, 500);

        return () => {
            // Torn down before it finished (the player left the game): still put the dice back.
            if (finished) return;
            teardown();
            callbacks.current.onFinish?.();
        };
        // The run belongs to this mount; the cue and the callbacks are read once or by ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { reduced, started };
}

/** The size of an element, kept current: a celebration's overlay follows the felt as the layout changes. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize((prev) =>
                Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5 ? prev : { w: width, h: height }
            );
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return size;
}

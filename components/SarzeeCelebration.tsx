'use client';

import React, { RefObject, useEffect, useRef } from 'react';
import type { DiceArenaHandle, SarzeeCue } from './DiceArena';
import { BoardTheme } from '@/lib/boards';
import { DIE_SIZE } from '@/lib/dieFaces';
import { CelebrationFrame, useCelebrationClock, useElementSize } from '@/lib/useCelebrationClock';

type Props = {
    arenaRef: RefObject<DiceArenaHandle | null>;
    theme: BoardTheme;
    onDismiss: () => void;
};

/*
 * The choreography, in natural seconds from the moment the cue starts. The dice lift and
 * spin, slam down in a row at IMPACT, and the title stamps in a letter at a time; the
 * clock then holds that picture for as long as the cue runs on, and in the wind-down the
 * dice glide back to where they landed while the title fades.
 *
 * The dice go back rather than staying in the row because a Sarzee usually comes with
 * some of them parked in the hold tray, and those have to return there; sending every
 * die home keeps the table exactly as it was rolled for the player to score.
 */
const LEAD_IN = 0.8;
const LIFT_END = 0.32;
const SLAM_START = 0.72;
const IMPACT = 0.86;
const STAMP_FIRST = 0.9;
const STAMP_GAP = 0.07;
const STAMP_S = 0.2;
const INTRO = 1.6;
const OUTRO = 0.6;
const TIMING = { leadIn: LEAD_IN, intro: INTRO, outro: OUTRO };

/** Where the row lands and where the title sits, as fractions of the felt's height. */
const ROW_Y = 0.56;
const TITLE_Y = 0.27;

/** The gold shockwave: two rings, a beat apart, each spreading for this long (wall time). */
const RING_COUNT = 2;
const RING_GAP_S = 0.13;
const RING_S = 0.85;
const FLASH_S = 0.45;
const SHAKE = 3.5;

const TITLE = 'SARZEE!';
const LETTERS = TITLE.split('');

/** A die's edge as a fraction of the felt's height (the arena is ten units tall). */
const DIE_FRAC = DIE_SIZE / 10;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Five of a kind. The real dice take a bow on the felt — lift, spin as one, slam down in a
 * row — a gold ring ripples out from them, they glint, the table shakes and SARZEE! stamps
 * in over the table in the board's own title colours. The board stays in view throughout.
 */
export default function SarzeeCelebration({ arenaRef, theme, onDismiss }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const size = useElementSize(rootRef);
    const sizeRef = useRef(size);
    useEffect(() => {
        sizeRef.current = size;
    }, [size]);

    const titleRef = useRef<HTMLDivElement>(null);
    const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const ringRefs = useRef<Array<HTMLDivElement | null>>([]);
    const flashRef = useRef<HTMLDivElement>(null);

    const cue = useRef<SarzeeCue>({
        kind: 'sarzee',
        tau: 0,
        liftEnd: LIFT_END,
        slamStart: SLAM_START,
        impact: IMPACT,
        returnStart: INTRO + 0.02,
        returnEnd: INTRO + OUTRO - 0.02,
        rowY: ROW_Y,
    });
    /** Wall-clock time of the impact, once it has happened, and the row's half-extent then. */
    const impact = useRef<{ at: number; halfW: number; halfH: number; cx: number } | null>(null);

    const onFrame = ({ tau, elapsed }: CelebrationFrame) => {
        cue.current.tau = tau;
        const { w, h } = sizeRef.current;

        if (!impact.current && tau >= IMPACT) {
            // Ring it from the row as it actually landed, so a narrow felt that squeezes the
            // row still gets a ring that hugs it.
            const pts = arenaRef.current?.dicePoints() ?? [];
            const xs = pts.map((p) => p.x);
            const minX = xs.length ? Math.min(...xs) : 0.5;
            const maxX = xs.length ? Math.max(...xs) : 0.5;
            impact.current = {
                at: elapsed,
                cx: (minX + maxX) / 2,
                halfW: ((maxX - minX) / 2) * w + (DIE_FRAC * h) / 2,
                halfH: (DIE_FRAC * h) / 2,
            };
            arenaRef.current?.triggerCelebrationShake(SHAKE);
        }

        // The shockwave runs on the wall clock, so it plays out in full whatever the hold does.
        const hit = impact.current;
        const pad = h * 0.05;
        ringRefs.current.forEach((ring, i) => {
            if (!ring) return;
            const q = hit ? clamp01((elapsed - hit.at - i * RING_GAP_S) / RING_S) : 0;
            if (!hit || q <= 0 || q >= 1) {
                ring.style.opacity = '0';
                return;
            }
            const grow = easeOutCubic(q) * w * 0.75;
            const rx = hit.halfW + pad + grow;
            const ry = hit.halfH + pad + grow;
            const cx = hit.cx * w;
            const cy = ROW_Y * h;
            ring.style.left = `${cx - rx}px`;
            ring.style.top = `${cy - ry}px`;
            ring.style.width = `${rx * 2}px`;
            ring.style.height = `${ry * 2}px`;
            ring.style.borderWidth = `${Math.max(2, h * 0.014 * (1 - 0.6 * q)).toFixed(1)}px`;
            ring.style.opacity = (Math.pow(1 - q, 1.4) * (i === 0 ? 1 : 0.7)).toFixed(3);
        });

        const flash = flashRef.current;
        if (flash) {
            const q = hit ? clamp01((elapsed - hit.at) / FLASH_S) : 0;
            if (!hit || q >= 1) {
                flash.style.opacity = '0';
            } else {
                const rx = (hit.halfW + pad) * lerp(1, 1.5, q);
                const ry = (hit.halfH + pad * 2) * lerp(1.2, 2.2, q);
                flash.style.left = `${hit.cx * w - rx}px`;
                flash.style.top = `${ROW_Y * h - ry}px`;
                flash.style.width = `${rx * 2}px`;
                flash.style.height = `${ry * 2}px`;
                flash.style.opacity = ((1 - q) * 0.85).toFixed(3);
            }
        }

        // SARZEE! stamps in a letter at a time: dropped from above the table, landing hard.
        letterRefs.current.forEach((el, k) => {
            if (!el) return;
            const p = clamp01((tau - (STAMP_FIRST + k * STAMP_GAP)) / STAMP_S);
            if (p <= 0) {
                el.style.opacity = '0';
                return;
            }
            const scale = p < 0.7 ? lerp(2.6, 0.9, Math.pow(p / 0.7, 2)) : lerp(0.9, 1, easeOutCubic((p - 0.7) / 0.3));
            const tilt = (k % 2 ? 1 : -1) * 12 * (1 - p);
            el.style.opacity = Math.min(1, p / 0.3).toFixed(3);
            el.style.transform = `translateY(${(-0.18 * (1 - p)).toFixed(3)}em) scale(${scale.toFixed(3)}) rotate(${tilt.toFixed(1)}deg)`;
        });

        const title = titleRef.current;
        if (title) {
            const out = clamp01((tau - INTRO) / (OUTRO * 0.85));
            title.style.opacity = (1 - out).toFixed(3);
            title.style.transform = `scale(${lerp(1, 1.06, out).toFixed(3)})`;
        }
    };

    const { reduced, started } = useCelebrationClock({
        cue: 'sarzee',
        timing: TIMING,
        onStart: () => {
            arenaRef.current?.celebrate(cue.current);
        },
        onFrame,
        onFinish: () => arenaRef.current?.endCelebration(),
        onDone: onDismiss,
    });

    const fontSize = Math.max(18, Math.min(size.h * 0.2, size.w * 0.15));
    // Reduced motion: the title alone, still, for as long as the cue plays.
    const staticTitle = reduced && started;

    return (
        <div ref={rootRef} className="absolute inset-0">
            <span role="status" className="sr-only">
                {started ? 'Sarzee!' : ''}
            </span>

            {/* On the felt, under the dice: the flash where they land and the ripple. */}
            <div className="absolute inset-0 z-[6]">
                <div
                    ref={flashRef}
                    className="absolute rounded-[50%]"
                    style={{
                        opacity: 0,
                        background:
                            'radial-gradient(closest-side, rgba(255,236,170,0.95) 0%, rgba(255,204,84,0.55) 45%, rgba(255,190,60,0) 100%)',
                        mixBlendMode: 'screen',
                    }}
                />
                {Array.from({ length: RING_COUNT }, (_, i) => (
                    <div
                        key={i}
                        ref={(el) => {
                            ringRefs.current[i] = el;
                        }}
                        className="absolute rounded-[50%] border-solid"
                        style={{
                            opacity: 0,
                            borderColor: 'rgba(255, 214, 102, 0.95)',
                            boxShadow:
                                '0 0 14px 3px rgba(255, 190, 60, 0.7), inset 0 0 12px 2px rgba(255, 224, 140, 0.55)',
                        }}
                    />
                ))}
            </div>

            {/* Over the dice: the title. A title over the table, not a card. */}
            {size.h > 0 && (
                <div
                    className="absolute inset-x-0 z-20 flex justify-center"
                    style={{ top: size.h * TITLE_Y - fontSize * 0.6 }}
                >
                    <div
                        ref={titleRef}
                        aria-hidden
                        className="flex font-extrabold uppercase leading-none tracking-widest select-none"
                        style={{
                            fontSize,
                            // The setup panel's title treatment, so it reads as the game's own wordmark.
                            filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.5))',
                            opacity: reduced && !started ? 0 : 1,
                        }}
                    >
                        {LETTERS.map((ch, k) => (
                            <span
                                key={k}
                                ref={(el) => {
                                    letterRefs.current[k] = el;
                                }}
                                aria-hidden
                                className="inline-block bg-clip-text text-transparent will-change-transform"
                                style={{
                                    // One gradient across the whole word: each letter shows its slice.
                                    backgroundImage: theme.titleGradient,
                                    backgroundSize: `${LETTERS.length * 100}% 100%`,
                                    backgroundPosition: `${(k / (LETTERS.length - 1)) * 100}% 0`,
                                    opacity: staticTitle ? 1 : 0,
                                }}
                            >
                                {ch}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

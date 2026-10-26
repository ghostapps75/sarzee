'use client';

import React, { RefObject, useEffect, useId, useRef } from 'react';
import type { DiceArenaHandle, NancyCue } from './DiceArena';
import { CelebrationFrame, useCelebrationClock, useElementSize } from '@/lib/useCelebrationClock';

type Props = {
    arenaRef: RefObject<DiceArenaHandle | null>;
    onDismiss: () => void;
};

/*
 * The choreography, in natural seconds from the moment the cue starts. The dice start to
 * smoke and then burn; a dumpster trundles in along the bottom of the felt; the dice hop in
 * one at a time; the lid slams, the table shakes, the whole thing goes up and NANCY! burns
 * in. The clock holds that for as long as the cue runs on, and in the wind-down the dice hop
 * back out onto exactly the spots (and faces) they rolled while the dumpster rolls away.
 */
const LEAD_IN = 0.6;
const SMOKE_FROM = 0;
const FLAMES_FROM = 0.3;
const ENTER_START = 0.35;
const ENTER_END = 1.15;
const HOP_IN = { first: 1.2, stagger: 0.15, duration: 0.4 };
const SLAM_START = 2.25;
const SLAM = 2.36;
const TITLE_FIRST = 2.42;
const TITLE_GAP = 0.06;
const TITLE_S = 0.32;
const SUBTITLE_FROM = 2.85;
const SUBTITLE_S = 0.35;
const INTRO = 3.25;
const OUTRO = 0.85;
const HOP_OUT = { first: INTRO + 0.05, stagger: 0.06, duration: 0.42 };
const EXIT_START = INTRO + 0.15;
const EXIT_END = INTRO + OUTRO;
const TIMING = { leadIn: LEAD_IN, intro: INTRO, outro: OUTRO };
const SHAKE = 2.5;

const TITLE = 'NANCY!';
const LETTERS = TITLE.split('');
const TITLE_Y = 0.22;

/*
 * The dumpster is drawn in a 240 x 190 box. Its front rim's top edge is at y=50 and the
 * back rim at y=24; the lid is hinged on the back rim. Everything is in this one frame so
 * the back half (under the dice) and the front half (over them) line up exactly.
 */
const VB_W = 240;
const VB_H = 190;
const RIM_Y = 50;
const BACK_Y = 24;
const HINGE_Y = 28;
const LID_DEPTH = 64;
const LID_SPAN_BACK: [number, number] = [16, 224];
const LID_SPAN_FRONT: [number, number] = [6, 234];
const WHEEL_R = 12;
const WHEELS = [48, 192];
const WHEEL_Y = 176;
/** Dumpster height as a fraction of the felt's height, and where its wheels touch down. */
const DUMPSTER_H = 0.42;
const FLOOR_Y = 0.975;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/** The lid's outline when it stands `deg` degrees open: 0 is shut, 90 straight up. */
function lidPoints(deg: number): string {
    const phi = (deg * Math.PI) / 180;
    const c = Math.cos(phi);
    // Seen from a little above, the opening is RIM_Y - HINGE_Y deep; the lid covers it shut.
    const freeY = HINGE_Y - LID_DEPTH * Math.sin(phi) + (RIM_Y + 4 - HINGE_Y) * c;
    const l = lerp(LID_SPAN_BACK[0], LID_SPAN_FRONT[0], c);
    const r = lerp(LID_SPAN_BACK[1], LID_SPAN_FRONT[1], c);
    return `${LID_SPAN_BACK[0]},${HINGE_Y} ${LID_SPAN_BACK[1]},${HINGE_Y} ${r.toFixed(1)},${freeY.toFixed(1)} ${l.toFixed(1)},${freeY.toFixed(1)}`;
}

// ---------------------------------------------------------------------------------------
// Fire and smoke: soft round sprites on a 2D canvas over the felt. Positions are in units
// of the felt's height, so the particles stay put when the layout changes size.

type Kind = 'smoke' | 'fire' | 'spark';
type Particle = {
    kind: Kind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    size: number;
    seed: number;
};

const MAX_PARTICLES = 900;

/** A soft round sprite, rendered once and stamped many times. */
function sprite(stops: Array<[number, string]>): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c;
}

function makeSprites() {
    return {
        smoke: sprite([
            [0, 'rgba(178,172,166,0.95)'],
            [0.5, 'rgba(150,145,140,0.5)'],
            [1, 'rgba(130,126,122,0)'],
        ]),
        core: sprite([
            [0, 'rgba(255,252,225,1)'],
            [0.35, 'rgba(255,214,90,0.8)'],
            [1, 'rgba(255,120,0,0)'],
        ]),
        flame: sprite([
            [0, 'rgba(255,176,60,1)'],
            [0.45, 'rgba(255,92,10,0.55)'],
            [1, 'rgba(200,30,0,0)'],
        ]),
        ember: sprite([
            [0, 'rgba(210,60,12,0.7)'],
            [1, 'rgba(120,20,0,0)'],
        ]),
        spark: sprite([
            [0, 'rgba(255,255,230,1)'],
            [0.3, 'rgba(255,210,90,0.9)'],
            [1, 'rgba(255,140,0,0)'],
        ]),
    };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(list: Particle[], kind: Kind, x: number, y: number, spread: number, boost = 1): Particle | null {
    if (list.length >= MAX_PARTICLES) return null;
    const p: Particle = { kind, x: x + rand(-spread, spread), y, vx: 0, vy: 0, age: 0, life: 1, size: 0.02, seed: Math.random() * 100 };
    if (kind === 'smoke') {
        p.vx = rand(-0.03, 0.03);
        p.vy = rand(-0.18, -0.11) * boost;
        p.life = rand(1.2, 1.8);
        p.size = rand(0.03, 0.05);
    } else if (kind === 'fire') {
        p.vx = rand(-0.05, 0.05) * boost;
        p.vy = rand(-0.5, -0.3) * boost;
        p.life = rand(0.35, 0.6);
        p.size = rand(0.025, 0.045) * Math.sqrt(boost);
    } else {
        p.vx = rand(-0.45, 0.45) * boost;
        p.vy = rand(-1.0, -0.55) * boost;
        p.life = rand(0.5, 0.9);
        p.size = rand(0.006, 0.011);
    }
    list.push(p);
    return p;
}

/** Emits `rate` particles a second, carrying the fractional remainder from frame to frame. */
function emit(carry: Map<string, number>, key: string, rate: number, dt: number, fn: () => void) {
    const n = (carry.get(key) ?? 0) + rate * dt;
    const whole = Math.floor(n);
    carry.set(key, n - whole);
    for (let i = 0; i < whole; i++) fn();
}

function step(list: Particle[], dt: number) {
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
            list.splice(i, 1);
            continue;
        }
        if (p.kind === 'smoke') {
            // Buoyant, drag-damped, and curling as it rises.
            p.vy -= 0.05 * dt;
            p.vx += Math.sin(p.seed + p.age * 3.2) * 0.12 * dt;
            p.vx *= 1 - 0.6 * dt;
        } else if (p.kind === 'fire') {
            p.vx += Math.sin(p.seed + p.age * 9) * 0.25 * dt;
            p.vy *= 1 - 0.6 * dt;
        } else {
            p.vy += 1.4 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
}

function draw(ctx: CanvasRenderingContext2D, list: Particle[], sprites: ReturnType<typeof makeSprites>) {
    const stamp = (img: HTMLCanvasElement, p: Particle, size: number, alpha: number) => {
        if (alpha <= 0.01) return;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(img, p.x - size, p.y - size, size * 2, size * 2);
    };

    ctx.globalCompositeOperation = 'source-over';
    for (const p of list) {
        if (p.kind !== 'smoke') continue;
        const k = p.age / p.life;
        stamp(sprites.smoke, p, p.size + k * 0.1, 0.55 * (1 - k) * Math.min(1, p.age / 0.12));
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const p of list) {
        const k = p.age / p.life;
        if (p.kind === 'fire') {
            const img = k < 0.3 ? sprites.core : k < 0.65 ? sprites.flame : sprites.ember;
            stamp(img, p, p.size * (1 - 0.55 * k), 1 - k * k);
        } else if (p.kind === 'spark') {
            stamp(sprites.spark, p, p.size, 1 - k);
        }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------------------

/** Moves the fire gradient up through the letters and makes the whole word flicker. */
const FLICKER_CSS = `
@keyframes nancy-burn { 0% { background-position: 50% 0%; } 50% { background-position: 50% 100%; } 100% { background-position: 50% 0%; } }
@keyframes nancy-flicker {
  0%, 100% { filter: brightness(1); }
  12% { filter: brightness(1.22); }
  24% { filter: brightness(0.92); }
  37% { filter: brightness(1.12); }
  51% { filter: brightness(0.97); }
  63% { filter: brightness(1.28); }
  78% { filter: brightness(0.9); }
  89% { filter: brightness(1.1); }
}
`;

const FIRE_GRADIENT =
    'linear-gradient(0deg, #7a0d00 0%, #d42a06 18%, #ff6a00 38%, #ffb200 58%, #ffe36b 76%, #fffbe6 92%, #ffe36b 100%)';

/**
 * A Nancy: five different numbers on the opening roll that don't make a straight. The dice
 * catch fire, a dumpster rolls up, they hop in, the lid slams on a proper dumpster fire and
 * NANCY! burns in over it. Everything is drawn here, in SVG and on a canvas.
 */
export default function NancyCelebration({ arenaRef, onDismiss }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const size = useElementSize(rootRef);
    const sizeRef = useRef(size);
    useEffect(() => {
        sizeRef.current = size;
    }, [size]);

    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const backRef = useRef<SVGSVGElement>(null);
    const frontRef = useRef<SVGSVGElement>(null);
    const lidRef = useRef<SVGPolygonElement>(null);
    const lidEdgeRef = useRef<SVGPolygonElement>(null);
    const lidLipRef = useRef<SVGLineElement>(null);
    const spokeRefs = useRef<Array<SVGGElement | null>>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const titleRef = useRef<HTMLDivElement>(null);
    const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const subtitleRef = useRef<HTMLDivElement>(null);

    const cue = useRef<NancyCue>({
        kind: 'nancy',
        tau: 0,
        mouth: { x: -1, rim: 0.8, top: 0.6, width: 0.2 },
        hopIn: HOP_IN,
        hopOut: HOP_OUT,
    });

    const fire = useRef<{
        particles: Particle[];
        carry: Map<string, number>;
        sprites: ReturnType<typeof makeSprites> | null;
        puffed: boolean[];
        lit: boolean[];
        slammed: boolean;
        scale: number;
    }>({ particles: [], carry: new Map(), sprites: null, puffed: [], lit: [], slammed: false, scale: 1 });

    // The canvas backing store follows the felt's size; the particles are in felt units.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.w <= 0) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(size.w * dpr);
        canvas.height = Math.round(size.h * dpr);
        // A small felt (a phone) gets a thinner fire, to spare the GPU.
        fire.current.scale = size.w * size.h < 160_000 ? 0.6 : 1;
    }, [size]);

    const onFrame = ({ tau, dt, elapsed }: CelebrationFrame) => {
        cue.current.tau = tau;
        const { w, h } = sizeRef.current;
        if (w <= 0 || h <= 0) return;
        const f = fire.current;
        if (!f.sprites) f.sprites = makeSprites();

        // --- the dumpster ---
        const dh = h * DUMPSTER_H;
        const dw = (dh * VB_W) / VB_H;
        const u = dh / VB_H;
        const offLeft = -dw * 0.6;
        const offRight = w + dw * 0.6;
        let cx: number;
        let tilt = 0;
        if (tau < ENTER_START) {
            cx = offLeft;
        } else if (tau < ENTER_END) {
            const q = (tau - ENTER_START) / (ENTER_END - ENTER_START);
            cx = lerp(offLeft, w / 2, easeOutBack(q));
            tilt = -3.5 * Math.sin(Math.PI * Math.min(1, q * 1.4));
        } else if (tau < EXIT_START) {
            cx = w / 2;
            // Rocks on its casters as it pulls up.
            const t = tau - ENTER_END;
            tilt = 3 * Math.sin(t * 22) * Math.exp(-t * 7);
        } else {
            const q = clamp01((tau - EXIT_START) / (EXIT_END - EXIT_START));
            cx = lerp(w / 2, offRight, q * q);
            tilt = -3 * Math.sin(Math.PI * q);
        }
        const travelled = cx - offLeft;
        const moving = (tau > ENTER_START && tau < ENTER_END + 0.05) || tau > EXIT_START;
        const bob = moving ? Math.abs(Math.sin(travelled / (dh * 0.11))) * dh * 0.012 : 0;
        let squash = 1;
        if (tau >= SLAM && tau < SLAM + 0.3) {
            const s = (tau - SLAM) / 0.3;
            squash = 1 - 0.06 * Math.sin(Math.PI * s) * (1 - s);
        }
        const left = cx - dw / 2;
        const top = h * FLOOR_Y - dh - bob;
        const transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg) scale(1, ${squash.toFixed(3)})`;
        for (const svg of [backRef.current, frontRef.current]) {
            if (!svg) continue;
            svg.style.transform = transform;
            svg.style.width = `${dw}px`;
            svg.style.height = `${dh}px`;
        }
        const wheelDeg = ((travelled / (WHEEL_R * u)) * 180) / Math.PI;
        spokeRefs.current.forEach((g, i) => g?.setAttribute('transform', `rotate(${wheelDeg.toFixed(1)} ${WHEELS[i]} ${WHEEL_Y})`));

        // --- the lid: propped open, slammed, blown up by the fire, rattling, then open
        // again to let the dice out ---
        let lid: number;
        if (tau < SLAM_START) lid = 100;
        else if (tau < SLAM) lid = lerp(100, 0, Math.pow((tau - SLAM_START) / (SLAM - SLAM_START), 2));
        else if (tau < SLAM + 0.4) {
            const q = (tau - SLAM) / 0.4;
            lid = 34 * Math.sin(Math.PI * q) * (1 - 0.3 * q);
        } else if (tau < INTRO) lid = 3 + 4 * Math.abs(Math.sin(elapsed * 15));
        else lid = lerp(5, 80, easeOutCubic(clamp01((tau - INTRO) / 0.15)));
        lidRef.current?.setAttribute('points', lidPoints(lid));
        lidRef.current?.setAttribute('fill', lid > 55 ? `url(#${uid}-lid-under)` : `url(#${uid}-lid-top)`);
        {
            // The free edge: a thick lip when shut, a highlight along the top when open.
            const phi = (lid * Math.PI) / 180;
            const c = Math.cos(phi);
            const y = HINGE_Y - LID_DEPTH * Math.sin(phi) + (RIM_Y + 4 - HINGE_Y) * c;
            const l = lerp(LID_SPAN_BACK[0], LID_SPAN_FRONT[0], c);
            const r = lerp(LID_SPAN_BACK[1], LID_SPAN_FRONT[1], c);
            lidEdgeRef.current?.setAttribute('opacity', lid < 40 ? '1' : '0');
            lidEdgeRef.current?.setAttribute('points', `${l},${y} ${r},${y} ${r},${y + 4} ${l},${y + 4}`);
            const lip = lidLipRef.current;
            if (lip) {
                lip.setAttribute('x1', String(l + 3));
                lip.setAttribute('x2', String(r - 3));
                lip.setAttribute('y1', String(y + 1));
                lip.setAttribute('y2', String(y + 1));
                lip.setAttribute('opacity', lid >= 40 ? '1' : '0');
            }
        }

        // Where the dice aim, for the arena, which reads it every frame.
        const m = cue.current.mouth;
        m.x = cx / w;
        m.rim = (top + RIM_Y * u) / h;
        m.top = (top + BACK_Y * u) / h;
        m.width = (dw * 0.95) / w;

        // --- fire and smoke, in felt-height units ---
        const list = f.particles;
        const k = f.scale;
        const mouthX = cx / h;
        const mouthY = (top + (RIM_Y - 6) * u) / h;
        const mouthHalf = (dw * 0.38) / h;
        const points = tau < INTRO ? arenaRef.current?.dicePoints() ?? [] : [];
        const dieTop = 0.04;
        points.forEach((p, i) => {
            if (!p.visible) return;
            const x = (p.x * w) / h;
            const y = p.y - dieTop;
            emit(f.carry, `smoke${i}`, 26 * k * clamp01((tau - SMOKE_FROM) / 0.2), dt, () => spawn(list, 'smoke', x, y, 0.025));
            emit(f.carry, `fire${i}`, 30 * k * clamp01((tau - FLAMES_FROM) / 0.3), dt, () => spawn(list, 'fire', x, y + 0.02, 0.025, 0.7));
        });

        // A puff of flame each time a die drops in.
        for (let r = 0; r < 5; r++) {
            if (f.puffed[r] || tau < HOP_IN.first + r * HOP_IN.stagger + HOP_IN.duration) continue;
            f.puffed[r] = true;
            for (let n = 0; n < 10 * k; n++) spawn(list, 'fire', mouthX, mouthY, mouthHalf * 0.4, 0.8);
            for (let n = 0; n < 6 * k; n++) spawn(list, 'spark', mouthX, mouthY, mouthHalf * 0.3, 0.7);
        }

        if (tau >= SLAM) {
            // The slam: the table jumps, a burst goes up out of the top, then a steady
            // dumpster fire that dies down as it rolls away.
            if (!f.slammed) {
                f.slammed = true;
                arenaRef.current?.triggerCelebrationShake(SHAKE);
                for (let n = 0; n < 70 * k; n++) {
                    const p = spawn(list, 'fire', mouthX, mouthY, mouthHalf * 0.85, 1.2);
                    // Thrown well up, and lasting long enough to be seen to rise.
                    if (p) {
                        p.vy = rand(-1.5, -0.7);
                        p.life = rand(0.5, 0.85);
                    }
                }
                for (let n = 0; n < 45 * k; n++) spawn(list, 'spark', mouthX, mouthY, mouthHalf, 1.3);
                for (let n = 0; n < 16 * k; n++) spawn(list, 'smoke', mouthX, mouthY - 0.05, mouthHalf * 0.8, 2);
            }
            const fade = tau < INTRO ? 1 : 1 - clamp01((tau - INTRO) / OUTRO);
            emit(f.carry, 'bin-fire', 70 * k * fade, dt, () => spawn(list, 'fire', mouthX, mouthY, mouthHalf, 1.15));
            emit(f.carry, 'bin-smoke', 9 * k * fade, dt, () => spawn(list, 'smoke', mouthX, mouthY - 0.08, mouthHalf * 0.7, 1.3));
            emit(f.carry, 'bin-spark', 8 * k * fade, dt, () => spawn(list, 'spark', mouthX, mouthY, mouthHalf * 0.8));
        }

        // --- NANCY! catches, a letter at a time ---
        const root = rootRef.current;
        letterRefs.current.forEach((el, n) => {
            if (!el) return;
            const p = clamp01((tau - (TITLE_FIRST + n * TITLE_GAP)) / TITLE_S);
            if (p > 0 && !f.lit[n] && root) {
                f.lit[n] = true;
                const r = el.getBoundingClientRect();
                const o = root.getBoundingClientRect();
                const lx = (r.left + r.width / 2 - o.left) / h;
                const ly = (r.bottom - o.top) / h - 0.02;
                for (let q = 0; q < 10 * k; q++) spawn(list, 'fire', lx, ly, (r.width / h) * 0.4, 0.9);
                for (let q = 0; q < 4 * k; q++) spawn(list, 'spark', lx, ly, (r.width / h) * 0.3, 0.6);
            }
            el.style.opacity = Math.pow(p, 0.7).toFixed(3);
            el.style.filter = p < 1 ? `blur(${((1 - p) * 0.1).toFixed(3)}em) brightness(${(1 + 2.2 * (1 - p)).toFixed(2)})` : 'none';
            el.style.transform = `translateY(${((1 - p) * 0.22).toFixed(3)}em) scaleY(${(0.35 + 0.65 * easeOutBack(p)).toFixed(3)})`;
        });
        const sub = subtitleRef.current;
        if (sub) {
            const p = clamp01((tau - SUBTITLE_FROM) / SUBTITLE_S);
            sub.style.opacity = p.toFixed(3);
            sub.style.filter = p < 1 ? `blur(${((1 - p) * 4).toFixed(1)}px)` : 'none';
        }
        const title = titleRef.current;
        if (title) title.style.opacity = (1 - clamp01((tau - INTRO) / (OUTRO * 0.7))).toFixed(3);

        step(list, dt);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const scale = canvas.height;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            draw(ctx, list, f.sprites);
        }
    };

    const { reduced, started } = useCelebrationClock({
        cue: 'nancy',
        timing: TIMING,
        onStart: () => {
            arenaRef.current?.celebrate(cue.current);
        },
        onFrame,
        onFinish: () => arenaRef.current?.endCelebration(),
        onDone: onDismiss,
    });

    const fontSize = Math.max(20, Math.min(size.h * 0.22, size.w * 0.17));
    const showStill = reduced && started;
    const hidden = { opacity: 0 } as const;

    return (
        <div ref={rootRef} className="absolute inset-0">
            <span role="status" className="sr-only">
                {started ? 'Nancy! First roll fail!' : ''}
            </span>

            <style>{FLICKER_CSS}</style>

            {!reduced && (
                <>
                    {/* The far side of the dumpster: under the dice, so a die dropping in is
                        seen against the dark inside. */}
                    <svg
                        ref={backRef}
                        viewBox={`0 0 ${VB_W} ${VB_H}`}
                        className="absolute left-0 top-0 z-[6] overflow-visible"
                        style={{ width: 0, height: 0, transformOrigin: '50% 100%' }}
                        aria-hidden
                    >
                        <defs>
                            <linearGradient id={`${uid}-inside`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#0b0f0a" />
                                <stop offset="1" stopColor="#2a3426" />
                            </linearGradient>
                            <linearGradient id={`${uid}-lid-top`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#2c3828" />
                                <stop offset="1" stopColor="#3f4f39" />
                            </linearGradient>
                            <linearGradient id={`${uid}-lid-under`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#3a4834" />
                                <stop offset="1" stopColor="#1b2218" />
                            </linearGradient>
                        </defs>
                        <polygon points="18,24 222,24 224,31 16,31" fill="#768c6b" stroke="#2d3a29" strokeWidth="1.5" />
                        <polygon points="16,30 224,30 236,52 4,52" fill={`url(#${uid}-inside)`} />
                        <polygon ref={lidRef} points={lidPoints(100)} fill={`url(#${uid}-lid-under)`} stroke="#151b13" strokeWidth="2" strokeLinejoin="round" />
                        <polygon ref={lidEdgeRef} points="0,0" fill="#56684d" stroke="#151b13" strokeWidth="1.5" opacity="0" />
                        <line ref={lidLipRef} x1="0" y1="0" x2="0" y2="0" stroke="#5f7356" strokeWidth="3" strokeLinecap="round" />
                    </svg>

                    <canvas ref={canvasRef} className="absolute inset-0 z-20 h-full w-full" aria-hidden />

                    {/* The near side: over the dice, so a die is lost behind it as it drops. */}
                    <svg
                        ref={frontRef}
                        viewBox={`0 0 ${VB_W} ${VB_H}`}
                        className="absolute left-0 top-0 z-20 overflow-visible"
                        style={{ width: 0, height: 0, transformOrigin: '50% 100%' }}
                        aria-hidden
                    >
                        <defs>
                            <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#71896a" />
                                <stop offset="1" stopColor="#465a40" />
                            </linearGradient>
                            <linearGradient id={`${uid}-rib`} x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0" stopColor="#87a07d" />
                                <stop offset="0.6" stopColor="#6c8462" />
                                <stop offset="1" stopColor="#3e5038" />
                            </linearGradient>
                        </defs>

                        {/* Casters: swivel brackets and wheels, spokes turning as it rolls. */}
                        {WHEELS.map((x, i) => (
                            <g key={x}>
                                <polygon points={`${x - 11},158 ${x + 11},158 ${x + 6},${WHEEL_Y} ${x - 6},${WHEEL_Y}`} fill="#2b302a" />
                                <circle cx={x} cy={WHEEL_Y} r={WHEEL_R} fill="#1a1a1a" stroke="#3a3a3a" strokeWidth="2" />
                                <g ref={(el) => { spokeRefs.current[i] = el; }}>
                                    <line x1={x - 8} y1={WHEEL_Y} x2={x + 8} y2={WHEEL_Y} stroke="#5a5a5a" strokeWidth="2" />
                                    <line x1={x} y1={WHEEL_Y - 8} x2={x} y2={WHEEL_Y + 8} stroke="#5a5a5a" strokeWidth="2" />
                                </g>
                                <circle cx={x} cy={WHEEL_Y} r="4" fill="#9a9f95" />
                            </g>
                        ))}

                        {/* Body: tapering to the base, with stiffening ribs and a band. */}
                        <polygon points="12,56 228,56 210,162 30,162" fill={`url(#${uid}-body)`} stroke="#2d3a29" strokeWidth="2" strokeLinejoin="round" />
                        {[74, 120, 166].map((x) => (
                            <polygon key={x} points={`${x - 8},62 ${x + 8},62 ${x + 6},156 ${x - 6},156`} fill={`url(#${uid}-rib)`} opacity="0.85" />
                        ))}
                        <rect x="24" y="116" width="192" height="9" rx="2" fill="#5a6f50" stroke="#33422e" strokeWidth="1" />
                        <line x1="25" y1="117" x2="215" y2="117" stroke="#90a786" strokeWidth="1" opacity="0.7" />

                        {/* A dent, a few scrapes and some rust: it has had a life. */}
                        <path d="M134,84 l14,-5 l12,6 l9,-2 l4,11 l-6,9 l-15,4 l-12,-4 l-8,-9z" fill="#55693f" opacity="0.55" />
                        <path d="M135,85 l13,-5 l12,6 l9,-2" stroke="#33422d" strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                        <path d="M140,103 l12,4 l15,-4 l6,-9" stroke="#a9be9b" strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
                        <path d="M148,79 l3,9 l9,4" stroke="#3a4a33" strokeWidth="1" fill="none" opacity="0.7" />
                        <path d="M44,76 l22,9 M48,82 l12,5 M182,138 l18,-6" stroke="#9cb090" strokeWidth="1.2" opacity="0.6" strokeLinecap="round" />
                        <circle cx="58" cy="144" r="3.5" fill="#7a4a26" opacity="0.75" />
                        <circle cx="64" cy="150" r="2" fill="#7a4a26" opacity="0.6" />
                        <circle cx="199" cy="70" r="2.5" fill="#7a4a26" opacity="0.6" />

                        {/* The front rim's lip, which the dice drop behind. */}
                        <rect x="6" y={RIM_Y - 2} width="228" height="12" rx="3" fill="#86a079" stroke="#2d3a29" strokeWidth="2" />
                        <line x1="10" y1={RIM_Y + 1} x2="230" y2={RIM_Y + 1} stroke="#b5c9a9" strokeWidth="1.2" opacity="0.7" />
                    </svg>
                </>
            )}

            {/* The fire lettering, over everything on the felt. */}
            {size.h > 0 && (
                <div
                    className="absolute inset-x-0 z-20 flex flex-col items-center select-none"
                    style={{ top: size.h * TITLE_Y - fontSize * 0.6 }}
                >
                    <div
                        ref={titleRef}
                        aria-hidden
                        className="flex flex-col items-center"
                        style={{
                            opacity: reduced && !started ? 0 : 1,
                            filter: 'drop-shadow(0 0 0.05em rgba(255,150,0,0.95)) drop-shadow(0 0 0.3em rgba(255,60,0,0.55)) drop-shadow(0 2px 2px rgba(0,0,0,0.6))',
                            fontSize,
                        }}
                    >
                        <div
                            className="flex font-black uppercase leading-none tracking-wider"
                            style={{ animation: reduced ? undefined : 'nancy-flicker 0.9s steps(8, jump-none) infinite' }}
                        >
                            {LETTERS.map((ch, n) => (
                                <span
                                    key={n}
                                    ref={(el) => {
                                        letterRefs.current[n] = el;
                                    }}
                                    aria-hidden
                                    className="inline-block bg-clip-text text-transparent will-change-transform"
                                    style={{
                                        backgroundImage: FIRE_GRADIENT,
                                        backgroundSize: '100% 220%',
                                        backgroundPosition: '50% 0%',
                                        transformOrigin: '50% 100%',
                                        animation: reduced ? undefined : `nancy-burn ${1.1 + n * 0.13}s ease-in-out infinite`,
                                        ...(showStill ? {} : hidden),
                                    }}
                                >
                                    {ch}
                                </span>
                            ))}
                        </div>
                        <div
                            ref={subtitleRef}
                            aria-hidden
                            className="mt-[0.18em] font-bold italic tracking-wide"
                            style={{
                                fontSize: '0.3em',
                                color: '#fff3d6',
                                textShadow: '0 0 0.3em rgba(255,120,0,0.9), 0 1px 2px rgba(0,0,0,0.7)',
                                ...(showStill ? {} : hidden),
                            }}
                        >
                            First roll fail!
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

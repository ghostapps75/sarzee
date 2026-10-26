// components/BoardStage.tsx
'use client';

import React, { useCallback, useRef } from 'react';
import DiceArena, { DiceArenaHandle } from './DiceArena';
import { BoardDefinition, BoardTheme, traySlots } from '@/lib/boards';
import { BoardFit, Inset, PxRect, useBoardLayout } from '@/lib/useBoardLayout';

interface BoardStageProps {
    board: BoardDefinition;
    fit: BoardFit;
    /** Safe area to centre the board in, so it stays clear of the scorecard rail. */
    inset?: Inset;
    arenaRef: React.Ref<DiceArenaHandle>;
    heldDice: boolean[];
    onDieClick: (index: number) => void;
    canInteract: boolean;
    diceColor: string;
    onTurnComplete: (results: number[]) => void;
    onImpact?: () => void;
    /** Current engine dice, so a remount restores the visible faces. */
    values?: number[];
    lowPower: boolean;
    showDebugNumbers?: boolean;
    /** Draws the projected felt, tray, plate and arena rects, for checking alignment. */
    debugRects?: boolean;
    onRoll: () => void;
    rollDisabled: boolean;
    /** Lights that many of the right tray's slots. */
    rollsLeft: number;
    /** Renders the HUD, given the board's title plate in stage pixels. */
    hud?: (titlePlate: PxRect) => React.ReactNode;
    /**
     * Drawn on the felt, clipped to it, and moving with the table when it shakes. Its box
     * has no z-index of its own, so content can sit under the dice (z below 10) or over
     * them (above 10).
     */
    feltOverlay?: React.ReactNode;
    children?: React.ReactNode;
}

/** Rolls a turn starts with, and so the number of lamps in the right tray. */
const ROLLS_PER_TURN = 3;
/** The tray has five slots; the lamps take the middle three so the column stays balanced. */
const TRAY_SLOTS = 5;
const FIRST_LAMP_SLOT = 1;

/**
 * The ROLL button's face, drawn in CSS from the board's theme so it belongs to every board
 * (the old shared PNG was copper and blue on the lava, the nebula and the forest alike).
 * Sized from the plate it sits in, so it stays crisp and in proportion at any size.
 */
function rollFaceStyle(theme: BoardTheme, plate: PxRect): React.CSSProperties {
    const h = Math.min(plate.height * 0.7, plate.width * 0.26);
    const w = Math.min(plate.width * 0.86, h * 3.8);
    return {
        width: w,
        height: h,
        borderRadius: h * 0.3,
        border: `${Math.max(1.5, h * 0.045).toFixed(1)}px solid ${theme.border}`,
        background: `linear-gradient(to bottom, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
        color: theme.buttonText,
        fontSize: h * 0.46,
        letterSpacing: '0.2em',
        // A raised bevel, a drop onto the plate, and a faint glow in the board's focus colour.
        boxShadow: [
            `inset 0 ${(h * 0.06).toFixed(1)}px 0 rgba(255,255,255,0.22)`,
            `inset 0 -${(h * 0.08).toFixed(1)}px 0 rgba(0,0,0,0.3)`,
            `0 ${(h * 0.12).toFixed(1)}px ${(h * 0.3).toFixed(1)}px rgba(0,0,0,0.55)`,
            `0 0 ${(h * 0.4).toFixed(1)}px ${theme.focusRing}`,
        ].join(', '),
    };
}

/** One lamp in the right tray: a lit gem in the board's accent colour, or a dark socket. */
function lampStyle(theme: BoardTheme, slot: PxRect, lit: boolean): React.CSSProperties {
    const size = Math.min(slot.width, slot.height) * 0.6;
    return {
        position: 'absolute',
        left: slot.left + (slot.width - size) / 2,
        top: slot.top + (slot.height - size) / 2,
        width: size,
        height: size,
        borderRadius: size * 0.28,
        transition: 'background 400ms ease, box-shadow 400ms ease, opacity 400ms ease',
        ...(lit
            ? {
                  background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85) 0%, ${theme.accent} 38%, ${theme.accentHover} 100%)`,
                  boxShadow: `0 0 ${(size * 0.55).toFixed(1)}px ${theme.accent}, inset 0 -${(size * 0.1).toFixed(1)}px ${(size * 0.2).toFixed(1)}px rgba(0,0,0,0.35)`,
                  opacity: 1,
              }
            : {
                  background: 'rgba(0,0,0,0.5)',
                  boxShadow: `inset 0 ${(size * 0.1).toFixed(1)}px ${(size * 0.25).toFixed(1)}px rgba(0,0,0,0.6), 0 0 0 1px ${theme.borderAlpha}`,
                  opacity: 0.8,
              }),
    };
}

/**
 * The table takes the hit: a short downward jolt of the whole stage when the first die
 * lands. It is done to the DOM rather than to the camera because the artwork is a static
 * image behind the transparent canvas — shaking only the camera moved the dice against a
 * board that stood still, which made parked held dice tremble in their tray.
 */
const THUMP_KEYFRAMES: Keyframe[] = [
    { transform: 'translate3d(0, 0, 0)' },
    { transform: 'translate3d(0, 3px, 0)', offset: 0.35 },
    { transform: 'translate3d(0, -1px, 0)', offset: 0.7 },
    { transform: 'translate3d(0, 0, 0)' },
];
const THUMP_MS = 190;

/**
 * A celebration rattles the table: a burst of jolts in fixed directions that die away,
 * scaled by intensity. Fixed rather than random so it looks the same every time and can
 * be tuned by eye.
 */
const RATTLE_STEPS: Array<[number, number]> = [
    [1, 0.4], [-0.8, -0.6], [0.5, -0.9], [-0.9, 0.3], [0.7, 0.8], [-0.4, -1],
    [0.9, -0.2], [-0.6, 0.7], [0.3, -0.5], [-0.5, 0.2], [0.4, 0.4], [-0.2, -0.3], [0, 0],
];
/** Pixels of throw per unit of intensity, before the decay. */
const RATTLE_PX = 4;
const RATTLE_MS = 800;

function rattleKeyframes(intensity: number): Keyframe[] {
    const amp = intensity * RATTLE_PX;
    return RATTLE_STEPS.map(([x, y], i) => {
        const decay = Math.exp(-i * 0.28);
        return { transform: `translate3d(${(x * amp * decay).toFixed(1)}px, ${(y * amp * decay).toFixed(1)}px, 0)` };
    });
}

/**
 * Paints the board and places everything that lives *on* it.
 *
 * Every child is positioned by projecting a rect defined in board-image coordinates
 * (lib/boards.ts) through the layout transform, so the dice arena lands exactly on the
 * felt and the ROLL button lands exactly in its recess — at any window size, on any
 * board, without a single hardcoded percentage.
 */
export default function BoardStage({
    board,
    fit,
    inset,
    arenaRef,
    heldDice,
    onDieClick,
    canInteract,
    diceColor,
    onTurnComplete,
    onImpact,
    values,
    lowPower,
    showDebugNumbers = false,
    debugRects = false,
    onRoll,
    rollDisabled,
    rollsLeft,
    hud,
    feltOverlay,
    children,
}: BoardStageProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const layout = useBoardLayout(hostRef, board, { fit, inset });
    /**
     * The layer that actually gets shaken: the artwork, the dice canvas and ROLL.
     *
     * Deliberately not the host. A transform makes an element the containing block for
     * `position: fixed` descendants, so animating the host would re-anchor any fixed child
     * to the board and drag it along. It also keeps the transform off the element
     * `useBoardLayout` measures.
     */
    const stageRef = useRef<HTMLDivElement>(null);

    const handleImpact = useCallback(() => {
        // Artwork, felt, dice and ROLL move together, so a die parked in the tray stays
        // parked in the tray.
        stageRef.current?.animate?.(THUMP_KEYFRAMES, { duration: THUMP_MS, easing: 'ease-out' });
        onImpact?.();
    }, [onImpact]);

    const handleCelebrationShake = useCallback((intensity: number) => {
        stageRef.current?.animate?.(rattleKeyframes(intensity), { duration: RATTLE_MS, easing: 'linear' });
    }, []);

    // The 3D layer covers more than the felt so held dice can sit in the side trays.
    const arena = layout.projectStyle(board.arena);
    const felt = layout.projectStyle(board.felt);
    const rollPlate = layout.projectStyle(board.rollPlate);
    const titlePlate = layout.project(board.titlePlate);
    const lampSlots = traySlots(board.rollsTray, TRAY_SLOTS)
        .slice(FIRST_LAMP_SLOT, FIRST_LAMP_SLOT + ROLLS_PER_TURN)
        .map(layout.project);
    const vignette = board.feltVignette ?? 0;

    return (
        <div
            ref={hostRef}
            className="absolute inset-0 overflow-hidden"
            style={
                {
                    backgroundColor: board.theme.bg,
                    // For overlays passed in as children that want to sit relative to the felt.
                    '--felt-top': `${felt.top}px`,
                    '--felt-cx': `${felt.left + felt.width / 2}px`,
                } as React.CSSProperties
            }
        >
            {layout.ready && (
                <>
                    <div ref={stageRef} className="absolute inset-0" style={layout.backgroundStyle}>
                        {/* Quiets an illustrated felt under the dice: darkest in the middle,
                            nothing at the edges, so there is no visible box. */}
                        {vignette > 0 && (
                            <div
                                className="z-[5] pointer-events-none"
                                style={{
                                    ...felt,
                                    background: `radial-gradient(ellipse closest-side, rgba(0,0,0,${vignette}) 0%, rgba(0,0,0,${(vignette * 0.85).toFixed(3)}) 45%, rgba(0,0,0,0) 100%)`,
                                }}
                            />
                        )}

                        {/* Rolls left, lit in the right-hand tray. They go dark from the top
                            as rolls are spent. Under the dice canvas, which is transparent.
                            Decorative: the HUD carries the count for screen readers. */}
                        {lampSlots.map((slot, i) => (
                            <div
                                key={i}
                                aria-hidden
                                className="z-[5] pointer-events-none"
                                style={lampStyle(board.theme, slot, i >= ROLLS_PER_TURN - rollsLeft)}
                            />
                        ))}

                        {/* Spans the felt plus both trays; the dice themselves stay on the felt. */}
                        <div className="z-10" style={arena}>
                            <DiceArena
                                ref={arenaRef}
                                onTurnComplete={onTurnComplete}
                                onImpact={handleImpact}
                                onCelebrationShake={handleCelebrationShake}
                                values={values}
                                heldDice={heldDice}
                                onDieClick={onDieClick}
                                canInteract={canInteract}
                                diceColor={diceColor}
                                showDebugNumbers={showDebugNumbers}
                                lowPower={lowPower}
                                boardId={board.id}
                            />
                        </div>

                        {/* ROLL, sitting in the recessed plate the artwork already provides.
                            The whole plate is the tap target; the face is centred inside it. */}
                        <button
                            onClick={onRoll}
                            disabled={rollDisabled}
                            aria-label="Roll the dice"
                            className="z-30 flex items-center justify-center active:scale-95 enabled:hover:brightness-115 transition-[transform,filter] disabled:opacity-45 disabled:grayscale disabled:cursor-not-allowed cursor-pointer bg-transparent border-0 p-0 select-none"
                            style={rollPlate}
                        >
                            <span
                                className="flex items-center justify-center font-black uppercase leading-none"
                                style={rollFaceStyle(board.theme, rollPlate)}
                            >
                                {/* Letter-spacing pads the right of the last letter; this evens it. */}
                                <span style={{ marginRight: '-0.2em' }}>Roll</span>
                            </span>
                        </button>

                        {feltOverlay && (
                            <div className="pointer-events-none overflow-hidden" style={felt}>
                                {feltOverlay}
                            </div>
                        )}

                        {hud?.(titlePlate)}

                        {debugRects && (
                            <>
                                <div className="z-[999] pointer-events-none border-2 border-emerald-400" style={felt} />
                                <div className="z-[999] pointer-events-none border-2 border-yellow-400 border-dashed" style={arena} />
                                {traySlots(board.heldTray, TRAY_SLOTS).map((slot, i) => (
                                    <div key={`held-${i}`} className="z-[999] pointer-events-none border-2 border-fuchsia-500" style={layout.projectStyle(slot)} />
                                ))}
                                {traySlots(board.rollsTray, TRAY_SLOTS).map((slot, i) => (
                                    <div key={`rolls-${i}`} className="z-[999] pointer-events-none border-2 border-orange-400" style={layout.projectStyle(slot)} />
                                ))}
                                <div className="z-[999] pointer-events-none border-2 border-sky-400" style={rollPlate} />
                                <div className="z-[999] pointer-events-none border-2 border-red-500" style={layout.projectStyle(board.titlePlate)} />
                            </>
                        )}
                    </div>

                    {/* Outside the shaken layer, so a `fixed` child stays anchored to the window
                        rather than to a transformed ancestor. */}
                    {children}
                </>
            )}
        </div>
    );
}

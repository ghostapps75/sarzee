// components/BoardStage.tsx
'use client';

import React, { useCallback, useRef } from 'react';
import DiceArena, { DiceArenaHandle } from './DiceArena';
import { BoardDefinition } from '@/lib/boards';
import { BoardFit, Inset, useBoardLayout } from '@/lib/useBoardLayout';

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
    /** Draws the projected felt and roll-plate rects, for checking alignment. */
    debugRects?: boolean;
    onRoll: () => void;
    rollDisabled: boolean;
    children?: React.ReactNode;
}

/**
 * roll_button.PNG is 1536x1024 but the drawn button only occupies the middle of it —
 * the rest is transparent padding. These are the measured bounds of the opaque pixels,
 * so the artwork can be sized by its *visible* extent rather than its canvas.
 */
const ROLL_ART = { fx: 0.2161, fy: 0.3379, fw: 0.5716, fh: 0.2959, aspect: 1536 / 1024 };
/** How much of the plate's height the drawn button should occupy. */
const ROLL_ART_FILL = 0.92;

function rollArtStyle(plateW: number, plateH: number): React.CSSProperties {
    const artH = plateH * ROLL_ART_FILL;
    // Also cap by width so a short, wide plate never overflows.
    const byWidth = (plateW * 0.96) / ROLL_ART.fw;
    const imgW = Math.min(artH / ROLL_ART.fh, byWidth / ROLL_ART.aspect) * ROLL_ART.aspect;
    const imgH = imgW / ROLL_ART.aspect;
    return {
        width: imgW,
        height: imgH,
        left: plateW / 2 - (ROLL_ART.fx + ROLL_ART.fw / 2) * imgW,
        top: plateH / 2 - (ROLL_ART.fy + ROLL_ART.fh / 2) * imgH,
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
    children,
}: BoardStageProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const layout = useBoardLayout(hostRef, board, { fit, inset });
    /**
     * The layer that actually gets shaken: the artwork, the dice canvas and ROLL.
     *
     * Deliberately not the host. A transform makes an element the containing block for
     * `position: fixed` descendants, and the celebration overlays are fixed and full-screen
     * — animating the host would shrink them to the board and drag them along with it. It
     * also keeps the transform off the element `useBoardLayout` measures.
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
    const rollPlate = layout.projectStyle(board.rollPlate);

    return (
        <div ref={hostRef} className="absolute inset-0 overflow-hidden" style={{ backgroundColor: board.theme.bg }}>
            {layout.ready && (
                <>
                    <div ref={stageRef} className="absolute inset-0" style={layout.backgroundStyle}>
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
                            The whole plate is the tap target; the artwork is centred inside it. */}
                        <button
                            onClick={onRoll}
                            disabled={rollDisabled}
                            aria-label="Roll the dice"
                            className="z-30 overflow-hidden active:scale-95 transition-transform disabled:opacity-45 disabled:grayscale disabled:cursor-not-allowed cursor-pointer bg-transparent border-0 p-0"
                            style={rollPlate}
                        >
                            <img
                                src="/assets/roll_button.PNG"
                                alt="ROLL"
                                draggable={false}
                                className="absolute max-w-none select-none drop-shadow-xl"
                                style={rollArtStyle(rollPlate.width, rollPlate.height)}
                            />
                        </button>

                        {debugRects && (
                            <>
                                <div className="z-[999] pointer-events-none border-2 border-emerald-400" style={layout.projectStyle(board.felt)} />
                                <div className="z-[999] pointer-events-none border-2 border-yellow-400 border-dashed" style={arena} />
                                <div className="z-[999] pointer-events-none border-2 border-fuchsia-500" style={layout.projectStyle(board.heldTray)} />
                                <div className="z-[999] pointer-events-none border-2 border-sky-400" style={rollPlate} />
                            </>
                        )}
                    </div>

                    {/* Outside the shaken layer: the celebrations are full-screen `fixed`
                        overlays, which a transformed ancestor would re-anchor to the board. */}
                    {children}
                </>
            )}
        </div>
    );
}

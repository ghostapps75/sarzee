// components/BoardStage.tsx
'use client';

import React, { useRef } from 'react';
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

    // The 3D layer covers more than the felt so held dice can sit in the side trays.
    const arena = layout.projectStyle(board.arena);
    const rollPlate = layout.projectStyle(board.rollPlate);

    return (
        <div
            ref={hostRef}
            className="absolute inset-0 overflow-hidden"
            style={{ backgroundColor: board.theme.bg, ...layout.backgroundStyle }}
        >
            {layout.ready && (
                <>
                    {/* Spans the felt plus both trays; the dice themselves stay on the felt. */}
                    <div className="z-10" style={arena}>
                        <DiceArena
                            ref={arenaRef}
                            onTurnComplete={onTurnComplete}
                            onImpact={onImpact}
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

                    {children}
                </>
            )}
        </div>
    );
}

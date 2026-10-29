// components/GameHud.tsx
'use client';

import React from 'react';
import { PlayerType } from '@/lib/useSarzeeGame';
import { BoardTheme } from '@/lib/boards';
import { PxRect } from '@/lib/useBoardLayout';
import { useSoundMuted } from '@/lib/useGameSounds';

interface GameHudProps {
    playerName: string;
    playerType: PlayerType;
    playerColor: string;
    rollsLeft: number;
    /** Nobody is on turn: the player line reads "Game over" instead. */
    gameOver?: boolean;
    theme: BoardTheme;
    /** The board's title plate, projected into stage pixels. The HUD lives in it when it fits. */
    plate: PxRect;
    compact: boolean;
    /** Keeps the fallback strip inside the board area rather than under the scorecard rail. */
    rightInset?: number;
    onShowRules: () => void;
    onShowStats: () => void;
    onLeave: () => void;
}

/** The sound switch, read once here and handed to whichever layout is drawn. */
interface SoundProps {
    muted: boolean;
    onToggleSound: () => void;
}

type LayoutProps = GameHudProps & SoundProps;

const soundLabel = (muted: boolean) => (muted ? 'Unmute sounds' : 'Mute sounds');
const soundIcon = (muted: boolean) => (muted ? '🔇' : '🔊');

/** Below this the plate cannot hold a tappable row, so the HUD floats as a strip instead. */
const MIN_PLATE_HEIGHT = 40;
/** Plates this tall get two rows: who is up, then labelled buttons. */
const ROOMY_PLATE_HEIGHT = 72;
const ROOMY_PLATE_WIDTH = 280;
/** Narrower than this, the tight row drops the rolls count — the right tray still shows it. */
const TIGHT_ROLLS_WIDTH = 240;

const GAME_OVER = 'Game over';

function cpuLabel(type: PlayerType): string | null {
    switch (type) {
        case 'SAFE_SAM': return 'Sam (AI)';
        case 'RISK_TAKING_ROSIE': return 'Rosie (AI)';
        case 'BALANCED_BOBBY': return 'Bobby (AI)';
        default: return null;
    }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Who is up, plus Rules / Stats / Sound / Leave.
 *
 * It sits inside the recessed title plate the artwork already provides, themed with the
 * board's colours, so it reads as part of the board instead of floating over it. On a
 * screen where the plate is too small to tap, it falls back to a compact strip.
 */
export default function GameHud(props: GameHudProps) {
    const [muted, setMuted] = useSoundMuted();
    const sound: SoundProps = { muted, onToggleSound: () => setMuted(!muted) };
    return props.plate.height >= MIN_PLATE_HEIGHT ? <PlateHud {...props} {...sound} /> : <StripHud {...props} {...sound} />;
}

function PlateHud({
    playerName,
    playerType,
    playerColor,
    rollsLeft,
    gameOver = false,
    theme,
    plate,
    onShowRules,
    onShowStats,
    onLeave,
    muted,
    onToggleSound,
}: LayoutProps) {
    const ai = gameOver ? null : cpuLabel(playerType);

    // Inset so the plate's own rim still frames the panel.
    const inset = Math.round(plate.height * 0.08);
    const width = plate.width - inset * 2;
    const height = plate.height - inset * 2;
    const roomy = plate.height >= ROOMY_PLATE_HEIGHT && plate.width >= ROOMY_PLATE_WIDTH;
    const pad = Math.round(clamp(height * 0.1, 3, 12));
    const gap = Math.round(clamp(height * 0.08, 3, 10));
    const rowH = roomy ? (height - pad * 2 - gap) / 2 : height - pad * 2;

    const nameSize = clamp(rowH * (roomy ? 0.52 : 0.38), 11, 22);
    const labelSize = clamp(rowH * 0.3, 8, 12);
    const buttonText = clamp(rowH * 0.36, 10, 15);
    // In the single row the icon buttons are a little narrower than tall, which is what
    // leaves room for a name on a phone-sized plate beside all four of them.
    const iconW = rowH * 0.66;

    const themedButton: React.CSSProperties = {
        background: `linear-gradient(to bottom, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
        color: theme.buttonText,
        border: `1px solid ${theme.buttonBorderHover}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 6px rgba(0,0,0,0.4)',
        borderRadius: rowH * 0.28,
        outlineColor: theme.focus,
    };
    const ghostButton: React.CSSProperties = {
        background: 'transparent',
        color: theme.placeholder,
        border: `1px solid ${theme.borderAlpha}`,
        borderRadius: rowH * 0.28,
        outlineColor: theme.focus,
    };
    const buttonClass =
        'flex items-center justify-center gap-1.5 font-bold uppercase tracking-wider cursor-pointer transition-[filter,transform] hover:brightness-125 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 shrink-0';

    const who = (
        <div className="flex items-center min-w-0" style={{ gap: gap }}>
            {!gameOver && (
                <span
                    className="rounded-full animate-pulse shrink-0 ring-1 ring-white/40"
                    style={{ backgroundColor: playerColor, width: nameSize * 0.6, height: nameSize * 0.6 }}
                />
            )}
            <span className="font-black truncate leading-none" style={{ fontSize: nameSize, color: theme.text }}>
                {gameOver ? GAME_OVER : playerName}
            </span>
            {ai && (
                <span
                    className="px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider shrink-0 leading-none"
                    style={{
                        fontSize: labelSize,
                        color: theme.accent,
                        backgroundColor: `${theme.accent}22`,
                        border: `1px solid ${theme.accent}55`,
                    }}
                >
                    {roomy ? ai : 'AI'}
                </span>
            )}
        </div>
    );

    const rolls = (
        <div className="flex items-baseline shrink-0 leading-none" style={{ gap: gap * 0.6 }}>
            <span className="uppercase tracking-widest font-bold" style={{ fontSize: labelSize, color: theme.placeholder }}>
                Rolls
            </span>
            <span className="font-black tabular-nums" style={{ fontSize: nameSize, color: theme.text }}>
                {rollsLeft}
            </span>
        </div>
    );

    return (
        <div
            className="z-[35] flex flex-col backdrop-blur-sm"
            style={{
                position: 'absolute',
                left: plate.left + inset,
                top: plate.top + inset,
                width,
                height,
                padding: pad,
                gap,
                background: theme.containerBg,
                border: `1px solid ${theme.borderAlpha}`,
                borderRadius: clamp(height * 0.16, 6, 18),
                // Sunk into the plate rather than sitting on it.
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.08)',
            }}
        >
            {roomy ? (
                <>
                    <div className="flex items-center justify-between min-w-0" style={{ height: rowH, gap }}>
                        {who}
                        {rolls}
                    </div>
                    <div className="flex items-stretch" style={{ height: rowH, gap }}>
                        <button onClick={onShowRules} aria-label="How to play" className={`${buttonClass} flex-1`} style={{ ...themedButton, fontSize: buttonText }}>
                            <span aria-hidden>📜</span>
                            <span>Rules</span>
                        </button>
                        <button onClick={onShowStats} aria-label="Statistics" className={`${buttonClass} flex-1`} style={{ ...themedButton, fontSize: buttonText }}>
                            <span aria-hidden>📊</span>
                            <span>Stats</span>
                        </button>
                        {/* Icon only, so the three labelled buttons keep their room. */}
                        <button onClick={onToggleSound} aria-label={soundLabel(muted)} title={soundLabel(muted)} className={buttonClass} style={{ ...themedButton, width: rowH, fontSize: buttonText * 1.1 }}>
                            <span aria-hidden>{soundIcon(muted)}</span>
                        </button>
                        <button onClick={onLeave} aria-label="Leave game" className={`${buttonClass} flex-1`} style={{ ...ghostButton, fontSize: buttonText }}>
                            Leave
                        </button>
                    </div>
                </>
            ) : (
                <div className="flex items-center min-w-0" style={{ height: rowH, gap }}>
                    <div className="flex-1 min-w-0">{who}</div>
                    {width >= TIGHT_ROLLS_WIDTH ? rolls : <span className="sr-only">{rollsLeft} rolls left</span>}
                    <button onClick={onShowRules} aria-label="How to play" className={buttonClass} style={{ ...themedButton, width: iconW, height: rowH, fontSize: rowH * 0.42 }}>
                        <span aria-hidden>📜</span>
                    </button>
                    <button onClick={onShowStats} aria-label="Statistics" className={buttonClass} style={{ ...themedButton, width: iconW, height: rowH, fontSize: rowH * 0.42 }}>
                        <span aria-hidden>📊</span>
                    </button>
                    <button onClick={onToggleSound} aria-label={soundLabel(muted)} title={soundLabel(muted)} className={buttonClass} style={{ ...themedButton, width: iconW, height: rowH, fontSize: rowH * 0.42 }}>
                        <span aria-hidden>{soundIcon(muted)}</span>
                    </button>
                    <button onClick={onLeave} aria-label="Leave game" className={buttonClass} style={{ ...ghostButton, width: iconW, height: rowH, fontSize: rowH * 0.4 }}>
                        <span aria-hidden>✕</span>
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Floating status + menu strip, for when the plate is too small to hold the HUD. In
 * compact mode everything shrinks to icons so it fits a 360px-wide phone without the
 * buttons sliding off the edge.
 */
function StripHud({
    playerName,
    playerType,
    playerColor,
    rollsLeft,
    gameOver = false,
    compact,
    rightInset = 0,
    onShowRules,
    onShowStats,
    onLeave,
    muted,
    onToggleSound,
}: LayoutProps) {
    const ai = gameOver ? null : cpuLabel(playerType);
    const panel = 'backdrop-blur-md bg-black/60 border border-white/10 shadow-xl rounded-2xl';
    const btn =
        'pointer-events-auto backdrop-blur-md bg-black/60 border border-white/10 hover:border-white/25 text-white rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center';

    return (
        <div
            className={`absolute z-[70] flex items-center justify-between gap-2 pointer-events-none ${
                compact ? 'top-2 left-2' : 'top-4 left-4'
            }`}
            style={{ right: (compact ? 8 : 16) + rightInset }}
        >
            <div
                className={`pointer-events-auto ${panel} flex items-center min-w-0 ${
                    compact ? 'px-3 py-1.5 gap-2.5' : 'px-6 py-3 gap-4'
                }`}
            >
                <div className="flex flex-col min-w-0">
                    {!compact && !gameOver && (
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                            Active Player
                        </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        {!gameOver && (
                            <span
                                className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ring-1 ring-white/30"
                                style={{ backgroundColor: playerColor }}
                            />
                        )}
                        <span
                            className={`font-black text-white truncate ${compact ? 'text-sm' : 'text-base'}`}
                        >
                            {gameOver ? GAME_OVER : playerName}
                        </span>
                        {ai && (
                            <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 font-extrabold text-[9px] border border-yellow-500/30 uppercase tracking-wider shrink-0">
                                {compact ? 'AI' : ai}
                            </span>
                        )}
                    </div>
                </div>

                <div className="w-px h-7 bg-white/10 shrink-0" />

                <div className="flex flex-col items-center shrink-0">
                    <span
                        className={`text-gray-400 uppercase tracking-widest font-bold ${
                            compact ? 'text-[8px] leading-none' : 'text-[10px]'
                        }`}
                    >
                        Rolls
                    </span>
                    <span className={`font-black text-white ${compact ? 'text-sm leading-tight' : 'text-base mt-0.5'}`}>
                        {rollsLeft}
                    </span>
                </div>
            </div>

            <div className={`pointer-events-auto flex items-center shrink-0 ${compact ? 'gap-1.5' : 'gap-3'}`}>
                <button
                    onClick={onShowRules}
                    aria-label="How to play"
                    className={`${btn} ${compact ? 'w-10 h-10 text-base' : 'px-5 py-3 gap-2 font-bold text-xs uppercase tracking-wider'}`}
                >
                    <span aria-hidden>📜</span>
                    {!compact && <span>Rules</span>}
                </button>
                <button
                    onClick={onShowStats}
                    aria-label="Statistics"
                    className={`${btn} ${compact ? 'w-10 h-10 text-base' : 'px-5 py-3 gap-2 font-bold text-xs uppercase tracking-wider'}`}
                >
                    <span aria-hidden>📊</span>
                    {!compact && <span>Stats</span>}
                </button>
                <button
                    onClick={onToggleSound}
                    aria-label={soundLabel(muted)}
                    title={soundLabel(muted)}
                    className={`${btn} ${compact ? 'w-10 h-10 text-base' : 'px-4 py-3 text-xs'}`}
                >
                    <span aria-hidden>{soundIcon(muted)}</span>
                </button>
                <button
                    onClick={onLeave}
                    aria-label="Leave game"
                    className={`pointer-events-auto backdrop-blur-md bg-red-950/50 border border-red-500/25 hover:border-red-500/50 text-red-300 rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                        compact ? 'w-10 h-10 text-base' : 'px-5 py-3 font-bold text-xs uppercase tracking-wider'
                    }`}
                >
                    {compact ? <span aria-hidden>✕</span> : 'Leave'}
                </button>
            </div>
        </div>
    );
}

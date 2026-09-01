// components/GameHud.tsx
'use client';

import React from 'react';
import { PlayerType } from '@/lib/useSarzeeGame';

interface GameHudProps {
    playerName: string;
    playerType: PlayerType;
    playerColor: string;
    rollsLeft: number;
    compact: boolean;
    /** Keeps the HUD inside the board area rather than under the scorecard rail. */
    rightInset?: number;
    onShowRules: () => void;
    onShowStats: () => void;
    onLeave: () => void;
}

function cpuLabel(type: PlayerType): string | null {
    switch (type) {
        case 'SAFE_SAM': return 'Sam (AI)';
        case 'RISK_TAKING_ROSIE': return 'Rosie (AI)';
        case 'BALANCED_BOBBY': return 'Bobby (AI)';
        default: return null;
    }
}

/**
 * Floating status + menu strip. In compact mode everything shrinks to icons so it fits
 * a 360px-wide phone without the buttons sliding off the edge.
 */
export default function GameHud({
    playerName,
    playerType,
    playerColor,
    rollsLeft,
    compact,
    rightInset = 0,
    onShowRules,
    onShowStats,
    onLeave,
}: GameHudProps) {
    const ai = cpuLabel(playerType);
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
                    {!compact && (
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                            Active Player
                        </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        <span
                            className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ring-1 ring-white/30"
                            style={{ backgroundColor: playerColor }}
                        />
                        <span
                            className={`font-black text-white truncate ${compact ? 'text-sm' : 'text-base'}`}
                        >
                            {playerName}
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

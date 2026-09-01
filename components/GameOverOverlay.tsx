// components/GameOverOverlay.tsx
'use client';

import React, { useMemo } from 'react';

interface GameOverOverlayProps {
    playerNames: string[];
    totals: number[];
    compact: boolean;
    onNewGame: () => void;
    onDownload: () => void;
}

/**
 * Final standings.
 *
 * This is a hot-seat game — there is no single "you" — so it announces the winner by
 * name rather than ranking whoever happened to be next in the rotation.
 */
export default function GameOverOverlay({
    playerNames,
    totals,
    compact,
    onNewGame,
    onDownload,
}: GameOverOverlayProps) {
    const ranked = useMemo(
        () =>
            totals
                .map((score, index) => ({ index, name: playerNames[index] || `Player ${index + 1}`, score }))
                .sort((a, b) => b.score - a.score),
        [totals, playerNames]
    );

    if (!ranked.length) return null;

    const top = ranked[0];
    const isDraw = ranked.length > 1 && ranked[1].score === top.score;
    const solo = ranked.length === 1;
    const headline = solo ? 'FINAL SCORE' : isDraw ? "IT'S A DRAW!" : `${top.name.toUpperCase()} WINS!`;

    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto animate-in fade-in-50 duration-700 w-full max-w-lg max-h-full overflow-y-auto">
                <div
                    className={`bg-slate-900/95 backdrop-blur-xl rounded-2xl border-2 border-yellow-500/40 shadow-2xl text-center ${
                        compact ? 'p-5' : 'p-8'
                    }`}
                >
                    <div className={compact ? 'text-4xl mb-2 animate-bounce' : 'text-6xl mb-4 animate-bounce'}>🏆</div>

                    <h2
                        className={`font-black mb-2 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent break-words ${
                            compact ? 'text-2xl' : 'text-4xl'
                        }`}
                    >
                        {headline}
                    </h2>

                    {solo && <div className="text-5xl font-black text-yellow-400 mb-2">{top.score}</div>}

                    <div className={compact ? 'mt-4 space-y-2' : 'mt-6 space-y-3'}>
                        <div className="text-white/70 text-xs uppercase tracking-widest mb-2">Final Scores</div>
                        {ranked.map((player, rank) => {
                            const isTop = player.score === top.score;
                            return (
                                <div
                                    key={player.index}
                                    className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg ${
                                        isTop
                                            ? 'bg-yellow-500/20 border-2 border-yellow-500/50 shadow-lg'
                                            : 'bg-slate-800/50 border border-slate-700/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xl font-bold text-white/80 shrink-0">
                                            {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
                                        </span>
                                        <span
                                            className={`font-bold truncate ${isTop ? 'text-yellow-400' : 'text-white/80'}`}
                                        >
                                            {player.name}
                                        </span>
                                    </div>
                                    <span
                                        className={`text-lg font-black shrink-0 ${isTop ? 'text-yellow-400' : 'text-white'}`}
                                    >
                                        {player.score}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-3 flex-wrap helper-exclude-pdf">
                        <button
                            onClick={onNewGame}
                            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-xl transition-all active:scale-95 border-2 border-blue-400/30 cursor-pointer"
                        >
                            New Game
                        </button>
                        <button
                            onClick={onDownload}
                            className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                            Download PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

'use client';

import React from 'react';
import { ScoreCategory } from '@/lib/types';

interface RealisticScorecardProps {
    scorecard: Record<ScoreCategory, number | null>;
    potentialScores: Record<ScoreCategory, number>;
    onSelectCategory: (category: ScoreCategory) => void;
    currentTurn: number;
    rollsLeft: number;
    totalScore: number;
    playerName: string;
    isActiveTurn?: boolean;
}

const CATEGORIES = [
    { id: ScoreCategory.Ones, label: 'Aces' },
    { id: ScoreCategory.Twos, label: 'Twos' },
    { id: ScoreCategory.Threes, label: 'Threes' },
    { id: ScoreCategory.Fours, label: 'Fours' },
    { id: ScoreCategory.Fives, label: 'Fives' },
    { id: ScoreCategory.Sixes, label: 'Sixes' },
    { id: 'SUBTOTAL', label: 'Subtotal' },
    { id: 'BONUS', label: 'Bonus (+35)' },
    { id: ScoreCategory.ThreeOfAKind, label: '3 of a Kind' },
    { id: ScoreCategory.FourOfAKind, label: '4 of a Kind' },
    { id: ScoreCategory.FullHouse, label: 'Full House' },
    { id: ScoreCategory.SmallStraight, label: 'Sm. Straight' },
    { id: ScoreCategory.LargeStraight, label: 'Lg. Straight' },
    { id: ScoreCategory.Yahtzee, label: 'Yacht' },
    { id: ScoreCategory.Chance, label: 'Chance' },
    { id: 'TOTAL', label: 'TOTAL SCORE' },
];

export default function RealisticScorecard({
    scorecard,
    potentialScores,
    onSelectCategory,
    currentTurn,
    rollsLeft,
    totalScore,
    playerName,
    isActiveTurn = true,
}: RealisticScorecardProps) {
    const calculateSubtotal = () => {
        const categories = [ScoreCategory.Ones, ScoreCategory.Twos, ScoreCategory.Threes, ScoreCategory.Fours, ScoreCategory.Fives, ScoreCategory.Sixes];
        return categories.reduce((sum, cat) => sum + (scorecard[cat] || 0), 0);
    };

    const subtotal = calculateSubtotal();
    const bonus = subtotal >= 63 ? 35 : 0;

    // Must roll at least once to be allowed to score.
    const canScoreNow = rollsLeft < 3;

    return (
        <div className="w-[340px] bg-[#fdfbf7] rounded-lg shadow-2xl overflow-hidden font-serif text-slate-800 border-4 border-slate-200 select-none">
            <div className="bg-slate-800 text-white p-4 border-b-4 border-slate-700">
                <div className="flex justify-between items-center mb-1">
                    <h2 className="text-2xl font-black uppercase tracking-widest">{playerName}</h2>
                    <div className="bg-slate-700 px-3 py-1 rounded text-sm font-mono">GAME #1</div>
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold flex justify-between">
                    <span>Official Scorecard</span>
                    <span>No. 58291</span>
                </div>
            </div>

            <div className="flex flex-col">
                <div className="grid grid-cols-[1.5fr_1fr] bg-slate-200 gap-[1px] border-b border-slate-300">
                    <div className="bg-[#f0ece3] p-2 text-xs font-bold uppercase tracking-wider text-slate-500">Category</div>
                    <div className="bg-[#f0ece3] p-2 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Score</div>
                </div>

                {CATEGORIES.map((cat, index) => {
                    if (cat.id === 'SUBTOTAL') {
                        return (
                            <div key="sub" className="grid grid-cols-[1.5fr_1fr] border-b border-slate-300 bg-slate-100 font-bold">
                                <div className="p-2 text-sm uppercase text-slate-600">Subtotal</div>
                                <div className="p-2 text-center text-slate-800">{subtotal}</div>
                            </div>
                        );
                    }

                    if (cat.id === 'BONUS') {
                        return (
                            <div key="bonus" className="grid grid-cols-[1.5fr_1fr] border-b-4 border-slate-300 bg-slate-100 font-bold text-slate-600">
                                <div className="p-2 text-sm uppercase">Bonus</div>
                                <div className="p-2 text-center">{bonus > 0 ? bonus : '-'}</div>
                            </div>
                        );
                    }

                    if (cat.id === 'TOTAL') {
                        return (
                            <div key="total" className="mt-auto bg-slate-800 text-white p-4 flex justify-between items-center">
                                <span className="text-lg font-bold uppercase tracking-widest">Grand Total</span>
                                <span className="text-4xl font-black text-amber-400 font-mono">{totalScore}</span>
                            </div>
                        );
                    }

                    const categoryId = cat.id as ScoreCategory;
                    const hasScore = scorecard[categoryId] !== null;
                    const score = scorecard[categoryId];

                    const selectable = !hasScore && isActiveTurn && canScoreNow;

                    return (
                        <div key={cat.id || index} className="grid grid-cols-[1.5fr_1fr] border-b border-slate-200 group relative">
                            <div className="p-3 bg-white flex items-center">
                                <span className={`font-bold text-sm ${hasScore ? 'text-slate-400' : 'text-slate-800'}`}>{cat.label}</span>
                            </div>

                            <button
                                onClick={() => selectable && onSelectCategory(categoryId)}
                                disabled={!selectable}
                                className={`
                  relative p-2 text-center font-mono text-lg transition-all
                  ${hasScore ? 'bg-white text-slate-800' : selectable ? 'bg-white hover:bg-blue-50 cursor-pointer' : 'bg-white text-slate-300 cursor-not-allowed'}
                `}
                            >
                                {hasScore ? (
                                    <span className="font-bold text-xl text-slate-800">{score}</span>
                                ) : (
                                    canScoreNow && (
                                        <span className="font-bold text-xl text-slate-300 group-hover:text-amber-500 transition-colors">
                                            {potentialScores[categoryId] ?? 0}
                                        </span>
                                    )
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

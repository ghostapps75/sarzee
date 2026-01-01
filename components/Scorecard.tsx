'use client';

import React from 'react';
import { ScoreCategory, Scorecard as ScorecardType } from '@/lib/types';
import clsx from 'clsx';
import useSound from 'use-sound';

interface ScorecardProps {
    scorecard: ScorecardType;
    potentialScores: Record<ScoreCategory, number>;
    onSelectCategory: (category: ScoreCategory) => void;
    currentTurn: number;
    rollsLeft: number;
    totalScore: number;
}

const CATEGORIES: { id: ScoreCategory; label: string }[] = [
    { id: ScoreCategory.Ones, label: 'Ones' },
    { id: ScoreCategory.Twos, label: 'Twos' },
    { id: ScoreCategory.Threes, label: 'Threes' },
    { id: ScoreCategory.Fours, label: 'Fours' },
    { id: ScoreCategory.Fives, label: 'Fives' },
    { id: ScoreCategory.Sixes, label: 'Sixes' },
    { id: ScoreCategory.ThreeOfAKind, label: '3 of a Kind' },
    { id: ScoreCategory.FourOfAKind, label: '4 of a Kind' },
    { id: ScoreCategory.FullHouse, label: 'Full House' },
    { id: ScoreCategory.SmallStraight, label: 'Small Straight' },
    { id: ScoreCategory.LargeStraight, label: 'Large Straight' },
    { id: ScoreCategory.Yahtzee, label: 'Yahtzee' },
    { id: ScoreCategory.Chance, label: 'Chance' },
];

export default function ScorecardUI({
    scorecard,
    potentialScores,
    onSelectCategory,
    currentTurn,
    rollsLeft,
    totalScore
}: ScorecardProps) {

    const [playScore] = useSound('/sounds/score.mp3');

    const handleSelect = (id: ScoreCategory) => {
        playScore();
        onSelectCategory(id);
    }

    return (
        <div className="fixed right-4 top-4 bottom-4 w-80 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700 p-6 flex flex-col text-white shadow-2xl overflow-y-auto z-50">
            <div className="mb-6">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Sarzee</h1>
                <div className="flex justify-between mt-2 text-sm text-slate-400">
                    <span>Turn: {currentTurn}/13</span>
                    <span>Rolls: {rollsLeft}</span>
                </div>
                <div className="mt-4 text-4xl font-bold text-center border-b border-slate-700 pb-4">
                    {totalScore}
                </div>
            </div>

            <div className="flex-1 space-y-2">
                {CATEGORIES.map((cat) => {
                    const isTaken = scorecard[cat.id] !== null;
                    const score = scorecard[cat.id];
                    const potential = potentialScores[cat.id];

                    const isSelectable = !isTaken && rollsLeft < 3;

                    return (
                        <button
                            key={cat.id}
                            disabled={!isSelectable}
                            onClick={() => handleSelect(cat.id)}
                            className={clsx(
                                "w-full flex justify-between items-center p-3 rounded-lg transition-all",
                                isTaken
                                    ? "bg-slate-800/50 text-slate-500 cursor-default"
                                    : "bg-slate-800 hover:bg-slate-700 cursor-pointer border border-transparent hover:border-slate-500",
                                !isTaken && potential > 0 && rollsLeft < 3 && "ring-1 ring-blue-500/50 bg-blue-900/20"
                            )}
                        >
                            <span className="font-medium">{cat.label}</span>
                            {isTaken ? (
                                <span className="font-bold">{score}</span>
                            ) : (
                                <span className={clsx(
                                    "font-bold",
                                    potential > 0 ? "text-green-400" : "text-slate-600"
                                )}>
                                    {rollsLeft < 3 ? potential : '-'}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

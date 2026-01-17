'use client';

import React from 'react';
import { Scorecard, ScoreCategory } from '@/lib/types';
import clsx from 'clsx';

interface ScorecardProps {
    scorecard: Scorecard;
    potentialScores: Record<ScoreCategory, number>;
    onSelectCategory: (category: ScoreCategory) => void;
    currentTurn: number;
    rollsLeft: number;
    totalScore: number;
    playerName?: string;
}

const UPPER_SECTION = [
    { id: ScoreCategory.Ones, label: 'Aces (Ones)', desc: 'Count and Add Only Aces' },
    { id: ScoreCategory.Twos, label: 'Twos', desc: 'Count and Add Only Twos' },
    { id: ScoreCategory.Threes, label: 'Threes', desc: 'Count and Add Only Threes' },
    { id: ScoreCategory.Fours, label: 'Fours', desc: 'Count and Add Only Fours' },
    { id: ScoreCategory.Fives, label: 'Fives', desc: 'Count and Add Only Fives' },
    { id: ScoreCategory.Sixes, label: 'Sixes', desc: 'Count and Add Only Sixes' },
];

const LOWER_SECTION = [
    { id: ScoreCategory.ThreeOfAKind, label: '3 of a kind', desc: 'Add Total of All Dice' },
    { id: ScoreCategory.FourOfAKind, label: '4 of a kind', desc: 'Add Total of All Dice' },
    { id: ScoreCategory.FullHouse, label: 'Full House', desc: 'Score 25' },
    { id: ScoreCategory.SmallStraight, label: 'Sm. Straight', desc: 'Score 30' },
    { id: ScoreCategory.LargeStraight, label: 'Lg. Straight', desc: 'Score 40' },
    { id: ScoreCategory.Yahtzee, label: 'YAHTZEE', desc: 'Score 50' },
    { id: ScoreCategory.Chance, label: 'Chance', desc: 'Score Total of All 5 Dice' },
];

export default function RealisticScorecard({ scorecard, potentialScores, onSelectCategory, rollsLeft, playerName = "Player 1" }: ScorecardProps) {

    const renderRow = (item: { id: ScoreCategory, label: string, desc: string }) => {
        const isFilled = scorecard[item.id] !== null;
        const score = scorecard[item.id];
        const potential = potentialScores[item.id];
        const canSelect = !isFilled && rollsLeft < 3;

        return (
            <tr key={item.id} className="border-b border-black text-xs md:text-sm">
                <td className="p-1 border-r border-black font-bold bg-white text-black">{item.label}</td>
                <td className="p-1 border-r border-black text-[10px] leading-tight text-gray-600 bg-white">{item.desc}</td>

                {/* Game Column */}
                <td className="p-0 border-r border-black w-16 relative bg-white">
                    {isFilled ? (
                        <div className="w-full h-full flex items-center justify-center font-handwriting text-xl text-blue-900 font-bold">
                            {score}
                        </div>
                    ) : (
                        <button
                            onClick={() => canSelect && onSelectCategory(item.id)}
                            disabled={!canSelect}
                            className={clsx(
                                "w-full h-full min-h-[30px] flex items-center justify-center transition-colors",
                                canSelect ? "hover:bg-yellow-100 cursor-pointer" : "cursor-default"
                            )}
                        >
                            {canSelect && potential !== undefined && (
                                <span className="text-gray-400 font-bold text-lg opacity-50">{potential}</span>
                            )}
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    // Calculate Subtotals
    const upperScore = UPPER_SECTION.reduce((acc, item) => acc + (scorecard[item.id] || 0), 0);
    const bonus = upperScore >= 63 ? 35 : 0;
    const upperTotal = upperScore + bonus;

    const lowerScore = LOWER_SECTION.reduce((acc, item) => acc + (scorecard[item.id] || 0), 0);
    const grandTotal = upperTotal + lowerScore;

    return (
        <div className="bg-white text-black p-4 rounded shadow-2xl max-w-sm w-full font-sans border-4 border-black select-none">
            {/* Header */}
            <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-2">
                <h1 className="text-3xl font-black uppercase tracking-tighter">Sarzee</h1>
                <div className="text-sm font-bold border-b border-black w-1/2 text-center">{playerName}</div>
            </div>

            <table className="w-full border-2 border-black border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b-2 border-black text-xs font-bold">
                        <th className="p-1 border-r border-black w-1/3 text-left">UPPER SECTION</th>
                        <th className="p-1 border-r border-black text-center">HOW TO SCORE</th>
                        <th className="p-1 border-r border-black w-16 text-center">GAME #1</th>
                    </tr>
                </thead>
                <tbody>
                    {UPPER_SECTION.map(renderRow)}

                    {/* Upper Totals */}
                    <tr className="border-b border-black bg-gray-50 border-t-2">
                        <td className="p-1 border-r border-black font-bold">TOTAL SCORE</td>
                        <td className="p-1 border-r border-black text-[10px] text-right pr-2">➔</td>
                        <td className="p-1 border-r border-black text-center font-bold text-lg">{upperScore}</td>
                    </tr>
                    <tr className="border-b border-black bg-gray-50">
                        <td className="p-1 border-r border-black font-bold text-red-700">BONUS <span className="text-[10px] text-black font-normal ml-1">If &ge; 63</span></td>
                        <td className="p-1 border-r border-black text-[10px] text-center">SCORE 35</td>
                        <td className="p-1 border-r border-black text-center font-bold text-lg">{bonus > 0 ? 35 : 0}</td>
                    </tr>
                    <tr className="border-b-4 border-black bg-gray-200">
                        <td className="p-1 border-r border-black font-bold">TOTAL <span className="text-[10px] font-normal">Upper Section</span></td>
                        <td className="p-1 border-r border-black text-[10px] text-right pr-2">➔</td>
                        <td className="p-1 border-r border-black text-center font-bold text-xl">{upperTotal}</td>
                    </tr>

                    {/* Lower Section */}
                    <tr className="bg-gray-100 border-b-2 border-black text-xs font-bold">
                        <td colSpan={3} className="p-1 border-b border-black">LOWER SECTION</td>
                    </tr>
                    {LOWER_SECTION.map(renderRow)}

                    {/* Final Totals */}
                    <tr className="border-b border-black bg-gray-50 border-t-2">
                        <td className="p-1 border-r border-black font-bold uppercase text-[10px]">Total <span className="normal-case">of Lower Section</span></td>
                        <td className="p-1 border-r border-black text-[10px] text-right pr-2">➔</td>
                        <td className="p-1 border-r border-black text-center font-bold text-lg">{lowerScore}</td>
                    </tr>
                    <tr className="border-b border-black bg-gray-50">
                        <td className="p-1 border-r border-black font-bold uppercase text-[10px]">Total <span className="normal-case">of Upper Section</span></td>
                        <td className="p-1 border-r border-black text-[10px] text-right pr-2">➔</td>
                        <td className="p-1 border-r border-black text-center font-bold text-lg">{upperTotal}</td>
                    </tr>
                    <tr className="border-b border-black bg-yellow-100">
                        <td className="p-2 border-r border-black font-black text-lg">GRAND TOTAL</td>
                        <td className="p-1 border-r border-black text-[10px] text-right pr-2">➔</td>
                        <td className="p-1 border-r border-black text-center font-black text-2xl">{grandTotal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

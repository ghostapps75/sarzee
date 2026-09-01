// components/ScoreTable.tsx
'use client';

import React, { useMemo } from 'react';
import { ScoreCategory } from '@/lib/types';

type Card = Record<ScoreCategory, number | null>;

interface ScoreTableProps {
    playerNames: string[];
    scorecards: Card[];
    yahtzeeBonuses: number[];
    totals: number[];
    activePlayerIndex: number;
    potentialScores: Record<ScoreCategory, number>;
    canSelectCategory: boolean;
    onSelectCategory: (cat: ScoreCategory) => void;
    mustPick: boolean;
    highlightedCategory?: ScoreCategory | null;
    className?: string;
}

const UPPER: Array<[ScoreCategory, string, string]> = [
    [ScoreCategory.Ones, 'Aces', '1s'],
    [ScoreCategory.Twos, 'Twos', '2s'],
    [ScoreCategory.Threes, 'Threes', '3s'],
    [ScoreCategory.Fours, 'Fours', '4s'],
    [ScoreCategory.Fives, 'Fives', '5s'],
    [ScoreCategory.Sixes, 'Sixes', '6s'],
];

const LOWER: Array<[ScoreCategory, string, string]> = [
    [ScoreCategory.ThreeOfAKind, '3 of a Kind', 'Sum'],
    [ScoreCategory.FourOfAKind, '4 of a Kind', 'Sum'],
    [ScoreCategory.FullHouse, 'Full House', '25'],
    [ScoreCategory.SmallStraight, 'Sm. Straight', '30'],
    [ScoreCategory.LargeStraight, 'Lg. Straight', '40'],
    [ScoreCategory.Yahtzee, 'SARZEE', '50'],
    [ScoreCategory.Chance, 'Chance', 'Sum'],
];

const upperSubtotal = (card: Card | undefined) =>
    card ? UPPER.reduce((sum, [cat]) => sum + (card[cat] ?? 0), 0) : 0;

/**
 * The scorecard as a real table.
 *
 * The illustrated scorecard is an image with values absolutely positioned on top of it,
 * which locks it to a 385:1024 aspect ratio — unusable on a phone. This is the same card
 * rendered as DOM so it can reflow, while keeping the paper-and-pencil look.
 */
export default function ScoreTable({
    playerNames,
    scorecards,
    yahtzeeBonuses,
    totals,
    activePlayerIndex,
    potentialScores,
    canSelectCategory,
    onSelectCategory,
    mustPick,
    highlightedCategory = null,
    className = '',
}: ScoreTableProps) {
    const subtotals = useMemo(() => scorecards.map(upperSubtotal), [scorecards]);
    const bonuses = useMemo(() => subtotals.map((s) => (s >= 63 ? 35 : 0)), [subtotals]);
    const players = playerNames.length;

    const cell = (pIdx: number, cat: ScoreCategory) => {
        const score = scorecards[pIdx]?.[cat];
        const taken = score !== undefined && score !== null;
        const isActive = pIdx === activePlayerIndex;
        const potential = potentialScores[cat];
        const showPotential = isActive && !taken && potential !== undefined && canSelectCategory;
        const selectable = showPotential;
        const highlighted = isActive && highlightedCategory === cat;

        // Exactly one colour class, so this doesn't depend on Tailwind's emit order.
        const tone = showPotential
            ? 'text-sky-700 font-bold'
            : taken && score === 0
              ? 'text-stone-400'
              : 'text-stone-900';

        return (
            <button
                key={`${pIdx}-${cat}`}
                type="button"
                disabled={!selectable}
                onClick={() => selectable && onSelectCategory(cat)}
                aria-label={`${cat}${taken ? `, scored ${score}` : showPotential ? `, score ${potential}` : ', open'}`}
                className={[
                    'font-handwriting w-full h-full min-h-[36px] flex items-center justify-center',
                    'text-[15px] leading-none transition-colors border-l border-stone-400/60',
                    highlighted ? 'bg-yellow-300/70 animate-pulse' : isActive ? 'bg-amber-100/70' : 'bg-transparent',
                    selectable ? 'cursor-pointer active:bg-sky-200/80 md:hover:bg-sky-200/60' : 'cursor-default',
                    tone,
                    selectable && mustPick ? 'ring-1 ring-inset ring-sky-500/50' : '',
                ].join(' ')}
            >
                {taken ? score : showPotential ? potential : ''}
            </button>
        );
    };

    // Computed rows: never tappable, always show the number so they don't visually
    // merge into the scoring cell above them.
    const readOnly = (label: string, values: number[], strong = false) => (
        <div className="contents" key={label}>
            <div
                className={`px-2 py-1.5 text-[10px] uppercase tracking-wide flex items-center border-t border-stone-500/50 bg-stone-200/50 ${
                    strong ? 'font-bold text-stone-900' : 'text-stone-600'
                }`}
            >
                {label}
            </div>
            {values.slice(0, players).map((v, i) => (
                <div
                    key={`${label}-${i}`}
                    className={`font-handwriting flex items-center justify-center border-t border-l border-stone-500/50 text-[14px] ${
                        i === activePlayerIndex ? 'bg-amber-200/60' : 'bg-stone-200/50'
                    } ${strong ? 'font-bold text-stone-900' : 'text-stone-700'}`}
                >
                    {v}
                </div>
            ))}
        </div>
    );

    const sectionHeader = (label: string) => (
        <div
            className="col-span-full bg-stone-800 text-stone-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ gridColumn: `1 / span ${players + 1}` }}
        >
            {label}
        </div>
    );

    const scoreRow = ([cat, label, hint]: [ScoreCategory, string, string]) => (
        <div className="contents" key={cat}>
            <div className="px-2 py-1 flex items-baseline gap-1.5 border-t border-stone-400/40">
                <span className="text-[12px] font-semibold text-stone-800 leading-tight">{label}</span>
                <span className="text-[10px] text-stone-500 shrink-0">{hint}</span>
            </div>
            {Array.from({ length: players }, (_, i) => (
                <div key={i} className="border-t border-stone-400/40">
                    {cell(i, cat)}
                </div>
            ))}
        </div>
    );

    return (
        <div
            className={`relative overflow-y-auto overscroll-contain rounded-lg shadow-xl ${className}`}
            style={{ backgroundColor: '#f5efdf' }}
        >
            <div
                className="grid w-full"
                style={{ gridTemplateColumns: `minmax(96px, 1.6fr) repeat(${players}, minmax(44px, 1fr))` }}
            >
                {/* Player name header */}
                <div className="sticky top-0 z-10 bg-stone-800 text-stone-100 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] flex items-center">
                    Category
                </div>
                {playerNames.map((name, i) => (
                    <div
                        key={`h-${i}`}
                        className={`sticky top-0 z-10 px-1 py-1.5 text-[11px] font-bold text-center truncate border-l border-stone-600 flex items-center justify-center gap-1 ${
                            i === activePlayerIndex ? 'bg-amber-400 text-stone-900' : 'bg-stone-800 text-stone-300'
                        }`}
                        title={name}
                    >
                        {i === activePlayerIndex && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-700 animate-pulse shrink-0" />
                        )}
                        <span className="truncate">{name}</span>
                    </div>
                ))}

                {sectionHeader('Upper Section')}
                {UPPER.map(scoreRow)}
                {readOnly('Total', subtotals)}
                {readOnly('Bonus (63+)', bonuses)}
                {readOnly('Upper Total', subtotals.map((s, i) => s + bonuses[i]), true)}

                {sectionHeader('Lower Section')}
                {LOWER.map(scoreRow)}
                {readOnly('Sarzee Bonus', yahtzeeBonuses)}
                {readOnly(
                    'Lower Total',
                    totals.map((t, i) => t - (subtotals[i] + bonuses[i])),
                    true
                )}

                <div className="contents">
                    <div className="px-2 py-2 text-[11px] font-black uppercase tracking-[0.15em] bg-stone-800 text-stone-100 flex items-center">
                        Grand Total
                    </div>
                    {totals.slice(0, players).map((t, i) => (
                        <div
                            key={`gt-${i}`}
                            className={`font-handwriting flex items-center justify-center border-l border-stone-600 text-lg font-black ${
                                i === activePlayerIndex ? 'bg-amber-400 text-stone-900' : 'bg-stone-800 text-amber-300'
                            }`}
                        >
                            {t}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

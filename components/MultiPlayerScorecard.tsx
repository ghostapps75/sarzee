// components/MultiPlayerScorecard.tsx
'use client';

import React, { useMemo } from 'react';
import { ScoreCategory } from '@/lib/types';

type Scorecard = Record<ScoreCategory, number | null>;

type Props = {
  playerNames: string[];
  scorecards: Scorecard[];
  yahtzeeBonuses: number[]; // NEW
  activePlayerIndex: number;

  // For the ACTIVE player only:
  potentialScores: Record<ScoreCategory, number>;
  canSelectCategory: boolean;
  onSelectCategory: (category: ScoreCategory) => void;

  totals: number[];
  mustPick?: boolean;
};

function calcUpperSubtotal(scorecard: Scorecard) {
  const cats = [
    ScoreCategory.Ones,
    ScoreCategory.Twos,
    ScoreCategory.Threes,
    ScoreCategory.Fours,
    ScoreCategory.Fives,
    ScoreCategory.Sixes,
  ];
  return cats.reduce((sum, c) => sum + (scorecard[c] ?? 0), 0);
}

export default function MultiPlayerScorecard({
  playerNames,
  scorecards,
  yahtzeeBonuses,
  activePlayerIndex,
  potentialScores,
  canSelectCategory,
  onSelectCategory,
  totals,
  mustPick = false,
}: Props) {
  const upperSubtotals = useMemo(() => scorecards.map(calcUpperSubtotal), [scorecards]);
  const bonuses = useMemo(() => upperSubtotals.map((st) => (st >= 63 ? 35 : 0)), [upperSubtotals]);

  // --- SOURCE IMAGE METRICS (scorecard_bg.png) ---
  const IMG_W = 718;
  const IMG_H = 1024;

  const GRID_TOP = 185;
  const GRID_BOTTOM = 1015;
  const GRID_LEFT = 279;
  const GRID_RIGHT = 704;

  const GRID_W = GRID_RIGHT - GRID_LEFT;
  const GRID_H = GRID_BOTTOM - GRID_TOP;

  const COLS: ReadonlyArray<readonly [number, number]> = [
    [279, 385],
    [385, 492],
    [492, 598],
    [598, 704],
  ] as const;

  const ROWS = {
    ones: [185, 231],
    twos: [231, 277],
    threes: [277, 323],
    fours: [323, 369],
    fives: [369, 415],
    sixes: [415, 461],
    upperTotalScore: [461, 490],
    upperBonus: [490, 529],
    upperTotal: [529, 558],

    threeKind: [587, 633],
    fourKind: [633, 679],
    fullHouse: [679, 708],
    smallStraight: [708, 737],
    largeStraight: [737, 766],
    yahtzee: [766, 795],
    chance: [795, 841],
    yahtzeeBonus: [841, 887],
    totalLower: [887, 933],
    totalUpper2: [933, 979],
    grandTotal: [979, 1008],
  } as const;

  const toYPct = (y: number) => ((y - GRID_TOP) / GRID_H) * 100;
  const rowTopPct = (y0: number) => toYPct(y0);
  const rowHeightPct = (y0: number, y1: number) => toYPct(y1) - toYPct(y0);

  const colLeftPct = (x0: number) => ((x0 - GRID_LEFT) / GRID_W) * 100;
  const colWidthPct = (x0: number, x1: number) => ((x1 - x0) / GRID_W) * 100;

  const imgXPct = (x: number) => (x / IMG_W) * 100;
  const imgYPct = (y: number) => (y / IMG_H) * 100;

  const renderValue = (val: string | number, top: number, height: number, bold = false, extraClasses = '') => (
    <div
      className={`absolute left-0 w-full flex items-center justify-center font-handwriting text-black ${bold ? 'font-bold' : ''
        } ${extraClasses}`}
      style={{ top: `${top}%`, height: `${height}%` }}
    >
      {val !== 0 && val !== '' ? val : ''}
    </div>
  );

  const renderCat = (pIdx: number, cat: ScoreCategory, top: number, height: number) => {
    const isActive = pIdx === activePlayerIndex;
    const sc = scorecards[pIdx];
    const hasScore = sc?.[cat] !== null && sc?.[cat] !== undefined;
    const score = sc?.[cat];

    const selectable = isActive && !hasScore && canSelectCategory;
    const hasPotential = potentialScores[cat] !== undefined;

    return (
      <div
        className={`absolute left-0 w-full flex items-center justify-center ${selectable ? 'cursor-pointer' : ''}`}
        style={{ top: `${top}%`, height: `${height}%` }}
        onClick={() => selectable && onSelectCategory(cat)}
      >
        {hasScore ? (
          <span className="font-handwriting text-xl text-black font-bold">{score}</span>
        ) : selectable && hasPotential ? (
          <>
            <div className="absolute inset-[8%] rounded-[2px] bg-black/0 hover:bg-black/7 transition-colors" />
            <div
              className={`absolute inset-[10%] rounded-[2px] transition-colors ${mustPick ? 'bg-yellow-200/55' : 'bg-yellow-200/35'
                }`}
            />
            <div className="absolute left-[16%] right-[16%] bottom-[18%] h-[1px] bg-black/20" />
            <span
              className={`relative font-handwriting text-[22px] ${mustPick ? 'text-black animate-pulse' : 'text-black/85'
                }`}
              style={{
                textShadow: '0 1px 0 rgba(255,255,255,0.55), 0 0 1px rgba(0,0,0,0.35)',
                WebkitTextStroke: '0.15px rgba(0,0,0,0.35)',
              }}
            >
              {potentialScores[cat]}
            </span>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className="relative w-[560px] max-w-[90vw] self-start mt-4">
      <img
        src="/assets/scorecard_bg.png"
        alt="Scorecard Background"
        className="w-full h-full object-contain select-none"
        draggable={false}
      />

      <div
        className="absolute bg-white"
        style={{
          top: `${imgYPct(80)}%`,
          left: `${imgXPct(400)}%`,
          width: `${imgXPct(318)}%`,
          height: `${imgYPct(60)}%`,
        }}
      />

      <div
        className="absolute flex"
        style={{
          top: `${imgYPct(145)}%`,
          left: `${imgXPct(GRID_LEFT)}%`,
          width: `${imgXPct(GRID_RIGHT - GRID_LEFT)}%`,
          height: `${imgYPct(50)}%`,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`header-${i}`} className="flex-1 flex items-center justify-center">
            <span className="font-handwriting text-black font-bold text-lg -rotate-2 truncate max-w-[90%] bg-white px-1 py-0 leading-none shadow-sm rounded-sm">
              {playerNames[i] ?? ''}
            </span>
          </div>
        ))}
      </div>

      <div
        className="absolute"
        style={{
          top: `${imgYPct(GRID_TOP)}%`,
          left: `${imgXPct(GRID_LEFT)}%`,
          width: `${imgXPct(GRID_RIGHT - GRID_LEFT)}%`,
          height: `${imgYPct(GRID_BOTTOM - GRID_TOP)}%`,
        }}
      >
        {COLS.map(([x0, x1], pIdx) => {
          const isActive = pIdx === activePlayerIndex;

          const upperTotal = upperSubtotals[pIdx] ?? 0;
          const upperBonus = bonuses[pIdx] ?? 0;
          const total = totals[pIdx] ?? 0;
          const yahtzeeBonus = yahtzeeBonuses[pIdx] ?? 0;

          return (
            <div
              key={pIdx}
              className="absolute top-0 bottom-0"
              style={{
                left: `${colLeftPct(x0)}%`,
                width: `${colWidthPct(x0, x1)}%`,
              }}
            >
              {isActive && <div className="absolute inset-0 bg-black/5 mix-blend-multiply pointer-events-none" />}

              {/* UPPER */}
              {renderCat(pIdx, ScoreCategory.Ones, rowTopPct(ROWS.ones[0]), rowHeightPct(...ROWS.ones))}
              {renderCat(pIdx, ScoreCategory.Twos, rowTopPct(ROWS.twos[0]), rowHeightPct(...ROWS.twos))}
              {renderCat(pIdx, ScoreCategory.Threes, rowTopPct(ROWS.threes[0]), rowHeightPct(...ROWS.threes))}
              {renderCat(pIdx, ScoreCategory.Fours, rowTopPct(ROWS.fours[0]), rowHeightPct(...ROWS.fours))}
              {renderCat(pIdx, ScoreCategory.Fives, rowTopPct(ROWS.fives[0]), rowHeightPct(...ROWS.fives))}
              {renderCat(pIdx, ScoreCategory.Sixes, rowTopPct(ROWS.sixes[0]), rowHeightPct(...ROWS.sixes))}

              {renderValue(upperTotal, rowTopPct(ROWS.upperTotalScore[0]), rowHeightPct(...ROWS.upperTotalScore), true)}
              {renderValue(upperBonus > 0 ? upperBonus : '', rowTopPct(ROWS.upperBonus[0]), rowHeightPct(...ROWS.upperBonus))}
              {renderValue(upperTotal + upperBonus, rowTopPct(ROWS.upperTotal[0]), rowHeightPct(...ROWS.upperTotal), true)}

              {/* LOWER */}
              {renderCat(pIdx, ScoreCategory.ThreeOfAKind, rowTopPct(ROWS.threeKind[0]), rowHeightPct(...ROWS.threeKind))}
              {renderCat(pIdx, ScoreCategory.FourOfAKind, rowTopPct(ROWS.fourKind[0]), rowHeightPct(...ROWS.fourKind))}
              {renderCat(pIdx, ScoreCategory.FullHouse, rowTopPct(ROWS.fullHouse[0]), rowHeightPct(...ROWS.fullHouse))}
              {renderCat(pIdx, ScoreCategory.SmallStraight, rowTopPct(ROWS.smallStraight[0]), rowHeightPct(...ROWS.smallStraight))}
              {renderCat(pIdx, ScoreCategory.LargeStraight, rowTopPct(ROWS.largeStraight[0]), rowHeightPct(...ROWS.largeStraight))}
              {renderCat(pIdx, ScoreCategory.Yahtzee, rowTopPct(ROWS.yahtzee[0]), rowHeightPct(...ROWS.yahtzee))}
              {renderCat(pIdx, ScoreCategory.Chance, rowTopPct(ROWS.chance[0]), rowHeightPct(...ROWS.chance))}

              {/* NEW: Yahtzee Bonus row (automatic, not selectable) */}
              {renderValue(
                yahtzeeBonus > 0 ? yahtzeeBonus : '',
                rowTopPct(ROWS.yahtzeeBonus[0]),
                rowHeightPct(...ROWS.yahtzeeBonus),
                true
              )}

              {renderValue(total - (upperTotal + upperBonus), rowTopPct(ROWS.totalLower[0]), rowHeightPct(...ROWS.totalLower), true)}
              {renderValue(upperTotal + upperBonus, rowTopPct(ROWS.totalUpper2[0]), rowHeightPct(...ROWS.totalUpper2), true)}
              {renderValue(total, rowTopPct(ROWS.grandTotal[0]), rowHeightPct(...ROWS.grandTotal), true, 'text-xl')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

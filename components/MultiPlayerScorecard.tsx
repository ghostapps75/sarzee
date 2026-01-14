// components/MultiPlayerScorecard.tsx
'use client';

import React, { useMemo } from 'react';
import { ScoreCategory } from '@/lib/types';

type Scorecard = Record<ScoreCategory, number | null>;

interface MultiPlayerScorecardProps {
  playerNames: string[];
  scorecards: Scorecard[];
  yahtzeeBonuses: number[]; // NEW
  totals: number[];
  activePlayerIndex: number;

  // For the ACTIVE player only:
  potentialScores: Record<ScoreCategory, number>;
  canSelectCategory: boolean;
  onSelectCategory: (cat: ScoreCategory) => void;
  mustPick: boolean;
  className?: string;
}

function calcUpperSubtotal(scorecard: Record<ScoreCategory, number | null> | null) {
  if (!scorecard) return 0;
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
  totals,
  activePlayerIndex,
  potentialScores,
  canSelectCategory,
  onSelectCategory,
  mustPick,
  className = ''
}: MultiPlayerScorecardProps) {
  // State for viewed player (Tab)
  const [viewedPlayer, setViewedPlayer] = React.useState(activePlayerIndex);

  // Sync viewed player with active player when turn changes (optional, but good UX)
  React.useEffect(() => {
    setViewedPlayer(activePlayerIndex);
  }, [activePlayerIndex]);

  const upperSubtotals = useMemo(() => scorecards.map(calcUpperSubtotal), [scorecards]);
  const bonuses = useMemo(() => upperSubtotals.map((st) => (st >= 63 ? 35 : 0)), [upperSubtotals]);

  // --- SOURCE IMAGE METRICS (scorecard_bg.png) ---
  const IMG_W = 718;
  const IMG_H = 1024;

  const GRID_TOP = 185;
  const GRID_BOTTOM = 1015;
  const GRID_LEFT = 279;
  const GRID_RIGHT = 704;

  const GRID_W = GRID_RIGHT - GRID_LEFT; // 425
  const GRID_H = GRID_BOTTOM - GRID_TOP; // 830

  // Pixel start/end for each column
  const COLS: ReadonlyArray<readonly [number, number]> = [
    [279, 385], // P1
    [385, 492], // P2
    [492, 598], // P3
    [598, 704], // P4
  ] as const;

  // Single Column View Metrics
  // We construct a view: Labels | <Active Column>
  const LABELS_W = 279;
  const COL_W = 106; // Approx 385 - 279
  const VIEW_W = LABELS_W + COL_W; // 385
  const VIEW_ASPECT = `${VIEW_W}/${IMG_H}`; // 385 / 1024

  // Width percentages for the split panes
  const LEFT_PANE_W_PCT = (LABELS_W / VIEW_W) * 100;
  const RIGHT_PANE_W_PCT = (COL_W / VIEW_W) * 100;

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

  // Helpers
  const renderValue = (val: number | string, topPct: number, heightPct: number, bold = false, textSize = 'text-[10px] sm:text-xs lg:text-base') => {
    return (
      <div
        className="absolute flex items-center justify-center font-handwriting text-slate-900 pointer-events-none"
        style={{ top: `${topPct}%`, height: `${heightPct}%`, left: 0, right: 0 }}
      >
        <span className={`${bold ? 'font-bold' : ''} ${textSize}`}>
          {val}
        </span>
      </div>
    )
  }

  const renderCat = (pIdx: number, cat: ScoreCategory, topPct: number, heightPct: number) => {
    const score = scorecards[pIdx]?.[cat];
    const potential = potentialScores[cat];
    const isTaken = score !== undefined && score !== null;
    const isActive = pIdx === activePlayerIndex;

    const showPotential = isActive && !isTaken && potential !== undefined && canSelectCategory;
    const isZero = isTaken && score === 0;
    const displayVal = isTaken ? score : showPotential ? potential : '';

    return (
      <div
        className={`absolute flex items-center justify-center font-handwriting transition-colors duration-200 ${!isTaken && isActive && canSelectCategory ? 'cursor-pointer hover:bg-blue-500/10' : ''
          }`}
        style={{ top: `${topPct}%`, height: `${heightPct}%`, left: 0, right: 0 }}
        onClick={() => !isTaken && isActive && canSelectCategory && onSelectCategory(cat)}
      >
        <span
          className={`
            text-[14px] sm:text-lg lg:text-xl transition-all duration-200
            ${showPotential ? 'text-blue-600 font-extrabold scale-110 drop-shadow-sm' : ''}
            ${isTaken && !isZero ? 'text-slate-900 font-bold' : ''}
            ${isZero ? 'text-slate-300 font-normal' : ''}
          `}
        >
          {displayVal}
        </span>
      </div >
    );
  };

  // The "World" Component: The Full Image + Data Overlays
  // This is what we slide around inside the viewports.
  const WorldContent = ({ pIdxOverride }: { pIdxOverride?: number }) => (
    <div className="relative w-full h-full">
      <img
        src="/assets/scorecard_bg.png"
        alt="Scorecard Background"
        className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
        draggable={false}
      />

      {/* Grid Container (positioned relative to Image) */}
      <div
        className="absolute"
        style={{
          top: `${(GRID_TOP / IMG_H) * 100}%`,
          left: `${(GRID_LEFT / IMG_W) * 100}%`,
          width: `${(GRID_W / IMG_W) * 100}%`,
          height: `${(GRID_H / IMG_H) * 100}%`,
        }}
      >
        {/* Render only the needed column if override provided, or all? 
            Since we mask the world, we can render all or just the one. 
            Visual artifact avoidance: Render all is safer for alignment, but optimization: render one.
            Let's render just the 'viewed' player column to be efficient and avoid bleed.
        */}
        {COLS.map(([x0, x1], i) => {
          if (pIdxOverride !== undefined && i !== pIdxOverride) return null;

          // Col positioning in Grid
          const leftPct = ((x0 - GRID_LEFT) / GRID_W) * 100;
          const widthPct = ((x1 - x0) / GRID_W) * 100;

          const isActive = i === activePlayerIndex;
          const upperTotal = upperSubtotals[i] ?? 0;
          const upperBonus = bonuses[i] ?? 0;
          const total = totals[i] ?? 0;
          const yahtzeeBonus = yahtzeeBonuses[i] ?? 0;

          return (
            <div key={i} className="absolute top-0 bottom-0" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
              {isActive && <div className="absolute inset-0 bg-black/5 mix-blend-multiply pointer-events-none" />}

              {renderCat(i, ScoreCategory.Ones, rowTopPct(ROWS.ones[0]), rowHeightPct(...ROWS.ones))}
              {renderCat(i, ScoreCategory.Twos, rowTopPct(ROWS.twos[0]), rowHeightPct(...ROWS.twos))}
              {renderCat(i, ScoreCategory.Threes, rowTopPct(ROWS.threes[0]), rowHeightPct(...ROWS.threes))}
              {renderCat(i, ScoreCategory.Fours, rowTopPct(ROWS.fours[0]), rowHeightPct(...ROWS.fours))}
              {renderCat(i, ScoreCategory.Fives, rowTopPct(ROWS.fives[0]), rowHeightPct(...ROWS.fives))}
              {renderCat(i, ScoreCategory.Sixes, rowTopPct(ROWS.sixes[0]), rowHeightPct(...ROWS.sixes))}

              {renderValue(upperTotal, rowTopPct(ROWS.upperTotalScore[0]), rowHeightPct(...ROWS.upperTotalScore), true)}
              {renderValue(upperBonus > 0 ? upperBonus : '', rowTopPct(ROWS.upperBonus[0]), rowHeightPct(...ROWS.upperBonus))}
              {renderValue(upperTotal + upperBonus, rowTopPct(ROWS.upperTotal[0]), rowHeightPct(...ROWS.upperTotal), true)}

              {renderCat(i, ScoreCategory.ThreeOfAKind, rowTopPct(ROWS.threeKind[0]), rowHeightPct(...ROWS.threeKind))}
              {renderCat(i, ScoreCategory.FourOfAKind, rowTopPct(ROWS.fourKind[0]), rowHeightPct(...ROWS.fourKind))}
              {renderCat(i, ScoreCategory.FullHouse, rowTopPct(ROWS.fullHouse[0]), rowHeightPct(...ROWS.fullHouse))}
              {renderCat(i, ScoreCategory.SmallStraight, rowTopPct(ROWS.smallStraight[0]), rowHeightPct(...ROWS.smallStraight))}
              {renderCat(i, ScoreCategory.LargeStraight, rowTopPct(ROWS.largeStraight[0]), rowHeightPct(...ROWS.largeStraight))}
              {renderCat(i, ScoreCategory.Yahtzee, rowTopPct(ROWS.yahtzee[0]), rowHeightPct(...ROWS.yahtzee))}
              {renderCat(i, ScoreCategory.Chance, rowTopPct(ROWS.chance[0]), rowHeightPct(...ROWS.chance))}

              {renderValue(yahtzeeBonus > 0 ? yahtzeeBonus : '', rowTopPct(ROWS.yahtzeeBonus[0]), rowHeightPct(...ROWS.yahtzeeBonus), true)}

              {renderValue(total - (upperTotal + upperBonus), rowTopPct(ROWS.totalLower[0]), rowHeightPct(...ROWS.totalLower), true)}
              {renderValue(upperTotal + upperBonus, rowTopPct(ROWS.totalUpper2[0]), rowHeightPct(...ROWS.totalUpper2), true)}
              {renderValue(total, rowTopPct(ROWS.grandTotal[0]), rowHeightPct(...ROWS.grandTotal), true, 'text-sm sm:text-base lg:text-xl')}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`relative flex flex-col w-full h-full ${className}`}>
      {/* Tabs Header */}
      <div className="flex w-full pt-2 pb-2 bg-white/95 z-20 border-b-2 border-black shrink-0">
        <div className="flex w-full px-2 gap-1 overflow-x-auto no-scrollbar">
          {Array.from({ length: 4 }).map((_, i) => {
            if (i >= playerNames.length) return null; // Don't show extra tabs
            const isActive = i === viewedPlayer;
            const isTurn = i === activePlayerIndex;
            return (
              <button
                key={`tab-${i}`}
                onClick={() => setViewedPlayer(i)}
                className={`
                    flex-1 py-1 px-1 rounded-t-sm border-b-2 font-bold text-xs sm:text-sm transition-colors relative
                    ${isActive ? 'border-blue-600 bg-white/60 text-black' : 'border-transparent text-black/50 hover:bg-black/5'}
                  `}
              >
                {isTurn && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
                {playerNames[i] || `P${i + 1}`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area: Aspect-Locked Single Player View */}
      <div className="flex-1 w-full relative overflow-hidden flex justify-center items-start">
        <div className="h-full relative shadow-xl" style={{ aspectRatio: VIEW_ASPECT }}>

          {/* Left Pane: Static Labels */}
          <div className="absolute top-0 bottom-0 left-0 overflow-hidden" style={{ width: `${LEFT_PANE_W_PCT}%` }}>
            {/* Scale the World to fill height. Left=0 ensures Labels are visible. */}
            <div className="absolute top-0 left-0 h-full" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
              <WorldContent />
              {/* We leave pIdxOverride undefined here, effectively rending empty grid + labels? 
                         Actually WorldContent logic above always renders BG. 
                         The grid part needs columns. If we pass nothing to pIdxOverride, it renders everything. 
                         It's fine, the Left Pane is clipped to Labels width. 
                         Grid starts at 279 (Labels W). So grid is hidden! Perfect. 
                      */}
            </div>
          </div>

          {/* Right Pane: Dynamic Column */}
          <div className="absolute top-0 bottom-0 right-0 overflow-hidden" style={{ width: `${RIGHT_PANE_W_PCT}%` }}>
            <div
              className="absolute top-0 left-0 h-full transition-transform duration-300 ease-out origin-top-left"
              style={{
                aspectRatio: `${IMG_W}/${IMG_H}`,
                // Seam Fix: Drive width from height + aspect ratio (same as left pane)
                // Position adjustment handles the sliding.
                transform: `translateX(-${(COLS[viewedPlayer][0] / IMG_W) * 100}%)`
              }}
            >
              <WorldContent pIdxOverride={viewedPlayer} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


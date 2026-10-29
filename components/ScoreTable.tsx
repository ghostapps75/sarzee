// components/ScoreTable.tsx
'use client';

import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScoreCategory } from '@/lib/types';
import { OptionTier, rankOptions } from '@/lib/scoreAdvice';
import type { UndoOffer } from '@/lib/useSarzeeGame';
import styles from './ScoreTable.module.css';

type Card = Record<ScoreCategory, number | null>;

interface ScoreTableProps {
    playerNames: string[];
    /** Each player's dice colour, shown beside their name. */
    playerColors?: string[];
    scorecards: Card[];
    /** The engine's 35-point upper bonus per player, so the card never recomputes it. */
    upperBonuses: number[];
    yahtzeeBonuses: number[];
    totals: number[];
    /** The seat on turn, highlighted on the pad. -1 when nobody is (the game is over). */
    activePlayerIndex: number;
    potentialScores: Record<ScoreCategory, number>;
    canSelectCategory: boolean;
    onSelectCategory: (cat: ScoreCategory) => void;
    mustPick: boolean;
    highlightedCategory?: ScoreCategory | null;
    /** The last human score while it can still be taken back; the header offers Undo. */
    undo?: UndoOffer | null;
    onUndo?: () => void;
    className?: string;
    /** The pad element itself — the game-over export captures it. */
    ref?: React.Ref<HTMLDivElement>;
}

type Pips = 1 | 2 | 3 | 4 | 5 | 6;

interface Line {
    cat: ScoreCategory;
    label: string;
    /** The scoring rule, printed small beside the label. */
    hint?: string;
    pips?: Pips;
}

const UPPER: Line[] = [
    { cat: ScoreCategory.Ones, label: 'Aces', pips: 1 },
    { cat: ScoreCategory.Twos, label: 'Twos', pips: 2 },
    { cat: ScoreCategory.Threes, label: 'Threes', pips: 3 },
    { cat: ScoreCategory.Fours, label: 'Fours', pips: 4 },
    { cat: ScoreCategory.Fives, label: 'Fives', pips: 5 },
    { cat: ScoreCategory.Sixes, label: 'Sixes', pips: 6 },
];

const LOWER: Line[] = [
    { cat: ScoreCategory.ThreeOfAKind, label: '3 of a Kind', hint: 'Sum' },
    { cat: ScoreCategory.FourOfAKind, label: '4 of a Kind', hint: 'Sum' },
    { cat: ScoreCategory.FullHouse, label: 'Full House', hint: '25' },
    { cat: ScoreCategory.SmallStraight, label: 'Sm Straight', hint: '30' },
    { cat: ScoreCategory.LargeStraight, label: 'Lg Straight', hint: '40' },
    { cat: ScoreCategory.Yahtzee, label: 'Sarzee', hint: '50' },
    { cat: ScoreCategory.Chance, label: 'Chance', hint: 'Sum' },
];

const LABELS = Object.fromEntries([...UPPER, ...LOWER].map((l) => [l.cat, l.label])) as Record<ScoreCategory, string>;

/**
 * Row heights, top to bottom. Each row takes a share of the card's height so the pad
 * fills its space exactly; the minimums take over, and the card scrolls, when it can't.
 */
const HEAD = { min: '34px', fr: 1.15 };
const BAND = { min: '16px', fr: 0.6 };
const LINE = { min: 'var(--line-min)', fr: 1 };
const SUM = { min: '20px', fr: 0.72 };
const GRAND = { min: '30px', fr: 1.2 };
const TRACKS = [
    HEAD,
    BAND, ...UPPER.map(() => LINE), SUM, SUM, SUM,
    BAND, ...LOWER.map(() => LINE), SUM, SUM,
    GRAND,
];
const TEMPLATE_ROWS = TRACKS.map((t) => `minmax(${t.min}, ${t.fr}fr)`).join(' ');
const TOTAL_FR = TRACKS.reduce((sum, t) => sum + t.fr, 0);

/** Narrowest label column that still holds "4 of a Kind · Sum" (with the hint wrapped). */
const LABEL_MIN = 118;
/** Narrowest player column that still holds a four-digit grand total. */
const COLUMN_MIN = 50;
const TABS_HEIGHT = 34;

const upperSubtotal = (card: Card | undefined) =>
    card ? UPPER.reduce((sum, { cat }) => sum + (card[cat] ?? 0), 0) : 0;

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

/** A small tilt and nudge, stable per box, so pencilled numbers don't sit machine-square. */
function pencilled(player: number, cat: string): React.CSSProperties {
    let h = 17 + player * 7919;
    for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) | 0;
    const a = ((h >>> 0) % 997) / 997;
    const b = ((h >>> 11) % 991) / 991;
    return { '--tilt': `${((a - 0.5) * 5).toFixed(2)}deg`, '--nudge': `${((b - 0.5) * 3).toFixed(2)}px` } as React.CSSProperties;
}

const PIP_SPOTS: Record<Pips, Array<[number, number]>> = {
    1: [[8, 8]],
    2: [[4.5, 4.5], [11.5, 11.5]],
    3: [[4.5, 4.5], [8, 8], [11.5, 11.5]],
    4: [[4.5, 4.5], [11.5, 4.5], [4.5, 11.5], [11.5, 11.5]],
    5: [[4.5, 4.5], [11.5, 4.5], [8, 8], [4.5, 11.5], [11.5, 11.5]],
    6: [[4.5, 4], [11.5, 4], [4.5, 8], [11.5, 8], [4.5, 12], [11.5, 12]],
};

/** A curved arrow turning back on itself, for Undo. */
function UndoArrow() {
    return (
        <svg viewBox="0 0 16 16" className={styles.undoIcon} aria-hidden="true">
            <path
                d="M5.5 3.5 2.5 6.5l3 3M3 6.5h6.25a3.75 3.75 0 0 1 0 7.5H7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** The printed die beside each upper-section label. Vector, so it stays sharp. */
function PipDie({ value }: { value: Pips }) {
    return (
        <svg viewBox="0 0 16 16" className={styles.pip} aria-hidden="true">
            <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3" fill="#fffdf5" stroke="currentColor" strokeWidth="1.2" />
            {PIP_SPOTS[value].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />
            ))}
        </svg>
    );
}

/**
 * The scorecard: a paper score pad built from real DOM, so it reflows to any size and its
 * printing stays sharp at any pixel ratio.
 *
 * Every player's column is shown side by side; only when a narrow rail can't fit them all
 * does it fall back to tabs. While a human is choosing, each open box shows what the dice
 * would score there, ranked — the best box glows, scratches fade back.
 */
export default function ScoreTable({
    playerNames,
    playerColors = [],
    scorecards,
    upperBonuses,
    yahtzeeBonuses,
    totals,
    activePlayerIndex,
    potentialScores,
    canSelectCategory,
    onSelectCategory,
    mustPick,
    highlightedCategory = null,
    undo = null,
    onUndo,
    className = '',
    ref,
}: ScoreTableProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);

    const [box, setBox] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setBox((prev) =>
                Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5 ? prev : { w: width, h: height }
            );
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // The tab being viewed follows the turn; picking another only lasts until the turn moves on.
    const [view, setView] = useState({ player: activePlayerIndex, turn: activePlayerIndex });
    if (view.turn !== activePlayerIndex) setView({ player: activePlayerIndex, turn: activePlayerIndex });
    // With nobody on turn the tabs start on the first seat.
    const viewedPlayer = Math.max(0, view.turn === activePlayerIndex ? view.player : activePlayerIndex);

    const players = playerNames.length;
    const tabbed = players > 1 && box.w > 0 && box.w < LABEL_MIN + players * COLUMN_MIN;
    const shown = tabbed ? [viewedPlayer] : playerNames.map((_, i) => i);
    const activeShown = shown.includes(activePlayerIndex);

    const lineUnit = box.h > 0 ? Math.min(56, Math.max(26, (box.h - (tabbed ? TABS_HEIGHT : 0)) / TOTAL_FR)) : 40;

    const subtotals = useMemo(() => scorecards.map(upperSubtotal), [scorecards]);
    // The bonus comes from the engine, where it is already part of each total. Working it
    // out here as well once left the card showing a 35 that the standings didn't include.
    const bonuses = useMemo(() => scorecards.map((_, i) => upperBonuses[i] ?? 0), [scorecards, upperBonuses]);
    const activeCard = scorecards[activePlayerIndex];
    const tiers = useMemo(
        () => (canSelectCategory && activeCard ? rankOptions(activeCard, potentialScores) : {}),
        [canSelectCategory, activeCard, potentialScores]
    );

    // On a short screen the best box can be below the fold. After each roll, bring it into
    // view if it isn't already; wherever the whole card fits this does nothing.
    useEffect(() => {
        const root = rootRef.current;
        if (!root || root.scrollHeight <= root.clientHeight) return;
        const best = root.querySelector<HTMLElement>('[data-tier="best"]');
        if (!best) return;

        // The header row (and tabs) stay pinned over the top of the scrolled content.
        const pinned = (root.querySelector<HTMLElement>(`.${styles.head}`)?.offsetHeight ?? 0) + (tabbed ? TABS_HEIGHT : 0);
        const top = best.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientTop + root.scrollTop;
        const height = best.offsetHeight;
        if (top >= root.scrollTop + pinned && top + height <= root.scrollTop + root.clientHeight) return;

        root.scrollTo({
            top: Math.max(0, top - pinned - (root.clientHeight - pinned - height) / 2),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }, [tiers, tabbed]);

    const nameOf = (p: number) => playerNames[p] || `Player ${p + 1}`;

    const scoreBox = (p: number, k: number, { cat, label }: Line) => {
        const score = scorecards[p]?.[cat] ?? null;
        const taken = score !== null;
        const isActive = p === activePlayerIndex;
        const potential = potentialScores[cat];
        const live = isActive && !taken && canSelectCategory && potential !== undefined;
        const tier: OptionTier | undefined = live ? (tiers[cat] ?? 'fair') : undefined;
        const value = taken ? score : live ? potential : null;

        return (
            <button
                key={p}
                type="button"
                disabled={!live}
                onClick={live ? () => onSelectCategory(cat) : undefined}
                data-live={live || undefined}
                data-tier={tier}
                data-zero={(taken && score === 0) || undefined}
                data-writing={(isActive && highlightedCategory === cat) || undefined}
                data-undoable={(undo?.player === p && undo.category === cat) || undefined}
                aria-label={`${nameOf(p)}, ${label}: ${
                    taken ? `scored ${score}` : live ? `score ${potential}${tier === 'best' ? ', best option' : ''}` : 'open'
                }`}
                className={cx(styles.cell, styles.col, styles.score, k === 0 && styles.first, isActive && styles.active)}
            >
                {value !== null && (
                    <span className={styles.ink} style={pencilled(p, cat)}>
                        {value}
                    </span>
                )}
            </button>
        );
    };

    const scoreLine = (line: Line, i: number) => {
        const { cat, label, hint, pips } = line;
        const scorable =
            activeShown &&
            canSelectCategory &&
            activeCard?.[cat] === null &&
            potentialScores[cat] !== undefined;

        return (
            <div key={cat} className={styles.row} data-band={i % 2 === 1 || undefined} data-scorable={scorable || undefined}>
                <div className={cx(styles.cell, styles.label, styles.lineLabel)} onClick={scorable ? () => onSelectCategory(cat) : undefined}>
                    {pips && <PipDie value={pips} />}
                    <span className={styles.labelText}>{label}</span>
                    {hint && <span className={styles.hint}>· {hint}</span>}
                </div>
                {shown.map((p, k) => scoreBox(p, k, line))}
            </div>
        );
    };

    // Computed rows are printed, not pencilled: they're arithmetic, not something a player wrote.
    const sumLine = (label: string, values: number[], { hint, strong = false }: { hint?: string; strong?: boolean } = {}) => (
        <div key={label} className={cx(styles.row, styles.sumRow, strong && styles.strong)}>
            <div className={cx(styles.cell, styles.label, styles.sumLabel)}>
                <span>{label}</span>
                {hint && <span className={styles.hint}>· {hint}</span>}
            </div>
            {shown.map((p, k) => (
                <div
                    key={p}
                    data-zero={(values[p] ?? 0) === 0 || undefined}
                    className={cx(styles.cell, styles.col, styles.sum, k === 0 && styles.first, p === activePlayerIndex && styles.active)}
                >
                    {values[p] ?? 0}
                </div>
            ))}
        </div>
    );

    return (
        <div
            ref={rootRef}
            className={cx(styles.pad, 'relative overflow-y-auto overscroll-contain rounded-lg', className)}
            data-must-pick={(mustPick && canSelectCategory) || undefined}
            style={{ '--u': `${lineUnit.toFixed(1)}px`, '--head-top': `${tabbed ? TABS_HEIGHT : 0}px` } as React.CSSProperties}
        >
            {tabbed && (
                <div className={styles.tabs} style={{ height: TABS_HEIGHT }} role="tablist" aria-label="Players">
                    {playerNames.map((_, p) => (
                        <button
                            key={p}
                            type="button"
                            role="tab"
                            aria-selected={p === viewedPlayer}
                            onClick={() => setView({ player: p, turn: activePlayerIndex })}
                            className={styles.tab}
                            title={nameOf(p)}
                        >
                            <span className={styles.tabName}>
                                {p === activePlayerIndex && <span className={styles.turnDot} />}
                                {nameOf(p)}
                            </span>
                            <span className={styles.tabTotal}>{totals[p] ?? 0}</span>
                        </button>
                    ))}
                </div>
            )}

            <div
                className={styles.grid}
                style={{
                    gridTemplateColumns: `minmax(${LABEL_MIN}px, 1.45fr) repeat(${shown.length}, minmax(${COLUMN_MIN}px, 1fr))`,
                    gridTemplateRows: TEMPLATE_ROWS,
                    // A definite height, so the rows share out the space rather than sizing to
                    // their content; past the minimums they overflow and the pad scrolls.
                    height: tabbed ? `calc(100% - ${TABS_HEIGHT}px)` : '100%',
                }}
            >
                <div className={cx(styles.cell, styles.head, styles.corner)}>
                    {/* While the last score can be taken back, Undo takes the logo's place: it
                        is the one spot in the header that has the room at every width. */}
                    {undo && onUndo ? (
                        <button
                            key={undo.id}
                            type="button"
                            onClick={onUndo}
                            className={styles.undo}
                            aria-label={`Undo ${nameOf(undo.player)}'s ${LABELS[undo.category]}`}
                            title={`Take back ${LABELS[undo.category]} and replay the turn`}
                        >
                            <UndoArrow />
                            <span>Undo</span>
                            {/* A CPU plays next and rolls when this runs out, which ends the offer. */}
                            {undo.graceMs !== null && (
                                <span
                                    className={styles.undoTimer}
                                    style={{ animationDuration: `${undo.graceMs}ms` }}
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    ) : (
                        <span className={styles.logo}>Sarzee</span>
                    )}
                </div>
                {shown.map((p, k) => (
                    <div
                        key={`head-${p}`}
                        className={cx(styles.cell, styles.head, styles.col, styles.player, k === 0 && styles.first, p === activePlayerIndex && styles.active)}
                        title={nameOf(p)}
                    >
                        {playerColors[p] && <span className={styles.chip} style={{ backgroundColor: playerColors[p] }} />}
                        <span className={styles.name}>{nameOf(p)}</span>
                    </div>
                ))}

                <div className={styles.band}>Upper Section</div>
                {UPPER.map(scoreLine)}
                {sumLine('Total', subtotals)}
                {sumLine('Bonus', bonuses, { hint: '35 at 63+' })}
                {sumLine('Upper Total', subtotals.map((s, i) => s + bonuses[i]), { strong: true })}

                <div className={styles.band}>Lower Section</div>
                {LOWER.map(scoreLine)}
                {sumLine('Sarzee Bonus', yahtzeeBonuses, { hint: '100 each' })}
                {sumLine(
                    'Lower Total',
                    totals.map((t, i) => t - (subtotals[i] + bonuses[i])),
                    { strong: true }
                )}

                <div className="contents">
                    <div className={cx(styles.cell, styles.grand, styles.grandLabel)}>Grand Total</div>
                    {shown.map((p, k) => (
                        <div
                            key={`grand-${p}`}
                            className={cx(styles.cell, styles.col, styles.grand, styles.grandValue, k === 0 && styles.first, p === activePlayerIndex && styles.active)}
                        >
                            {totals[p] ?? 0}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

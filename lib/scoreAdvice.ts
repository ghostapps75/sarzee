// lib/scoreAdvice.ts
import { CpuAgent } from './CpuAgent';
import { ScoreCategory, Scorecard } from './types';

/**
 * How strongly the scorecard points at an open box for the dice on the table.
 *
 *   best    — where a sensible player would write this roll (ties share it)
 *   good    — a strong alternative
 *   fair    — scores something, but spends the box cheaply
 *   scratch — scores nothing
 */
export type OptionTier = 'best' | 'good' | 'fair' | 'scratch';

/** An alternative rated within this fraction of the best is still worth pointing at. */
const GOOD_FRACTION = 0.6;

/**
 * Ranks a player's open boxes for the current roll.
 *
 * Uses the balanced CPU's commit rating rather than raw points, so a modest score that
 * secures the upper bonus can outrank a bigger number spent in Chance — and so the
 * card's advice agrees with how the computer actually plays.
 */
export function rankOptions(
    scorecard: Scorecard,
    potentials: Partial<Record<ScoreCategory, number>>
): Partial<Record<ScoreCategory, OptionTier>> {
    const options = (Object.values(ScoreCategory) as ScoreCategory[])
        .filter((cat) => scorecard[cat] === null && potentials[cat] !== undefined)
        .map((cat) => {
            const score = potentials[cat] as number;
            // A Sarzee in an open Sarzee box is always the call, whatever the table says.
            const rating =
                cat === ScoreCategory.Yahtzee && score === 50
                    ? Infinity
                    : CpuAgent.rateCategoryCommit(cat, score, scorecard, 'BALANCED_BOBBY');
            return { cat, score, rating };
        });

    const tiers: Partial<Record<ScoreCategory, OptionTier>> = {};
    const scoring = options.filter((o) => o.score > 0);
    // When nothing scores, the decision is which box to give up: point at the cheapest.
    const pool = scoring.length > 0 ? scoring : options;
    if (pool.length === 0) return tiers;
    const top = Math.max(...pool.map((o) => o.rating));

    for (const o of options) {
        if (pool.includes(o) && o.rating >= top - 0.5) tiers[o.cat] = 'best';
        else if (o.score === 0) tiers[o.cat] = 'scratch';
        else if (top > 0 && o.rating >= top * GOOD_FRACTION) tiers[o.cat] = 'good';
        else tiers[o.cat] = 'fair';
    }
    return tiers;
}

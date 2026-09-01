import { DieValue, ScoreCategory, Scorecard } from "./types";
import { SarzeeEngine } from "./SarzeeEngine";

export type CpuPersonality = 'SAFE_SAM' | 'RISK_TAKING_ROSIE' | 'BALANCED_BOBBY';

export class CpuAgent {
    constructor(private engine: SarzeeEngine) { }

    /**
     * Determines which dice to hold based on personality and current scorecard state.
     * Evaluates all 32 hold combinations and picks the one with the highest utility.
     */
    public decideHold(
        dice: DieValue[],
        rollsLeft: number,
        scorecard: Scorecard,
        personality: CpuPersonality
    ): boolean[] {
        if (rollsLeft === 0) return [true, true, true, true, true];

        let bestHold = [false, false, false, false, false];
        let maxUtility = -Infinity;

        // Evaluate all 32 possible hold combinations (binary 00000 to 11111)
        for (let mask = 0; mask < 32; mask++) {
            const hold = [
                !!(mask & 1),
                !!(mask & 2),
                !!(mask & 4),
                !!(mask & 8),
                !!(mask & 16),
            ];

            const utility = this.evaluateHoldUtility(dice, hold, rollsLeft, scorecard, personality);
            if (utility > maxUtility) {
                maxUtility = utility;
                bestHold = hold;
            }
        }

        return bestHold;
    }

    /**
     * Rates the utility of holding a specific subset of the rolled dice.
     */
    private evaluateHoldUtility(
        dice: DieValue[],
        hold: boolean[],
        rollsLeft: number,
        scorecard: Scorecard,
        personality: CpuPersonality
    ): number {
        const heldValues = dice.filter((_, idx) => hold[idx]);
        const unheldCount = 5 - heldValues.length;

        // Personality weight adjustments
        let upperWeight = 1.0;
        let straightWeight = 1.0;
        let highRiskWeight = 1.0;

        if (personality === 'SAFE_SAM') {
            upperWeight = 2.2;
            straightWeight = 0.5;
            highRiskWeight = 0.4;
        } else if (personality === 'RISK_TAKING_ROSIE') {
            upperWeight = 0.6;
            straightWeight = 1.8;
            highRiskWeight = 2.5;
        }

        let utility = 0;

        // 1. Yahtzee (Sarzee) Utility Heuristic
        const isYahtzeeOpen = scorecard[ScoreCategory.Yahtzee] === null;
        const counts = new Array(7).fill(0);
        heldValues.forEach(v => counts[v]++);
        const maxFreq = Math.max(...counts);

        if (isYahtzeeOpen || scorecard[ScoreCategory.Yahtzee] === 50) {
            // If we hold matching numbers
            if (maxFreq >= 2) {
                const probFactor = rollsLeft * (maxFreq / 5);
                utility += 45 * probFactor * highRiskWeight;
                if (maxFreq === 4) utility += 30 * rollsLeft * highRiskWeight; // Huge push for 4 of a kind
                if (maxFreq === 5) utility += 200; // Lock in Yahtzee!
            }
        }

        // 2. Upper Section Heuristic
        const upperCats: Record<number, ScoreCategory> = {
            1: ScoreCategory.Ones,
            2: ScoreCategory.Twos,
            3: ScoreCategory.Threes,
            4: ScoreCategory.Fours,
            5: ScoreCategory.Fives,
            6: ScoreCategory.Sixes,
        };

        for (let v = 1; v <= 6; v++) {
            const cat = upperCats[v];
            if (scorecard[cat] === null) {
                const heldCount = counts[v] || 0;
                if (heldCount > 0) {
                    // Expectation: current held count + probability of rolling more
                    const expectedTotal = heldCount + (unheldCount / 6) * rollsLeft;
                    const expectedScore = expectedTotal * v;
                    
                    // Extra bonus for keeping high numbers for upper sections
                    const upperValBonus = v >= 4 ? 1.2 : 0.8;
                    utility += expectedScore * upperWeight * upperValBonus;
                }
            }
        }

        // 3. Straights Heuristic
        const isSmallStraightOpen = scorecard[ScoreCategory.SmallStraight] === null;
        const isLargeStraightOpen = scorecard[ScoreCategory.LargeStraight] === null;

        if (isSmallStraightOpen || isLargeStraightOpen) {
            const uniqueSorted = Array.from(new Set(heldValues)).sort((a, b) => a - b);
            
            // Find longest sequence length in held values
            let maxSeq = 0;
            if (uniqueSorted.length > 0) {
                maxSeq = 1;
                let curSeq = 1;
                for (let i = 0; i < uniqueSorted.length - 1; i++) {
                    if (uniqueSorted[i+1] === uniqueSorted[i] + 1) {
                        curSeq++;
                    } else if (uniqueSorted[i+1] !== uniqueSorted[i]) {
                        curSeq = 1;
                    }
                    maxSeq = Math.max(maxSeq, curSeq);
                }
            }

            if (maxSeq >= 4 && isSmallStraightOpen) {
                utility += 35 * straightWeight;
            }
            if (maxSeq >= 5 && isLargeStraightOpen) {
                utility += 60 * straightWeight;
            }
            
            // Near straights
            if (maxSeq === 3 && (isSmallStraightOpen || isLargeStraightOpen)) {
                utility += 15 * rollsLeft * straightWeight;
            }
            if (maxSeq === 4 && isLargeStraightOpen) {
                utility += 25 * rollsLeft * straightWeight;
            }
        }

        // 4. Full House Heuristic
        const isFullHouseOpen = scorecard[ScoreCategory.FullHouse] === null;
        if (isFullHouseOpen && heldValues.length > 0) {
            const freqSorted = [...counts].sort((a, b) => b - a);
            const topFreq = freqSorted[0];
            const secFreq = freqSorted[1];

            if (topFreq === 3 && secFreq === 2) {
                utility += 30; // Secure Full House
            } else if (topFreq === 3) {
                utility += 12 * rollsLeft; // 3 of a kind is 60% on the way
            } else if (topFreq === 2 && secFreq === 2) {
                utility += 15 * rollsLeft; // Two pairs is 33% on the way
            }
        }

        // 5. Chance Heuristic
        const isChanceOpen = scorecard[ScoreCategory.Chance] === null;
        if (isChanceOpen) {
            // Encourage holding high values (4s, 5s, 6s)
            const sumHeld = heldValues.reduce((s, v) => s + (v - 3.5), 0);
            utility += sumHeld * 0.8;
        }

        // Slight penalty for holding too many dice without a plan, to encourage rolling
        if (heldValues.length > 0 && heldValues.length < 5) {
            utility -= heldValues.length * 0.5;
        }

        return utility;
    }

    /**
     * Chooses the optimal score category to commit the current roll.
     */
    public decideCategory(
        scorecard: Scorecard,
        potentialScores: Record<ScoreCategory, number>,
        personality: CpuPersonality
    ): ScoreCategory | null {
        const openCategories = Object.values(ScoreCategory).filter(
            (cat) => scorecard[cat] === null
        ) as ScoreCategory[];

        if (openCategories.length === 0) return null;

        // Yahtzee is open and we have 50 points? LOCK IT IN!
        if (
            openCategories.includes(ScoreCategory.Yahtzee) &&
            potentialScores[ScoreCategory.Yahtzee] === 50
        ) {
            return ScoreCategory.Yahtzee;
        }

        let bestCategory: ScoreCategory | null = null;
        let maxRating = -Infinity;

        for (const cat of openCategories) {
            const score = potentialScores[cat];
            const rating = this.rateCategoryCommit(cat, score, scorecard, personality);
            if (rating > maxRating) {
                maxRating = rating;
                bestCategory = cat;
            }
        }

        return bestCategory;
    }

    /**
     * Evaluates the relative value of locking in a specific score for a category.
     * Accounts for scratching (scoring 0) by assigning lesser penalties to easy-to-scratch boxes.
     */
    private rateCategoryCommit(
        category: ScoreCategory,
        score: number,
        scorecard: Scorecard,
        personality: CpuPersonality
    ): number {
        // Base rating starts with the actual points
        let rating = score;

        // Personality multipliers
        let upperMultiplier = 1.0;
        let lowerMultiplier = 1.0;

        if (personality === 'SAFE_SAM') {
            upperMultiplier = 1.6;
            lowerMultiplier = 0.7;
        } else if (personality === 'RISK_TAKING_ROSIE') {
            upperMultiplier = 0.7;
            lowerMultiplier = 1.4;
        }

        // 1. Upper Section Rating Adjustments
        const isUpper = [
            ScoreCategory.Ones,
            ScoreCategory.Twos,
            ScoreCategory.Threes,
            ScoreCategory.Fours,
            ScoreCategory.Fives,
            ScoreCategory.Sixes,
        ].includes(category);

        if (isUpper) {
            const val = this.getCategoryValue(category);
            const count = score / val;

            if (count >= 3) {
                rating += 15 * upperMultiplier; // Reward securing the upper bonus (average >= 3 per box)
            }
            if (count >= 4) {
                rating += 25 * upperMultiplier;
            }
            
            // Scratching penalty
            if (score === 0) {
                // Scratching Ones is cheap (-2), scratching Sixes is extremely painful (-18)
                rating = -(val * 3) - 1;
            } else if (count < 3) {
                // Slightly penalize a subpar score in upper section
                rating -= (3 - count) * val * 0.5;
            }

            rating *= upperMultiplier;
        } else {
            // 2. Lower Section Rating Adjustments
            if (score > 0) {
                switch (category) {
                    case ScoreCategory.LargeStraight:
                        rating += 50 * lowerMultiplier; // High value
                        break;
                    case ScoreCategory.SmallStraight:
                        rating += 30 * lowerMultiplier;
                        break;
                    case ScoreCategory.FullHouse:
                        rating += 25 * lowerMultiplier;
                        break;
                    case ScoreCategory.ThreeOfAKind:
                        rating += (score > 20 ? 15 : 5) * lowerMultiplier;
                        break;
                    case ScoreCategory.FourOfAKind:
                        rating += (score > 20 ? 25 : 10) * lowerMultiplier;
                        break;
                    case ScoreCategory.Chance:
                        if (score >= 22) rating += 15;
                        else if (score < 14) rating -= 10; // Keep Chance open for high numbers if possible
                        break;
                }
            } else {
                // Scratching lower section
                switch (category) {
                    case ScoreCategory.Yahtzee:
                        rating = -8; // Scratching Yahtzee is a standard fallback since it is rare
                        break;
                    case ScoreCategory.LargeStraight:
                        rating = -25 * lowerMultiplier;
                        break;
                    case ScoreCategory.SmallStraight:
                        rating = -18 * lowerMultiplier;
                        break;
                    case ScoreCategory.FullHouse:
                        rating = -15 * lowerMultiplier;
                        break;
                    case ScoreCategory.FourOfAKind:
                        rating = -12 * lowerMultiplier;
                        break;
                    case ScoreCategory.ThreeOfAKind:
                        rating = -10 * lowerMultiplier;
                        break;
                    case ScoreCategory.Chance:
                        rating = -30; // Scratching Chance is absolute worst case
                        break;
                }
            }

            rating *= lowerMultiplier;
        }

        return rating;
    }

    private getCategoryValue(cat: ScoreCategory): number {
        switch (cat) {
            case ScoreCategory.Ones: return 1;
            case ScoreCategory.Twos: return 2;
            case ScoreCategory.Threes: return 3;
            case ScoreCategory.Fours: return 4;
            case ScoreCategory.Fives: return 5;
            case ScoreCategory.Sixes: return 6;
            default: return 0;
        }
    }
}

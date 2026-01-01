// lib/SarzeeEngine.ts
import { DieValue, GameState, ScoreCategory, Scorecard } from './types';

export class SarzeeEngine {
    private state: GameState;

    constructor() {
        this.state = this.getInitialState();
    }

    private getInitialState(): GameState {
        const emptyScorecard: Scorecard = Object.values(ScoreCategory).reduce((acc, category) => {
            acc[category] = null;
            return acc;
        }, {} as Scorecard);

        return {
            currentTurn: 1,
            rollsLeft: 3,
            diceValues: [1, 1, 1, 1, 1],
            heldDice: [false, false, false, false, false],
            scorecard: emptyScorecard,
            isGameOver: false,
            totalScore: 0,
            yahtzeeBonus: 0,
        };
    }

    public getGameState(): GameState {
        return JSON.parse(JSON.stringify(this.state));
    }

    public toggleHold(index: number) {
        if (this.state.rollsLeft === 3 || this.state.rollsLeft === 0 || this.state.isGameOver) return;
        if (index >= 0 && index < 5) this.state.heldDice[index] = !this.state.heldDice[index];
    }

    public rollDice(newValues: DieValue[]) {
        if (this.state.rollsLeft <= 0 || this.state.isGameOver) throw new Error('No rolls left or game is over');
        if (newValues.length !== 5) throw new Error('Must provide exactly 5 die values');

        // Apply new values only to non-held dice.
        const nextDice = [...this.state.diceValues] as DieValue[];
        let anyDieActuallyRolled = false;

        for (let i = 0; i < 5; i++) {
            if (!this.state.heldDice[i]) {
                anyDieActuallyRolled = true;
                nextDice[i] = newValues[i];
            }
        }

        this.state.diceValues = nextDice;
        this.state.rollsLeft--;

        // ---- Multiple Yahtzees bonus (100 each) ----
        // Only if Yahtzee box was scored as 50 (a 0 disqualifies bonuses).
        // Also guard against "rolling" with all dice held.
        if (anyDieActuallyRolled && this.isYahtzee(nextDice)) {
            const yahtzeeBox = this.state.scorecard[ScoreCategory.Yahtzee];
            if (yahtzeeBox !== null && yahtzeeBox >= 50) {
                this.state.yahtzeeBonus += 100;
                this.state.totalScore += 100;
            }
        }
    }

    /** Returns true only when Yahtzee box is filled with 50 and current dice are a Yahtzee. */
    private isJokerActive(dice: DieValue[] = this.state.diceValues): boolean {
        if (!this.isYahtzee(dice)) return false;
        const yahtzeeBox = this.state.scorecard[ScoreCategory.Yahtzee];
        return yahtzeeBox !== null && yahtzeeBox >= 50;
    }

    /** Upper category corresponding to Yahtzee face (e.g., five 4s -> Fours). */
    private upperCategoryForFace(face: DieValue): ScoreCategory {
        switch (face) {
            case 1:
                return ScoreCategory.Ones;
            case 2:
                return ScoreCategory.Twos;
            case 3:
                return ScoreCategory.Threes;
            case 4:
                return ScoreCategory.Fours;
            case 5:
                return ScoreCategory.Fives;
            case 6:
                return ScoreCategory.Sixes;
            default:
                return ScoreCategory.Ones;
        }
    }

    /** Joker priority rule: if corresponding upper box is open, it MUST be used. */
    private requiredUpperCategoryIfAny(dice: DieValue[] = this.state.diceValues): ScoreCategory | null {
        if (!this.isJokerActive(dice)) return null;
        const face = dice[0];
        const upperCat = this.upperCategoryForFace(face);
        return this.state.scorecard[upperCat] === null ? upperCat : null;
    }

    /** Whether selecting this category is legal under Joker rule (when active). */
    public isCategoryAllowed(category: ScoreCategory, dice: DieValue[] = this.state.diceValues): boolean {
        if (!this.isJokerActive(dice)) return true;

        // Joker Rule: you must score somewhere OTHER than the Yahtzee box.
        if (category === ScoreCategory.Yahtzee) return false;

        // Priority: if corresponding upper box open, you MUST score there.
        const required = this.requiredUpperCategoryIfAny(dice);
        if (required) return category === required;

        // Otherwise: any open lower box is allowed, and any other upper box is allowed too
        // (but typical rules say you "may" take any lower; allowing any upper is harmless and matches many implementations).
        // If you want STRICT: only lower when the required upper is filled, uncomment the strict check below.
        return true;

        // STRICT variant (commented):
        // const isUpper =
        //   category === ScoreCategory.Ones ||
        //   category === ScoreCategory.Twos ||
        //   category === ScoreCategory.Threes ||
        //   category === ScoreCategory.Fours ||
        //   category === ScoreCategory.Fives ||
        //   category === ScoreCategory.Sixes;
        // return !isUpper;
    }

    public calculatePotentialScore(category: ScoreCategory, dice: DieValue[] = this.state.diceValues): number {
        const counts = new Array(7).fill(0);
        let sum = 0;

        for (const d of dice) {
            counts[d]++;
            sum += d;
        }

        const joker = this.isJokerActive(dice);

        switch (category) {
            case ScoreCategory.Ones:
                return counts[1] * 1;
            case ScoreCategory.Twos:
                return counts[2] * 2;
            case ScoreCategory.Threes:
                return counts[3] * 3;
            case ScoreCategory.Fours:
                return counts[4] * 4;
            case ScoreCategory.Fives:
                return counts[5] * 5;
            case ScoreCategory.Sixes:
                return counts[6] * 6;

            case ScoreCategory.ThreeOfAKind:
                // Yahtzee also qualifies (counts[die] === 5)
                return counts.some((c) => c >= 3) ? sum : 0;

            case ScoreCategory.FourOfAKind:
                return counts.some((c) => c >= 4) ? sum : 0;

            case ScoreCategory.FullHouse: {
                // Joker rule: if Yahtzee+Joker, Full House is allowed and scores 25.
                if (joker) return 25;

                const has3 = counts.some((c) => c === 3);
                const has2 = counts.some((c) => c === 2);
                const has5 = counts.some((c) => c === 5);
                return (has3 && has2) || has5 ? 25 : 0;
            }

            case ScoreCategory.SmallStraight:
                // Joker rule: if Yahtzee+Joker, treat as straight for fixed score.
                if (joker) return 30;
                return this.hasSequence(dice, 4) ? 30 : 0;

            case ScoreCategory.LargeStraight:
                if (joker) return 40;
                return this.hasSequence(dice, 5) ? 40 : 0;

            case ScoreCategory.Yahtzee:
                return counts.some((c) => c === 5) ? 50 : 0;

            case ScoreCategory.Chance:
                return sum;

            default:
                return 0;
        }
    }

    private hasSequence(dice: DieValue[], length: number): boolean {
        const uniqueSorted = Array.from(new Set(dice)).sort((a, b) => a - b);
        let currentSeq = 1;
        let maxSeq = 1;

        for (let i = 0; i < uniqueSorted.length - 1; i++) {
            if (uniqueSorted[i + 1] === uniqueSorted[i] + 1) currentSeq++;
            else currentSeq = 1;
            maxSeq = Math.max(maxSeq, currentSeq);
        }

        return maxSeq >= length;
    }

    private isYahtzee(dice: DieValue[]) {
        return dice.length === 5 && dice.every((d) => d === dice[0]);
    }

    public commitScore(category: ScoreCategory) {
        if (this.state.isGameOver) throw new Error('Game is over');
        if (this.state.scorecard[category] !== null) throw new Error('Category already scored');
        if (this.state.rollsLeft === 3) throw new Error('Must roll at least once');

        // ---- Joker rule enforcement (when active) ----
        if (!this.isCategoryAllowed(category, this.state.diceValues)) {
            const face = this.state.diceValues[0];
            const required = this.requiredUpperCategoryIfAny(this.state.diceValues);
            if (required) {
                throw new Error(`Joker rule: must score ${required} for five ${face}s`);
            }
            throw new Error('Joker rule: cannot score Yahtzee box on a bonus Yahtzee');
        }

        const score = this.calculatePotentialScore(category, this.state.diceValues);

        this.state.scorecard[category] = score;
        this.state.totalScore += score;

        this.advanceTurn();
    }

    private advanceTurn() {
        if (Object.values(this.state.scorecard).every((v) => v !== null)) {
            this.state.isGameOver = true;
            return;
        }

        this.state.currentTurn++;
        this.state.rollsLeft = 3;
        this.state.heldDice = [false, false, false, false, false];
    }

    // Dev-only helper
    public _forceDice(dice: DieValue[]) {
        this.state.diceValues = dice;
    }
}

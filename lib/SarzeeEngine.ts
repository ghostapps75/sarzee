import { DieValue, GameState, ScoreCategory, Scorecard } from './types';

const UPPER_CATEGORIES = [
    ScoreCategory.Ones,
    ScoreCategory.Twos,
    ScoreCategory.Threes,
    ScoreCategory.Fours,
    ScoreCategory.Fives,
    ScoreCategory.Sixes,
];

/** The upper section pays a bonus once its six boxes reach this: three of each number. */
const UPPER_BONUS_THRESHOLD = 63;
const UPPER_BONUS = 35;

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
            diceValues: [1, 1, 1, 1, 1], // Initial dummy values
            heldDice: [false, false, false, false, false],
            scorecard: emptyScorecard,
            isGameOver: false,
            totalScore: 0,
            upperBonus: 0,
            yahtzeeBonus: 0,
        };
    }

    public getGameState(): GameState {
        // Return a copy to prevent mutation
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Puts the engine back to a state taken earlier with `getGameState`. This is how a
     * score is undone: restoring the snapshot from before the commit brings back the
     * box, the bonuses, the turn counter and game over exactly, where reversing the
     * arithmetic would have to know every rule `commitScore` applies.
     */
    public restoreState(state: GameState) {
        this.state = JSON.parse(JSON.stringify(state));
    }

    public toggleHold(index: number) {
        // Holding is only meaningful between rolls: there is nothing to keep before the
        // first roll, and after the third the only move left is to pick a category.
        if (this.state.rollsLeft === 3 || this.state.rollsLeft === 0 || this.state.isGameOver) return;
        if (index < 0 || index > 4) return;
        this.state.heldDice[index] = !this.state.heldDice[index];
    }

    public rollDice(newValues: DieValue[]) {
        if (this.state.rollsLeft <= 0 || this.state.isGameOver) {
            throw new Error('No rolls left or game is over');
        }

        if (newValues.length !== 5) {
            throw new Error('Must provide exactly 5 die values from the physics engine');
        }

        // Update only unheld dice
        // Note: The physics engine usually gives us the FINAL state of ALL dice.
        // But if we simulate, the physics engine should respect "held" dice (locked in place).
        // The Engine just accepts the result.
        // However, to be "Source of Truth", maybe we should only accept updates for unheld indices?
        // Let's assume the input `newValues` respects the held dice constraints (i.e. caller shouldn't have changed held dice).
        // But for safety:
        const nextDice = [...this.state.diceValues];
        for (let i = 0; i < 5; i++) {
            if (!this.state.heldDice[i]) {
                nextDice[i] = newValues[i];
            }
        }
        this.state.diceValues = nextDice as DieValue[];
        this.state.rollsLeft--;

        // Auto-unhold if this was the last roll? No, user needs to pick score.
    }

    public calculatePotentialScore(category: ScoreCategory, dice: DieValue[] = this.state.diceValues): number {
        const counts = new Array(7).fill(0);
        let sum = 0;
        for (const d of dice) {
            counts[d]++;
            sum += d;
        }

        // Joker rule: once the Yahtzee box has been used (50 or scratched) and the matching
        // upper box is also gone, a further five-of-a-kind may be scored in Full House /
        // Small Straight / Large Straight at full face value.
        if (this.isJokerActive(dice)) {
            switch (category) {
                case ScoreCategory.FullHouse: return 25;
                case ScoreCategory.SmallStraight: return 30;
                case ScoreCategory.LargeStraight: return 40;
                default: break; // everything else scores normally
            }
        }

        switch (category) {
            case ScoreCategory.Ones: return counts[1] * 1;
            case ScoreCategory.Twos: return counts[2] * 2;
            case ScoreCategory.Threes: return counts[3] * 3;
            case ScoreCategory.Fours: return counts[4] * 4;
            case ScoreCategory.Fives: return counts[5] * 5;
            case ScoreCategory.Sixes: return counts[6] * 6;

            case ScoreCategory.ThreeOfAKind:
                return counts.some(c => c >= 3) ? sum : 0;

            case ScoreCategory.FourOfAKind:
                return counts.some(c => c >= 4) ? sum : 0;

            case ScoreCategory.FullHouse:
                // Strictly 3 of one number and 2 of another. Five of a kind only counts
                // when the Joker rule is active (handled above).
                return counts.some(c => c === 3) && counts.some(c => c === 2) ? 25 : 0;

            case ScoreCategory.SmallStraight:
                // 4 sequential dice
                if (this.hasSequence(dice, 4)) return 30;
                return 0;

            case ScoreCategory.LargeStraight:
                // 5 sequential dice
                if (this.hasSequence(dice, 5)) return 40;
                return 0;

            case ScoreCategory.Yahtzee:
                return counts.some(c => c === 5) ? 50 : 0;

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
            if (uniqueSorted[i + 1] === uniqueSorted[i] + 1) {
                currentSeq++;
            } else {
                currentSeq = 1;
            }
            maxSeq = Math.max(maxSeq, currentSeq);
        }
        return maxSeq >= length;
    }

    public commitScore(category: ScoreCategory) {
        if (this.state.isGameOver) throw new Error('Game is over');
        if (this.state.scorecard[category] !== null) throw new Error('Category already scored');
        if (this.state.rollsLeft === 3 && this.state.currentTurn > 0) {
            // Technically can't score without rolling at least once per turn?
            // Actually you can score 0 on "Chance" with initial dice if you want... but usually need to roll.
            // Let's enforce: MUST roll at least once.
            throw new Error('Must roll at least once');
        }

        // Check for bonus Yahtzee. Standard rule: the bonus only applies if the Yahtzee
        // box was actually scored as 50. A scratched Yahtzee (0) forfeits all future bonuses.
        const isBonusYahtzee = this.state.scorecard[ScoreCategory.Yahtzee] === 50 &&
                               this.isYahtzee(this.state.diceValues);

        const score = this.calculatePotentialScore(category);
        this.state.scorecard[category] = score;
        this.state.totalScore += score;

        // The upper bonus is awarded once, at the moment the upper boxes reach 63. The
        // scorecard shows this value rather than working it out again, so the card and
        // the standings can never disagree about it.
        if (
            UPPER_CATEGORIES.includes(category) &&
            this.state.upperBonus === 0 &&
            this.upperSum() >= UPPER_BONUS_THRESHOLD
        ) {
            this.state.upperBonus = UPPER_BONUS;
            this.state.totalScore += UPPER_BONUS;
        }

        // If this is a bonus Yahtzee, add 100 bonus points
        // Note: You must score the bonus Yahtzee somewhere (even if 0) to get the bonus
        if (isBonusYahtzee) {
            this.state.yahtzeeBonus += 100;
            this.state.totalScore += 100;
        }

        // Reset for next turn
        this.advanceTurn();
    }

    /**
     * True when the current dice are five of a kind, the Yahtzee box has already been
     * used, and the upper box for that number is also filled. Under those conditions the
     * roll acts as a wildcard in the three "pattern" categories.
     */
    private isJokerActive(dice: DieValue[]): boolean {
        if (!this.isYahtzee(dice)) return false;
        if (this.state.scorecard[ScoreCategory.Yahtzee] === null) return false;

        const matchingUpper = UPPER_CATEGORIES[dice[0] - 1];
        return this.state.scorecard[matchingUpper] !== null;
    }

    private upperSum(): number {
        return UPPER_CATEGORIES.reduce((sum, cat) => sum + (this.state.scorecard[cat] ?? 0), 0);
    }

    private isYahtzee(dice: DieValue[]): boolean {
        const counts = new Array(7).fill(0);
        for (const d of dice) {
            counts[d]++;
        }
        return counts.some(c => c === 5);
    }

    private advanceTurn() {
        // Check if game over
        if (Object.values(this.state.scorecard).every(v => v !== null)) {
            this.state.isGameOver = true;
        } else {
            this.state.currentTurn++;
            this.state.rollsLeft = 3;
            // Vital: Reset held dice so next player starts fresh
            this.state.heldDice = [false, false, false, false, false];
            // Dice values persist until next roll, but logic handles that
        }
    }

    /** Test hook: sets the dice without spending a roll. */
    public _forceDice(dice: DieValue[]) {
        this.state.diceValues = dice;
    }
}

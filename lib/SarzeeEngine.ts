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
            diceValues: [1, 1, 1, 1, 1], // Initial dummy values
            heldDice: [false, false, false, false, false],
            scorecard: emptyScorecard,
            isGameOver: false,
            totalScore: 0,
            yahtzeeBonus: 0,
        };
    }

    public getGameState(): GameState {
        // Return a copy to prevent mutation
        return JSON.parse(JSON.stringify(this.state));
    }

    public toggleHold(index: number) {
        console.log(`Engine: toggleHold(${index}). rollsLeft: ${this.state.rollsLeft}`);
        if (this.state.rollsLeft === 3 || this.state.rollsLeft === 0 || this.state.isGameOver) {
            // Exception: If rollsLeft is 0, we are selecting a score, not holding dice?
            // Actually standard Yahtzee allows toggling hold even after last roll? No, usually you just pick a score.
            // But definitely cannot hold if you haven't rolled yet (rollsLeft=3).
            console.log("Engine: toggleHold rejected. Invalid phase.");
            return;
        }

        if (index >= 0 && index < 5) {
            this.state.heldDice[index] = !this.state.heldDice[index];
            console.log(`Engine: toggleHold success. New state for die ${index}: ${this.state.heldDice[index]}`);
        }
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
                // 3 of one, 2 of another OR 5 of one (Technically 5 of a kind is also a full house in some variants, but standard Yahtzee validation usually checks for 3+2 or 5)
                // Standard rule: 3 of one number and 2 of another.
                // A Yahtzee (5 of a kind) can be scored as a Full House (25 pts) if Yahtzee box is full? Or just generally?
                // Let's implement strict boolean check: (3 val A && 2 val B) || (5 val A)
                const has3 = counts.some(c => c === 3);
                const has2 = counts.some(c => c === 2);
                const has5 = counts.some(c => c === 5);
                return (has3 && has2) || has5 ? 25 : 0;

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

        const score = this.calculatePotentialScore(category);
        this.state.scorecard[category] = score;
        this.state.totalScore += score;

        // Reset for next turn
        this.advanceTurn();
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

    // Debug/Cheat methods could go here
    public _forceDice(dice: DieValue[]) {
        this.state.diceValues = dice;
    }

    public debugSetNearEndgame(targetScore?: number) {
        // Populate scorecard with realistic random scores, leaving 1-2 categories empty
        const categories = Object.values(ScoreCategory);
        const scores = [...categories].sort(() => Math.random() - 0.5); // Shuffle
        const toFill = scores.slice(0, Math.max(11, scores.length - 2)); // Fill all but 1-2
        
        // Reset scorecard and total
        const emptyScorecard: Scorecard = Object.values(ScoreCategory).reduce((acc, category) => {
            acc[category] = null;
            return acc;
        }, {} as Scorecard);
        this.state.scorecard = emptyScorecard;
        
        let newTotal = 0;
        for (const cat of toFill) {
            let score: number;
            switch (cat) {
                case ScoreCategory.Ones:
                case ScoreCategory.Twos:
                case ScoreCategory.Threes:
                case ScoreCategory.Fours:
                case ScoreCategory.Fives:
                case ScoreCategory.Sixes:
                    // Upper section: random 0-5 of that number
                    const num = parseInt(cat.replace(/\D/g, ''));
                    const count = Math.floor(Math.random() * 4); // 0-3
                    score = count * num;
                    break;
                case ScoreCategory.ThreeOfAKind:
                case ScoreCategory.FourOfAKind:
                    // Random sum (15-30 typical)
                    score = Math.floor(Math.random() * 16) + 15;
                    break;
                case ScoreCategory.FullHouse:
                    score = Math.random() > 0.3 ? 25 : 0; // 70% chance
                    break;
                case ScoreCategory.SmallStraight:
                    score = Math.random() > 0.2 ? 30 : 0; // 80% chance
                    break;
                case ScoreCategory.LargeStraight:
                    score = Math.random() > 0.4 ? 40 : 0; // 60% chance
                    break;
                case ScoreCategory.Yahtzee:
                    score = Math.random() > 0.7 ? 50 : 0; // 30% chance
                    break;
                case ScoreCategory.Chance:
                    // Random sum (10-30 typical)
                    score = Math.floor(Math.random() * 21) + 10;
                    break;
                default:
                    score = 0;
            }
            
            this.state.scorecard[cat] = score;
            newTotal += score;
        }
        
        // If targetScore provided, adjust total by tweaking last filled category
        if (targetScore !== undefined && toFill.length > 0) {
            const lastCat = toFill[toFill.length - 1];
            const currentCatScore = this.state.scorecard[lastCat] ?? 0;
            const adjustment = targetScore - newTotal;
            this.state.scorecard[lastCat] = Math.max(0, currentCatScore + adjustment);
            newTotal = targetScore;
        }
        
        this.state.totalScore = newTotal;
        this.state.currentTurn = 12; // Near the end
        this.state.rollsLeft = Math.floor(Math.random() * 2) + 1; // 1 or 2 rolls left
        this.state.isGameOver = false; // Not quite over yet
    }
}

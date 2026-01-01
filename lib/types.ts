// lib/types.ts
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export enum ScoreCategory {
    Ones = 'Ones',
    Twos = 'Twos',
    Threes = 'Threes',
    Fours = 'Fours',
    Fives = 'Fives',
    Sixes = 'Sixes',
    ThreeOfAKind = 'ThreeOfAKind',
    FourOfAKind = 'FourOfAKind',
    FullHouse = 'FullHouse',
    SmallStraight = 'SmallStraight',
    LargeStraight = 'LargeStraight',
    Yahtzee = 'Yahtzee',
    Chance = 'Chance',
}

export type Scorecard = Record<ScoreCategory, number | null>;

export interface GameState {
    currentTurn: number; // 1..13
    rollsLeft: number; // 3,2,1,0
    diceValues: DieValue[];
    heldDice: boolean[]; // indices 0-4
    scorecard: Scorecard;
    isGameOver: boolean;

    /** Running total including bonuses (upper bonus + Yahtzee bonus). */
    totalScore: number;

    /**
     * Yahtzee bonus points (standard rules: +100 for each additional Yahtzee
     * after the Yahtzee box has been scored as 50).
     */
    yahtzeeBonus: number;
}

export interface Die {
    id: number;
    value: DieValue;
    isRolling: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
}

export type GamePhase = 'SETUP' | 'PLAYING' | 'GAME_OVER';

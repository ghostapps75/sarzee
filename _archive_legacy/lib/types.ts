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
    currentTurn: number; // 1 to 13?
    rollsLeft: number; // 3, 2, 1, 0
    diceValues: DieValue[];
    heldDice: boolean[]; // Indices 0-4
    scorecard: Scorecard;
    isGameOver: boolean;
    totalScore: number;
}

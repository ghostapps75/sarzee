import { SarzeeEngine } from './SarzeeEngine';
import { ScoreCategory } from './types';
import assert from 'assert';

async function runTests() {
    console.log("Running Sarzee Logic Tests...");
    const engine = new SarzeeEngine();

    // Test Initial State
    console.log("Test 1: Initial State");
    let state = engine.getGameState();
    assert.strictEqual(state.currentTurn, 1);
    assert.strictEqual(state.rollsLeft, 3);
    assert.deepStrictEqual(state.heldDice, [false, false, false, false, false]);
    console.log("  PASS");

    // Test Rolling
    console.log("Test 2: Rolling updates rollsLeft");
    engine.rollDice([1, 2, 3, 4, 5]);
    state = engine.getGameState();
    assert.strictEqual(state.rollsLeft, 2);
    assert.deepStrictEqual(state.diceValues, [1, 2, 3, 4, 5]);
    console.log("  PASS");

    // Test Holding
    console.log("Test 3: Holding dice preserves value on roll");
    engine.toggleHold(0); // Hold the '1' at index 0
    engine.rollDice([6, 6, 6, 6, 6]);
    state = engine.getGameState();
    assert.strictEqual(state.diceValues[0], 1);
    assert.strictEqual(state.diceValues[1], 6);
    console.log("  PASS");

    // Test Scoring Logic
    console.log("Test 4: Scoring Categories");

    // Large Straight
    engine._forceDice([1, 2, 3, 4, 5]);
    assert.strictEqual(engine.calculatePotentialScore(ScoreCategory.LargeStraight), 40);

    // Full House
    engine._forceDice([3, 3, 3, 5, 5]);
    assert.strictEqual(engine.calculatePotentialScore(ScoreCategory.FullHouse), 25);

    // Yahtzee
    engine._forceDice([6, 6, 6, 6, 6]);
    assert.strictEqual(engine.calculatePotentialScore(ScoreCategory.Yahtzee), 50);

    // Chance
    engine._forceDice([1, 2, 1, 2, 1]);
    assert.strictEqual(engine.calculatePotentialScore(ScoreCategory.Chance), 7);
    console.log("  PASS");

    // Test Game Loop / Committing Score
    console.log("Test 5: Committing Score advances turn");
    engine._forceDice([6, 6, 6, 6, 6]);
    engine.commitScore(ScoreCategory.Yahtzee);
    state = engine.getGameState();
    assert.strictEqual(state.scorecard[ScoreCategory.Yahtzee], 50);
    assert.strictEqual(state.currentTurn, 2);
    assert.strictEqual(state.rollsLeft, 3);
    console.log("  PASS");

    console.log("ALL TESTS PASSED");
}

runTests().catch(e => {
    console.error("TEST FAILED:", e);
    process.exit(1);
});

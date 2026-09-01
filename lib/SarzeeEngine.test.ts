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

    // Test 6: the Yahtzee bonus is forfeited by a scratched Yahtzee box
    console.log("Test 6: no bonus after a scratched Sarzee");
    {
        const e = new SarzeeEngine();
        e.rollDice([1, 2, 3, 4, 6]);
        e._forceDice([1, 2, 3, 4, 6]);
        e.commitScore(ScoreCategory.Yahtzee); // scratch it for 0

        e.rollDice([5, 5, 5, 5, 5]);
        e._forceDice([5, 5, 5, 5, 5]);
        e.commitScore(ScoreCategory.Fives);

        const s = e.getGameState();
        assert.strictEqual(s.scorecard[ScoreCategory.Yahtzee], 0);
        assert.strictEqual(s.yahtzeeBonus, 0, 'a scratched Sarzee box forfeits the bonus');
        assert.strictEqual(s.totalScore, 25, 'five fives is 25, with no +100');
    }
    {
        const e = new SarzeeEngine();
        e.rollDice([5, 5, 5, 5, 5]);
        e._forceDice([5, 5, 5, 5, 5]);
        e.commitScore(ScoreCategory.Yahtzee); // 50

        e.rollDice([6, 6, 6, 6, 6]);
        e._forceDice([6, 6, 6, 6, 6]);
        e.commitScore(ScoreCategory.Sixes);

        const s = e.getGameState();
        assert.strictEqual(s.yahtzeeBonus, 100, 'a second Sarzee after scoring 50 pays the bonus');
        assert.strictEqual(s.totalScore, 50 + 30 + 100);
    }
    console.log("  PASS");

    // Test 7: Joker rule
    console.log("Test 7: Joker rule");
    {
        const e = new SarzeeEngine();
        // Yahtzee box still open: five of a kind is NOT a full house or a straight.
        e.rollDice([4, 4, 4, 4, 4]);
        e._forceDice([4, 4, 4, 4, 4]);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.FullHouse), 0);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.LargeStraight), 0);

        e.commitScore(ScoreCategory.Yahtzee); // 50

        // Yahtzee box used but the Fours box is still open: still not a joker.
        e.rollDice([4, 4, 4, 4, 4]);
        e._forceDice([4, 4, 4, 4, 4]);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.FullHouse), 0);

        e.commitScore(ScoreCategory.Fours); // now Fours is gone too

        // Both gone: the joker is live.
        e.rollDice([4, 4, 4, 4, 4]);
        e._forceDice([4, 4, 4, 4, 4]);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.FullHouse), 25);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.SmallStraight), 30);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.LargeStraight), 40);
        // Ordinary categories are unaffected by the joker.
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.Chance), 20);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.Sixes), 0);
    }
    console.log("  PASS");

    console.log("ALL TESTS PASSED");
}

runTests().catch(e => {
    console.error("TEST FAILED:", e);
    process.exit(1);
});

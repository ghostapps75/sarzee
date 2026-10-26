import { SarzeeEngine } from './SarzeeEngine';
import { DieValue, ScoreCategory } from './types';
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

    // Test 8: the upper-section bonus is part of the total, awarded once, at 63
    console.log("Test 8: upper bonus of 35 at 63+");
    {
        const e = new SarzeeEngine();
        const score = (dice: DieValue[], cat: ScoreCategory) => {
            e.rollDice(dice);
            e.commitScore(cat);
        };
        score([1, 1, 1, 2, 3], ScoreCategory.Ones); // 3
        score([2, 2, 2, 1, 3], ScoreCategory.Twos); // 6
        score([3, 3, 3, 1, 2], ScoreCategory.Threes); // 9
        score([4, 4, 4, 1, 2], ScoreCategory.Fours); // 12
        score([5, 5, 5, 1, 2], ScoreCategory.Fives); // 15, running 45
        assert.strictEqual(e.getGameState().upperBonus, 0, 'no bonus below 63');
        assert.strictEqual(e.getGameState().totalScore, 45);

        score([6, 6, 6, 1, 2], ScoreCategory.Sixes); // 18, running 63
        let s = e.getGameState();
        assert.strictEqual(s.upperBonus, 35, 'bonus awarded the moment the upper section reaches 63');
        assert.strictEqual(s.totalScore, 63 + 35);

        // Awarded once; later scores add only themselves.
        score([6, 6, 6, 6, 6], ScoreCategory.Chance); // 30
        s = e.getGameState();
        assert.strictEqual(s.upperBonus, 35);
        assert.strictEqual(s.totalScore, 63 + 35 + 30);
    }
    {
        // One short of 63 earns nothing, however the lower section goes.
        const e = new SarzeeEngine();
        const score = (dice: DieValue[], cat: ScoreCategory) => {
            e.rollDice(dice);
            e.commitScore(cat);
        };
        score([1, 1, 2, 3, 4], ScoreCategory.Ones); // 2, running 62 at the end
        score([2, 2, 2, 1, 3], ScoreCategory.Twos); // 6
        score([3, 3, 3, 1, 2], ScoreCategory.Threes); // 9
        score([4, 4, 4, 1, 2], ScoreCategory.Fours); // 12
        score([5, 5, 5, 1, 2], ScoreCategory.Fives); // 15
        score([6, 6, 6, 1, 2], ScoreCategory.Sixes); // 18
        score([1, 2, 3, 4, 5], ScoreCategory.LargeStraight); // 40
        const s = e.getGameState();
        assert.strictEqual(s.upperBonus, 0);
        assert.strictEqual(s.totalScore, 62 + 40);
    }
    console.log("  PASS");

    // Test 9: restoring the snapshot taken before a commit undoes everything it changed
    console.log("Test 9: restoreState undoes a commit");
    {
        // The turn comes back exactly: dice, holds, rolls left, turn counter.
        const e = new SarzeeEngine();
        e.rollDice([2, 2, 5, 3, 2]);
        e.toggleHold(0);
        e.toggleHold(1);
        e.rollDice([2, 2, 6, 4, 2]);
        const before = e.getGameState();

        e.commitScore(ScoreCategory.Twos);
        assert.strictEqual(e.getGameState().currentTurn, 2);

        e.restoreState(before);
        let s = e.getGameState();
        assert.deepStrictEqual(s, before);
        assert.strictEqual(s.scorecard[ScoreCategory.Twos], null);
        assert.strictEqual(s.rollsLeft, 1);
        assert.deepStrictEqual(s.heldDice, [true, true, false, false, false]);
        assert.strictEqual(s.totalScore, 0);

        // The turn carries on from there: the last roll is still available, and the box
        // the player meant can be scored instead.
        e.rollDice([2, 2, 2, 2, 2]);
        e.commitScore(ScoreCategory.Yahtzee);
        s = e.getGameState();
        assert.strictEqual(s.scorecard[ScoreCategory.Twos], null);
        assert.strictEqual(s.scorecard[ScoreCategory.Yahtzee], 50);
        assert.strictEqual(s.currentTurn, 2);

        // The engine keeps its own copy, so changing the snapshot afterwards does nothing.
        e.restoreState(before);
        before.totalScore = 1000;
        before.scorecard[ScoreCategory.Chance] = 99;
        assert.strictEqual(e.getGameState().totalScore, 0);
        assert.strictEqual(e.getGameState().scorecard[ScoreCategory.Chance], null);
    }
    {
        // A commit that awarded the upper bonus takes the bonus back with it.
        const e = new SarzeeEngine();
        const score = (dice: DieValue[], cat: ScoreCategory) => {
            e.rollDice(dice);
            e.commitScore(cat);
        };
        score([1, 1, 1, 2, 3], ScoreCategory.Ones); // 3
        score([2, 2, 2, 1, 3], ScoreCategory.Twos); // 6
        score([3, 3, 3, 1, 2], ScoreCategory.Threes); // 9
        score([4, 4, 4, 1, 2], ScoreCategory.Fours); // 12
        score([5, 5, 5, 1, 2], ScoreCategory.Fives); // 15, running 45

        e.rollDice([6, 6, 6, 1, 2]);
        const before = e.getGameState();
        e.commitScore(ScoreCategory.Sixes); // 18, running 63
        assert.strictEqual(e.getGameState().upperBonus, 35);

        e.restoreState(before);
        const s = e.getGameState();
        assert.strictEqual(s.upperBonus, 0, 'the bonus goes with the score that earned it');
        assert.strictEqual(s.totalScore, 45);
        assert.strictEqual(s.scorecard[ScoreCategory.Sixes], null);

        // Scoring the same dice elsewhere leaves the upper section short of 63.
        e.commitScore(ScoreCategory.ThreeOfAKind); // 21
        assert.strictEqual(e.getGameState().upperBonus, 0);
        assert.strictEqual(e.getGameState().totalScore, 45 + 21);
    }
    {
        // A bonus Sarzee's +100 comes back off too.
        const e = new SarzeeEngine();
        e.rollDice([5, 5, 5, 5, 5]);
        e.commitScore(ScoreCategory.Yahtzee); // 50

        e.rollDice([6, 6, 6, 6, 6]);
        const before = e.getGameState();
        e.commitScore(ScoreCategory.Sixes);
        assert.strictEqual(e.getGameState().yahtzeeBonus, 100);

        e.restoreState(before);
        const s = e.getGameState();
        assert.strictEqual(s.yahtzeeBonus, 0);
        assert.strictEqual(s.totalScore, 50);
    }
    {
        // So do a joker score and the bonus that came with it.
        const e = new SarzeeEngine();
        e.rollDice([4, 4, 4, 4, 4]);
        e.commitScore(ScoreCategory.Yahtzee); // 50
        e.rollDice([4, 4, 4, 4, 4]);
        e.commitScore(ScoreCategory.Fours); // 20 + 100 bonus

        e.rollDice([4, 4, 4, 4, 4]);
        const before = e.getGameState();
        e.commitScore(ScoreCategory.LargeStraight); // joker 40 + 100 bonus
        assert.strictEqual(e.getGameState().totalScore, 50 + 120 + 140);

        e.restoreState(before);
        const s = e.getGameState();
        assert.strictEqual(s.scorecard[ScoreCategory.LargeStraight], null);
        assert.strictEqual(s.yahtzeeBonus, 100);
        assert.strictEqual(s.totalScore, 50 + 120);
        assert.strictEqual(e.calculatePotentialScore(ScoreCategory.LargeStraight), 40, 'the joker is still live');
    }
    {
        // Undoing the last box of the game takes the game back out of game over.
        const e = new SarzeeEngine();
        const all = Object.values(ScoreCategory) as ScoreCategory[];
        for (const cat of all.slice(0, -1)) {
            e.rollDice([1, 2, 3, 4, 6]);
            e.commitScore(cat);
        }
        const last = all[all.length - 1];

        e.rollDice([6, 6, 5, 5, 4]);
        const before = e.getGameState();
        assert.strictEqual(before.currentTurn, 13);
        e.commitScore(last);
        assert.strictEqual(e.getGameState().isGameOver, true);

        e.restoreState(before);
        let s = e.getGameState();
        assert.strictEqual(s.isGameOver, false, 'no longer over');
        assert.strictEqual(s.scorecard[last], null);
        assert.strictEqual(s.currentTurn, 13);
        assert.strictEqual(s.rollsLeft, 2);

        // The engine plays on: one more roll, then the box can be filled for real.
        e.rollDice([6, 6, 6, 6, 6]);
        e.commitScore(last);
        s = e.getGameState();
        assert.strictEqual(s.isGameOver, true);
        assert.strictEqual(s.scorecard[last], 30);
    }
    console.log("  PASS");

    console.log("ALL TESTS PASSED");
}

runTests().catch(e => {
    console.error("TEST FAILED:", e);
    process.exit(1);
});

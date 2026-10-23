/**
 * Checks the scorecard's option ranking (the glow on the best boxes):
 *
 *   1. A straight outranks everything else it could be written into, and zeros are scratches.
 *   2. A Sarzee always goes in an open Sarzee box.
 *   3. When nothing scores, the cheapest box to give up is the one recommended.
 *   4. Boxes already filled are never ranked.
 *
 * Run with:  npx tsx lib/scoreAdvice.test.ts
 */
import assert from 'assert';
import { SarzeeEngine } from './SarzeeEngine';
import { rankOptions } from './scoreAdvice';
import { DieValue, ScoreCategory, Scorecard } from './types';

const ALL = Object.values(ScoreCategory) as ScoreCategory[];

const emptyCard = (): Scorecard =>
    Object.fromEntries(ALL.map((c) => [c, null])) as Scorecard;

/** What each open box would score for these dice, as the game computes it. */
function potentialsFor(dice: DieValue[], card: Scorecard) {
    const engine = new SarzeeEngine();
    engine.rollDice(dice);
    const out: Partial<Record<ScoreCategory, number>> = {};
    for (const cat of ALL) if (card[cat] === null) out[cat] = engine.calculatePotentialScore(cat, dice);
    return out;
}

function testStraight() {
    console.log('Test 1: a large straight is the best box; zeros are scratches');
    const card = emptyCard();
    const tiers = rankOptions(card, potentialsFor([1, 2, 3, 4, 5], card));
    assert.strictEqual(tiers[ScoreCategory.LargeStraight], 'best');
    assert.strictEqual(tiers[ScoreCategory.SmallStraight], 'good');
    for (const cat of [ScoreCategory.Sixes, ScoreCategory.FullHouse, ScoreCategory.Yahtzee, ScoreCategory.FourOfAKind]) {
        assert.strictEqual(tiers[cat], 'scratch', `${cat} scores 0 and should be a scratch`);
    }
    assert.strictEqual(
        ALL.filter((c) => tiers[c] === 'best').length,
        1,
        'exactly one best box for a straight'
    );
    console.log('  ok');
}

function testSarzee() {
    console.log('Test 2: a Sarzee goes in the Sarzee box');
    const card = emptyCard();
    const tiers = rankOptions(card, potentialsFor([6, 6, 6, 6, 6], card));
    assert.strictEqual(tiers[ScoreCategory.Yahtzee], 'best');
    assert.notStrictEqual(tiers[ScoreCategory.Sixes], 'best');
    console.log('  ok');
}

function testForcedScratch() {
    console.log('Test 3: with nothing scoring, the cheapest scratch is recommended');
    const card = emptyCard();
    for (const cat of ALL) card[cat] = 10;
    card[ScoreCategory.Ones] = null;
    card[ScoreCategory.LargeStraight] = null;
    const tiers = rankOptions(card, potentialsFor([2, 2, 3, 3, 6], card));
    assert.strictEqual(tiers[ScoreCategory.Ones], 'best', 'giving up Aces costs least');
    assert.strictEqual(tiers[ScoreCategory.LargeStraight], 'scratch');
    console.log('  ok');
}

function testFilledBoxes() {
    console.log('Test 4: filled boxes are not ranked');
    const card = emptyCard();
    card[ScoreCategory.LargeStraight] = 40;
    card[ScoreCategory.Chance] = 22;
    const tiers = rankOptions(card, potentialsFor([1, 2, 3, 4, 5], card));
    assert.strictEqual(tiers[ScoreCategory.LargeStraight], undefined);
    assert.strictEqual(tiers[ScoreCategory.Chance], undefined);
    assert.strictEqual(tiers[ScoreCategory.SmallStraight], 'best');
    console.log('  ok');
}

testStraight();
testSarzee();
testForcedScratch();
testFilledBoxes();
console.log('All scoreAdvice tests passed');

/**
 * Checks `isNancy`, the house celebration for an opening roll of five different numbers:
 *
 *   1. Five different numbers that don't make a straight are a Nancy, in any order.
 *   2. Only on the opening roll of a turn (two rolls left after it).
 *   3. A straight is not a Nancy, small or large.
 *   4. Anything with a repeated number is not a Nancy.
 *
 * Run with:  npx tsx lib/useSarzeeGame.test.ts
 */
import assert from 'assert';
import { isNancy } from './useSarzeeGame';

/** Rolls left straight after the opening roll of a turn. */
const OPENING = 2;

function testNancy() {
    console.log('Test 1: five different numbers, no straight, is a Nancy');
    // Only two such sets exist: the five numbers without a 4, and without a 3.
    assert.strictEqual(isNancy([1, 2, 3, 5, 6], OPENING), true, 'no 4 (the rig deals this one)');
    assert.strictEqual(isNancy([1, 2, 4, 5, 6], OPENING), true, 'no 3 (the example in the rules drawer)');
    assert.strictEqual(isNancy([6, 1, 5, 2, 3], OPENING), true, 'order does not matter');
    assert.strictEqual(isNancy([5, 2, 6, 4, 1], OPENING), true, 'order does not matter');
    console.log('  ok');
}

function testOpeningOnly() {
    console.log('Test 2: only on the opening roll');
    assert.strictEqual(isNancy([1, 2, 3, 5, 6], 1), false, 'second roll');
    assert.strictEqual(isNancy([1, 2, 3, 5, 6], 0), false, 'third roll');
    assert.strictEqual(isNancy([1, 2, 3, 5, 6], 3), false, 'before any roll');
    console.log('  ok');
}

function testStraights() {
    console.log('Test 3: a straight is not a Nancy');
    assert.strictEqual(isNancy([1, 2, 3, 4, 5], OPENING), false, 'large straight, low');
    assert.strictEqual(isNancy([2, 3, 4, 5, 6], OPENING), false, 'large straight, high');
    assert.strictEqual(isNancy([5, 3, 1, 4, 2], OPENING), false, 'large straight, shuffled');
    assert.strictEqual(isNancy([1, 2, 3, 4, 6], OPENING), false, 'small straight 1-4');
    assert.strictEqual(isNancy([1, 3, 4, 5, 6], OPENING), false, 'small straight 3-6');
    console.log('  ok');
}

function testRepeats() {
    console.log('Test 4: a repeated number is not a Nancy');
    assert.strictEqual(isNancy([1, 1, 3, 5, 6], OPENING), false, 'a pair');
    assert.strictEqual(isNancy([2, 2, 2, 5, 6], OPENING), false, 'three of a kind');
    assert.strictEqual(isNancy([4, 4, 4, 4, 4], OPENING), false, 'a Sarzee');
    assert.strictEqual(isNancy([1, 2, 5, 6], OPENING), false, 'four dice');
    console.log('  ok');
}

testNancy();
testOpeningOnly();
testStraights();
testRepeats();
console.log('All isNancy tests passed');

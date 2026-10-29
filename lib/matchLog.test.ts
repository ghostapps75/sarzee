/**
 * Checks the high score board and the save/load file built on the match records:
 *
 *   1. The board is human scores only, best first, ten places, with name, score, board, date.
 *   2. A tie goes to the earlier game.
 *   3. Totals that can't come from a real card (below zero, above 1,575) are left off.
 *   4. A finished match is placed against the records from before it, plus itself.
 *   5. Trimming old records never drops one that holds a place on the board.
 *   6. A saved file reads back; records that don't fit the shape are left out.
 *   7. Loading merges by id, so the same file twice adds nothing.
 *   8. The Overview's best score and chart never use a CPU's total.
 *
 * Run with:  npx tsx lib/matchLog.test.ts
 */
import assert from 'assert';
import {
    EXPORT_VERSION,
    MatchLog,
    bestHumanScore,
    bestHumanScoreByMatch,
    boardPlacings,
    capMatchLogs,
    mergeMatchLogs,
    parseMatchLogFile,
    serializeMatchLogs,
    topScores,
} from './matchLog';

/** Ids start with the time in base 36, as `appendMatchLog` writes them. */
const T0 = Date.UTC(2026, 9, 1, 12);
const HOUR = 3600_000;
let seq = 0;

/** A record from seats given as [name, score, isCpu]. `hours` is how long after T0 it was played. */
function match(hours: number, seats: [string, number, boolean][], boardName = 'Vintage Café'): MatchLog {
    const players = seats.map(([name, score, isCpu]) => ({ name, score, isCpu }));
    const top = Math.max(...players.map((p) => p.score));
    const winnerIndex = players.findIndex((p) => p.score === top);
    return {
        id: `${(T0 + hours * HOUR).toString(36)}-t${(seq++).toString(36)}`,
        date: new Date(T0 + hours * HOUR).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        boardName,
        players,
        winnerIndex,
        winner: { name: players[winnerIndex].name, score: players[winnerIndex].score },
        isDraw: players.filter((p) => p.score === top).length > 1,
        sarzeeCount: 0,
        nancyCount: 0,
    };
}

function testHumansOnly() {
    console.log('Test 1: human scores only, best first, ten places');
    const logs = [
        match(0, [['Ann', 210, false], ['Robo', 400, true]], 'Emerald Forest'),
        match(1, [['Bo', 305, false]]),
        match(2, [['Ann', 180, false], ['Cy', 260, false]], 'Obsidian Forge'),
    ];
    const board = topScores(logs);
    assert.deepStrictEqual(
        board.map((e) => [e.name, e.score, e.board]),
        [
            ['Bo', 305, 'Vintage Café'],
            ['Cy', 260, 'Obsidian Forge'],
            ['Ann', 210, 'Emerald Forest'],
            ['Ann', 180, 'Obsidian Forge'],
        ],
        'the CPU is left off and the rest are best first'
    );
    assert.deepStrictEqual(Object.keys(board[0]).sort(), ['board', 'date', 'id', 'name', 'score']);
    assert.strictEqual(board[0].date, logs[1].date);
    assert.strictEqual(new Set(board.map((e) => e.id)).size, board.length, 'every line has its own id');

    const many = Array.from({ length: 14 }, (_, i) => match(10 + i, [['P', 100 + i, false]]));
    const ten = topScores(many);
    assert.strictEqual(ten.length, 10);
    assert.strictEqual(ten[0].score, 113);
    assert.strictEqual(ten[9].score, 104);
    assert.strictEqual(topScores(many, 3).length, 3);
    console.log('  ok');
}

function testTies() {
    console.log('Test 2: a tie goes to the earlier game');
    const later = match(5, [['Late', 250, false]]);
    const earlier = match(1, [['Early', 250, false]]);
    // Stored out of order on purpose: the order comes from when they were played.
    assert.deepStrictEqual(topScores([later, earlier]).map((e) => e.name), ['Early', 'Late']);

    // Same match, same score: seat order.
    const shared = match(2, [['First', 200, false], ['Second', 200, false]]);
    assert.deepStrictEqual(topScores([shared]).map((e) => e.name), ['First', 'Second']);

    // An id that doesn't carry a time falls back to the date.
    const dated = { ...match(0, [['Dated', 250, false]]), id: 'imported', date: 'Sep 1, 2026' };
    assert.deepStrictEqual(topScores([later, dated]).map((e) => e.name), ['Dated', 'Late']);
    console.log('  ok');
}

function testImpossibleTotals() {
    console.log('Test 3: totals below zero or above 1,575 are left off');
    const logs = [
        match(0, [['Max', 1575, false]]),
        match(1, [['Over', 1576, false], ['Fine', 220, false]]),
        match(2, [['Neg', -5, false]]),
        match(3, [['Zero', 0, false]]),
    ];
    // A malformed record, as it might sit in storage, is skipped rather than fatal.
    const junk = [null, { id: 'x' }, { id: 'y', players: [null, { name: 'NaN', score: NaN, isCpu: false }] }];
    const board = topScores([...logs, ...(junk as unknown as MatchLog[])]);
    assert.deepStrictEqual(board.map((e) => e.name), ['Max', 'Fine', 'Zero']);
    console.log('  ok');
}

function testPlacings() {
    console.log('Test 4: a finished match is placed against the records before it');
    const earlier = Array.from({ length: 10 }, (_, i) => match(i, [['Old', 200 + i * 10, false]]));
    // Board before: 290, 280, ... 200.

    const best = match(20, [['Ann', 300, false], ['Bo', 295, false], ['Robo', 500, true]]);
    assert.deepStrictEqual(boardPlacings(earlier, best), [1, 2, null], 'two humans, two places; the CPU none');

    const tie = match(21, [['Tie', 290, false]]);
    assert.deepStrictEqual(boardPlacings(earlier, tie), [2], 'a tie ranks below the older score');

    const scrape = match(22, [['Scrape', 205, false]]);
    assert.deepStrictEqual(boardPlacings(earlier, scrape), [10]);

    const miss = match(23, [['Miss', 200, false]]);
    assert.deepStrictEqual(boardPlacings(earlier, miss), [null], 'tying tenth with an older score misses');

    // Placing doesn't count the match twice if the list already holds it.
    assert.deepStrictEqual(boardPlacings([...earlier, best], best), [1, 2, null]);

    // The very first game on a device is the best ever.
    assert.deepStrictEqual(boardPlacings([], match(30, [['New', 120, false]])), [1]);
    console.log('  ok');
}

function testCap() {
    console.log('Test 5: trimming old records keeps the ones on the board');
    const champion = match(0, [['Champ', 400, false]]);
    const filler = Array.from({ length: 12 }, (_, i) => match(1 + i, [['Filler', 100 + i, false]]));
    const kept = capMatchLogs([champion, ...filler], 10);
    assert.strictEqual(kept.length, 10);
    assert.strictEqual(kept[0], champion, 'the oldest record holds first place, so it stays');
    assert.ok(!kept.includes(filler[0]) && !kept.includes(filler[1]) && !kept.includes(filler[2]));
    assert.strictEqual(capMatchLogs(filler, 50), filler, 'under the cap, nothing changes');
    console.log('  ok');
}

function testSaveFile() {
    console.log('Test 6: a saved file reads back, and records that do not fit are left out');
    const logs = [match(0, [['Ann', 210, false], ['Robo', 180, true]]), match(1, [['Bo', 250, false]])];
    const text = serializeMatchLogs(logs, new Date(Date.UTC(2026, 9, 27)));
    const file = JSON.parse(text);
    assert.strictEqual(file.version, EXPORT_VERSION);
    assert.strictEqual(file.exportedAt, '2026-10-27T00:00:00.000Z');
    assert.ok(text.includes('\n  "records": ['), 'pretty-printed');
    assert.deepStrictEqual(parseMatchLogFile(text), { records: logs, rejected: 0 });

    const good = logs[0];
    const records = [
        good,
        { ...good, id: '' },
        { ...good, id: 'no-players', players: [] },
        { ...good, id: 'too-high', players: [{ name: 'X', score: 1600, isCpu: false }] },
        { ...good, id: 'bad-seat', players: [{ name: 'X', score: 10 }] },
        { ...good, id: 'bad-winner', winnerIndex: 5 },
        { ...good, id: 'bad-draw', isDraw: 'no' },
        { ...good, id: 'bad-count', sarzeeCount: -1 },
        'not a record',
        null,
    ];
    const parsed = parseMatchLogFile(JSON.stringify({ version: 1, records }));
    assert.deepStrictEqual(parsed.records.map((r) => r.id), [good.id]);
    assert.strictEqual(parsed.rejected, records.length - 1);

    // Only the known fields are kept, and the winner is rebuilt from the index.
    const tampered = { ...good, id: 'extra', winner: { name: 'Nobody', score: 9999 }, extra: '<script>' };
    const [clean] = parseMatchLogFile(JSON.stringify({ version: 1, records: [tampered] })).records;
    assert.deepStrictEqual(clean.winner, { name: 'Ann', score: 210 });
    assert.ok(!('extra' in clean));

    // A record from before draws were recorded still loads, without the flag.
    const older: Partial<MatchLog> = { ...good, id: 'older' };
    delete older.isDraw;
    const [loadedOlder] = parseMatchLogFile(JSON.stringify({ version: 1, records: [older] })).records;
    assert.ok(loadedOlder && !('isDraw' in loadedOlder));

    assert.throws(() => parseMatchLogFile('not json'), /isn't a Sarzee scores file/);
    assert.throws(() => parseMatchLogFile('[]'), /isn't a Sarzee scores file/);
    assert.throws(() => parseMatchLogFile('{"records": []}'), /isn't a Sarzee scores file/);
    assert.throws(() => parseMatchLogFile('{"version": 1}'), /isn't a Sarzee scores file/);
    assert.throws(() => parseMatchLogFile('{"version": 2, "records": []}'), /newer version/);
    console.log('  ok');
}

function testMerge() {
    console.log('Test 7: loading merges by id, in the order the games were played');
    const a = match(0, [['A', 100, false]]);
    const b = match(1, [['B', 110, false]]);
    const c = match(2, [['C', 120, false]]);
    const here = [a, c];

    const merged = mergeMatchLogs(here, [c, b, b]);
    assert.deepStrictEqual(merged.map((l) => l.id), [a.id, b.id, c.id], 'b slots in by time, once');
    assert.strictEqual(mergeMatchLogs(merged, [a, b, c]), merged, 'the same file twice changes nothing');

    const edited = { ...a, players: [{ name: 'A', score: 999, isCpu: false }] };
    assert.strictEqual(mergeMatchLogs(here, [edited])[0], a, 'a record already here is kept as it is');
    console.log('  ok');
}

testHumansOnly();
testTies();
testImpossibleTotals();
testPlacings();
function testOverview() {
    console.log("Test 8: the Overview's best score and chart never use a CPU's total");
    assert.strictEqual(bestHumanScore([]), null, 'nothing on record');
    const cpuOnly = match(0, [['Robo', 380, true], ['Bot', 300, true]]);
    assert.strictEqual(bestHumanScore([cpuOnly]), null, 'a CPU-only game crowns nobody');

    const logs = [
        match(1, [['Ann', 210, false], ['Robo', 400, true]]),
        cpuOnly,
        match(2, [['Bo', 250, false], ['Cy', 190, false], ['Rosie', 330, true]]),
        match(3, [['Ann', 250, false]]),
    ];
    const best = bestHumanScore(logs);
    assert.ok(best);
    assert.deepStrictEqual([best.name, best.score], ['Bo', 250], 'the CPU 400 and 330 are passed over; the tie goes to the earlier game');
    assert.deepStrictEqual(best, topScores(logs)[0], 'it is the top of the high score board');

    assert.deepStrictEqual(bestHumanScoreByMatch(logs), [210, 250, 250], 'one point per match with a human, the best human in each');
    assert.deepStrictEqual(bestHumanScoreByMatch([cpuOnly]), []);
    console.log('  ok');
}

testCap();
testSaveFile();
testMerge();
testOverview();
console.log('All matchLog tests passed');

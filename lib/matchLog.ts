// lib/matchLog.ts
//
// Persistence for the stats drawer. Small enough to live in localStorage, but keep the
// read/write in one place so the shape can only drift in one file.

export interface PlayerScoreRecord {
    name: string;
    score: number;
    isCpu: boolean;
}

export interface MatchLog {
    id: string;
    date: string;
    boardName: string;
    players: PlayerScoreRecord[];
    /** Index into `players`. Stored by index because two players can share a name. */
    winnerIndex: number;
    winner: { name: string; score: number };
    /**
     * True when the top score was shared. `winnerIndex` then only says which of the tied
     * seats came first, and nobody won. Absent on logs written before draws were recorded.
     */
    isDraw?: boolean;
    sarzeeCount: number;
    nancyCount: number;
}

const STORAGE_KEY = 'sarzee_match_statistics';
const MAX_LOGS = 200;

/**
 * The highest total a card can reach: every box at its best (375) plus the 100-point bonus
 * for twelve more Sarzees. A total above it, or below zero, isn't from a real game.
 */
export const MAX_POSSIBLE_SCORE = 1575;

/** Places on the high score board. */
export const HIGH_SCORE_LIMIT = 10;

export function readMatchLogs(): MatchLog[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('Failed to read match statistics:', err);
        return [];
    }
}

export function appendMatchLog(input: {
    boardName: string;
    names: string[];
    types: string[];
    totals: number[];
    sarzeeCount: number;
    nancyCount: number;
}): MatchLog | null {
    try {
        const players: PlayerScoreRecord[] = input.totals.map((score, idx) => ({
            name: input.names[idx] || `Player ${idx + 1}`,
            score,
            isCpu: input.types[idx] !== 'HUMAN',
        }));

        const top = Math.max(...players.map((p) => p.score));
        const winnerIndex = Math.max(0, players.findIndex((p) => p.score === top));
        const isDraw = players.filter((p) => p.score === top).length > 1;

        const log: MatchLog = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
            boardName: input.boardName,
            players,
            winnerIndex,
            winner: { name: players[winnerIndex].name, score: players[winnerIndex].score },
            isDraw,
            sarzeeCount: input.sarzeeCount,
            nancyCount: input.nancyCount,
        };

        const logs = readMatchLogs();
        logs.push(log);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(capMatchLogs(logs)));
        return log;
    } catch (err) {
        console.error('Failed to log match statistic:', err);
        return null;
    }
}

/**
 * Takes one record back out. A game that ends on a human's score is logged straight away,
 * because nothing guarantees the page is still open later; if that last score is then
 * undone, the game is not over after all and its record has to go with it.
 */
export function removeMatchLog(id: string) {
    try {
        const logs = readMatchLogs();
        const kept = logs.filter((log) => log.id !== id);
        if (kept.length !== logs.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    } catch (err) {
        console.error('Failed to remove match statistic:', err);
    }
}

export function clearMatchLogs() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
        console.error('Failed to clear match statistics:', err);
    }
}

/** Winner lookup that tolerates older logs written before `winnerIndex` existed. */
export function winnerRecord(log: MatchLog): PlayerScoreRecord | undefined {
    const players = Array.isArray(log.players) ? log.players : [];
    if (typeof log.winnerIndex === 'number' && players[log.winnerIndex]) {
        return players[log.winnerIndex];
    }
    return players.find((p) => p.name === log.winner?.name);
}

/** Draw detection that tolerates older logs, which recorded a tie as a win for the lower seat. */
export function isDrawLog(log: MatchLog): boolean {
    if (typeof log.isDraw === 'boolean') return log.isDraw;
    const players = Array.isArray(log.players) ? log.players : [];
    if (players.length < 2) return false;
    const top = Math.max(...players.map((p) => p.score));
    return players.filter((p) => p.score === top).length > 1;
}

// ---------------------------------------------------------------------------------------
// High score board

/**
 * One line on the high score board. Plain data on purpose: the board only ever draws an
 * array of these, so a shared board could later supply the same array from a server.
 */
export interface HighScoreEntry {
    /** Unique per line. One match can put two humans on the board, so it names the seat. */
    id: string;
    name: string;
    score: number;
    board: string;
    date: string;
}

interface BoardLine extends HighScoreEntry {
    matchId: string;
    playedAt: number;
}

const ID_TIME_FLOOR = Date.UTC(2020, 0, 1);
const ID_TIME_CEILING = Date.UTC(2100, 0, 1);

/**
 * When a match was played, in ms, for putting matches in order. Every id `appendMatchLog`
 * writes starts with `Date.now()` in base 36, which is finer than the stored date (a day,
 * written in the player's locale), so the date is only the fallback. Unknown sorts last.
 */
function playedAt(log: MatchLog): number {
    const stamp = parseInt(String(log?.id ?? '').split('-')[0], 36);
    if (stamp >= ID_TIME_FLOOR && stamp < ID_TIME_CEILING) return stamp;
    const parsed = Date.parse(String(log?.date ?? ''));
    return Number.isNaN(parsed) ? Infinity : parsed;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isPossibleScore = (v: unknown): v is number => isCount(v) && v <= MAX_POSSIBLE_SCORE;

const entryId = (matchId: string, seat: number) => `${matchId}:${seat}`;

/** Every human score on record that could be on the board, best first. */
function boardLines(logs: MatchLog[]): BoardLine[] {
    const lines: BoardLine[] = [];
    for (const log of logs) {
        if (!log || typeof log.id !== 'string' || !Array.isArray(log.players)) continue;
        const at = playedAt(log);
        log.players.forEach((p, seat) => {
            if (!p || p.isCpu !== false || !isPossibleScore(p.score)) return;
            lines.push({
                id: entryId(log.id, seat),
                name: (typeof p.name === 'string' && p.name.trim()) || `Player ${seat + 1}`,
                score: p.score,
                board: typeof log.boardName === 'string' ? log.boardName : '',
                date: typeof log.date === 'string' ? log.date : '',
                matchId: log.id,
                playedAt: at,
            });
        });
    }
    // A tie goes to whoever got there first. The sort is stable, so two seats tied in the
    // same match keep their seat order.
    return lines.sort((a, b) => b.score - a.score || a.playedAt - b.playedAt || 0);
}

/**
 * The high score board: the best human totals across every match on record, best first.
 *
 * - Humans only. The board is for the people at the table; CPU totals still show in the
 *   match history, but a CPU playing the odds every game would crowd the people off it.
 * - One list for every board, not one per board. The boards are scenery and the rules are
 *   the same on each, so the board a score was made on is shown beside it instead.
 * - A tie goes to the earlier game.
 * - A total below zero or above MAX_POSSIBLE_SCORE can't come from a real card, so it is
 *   left off.
 */
export function topScores(logs: MatchLog[], limit = HIGH_SCORE_LIMIT): HighScoreEntry[] {
    return boardLines(logs)
        .slice(0, Math.max(0, limit))
        .map(({ id, name, score, board, date }) => ({ id, name, score, board, date }));
}

/**
 * Where each seat of a match that has just ended lands on the board: 1 for the top, up to
 * `limit`, or null if it doesn't make it (always, for a CPU). Measured against the records
 * as they stood before this match was saved, with this match added, so a tie with an older
 * score ranks below it and two humans in the same match can't both be "best ever".
 */
export function boardPlacings(earlier: MatchLog[], log: MatchLog, limit = HIGH_SCORE_LIMIT): (number | null)[] {
    const board = topScores([...earlier.filter((other) => other?.id !== log.id), log], limit);
    return log.players.map((_, seat) => {
        const place = board.findIndex((entry) => entry.id === entryId(log.id, seat));
        return place < 0 ? null : place + 1;
    });
}

/**
 * Holds the record to `max` matches by dropping the oldest, except any that hold a place
 * on the high score board: a best-ever game shouldn't vanish because 200 more followed it.
 */
export function capMatchLogs(logs: MatchLog[], max = MAX_LOGS): MatchLog[] {
    let excess = logs.length - max;
    if (excess <= 0) return logs;
    const onBoard = new Set(boardLines(logs).slice(0, HIGH_SCORE_LIMIT).map((line) => line.matchId));
    return logs.filter((log) => {
        if (excess <= 0 || onBoard.has(log?.id)) return true;
        excess--;
        return false;
    });
}

// ---------------------------------------------------------------------------------------
// Save and load
//
// The records live in one browser, so "Save scores" writes them all to a file and "Load
// scores" merges such a file back in, on this device or another.

/** Goes up if the shape of `records` ever changes, so an older file can still be read. */
export const EXPORT_VERSION = 1;

/** The "Save scores" file: every match record, pretty-printed so it reads by eye. */
export function serializeMatchLogs(logs: MatchLog[], now = new Date()): string {
    return JSON.stringify({ version: EXPORT_VERSION, exportedAt: now.toISOString(), records: logs }, null, 2);
}

/**
 * A record from a file, checked field by field and copied, so only the shape this file
 * writes reaches storage. Null for anything that doesn't fit. `winner` is rebuilt from
 * `winnerIndex` rather than taken on trust.
 */
function toMatchLog(value: unknown): MatchLog | null {
    if (!value || typeof value !== 'object') return null;
    const { id, date, boardName, players: seats, winnerIndex, isDraw, sarzeeCount, nancyCount } =
        value as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof date !== 'string' || typeof boardName !== 'string') return null;
    if (!Array.isArray(seats) || seats.length === 0) return null;

    const players: PlayerScoreRecord[] = [];
    for (const seat of seats) {
        if (!seat || typeof seat !== 'object') return null;
        const { name, score, isCpu } = seat as Record<string, unknown>;
        if (typeof name !== 'string' || !isPossibleScore(score) || typeof isCpu !== 'boolean') return null;
        players.push({ name, score, isCpu });
    }

    if (!isCount(winnerIndex) || winnerIndex >= players.length) return null;
    if (isDraw !== undefined && typeof isDraw !== 'boolean') return null;
    if (!isCount(sarzeeCount) || !isCount(nancyCount)) return null;

    const winner = players[winnerIndex];
    return {
        id,
        date,
        boardName,
        players,
        winnerIndex,
        winner: { name: winner.name, score: winner.score },
        ...(isDraw === undefined ? {} : { isDraw }),
        sarzeeCount,
        nancyCount,
    };
}

const NOT_A_SCORES_FILE = "That file isn't a Sarzee scores file.";

/**
 * Reads a "Save scores" file: the records that fit, and a count of those that didn't.
 * Throws, with a message fit to show, if it isn't such a file at all.
 */
export function parseMatchLogFile(text: string): { records: MatchLog[]; rejected: number } {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(NOT_A_SCORES_FILE);
    }
    const file = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const { version } = file;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || !Array.isArray(file.records)) {
        throw new Error(NOT_A_SCORES_FILE);
    }
    if (version > EXPORT_VERSION) throw new Error('That file was saved by a newer version of Sarzee.');

    const records: MatchLog[] = [];
    let rejected = 0;
    for (const entry of file.records) {
        const log = toMatchLog(entry);
        if (log) records.push(log);
        else rejected++;
    }
    return { records, rejected };
}

/**
 * Adds loaded records to the ones already here, matched by id. A record already here is
 * kept as it is, so loading the same file twice changes nothing. The result is in the
 * order the games were played, held to the usual cap.
 */
export function mergeMatchLogs(current: MatchLog[], incoming: MatchLog[]): MatchLog[] {
    const ids = new Set(current.map((log) => log?.id));
    const added: MatchLog[] = [];
    for (const log of incoming) {
        if (ids.has(log.id)) continue;
        ids.add(log.id);
        added.push(log);
    }
    if (added.length === 0) return current;
    const merged = [...current, ...added].sort((a, b) => playedAt(a) - playedAt(b) || 0);
    return capMatchLogs(merged);
}

export interface ImportResult {
    /** Matches from the file now on record here. */
    added: number;
    /** Matches in the file that were already here. */
    alreadyHere: number;
    /** New matches left out because the oldest go first once there are MAX_LOGS. */
    overCap: number;
    /** Entries in the file that weren't valid match records. */
    rejected: number;
}

/** Loads a "Save scores" file into this browser's records. Throws a message fit to show. */
export function importMatchLogs(text: string): ImportResult {
    const { records, rejected } = parseMatchLogFile(text);
    const current = readMatchLogs();
    const here = new Set(current.map((log) => log?.id));
    const merged = mergeMatchLogs(current, records);
    if (merged !== current) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (err) {
            console.error('Failed to save loaded match statistics:', err);
            throw new Error("This browser wouldn't save the loaded scores.");
        }
    }
    const fresh = new Set(records.filter((log) => !here.has(log.id)).map((log) => log.id));
    const added = merged.filter((log) => fresh.has(log.id)).length;
    return {
        added,
        alreadyHere: records.filter((log) => here.has(log.id)).length,
        overCap: fresh.size - added,
        rejected,
    };
}

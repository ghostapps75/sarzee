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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
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

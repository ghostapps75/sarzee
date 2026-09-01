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

        let winnerIndex = 0;
        players.forEach((p, i) => {
            if (p.score > players[winnerIndex].score) winnerIndex = i;
        });

        const log: MatchLog = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
            boardName: input.boardName,
            players,
            winnerIndex,
            winner: { name: players[winnerIndex].name, score: players[winnerIndex].score },
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

export function clearMatchLogs() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
        console.error('Failed to clear match statistics:', err);
    }
}

/** Winner lookup that tolerates older logs written before `winnerIndex` existed. */
export function winnerRecord(log: MatchLog): PlayerScoreRecord | undefined {
    if (typeof log.winnerIndex === 'number' && log.players[log.winnerIndex]) {
        return log.players[log.winnerIndex];
    }
    return log.players.find((p) => p.name === log.winner?.name);
}

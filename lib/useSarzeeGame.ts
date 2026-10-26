// lib/useSarzeeGame.ts
'use client';

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SarzeeEngine } from './SarzeeEngine';
import { DieValue, GamePhase, GameState, ScoreCategory } from './types';
import { CpuPersonality } from './CpuAgent';
import { DEFAULT_BOARD_ID, getBoard } from './boards';
import { appendMatchLog, removeMatchLog } from './matchLog';
import { useGameSounds } from './useGameSounds';

export type PlayerType = 'HUMAN' | CpuPersonality;

export interface DiceArenaLike {
    rollToResult: (values: number[], opts?: { chaosMs?: number }) => void;
    reset: () => void;
    showDice: (values: number[]) => void;
}

/** If the arena never reports back (backgrounded tab, lost WebGL context), unstick the UI. */
const ROLL_WATCHDOG_MS = 8000;

/**
 * How long a CPU holds its opening roll after a human scores. The roll is what closes
 * the undo window, and a CPU would otherwise roll before a mis-tap had even registered.
 */
export const UNDO_GRACE_MS = 4000;

/**
 * What the hidden test keystroke can rig: the next roll comes up five of a kind, or the
 * next opening roll a Nancy, so either celebration can be checked without playing for it.
 */
export type RiggedRoll = 'sarzee' | 'nancy';

/** A human's last score, offered back until the next roll. What the pad draws from. */
export interface UndoOffer {
    /** New for every commit, so a fresh offer restarts its countdown. */
    id: number;
    /** The seat that scored, which is the seat undo hands the turn back to. */
    player: number;
    category: ScoreCategory;
    /**
     * When a CPU plays next it waits until this time (ms since the epoch) to roll, and
     * the offer ends then. Null when a human is next: the offer lasts until they roll.
     */
    graceUntil: number | null;
    /** The length of that wait, for the countdown on the Undo button. */
    graceMs: number | null;
}

interface UndoEntry extends UndoOffer {
    /** The scoring player's engine the moment before the commit. Undo restores it whole. */
    before: GameState;
    /** The stats record written when the commit ended the game, so undo can take it back out. */
    matchLogId: string | null;
}

const emptyPotentials = () => ({}) as Record<ScoreCategory, number>;

export function computePotentialScores(engine: SarzeeEngine, state: GameState) {
    const out = emptyPotentials();
    (Object.values(ScoreCategory) as ScoreCategory[]).forEach((cat) => {
        if (state.scorecard[cat] === null) out[cat] = engine.calculatePotentialScore(cat);
    });
    return out;
}

/**
 * A "Nancy": the opening roll of a turn comes up five different numbers that don't
 * form a straight. Purely a house celebration, not a scoring category.
 */
export function isNancy(dice: number[], rollsLeft: number): boolean {
    // rollsLeft === 2 means the first of the three rolls has just happened.
    if (rollsLeft !== 2) return false;

    const unique = new Set(dice);
    if (unique.size !== 5) return false;

    const sorted = Array.from(unique).sort((a, b) => a - b);
    let maxSeq = 1;
    let currentSeq = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] === sorted[i] + 1) {
            currentSeq++;
            maxSeq = Math.max(maxSeq, currentSeq);
        } else {
            currentSeq = 1;
        }
    }
    return maxSeq < 4;
}

const normalizeDie = (v: number) => Math.max(1, Math.min(6, Math.round(v))) as DieValue;

export function useSarzeeGame(arenaRef: RefObject<DiceArenaLike | null>) {
    const playSound = useGameSounds();
    const [phase, setPhase] = useState<GamePhase>('SETUP');
    const [selectedBoard, setSelectedBoard] = useState<string>(DEFAULT_BOARD_ID);
    const [playerCount, setPlayerCount] = useState(1);
    const [customNames, setCustomNames] = useState<string[]>([]);
    const [playerTypes, setPlayerTypes] = useState<PlayerType[]>([]);
    const [playerDiceColors, setPlayerDiceColors] = useState<string[]>([]);

    const enginesRef = useRef<SarzeeEngine[]>([]);

    const [activePlayer, setActivePlayer] = useState(0);
    /** Snapshot of every player's engine. Kept in state so React can actually see it. */
    const [allStates, setAllStates] = useState<GameState[]>([]);
    const [potentialScores, setPotentialScores] = useState<Record<ScoreCategory, number>>(emptyPotentials);
    const [isRolling, setIsRolling] = useState(false);

    const [sarzeesInGame, setSarzeesInGame] = useState(0);
    const [nancysInGame, setNancysInGame] = useState(0);
    const [showCelebration, setShowCelebration] = useState(false);
    const [showNancyCelebration, setShowNancyCelebration] = useState(false);
    const [highlightedCategory, setHighlightedCategory] = useState<ScoreCategory | null>(null);
    /**
     * A celebration has the dice: nothing may roll, hold or score until it ends. The
     * overlay already blocks the player; this also covers a CPU timer or a dev shortcut.
     */
    const celebrating = showCelebration || showNancyCelebration;

    const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * The score that can still be taken back. The ref is what `undoLastScore` trusts: a
     * CPU rolls from a timer, and its roll has to shut the window before a click that
     * lands in the same frame, ahead of any re-render. The state copy is for drawing.
     */
    const undoRef = useRef<UndoEntry | null>(null);
    const undoSeq = useRef(0);
    const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
    const setUndo = useCallback((entry: UndoEntry | null) => {
        undoRef.current = entry;
        setUndoOffer(entry);
    }, []);

    /**
     * The rigged roll, if one is armed (see `RiggedRoll`). The ref is what `roll` reads,
     * since a CPU rolls from a timer; the state copy is for the badge that shows it is set.
     */
    const rigRef = useRef<RiggedRoll | null>(null);
    const [riggedRoll, setRiggedRoll] = useState<RiggedRoll | null>(null);
    const armRiggedRoll = useCallback((kind: RiggedRoll | null) => {
        rigRef.current = kind;
        setRiggedRoll(kind);
    }, []);

    const gameState: GameState | null = allStates[activePlayer] ?? null;

    /** Re-read every engine. Cheap enough at 4 players and keeps one source of truth. */
    const syncStates = useCallback(() => {
        const states = enginesRef.current.map((e) => e.getGameState());
        setAllStates(states);
        return states;
    }, []);

    const clearTimers = useCallback(() => {
        if (watchdog.current) {
            clearTimeout(watchdog.current);
            watchdog.current = null;
        }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const startGame = useCallback(() => {
        const count = playerCount;
        const board = getBoard(selectedBoard);

        setPlayerTypes((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? 'HUMAN'));
        setCustomNames((prev) => Array.from({ length: count }, (_, i) => prev[i] || `Player ${i + 1}`));
        setPlayerDiceColors((prev) =>
            Array.from({ length: count }, (_, i) => prev[i] || board.diceColors[i % board.diceColors.length].hex)
        );

        enginesRef.current = Array.from({ length: count }, () => new SarzeeEngine());
        setActivePlayer(0);
        setAllStates(enginesRef.current.map((e) => e.getGameState()));
        setPotentialScores(emptyPotentials());
        setSarzeesInGame(0);
        setNancysInGame(0);
        setHighlightedCategory(null);
        setIsRolling(false);
        setShowCelebration(false);
        setShowNancyCelebration(false);
        setUndo(null);
        clearTimers();

        arenaRef.current?.reset();
        setPhase('PLAYING');
    }, [playerCount, selectedBoard, arenaRef, clearTimers, setUndo]);

    const resetAll = useCallback(() => {
        clearTimers();
        enginesRef.current = [];
        setAllStates([]);
        setPotentialScores(emptyPotentials());
        setActivePlayer(0);
        setPlayerCount(1);
        setPhase('SETUP');
        setCustomNames([]);
        setPlayerDiceColors([]);
        setPlayerTypes([]);
        setIsRolling(false);
        setShowCelebration(false);
        setShowNancyCelebration(false);
        setSarzeesInGame(0);
        setNancysInGame(0);
        setHighlightedCategory(null);
        setUndo(null);
    }, [clearTimers, setUndo]);

    const toggleHold = useCallback(
        (idx: number) => {
            if (!gameState || isRolling || celebrating || gameState.rollsLeft === 3) return;
            const engine = enginesRef.current[activePlayer];
            const wasHeld = gameState.heldDice[idx];
            engine.toggleHold(idx);
            const states = syncStates();
            // Only click when the engine actually accepted it, so a rejected hold is silent.
            if (states[activePlayer].heldDice[idx] !== wasHeld) playSound('hold');
            setPotentialScores(computePotentialScores(engine, states[activePlayer]));
        },
        [gameState, isRolling, celebrating, activePlayer, syncStates, playSound]
    );

    const roll = useCallback(() => {
        if (!gameState || isRolling || celebrating) return;
        const arena = arenaRef.current;
        if (!arena) return;

        const engine = enginesRef.current[activePlayer];
        if (!engine) return;

        // Read the engine, not the React snapshot. A CPU changes its holds and then rolls
        // from a timer armed before React re-rendered, so `gameState` here can predate
        // those holds — and a held die would be dealt a fresh random value that the
        // celebration check then sees. The engine is the one source of truth.
        const live = engine.getGameState();
        if (live.rollsLeft <= 0 || live.isGameOver) return;

        // The outcome is decided here, up front — the animation is a presentation of a
        // result that already exists, never the thing that determines it.
        const decided: DieValue[] = [];
        for (let i = 0; i < 5; i++) {
            decided[i] = live.heldDice[i]
                ? normalizeDie(Number(live.diceValues[i] ?? 1))
                : (1 + Math.floor(Math.random() * 6)) as DieValue;
        }

        // A rigged roll, armed from the hidden test keystroke, is consumed by the roll it
        // shapes. Held dice keep their values, as on any roll, so a Sarzee is only
        // guaranteed while the held dice (if any) all match.
        const rig = rigRef.current;
        if (rig === 'sarzee') {
            const held = live.heldDice.findIndex(Boolean);
            const value = held >= 0 ? decided[held] : (5 as DieValue);
            for (let i = 0; i < 5; i++) if (!live.heldDice[i]) decided[i] = value;
            rigRef.current = null;
            setRiggedRoll(null);
        } else if (rig === 'nancy' && live.rollsLeft === 3) {
            // Five different numbers that don't make a straight. Nothing is held on an
            // opening roll, so all five are ours to deal.
            const nancy: DieValue[] = [1, 2, 3, 5, 6];
            for (let i = 0; i < 5; i++) decided[i] = nancy[i];
            rigRef.current = null;
            setRiggedRoll(null);
        }

        try {
            engine.rollDice(decided);
        } catch (e) {
            console.error(e);
            return;
        }

        // A roll by anyone ends the chance to take back the last score.
        setUndo(null);

        const states = syncStates();
        const after = states[activePlayer];
        setPotentialScores(after.rollsLeft === 3 ? emptyPotentials() : computePotentialScores(engine, after));

        setIsRolling(true);
        playSound('roll');
        if (watchdog.current) clearTimeout(watchdog.current);
        watchdog.current = setTimeout(() => setIsRolling(false), ROLL_WATCHDOG_MS);

        arena.rollToResult(decided, { chaosMs: 1200 });
    }, [gameState, isRolling, celebrating, activePlayer, arenaRef, syncStates, playSound, setUndo]);

    /** Called by the arena once the dice have visually come to rest. */
    const handleTurnComplete = useCallback(
        (results: number[]) => {
            setIsRolling(false);
            if (watchdog.current) {
                clearTimeout(watchdog.current);
                watchdog.current = null;
            }

            const vals = results.map((v) => normalizeDie(v));

            // Raised in the same render that ends the roll, so a CPU waiting on `isRolling`
            // sees the celebration before it takes its next step. The celebration keeps its
            // own beat before it starts moving, and shakes the table itself on its big moment.
            if (vals.length === 5 && vals.every((v) => v === vals[0])) {
                setSarzeesInGame((prev) => prev + 1);
                setShowNancyCelebration(false);
                setShowCelebration(true);
            } else if (gameState && isNancy(vals, gameState.rollsLeft)) {
                setNancysInGame((prev) => prev + 1);
                setShowCelebration(false);
                setShowNancyCelebration(true);
            }
        },
        [gameState]
    );

    const selectCategory = useCallback(
        (category: ScoreCategory) => {
            if (!gameState || isRolling || celebrating || gameState.rollsLeft === 3) return;

            const engine = enginesRef.current[activePlayer];
            // Undo restores this rather than reversing the arithmetic, so a bonus, a joker
            // score or game over comes back exactly as it was.
            const before = engine.getGameState();
            try {
                engine.commitScore(category);
            } catch (e) {
                console.error(e);
                return;
            }

            playSound('score');
            const states = syncStates();
            const nextPlayer = (activePlayer + 1) % playerCount;
            setActivePlayer(nextPlayer);
            setPotentialScores(emptyPotentials());
            setIsRolling(false);
            arenaRef.current?.reset();

            // Everyone gets the same number of turns, so the game ends exactly when play
            // wraps back round to a player whose card is already full.
            const gameOver = states[nextPlayer].isGameOver;
            let matchLogId: string | null = null;
            if (gameOver) {
                setPhase('GAME_OVER');
                matchLogId =
                    appendMatchLog({
                        boardName: getBoard(selectedBoard).name,
                        names: customNames,
                        types: playerTypes,
                        totals: states.map((s) => s.totalScore),
                        sarzeeCount: sarzeesInGame,
                        nancyCount: nancysInGame,
                    })?.id ?? null;
            }

            // Only a human's score can be taken back; a CPU's choice is never a slip.
            if (playerTypes[activePlayer] === 'HUMAN') {
                const graceMs = !gameOver && playerTypes[nextPlayer] !== 'HUMAN' ? UNDO_GRACE_MS : null;
                undoSeq.current += 1;
                setUndo({
                    id: undoSeq.current,
                    player: activePlayer,
                    category,
                    graceMs,
                    graceUntil: graceMs === null ? null : Date.now() + graceMs,
                    before,
                    matchLogId,
                });
            } else {
                setUndo(null);
            }
        },
        [
            gameState,
            isRolling,
            celebrating,
            activePlayer,
            playerCount,
            arenaRef,
            syncStates,
            selectedBoard,
            customNames,
            playerTypes,
            sarzeesInGame,
            nancysInGame,
            playSound,
            setUndo,
        ]
    );

    /**
     * Takes back the last human score: that player's engine goes back to the moment before
     * the commit, and the turn returns to them with the same dice, holds and rolls left.
     */
    const undoLastScore = useCallback(() => {
        const entry = undoRef.current;
        if (!entry) return;
        const engine = enginesRef.current[entry.player];
        if (!engine) return;

        engine.restoreState(entry.before);
        // The game this record described is no longer over.
        if (entry.matchLogId) removeMatchLog(entry.matchLogId);
        setUndo(null);

        const states = syncStates();
        setActivePlayer(entry.player);
        setPotentialScores(computePotentialScores(engine, states[entry.player]));
        setHighlightedCategory(null);
        setPhase('PLAYING');
        arenaRef.current?.showDice(entry.before.diceValues);
    }, [arenaRef, syncStates, setUndo]);

    // A backgrounded tab freezes requestAnimationFrame, so a roll started just before
    // switching away never reports completion. Re-check when the player comes back.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (watchdog.current) clearTimeout(watchdog.current);
            watchdog.current = setTimeout(() => setIsRolling(false), 2000);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    const scorecards = useMemo(() => allStates.map((s) => s.scorecard), [allStates]);
    const totals = useMemo(() => allStates.map((s) => s.totalScore), [allStates]);
    const upperBonuses = useMemo(() => allStates.map((s) => s.upperBonus), [allStates]);
    const yahtzeeBonuses = useMemo(() => allStates.map((s) => s.yahtzeeBonus), [allStates]);

    const isHumanTurn = playerTypes[activePlayer] === 'HUMAN';
    const canInteractDice = !!gameState && !isRolling && gameState.rollsLeft < 3 && isHumanTurn;
    const canSelectCategory = canInteractDice;

    return {
        // phase & setup
        phase,
        selectedBoard,
        setSelectedBoard,
        board: getBoard(selectedBoard),
        playerCount,
        setPlayerCount,
        customNames,
        setCustomNames,
        playerTypes,
        setPlayerTypes,
        playerDiceColors,
        setPlayerDiceColors,

        // play
        enginesRef,
        activePlayer,
        gameState,
        scorecards,
        totals,
        upperBonuses,
        yahtzeeBonuses,
        potentialScores,
        setPotentialScores,
        isRolling,
        canInteractDice,
        canSelectCategory,
        isHumanTurn,

        // actions
        startGame,
        resetAll,
        roll,
        toggleHold,
        selectCategory,
        handleTurnComplete,
        syncStates,
        undoOffer,
        undoLastScore,
        riggedRoll,
        armRiggedRoll,

        // celebrations
        showCelebration,
        setShowCelebration,
        showNancyCelebration,
        setShowNancyCelebration,
        highlightedCategory,
        setHighlightedCategory,
    };
}

export type SarzeeGame = ReturnType<typeof useSarzeeGame>;

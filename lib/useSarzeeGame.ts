// lib/useSarzeeGame.ts
'use client';

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SarzeeEngine } from './SarzeeEngine';
import { DieValue, GamePhase, GameState, ScoreCategory } from './types';
import { CpuPersonality } from './CpuAgent';
import { DEFAULT_BOARD_ID, getBoard } from './boards';
import { appendMatchLog } from './matchLog';
import { useGameSounds } from './useGameSounds';

export type PlayerType = 'HUMAN' | CpuPersonality;

export interface DiceArenaLike {
    rollToResult: (values: number[], opts?: { chaosMs?: number }) => void;
    reset: () => void;
    triggerCelebrationShake: (intensity?: number) => void;
}

/** If the arena never reports back (backgrounded tab, lost WebGL context), unstick the UI. */
const ROLL_WATCHDOG_MS = 8000;

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

    const celebrationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nancyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

    const gameState: GameState | null = allStates[activePlayer] ?? null;

    /** Re-read every engine. Cheap enough at 4 players and keeps one source of truth. */
    const syncStates = useCallback(() => {
        const states = enginesRef.current.map((e) => e.getGameState());
        setAllStates(states);
        return states;
    }, []);

    const clearTimers = useCallback(() => {
        for (const ref of [celebrationTimeout, nancyTimeout, watchdog]) {
            if (ref.current) {
                clearTimeout(ref.current);
                ref.current = null;
            }
        }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const startGame = useCallback(() => {
        const count = playerCount;
        const board = getBoard(selectedBoard);

        setPlayerTypes((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? 'HUMAN'));
        setCustomNames((prev) => Array.from({ length: count }, (_, i) => prev[i] || `Player ${i + 1}`));
        setPlayerDiceColors((prev) =>
            Array.from({ length: count }, (_, i) => prev[i] || board.diceColors[i % board.diceColors.length])
        );

        enginesRef.current = Array.from({ length: count }, () => new SarzeeEngine());
        setActivePlayer(0);
        setAllStates(enginesRef.current.map((e) => e.getGameState()));
        setPotentialScores(emptyPotentials());
        setSarzeesInGame(0);
        setNancysInGame(0);
        setHighlightedCategory(null);
        setIsRolling(false);
        clearTimers();

        arenaRef.current?.reset();
        setPhase('PLAYING');
    }, [playerCount, selectedBoard, arenaRef, clearTimers]);

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
    }, [clearTimers]);

    const toggleHold = useCallback(
        (idx: number) => {
            if (!gameState || isRolling || gameState.rollsLeft === 3) return;
            const engine = enginesRef.current[activePlayer];
            engine.toggleHold(idx);
            const states = syncStates();
            setPotentialScores(computePotentialScores(engine, states[activePlayer]));
        },
        [gameState, isRolling, activePlayer, syncStates]
    );

    const roll = useCallback(() => {
        if (!gameState || isRolling || gameState.rollsLeft <= 0 || gameState.isGameOver) return;
        const arena = arenaRef.current;
        if (!arena) return;

        const engine = enginesRef.current[activePlayer];

        // The outcome is decided here, up front — the animation is a presentation of a
        // result that already exists, never the thing that determines it.
        const decided: DieValue[] = [];
        for (let i = 0; i < 5; i++) {
            decided[i] = gameState.heldDice[i]
                ? normalizeDie(Number(gameState.diceValues[i] ?? 1))
                : (1 + Math.floor(Math.random() * 6)) as DieValue;
        }

        try {
            engine.rollDice(decided);
        } catch (e) {
            console.error(e);
            return;
        }

        const states = syncStates();
        const after = states[activePlayer];
        setPotentialScores(after.rollsLeft === 3 ? emptyPotentials() : computePotentialScores(engine, after));

        setIsRolling(true);
        playSound('/sounds/roll.mp3', 0.7);
        if (watchdog.current) clearTimeout(watchdog.current);
        watchdog.current = setTimeout(() => setIsRolling(false), ROLL_WATCHDOG_MS);

        arena.rollToResult(decided, { chaosMs: 1200 });
    }, [gameState, isRolling, activePlayer, arenaRef, syncStates, playSound]);

    /** Called by the arena once the dice have visually come to rest. */
    const handleTurnComplete = useCallback(
        (results: number[]) => {
            setIsRolling(false);
            if (watchdog.current) {
                clearTimeout(watchdog.current);
                watchdog.current = null;
            }

            const vals = results.map((v) => normalizeDie(v));

            if (vals.length === 5 && vals.every((v) => v === vals[0])) {
                setSarzeesInGame((prev) => prev + 1);
                if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
                setShowCelebration(false);
                celebrationTimeout.current = setTimeout(() => {
                    setShowCelebration(true);
                    arenaRef.current?.triggerCelebrationShake(3.5);
                    celebrationTimeout.current = null;
                }, 1000);
            } else if (gameState && isNancy(vals, gameState.rollsLeft)) {
                setNancysInGame((prev) => prev + 1);
                if (nancyTimeout.current) clearTimeout(nancyTimeout.current);
                setShowNancyCelebration(false);
                nancyTimeout.current = setTimeout(() => {
                    setShowNancyCelebration(true);
                    arenaRef.current?.triggerCelebrationShake(2.5);
                    nancyTimeout.current = null;
                }, 1000);
            }
        },
        [gameState, arenaRef]
    );

    const selectCategory = useCallback(
        (category: ScoreCategory) => {
            if (!gameState || isRolling || gameState.rollsLeft === 3) return;

            const engine = enginesRef.current[activePlayer];
            try {
                engine.commitScore(category);
            } catch (e) {
                console.error(e);
                return;
            }

            playSound('/sounds/score.mp3', 0.6);
            const states = syncStates();
            const nextPlayer = (activePlayer + 1) % playerCount;
            setActivePlayer(nextPlayer);
            setPotentialScores(emptyPotentials());
            setIsRolling(false);
            arenaRef.current?.reset();

            // Everyone gets the same number of turns, so the game ends exactly when play
            // wraps back round to a player whose card is already full.
            if (states[nextPlayer].isGameOver) {
                setPhase('GAME_OVER');
                appendMatchLog({
                    boardName: getBoard(selectedBoard).name,
                    names: customNames,
                    types: playerTypes,
                    totals: states.map((s) => s.totalScore),
                    sarzeeCount: sarzeesInGame,
                    nancyCount: nancysInGame,
                });
            }
        },
        [
            gameState,
            isRolling,
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
        ]
    );

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
    const yahtzeeBonuses = useMemo(() => allStates.map((s) => s.yahtzeeBonus), [allStates]);

    const isHumanTurn = playerTypes[activePlayer] === 'HUMAN';
    const canInteractDice = !!gameState && !isRolling && gameState.rollsLeft < 3 && isHumanTurn;
    const canSelectCategory = canInteractDice;

    return {
        // phase & setup
        phase,
        setPhase,
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
        allStates,
        scorecards,
        totals,
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

        // celebrations
        sarzeesInGame,
        nancysInGame,
        showCelebration,
        setShowCelebration,
        showNancyCelebration,
        setShowNancyCelebration,
        highlightedCategory,
        setHighlightedCategory,
    };
}

export type SarzeeGame = ReturnType<typeof useSarzeeGame>;

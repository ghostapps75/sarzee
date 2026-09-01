// lib/useCpuTurn.ts
'use client';

/*
 * The CPU's narration ("Rosie is deciding which dice to hold...") is a side effect of the
 * agent taking a step, not something derivable from the current state: the same state
 * produces different lines depending on which beat of the turn is running. So it is set
 * from inside the turn effect, which React 19's set-state-in-effect rule flags.
 */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from 'react';
import { CpuAgent, CpuPersonality } from './CpuAgent';
import { DieValue, ScoreCategory } from './types';
import { SarzeeGame, computePotentialScores } from './useSarzeeGame';

/** How a CPU seat plays, for the narration. The seat's name is shown separately. */
function playStyle(type: string): string {
    if (type === 'SAFE_SAM') return 'cautious';
    if (type === 'RISK_TAKING_ROSIE') return 'aggressive';
    if (type === 'BALANCED_BOBBY') return 'balanced';
    return 'thinking';
}

export function formatCategoryName(cat: ScoreCategory): string {
    switch (cat) {
        case ScoreCategory.ThreeOfAKind: return 'Three of a Kind';
        case ScoreCategory.FourOfAKind: return 'Four of a Kind';
        case ScoreCategory.FullHouse: return 'Full House';
        case ScoreCategory.SmallStraight: return 'Small Straight';
        case ScoreCategory.LargeStraight: return 'Large Straight';
        case ScoreCategory.Yahtzee: return 'Sarzee';
        default: return cat;
    }
}

/** Pacing for the "thinking" theatre, in ms. */
const BEAT = { firstRoll: 1500, decideHold: 1200, rollAgain: 1000, commit: 1800 };

/**
 * Drives CPU seats. Each effect pass performs exactly one step of the CPU's turn and
 * then lets the resulting state change re-trigger the effect, which keeps the CPU on
 * the same code path a human uses instead of running a parallel game loop.
 */
export function useCpuTurn(game: SarzeeGame) {
    const [message, setMessage] = useState('');

    const busy = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {
        phase,
        activePlayer,
        gameState,
        isRolling,
        showCelebration,
        showNancyCelebration,
        playerTypes,
        customNames,
        enginesRef,
        roll,
        selectCategory,
        syncStates,
        setPotentialScores,
        setHighlightedCategory,
    } = game;

    useEffect(() => {
        if (phase !== 'PLAYING') return;

        const personality = playerTypes[activePlayer];
        if (!personality || personality === 'HUMAN') return;

        if (busy.current || isRolling || showCelebration || showNancyCelebration) return;
        if (!gameState || gameState.isGameOver) return;

        const engine = enginesRef.current[activePlayer];
        if (!engine) return;

        const seat = activePlayer;
        const name = customNames[seat] ?? `Player ${seat + 1}`;
        const agent = new CpuAgent(engine);

        busy.current = true;

        /** Guards against a step firing after the turn (or the game) has moved on. */
        const stillOurTurn = () => phase === 'PLAYING' && enginesRef.current[seat] === engine;

        const after = (ms: number, fn: () => void) => {
            timer.current = setTimeout(() => {
                if (!stillOurTurn()) {
                    busy.current = false;
                    return;
                }
                fn();
                busy.current = false;
            }, ms);
        };

        // Opening roll of the turn.
        if (gameState.rollsLeft === 3) {
            setMessage(`${name} is planning a ${playStyle(personality)} opening roll...`);
            after(BEAT.firstRoll, roll);
            return;
        }

        const holds = agent.decideHold(
            gameState.diceValues as DieValue[],
            gameState.rollsLeft,
            gameState.scorecard,
            personality as CpuPersonality
        );
        const holdingEverything = holds.every(Boolean);

        // Adjust holds, then roll what's left.
        if (gameState.rollsLeft > 0 && !holdingEverything) {
            setMessage(`${name} is deciding which dice to hold...`);
            timer.current = setTimeout(() => {
                if (!stillOurTurn()) {
                    busy.current = false;
                    return;
                }

                let changed = false;
                for (let i = 0; i < 5; i++) {
                    if (gameState.heldDice[i] !== holds[i]) {
                        engine.toggleHold(i);
                        changed = true;
                    }
                }
                if (changed) {
                    const states = syncStates();
                    setPotentialScores(computePotentialScores(engine, states[seat]));
                }

                setMessage(`${name} is rolling the remaining dice...`);
                after(BEAT.rollAgain, roll);
            }, BEAT.decideHold);
            return;
        }

        // Nothing left to improve — commit a score.
        const potential = computePotentialScores(engine, gameState);
        const openCats = (Object.values(ScoreCategory) as ScoreCategory[]).filter(
            (c) => gameState.scorecard[c] === null
        );
        const chosen =
            agent.decideCategory(gameState.scorecard, potential, personality as CpuPersonality) ?? openCats[0];

        if (!chosen) {
            busy.current = false;
            return;
        }

        setMessage(`${name} chooses to lock in ${formatCategoryName(chosen)}!`);
        setHighlightedCategory(chosen);
        after(BEAT.commit, () => {
            setHighlightedCategory(null);
            selectCategory(chosen);
        });
    }, [
        phase,
        activePlayer,
        gameState,
        isRolling,
        showCelebration,
        showNancyCelebration,
        playerTypes,
        customNames,
        enginesRef,
        roll,
        selectCategory,
        syncStates,
        setPotentialScores,
        setHighlightedCategory,
    ]);

    // Cancel any pending beat when the turn changes or the component goes away.
    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            busy.current = false;
        },
        [activePlayer, phase]
    );

    // Whether a CPU is on the clock is a fact about the game, not a separate piece of
    // state to keep in sync.
    const isThinking = phase === 'PLAYING' && !!playerTypes[activePlayer] && playerTypes[activePlayer] !== 'HUMAN';

    return { isThinking, message: isThinking ? message : '' };
}

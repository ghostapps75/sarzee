'use client';

import React, { useRef, useState, useEffect } from 'react';
import DiceArena, { DiceArenaHandle } from "@/components/DiceArena";
// import ScorecardUI from "@/components/Scorecard"; // Deprecated
import RealisticScorecard from "@/components/RealisticScorecard";
import { SarzeeEngine } from "@/lib/SarzeeEngine";
import { ScoreCategory, GameState, DieValue } from "@/lib/types";

type GamePhase = 'SETUP' | 'PLAYING' | 'GAME_OVER';

export default function Home() {
  const engineRef = useRef<SarzeeEngine | null>(null);

  // Multiplayer State
  const [phase, setPhase] = useState<GamePhase>('SETUP');
  const [playerCount, setPlayerCount] = useState(1);
  const [cpuEnabled, setCpuEnabled] = useState(false); // New CPU Toggle
  const [playerNames, setPlayerNames] = useState<string[]>([]); // Custom Names
  const [activePlayer, setActivePlayer] = useState(0);
  const [viewingPlayer, setViewingPlayer] = useState<number | null>(null); // For peeking at opponents

  const engines = useRef<SarzeeEngine[]>([]);

  // Current UI State (derived from active engine)
  const activeEngineIdx = viewingPlayer !== null ? viewingPlayer : activePlayer;
  // We need to fetch state from the VIEWED engine, but interactions go to ACTIVE engine (if not CPU)

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [potentialScores, setPotentialScores] = useState<Record<ScoreCategory, number>>({} as any);
  const [isRolling, setIsRolling] = useState(false);
  const [isCpuTurn, setIsCpuTurn] = useState(false);

  const arenaRef = useRef<DiceArenaHandle>(null);

  useEffect(() => {
    // CPU Turn Loop
    if (phase === 'PLAYING' && isCpuTurn && activePlayer === 1 && cpuEnabled && !isRolling) {
      // Simple CPU Logic:
      // 1. If rollsLeft == 3, ROLL.
      // 2. If rollsLeft < 3, decide to Hold or Score.
      // For MVP: CPU plays RANDOM strategy or simple "Hold 6s" strategy?

      const timeout = setTimeout(() => {
        cpuPlayStep();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [phase, isCpuTurn, activePlayer, gameState, isRolling]);

  const cpuPlayStep = () => {
    if (!engineRef.current || !gameState) return;

    console.log("CPU Thinking... RollsLeft:", gameState.rollsLeft);

    // 1. Needs to Roll?
    if (gameState.rollsLeft > 0) {
      // If not first roll, hold some dice
      if (gameState.rollsLeft < 3) {
        // Simple Logic: Hold 6s
        gameState.diceValues.forEach((val, idx) => {
          if (val === 6 && !gameState.heldDice[idx]) {
            engineRef.current!.toggleHold(idx);
          }
        });
        refreshState();
      }

      handleRollClick(); // CPU triggers roll
    } else {
      // 2. Select Score
      // Pick first available category that gives points, or worst case 0.
      const cats = Object.values(ScoreCategory);
      // Prioritize high scores
      let bestCat = cats[0];
      let bestScore = -1;

      for (const cat of cats) {
        if (gameState.scorecard[cat] === null) {
          const score = engineRef.current.calculatePotentialScore(cat, gameState.diceValues);
          if (score > bestScore) {
            bestScore = score;
            bestCat = cat;
          }
        }
      }
      handleCategorySelect(bestCat);
    }
  };

  const startGame = (count: number, withCpu: boolean, names: string[]) => {
    console.log("Starting game:", count, withCpu, names);
    const finalCount = withCpu ? 2 : count; // Force 2 players if CPU mode (P1 vs CPU) (Or allow P1+P2+CPU?) 
    // User said "option for 1 cpu player should exist". Implies 1v1 CPU.

    engines.current = Array(finalCount).fill(null).map(() => new SarzeeEngine());
    setPlayerCount(finalCount);
    setCpuEnabled(withCpu);
    setPlayerNames(names);
    setActivePlayer(0);
    setPhase('PLAYING');

    // Load P1 state
    engineRef.current = engines.current[0];
    refreshState();

    // Reset arena just in case
    setTimeout(() => arenaRef.current?.reset(), 100);
  };

  // ... (previous code)

  // Handler: Physics reported turn complete
  const handleTurnComplete = (diceValues: number[]) => {
    console.log("Turn Complete reported with:", diceValues);
    if (!engineRef.current) return;
    try {
      const validValues = diceValues.map(v => Math.max(1, Math.min(6, Math.round(v)))) as DieValue[];
      engineRef.current.rollDice(validValues);
      refreshState();
    } catch (e) {
      console.error("Engine Error:", e);
    } finally {
      setIsRolling(false);
    }
  };

  const refreshState = () => {
    if (!engineRef.current) return;
    const newState = engineRef.current.getGameState();
    setGameState(newState);

    const newPotentials = {} as Record<ScoreCategory, number>;
    Object.values(ScoreCategory).forEach(cat => {
      newPotentials[cat] = engineRef.current!.calculatePotentialScore(cat, newState.diceValues);
    });
    setPotentialScores(newPotentials);
  }

  const handleRollClick = () => {
    console.log("Roll clicked. Rolling?", isRolling, "Rolls Left:", gameState?.rollsLeft);
    if (!engineRef.current || isRolling) return;
    if (gameState?.rollsLeft === 0) return;

    setIsRolling(true);
    arenaRef.current?.roll();

    // Failsafe: If physics doesn't return in 4 seconds, force reset
    setTimeout(() => {
      setIsRolling(prev => {
        if (prev) {
          console.warn("Roll timed out - forcing unlock");
          return false;
        }
        return false;
      });
    }, 4000);
  };

  const handleDieClick = (index: number) => {
    // Strict Turn Check: Only active player can click
    // And if it is CPU turn, NO ONE can click (unless we are debugging, but generally CPU plays automatically)
    if (activePlayer !== 0 && !cpuEnabled) { // If multiplayer (Human vs Human), ensure we only click on OUR turn?
      // Wait, this is a local hotseat game. So "Active Player" IS the person holding the device.
      // So we don't need to block "Active Player" from clicking.
      // BUT if it IS CPU turn, we must block.
    }

    if (isCpuTurn) return;

    // EMERGENCY FIX: Removed isRolling check.
    if (!engineRef.current) return;
    if (gameState?.rollsLeft === 3) return; // Still block if we haven't rolled yet
    engineRef.current.toggleHold(index);
    refreshState();
  };

  const handleCategorySelect = (category: ScoreCategory) => {
    if (!engineRef.current) return;
    // Prevent human from clicking during CPU turn
    if (isCpuTurn && !cpuEnabled) {
      // Actually if isCpuTurn is true, it IS cpu enabled context.
      // Just prevent interaction if activePlayer !== 0 (assuming P1 is human)
    }

    // ... existing logic ...

    try {
      engineRef.current.commitScore(category);

      // Switch Turn
      let nextPlayer = activePlayer + 1;
      if (nextPlayer >= playerCount) nextPlayer = 0;
      setActivePlayer(nextPlayer);

      // Update References
      engineRef.current = engines.current[nextPlayer];
      console.log("Switching to Player", nextPlayer + 1);

      // Reset Arena
      arenaRef.current?.reset();

      // Check CPU
      const nextIsCpu = cpuEnabled && nextPlayer === 1; // P2 is CPU
      setIsCpuTurn(nextIsCpu);

      refreshState();

      // Check Game Over...
      const allDone = engines.current.every(eng => eng.getGameState().isGameOver);
      if (allDone) setPhase('GAME_OVER');

    } catch (e) {
      console.error(e);
    }
  };

  // Render Setup Screen
  if (phase === 'SETUP') {
    return (
      <main className="w-full h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center font-sans text-white">
        <div className="bg-slate-900/80 backdrop-blur-xl p-12 rounded-2xl border border-white/10 shadow-2xl text-center">
          <h1 className="text-6xl font-black mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Sarzee</h1>
          <p className="text-xl text-gray-400 mb-8">Multiplayer 3D Luck & Logic</p>

          <h2 className="text-lg uppercase tracking-widest text-gray-500 mb-4 font-bold">Select Players</h2>
          <div className="flex gap-4 justify-center">
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                onClick={() => startGame(num, false, [])}
                className="w-16 h-16 rounded-xl bg-slate-800 hover:bg-blue-600 hover:scale-110 transition-all font-bold text-2xl border border-slate-700 hover:border-blue-400 shadow-lg"
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Render Game Over Screen
  if (phase === 'GAME_OVER') {
    // Sort scores
    const scores = engines.current.map((eng, i) => ({ id: i + 1, score: eng.getGameState().totalScore }));
    scores.sort((a, b) => b.score - a.score);
    const winner = scores[0];

    return (
      <main className="w-full h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center font-sans text-white relative z-50">
        <div className="bg-slate-900/90 backdrop-blur-2xl p-12 rounded-2xl border border-yellow-500/30 shadow-2xl text-center max-w-lg w-full">
          <h1 className="text-5xl font-black mb-8 text-yellow-400">Game Over!</h1>

          <div className="space-y-4 mb-8">
            {scores.map((p, index) => (
              <div key={p.id} className={`flex justify-between items-center p-4 rounded-lg ${index === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-slate-800/50'}`}>
                <span className="text-xl font-bold">Player {p.id}</span>
                <span className="text-2xl font-black">{p.score} pts</span>
                {index === 0 && <span>🏆</span>}
              </div>
            ))}
          </div>

          <div className="text-lg mb-8 text-gray-300">
            Winner: <span className="font-bold text-white">Player {winner.id}</span>
          </div>

          <button
            onClick={() => setPhase('SETUP')}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-full font-bold text-lg shadow-lg hover:shadow-blue-500/50 transition-all"
          >
            Play Again
          </button>
        </div>
      </main>
    );
  }

  // Render Main Game
  if (!gameState) return null;

  return (
    <main className="w-full h-screen relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900 overflow-hidden font-sans select-none">

      {/* 3D Arena */}
      <div className="absolute inset-0 z-0">
        <DiceArena
          ref={arenaRef}
          onTurnComplete={handleTurnComplete}
          heldDice={gameState.heldDice}
          onDieClick={handleDieClick}
          // EMERGENCY FIX: Removed !isRolling check to prevent lockouts.
          // Allow interaction as long as we have rolled at least once (rollsLeft < 3)
          canInteract={(gameState?.rollsLeft || 3) < 3}
        />
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">

        {/* DEBUG PANEL - REMOVE LATER */}
        <div className="absolute top-4 left-4 bg-red-500/80 p-2 text-white text-xs font-mono pointer-events-none z-50">
          <p>RollsLeft: {gameState ? gameState.rollsLeft : 'null'}</p>
          <p>IsRolling: {isRolling.toString()}</p>
          <p>Phase: {phase}</p>
          <p>Can Interact: {(!isRolling && gameState.rollsLeft < 3 && gameState.rollsLeft >= 0).toString()}</p>
        </div>
        {/* Header for Active Player */}
        {playerCount > 1 && (
          <div className="absolute top-8 left-0 right-0 text-center pointer-events-none">
            <div className="inline-block px-8 py-2 bg-slate-900/80 backdrop-blur border border-white/10 rounded-full shadow-2xl">
              <span className="text-gray-400 mr-2">Current Turn:</span>
              <span className="text-2xl font-bold text-white">Player {activePlayer + 1}</span>
            </div>
          </div>
        )}

        {/* Controls - Bottom Left */}
        <div className="absolute bottom-8 left-8 pointer-events-auto flex flex-col gap-4">
          <button
            onClick={handleRollClick}
            disabled={isRolling || gameState.rollsLeft === 0}
            className={
              `px-8 py-4 rounded-full text-2xl font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95
                      ${isRolling || gameState.rollsLeft === 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/50'}`
            }
          >
            {gameState.rollsLeft === 0 ? 'Select Score' : isRolling ? 'Rolling...' : `ROLL (${gameState.rollsLeft})`}
          </button>

          <div className="text-white bg-black/50 p-4 rounded-xl backdrop-blur border border-white/10 shadow-xl">
            <div className="text-sm text-gray-400 uppercase tracking-widest font-bold mb-1">Phase</div>
            <div className="text-lg font-medium">
              {isRolling ? 'Rolling...' :
                gameState.rollsLeft === 3 ? 'Start Turn' :
                  gameState.rollsLeft === 0 ? 'Select Score' : 'Roll or Hold'}
            </div>
          </div>
        </div>

        {/* Right Side Scorecard */}
        <div className="pointer-events-auto h-full flex items-center mr-8">
          <div className="max-h-[90vh] overflow-y-auto custom-scrollbar">
            <RealisticScorecard
              scorecard={gameState.scorecard}
              potentialScores={potentialScores}
              onSelectCategory={handleCategorySelect}
              currentTurn={gameState.currentTurn}
              rollsLeft={gameState.rollsLeft}
              totalScore={gameState.totalScore}
              playerName={`Player ${activePlayer + 1}`}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

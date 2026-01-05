'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceArena, { DiceArenaHandle } from '@/components/DiceArena';
import MultiPlayerScorecard from '@/components/MultiPlayerScorecard';
import SarzeeCelebration from '@/components/SarzeeCelebration';
import { SarzeeEngine } from '@/lib/SarzeeEngine';
import { ScoreCategory, GameState, DieValue, GamePhase } from '@/lib/types';

function computePotentialScores(engine: SarzeeEngine, state: GameState) {
  const out: Record<ScoreCategory, number> = {} as any;
  (Object.values(ScoreCategory) as ScoreCategory[]).forEach((cat) => {
    if (state.scorecard[cat] === null) out[cat] = engine.calculatePotentialScore(cat);
  });
  return out;
}

function useSafeAudio(urls: string[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = urls[0] ?? '';
    audioRef.current = a;
    return () => {
      audioRef.current = null;
    };
  }, [urls]);

  const play = async () => {
    for (const u of urls) {
      try {
        const a = audioRef.current ?? new Audio();
        a.src = u;
        a.currentTime = 0;
        await a.play();
        audioRef.current = a;
        return;
      } catch {
        // try next
      }
    }
  };

  return { play };
}

type Rect = { left: number; top: number; width: number; height: number };
type ImgInfo = { w: number; h: number };

function computeCover(containerW: number, containerH: number, imgW: number, imgH: number) {
  const s = Math.max(containerW / imgW, containerH / imgH);
  const dw = imgW * s;
  const dh = imgH * s;
  const ox = (containerW - dw) / 2;
  const oy = (containerH - dh) / 2;
  return { scale: s, offsetX: ox, offsetY: oy };
}

const BASE_W = 1024;
const BASE_H = 558;
const INSET_X_BASE = 150;
const INSET_Y_BASE = 135;

const normalizeDie = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

export default function Page() {
  const isDev = process.env.NODE_ENV === 'development';

  const [phase, setPhase] = useState<GamePhase>('SETUP');
  const [playerCount, setPlayerCount] = useState(1);
  const [activePlayer, setActivePlayer] = useState(0);

  const enginesRef = useRef<SarzeeEngine[]>([]);
  const arenaRef = useRef<DiceArenaHandle>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [potentialScores, setPotentialScores] = useState<Record<ScoreCategory, number>>({} as any);
  const [isRolling, setIsRolling] = useState(false);

  const [setupStep, setSetupStep] = useState<'COUNT' | 'NAMES'>('COUNT');
  const [customNames, setCustomNames] = useState<string[]>([]);

  const [showCelebration, setShowCelebration] = useState(false);
  const [mobileScorecardOpen, setMobileScorecardOpen] = useState(false);

  // --- dev-only debug panel state ---
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [showDieNumbers, setShowDieNumbers] = useState(false);
  const [arenaVisualValues, setArenaVisualValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [arenaEmittedValues, setArenaEmittedValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [engineDiceValues, setEngineDiceValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [arenaRollSeq, setArenaRollSeq] = useState<number>(0);

  const rollSound = useSafeAudio(['/sounds/roll.mp3', '/sounds/dice.mp3', '/sounds/roll.wav']);

  const selectPlayerCount = (count: number) => {
    setPlayerCount(count);
    setCustomNames(Array.from({ length: count }, (_, i) => `Player ${i + 1}`));
    setSetupStep('NAMES');
  };

  const commitStartGame = () => {
    const count = playerCount;
    enginesRef.current = Array.from({ length: count }, () => new SarzeeEngine());

    setActivePlayer(0);

    const s = enginesRef.current[0].getGameState();
    setGameState(s);
    setPotentialScores({} as any);

    setTimeout(() => arenaRef.current?.reset(), 0);
    setPhase('PLAYING');
  };

  const resetAll = () => {
    enginesRef.current = [];
    setGameState(null);
    setPotentialScores({} as any);
    setActivePlayer(0);
    setPlayerCount(1);
    setPhase('SETUP');
    setSetupStep('COUNT');
    setCustomNames([]);
    setIsRolling(false);
    setShowCelebration(false);
    setMobileScorecardOpen(false);
  };

  const handleDieClick = (idx: number) => {
    if (!gameState) return;
    if (isRolling) return; // prevent mid-animation toggles
    if (gameState.rollsLeft === 3) return;

    const engine = enginesRef.current[activePlayer];
    engine.toggleHold(idx);

    const s = engine.getGameState();
    setGameState(s);
    setPotentialScores(computePotentialScores(engine, s));
  };

  const handleTurnComplete = (results: number[]) => {
    // In game-correct mode: this is "visual animation finished".
    setIsRolling(false);

    // Dev debug capture
    setArenaEmittedValues(results.map((v) => normalizeDie(v)));
    if (arenaRef.current) {
      try {
        requestAnimationFrame(() => {
          if (!arenaRef.current) return;
          setArenaVisualValues(arenaRef.current.getVisualValues());
          setArenaRollSeq(arenaRef.current.getRollSeq());
        });
      } catch {
        // ignore
      }
    }

    // Celebration: if current roll is a Yahtzee visually/emitted
    const vals = results.map((v) => normalizeDie(v));
    if (vals.length === 5 && vals.every((v) => v === vals[0])) {
      setShowCelebration(false);
      requestAnimationFrame(() => setShowCelebration(true));
    }
  };

  const handleRoll = async () => {
    if (!gameState) return;
    if (isRolling) return;
    if (gameState.rollsLeft <= 0) return;
    if (gameState.isGameOver) return;
    if (!arenaRef.current) return;

    const engine = enginesRef.current[activePlayer];

    // Decide values NOW (game-correct).
    const decided: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (gameState.heldDice[i]) {
        decided[i] = normalizeDie(Number(gameState.diceValues[i] ?? 1));
      } else {
        decided[i] = 1 + Math.floor(Math.random() * 6);
      }
    }

    // Commit to engine immediately (truth source)
    try {
      engine.rollDice(decided as DieValue[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return;
    }

    const sAfter = engine.getGameState();
    setGameState(sAfter);
    setEngineDiceValues(sAfter.diceValues.map((v) => Number(v)));
    setPotentialScores(sAfter.rollsLeft === 3 ? ({} as any) : computePotentialScores(engine, sAfter));

    // Animate then snap the visuals to the decided outcome
    setIsRolling(true);
    void rollSound.play();
    arenaRef.current.rollToResult(decided, { chaosMs: 1200 });
  };

  const forceSarzee = useCallback(() => {
    if (!gameState || isRolling) return;
    if (!arenaRef.current) return;

    const engine = enginesRef.current[activePlayer];
    const decided = [6, 6, 6, 6, 6];

    try {
      engine.rollDice(decided as DieValue[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return;
    }

    const sAfter = engine.getGameState();
    setGameState(sAfter);
    setEngineDiceValues(sAfter.diceValues.map((v) => Number(v)));
    setPotentialScores(sAfter.rollsLeft === 3 ? ({} as any) : computePotentialScores(engine, sAfter));

    setIsRolling(true);
    arenaRef.current.rollToResult(decided, { chaosMs: 700 });
  }, [activePlayer, gameState, isRolling]);

  const triggerCelebration = useCallback(() => {
    setShowCelebration(false);
    requestAnimationFrame(() => setShowCelebration(true));
  }, []);

  const handleCategorySelect = (category: ScoreCategory) => {
    if (!gameState) return;
    if (isRolling) return;
    if (gameState.rollsLeft === 3) return;

    const engine = enginesRef.current[activePlayer];
    try {
      engine.commitScore(category);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return;
    }

    const nextPlayer = (activePlayer + 1) % playerCount;
    setActivePlayer(nextPlayer);

    const nextEngine = enginesRef.current[nextPlayer];
    const s = nextEngine.getGameState();
    setGameState(s);
    setPotentialScores({} as any);

    arenaRef.current?.reset();
    setIsRolling(false);
    setMobileScorecardOpen(false);

    if (s.isGameOver) setPhase('GAME_OVER');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable;
      if (isTyping) return;
      if (!isDev) return;

      const k = e.key.toLowerCase();
      if (k === 'd') setDevPanelOpen((s) => !s);
      if (k === 's') {
        e.preventDefault();
        forceSarzee();
      }
      if (k === 'c') {
        e.preventDefault();
        triggerCelebration();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDev, forceSarzee, triggerCelebration]);

  useEffect(() => {
    if (!isDev) return;
    if (!devPanelOpen) return;
    if (!arenaRef.current) return;

    const tick = () => {
      if (!arenaRef.current) return;
      try {
        setArenaVisualValues(arenaRef.current.getVisualValues());
        setArenaEmittedValues(arenaRef.current.getLastEmittedValues());
        setArenaRollSeq(arenaRef.current.getRollSeq());
      } catch {
        // ignore
      }

      if (gameState) setEngineDiceValues(gameState.diceValues.map((v) => Number(v)));
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isDev, devPanelOpen, gameState]);

  useEffect(() => {
    if (!enginesRef.current.length) return;
    const engine = enginesRef.current[activePlayer];
    const s = engine.getGameState();
    setGameState(s);
    setPotentialScores(s.rollsLeft === 3 ? ({} as any) : computePotentialScores(engine, s));
    setIsRolling(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer]);

  const engineStates = useMemo(() => enginesRef.current.map((e) => e.getGameState()), [activePlayer, phase, gameState]);
  const scorecards = engineStates.map((s) => s.scorecard);
  const totals = engineStates.map((s) => s.totalScore);
  const yahtzeeBonuses = engineStates.map((s) => s.yahtzeeBonus);
  const names = customNames;

  const canInteractDice = !!gameState && !isRolling && gameState.rollsLeft < 3;
  const canSelectCategory = !!gameState && !isRolling && gameState.rollsLeft < 3 && gameState.rollsLeft >= 0;

  const [imgInfo, setImgInfo] = useState<ImgInfo | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = '/textures/board_texture.jpg';
    img.onload = () => setImgInfo({ w: img.naturalWidth || BASE_W, h: img.naturalHeight || BASE_H });
  }, []);

  const bgRef = useRef<HTMLDivElement | null>(null);
  const [feltRect, setFeltRect] = useState<Rect | null>(null);
  const [feltAspect, setFeltAspect] = useState(1.0);

  const computeFeltRect = useCallback(() => {
    const el = bgRef.current;
    if (!el || !imgInfo) return;

    const { width: cw, height: ch } = el.getBoundingClientRect();
    const { w: iw, h: ih } = imgInfo;

    const { scale, offsetX, offsetY } = computeCover(cw, ch, iw, ih);

    const insetX = (INSET_X_BASE / BASE_W) * iw;
    const insetY = (INSET_Y_BASE / BASE_H) * ih;

    const feltW = (iw - insetX * 2) * scale;
    const feltH = (ih - insetY * 2) * scale;

    const left = offsetX + insetX * scale;
    const top = offsetY + insetY * scale;

    setFeltRect({ left, top, width: feltW, height: feltH });
    setFeltAspect(feltW / feltH);
  }, [imgInfo]);

  useEffect(() => {
    computeFeltRect();
    window.addEventListener('resize', computeFeltRect);
    return () => window.removeEventListener('resize', computeFeltRect);
  }, [computeFeltRect]);

  const [fallbackRect, setFallbackRect] = useState<Rect | null>(null);
  useEffect(() => {
    const computeFallback = () => {
      const w = Math.floor(window.innerWidth * 0.62);
      const h = Math.floor(window.innerHeight * 0.62);
      const left = Math.floor(window.innerWidth * 0.12);
      const top = Math.floor(window.innerHeight * 0.16);
      setFallbackRect({ left, top, width: w, height: h });
    };

    computeFallback();
    window.addEventListener('resize', computeFallback);
    return () => window.removeEventListener('resize', computeFallback);
  }, []);

  if (phase === 'SETUP') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-black">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/textures/board_texture.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div className="bg-slate-900/80 backdrop-blur-xl px-14 py-10 rounded-2xl border border-white/10 shadow-2xl text-center">
            <h1 className="text-5xl font-black mb-6 text-white">SARZEE</h1>

            {setupStep === 'COUNT' && (
              <>
                <div className="text-white/80 text-xl mb-8">How many players?</div>
                <div className="flex gap-4 justify-center mb-8">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => selectPlayerCount(n)}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-lg shadow-lg text-2xl transition-transform active:scale-95"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {setupStep === 'NAMES' && (
              <>
                <div className="text-white/80 text-xl mb-6">Enter player names</div>
                <div className="flex flex-col gap-3 mb-8">
                  {customNames.map((name, idx) => (
                    <input
                      key={idx}
                      value={name}
                      onChange={(e) => {
                        const next = [...customNames];
                        next[idx] = e.target.value;
                        setCustomNames(next);
                      }}
                      className="bg-slate-800 border border-slate-600 rounded px-4 py-3 text-center text-white text-xl focus:border-blue-500 outline-none"
                      maxLength={10}
                    />
                  ))}
                </div>
                <button
                  onClick={commitStartGame}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg text-xl transition-transform active:scale-95"
                >
                  Start Game
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'GAME_OVER') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-black">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/textures/board_texture.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div className="bg-slate-900/80 backdrop-blur-xl px-14 py-10 rounded-2xl border border-white/10 shadow-2xl text-center">
            <h1 className="text-5xl font-black mb-6 text-white">Game Over</h1>
            <button
              onClick={resetAll}
              className="bg-emerald-600 hover:bg-emerald-500 px-8 py-3 rounded text-xl font-bold text-white"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const showDesktopScorecard = true;
  const railRightPx = 1;
  const rectToUse = feltRect ?? fallbackRect;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      <div
        ref={bgRef}
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/textures/board_texture.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {rectToUse && (
        <div
          className="absolute"
          style={{
            left: rectToUse.left,
            top: rectToUse.top,
            width: rectToUse.width,
            height: rectToUse.height,
            zIndex: 10,
          }}
        >
          <DiceArena
            ref={arenaRef}
            onTurnComplete={handleTurnComplete}
            heldDice={gameState.heldDice}
            onDieClick={handleDieClick}
            canInteract={canInteractDice}
            feltAspect={feltAspect}
            debugWalls={false}
            showDebugNumbers={isDev && showDieNumbers}
          />
        </div>
      )}

      <div className="absolute top-4 bottom-4 w-[680px] max-w-[60vw] flex flex-col gap-4 z-20" style={{ right: railRightPx }}>
        <div
          className="hidden lg:block flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            opacity: showDesktopScorecard ? 1 : 0,
            pointerEvents: showDesktopScorecard ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
          }}
        >
          <div className="origin-top-right scale-[0.94] pr-2">
            <MultiPlayerScorecard
              playerNames={names}
              scorecards={scorecards}
              yahtzeeBonuses={yahtzeeBonuses}
              totals={totals}
              activePlayerIndex={activePlayer}
              potentialScores={potentialScores}
              canSelectCategory={canSelectCategory}
              onSelectCategory={handleCategorySelect}
              mustPick={gameState.rollsLeft === 0}
            />
          </div>
        </div>

        <div className="hidden lg:flex justify-center">
          <button
            onClick={handleRoll}
            disabled={isRolling || gameState.rollsLeft <= 0 || gameState.isGameOver}
            className="active:scale-95 transition-transform disabled:opacity-50 disabled:grayscale"
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <img
              src="/assets/roll_button.png"
              alt="ROLL"
              draggable={false}
              className="h-auto select-none"
              style={{ width: 'min(670px, 62vw)' }}
            />
          </button>
        </div>
      </div>

      <div
        className="lg:hidden absolute bottom-6 right-6 z-50 cursor-pointer active:scale-95 transition-transform"
        onClick={() => setMobileScorecardOpen(true)}
      >
        <div className="w-16 h-20 bg-[#f4eeb1] shadow-[2px_4px_8px_rgba(0,0,0,0.5)] border border-[#d6cfa1] rounded-sm flex flex-col items-center justify-center rotate-3 hover:-rotate-1 transition-all">
          <div className="w-10 h-1 bg-black/10 mb-1 rounded-full" />
          <div className="w-10 h-1 bg-black/10 mb-1 rounded-full" />
          <div className="w-8 h-1 bg-black/10 mb-1 rounded-full" />
          <span className="text-[10px] font-bold text-stone-700 mt-1">SCORE</span>
        </div>
      </div>

      {mobileScorecardOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative">
            <button
              className="absolute -top-4 -right-4 bg-red-600 text-white w-10 h-10 rounded-full font-bold shadow-lg z-50 hover:bg-red-500"
              onClick={() => setMobileScorecardOpen(false)}
            >
              ✕
            </button>

            <div className="scale-75 origin-center">
              <MultiPlayerScorecard
                playerNames={names}
                scorecards={scorecards}
                yahtzeeBonuses={yahtzeeBonuses}
                totals={totals}
                activePlayerIndex={activePlayer}
                potentialScores={potentialScores}
                canSelectCategory={canSelectCategory}
                onSelectCategory={handleCategorySelect}
                mustPick={gameState.rollsLeft === 0}
              />
            </div>
          </div>
        </div>
      )}

      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <SarzeeCelebration onDismiss={() => setShowCelebration(false)} />
        </div>
      )}

      {isDev && (
        <>
          <button
            onClick={forceSarzee}
            className="fixed bottom-2 left-2 z-[999] bg-red-600/50 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded font-mono"
          >
            FORCE SARZEE (S)
          </button>

          <button
            onClick={() => setDevPanelOpen((s) => !s)}
            className="fixed bottom-2 left-[140px] z-[999] bg-slate-800/60 hover:bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-mono"
          >
            DEBUG (D)
          </button>
        </>
      )}

      {isDev && devPanelOpen && (
        <div className="fixed left-2 bottom-12 z-[999] w-[360px] max-w-[92vw] rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-3 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xs opacity-80">DEV DEBUG</div>
              <div className="font-mono text-[11px] opacity-70">D = toggle • S = force Sarzee • C = celebration</div>
            </div>
            <button className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15" onClick={() => setDevPanelOpen(false)}>
              ✕
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs font-mono">
            <input type="checkbox" checked={showDieNumbers} onChange={(e) => setShowDieNumbers(e.target.checked)} />
            Show numbers on dice
          </label>

          <div className="mt-3 font-mono text-xs">
            <div className="opacity-70">rollSeq: {arenaRollSeq}</div>
            <div className="mt-2 grid gap-2">
              <div>
                <div className="opacity-70">Arena visual (quaternion)</div>
                <div className="text-sm">[{arenaVisualValues.join(', ')}]</div>
              </div>
              <div>
                <div className="opacity-70">Arena emitted (animation done)</div>
                <div className="text-sm">[{arenaEmittedValues.join(', ')}]</div>
              </div>
              <div>
                <div className="opacity-70">Engine stored (state.diceValues)</div>
                <div className="text-sm">[{engineDiceValues.join(', ')}]</div>
              </div>
              <div>
                <div className="opacity-70">Engine Yahtzee bonus</div>
                <div className="text-sm">{gameState.yahtzeeBonus}</div>
              </div>
            </div>

            {arenaEmittedValues.length === 5 && engineDiceValues.length === 5 && (
              <div className="mt-3">
                {arenaEmittedValues.join(',') === engineDiceValues.join(',') ? (
                  <div className="text-emerald-300">Engine matches emitted</div>
                ) : (
                  <div className="text-red-300">Mismatch: engine != emitted</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

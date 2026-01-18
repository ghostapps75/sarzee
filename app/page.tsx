'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceArena, { DiceArenaHandle } from '@/components/DiceArena';
import MultiPlayerScorecard from '@/components/MultiPlayerScorecard';
import SarzeeCelebration from '@/components/SarzeeCelebration';
import NancyCelebration from '@/components/NancyCelebration';
import ScorecardModal from '@/components/ScorecardModal';
import { SarzeeEngine } from '@/lib/SarzeeEngine';
import { ScoreCategory, GameState, DieValue, GamePhase } from '@/lib/types';

function computePotentialScores(engine: SarzeeEngine, state: GameState) {
  const out: Record<ScoreCategory, number> = {} as any;
  (Object.values(ScoreCategory) as ScoreCategory[]).forEach((cat) => {
    if (state.scorecard[cat] === null) out[cat] = engine.calculatePotentialScore(cat);
  });
  return out;
}

// Check if dice form a Nancy: first roll, all different, not a straight
function isNancy(dice: number[], rollsLeft: number): boolean {
  // Must be first roll of turn (rollsLeft === 2 means we just did the first roll)
  if (rollsLeft !== 2) return false;
  
  // All 5 dice must be different (no duplicates)
  const unique = new Set(dice);
  if (unique.size !== 5) return false;
  
  // Must NOT be a small or large straight
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
  
  // Not a straight if max sequence is less than 4
  return maxSeq < 4;
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

// Percentage based Insets for Felt
const FELT_INSET_X_PCT = (INSET_X_BASE / BASE_W) * 100;
const FELT_INSET_Y_PCT = (INSET_Y_BASE / BASE_H) * 100;

// Felt Aspect Ratio Calculation: (1024 - 300) / (558 - 270)
const FELT_ASPECT = (BASE_W - 2 * INSET_X_BASE) / (BASE_H - 2 * INSET_Y_BASE);

const normalizeDie = (v: number) => Math.max(1, Math.min(6, Math.round(v)));

const SCORECARD_LAYOUT = { left: '74%', top: '1%', width: '22%', height: '98%' }; // Maximized height to 98% and reduced top to 1% to show full scorecard

// Dynamic imports for export tools to avoid SSR issues
const importExportTools = async () => {
  const htmlToImage = await import('html-to-image');
  const jsPDF = (await import('jspdf')).default;
  return { htmlToImage, jsPDF };
};

export default function Page() {
  const isDev = process.env.NODE_ENV === 'development';
  // Responsive State (Window-based)
  const [windowSize, setWindowSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    handleResize(); // Init
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobilePortrait = windowSize ? (windowSize.w < 768 && windowSize.h > windowSize.w) : false;
  
  // Detect iPad/tablet (width >= 768px, typically tablets/iPads)
  const isTablet = windowSize ? (windowSize.w >= 768 && windowSize.w < 1200) : false;
  
  // Check if device is in portrait orientation (should be locked to landscape for tablets)
  const isPortraitOrientation = windowSize ? (windowSize.h > windowSize.w) : false;
  const isTabletPortrait = isTablet && isPortraitOrientation;

  // Embedded score logic (Element Query based - still useful for Desktop sizing)
  const [canShowEmbedded, setCanShowEmbedded] = useState(true);
  const [boardDims, setBoardDims] = useState<{ w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<GamePhase>('SETUP');
  const [playerCount, setPlayerCount] = useState(1);
  const [activePlayer, setActivePlayer] = useState(0);

  const enginesRef = useRef<SarzeeEngine[]>([]);
  const arenaRef = useRef<DiceArenaHandle>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [potentialScores, setPotentialScores] = useState<Record<ScoreCategory, number>>({} as any);
  const [isRolling, setIsRolling] = useState(false);

  const [setupStep, setSetupStep] = useState<'BOARD' | 'COUNT' | 'NAMES'>('BOARD');
  const [selectedBoard, setSelectedBoard] = useState<string>('the-cafe');
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [playerDiceColors, setPlayerDiceColors] = useState<string[]>([]); // Array of colors, one per player

  // Board options mapping
  const boardOptions = [
    { id: 'the-cafe', name: 'Cafe', file: 'board_texture.jpg' },
    { id: 'the-emerald-forest', name: 'Emerald Forest', file: 'emeraldforest_board.jpg' },
    { id: 'the-forge', name: 'Forge', file: 'forge.jpg' },
    { id: 'franklins-tower', name: "Franklin's Tower", file: 'gd_board.JPG' },
    { id: 'the-map-room', name: 'Map Room', file: 'maproom_board.jpg' },
    { id: 'pirates-cove', name: 'Pirates Cove', file: 'pirate_board.jpg' },
    { id: 'space-mission', name: 'Space Missions', file: 'space_mission_board.jpg' },
  ];

  const [showCelebration, setShowCelebration] = useState(false);
  const [showNancyCelebration, setShowNancyCelebration] = useState(false);
  const [mobileScorecardOpen, setMobileScorecardOpen] = useState(false);
  const celebrationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nancyCelebrationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- dev-only debug panel state ---
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [showLayoutDebug, setShowLayoutDebug] = useState(false);
  const [showDieNumbers, setShowDieNumbers] = useState(false);
  const [arenaVisualValues, setArenaVisualValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [arenaEmittedValues, setArenaEmittedValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [engineDiceValues, setEngineDiceValues] = useState<number[]>([1, 1, 1, 1, 1]);
  const [arenaRollSeq, setArenaRollSeq] = useState<number>(0);

  const rollSound = useSafeAudio(['/sounds/roll.mp3', '/sounds/dice.mp3', '/sounds/roll.wav']);

  // Board-specific dice colors
  const boardDiceColors: Record<string, string[]> = {
    'the-cafe': ['#3B2820', '#F2E6D8', '#2A8CA1', '#7D9652'], // Dark Brown, Cream/Off-White, Teal Blue, Sage Green
    'franklins-tower': ['#C01E32', '#2056A2', '#E68A00', '#1E8F4B'], // Crimson Red, Royal Blue, Golden Amber, Emerald Green
    'the-emerald-forest': ['#E6AF2E', '#4ABFAC', '#C05746', '#2E4830'], // Runic Amber, Spirit Wisp, Forest Rust, Deep Canopy
    'the-forge': ['#FF8C00', '#1C1C1C', '#8A2323', '#4A5D6E'], // Bright Glowing Orange, Near Black/Charcoal, Deep Ember Red, Steel Blue-Grey
    'the-map-room': ['#649C8F', '#D9B056', '#8C2B2B', '#273C52'], // Verdigris Green, Antique Brass, Burgundy Red, Slate Navy
    'pirates-cove': ['#1A4F8B', '#D4AF37', '#A81B1B', '#E8DCC2'], // Ocean Blue, Doubloon Gold, Pirate Red, Aged Bone
    'space-mission': ['#211A45', '#4DEEEA', '#C77DF3', '#FCA311'], // Dark Indigo, Electric Cyan, Cosmic Purple, Amber/Orange
  };
  
  const selectPlayerCount = (count: number) => {
    setPlayerCount(count);
    setCustomNames(Array.from({ length: count }, (_, i) => `Player ${i + 1}`));
    
    // Assign themed dice colors based on selected board
    const themeColors = boardDiceColors[selectedBoard] || boardDiceColors['the-cafe'];
    // For all themed boards, cycle through their color palette
    const colors = Array.from({ length: count }, (_, i) => themeColors[i % themeColors.length]);
    setPlayerDiceColors(colors);
    setSetupStep('NAMES');
  };

  const selectPlayerDiceColor = (playerIndex: number, color: string) => {
    const newColors = [...playerDiceColors];
    newColors[playerIndex] = color;
    setPlayerDiceColors(newColors);
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
    setSetupStep('BOARD');
    setCustomNames([]);
    setPlayerDiceColors([]);
    setIsRolling(false);
    setShowCelebration(false);
    setMobileScorecardOpen(false);
  };

  const boardOption = boardOptions.find(b => b.id === selectedBoard) || boardOptions[0];
  const boardTexture = `/textures/${boardOption.file}`;

  const selectBoard = (boardId: string) => {
    setSelectedBoard(boardId);
    setSetupStep('COUNT');
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
    // Add 1-second delay before showing celebration
    const vals = results.map((v) => normalizeDie(v));
    if (vals.length === 5 && vals.every((v) => v === vals[0])) {
      // Clear any existing timeout to prevent multiple celebrations
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
      setShowCelebration(false);
      // Wait 1 second before showing celebration
      celebrationTimeoutRef.current = setTimeout(() => {
        setShowCelebration(true);
        celebrationTimeoutRef.current = null;
      }, 1000);
    }

    // Nancy celebration: first roll, all different, not a straight
    if (gameState && isNancy(vals, gameState.rollsLeft)) {
      // Clear any existing timeout to prevent multiple celebrations
      if (nancyCelebrationTimeoutRef.current) {
        clearTimeout(nancyCelebrationTimeoutRef.current);
      }
      setShowNancyCelebration(false);
      // Wait 1 second before showing celebration
      nancyCelebrationTimeoutRef.current = setTimeout(() => {
        setShowNancyCelebration(true);
        nancyCelebrationTimeoutRef.current = null;
      }, 1000);
    }

    // Auto-open scorecard on small devices aka "popup mode" when turn settles
    if (!canShowEmbedded) {
      setMobileScorecardOpen(true);
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

  const forceNancy = useCallback(() => {
    if (!gameState || isRolling) {
      console.log('forceNancy blocked:', { gameState: !!gameState, isRolling });
      return;
    }
    if (!arenaRef.current) {
      console.log('forceNancy: no arenaRef');
      return;
    }
    if (gameState.rollsLeft <= 0) {
      console.log('forceNancy: no rolls left');
      return;
    }
    if (gameState.isGameOver) {
      console.log('forceNancy: game over');
      return;
    }

    console.log('forceNancy: executing');
    const engine = enginesRef.current[activePlayer];
    // Roll 5 different dice that don't form a straight (e.g., 1, 2, 4, 5, 6)
    const decided = [1, 2, 4, 5, 6];

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

    if (s.isGameOver) {
      setPhase('GAME_OVER');
      // Don't auto-open modal on desktop - let user click scorecard button if they want it
      // On mobile, the scorecard is already accessible via the button
    }
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
      if (k === 'n') {
        e.preventDefault();
        forceNancy();
      }
      if (k === 'c') {
        e.preventDefault();
        triggerCelebration();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDev, forceNancy, triggerCelebration]);

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
    img.src = boardTexture;
    img.onload = () => setImgInfo({ w: img.naturalWidth || BASE_W, h: img.naturalHeight || BASE_H });
  }, [boardTexture]);

  const bgRef = useRef<HTMLDivElement | null>(null);
  const scorecardRef = useRef<HTMLDivElement>(null); // For export capture

  const [feltRect, setFeltRect] = useState<Rect | null>(null);
  const [feltAspect, setFeltAspect] = useState(1.0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('debugLayout') === '1') setShowLayoutDebug(true);
    }
  }, []);

  const handleDownload = async () => {
    if (!scorecardRef.current) return;
    try {
      const { htmlToImage, jsPDF } = await importExportTools();
      // Filter out elements with helper-exclude-pdf class
      const filter = (node: HTMLElement) => {
        return !node.className || !node.className.includes?.('helper-exclude-pdf');
      };

      const dataUrl = await htmlToImage.toPng(scorecardRef.current, {
        quality: 0.95,
        backgroundColor: '#f4f4f5',
        filter: filter as any
      });

      const d = new Date();
      const YYYY = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, '0');
      const DD = String(d.getDate()).padStart(2, '0');
      const HH = String(d.getHours()).padStart(2, '0');
      const MIN = String(d.getMinutes()).padStart(2, '0');
      const filename = `sarzee-scorecard-${YYYY}${MM}${DD}-${HH}${MIN}`;

      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error('Export failed', e);
      alert('Failed to generate scorecard PDF.');
    }
  };

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

  // Element Query Observer for BoardStage
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setBoardDims({ w: width, h: height });
        // Logic: Can we fit the embedded scorecard?
        // For tablets/iPads, use lower threshold (768px) to always show embedded scorecard
        // For desktop, use 900x520 threshold
        const threshold = isTablet ? 768 : 900;
        const fits = width >= threshold && height >= 520;
        // Force embedded mode for tablets/iPads (always show scorecard on screen)
        setCanShowEmbedded(fits || isTablet);
      }
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [phase, isTablet]); // Re-bind if phase changes mount status

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
            backgroundImage: `url(${boardTexture})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div className="bg-[#1a1612]/95 backdrop-blur-md px-16 py-12 rounded-2xl border-2 border-amber-900/40 shadow-2xl text-center max-w-3xl mx-4" style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)' }}>
            <h1 className="text-6xl font-black mb-8 bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-400 bg-clip-text text-transparent drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)' }}>
              SARZEE
            </h1>

            {setupStep === 'BOARD' && (
              <>
                <div className="text-amber-100 text-xl mb-10 font-medium tracking-wide">Choose your board</div>
                <div className="flex justify-center mb-8">
                  <select
                    value={selectedBoard}
                    onChange={(e) => selectBoard(e.target.value)}
                    className="px-8 py-4 bg-gradient-to-b from-amber-700 to-amber-900 text-amber-100 font-bold rounded-xl shadow-xl text-xl border-2 border-amber-500/30 hover:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer min-w-[280px]"
                    style={{ boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}
                  >
                    {boardOptions.map((board) => (
                      <option key={board.id} value={board.id} className="bg-amber-900 text-amber-100">
                        {board.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => setSetupStep('COUNT')}
                    className="px-8 py-4 bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-amber-100 font-bold rounded-xl shadow-xl text-lg transition-all transform hover:scale-105 active:scale-95 border-2 border-amber-500/30 hover:border-amber-400/50"
                    style={{ boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {setupStep === 'COUNT' && (
              <>
                <div className="text-amber-100 text-xl mb-10 font-medium tracking-wide">How many players?</div>
                <div className="flex gap-6 justify-center mb-8">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => selectPlayerCount(n)}
                      className="w-20 h-20 bg-gradient-to-b from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 text-amber-100 font-bold rounded-xl shadow-xl text-3xl transition-all transform hover:scale-110 active:scale-95 border-2 border-amber-500/30 hover:border-amber-400/50"
                      style={{ boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {setupStep === 'NAMES' && (
              <>
                <div className="text-amber-100 text-xl mb-6 font-medium tracking-wide">Enter player names & choose dice colors</div>
                <div className="flex flex-col gap-5 mb-8 max-w-2xl mx-auto">
                  {customNames.map((name, idx) => {
                    const playerColor = playerDiceColors[idx] || '#FFFFFF';
                    // Get dice color options based on selected board
                    const getDiceColorOptions = (boardId: string) => {
                      switch (boardId) {
                        case 'franklins-tower':
                          return [
                            { hex: '#C01E32', title: 'Crimson Red' },
                            { hex: '#2056A2', title: 'Royal Blue' },
                            { hex: '#E68A00', title: 'Golden Amber' },
                            { hex: '#1E8F4B', title: 'Emerald Green' },
                          ];
                        case 'the-emerald-forest':
                          return [
                            { hex: '#E6AF2E', title: 'Runic Amber' },
                            { hex: '#4ABFAC', title: 'Spirit Wisp' },
                            { hex: '#C05746', title: 'Forest Rust' },
                            { hex: '#2E4830', title: 'Deep Canopy' },
                          ];
                        case 'the-forge':
                          return [
                            { hex: '#FF8C00', title: 'Bright Glowing Orange' },
                            { hex: '#1C1C1C', title: 'Near Black/Charcoal' },
                            { hex: '#8A2323', title: 'Deep Ember Red' },
                            { hex: '#4A5D6E', title: 'Steel Blue-Grey' },
                          ];
                        case 'the-map-room':
                          return [
                            { hex: '#649C8F', title: 'Verdigris Green' },
                            { hex: '#D9B056', title: 'Antique Brass' },
                            { hex: '#8C2B2B', title: 'Burgundy Red' },
                            { hex: '#273C52', title: 'Slate Navy' },
                          ];
                        case 'pirates-cove':
                          return [
                            { hex: '#1A4F8B', title: 'Ocean Blue' },
                            { hex: '#D4AF37', title: 'Doubloon Gold' },
                            { hex: '#A81B1B', title: 'Pirate Red' },
                            { hex: '#E8DCC2', title: 'Aged Bone' },
                          ];
                        case 'space-mission':
                          return [
                            { hex: '#211A45', title: 'Dark Indigo' },
                            { hex: '#4DEEEA', title: 'Electric Cyan' },
                            { hex: '#C77DF3', title: 'Cosmic Purple' },
                            { hex: '#FCA311', title: 'Amber/Orange' },
                          ];
                        case 'the-cafe':
                          return [
                            { hex: '#3B2820', title: 'Dark Brown' },
                            { hex: '#F2E6D8', title: 'Cream/Off-White' },
                            { hex: '#2A8CA1', title: 'Teal Blue' },
                            { hex: '#7D9652', title: 'Sage Green' },
                          ];
                        default:
                          return [
                            { hex: '#3B2820', title: 'Dark Brown' },
                            { hex: '#F2E6D8', title: 'Cream/Off-White' },
                            { hex: '#2A8CA1', title: 'Teal Blue' },
                            { hex: '#7D9652', title: 'Sage Green' },
                          ];
                      }
                    };
                    const diceColorOptions = getDiceColorOptions(selectedBoard);
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <input
                          value={name}
                          onChange={(e) => {
                            const next = [...customNames];
                            next[idx] = e.target.value;
                            setCustomNames(next);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="flex-1 bg-amber-950/80 border-2 border-amber-800/50 rounded-lg px-4 py-3 text-center text-amber-100 text-lg focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-amber-700/50"
                          placeholder={`Player ${idx + 1}`}
                          maxLength={10}
                        />
                        <div className="flex gap-2">
                          {diceColorOptions.map((colorOption) => (
                            <button
                              key={colorOption.hex}
                              onClick={() => selectPlayerDiceColor(idx, colorOption.hex)}
                              className={`w-10 h-10 rounded-lg border-2 transition-all transform hover:scale-110 active:scale-95 ${
                                playerColor === colorOption.hex ? 'border-amber-400 shadow-lg scale-110' : 'border-amber-700/50'
                              }`}
                              style={{ backgroundColor: colorOption.hex, boxShadow: playerColor === colorOption.hex ? '0 4px 8px rgba(0, 0, 0, 0.4)' : '0 2px 4px rgba(0, 0, 0, 0.3)' }}
                              title={colorOption.title}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-4 mb-6">
                  <button
                    onClick={() => setSetupStep('COUNT')}
                    className="text-amber-400/80 hover:text-amber-300 text-sm underline transition-colors"
                  >
                    ← Back
                  </button>
                </div>
                <button
                  onClick={commitStartGame}
                  className="bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 text-amber-100 font-bold py-4 px-12 rounded-xl shadow-xl text-xl transition-all transform hover:scale-105 active:scale-95 border-2 border-amber-500/30 hover:border-amber-400/50"
                  style={{ boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' }}
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
    // We want the game board + scorecard to remain visible BEHIND the modal.
    // So we DON'T return early here. We let the main render happen, then overlay the modal.
    // Handled by overlay below
  }

  // Show orientation warning for tablets in portrait mode (before game state check)
  if (isTabletPortrait) {
    return (
      <div className="fixed inset-0 w-full h-full bg-black flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="text-center text-white p-8 max-w-md mx-4">
          <div className="text-6xl mb-6">📱</div>
          <h2 className="text-3xl font-bold mb-4">Please Rotate Your Device</h2>
          <p className="text-xl text-gray-300">This game is designed for landscape orientation. Please rotate your device to continue playing.</p>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  if (isMobilePortrait && windowSize) {
    const canRoll = !isRolling && gameState.rollsLeft > 0 && !gameState.isGameOver;
    const isCategorySelectionPhase = !isRolling && gameState.rollsLeft < 3 && gameState.rollsLeft >= 0;

    return (
      <div className="fixed inset-0 bg-stone-950 flex flex-col text-white overflow-hidden">
        {/* MOBILE UPPER: DICE ARENA (60%) */}
        <div className="relative w-full h-[60%] bg-emerald-900 shadow-inner">
          {/* Texture or Gradient */}
          <div className="absolute inset-0 bg-[url('/textures/felt_pattern.png')] opacity-50 mix-blend-multiply pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent h-16 pointer-events-none" />

          {/* Full width/height arena */}
          <div className="absolute inset-0">
            <DiceArena
              ref={arenaRef}
              onTurnComplete={handleTurnComplete}
              heldDice={gameState.heldDice}
              onDieClick={handleDieClick}
              canInteract={canInteractDice}
              diceColor={playerDiceColors[activePlayer] || '#FFFFFF'}
              // Aspect of this container (w / (h*0.6))
              feltAspect={windowSize.w / (windowSize.h * 0.6)}
              showDebugNumbers={isDev && showDieNumbers}
              isMobile={true}
            />
          </div>

          {/* Mobile HUD Overlay (Turn/Score) */}
          <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-20">
            <div className="bg-black/50 px-3 py-1 rounded-full text-xs font-bold text-emerald-400 border border-emerald-500/30">
              Turn {gameState.currentTurn}/13
            </div>
            <div className="bg-black/50 px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10">
              Total: {totals[activePlayer]}
            </div>
          </div>
        </div>

        {/* MOBILE LOWER: CONTROLS (40%) */}
        <div className="flex-1 bg-stone-900 border-t border-white/10 flex flex-col items-center justify-center gap-6 p-6 relative">
          {/* Player Info */}
          <div className="text-center">
            <div className="text-stone-400 text-sm uppercase tracking-widest mb-1">Current Player</div>
            <div className="text-2xl font-black text-white">{names[activePlayer]}</div>
          </div>

          {/* BIG Buttons */}
          <div className="w-full max-w-sm flex flex-col gap-4">
            {/* Main Roll Action */}
            <button
              onClick={handleRoll}
              disabled={!canRoll}
              className={`
                    w-full py-5 rounded-2xl text-2xl font-black uppercase tracking-wider shadow-lg transform transition-all active:scale-95
                    ${canRoll
                  ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-amber-900/50'
                  : 'bg-stone-800 text-stone-600 cursor-not-allowed'}
                  `}
            >
              {gameState.rollsLeft > 0 ? `ROLL (${gameState.rollsLeft})` : 'PICK SCORE'}
            </button>

            {/* Scorecard Toggle */}
            <button
              onClick={() => setMobileScorecardOpen(true)}
              className="w-full py-4 rounded-xl bg-stone-800 text-stone-300 font-bold uppercase tracking-wider text-sm border border-white/5 hover:bg-stone-700 active:scale-95"
            >
              View Scorecard
            </button>

            {/* Dev: Force Nancy button (only in dev mode) */}
            {isDev && (
              <button
                onClick={forceNancy}
                className="w-full py-3 rounded-xl bg-red-600/80 text-white font-bold uppercase tracking-wider text-xs border border-red-500/50 active:scale-95"
              >
                FORCE NANCY (TEST)
              </button>
            )}
          </div>
        </div>

        {/* Re-use existing overlays (Portals) */}
        {/* Mobile Scorecard Portal is already handled below, just triggered by state */}
        <ScorecardModal
          isOpen={mobileScorecardOpen}
          onClose={() => setMobileScorecardOpen(false)}
        >
          <div className="flex flex-col gap-4 p-4 text-white h-full relative">
            <button
              onClick={() => setMobileScorecardOpen(false)}
              className="absolute top-2 right-2 p-2 text-white/50 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-center font-black text-xl mb-4">SCORECARD</h2>
            <MultiPlayerScorecard
              playerNames={names}
              scorecards={scorecards}
              yahtzeeBonuses={yahtzeeBonuses}
              totals={totals}
              activePlayerIndex={activePlayer}
              potentialScores={potentialScores}
              canSelectCategory={isCategorySelectionPhase}
              onSelectCategory={(cat) => {
                handleCategorySelect(cat);
                setMobileScorecardOpen(false);
              }}
              className="flex-1"
              mustPick={gameState.rollsLeft === 0}
            />
          </div>
        </ScorecardModal>

        {/* Celebration for mobile */}
        {showCelebration && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <SarzeeCelebration onDismiss={() => setShowCelebration(false)} />
            </div>
          </div>
        )}
        {showNancyCelebration && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <NancyCelebration onDismiss={() => setShowNancyCelebration(false)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Show orientation warning for tablets in portrait mode
  if (isTabletPortrait) {
    return (
      <div className="fixed inset-0 w-full h-full bg-black flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="text-center text-white p-8 max-w-md mx-4">
          <div className="text-6xl mb-6">📱</div>
          <h2 className="text-3xl font-bold mb-4">Please Rotate Your Device</h2>
          <p className="text-xl text-gray-300">This game is designed for landscape orientation. Please rotate your device to continue playing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-black" style={{ height: '100vh' }}>
      {/* BOARD STAGE - fills entire screen */}
      <div
        ref={stageRef}
        className="absolute inset-0 w-full h-full shadow-2xl bg-[#0a0a0a]"
        style={{
          backgroundImage: `url(${boardTexture})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          minHeight: '100vh',
        }}
      >

        {/* 2. DICE ARENA (Felt Area) */}
        <div
          className="absolute z-10 overflow-hidden rounded-sm"
          style={{
            // Constrain left side to avoid tray edge/texture (custom tweak)
            left: '23%',
            // Constrain right side to avoid overlapping the scorecard (at 74%)
            right: '27%',
            // Tighten vertical bounds to strictly stay on felt (avoid wood)
            top: '27%',
            bottom: '27%',
          }}
        >
          <DiceArena
            ref={arenaRef}
            onTurnComplete={handleTurnComplete}
            heldDice={gameState.heldDice}
            onDieClick={handleDieClick}
            canInteract={canInteractDice}
            diceColor={playerDiceColors[activePlayer] || '#FFFFFF'}
            feltAspect={FELT_ASPECT}
            showDebugNumbers={isDev && showDieNumbers}
            isMobile={isMobilePortrait}
          />
        </div>

        {/* 3. CONTROLS (Bottom Center) */}
        {/* Positioned relative to the stage to scale with it */}
        {/* 3. CONTROLS (Centered at bottom of board) */}
        <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 z-30 w-[30.25%] flex justify-center pointer-events-none">
          <button
            onClick={handleRoll}
            disabled={isRolling || gameState.rollsLeft <= 0 || gameState.isGameOver}
            className="pointer-events-auto active:scale-95 transition-transform disabled:opacity-50 disabled:grayscale origin-bottom"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              width: '100%'
            }}
          >
            <img
              src="/assets/roll_button.png"
              alt="ROLL"
              draggable={false}
              className="w-full h-auto select-none drop-shadow-xl"
            />
          </button>
        </div>

        {/* 4. SCORECARD (Right Rail) */}
        {/* Only visible if element query says we have enough space - show on tablets (md) and up */}
        {canShowEmbedded && (
          <div
            className="hidden md:block absolute z-[60] pointer-events-none flex flex-col justify-center"
            style={SCORECARD_LAYOUT}
          >
            <div className="pointer-events-auto w-full h-full">
              <div ref={scorecardRef} className="w-full h-full flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '100%' }}>
                {phase === 'GAME_OVER' && (
                  <div className="bg-slate-900/90 text-white p-4 rounded-xl border border-white/20 shadow-xl backdrop-blur-md mb-2 shrink-0">
                    <div className="flex items-center justify-between gap-2 helper-exclude-pdf">
                      <button onClick={() => handleDownload()} className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-1 px-3 rounded text-sm transition-colors">Download PDF</button>
                    </div>
                  </div>
                )}

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
                  className="flex-1 min-h-0"
                />
              </div>
            </div>
          </div>
        )}



        {/* DEBUG LAYOUT OVERLAY */}
        {isDev && showLayoutDebug && (
          <>
            <div
              className="absolute z-[999] pointer-events-none border-2 border-red-500 bg-red-500/20"
              style={SCORECARD_LAYOUT}
            />
            {/* DEBUG INFO PANEL (Fixed to top-left of stage for context) */}
            <div className="absolute top-0 left-0 z-[1000] bg-black/80 text-white font-mono text-xs p-2 pointer-events-none border border-white/20 rounded">
              <div className="font-bold text-emerald-400 mb-1">LAYOUT DEBUG</div>
              <div>Board: {boardDims?.w.toFixed(0)} x {boardDims?.h.toFixed(0)}</div>
              <div>Limit: 900 x 520</div>
              <div className={`mt-1 font-bold ${canShowEmbedded ? 'text-blue-400' : 'text-orange-400'}`}>
                {canShowEmbedded ? 'MODE: EMBEDDED' : 'MODE: POPUP'}
              </div>
            </div>
          </>
        )}

        {/* 5. MOBILE DRAWER TRIGGER (Bottom Right) */}
        {/* Show if embedded is hidden */}
        {!canShowEmbedded && (
          <div
            className="absolute bottom-[5%] right-[5%] z-50 cursor-pointer active:scale-95 transition-transform"
            onClick={() => setMobileScorecardOpen(true)}
          >
            <div className="w-[10cqw] h-[12cqw] max-w-[60px] max-h-[75px] bg-[#f4eeb1] shadow-lg border border-[#d6cfa1] rounded-sm flex flex-col items-center justify-center rotate-3 hover:-rotate-1 transition-all">
              <div className="w-[70%] h-[10%] bg-black/10 mb-[10%] rounded-full" />
              <div className="w-[70%] h-[10%] bg-black/10 mb-[10%] rounded-full" />
              <span className="text-[1.5cqw] font-bold text-stone-700">SCORE</span>
            </div>
          </div>
        )}
        {
          showCelebration && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">
                <SarzeeCelebration onDismiss={() => setShowCelebration(false)} />
              </div>
            </div>
          )
        }
        {
          showNancyCelebration && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">
                <NancyCelebration onDismiss={() => setShowNancyCelebration(false)} />
              </div>
            </div>
          )
        }

        {/* GAME OVER OVERLAY - Floating messages with board visible */}
        {phase === 'GAME_OVER' && (() => {
          // Calculate player rankings
          const playersWithScores = totals.map((score, idx) => ({
            index: idx,
            name: names[idx] || `Player ${idx + 1}`,
            score
          }));
          playersWithScores.sort((a, b) => b.score - a.score);
          const winnerIndex = playersWithScores[0].index;
          const userRank = playersWithScores.findIndex(p => p.index === activePlayer) + 1;
          const userPlayer = playersWithScores.find(p => p.index === activePlayer);

          return (
            <>
              {/* Floating Game Over Message */}
              <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto animate-in fade-in-50 duration-700">
                  <div className="bg-slate-900/95 backdrop-blur-xl p-8 rounded-2xl border-2 border-yellow-500/40 shadow-2xl text-center max-w-lg mx-4">
                    {/* Trophy for winner */}
                    {userRank === 1 && (
                      <div className="text-6xl mb-4 animate-bounce">🏆</div>
                    )}
                    
                    <h2 className="text-4xl font-black mb-4 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      {userRank === 1 ? 'YOU WON!' : 
                       userRank === 2 ? 'YOU CAME 2ND' : 
                       userRank === 3 ? 'YOU CAME 3RD' : 
                       `YOU CAME ${userRank}TH`}
                    </h2>
                    
                    {/* Leaderboard / Final Scores */}
                    <div className="mt-6 space-y-3">
                      <div className="text-white/70 text-sm uppercase tracking-widest mb-3">Final Scores</div>
                      {playersWithScores.map((player, rank) => (
                        <div
                          key={player.index}
                          className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                            rank === 0
                              ? 'bg-yellow-500/20 border-2 border-yellow-500/50 shadow-lg'
                              : player.index === activePlayer
                              ? 'bg-blue-500/10 border border-blue-500/30'
                              : 'bg-slate-800/50 border border-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-white/80">
                              {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
                            </span>
                            <span className={`font-bold ${
                              rank === 0 ? 'text-yellow-400' : player.index === activePlayer ? 'text-blue-400' : 'text-white/80'
                            }`}>
                              {player.name}
                            </span>
                          </div>
                          <span className={`text-xl font-black ${
                            rank === 0 ? 'text-yellow-400' : 'text-white'
                          }`}>
                            {player.score} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* New Game Button - Styled side button */}
              <div className="absolute bottom-[8%] left-[8%] z-[70] pointer-events-none">
                <button
                  onClick={resetAll}
                  className="pointer-events-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-lg rounded-xl shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 active:scale-95 border-2 border-blue-400/30"
                >
                  New Game
                </button>
              </div>
            </>
          );
        })()}

        {
          isDev && (
            <>
              <button
                onClick={forceNancy}
                className="absolute bottom-[2%] left-[2%] z-[999] bg-red-600/50 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded font-mono"
              >
                FORCE NANCY (N)
              </button>

              <button
                onClick={() => setDevPanelOpen((s) => !s)}
                className="absolute bottom-[2%] left-[12%] z-[999] bg-slate-800/60 hover:bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-mono"
              >
                DEBUG (D)
              </button>
            </>
          )
        }

        {
          isDev && devPanelOpen && (
            <div className="absolute left-[2%] bottom-[8%] z-[999] w-[360px] max-w-[50%] rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-3 text-white shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs opacity-80">DEV DEBUG</div>
                  <div className="font-mono text-[11px] opacity-70">D = toggle • N = force Nancy • C = celebration</div>
                </div>
                <button className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15" onClick={() => setDevPanelOpen(false)}>
                  ✕
                </button>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs font-mono">
                <input type="checkbox" checked={showDieNumbers} onChange={(e) => setShowDieNumbers(e.target.checked)} />
                Show numbers on dice
              </label>

              <label className="mt-2 flex items-center gap-2 text-xs font-mono">
                <input type="checkbox" checked={showLayoutDebug} onChange={(e) => setShowLayoutDebug(e.target.checked)} />
                Show Layout Debug
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

                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <button
                    onClick={() => {
                      // Simple: Just set game to over state to test end-of-game UI
                      setPhase('GAME_OVER');
                      setDevPanelOpen(false); // Close panel to see result
                    }}
                    className="w-full bg-amber-600/80 hover:bg-amber-600 py-2 rounded text-xs font-bold uppercase tracking-wider"
                  >
                    Jump to Game Over
                  </button>
                  
                  <button
                    onClick={triggerCelebration}
                    className="w-full bg-yellow-600/80 hover:bg-yellow-600 py-2 rounded text-xs font-bold uppercase tracking-wider"
                  >
                    Test Sarzee Sound (C)
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowNancyCelebration(false);
                      requestAnimationFrame(() => setShowNancyCelebration(true));
                    }}
                    className="w-full bg-green-600/80 hover:bg-green-600 py-2 rounded text-xs font-bold uppercase tracking-wider"
                  >
                    Test Nancy Sound
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </div>

      {/* MOBILE OVERLAYS (Outside Stage? Or Inside? Inside is safer for pure container app, but Fixed works for modal) */}
      {/* MOBILE OVERLAYS (Portal) - Only show modal if not embedded (mobile) */}
      {!canShowEmbedded && (
        <ScorecardModal
          isOpen={mobileScorecardOpen}
          onClose={() => setMobileScorecardOpen(false)}
        >
          <div className="flex flex-col gap-4 p-4 text-white">
            {/* Mobile Game Over - Simplified header */}
            {phase === 'GAME_OVER' && (
              <div className="bg-slate-900/90 text-white p-4 rounded-xl border border-white/20 shadow-xl shrink-0">
                <div className="flex items-center justify-between gap-2 helper-exclude-pdf">
                  <button onClick={resetAll} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all">New Game</button>
                  <button onClick={() => handleDownload()} className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors">Download PDF</button>
                </div>
              </div>
            )}
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
              className="flex-1 w-full"
            />
          </div>
        </ScorecardModal>
      )}
    </div>
  );
}

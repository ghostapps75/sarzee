'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DiceArenaHandle } from '@/components/DiceArena';
import BoardStage from '@/components/BoardStage';
import GameHud from '@/components/GameHud';
import GameOverOverlay from '@/components/GameOverOverlay';
import ScoreTable from '@/components/ScoreTable';
import SarzeeCelebration from '@/components/SarzeeCelebration';
import NancyCelebration from '@/components/NancyCelebration';
import SetupPanel from '@/components/SetupPanel';
import RulesDrawer from '@/components/RulesDrawer';
import StatsDashboard from '@/components/StatsDashboard';
import { useSarzeeGame } from '@/lib/useSarzeeGame';
import { useCpuTurn } from '@/lib/useCpuTurn';
import { useViewport } from '@/lib/useBoardLayout';
import { useGameSounds } from '@/lib/useGameSounds';

/** Loaded on demand — jsPDF and html-to-image are large and only needed at game over. */
const importExportTools = async () => {
    const htmlToImage = await import('html-to-image');
    const jsPDF = (await import('jspdf')).default;
    return { htmlToImage, jsPDF };
};

function timestampedName(prefix: string) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * The PDF is rendered from its own copy of the score pad, laid out at A4 proportions with
 * every player's column showing. Capturing the live card used to export whatever happened
 * to be on screen — one tab on a phone or a narrow rail — and a scrolled-off bottom half.
 */
const EXPORT_W = 640;
const EXPORT_H = 905;

export default function Page() {
    const isDev = process.env.NODE_ENV === 'development';

    const arenaRef = useRef<DiceArenaHandle>(null);
    const game = useSarzeeGame(arenaRef);
    const cpu = useCpuTurn(game);
    const viewport = useViewport();
    const playSound = useGameSounds();

    const [showRules, setShowRules] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showDieNumbers, setShowDieNumbers] = useState(false);
    // `?debugLayout=1` draws the projected felt and roll-plate rects over the board.
    const [debugRects, setDebugRects] = useState(
        () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugLayout') === '1'
    );

    const exportRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);

    const {
        phase,
        board,
        selectedBoard,
        activePlayer,
        gameState,
        scorecards,
        totals,
        upperBonuses,
        yahtzeeBonuses,
        potentialScores,
        canInteractDice,
        canSelectCategory,
        customNames,
        playerTypes,
        playerDiceColors,
        isRolling,
        showCelebration,
        setShowCelebration,
        showNancyCelebration,
        setShowNancyCelebration,
        highlightedCategory,
        undoOffer,
        undoLastScore,
        riggedRoll,
        armRiggedRoll,
    } = game;

    // Hidden test keystroke, in every build: type "sarzee" or "nancy" during a game and the
    // next roll (or, for a Nancy, the next opening roll) is dealt that result, so the
    // celebrations can be checked without playing for them. Letters typed into a field
    // don't count, and the word has to be typed within a couple of seconds.
    useEffect(() => {
        let typed = '';
        let lastKey = 0;
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
            const now = Date.now();
            typed = ((now - lastKey > 2000 ? '' : typed) + e.key.toLowerCase()).slice(-6);
            lastKey = now;
            const word = typed.endsWith('sarzee') ? 'sarzee' : typed.endsWith('nancy') ? 'nancy' : null;
            if (!word) return;
            typed = '';
            armRiggedRoll(word);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [armRiggedRoll]);

    // Dev-only keyboard shortcuts, on Shift so the typed words above don't trip them.
    useEffect(() => {
        if (!isDev) return;

        const onKey = (e: KeyboardEvent) => {
            if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
            const k = e.key.toLowerCase();
            if (k === 'l') setDebugRects((s) => !s);
            if (k === 'v') setShowDieNumbers((s) => !s);
            // Fire a celebration on demand, whatever the dice show.
            if (k === 'c') {
                setShowCelebration(false);
                requestAnimationFrame(() => setShowCelebration(true));
            }
            if (k === 'n') {
                setShowNancyCelebration(false);
                requestAnimationFrame(() => setShowNancyCelebration(true));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isDev, setShowCelebration, setShowNancyCelebration]);

    const handleDownload = useCallback(async () => {
        setExporting(true);
        try {
            const { htmlToImage, jsPDF } = await importExportTools();

            // Give the export copy a couple of frames to mount, measure itself and lay out
            // its rows before it is photographed.
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80)))
            );
            const node = exportRef.current;
            if (!node) throw new Error('scorecard export copy did not mount');

            // JPEG rather than PNG: jsPDF stores a PNG's pixels uncompressed, which made a
            // one-page scorecard a 20 MB file. The pad is cream paper and printed type, so a
            // high-quality JPEG is indistinguishable and about a hundredth of the size.
            const dataUrl = await htmlToImage.toJpeg(node, {
                width: EXPORT_W,
                height: EXPORT_H,
                quality: 0.92,
                // Print resolution: the copy is 640 CSS px wide but fills an A4 page.
                pixelRatio: 3,
            });

            const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
            const props = pdf.getImageProperties(dataUrl);
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            // The card is taller than A4 in proportion, so fit it to the page rather than
            // to the page width — otherwise the totals run off the bottom.
            const margin = 28;
            const scale = Math.min((pageW - margin * 2) / props.width, (pageH - margin * 2) / props.height);
            const w = props.width * scale;
            const h = props.height * scale;
            pdf.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
            pdf.save(`${timestampedName('sarzee-scorecard')}.pdf`);
        } catch (e) {
            console.error('Export failed', e);
            alert('Failed to generate scorecard PDF.');
        } finally {
            setExporting(false);
        }
    }, []);

    if (phase === 'SETUP') {
        return (
            <SetupPanel
                selectedBoard={selectedBoard}
                setSelectedBoard={game.setSelectedBoard}
                setPlayerCount={game.setPlayerCount}
                customNames={customNames}
                setCustomNames={game.setCustomNames}
                playerDiceColors={playerDiceColors}
                setPlayerDiceColors={game.setPlayerDiceColors}
                playerTypes={playerTypes}
                setPlayerTypes={game.setPlayerTypes}
                onStartGame={game.startGame}
            />
        );
    }

    if (!gameState || !viewport.ready) return <div className="fixed inset-0 bg-black" />;

    const celebrating = showCelebration || showNancyCelebration;
    const stacked = viewport.mode === 'stack';
    /** Width of the scorecard rail covering the right of the board, or 0 when stacked. */
    const railInset = stacked ? 0 : viewport.railWidth;
    const compact = stacked || viewport.height < 560;

    // In stacked mode the board takes the top of the screen and the scorecard the rest.
    // Sized from the board's own aspect ratio so the whole board is always visible.
    const unitAspect = (board.unit.w * board.imgW) / (board.unit.h * board.imgH);
    const boardHeight = stacked
        ? Math.round(Math.min(viewport.width / unitAspect, viewport.height * 0.52))
        : viewport.height;

    const scorecardProps = {
        playerNames: customNames,
        playerColors: playerDiceColors,
        scorecards,
        upperBonuses,
        yahtzeeBonuses,
        totals,
        activePlayerIndex: activePlayer,
        potentialScores,
        canSelectCategory,
        onSelectCategory: game.selectCategory,
        mustPick: gameState.rollsLeft === 0,
        highlightedCategory,
        undo: undoOffer,
        onUndo: undoLastScore,
    };

    const stage = (
        <BoardStage
            board={board}
            fit={stacked ? 'contain-unit' : 'cover'}
            inset={stacked ? undefined : { right: railInset }}
            arenaRef={arenaRef}
            heldDice={gameState.heldDice}
            onDieClick={game.toggleHold}
            canInteract={canInteractDice}
            diceColor={playerDiceColors[activePlayer] || '#FFFFFF'}
            onTurnComplete={game.handleTurnComplete}
            onImpact={() => playSound('impact')}
            values={gameState.diceValues}
            lowPower={viewport.lowPower}
            showDebugNumbers={isDev && showDieNumbers}
            debugRects={isDev && debugRects}
            onRoll={game.roll}
            rollDisabled={
                isRolling ||
                gameState.rollsLeft <= 0 ||
                gameState.isGameOver ||
                playerTypes[activePlayer] !== 'HUMAN'
            }
            rollsLeft={gameState.isGameOver ? 0 : gameState.rollsLeft}
            feltOverlay={
                celebrating ? (
                    <>
                        {showCelebration && (
                            <SarzeeCelebration
                                arenaRef={arenaRef}
                                theme={board.theme}
                                onDismiss={() => setShowCelebration(false)}
                            />
                        )}
                        {showNancyCelebration && (
                            <NancyCelebration arenaRef={arenaRef} onDismiss={() => setShowNancyCelebration(false)} />
                        )}
                    </>
                ) : undefined
            }
            hud={(titlePlate) => (
                <GameHud
                    playerName={customNames[activePlayer] || `Player ${activePlayer + 1}`}
                    playerType={playerTypes[activePlayer] ?? 'HUMAN'}
                    playerColor={playerDiceColors[activePlayer] || '#FFFFFF'}
                    rollsLeft={gameState.rollsLeft}
                    theme={board.theme}
                    plate={titlePlate}
                    compact={compact}
                    rightInset={railInset}
                    onShowRules={() => setShowRules(true)}
                    onShowStats={() => setShowStats(true)}
                    onLeave={game.resetAll}
                />
            )}
        >
            {cpu.isThinking && cpu.message && !celebrating && (
                <div
                    className={`absolute -translate-x-1/2 z-40 pointer-events-none animate-in fade-in-0 duration-300 max-w-[92%] ${
                        compact ? 'bottom-2' : ''
                    }`}
                    // Just inside the top of the felt, clear of the HUD in the title plate.
                    style={compact ? { left: 'var(--felt-cx)' } : { left: 'var(--felt-cx)', top: 'calc(var(--felt-top) + 12px)' }}
                >
                    <div className="backdrop-blur-md bg-black/75 border border-yellow-500/30 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-2.5">
                        <span className="flex gap-1 shrink-0">
                            {[0, 150, 300].map((delay) => (
                                <span
                                    key={delay}
                                    className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce"
                                    style={{ animationDelay: `${delay}ms` }}
                                />
                            ))}
                        </span>
                        <span className="text-xs font-bold text-yellow-400 tracking-wide">{cpu.message}</span>
                    </div>
                </div>
            )}
        </BoardStage>
    );

    return (
        <div className="fixed inset-0 w-full h-full overflow-hidden bg-black" style={{ height: '100dvh' }}>
            {/* The stage keeps the same place in the tree in both layouts, so flipping between
                them (rotating a phone) restyles the board rather than remounting it. A remount
                dropped the roll in flight — the arena that owned the playback was gone, the
                turn never reported back, and ROLL sat dead until the watchdog gave up. */}
            <div className="absolute left-0 top-0 w-full" style={{ height: boardHeight }}>
                {stage}
            </div>
            {stacked ? (
                <div
                    className="absolute left-0 right-0 bottom-0 p-1.5 pt-2"
                    style={{ top: boardHeight, backgroundColor: board.theme.bg }}
                >
                    <ScoreTable {...scorecardProps} className="h-full" />
                </div>
            ) : (
                <aside
                    className="absolute right-0 top-0 bottom-0 z-[60] flex flex-col p-2"
                    style={{ width: viewport.railWidth, backgroundColor: `${board.theme.bg}f0` }}
                >
                    <ScoreTable {...scorecardProps} className="flex-1 min-h-0" />
                </aside>
            )}

            {phase === 'GAME_OVER' && (
                <GameOverOverlay
                    playerNames={customNames}
                    totals={totals}
                    compact={compact}
                    onNewGame={game.resetAll}
                    onDownload={handleDownload}
                    onUndo={undoOffer ? undoLastScore : undefined}
                />
            )}

            {/* The rigged-roll badge: the hidden test keystroke has armed the next roll. */}
            {riggedRoll && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] pointer-events-none animate-in fade-in-0 slide-in-from-top-2 duration-300">
                    <div className="backdrop-blur-md bg-black/75 border border-yellow-500/40 rounded-full px-4 py-1.5 shadow-2xl text-[11px] font-bold tracking-[0.2em] uppercase text-yellow-400">
                        {riggedRoll === 'sarzee' ? 'Next roll: Sarzee' : 'Next opening roll: Nancy'}
                    </div>
                </div>
            )}

            <RulesDrawer isOpen={showRules} onClose={() => setShowRules(false)} theme={board.theme} />
            <StatsDashboard isOpen={showStats} onClose={() => setShowStats(false)} theme={board.theme} />

            {/* Off-screen, print-shaped copy of the pad that the PDF is made from. */}
            {exporting && (
                <div
                    aria-hidden
                    className="fixed top-0 pointer-events-none"
                    style={{ left: -10000, width: EXPORT_W, height: EXPORT_H }}
                >
                    <ScoreTable
                        {...scorecardProps}
                        ref={exportRef}
                        canSelectCategory={false}
                        highlightedCategory={null}
                        undo={null}
                        className="h-full"
                    />
                </div>
            )}

            {isDev && (
                <div className="absolute bottom-1 left-1 z-[999] font-mono text-[9px] text-white/40 pointer-events-none">
                    {viewport.width}×{viewport.height} · {viewport.mode} · L=rects V=values C=sarzee N=nancy
                </div>
            )}
        </div>
    );
}

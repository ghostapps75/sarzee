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

    const scorecardRef = useRef<HTMLDivElement>(null);

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
    } = game;

    // Dev-only keyboard shortcuts.
    useEffect(() => {
        if (!isDev) return;

        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
            const k = e.key.toLowerCase();
            if (k === 'l') setDebugRects((s) => !s);
            if (k === 'v') setShowDieNumbers((s) => !s);
            if (k === 'c') {
                setShowCelebration(false);
                requestAnimationFrame(() => setShowCelebration(true));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isDev, setShowCelebration]);

    const handleDownload = useCallback(async () => {
        const node = scorecardRef.current;
        if (!node) return;
        try {
            const { htmlToImage, jsPDF } = await importExportTools();
            const dataUrl = await htmlToImage.toPng(node, {
                // The card scrolls on short screens; capture all of it, not just what's in view.
                // scrollHeight leaves out the card's borders, so add them back or the clone
                // overflows by a few pixels and draws scrollbars into the image.
                height: node.scrollHeight + node.offsetHeight - node.clientHeight,
                style: { overflow: 'hidden' },
                // Print resolution: the card is a few hundred CSS px wide but fills an A4 page.
                pixelRatio: 3,
                filter: (n: HTMLElement) =>
                    !n.className || typeof n.className !== 'string' || !n.className.includes('helper-exclude-pdf'),
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
            pdf.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
            pdf.save(`${timestampedName('sarzee-scorecard')}.pdf`);
        } catch (e) {
            console.error('Export failed', e);
            alert('Failed to generate scorecard PDF.');
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
        ref: scorecardRef,
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
        >
            {cpu.isThinking && cpu.message && (
                <div
                    className={`absolute -translate-x-1/2 z-40 pointer-events-none animate-in fade-in-0 duration-300 max-w-[92%] ${
                        compact ? 'bottom-2' : 'top-[18%]'
                    }`}
                    style={{ left: `calc((100% - ${railInset}px) / 2)` }}
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

            {showCelebration && (
                <div className="absolute inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: railInset }}>
                    <SarzeeCelebration onDismiss={() => setShowCelebration(false)} />
                </div>
            )}
            {showNancyCelebration && (
                <div className="absolute inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: railInset }}>
                    <NancyCelebration onDismiss={() => setShowNancyCelebration(false)} />
                </div>
            )}
        </BoardStage>
    );

    return (
        <div className="fixed inset-0 w-full h-full overflow-hidden bg-black" style={{ height: '100dvh' }}>
            {stacked ? (
                <div className="absolute inset-0 flex flex-col">
                    <div className="relative shrink-0 w-full" style={{ height: boardHeight }}>
                        {stage}
                    </div>
                    <div className="flex-1 min-h-0 p-1.5 pt-2" style={{ backgroundColor: board.theme.bg }}>
                        <ScoreTable {...scorecardProps} className="h-full" />
                    </div>
                </div>
            ) : (
                <>
                    {stage}
                    <aside
                        className="absolute right-0 top-0 bottom-0 z-[60] flex flex-col p-2"
                        style={{ width: viewport.railWidth, backgroundColor: `${board.theme.bg}f0` }}
                    >
                        <ScoreTable {...scorecardProps} className="flex-1 min-h-0" />
                    </aside>
                </>
            )}

            <GameHud
                playerName={customNames[activePlayer] || `Player ${activePlayer + 1}`}
                playerType={playerTypes[activePlayer] ?? 'HUMAN'}
                playerColor={playerDiceColors[activePlayer] || '#FFFFFF'}
                rollsLeft={gameState.rollsLeft}
                compact={compact}
                rightInset={railInset}
                onShowRules={() => setShowRules(true)}
                onShowStats={() => setShowStats(true)}
                onLeave={game.resetAll}
            />

            {phase === 'GAME_OVER' && (
                <GameOverOverlay
                    playerNames={customNames}
                    totals={totals}
                    compact={compact}
                    onNewGame={game.resetAll}
                    onDownload={handleDownload}
                />
            )}

            <RulesDrawer isOpen={showRules} onClose={() => setShowRules(false)} theme={board.theme} />
            <StatsDashboard isOpen={showStats} onClose={() => setShowStats(false)} theme={board.theme} />

            {isDev && (
                <div className="absolute bottom-1 left-1 z-[999] font-mono text-[9px] text-white/40 pointer-events-none">
                    {viewport.width}×{viewport.height} · {viewport.mode} · L=rects V=values C=celebrate
                </div>
            )}
        </div>
    );
}

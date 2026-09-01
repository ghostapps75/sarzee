import React, { useEffect, useState } from 'react';
import { BoardTheme } from '@/lib/boards';
import { MatchLog, clearMatchLogs, readMatchLogs, winnerRecord } from '@/lib/matchLog';

export type { MatchLog, PlayerScoreRecord } from '@/lib/matchLog';

interface StatsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  theme: BoardTheme;
}

const EMPTY_STATS = {
  totalGames: 0,
  highestScore: 0,
  highestScorer: 'N/A',
  totalSarzees: 0,
  totalNancys: 0,
  humanWinRate: 0,
};

export default function StatsDashboard({ isOpen, onClose, theme: themeColors }: StatsDashboardProps) {
  const [matchLogs, setMatchLogs] = useState<MatchLog[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);

  useEffect(() => {
    if (!isOpen) return;

    const logs = readMatchLogs();
    setMatchLogs(logs);

    let highestScore = 0;
    let highestScorer = 'N/A';
    let totalSarzees = 0;
    let totalNancys = 0;
    let humanGames = 0;
    let humanWins = 0;

    logs.forEach((log) => {
      totalSarzees += log.sarzeeCount || 0;
      totalNancys += log.nancyCount || 0;

      log.players.forEach((p) => {
        if (p.score > highestScore) {
          highestScore = p.score;
          highestScorer = p.name;
        }
      });

      // Only count games that actually had a human in them towards the win rate.
      if (log.players.some((p) => !p.isCpu)) {
        humanGames++;
        // Look the winner up by index: two players can share a name.
        if (winnerRecord(log)?.isCpu === false) humanWins++;
      }
    });

    setStats({
      totalGames: logs.length,
      highestScore,
      highestScorer,
      totalSarzees,
      totalNancys,
      humanWinRate: humanGames > 0 ? Math.round((humanWins / humanGames) * 100) : 0,
    });
  }, [isOpen]);

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to purge all local match records?')) {
      clearMatchLogs();
      setMatchLogs([]);
      setStats(EMPTY_STATS);
    }
  };

  // Render glowing SVG line chart of scoring history (highest score of each match)
  const renderScoreChart = () => {
    if (matchLogs.length === 0) {
      // Return placeholder mockup path when empty
      return (
        <div className="w-full h-32 flex flex-col items-center justify-center border border-white/5 rounded-xl bg-white/2 p-4 text-center">
          <p className="text-xs text-gray-500">No match records compiled yet.</p>
          <p className="text-[10px] text-gray-600 mt-1">Play matches to construct dynamic performance chart.</p>
        </div>
      );
    }

    const chartWidth = 320;
    const chartHeight = 120;
    const padding = 15;

    // Get max score of each match to plot
    const scores = matchLogs.map(log => Math.max(...log.players.map(p => p.score)));
    
    // Scale data
    const maxVal = Math.max(...scores, 150); // benchmark floor of 150
    const minVal = Math.min(...scores, 50);

    const getX = (index: number) => {
      if (scores.length <= 1) return chartWidth / 2;
      return padding + (index / (scores.length - 1)) * (chartWidth - padding * 2);
    };

    const getY = (val: number) => {
      const range = maxVal - minVal || 1;
      return chartHeight - padding - ((val - minVal) / range) * (chartHeight - padding * 2);
    };

    // Construct path coordinates
    let pathString = '';
    scores.forEach((val, idx) => {
      const x = getX(idx);
      const y = getY(val);
      if (idx === 0) pathString = `M ${x} ${y}`;
      else pathString += ` L ${x} ${y}`;
    });

    return (
      <div className="w-full border border-white/5 rounded-2xl bg-black/40 p-4 relative overflow-hidden">
        <div className="text-[10px] font-bold text-gray-500 tracking-wider uppercase mb-2">
          Scoring Ceiling Trend
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-28 overflow-visible">
          <defs>
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColors.text} stopOpacity="0.4" />
              <stop offset="100%" stopColor={themeColors.text} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padding} y1={getY(minVal)} x2={chartWidth - padding} y2={getY(minVal)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={getY((minVal + maxVal)/2)} x2={chartWidth - padding} y2={getY((minVal + maxVal)/2)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={getY(maxVal)} x2={chartWidth - padding} y2={getY(maxVal)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

          {/* Area fill */}
          {scores.length > 1 && (
            <path
              d={`${pathString} L ${getX(scores.length - 1)} ${chartHeight - padding} L ${getX(0)} ${chartHeight - padding} Z`}
              fill="url(#chart-grad)"
            />
          )}

          {/* Glow Line */}
          <path
            d={pathString}
            fill="none"
            stroke={themeColors.text}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#neon-glow)"
          />

          {/* Points */}
          {scores.map((val, idx) => (
            <circle
              key={idx}
              cx={getX(idx)}
              cy={getY(val)}
              r="4.5"
              fill="#FFFFFF"
              stroke={themeColors.text}
              strokeWidth="2"
              className="transition-transform hover:scale-125 cursor-pointer"
            >
              <title>Match {idx+1}: {val} pts</title>
            </circle>
          ))}
        </svg>
        <div className="flex justify-between text-[8px] text-gray-500 font-mono mt-1 px-1">
          <span>Min: {minVal} pts</span>
          <span>{matchLogs.length} matches logged</span>
          <span>Max: {maxVal} pts</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-out Drawer from the Right */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] max-w-[90vw] z-[101] flex flex-col shadow-2xl transition-transform duration-300 ease-out border-l pointer-events-auto`}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          backgroundColor: 'rgba(15, 15, 20, 0.95)',
          borderColor: `${themeColors.border}30`,
          boxShadow: `-10px 0 50px rgba(0, 0, 0, 0.8), 0 0 30px ${themeColors.border}10`,
        }}
      >
        {/* Header */}
        <div
          className="p-6 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: `${themeColors.border}20` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <h2
              className="text-xl font-bold uppercase tracking-wider bg-clip-text text-transparent"
              style={{ backgroundImage: themeColors.titleGradient }}
            >
              Statistics
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Parchment Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-300 scrollbar-thin select-none">
          
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-4 rounded-xl border border-white/5 bg-white/2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Games</div>
              <div className="text-2xl font-black text-white mt-1">{stats.totalGames}</div>
            </div>
            <div className="p-4 rounded-xl border border-white/5 bg-white/2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Win Rate (vs AI)</div>
              <div className="text-2xl font-black mt-1" style={{ color: themeColors.text }}>{stats.humanWinRate}%</div>
            </div>
            <div className="p-4 rounded-xl border border-white/5 bg-white/2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Total Sarzees</div>
              <div className="text-2xl font-black text-yellow-400 mt-1">{stats.totalSarzees}</div>
            </div>
            <div className="p-4 rounded-xl border border-white/5 bg-white/2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Total Nancys</div>
              <div className="text-2xl font-black text-[#4ABFAC] mt-1">{stats.totalNancys}</div>
            </div>
          </div>

          {/* Personal Best */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/2 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">All-Time High Score</div>
              <div className="text-base font-bold text-white mt-1">{stats.highestScorer}</div>
            </div>
            <div className="text-3xl font-black bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
              {stats.highestScore} <span className="text-xs text-gray-500 uppercase tracking-tighter">pts</span>
            </div>
          </div>

          {/* Custom Glowing SVG Chart */}
          <div className="space-y-2">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1" style={{ borderColor: `${themeColors.border}20` }}>
              Performance Chart
            </h3>
            {renderScoreChart()}
          </div>

          {/* Match Logs list */}
          <div className="space-y-3">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1" style={{ borderColor: `${themeColors.border}20` }}>
              Match History
            </h3>
            {matchLogs.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-4">No logged history.</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                {matchLogs.slice().reverse().map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border border-white/5 bg-white/1 flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">{log.winner.name} Won</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{log.date} • {log.boardName}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-[#4ABFAC]">{log.winner.score} pts</div>
                      <div className="text-[9px] text-gray-400">
                        {log.players.length} Players ({log.sarzeeCount} S / {log.nancyCount} N)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Clear History Option */}
        <div
          className="p-6 border-t flex items-center justify-between shrink-0"
          style={{ borderColor: `${themeColors.border}20` }}
        >
          <button
            onClick={clearHistory}
            className="text-[10px] font-bold text-red-500/80 hover:text-red-400 uppercase tracking-wider cursor-pointer"
          >
            Clear Log Data
          </button>
          <div className="text-[10px] text-gray-600">Sarzee Metrics</div>
        </div>
      </div>
    </>
  );
}

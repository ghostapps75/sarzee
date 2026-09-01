import React from 'react';
import { BoardTheme } from '@/lib/boards';

interface RulesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: BoardTheme;
}

export default function RulesDrawer({ isOpen, onClose, theme: themeColors }: RulesDrawerProps) {
  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-out Drawer from the Left */}
      <div
        className={`fixed top-0 left-0 h-full w-[380px] max-w-[90vw] z-[101] flex flex-col shadow-2xl transition-transform duration-300 ease-out border-r pointer-events-auto`}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          backgroundColor: 'rgba(15, 15, 20, 0.95)',
          borderColor: `${themeColors.border}30`,
          boxShadow: `10px 0 50px rgba(0, 0, 0, 0.8), 0 0 30px ${themeColors.border}10`,
        }}
      >
        {/* Header */}
        <div
          className="p-6 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: `${themeColors.border}20` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <h2
              className="text-xl font-bold uppercase tracking-wider bg-clip-text text-transparent"
              style={{ backgroundImage: themeColors.titleGradient }}
            >
              How to Play
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
          
          {/* Subsection: The Objective */}
          <div className="space-y-2">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1 flex justify-between" style={{ borderColor: `${themeColors.border}20` }}>
              <span>Objective</span>
              <span style={{ color: themeColors.text }}>Scoresheet</span>
            </h3>
            <p className="leading-relaxed text-gray-400">
              Roll 5 physics-based 3D dice across 13 consecutive turns to build high-scoring combinations. Complete all categories on your scorecard to achieve the ultimate high score.
            </p>
          </div>

          {/* Subsection: Roll Actions */}
          <div className="space-y-3">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1" style={{ borderColor: `${themeColors.border}20` }}>
              Turn Actions
            </h3>
            <div className="space-y-2">
              <div className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</span>
                <div>
                  <h4 className="font-semibold text-white">First Roll</h4>
                  <p className="text-xs text-gray-400">Roll all 5 dice into the tabletop arena.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</span>
                <div>
                  <h4 className="font-semibold text-white">Hold Dice</h4>
                  <p className="text-xs text-gray-400">Toggle lock/hold on any number of dice to save their values for subsequent rolls.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</span>
                <div>
                  <h4 className="font-semibold text-white">Commit Score</h4>
                  <p className="text-xs text-gray-400">Select any open category on your scorecard. You must commit a score (or scratch as 0) by your 3rd roll.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subsection: Celebrations */}
          <div className="space-y-4">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1" style={{ borderColor: `${themeColors.border}20` }}>
              Celebration Combinations
            </h3>
            
            {/* Nancy Celebration */}
            <div
              className="p-3.5 rounded-xl border flex gap-3 items-start"
              style={{
                backgroundColor: 'rgba(74, 191, 172, 0.05)',
                borderColor: 'rgba(74, 191, 172, 0.2)',
              }}
            >
              <span className="text-2xl mt-0.5">💃</span>
              <div>
                <h4 className="font-bold text-[#4ABFAC]">Nancy Celebration</h4>
                <p className="text-xs text-gray-400 mt-1 leading-normal">
                  Rolled on the <strong className="text-white">first roll of a turn</strong>, when <strong className="text-white">all 5 dice are different</strong> and do <strong className="text-white">NOT</strong> form a straight (e.g. 1, 2, 4, 5, 6). Triggers a glorious neon dance celebration!
                </p>
              </div>
            </div>

            {/* Sarzee Celebration */}
            <div
              className="p-3.5 rounded-xl border flex gap-3 items-start"
              style={{
                backgroundColor: `${themeColors.border}08`,
                borderColor: `${themeColors.border}30`,
              }}
            >
              <span className="text-2xl mt-0.5">👑</span>
              <div>
                <h4 className="font-bold" style={{ color: themeColors.text }}>Sarzee Celebration</h4>
                <p className="text-xs text-gray-400 mt-1 leading-normal">
                  A <strong className="text-white">5-of-a-kind</strong> combination. Scoring it in the Sarzee (Yahtzee) box yields <strong className="text-white">50 points</strong>! Subsequent Sarzees trigger a <strong className="text-white">+100 points bonus</strong> if the main box is active!
                </p>
              </div>
            </div>
          </div>

          {/* Subsection: Special Scores */}
          <div className="space-y-3">
            <h3 className="text-white font-bold uppercase tracking-wider text-xs border-b pb-1" style={{ borderColor: `${themeColors.border}20` }}>
              Scoring Details
            </h3>
            <ul className="space-y-2 text-xs">
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Ones to Sixes</span>
                <span className="text-white font-semibold">Sum of matching dice</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Three of a Kind</span>
                <span className="text-white font-semibold">Sum of all 5 dice</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Four of a Kind</span>
                <span className="text-white font-semibold">Sum of all 5 dice</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Full House</span>
                <span className="text-white font-semibold">25 points</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Small Straight (4 in row)</span>
                <span className="text-white font-semibold">30 points</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Large Straight (5 in row)</span>
                <span className="text-white font-semibold">40 points</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">Chance</span>
                <span className="text-white font-semibold">Sum of all 5 dice</span>
              </li>
              <li className="flex justify-between pb-1">
                <span className="text-gray-400">Upper Section Bonus</span>
                <span className="text-emerald-400 font-bold">35 pts if Upper Sum &ge; 63</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div
          className="p-6 border-t text-center text-xs text-gray-500 shrink-0"
          style={{ borderColor: `${themeColors.border}20` }}
        >
          Sarzee Premium Edition © 2026
        </div>
      </div>
    </>
  );
}

import React, { useState } from 'react';
import { CpuPersonality } from '@/lib/CpuAgent';
import { BOARDS, getBoard } from '@/lib/boards';

interface SetupPanelProps {
  selectedBoard: string;
  setSelectedBoard: (id: string) => void;
  setPlayerCount: (count: number) => void;
  customNames: string[];
  setCustomNames: (names: string[]) => void;
  playerDiceColors: string[];
  setPlayerDiceColors: (colors: string[]) => void;
  playerTypes: ('HUMAN' | CpuPersonality)[];
  setPlayerTypes: (types: ('HUMAN' | CpuPersonality)[]) => void;
  onStartGame: () => void;
}

export default function SetupPanel({
  selectedBoard,
  setSelectedBoard,
  setPlayerCount,
  customNames,
  setCustomNames,
  playerDiceColors,
  setPlayerDiceColors,
  playerTypes,
  setPlayerTypes,
  onStartGame,
}: SetupPanelProps) {
  const [step, setStep] = useState<'BOARD' | 'COUNT' | 'PLAYERS'>('BOARD');
  const boardOption = getBoard(selectedBoard);
  const themeColors = boardOption.theme;

  const handleBoardSelect = (boardId: string) => {
    setSelectedBoard(boardId);

    // Colours belong to the board, so a seat holding one the new board doesn't offer is
    // moved to that seat's default. Otherwise going back and changing the board left
    // players on the old palette, with no swatch showing as selected.
    const nextPalette = getBoard(boardId).diceColors;
    setPlayerDiceColors(
      playerDiceColors.map((hex, i) =>
        nextPalette.some((opt) => opt.hex === hex) ? hex : nextPalette[i % nextPalette.length].hex
      )
    );

    setStep('COUNT');
  };

  const handlePlayerCountSelect = (count: number) => {
    setPlayerCount(count);
    
    // Auto populate names, types, and colors
    const nextNames = Array.from({ length: count }, (_, i) => customNames[i] || `Player ${i + 1}`);
    setCustomNames(nextNames);

    const nextTypes = Array.from({ length: count }, (_, i) => playerTypes[i] || 'HUMAN');
    setPlayerTypes(nextTypes);

    const themeDiceColors = boardOption.diceColors;
    const nextColors = Array.from(
      { length: count },
      (_, i) => playerDiceColors[i] || themeDiceColors[i % themeDiceColors.length].hex
    );
    setPlayerDiceColors(nextColors);

    setStep('PLAYERS');
  };

  const updatePlayerName = (idx: number, name: string) => {
    const next = [...customNames];
    next[idx] = name;
    setCustomNames(next);
  };

  const updatePlayerType = (idx: number, type: 'HUMAN' | CpuPersonality) => {
    const nextTypes = [...playerTypes];
    nextTypes[idx] = type;
    setPlayerTypes(nextTypes);

    // If changing to AI, give them an appropriate default name if it was Player X
    if (type !== 'HUMAN' && customNames[idx] === `Player ${idx + 1}`) {
      const nextNames = [...customNames];
      if (type === 'SAFE_SAM') nextNames[idx] = 'Safe Sam';
      else if (type === 'RISK_TAKING_ROSIE') nextNames[idx] = 'Risk Rosie';
      else if (type === 'BALANCED_BOBBY') nextNames[idx] = 'Balanced Bobby';
      setCustomNames(nextNames);
    }
  };

  const updatePlayerColor = (idx: number, color: string) => {
    const next = [...playerDiceColors];
    next[idx] = color;
    setPlayerDiceColors(next);
  };

  const diceColorOptions = boardOption.diceColors;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black flex items-center justify-center p-4">
      {/* Background Board Underlay with extra blur */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-out scale-105"
        style={{
          backgroundImage: `url(/textures/${boardOption.file})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(10px) brightness(0.4)',
        }}
      />

      <div className="relative z-10 w-full max-w-4xl max-h-[92vh] flex flex-col items-center">
        {/* Main Frosted Container */}
        <div
          className="w-full flex flex-col rounded-3xl border shadow-2xl backdrop-blur-xl p-8 md:p-10 overflow-hidden transition-all duration-500"
          style={{
            backgroundColor: 'rgba(15, 15, 20, 0.75)',
            borderColor: `${themeColors.border}30`,
            boxShadow: `0 20px 80px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 40px ${themeColors.border}10`,
          }}
        >
          {/* Header Title with animated gradient clip */}
          <div className="text-center mb-8 shrink-0">
            <h1
              className="text-5xl md:text-6xl font-extrabold tracking-widest uppercase bg-clip-text text-transparent transition-all duration-500"
              style={{
                backgroundImage: themeColors.titleGradient,
                filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.5))',
              }}
            >
              SARZEE
            </h1>
            <p className="text-gray-400 text-xs md:text-sm tracking-widest mt-2 uppercase">
              Premium 3D Physics Tabletop Arena
            </p>
          </div>

          {/* Setup Steps content - scrollable internally */}
          <div className="flex-1 overflow-y-auto pr-1 select-none scrollbar-thin">
            {step === 'BOARD' && (
              <div className="animate-in fade-in-50 slide-in-from-bottom-5 duration-300">
                <h2 className="text-lg md:text-xl font-bold text-white text-center mb-6 uppercase tracking-wider">
                  Select Tabletop Arena
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto p-1">
                  {BOARDS.map((board) => {
                    const isActive = board.id === selectedBoard;
                    return (
                      <div
                        key={board.id}
                        onClick={() => handleBoardSelect(board.id)}
                        className={`group relative rounded-2xl p-4 border cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02] flex gap-4 items-center`}
                        style={{
                          backgroundColor: isActive ? `${themeColors.border}20` : 'rgba(255,255,255,0.02)',
                          borderColor: isActive ? themeColors.border : 'rgba(255,255,255,0.08)',
                          boxShadow: isActive ? `0 0 20px ${themeColors.border}20` : 'none',
                        }}
                      >
                        {/* Little Miniature Board Image */}
                        <div
                          className="w-16 h-16 rounded-xl border shrink-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                          style={{
                            backgroundImage: `url(/textures/${board.file})`,
                            borderColor: isActive ? themeColors.border : 'rgba(255,255,255,0.1)',
                          }}
                        />
                        <div className="flex flex-col">
                          <h3 className="font-bold text-white text-base group-hover:text-yellow-400 transition-colors">
                            {board.name}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1 leading-normal">
                            {board.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'COUNT' && (
              <div className="animate-in fade-in-50 slide-in-from-bottom-5 duration-300 text-center py-6">
                <h2 className="text-lg md:text-xl font-bold text-white mb-8 uppercase tracking-wider">
                  How many players?
                </h2>
                <div className="flex gap-6 justify-center items-center py-4">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => handlePlayerCountSelect(n)}
                      className="w-20 h-20 font-black rounded-2xl shadow-xl text-3xl transition-all transform hover:scale-110 active:scale-95 border-2 flex items-center justify-center cursor-pointer"
                      style={{
                        background: `linear-gradient(to bottom, ${themeColors.buttonGradientFrom}, ${themeColors.buttonGradientTo})`,
                        color: themeColors.buttonText,
                        borderColor: themeColors.buttonBorder,
                        boxShadow: `0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${themeColors.border}15`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = themeColors.buttonBorderHover;
                        e.currentTarget.style.boxShadow = `0 10px 30px ${themeColors.border}30, inset 0 1px 0 rgba(255,255,255,0.2)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = themeColors.buttonBorder;
                        e.currentTarget.style.boxShadow = `0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${themeColors.border}15`;
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep('BOARD')}
                  className="mt-8 text-xs tracking-widest text-gray-400 hover:text-white uppercase transition-colors"
                >
                  ← Change Board
                </button>
              </div>
            )}

            {step === 'PLAYERS' && (
              <div className="animate-in fade-in-50 slide-in-from-bottom-5 duration-300">
                <h2 className="text-lg md:text-xl font-bold text-white text-center mb-6 uppercase tracking-wider">
                  Configure Players & Personalities
                </h2>
                <div className="flex flex-col gap-5 mx-auto mb-6 p-1 max-h-[46vh] overflow-y-auto scrollbar-thin">
                  {customNames.map((name, idx) => {
                    const pType = playerTypes[idx] || 'HUMAN';
                    const pColor = playerDiceColors[idx] || '#FFFFFF';

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl p-4 border bg-white/5 flex flex-col md:flex-row md:flex-wrap gap-4 items-center justify-between transition-all duration-300"
                        style={{
                          borderColor: `${themeColors.border}15`,
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        }}
                      >
                        {/* Player Number + Text Name */}
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                            style={{
                              backgroundColor: `${themeColors.border}30`,
                              color: themeColors.text,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <input
                            value={name}
                            onChange={(e) => updatePlayerName(idx, e.target.value)}
                            className="bg-black/40 border-2 rounded-xl px-4 py-2 font-semibold text-white focus:outline-none transition-colors w-full md:w-44 text-sm"
                            style={{
                              borderColor: `${themeColors.border}30`,
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = themeColors.focus;
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = `${themeColors.border}30`;
                            }}
                            placeholder={`Player ${idx + 1}`}
                            maxLength={12}
                          />
                        </div>

                        {/* Player Type Selector (Tabs) */}
                        <div className="flex bg-black/60 rounded-xl p-1 border border-white/5 w-full md:w-auto">
                          {(['HUMAN', 'SAFE_SAM', 'RISK_TAKING_ROSIE', 'BALANCED_BOBBY'] as const).map((t) => {
                            const isSel = pType === t;
                            let label = 'Player';
                            if (t === 'SAFE_SAM') label = 'Safe Sam';
                            else if (t === 'RISK_TAKING_ROSIE') label = 'Risk Rosie';
                            else if (t === 'BALANCED_BOBBY') label = 'Balanced';

                            return (
                              <button
                                key={t}
                                onClick={() => updatePlayerType(idx, t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-200 ${
                                  isSel ? 'text-black font-extrabold shadow-sm' : 'text-gray-400 hover:text-white'
                                }`}
                                style={{
                                  backgroundColor: isSel ? themeColors.text : 'transparent',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Player Color Dice Selector */}
                        {/* Six swatches plus a name; on a tablet-width card this wraps under the
                            tabs rather than crushing the name field. */}
                        <div className="flex flex-col items-end gap-1 w-full md:w-auto md:ml-auto shrink-0">
                          <div className="flex gap-1.5 justify-end">
                            {diceColorOptions.map((opt) => {
                              const isSel = pColor === opt.hex;
                              return (
                                <button
                                  key={opt.hex}
                                  onClick={() => updatePlayerColor(idx, opt.hex)}
                                  className={`w-7 h-7 rounded-lg border-2 transition-all transform hover:scale-110 cursor-pointer ${
                                    isSel ? 'scale-110 shadow-md' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  style={{
                                    backgroundColor: opt.hex,
                                    // Unselected swatches get a faint edge so a white or
                                    // near-black die still reads as a swatch on the dark card.
                                    borderColor: isSel ? themeColors.text : 'rgba(255,255,255,0.18)',
                                    boxShadow: isSel ? `0 0 10px ${opt.hex}80` : 'none',
                                  }}
                                  title={opt.name}
                                  aria-label={`${opt.name} dice`}
                                  aria-pressed={isSel}
                                />
                              );
                            })}
                          </div>
                          <span className="text-[10px] tracking-widest uppercase text-gray-400 leading-none">
                            {diceColorOptions.find((opt) => opt.hex === pColor)?.name ?? 'Dice colour'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-4">
                  <button
                    onClick={() => setStep('COUNT')}
                    className="text-xs tracking-widest text-gray-400 hover:text-white uppercase transition-colors cursor-pointer"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={onStartGame}
                    className="font-extrabold py-3 px-10 rounded-xl shadow-xl text-base transition-all transform hover:scale-105 active:scale-95 border-2 cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${themeColors.buttonGradientFrom}, ${themeColors.buttonGradientTo})`,
                      color: themeColors.buttonText,
                      borderColor: themeColors.buttonBorder,
                      boxShadow: `0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 20px ${themeColors.border}20`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = themeColors.buttonBorderHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = themeColors.buttonBorder;
                    }}
                  >
                    Launch Arena
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

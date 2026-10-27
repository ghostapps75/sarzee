import React from 'react';
import { BoardTheme } from '@/lib/boards';
import { HighScoreEntry } from '@/lib/matchLog';

interface HighScoreBoardProps {
  /**
   * Best first, already cut to length. The board draws whatever it is given, so the
   * device's own `topScores` and a shared board from a server can feed it alike.
   */
  entries: HighScoreEntry[];
  theme: BoardTheme;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** The high score table. Sized for the stats drawer, which is phone-width at its widest. */
export default function HighScoreBoard({ entries, theme: themeColors }: HighScoreBoardProps) {
  if (entries.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center border border-white/5 rounded-xl bg-white/2 p-6 text-center">
        <p className="text-xs text-gray-500">No high scores yet.</p>
        <p className="text-[10px] text-gray-600 mt-1">Finish a game with a human player to get on the board.</p>
      </div>
    );
  }

  return (
    <table className="w-full table-fixed border-separate border-spacing-y-1.5 -my-1.5 text-xs">
      <caption className="sr-only">Top {entries.length} scores by human players</caption>
      <thead>
        <tr className="text-[9px] uppercase tracking-wider text-gray-500">
          <th scope="col" className="w-9 pl-2 text-left font-bold">#</th>
          <th scope="col" className="text-left font-bold">Player</th>
          <th scope="col" className="w-[34%] pl-2 text-left font-bold">Board</th>
          <th scope="col" className="w-14 pr-3 text-right font-bold">Score</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => {
          const best = i === 0;
          // Each cell carries a slice of the row's border, so the row reads as one card.
          const cell = `py-2 border-y ${best ? '' : 'border-white/5 bg-white/2'}`;
          const cellStyle = best
            ? { borderColor: `${themeColors.border}55`, backgroundColor: `${themeColors.border}18` }
            : undefined;
          return (
            <tr key={entry.id}>
              <td className={`${cell} pl-2 border-l rounded-l-lg text-sm`} style={cellStyle}>
                {MEDALS[i] ?? <span className="pl-1 text-[11px] font-bold text-gray-500">{i + 1}</span>}
              </td>
              <td className={cell} style={cellStyle}>
                <div className="font-bold text-white truncate" title={entry.name}>
                  {entry.name}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 truncate">{entry.date}</div>
              </td>
              <td className={`${cell} pl-2 text-[10px] leading-tight text-gray-400 break-words`} style={cellStyle}>
                {entry.board}
              </td>
              <td
                className={`${cell} pr-3 border-r rounded-r-lg text-right font-black ${best ? 'text-lg' : 'text-sm'}`}
                style={{ ...cellStyle, color: themeColors.text }}
              >
                {entry.score}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

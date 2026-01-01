'use client';

import React, { useEffect } from 'react';
import { DieHandle } from './Die';

interface DebugPanelProps {
    dieRefs: React.MutableRefObject<Array<DieHandle | null>>;
    engineResults: number[];
    reported: boolean[];
    heldDice: boolean[];
    onTriggerSarzee: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
    dieRefs,
    engineResults,
    reported,
    heldDice,
    onTriggerSarzee,
}) => {
    // Keyboard hotkey: Shift + S
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.shiftKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                onTriggerSarzee();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onTriggerSarzee]);

    if (process.env.NODE_ENV !== 'development') return null;

    return (
        <div
            className="absolute top-2 left-2 z-50 rounded-lg bg-black/85 text-white text-xs p-3 space-y-2"
            style={{ fontFamily: 'monospace', minWidth: 260 }}
        >
            <div className="font-bold text-sm">🛠 Sarzee Debug Panel</div>

            <table className="w-full border-collapse">
                <thead>
                    <tr className="text-left text-gray-300">
                        <th>Die</th>
                        <th>Visual</th>
                        <th>Engine</th>
                        <th>Held</th>
                        <th>Done</th>
                    </tr>
                </thead>
                <tbody>
                    {[0, 1, 2, 3, 4].map((i) => {
                        const visual = dieRefs.current[i]?.getValue?.() ?? '—';
                        return (
                            <tr key={i} className="border-t border-white/10">
                                <td>{i + 1}</td>
                                <td className={visual !== engineResults[i] ? 'text-yellow-400' : ''}>
                                    {visual}
                                </td>
                                <td>{engineResults[i]}</td>
                                <td>{heldDice[i] ? '✓' : ''}</td>
                                <td>{reported[i] ? '✓' : ''}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <button
                onClick={onTriggerSarzee}
                className="w-full mt-2 rounded bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-1"
            >
                🔥 Trigger Sarzee (Shift+S)
            </button>

            <div className="text-[10px] text-gray-400">
                Yellow visual = mismatch vs engine
            </div>
        </div>
    );
};

export default DebugPanel;

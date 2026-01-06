'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ScorecardModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export default function ScorecardModal({ isOpen, onClose, children }: ScorecardModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    // We strictly only render the portal if isOpen is true, 
    // but we could also animate it. For now, simple conditional.
    if (!isOpen) return null;

    const content = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            {/* Backdrop click to close could be added here to outer div, but user didn't explicitly ask for it. keeping it safe. */}

            <div
                className="relative flex flex-col"
                style={{
                    width: 'min(92vw, 900px)',
                    height: 'min(92vh, 100%)',
                    maxHeight: '92vh'
                }}
            >
                <button
                    className="absolute -top-3 -right-3 z-50 w-8 h-8 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white rounded-full font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-white/20 transition-transform active:scale-90"
                    onClick={onClose}
                >
                    ✕
                </button>

                <div className="flex-1 w-full h-full overflow-y-auto rounded-xl shadow-2xl bg-[#1a1a1a] border border-white/10">
                    {children}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}

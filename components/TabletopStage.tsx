'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export const LOGICAL_STAGE_WIDTH = 1024;
export const LOGICAL_STAGE_HEIGHT = 558;

// Backward compatibility
export const LOGICAL_WIDTH = LOGICAL_STAGE_WIDTH;
export const LOGICAL_HEIGHT = LOGICAL_STAGE_HEIGHT;

type StageMetrics = {
    scale: number;
    widthPx: number;
    heightPx: number;
};

const StageContext = createContext<StageMetrics>({
    scale: 1,
    widthPx: LOGICAL_STAGE_WIDTH,
    heightPx: LOGICAL_STAGE_HEIGHT,
});

export function useStage() {
    return useContext(StageContext);
}

/**
 * TabletopStage
 * - Fills its parent.
 * - Computes a contained (letterboxed) stage rect that preserves 1024x558.
 * - Provides scale + pixel size via context.
 */
export function TabletopStage({
    children,
    className = '',
    style,
}: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [metrics, setMetrics] = useState<StageMetrics>({
        scale: 1,
        widthPx: LOGICAL_STAGE_WIDTH,
        heightPx: LOGICAL_STAGE_HEIGHT,
    });

    useEffect(() => {
        if (!containerRef.current) return;

        const ratio = LOGICAL_STAGE_WIDTH / LOGICAL_STAGE_HEIGHT;

        const obs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const cw = entry.contentRect.width;
                const ch = entry.contentRect.height;

                if (cw <= 0 || ch <= 0) return;

                // Contain: choose the limiting dimension.
                const containerRatio = cw / ch;

                let widthPx: number;
                let heightPx: number;

                if (containerRatio >= ratio) {
                    // Container is wider than stage -> height-limited
                    heightPx = ch;
                    widthPx = ch * ratio;
                } else {
                    // Container is taller/narrower -> width-limited
                    widthPx = cw;
                    heightPx = cw / ratio;
                }

                const scale = widthPx / LOGICAL_STAGE_WIDTH;
                setMetrics({ scale, widthPx, heightPx });
            }
        });

        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    return (
        <StageContext.Provider value={metrics}>
            <div
                ref={containerRef}
                className={`relative w-full h-full ${className}`}
                style={{
                    overflow: 'hidden',
                    ...style,
                }}
            >
                {/* Centered contained stage */}
                <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                        width: metrics.widthPx,
                        height: metrics.heightPx,
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    <div className="relative w-full h-full overflow-hidden">{children}</div>
                </div>
            </div>
        </StageContext.Provider>
    );
}

/**
 * StageUi
 * - Renders in 1024x558 logical space, scaled to the contained stage.
 * - IMPORTANT: defaults to pointer-events NONE. Only interactive elements opt back in.
 */
export function StageUi({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const { scale } = useStage();

    return (
        <div className={`absolute inset-0 pointer-events-none ${className}`} style={{ zIndex: 20 }}>
            <div
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                    width: LOGICAL_STAGE_WIDTH,
                    height: LOGICAL_STAGE_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            >
                {children}
            </div>
        </div>
    );
}

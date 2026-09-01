// lib/useBoardLayout.ts
'use client';

import { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { BoardDefinition, FracRect } from './boards';

export interface PxRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface Inset {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
}

export interface BoardLayout {
    /** Measured container size in CSS pixels. */
    width: number;
    height: number;
    /** True once the container has actually been measured. */
    ready: boolean;
    /** Style to spread onto the element that paints the board image. */
    backgroundStyle: {
        backgroundImage: string;
        backgroundSize: string;
        backgroundPosition: string;
        backgroundRepeat: 'no-repeat';
    };
    /** Project a rect expressed in image fractions into container pixels. */
    project: (rect: FracRect) => PxRect;
    /** Same, but as ready-to-spread absolute-positioning CSS. */
    projectStyle: (rect: FracRect) => { left: number; top: number; width: number; height: number; position: 'absolute' };
}

export type BoardFit =
    /** Fill the container with the whole image, cropping the overflow (the classic table look). */
    | 'cover'
    /** Fit the board unit entirely, letterboxing if necessary (narrow screens). */
    | 'contain-unit';

interface Options {
    fit: BoardFit;
    /**
     * Safe area to centre the board within, in pixels off each container edge.
     * Used to keep the board clear of the scorecard rail while the artwork still
     * bleeds to the full container.
     */
    inset?: Inset;
}

const EMPTY: PxRect = { left: 0, top: 0, width: 0, height: 0 };

/**
 * Measures a container and returns a transform that maps the board image — and every
 * rect defined against it — into real pixels.
 *
 * This is the piece that used to be missing. Positions were previously hardcoded as
 * percentages of the viewport (`left: '23%'`), which is only correct when the viewport
 * happens to share the board's aspect ratio. Projecting through the same transform used
 * to paint the image means the felt rect is on the felt at every size and on every board.
 */
export function useBoardLayout(
    ref: RefObject<HTMLElement | null>,
    board: BoardDefinition,
    { fit, inset }: Options
): BoardLayout {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setSize((prev) =>
                    prev && Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
                        ? prev
                        : { w: width, h: height }
                );
            }
        });
        observer.observe(el);

        const r = el.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });

        return () => observer.disconnect();
    }, [ref]);

    const insetLeft = inset?.left ?? 0;
    const insetTop = inset?.top ?? 0;
    const insetRight = inset?.right ?? 0;
    const insetBottom = inset?.bottom ?? 0;

    const transform = useMemo(() => {
        if (!size || size.w <= 0 || size.h <= 0) return null;

        const { w: cw, h: ch } = size;
        const { imgW, imgH, unit } = board;

        // The area the board itself should be centred inside.
        const safeW = Math.max(1, cw - insetLeft - insetRight);
        const safeH = Math.max(1, ch - insetTop - insetBottom);
        const safeCx = insetLeft + safeW / 2;
        const safeCy = insetTop + safeH / 2;

        const unitW = unit.w * imgW;
        const unitH = unit.h * imgH;

        // Never let the wooden board get cropped: this is the largest scale at which
        // the whole board unit still fits inside the safe area.
        const maxUnitScale = Math.min(safeW / unitW, safeH / unitH);

        const scale =
            fit === 'contain-unit'
                ? maxUnitScale
                : Math.min(Math.max(cw / imgW, ch / imgH), maxUnitScale);

        // Centre the board unit (not the raw image) on the safe area — the artwork is
        // framed around the board, so this is what makes it look deliberately placed.
        const unitCxImg = (unit.x + unit.w / 2) * imgW;
        const unitCyImg = (unit.y + unit.h / 2) * imgH;

        const originX = safeCx - unitCxImg * scale;
        const originY = safeCy - unitCyImg * scale;

        return { scale, originX, originY, drawnW: imgW * scale, drawnH: imgH * scale };
    }, [size, board, fit, insetLeft, insetTop, insetRight, insetBottom]);

    const project = useCallback(
        (rect: FracRect): PxRect => {
            if (!transform) return EMPTY;
            const { scale, originX, originY } = transform;
            return {
                left: originX + rect.x * board.imgW * scale,
                top: originY + rect.y * board.imgH * scale,
                width: rect.w * board.imgW * scale,
                height: rect.h * board.imgH * scale,
            };
        },
        [transform, board.imgW, board.imgH]
    );

    const projectStyle = useCallback(
        (rect: FracRect) => ({ ...project(rect), position: 'absolute' as const }),
        [project]
    );

    return {
        width: size?.w ?? 0,
        height: size?.h ?? 0,
        ready: !!transform,
        backgroundStyle: {
            backgroundImage: `url(/textures/${board.file})`,
            backgroundSize: transform ? `${transform.drawnW}px ${transform.drawnH}px` : 'cover',
            backgroundPosition: transform ? `${transform.originX}px ${transform.originY}px` : 'center',
            backgroundRepeat: 'no-repeat' as const,
        },
        project,
        projectStyle,
    };
}

export type LayoutMode = 'rail' | 'stack';

export interface ViewportInfo {
    width: number;
    height: number;
    /** 'rail' = board and scorecard side by side. 'stack' = board above, scorecard below. */
    mode: LayoutMode;
    /** Whether there is room for the illustrated paper scorecard rather than the table. */
    fancyScorecard: boolean;
    /** Width reserved for the scorecard rail in 'rail' mode. */
    railWidth: number;
    /** Coarse "this is a phone" signal, used to trim 3D quality. */
    lowPower: boolean;
    ready: boolean;
}

/**
 * Chooses a layout from the actual window shape rather than from device guesses.
 * A short landscape phone and a wide desktop both want the side-by-side layout; a tall
 * tablet and a phone in portrait both want the stacked one.
 */
export function useViewport(): ViewportInfo {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        onResize();
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);

    return useMemo(() => {
        const width = size?.w ?? 1280;
        const height = size?.h ?? 800;
        const mode: LayoutMode = width / height >= 1.2 ? 'rail' : 'stack';
        const railWidth = mode === 'rail' ? Math.round(Math.min(380, Math.max(210, width * 0.26))) : 0;
        const fancyScorecard = mode === 'rail' && width >= 900 && height >= 560;
        const lowPower = Math.min(width, height) < 500;
        return { width, height, mode, fancyScorecard, railWidth, lowPower, ready: !!size };
    }, [size]);
}

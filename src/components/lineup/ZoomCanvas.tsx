"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Polish spec §11.3 — n8n-style pan + zoom canvas for the lineup
 * diamond. Default scale fits the content to the pane on mount.
 * Gestures:
 *   - Trackpad pinch (wheel + ctrlKey, native macOS) → zoom at cursor.
 *   - Cmd/Ctrl + scroll → zoom at cursor.
 *   - Plain scroll wheel → blocked (no page scroll when hovered over pane).
 *   - Click-drag on empty pane background (not on cards / buttons) → pan,
 *     only when zoomed past fit.
 *   - Floating +/−/Fit buttons (top-right).
 *
 * Bounds: 0.5× to 2.0× of the mount-time fit. tx/ty clamped so the
 * content stays within the pane when zoomed above fit; centered when
 * at or below fit.
 */

type Props = {
  children: ReactNode;
  className?: string;
  /** Natural content dimensions in px. If omitted, measured from the
   *  content element's offset size on mount. */
  naturalWidth?: number;
  naturalHeight?: number;
};

const ZOOM_STEP = 1.2;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2.0;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function ZoomCanvas({ children, className, naturalWidth, naturalHeight }: Props) {
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [paneSize, setPaneSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({
    w: naturalWidth ?? 0,
    h: naturalHeight ?? 0,
  });
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [mounted, setMounted] = useState(false);

  const fitScale =
    paneSize.w > 0 && paneSize.h > 0 && natural.w > 0 && natural.h > 0
      ? Math.min(paneSize.w / natural.w, paneSize.h / natural.h)
      : 1;
  const minScale = fitScale * MIN_FACTOR;
  const maxScale = fitScale * MAX_FACTOR;

  const clampPan = useCallback(
    (nextTx: number, nextTy: number, nextScale: number) => {
      const contentW = natural.w * nextScale;
      const contentH = natural.h * nextScale;
      const centeredTx = (paneSize.w - contentW) / 2;
      const centeredTy = (paneSize.h - contentH) / 2;
      if (contentW <= paneSize.w) nextTx = centeredTx;
      else nextTx = clamp(nextTx, paneSize.w - contentW, 0);
      if (contentH <= paneSize.h) nextTy = centeredTy;
      else nextTy = clamp(nextTy, paneSize.h - contentH, 0);
      return { tx: nextTx, ty: nextTy };
    },
    [paneSize.w, paneSize.h, natural.w, natural.h],
  );

  // Measure pane + natural content size on mount and on resize.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    const content = contentRef.current;
    if (!pane || !content) return;

    const measure = () => {
      setPaneSize({ w: pane.clientWidth, h: pane.clientHeight });
      if (!naturalWidth || !naturalHeight) {
        // Natural dimensions ignore the current transform (offsetWidth /
        // offsetHeight are pre-transform layout metrics).
        setNatural({ w: content.offsetWidth, h: content.offsetHeight });
      }
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(pane);
    ro.observe(content);
    return () => ro.disconnect();
  }, [naturalWidth, naturalHeight]);

  // Initialize scale + pan to fit once we have both dimensions.
  useEffect(() => {
    if (mounted) return;
    if (paneSize.w === 0 || paneSize.h === 0 || natural.w === 0 || natural.h === 0) return;
    const fit = Math.min(paneSize.w / natural.w, paneSize.h / natural.h);
    setScale(fit);
    const { tx: nt, ty: ny } = clampPan(0, 0, fit);
    setTx(nt);
    setTy(ny);
    setMounted(true);
  }, [mounted, paneSize.w, paneSize.h, natural.w, natural.h, clampPan]);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const pane = paneRef.current;
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const clamped = clamp(nextScale, minScale, maxScale);
      const ratio = clamped / scale;
      const candidateTx = px - (px - tx) * ratio;
      const candidateTy = py - (py - ty) * ratio;
      const clampedPan = clampPan(candidateTx, candidateTy, clamped);
      setScale(clamped);
      setTx(clampedPan.tx);
      setTy(clampedPan.ty);
    },
    [scale, tx, ty, minScale, maxScale, clampPan],
  );

  // Centered zoom (for +/- buttons).
  const zoomCentered = useCallback(
    (factor: number) => {
      const pane = paneRef.current;
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * factor);
    },
    [zoomAt, scale],
  );

  const fit = useCallback(() => {
    if (paneSize.w === 0 || paneSize.h === 0 || natural.w === 0 || natural.h === 0) return;
    const fitScale = Math.min(paneSize.w / natural.w, paneSize.h / natural.h);
    setScale(fitScale);
    const { tx: nt, ty: ny } = clampPan(0, 0, fitScale);
    setTx(nt);
    setTy(ny);
  }, [paneSize.w, paneSize.h, natural.w, natural.h, clampPan]);

  // Wheel — zoom when ctrl/meta held or trackpad pinch (wheel with
  // ctrlKey is how macOS emits pinch to JS). Plain wheel over the pane
  // is blocked so the page doesn't scroll when the user expects to
  // interact with the diamond.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // deltaY negative = zoom in; positive = zoom out. macOS pinch
        // sends small deltas, mouse wheel sends multiples of 100.
        const intensity = Math.min(Math.abs(e.deltaY) * 0.01, 0.5);
        const factor = e.deltaY < 0 ? 1 + intensity : 1 - intensity;
        zoomAt(e.clientX, e.clientY, scale * factor);
      } else {
        // Block page scroll when the user expects to interact with the
        // diamond. If they want to scroll, they can do so elsewhere.
        e.preventDefault();
      }
    };
    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => pane.removeEventListener("wheel", onWheel);
  }, [zoomAt, scale]);

  // Pan — click-drag on pane background when zoomed past fit. Skip if
  // the target is interactive (card, button, etc.) so react-dnd and
  // button clicks still work.
  const panState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseTx: number;
    baseTy: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const canPan = scale > fitScale + 0.001;

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
      "button, a, input, textarea, select, [role='button'], [draggable='true']",
    );
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan) return;
    if (isInteractiveTarget(e.target)) return;
    if (e.button !== 0) return;
    const pane = paneRef.current;
    if (!pane) return;
    pane.setPointerCapture(e.pointerId);
    panState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseTx: tx,
      baseTy: ty,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = panState.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const clamped = clampPan(state.baseTx + dx, state.baseTy + dy, scale);
    setTx(clamped.tx);
    setTy(clamped.ty);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = panState.current;
    if (!state || state.pointerId !== e.pointerId) return;
    paneRef.current?.releasePointerCapture(e.pointerId);
    panState.current = null;
    setIsPanning(false);
  };

  return (
    <div
      ref={paneRef}
      className={cn(
        "relative flex-1 overflow-hidden",
        canPan && !isPanning && "cursor-grab",
        isPanning && "cursor-grabbing",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: naturalWidth ? `${naturalWidth}px` : "max-content",
          willChange: "transform",
        }}
        className="absolute top-0 left-0"
      >
        {children}
      </div>

      {/* Control cluster — top-right, floating. */}
      <div className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
        <div className="pointer-events-auto flex overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-md">
          <button
            type="button"
            onClick={() => zoomCentered(ZOOM_STEP)}
            disabled={scale >= maxScale - 0.0001}
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center border-r border-[var(--border)] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomCentered(1 / ZOOM_STEP)}
            disabled={scale <= minScale + 0.0001}
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center border-r border-[var(--border)] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={fit}
            aria-label="Fit to view"
            className="flex h-7 w-7 items-center justify-center text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <Maximize2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <span className="pointer-events-none font-mono text-[10px] text-[var(--text-3)]">
          {Math.round((scale / fitScale) * 100)}%
        </span>
      </div>
    </div>
  );
}

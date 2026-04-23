"use client";

import { useEffect } from "react";

/**
 * Polish spec §96 (Phase 32) + §99 (Phase 33). Auto-scroll the left-
 * column scroll container when a drag is near the top or bottom of
 * the viewport.
 *
 * Context: the unified cards grid (CardsPanel) extends below the
 * fold. Users may drag a card from row 5 of the grid up to a lineup
 * slot at the top of the page. HTML5 drag-and-drop doesn't scroll
 * the parent container natively.
 *
 * Phase 33 change: after the shell got independent scroll containers
 * per column, the hook now targets `[data-scroll="lineup-main"]`
 * (the left column) instead of `<main>`. Dragging near the top or
 * bottom of the viewport scrolls just that column, leaving the
 * sidebar untouched.
 *
 * Implementation notes:
 *   - EDGE_ZONE = 80px from the viewport top/bottom triggers scroll.
 *   - SCROLL_SPEED = 14px per animation frame (≈ 840px/sec at 60fps).
 *   - Scrolling stops on `drop`, `dragend`, or when the pointer
 *     leaves both edge zones.
 *   - Works for native HTML5 DnD (react-dnd's HTML5Backend).
 *
 * No-op server-side via the useEffect gate.
 */
export function useAutoScrollOnDrag() {
  useEffect(() => {
    const EDGE_ZONE = 80;
    const SCROLL_SPEED = 14;

    let currentDirection: "up" | "down" | null = null;
    let rafId: number | null = null;
    let scrollContainer: HTMLElement | null = null;

    function getScrollContainer(): HTMLElement | null {
      if (scrollContainer?.isConnected) return scrollContainer;
      // Phase 33: scroll the left column, not <main>. The
      // LineupShell marks it with data-scroll="lineup-main".
      scrollContainer = document.querySelector<HTMLElement>('[data-scroll="lineup-main"]');
      return scrollContainer;
    }

    function tick() {
      const container = getScrollContainer();
      if (!container || currentDirection === null) {
        rafId = null;
        return;
      }
      const delta = currentDirection === "up" ? -SCROLL_SPEED : SCROLL_SPEED;
      container.scrollBy({ top: delta, behavior: "auto" });
      rafId = requestAnimationFrame(tick);
    }

    function ensureRaf() {
      if (rafId === null && currentDirection !== null) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function onDragOver(e: DragEvent) {
      const y = e.clientY;
      const vh = window.innerHeight;
      let direction: "up" | "down" | null = null;
      if (y < EDGE_ZONE) direction = "up";
      else if (y > vh - EDGE_ZONE) direction = "down";
      currentDirection = direction;
      ensureRaf();
    }

    function onEnd() {
      currentDirection = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onEnd);
    document.addEventListener("drop", onEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onEnd);
      document.removeEventListener("drop", onEnd);
      onEnd();
    };
  }, []);
}

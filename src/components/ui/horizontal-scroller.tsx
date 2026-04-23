"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Polish spec §70 (Phase 23). Horizontal scrolling row with explicit
 * left/right arrow buttons replacing the native horizontal scrollbar.
 *
 * Shared primitive used by BenchDrawer + TokenTray — two surfaces that
 * previously had `overflow-x-auto` native scrolls, which exposed the
 * browser's horizontal scroll indicator. User asked to hide that
 * indicator while keeping keyboard / touchpad scrolling available.
 *
 * Behavior:
 *   - Scrollbar hidden via `scrollbar-width: none` + webkit override
 *     on the inner scroll container.
 *   - `<` / `>` arrow buttons sit at the outer flex edges. Each click
 *     scrolls by the visible width of the inner container (page-
 *     style), not a per-card step.
 *   - Buttons auto-disable at the ends, via a scroll + ResizeObserver
 *     listener on the inner container.
 *   - Native wheel + touchpad + trackpad-two-finger scroll still work
 *     — `overflow-x-auto` stays on the inner container.
 *   - Arrows don't render at all when content fits (no overflow).
 *
 * Why not `overflow-hidden` + arrow-only: users with
 * trackpad/touchscreen input expect to be able to swipe; removing
 * that path would harm accessibility. This primitive keeps both
 * affordances and just hides the visual scrollbar chrome.
 */
type Props = {
  children: ReactNode;
  className?: string;
  /**
   * Class applied to the inner scroll container. Callers typically
   * want `gap-3 pb-1` or similar to control per-row spacing —
   * expressed here since callers were formerly applying those
   * classes directly to their `<div className="flex gap-3 overflow-
   * x-auto">` wrappers.
   */
  innerClassName?: string;
};

export function HorizontalScroller({ children, className, innerClassName }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const recompute = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const overflow = maxScroll > 1;
    setHasOverflow(overflow);
    setCanLeft(overflow && el.scrollLeft > 4);
    setCanRight(overflow && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    recompute();
    const el = innerRef.current;
    if (!el) return;
    el.addEventListener("scroll", recompute, { passive: true });
    // Handle both container resize (layout shifts) and children
    // growing / shrinking (bench filter changes → fewer cards).
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    for (const child of Array.from(el.children)) {
      ro.observe(child as Element);
    }
    return () => {
      el.removeEventListener("scroll", recompute);
      ro.disconnect();
    };
  }, [recompute]);

  // Re-run recompute when children identity changes (filter toggle on
  // the bench, token applied/removed, etc.). The ResizeObserver handles
  // dimension-driven updates; this covers count-only updates.
  useEffect(() => {
    recompute();
  }, [recompute]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = innerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={cn("relative flex items-stretch gap-1", className)}>
      <ScrollButton
        direction="left"
        disabled={!canLeft}
        visible={hasOverflow}
        onClick={() => scrollByPage(-1)}
      />
      <div
        ref={innerRef}
        className={cn(
          "flex min-w-0 flex-1 gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          innerClassName,
        )}
      >
        {children}
      </div>
      <ScrollButton
        direction="right"
        disabled={!canRight}
        visible={hasOverflow}
        onClick={() => scrollByPage(1)}
      />
    </div>
  );
}

function ScrollButton({
  direction,
  disabled,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  visible: boolean;
  onClick: () => void;
}) {
  // Reserve the space even when the arrow isn't visible, so the inner
  // scroll area doesn't resize the moment overflow appears / vanishes.
  // `invisible` preserves width; `hidden` would collapse it.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "inline-flex w-7 shrink-0 items-center justify-center self-center rounded-md border border-transparent text-[var(--text-3)] transition-colors",
        "hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-2)]",
        "disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-[var(--text-3)]",
        !visible && "pointer-events-none opacity-0",
      )}
    >
      {direction === "left" ? (
        <ChevronLeft className="h-4 w-4" aria-hidden />
      ) : (
        <ChevronRight className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}

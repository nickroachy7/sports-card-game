"use client";

import { useEffect } from "react";

/**
 * Polish spec §101 (Phase 34). Auto-fading scrollbar behavior.
 *
 * Any scrollable element tagged with `data-scroll="..."` hides its
 * scrollbar by default (see globals.css). This hook listens for
 * scroll events in the capture phase — so it catches scrolls on any
 * nested container, not just document — and toggles
 * `data-scrolling="true"` on the target element while it's actively
 * scrolling. The attribute is cleared ~700ms after the last scroll
 * tick, letting the thumb smoothly fade out via the CSS transition.
 *
 * Notes:
 *   - Capture-phase listener on document catches scroll events from
 *     any matching descendant (scroll doesn't bubble).
 *   - WeakMap of per-element hide timers so multiple scrollers can be
 *     active simultaneously (e.g. left column + right sidebar) without
 *     stepping on each other.
 *   - No-op server-side via the useEffect gate.
 */
export function useScrollFade() {
  useEffect(() => {
    const HIDE_MS = 700;
    const timers = new WeakMap<Element, number>();

    function onScroll(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.hasAttribute("data-scroll")) return;
      el.setAttribute("data-scrolling", "true");
      const existing = timers.get(el);
      if (existing !== undefined) clearTimeout(existing);
      const t = window.setTimeout(() => {
        el.removeAttribute("data-scrolling");
        timers.delete(el);
      }, HIDE_MS);
      timers.set(el, t);
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);
}

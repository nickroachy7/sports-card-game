"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Polish spec §29 (Phase 14) — 200ms cross-fade between two
 * sidebar branches (default content ↔ selected-card detail).
 *
 * Keyed on `modeKey` so `<AnimatePresence mode="wait">` animates
 * the exit of the old branch before mounting the new one. Same-
 * key re-renders don't re-animate.
 *
 * `prefers-reduced-motion: reduce` drops the wrapper entirely —
 * children render instantly. No alternate animation envelope, no
 * half-speed fallback; just the same snappy behavior the sidebar
 * had pre-Phase-14 for accessibility users.
 */

type Props = {
  /** Stable identifier for the current branch — typically `"detail"` vs
   *  `"default"`. When it changes, the cross-fade fires. */
  modeKey: string;
  children: ReactNode;
};

export function SidebarFadeSwap({ modeKey, children }: Props) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    // Render without AnimatePresence — snap semantics.
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={modeKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

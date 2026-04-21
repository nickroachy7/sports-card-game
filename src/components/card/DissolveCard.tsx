"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Polish spec §1 Scope #3 — dissolve physics (quick-sell + season-end
 * vault dissolve). Wraps any card-shaped child and plays the shared
 * dissolve vocabulary when `active` flips true:
 *
 *   - drifts down ~40px
 *   - desaturates via filter
 *   - fades to 0 opacity
 *
 * Duration: ~600ms with a slight ease-in so the card "slumps" rather
 * than linearly fades. Honors prefers-reduced-motion by jumping to
 * the end state instantly (no animation). Fires `onComplete` when the
 * exit animation finishes — callers use it to navigate / unmount.
 */
export function DissolveCard({
  active,
  onComplete,
  children,
  delay = 0,
}: {
  active: boolean;
  onComplete?: () => void;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={false}
      animate={
        active
          ? {
              y: 40,
              opacity: 0,
              filter: "saturate(0.15) blur(2px)",
              scale: 0.96,
              transition: { duration: 0.6, delay, ease: [0.4, 0, 0.9, 0.3] },
            }
          : {
              y: 0,
              opacity: 1,
              filter: "saturate(1) blur(0px)",
              scale: 1,
              transition: { duration: 0 },
            }
      }
      onAnimationComplete={(def) => {
        if (active && typeof def === "object") onComplete?.();
      }}
      style={{ willChange: "transform, opacity, filter" }}
    >
      {children}
    </motion.div>
  );
}

"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useLatestPlayerEvent } from "@/components/lineup/LiveEventsProvider";

/**
 * Polish spec §21 — per-slot FP glow.
 *
 * Overlay that reads the latest event for a slot's rostered player
 * and plays a short motion whenever `event.id` changes: colored
 * halo (emerald for positive delta, rose for negative) + floating
 * `±N.N` pill above the slot. Zero-delta events do nothing.
 *
 * Must be rendered inside a `position: relative` parent — the halo
 * + pill are absolutely positioned within that box.
 *
 * Rendered only post-submit (LineupSlot gates on `locked` via its
 * `enabled` prop). Building / unsubmitted states return null even
 * if the provider is mounted, because no events will be routing
 * there.
 *
 * Respects `prefers-reduced-motion: reduce` — skips the animation
 * entirely. The Event Feed remains the source of truth for
 * reduced-motion users.
 */

const DURATION_MS = 1200;
const HALO_PEAK_OPACITY = 0.6;

type Props = {
  playerId: string | null;
  enabled: boolean;
};

export function SlotFpGlow({ playerId, enabled }: Props) {
  const event = useLatestPlayerEvent(playerId);
  const prefersReducedMotion = useReducedMotion();

  if (!enabled || !event || event.delta === 0 || prefersReducedMotion) return null;

  const positive = event.delta > 0;
  const haloColor = positive ? "rgba(52, 211, 153, 1)" : "rgba(196, 114, 98, 1)"; // emerald-400 / rose-ish

  return (
    <AnimatePresence>
      <motion.div key={event.id} aria-hidden className="pointer-events-none absolute inset-0">
        {/* Halo: scales outward from the slot edge, fades 0 → peak → 0. */}
        <motion.div
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: [0, HALO_PEAK_OPACITY, 0],
            scale: [1, 1.15, 1.22],
          }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeOut" }}
          className="absolute inset-0 rounded-md"
          style={{
            boxShadow: `0 0 24px 4px ${haloColor}`,
            // The card slot has rounded-md (0.375rem) — match so the
            // glow traces the slot's silhouette, not a rectangle.
          }}
        />

        {/* Floating delta pill above the slot. */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 0, y: -16 }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeOut" }}
          className="-top-5 absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums"
          style={{
            color: positive ? "rgb(52, 211, 153)" : "rgb(196, 114, 98)",
            background: "rgba(0, 0, 0, 0.65)",
          }}
        >
          {fmtDelta(event.delta)}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function fmtDelta(d: number): string {
  if (d > 0) return `+${d.toFixed(1)}`;
  return d.toFixed(1);
}

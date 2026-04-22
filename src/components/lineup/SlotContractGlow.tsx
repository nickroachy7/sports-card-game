"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { ContractDeplete } from "@/components/lineup/CardContractEventsProvider";

/**
 * Polish spec §30 — per-slot contract-depletion glow.
 *
 * When a rostered card's contract_plays_remaining decrements,
 * the corresponding slot briefly pulses amber with a floating
 * "-1 play" pill. Sibling to <SlotFpGlow> (Phase 12); both can
 * fire on the same slot in the same tick without visual
 * conflict.
 *
 * Parent must have `position: relative` — halo + pill are
 * absolutely positioned inside the slot box.
 *
 * Reduced motion returns null entirely — the Event Feed + Box
 * Score narrate the decrement textually.
 */

const DURATION_MS = 1000;
const HALO_PEAK_OPACITY = 0.5;
// `#D4A647` is the contract-bar "low" color in contractColor helper —
// a play used is expected-narrative, not alarming. Amber feels right.
const HALO_COLOR = "rgba(212, 166, 71, 1)";
const PILL_FG = "rgb(212, 166, 71)";

type Props = {
  depleteEvent: ContractDeplete | null;
  enabled: boolean;
};

export function SlotContractGlow({ depleteEvent, enabled }: Props) {
  const prefersReducedMotion = useReducedMotion();

  if (!enabled || !depleteEvent || prefersReducedMotion) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={depleteEvent.at}
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        {/* Halo — amber, slightly softer than the FP glow so they
            composite cleanly when both fire on the same tick. */}
        <motion.div
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: [0, HALO_PEAK_OPACITY, 0],
            scale: [1, 1.12, 1.18],
          }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeOut" }}
          className="absolute inset-0 rounded-md"
          style={{ boxShadow: `0 0 20px 3px ${HALO_COLOR}` }}
        />

        {/* Floating "-1 play" pill. Sits slightly lower than the
            FP glow's +/- delta pill so both are readable when
            they fire together. */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 0, y: -12 }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeOut" }}
          className="-top-1 absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 font-mono font-semibold text-[10px] tabular-nums"
          style={{
            color: PILL_FG,
            background: "rgba(0, 0, 0, 0.65)",
          }}
        >
          −1 play
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

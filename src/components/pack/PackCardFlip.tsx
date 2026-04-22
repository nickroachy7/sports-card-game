"use client";

import { motion, useReducedMotion } from "motion/react";

import type { RevealedCard } from "@/app/actions/packs-reveal";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";

/**
 * Polish spec §10 — a single face-down → face-up card flip.
 *
 * At rest face-down: tier-agnostic card back with the brand mark.
 * On `faceUp=true`: 180° Y-rotation, ~350ms spring. After the spring
 * settles, the card face shows; the `StarPullBurst` overlay (handled
 * by the parent) kicks off if the player warrants a celebration.
 *
 * The flip is a parent-controlled prop so the reveal orchestrator
 * handles sequencing. Clicking the card fires `onFlip` when still
 * face-down and `onComplete` after the flip settles.
 */

type Props = {
  card: RevealedCard;
  faceUp: boolean;
  onFlip: () => void;
  onComplete?: () => void;
  dimmedWhenResolved?: boolean;
  resolved?: boolean;
};

const FLIP_SPRING = { type: "spring" as const, stiffness: 260, damping: 24, mass: 1 };

export function PackCardFlip({
  card,
  faceUp,
  onFlip,
  onComplete,
  dimmedWhenResolved,
  resolved,
}: Props) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      onClick={() => !faceUp && onFlip()}
      className={cn(
        "relative block appearance-none border-0 bg-transparent p-0",
        !faceUp && "cursor-pointer",
        dimmedWhenResolved && resolved && "opacity-50",
      )}
      style={{ width: 160, height: 224, perspective: 1000 }}
      aria-label={faceUp ? `${card.playerName} revealed` : "Tap to reveal card"}
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: faceUp ? 180 : 0 }}
        transition={reduced ? { duration: 0 } : FLIP_SPRING}
        onAnimationComplete={() => {
          if (faceUp) onComplete?.();
        }}
      >
        {/* Face-down card back. */}
        <div className="absolute inset-0 rounded-[10px]" style={{ backfaceVisibility: "hidden" }}>
          <CardBack />
        </div>
        {/* Face-up — real card, rotated so it reads correctly after flip. */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <Card card={card} size="medium" />
        </div>
      </motion.div>
    </button>
  );
}

/**
 * Face-down card back — tier-gold gradient frame, "DD" brand mark.
 * Intentionally austere so the reveal's flip-to-face is the moment,
 * not the back.
 */
function CardBack() {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[10px]"
      style={{
        background: "linear-gradient(135deg, #D4A647 0%, #8A6422 50%, #D4A647 100%)",
        border: "4px solid #D4A647",
      }}
    >
      <div
        className="absolute inset-[6px] rounded-[6px]"
        style={{ backgroundColor: "var(--surface)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-sans font-bold tracking-[0.4em] text-[var(--tier-gold,#D4A647)]"
          style={{ fontSize: 36 }}
        >
          DD
        </span>
      </div>
    </div>
  );
}

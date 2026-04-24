"use client";

import { motion, useReducedMotion } from "motion/react";

import type { RevealedCard } from "@/app/actions/packs-reveal";
import { Card, type CardSize } from "@/components/card/Card";
import { cn } from "@/lib/utils";

/**
 * Polish spec §10 → §155 (Phase 44) — a single face-down → face-up
 * card flip, sized to match its neighbors.
 *
 * At rest face-down: tier-agnostic card back with the brand mark.
 * On `faceUp=true`: 180° Y-rotation, ~350ms spring. After the spring
 * settles, the card face shows; the `StarPullBurst` overlay (handled
 * by the parent) kicks off if the player warrants a celebration.
 *
 * The flip is a parent-controlled prop so the reveal orchestrator
 * handles sequencing. Clicking the card fires `onFlip` when still
 * face-down and `onComplete` after the flip settles.
 *
 * Phase 44 added the `size` prop so the reveal row can ask for
 * lineup-size (120×168) cards. Other callers fall back to medium.
 */

type Props = {
  card: RevealedCard;
  faceUp: boolean;
  onFlip: () => void;
  onComplete?: () => void;
  dimmedWhenResolved?: boolean;
  resolved?: boolean;
  size?: CardSize;
};

type SizeSpec = { width: number; height: number; radius: number; border: number; backFont: number };

const SIZE_SPECS: Record<CardSize, SizeSpec> = {
  small: { width: 96, height: 134, radius: 6, border: 3, backFont: 22 },
  lineup: { width: 120, height: 168, radius: 8, border: 4, backFont: 28 },
  medium: { width: 160, height: 224, radius: 10, border: 4, backFont: 36 },
  large: { width: 320, height: 448, radius: 16, border: 7, backFont: 72 },
};

const FLIP_SPRING = { type: "spring" as const, stiffness: 260, damping: 24, mass: 1 };

export function PackCardFlip({
  card,
  faceUp,
  onFlip,
  onComplete,
  dimmedWhenResolved,
  resolved,
  size = "medium",
}: Props) {
  const reduced = useReducedMotion();
  const spec = SIZE_SPECS[size];

  return (
    <button
      type="button"
      onClick={() => !faceUp && onFlip()}
      className={cn(
        "relative block appearance-none border-0 bg-transparent p-0",
        !faceUp && "cursor-pointer",
        dimmedWhenResolved && resolved && "opacity-50",
      )}
      style={{ width: spec.width, height: spec.height, perspective: 1000 }}
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
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", borderRadius: spec.radius }}
        >
          <CardBack radius={spec.radius} border={spec.border} fontSize={spec.backFont} />
        </div>
        {/* Face-up — real card, rotated so it reads correctly after flip. */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <Card card={card} size={size} />
        </div>
      </motion.div>
    </button>
  );
}

/**
 * Face-down card back — tier-gold gradient frame, "DD" brand mark.
 * Intentionally austere so the reveal's flip-to-face is the moment,
 * not the back. Sized proportionally to the card so the brand mark
 * doesn't dwarf smaller reveals.
 */
function CardBack({
  radius,
  border,
  fontSize,
}: {
  radius: number;
  border: number;
  fontSize: number;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #D4A647 0%, #8A6422 50%, #D4A647 100%)",
        border: `${border}px solid #D4A647`,
        borderRadius: radius,
      }}
    >
      <div
        className="absolute"
        style={{
          inset: border + 2,
          backgroundColor: "var(--surface)",
          borderRadius: Math.max(radius - 2, 2),
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold font-sans tracking-[0.4em] text-[var(--tier-gold,#D4A647)]"
          style={{ fontSize }}
        >
          DD
        </span>
      </div>
    </div>
  );
}

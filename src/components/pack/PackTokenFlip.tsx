"use client";

import { motion, useReducedMotion } from "motion/react";

import { TokenBadge } from "@/components/token/TokenBadge";
import type { TokenType } from "@/lib/contracts/cards";
import { TOKEN_LONG_LABEL } from "@/lib/token/display";
import { cn } from "@/lib/utils";

/**
 * Polish spec §198 (Phase 49 Wave 2) — pack reveal flip for tokens.
 *
 * Matches PackCardFlip's 3D-Y-rotation spring but at chip dimensions
 * (~80px square) instead of card dimensions. Face-down: dark circular
 * back with the brand mark. Face-up: TokenBadge centered, with type
 * label below.
 *
 * Pending tokens (granted while user was at cap) flip the same way
 * but display a small "WILL RESOLVE" tag below — the resolve modal
 * appears after all packs finish revealing (§199).
 */

type Props = {
  tokenType: TokenType;
  bonusFp: number;
  /** When true, the token came from the overflow path; reveal pill
   *  reads "WILL RESOLVE" instead of "BONUS TOKEN". */
  isPending: boolean;
  faceUp: boolean;
  onFlip: () => void;
  onComplete?: () => void;
};

const FLIP_SPRING = { type: "spring" as const, stiffness: 260, damping: 24, mass: 1 };
const SIZE = 88;

export function PackTokenFlip({
  tokenType,
  bonusFp,
  isPending,
  faceUp,
  onFlip,
  onComplete,
}: Props) {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => !faceUp && onFlip()}
        className={cn(
          "relative block appearance-none border-0 bg-transparent p-0",
          !faceUp && "cursor-pointer",
        )}
        style={{ width: SIZE, height: SIZE, perspective: 1000 }}
        aria-label={
          faceUp ? `${TOKEN_LONG_LABEL[tokenType]} token revealed` : "Tap to reveal token"
        }
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
          {/* Face-down token back. */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full border-2",
              "border-[var(--tier-gold)]/40 bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface-3)]",
              "font-mono text-[var(--tier-gold)] text-2xl",
            )}
            style={{ backfaceVisibility: "hidden" }}
          >
            ?
          </div>
          {/* Face-up token. Counter-rotated 180° so the contents read
              correctly after the parent's Y-rotation. */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <TokenBadge
              tokenType={tokenType}
              bonusFp={bonusFp}
              size="tray"
              dim={false}
              isDragging={false}
            />
          </div>
        </motion.div>
      </button>
      {/* Subtitle pill below — only renders once flipped. */}
      {faceUp && (
        <span
          className={cn(
            "whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider",
            isPending
              ? "border-[#D4A647]/60 bg-[#D4A647]/10 text-[#D4A647]"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]",
          )}
        >
          {isPending ? "Will Resolve" : "Bonus Token"}
        </span>
      )}
    </div>
  );
}

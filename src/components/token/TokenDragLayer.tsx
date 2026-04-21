"use client";

import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDragLayer } from "react-dnd";

import { dragResult } from "@/components/card/drag-layer-state";
import { DRAG_TYPES, type TokenDragItem } from "@/components/lineup/drag-types";
import type { TokenType } from "@/lib/contracts/cards";

import { TokenBadge } from "./TokenBadge";

/**
 * Token motion ghost — mirrors CardDragLayer's iOS-snappy spring,
 * scaled for the token pip. Separate layer (vs. generalizing
 * CardDragLayer) because the ghost is a different component; ADR-0011
 * noted that duplicating one small layer is cheaper than generalizing.
 *
 * Polish spec §5 Motion.
 */

type TokenMeta = {
  tokenType: TokenType;
  bonusFp: number;
};

type Props = {
  resolveToken: (tokenId: string) => TokenMeta | null;
};

const SPRING = { stiffness: 400, damping: 30, mass: 1 } as const;
const REDUCED_SPRING = { stiffness: 10000, damping: 200, mass: 1 } as const;

export function TokenDragLayer({ resolveToken }: Props) {
  const reduced = useReducedMotion();
  const spring = reduced ? REDUCED_SPRING : SPRING;

  const { isDragging, item, currentOffset, initialSourceOffset } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging() && monitor.getItemType() === DRAG_TYPES.TOKEN,
    item: monitor.getItem() as TokenDragItem | null,
    currentOffset: monitor.getClientOffset(),
    initialSourceOffset: monitor.getInitialSourceClientOffset(),
  }));

  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const scale = useSpring(1, spring);

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const prevIsDragging = useRef(false);
  const [bounce, setBounce] = useState<{
    meta: TokenMeta;
    from: { x: number; y: number };
    to: { x: number; y: number };
    key: number;
  } | null>(null);

  useEffect(() => {
    if (isDragging && !prevIsDragging.current) {
      if (initialSourceOffset) {
        x.jump(initialSourceOffset.x);
        y.jump(initialSourceOffset.y);
      }
      scale.set(reduced ? 1 : 1.08);
    } else if (!isDragging && prevIsDragging.current) {
      if (!dragResult.lastDropAccepted && lastPointer.current && initialSourceOffset && item) {
        const meta = resolveToken(item.tokenId);
        if (meta) {
          setBounce({
            meta,
            from: lastPointer.current,
            to: initialSourceOffset,
            key: Date.now(),
          });
        }
      }
      scale.set(1);
    }
    prevIsDragging.current = isDragging;
  }, [isDragging, item, initialSourceOffset, resolveToken, reduced, x, y, scale]);

  useEffect(() => {
    if (!currentOffset) return;
    x.set(currentOffset.x);
    y.set(currentOffset.y);
    lastPointer.current = { x: currentOffset.x, y: currentOffset.y };
  }, [currentOffset, x, y]);

  const draggedMeta = isDragging && item ? resolveToken(item.tokenId) : null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
      style={{ willChange: "transform" }}
    >
      {draggedMeta && (
        <motion.div style={{ position: "absolute", top: 0, left: 0, x, y, scale }}>
          <div style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>
            <TokenBadge
              tokenType={draggedMeta.tokenType}
              bonusFp={draggedMeta.bonusFp}
              size="tray"
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {bounce && !reduced && (
          <BounceBack
            key={bounce.key}
            meta={bounce.meta}
            from={bounce.from}
            to={bounce.to}
            onComplete={() => setBounce(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

type BounceBackProps = {
  meta: TokenMeta;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onComplete: () => void;
};

function BounceBack({ meta, from, to, onComplete }: BounceBackProps) {
  const motionProps: HTMLMotionProps<"div"> = {
    initial: { x: from.x, y: from.y, opacity: 1 },
    animate: {
      x: [from.x, to.x, to.x - 5, to.x + 5, to.x - 2, to.x + 2, to.x],
      y: [from.y, to.y, to.y, to.y, to.y, to.y, to.y],
      transition: {
        x: {
          times: [0, 0.55, 0.68, 0.8, 0.9, 0.96, 1],
          duration: 0.5,
          ease: ["easeOut", "linear", "linear", "linear", "linear", "linear"],
        },
        y: { duration: 0.5, ease: "easeOut" },
      },
    },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  };
  return (
    <motion.div
      {...motionProps}
      onAnimationComplete={onComplete}
      style={{ position: "absolute", top: 0, left: 0, willChange: "transform" }}
    >
      <TokenBadge tokenType={meta.tokenType} bonusFp={meta.bonusFp} size="tray" />
    </motion.div>
  );
}

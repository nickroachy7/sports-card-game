"use client";

import { AnimatePresence, type HTMLMotionProps, motion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDragLayer } from "react-dnd";

import { Card } from "@/components/card/Card";
import type { LineupCardVM } from "@/lib/lineup/types";

import { dragResult } from "./drag-layer-state";
import { type CardDragItem, DRAG_TYPES } from "./drag-types";

/**
 * Polish spec §1 — physical card motion for any card-movement surface.
 *
 * react-dnd keeps hit-testing + drop-target logic; this layer owns the
 * visuals. When a card-type drag is in flight, we render the real <Card>
 * at the cursor with an iOS-snappy spring (stiffness 400, damping 30)
 * and a 3° max tilt from cursor velocity. The source component
 * (BenchCard / LineupSlot) suppresses the default HTML5 ghost via
 * getEmptyImage, so this layer's render IS the drag ghost.
 *
 * On a cancelled drop (released over empty space or an invalid slot),
 * the card bounces back to the source origin with a short horizontal
 * shake — §1 Behavior table "Drop on invalid."
 */

type Props = {
  /** Resolver from a cardId to the ViewModel the layer needs to render. */
  resolveCard: (cardId: string) => LineupCardVM | null;
};

const SPRING = { stiffness: 400, damping: 30, mass: 1 } as const;

export function CardDragLayer({ resolveCard }: Props) {
  const { isDragging, item, currentOffset, initialSourceOffset } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging() && monitor.getItemType() === DRAG_TYPES.CARD,
    item: monitor.getItem() as CardDragItem | null,
    currentOffset: monitor.getClientOffset(),
    initialSourceOffset: monitor.getInitialSourceClientOffset(),
  }));

  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const scale = useSpring(1, SPRING);
  const rotate = useSpring(0, SPRING);

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const prevIsDragging = useRef(false);
  const [bounce, setBounce] = useState<{
    card: LineupCardVM;
    from: { x: number; y: number };
    to: { x: number; y: number };
    key: number;
  } | null>(null);

  // Enter / exit transitions (side-effects on spring values).
  useEffect(() => {
    if (isDragging && !prevIsDragging.current) {
      // Pick-up: jump to the card's rest position so the spring doesn't
      // animate from (0,0), then scale up.
      if (initialSourceOffset) {
        x.jump(initialSourceOffset.x);
        y.jump(initialSourceOffset.y);
      }
      scale.set(1.03);
    } else if (!isDragging && prevIsDragging.current) {
      // Drop — bounce back if the drop was cancelled and we have both
      // the last pointer position and a known origin.
      if (!dragResult.lastDropAccepted && lastPointer.current && initialSourceOffset && item) {
        const card = resolveCard(item.cardId);
        if (card) {
          setBounce({
            card,
            from: lastPointer.current,
            to: initialSourceOffset,
            key: Date.now(),
          });
        }
      }
      scale.set(1);
      rotate.set(0);
    }
    prevIsDragging.current = isDragging;
  }, [isDragging, item, initialSourceOffset, resolveCard, x, y, scale, rotate]);

  // Follow the pointer. Small 0.003 tilt coefficient keeps the tilt
  // subtle — max ±3° on a fast drag, invisible at rest per spec.
  useEffect(() => {
    if (!currentOffset) return;
    x.set(currentOffset.x);
    y.set(currentOffset.y);
    const vx = x.getVelocity();
    rotate.set(Math.max(-3, Math.min(3, vx * 0.003)));
    lastPointer.current = { x: currentOffset.x, y: currentOffset.y };
  }, [currentOffset, x, y, rotate]);

  const item_ = item;
  const draggedCard = isDragging && item_ ? resolveCard(item_.cardId) : null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
      style={{ willChange: "transform" }}
    >
      {draggedCard && (
        <motion.div style={{ position: "absolute", top: 0, left: 0, x, y, scale, rotate }}>
          <div style={{ filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.55))" }}>
            <Card card={draggedCard} size="small" />
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {bounce && (
          <BounceBack
            key={bounce.key}
            card={bounce.card}
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
  card: LineupCardVM;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onComplete: () => void;
};

function BounceBack({ card, from, to, onComplete }: BounceBackProps) {
  const motionProps: HTMLMotionProps<"div"> = {
    initial: { x: from.x, y: from.y, opacity: 1 },
    animate: {
      x: [from.x, to.x, to.x - 6, to.x + 6, to.x - 3, to.x + 3, to.x],
      y: [from.y, to.y, to.y, to.y, to.y, to.y, to.y],
      transition: {
        x: {
          times: [0, 0.55, 0.68, 0.8, 0.9, 0.96, 1],
          duration: 0.55,
          ease: ["easeOut", "linear", "linear", "linear", "linear", "linear"],
        },
        y: { duration: 0.55, ease: "easeOut" },
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
      <Card card={card} size="small" />
    </motion.div>
  );
}

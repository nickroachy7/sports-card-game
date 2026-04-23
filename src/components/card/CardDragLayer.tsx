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

import { Card, type CardViewModel } from "@/components/card/Card";

import { dragResult } from "./drag-layer-state";

/**
 * Polish spec §1 — physical card motion for any card-movement surface.
 *
 * react-dnd keeps hit-testing + drop-target logic; this layer owns the
 * visuals. When a card-type drag is in flight, we render the real <Card>
 * at the cursor with an iOS-snappy spring (stiffness 400, damping 30)
 * and a 3° max tilt from cursor velocity. The source component
 * (BenchCard / LineupSlot / vault CardThumb) suppresses the default
 * HTML5 ghost via getEmptyImage, so this layer's render IS the drag
 * ghost.
 *
 * On a cancelled drop (released over empty space or an invalid target),
 * the card bounces back to the source origin with a short horizontal
 * shake — §1 Behavior table "Drop on invalid."
 *
 * Domain-agnostic: `accepts` is the react-dnd drag-type string (or
 * array) this instance should react to; `resolveCard` maps the drag
 * item's cardId to a CardViewModel. Lineup and vault each mount their
 * own instance inside their own DndProvider tree.
 */

type Accepts = string | string[];

type DragItemShape = { cardId: string };

type Props = {
  accepts: Accepts;
  resolveCard: (cardId: string) => CardViewModel | null;
};

// Polish spec §116 (Phase 38). Spring tightened: stiffer + lighter
// mass = less trailing, more "held-in-hand" feel. Damping nudged up
// so the tighter spring still settles cleanly on stop.
const SPRING = { stiffness: 700, damping: 34, mass: 0.7 } as const;
// Reduced-motion: stiffer, damped-critical spring jumps to the target
// essentially instantly — no trailing, no tilt, no shake.
const REDUCED_SPRING = { stiffness: 10000, damping: 200, mass: 1 } as const;

function matches(typeHere: string | symbol | null, accepts: Accepts): boolean {
  if (typeof typeHere !== "string") return false;
  return Array.isArray(accepts) ? accepts.includes(typeHere) : accepts === typeHere;
}

export function CardDragLayer({ accepts, resolveCard }: Props) {
  const reduced = useReducedMotion();
  const spring = reduced ? REDUCED_SPRING : SPRING;

  const { isDragging, item, currentOffset, initialSourceOffset } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging() && matches(monitor.getItemType(), accepts),
    item: monitor.getItem() as DragItemShape | null,
    currentOffset: monitor.getClientOffset(),
    initialSourceOffset: monitor.getInitialSourceClientOffset(),
  }));

  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const scale = useSpring(1, spring);
  const rotate = useSpring(0, spring);

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const prevIsDragging = useRef(false);
  const [bounce, setBounce] = useState<{
    card: CardViewModel;
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
      scale.set(reduced ? 1 : 1.03);
    } else if (!isDragging && prevIsDragging.current) {
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
  }, [isDragging, item, initialSourceOffset, resolveCard, reduced, x, y, scale, rotate]);

  useEffect(() => {
    if (!currentOffset) return;
    x.set(currentOffset.x);
    y.set(currentOffset.y);
    if (!reduced) {
      // Phase 38: slightly bumped velocity coefficient so the tilt
      // reacts to fast drags; still capped ±3°.
      const vx = x.getVelocity();
      rotate.set(Math.max(-3, Math.min(3, vx * 0.004)));
    }
    lastPointer.current = { x: currentOffset.x, y: currentOffset.y };
  }, [currentOffset, reduced, x, y, rotate]);

  const draggedCard = isDragging && item ? resolveCard(item.cardId) : null;

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
        {bounce && !reduced && (
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
  card: CardViewModel;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onComplete: () => void;
};

/**
 * Polish spec §118 (Phase 38). Fast 150ms snap-back on invalid
 * drop. Old version used a 0.55s shake that felt sluggish; now
 * it's a short easeOut straight from last-pointer to source,
 * with a 60ms fade so the ghost doesn't linger at the origin.
 */
function BounceBack({ card, from, to, onComplete }: BounceBackProps) {
  const motionProps: HTMLMotionProps<"div"> = {
    initial: { x: from.x, y: from.y, opacity: 1 },
    animate: {
      x: to.x,
      y: to.y,
      transition: { duration: 0.15, ease: "easeOut" },
    },
    exit: { opacity: 0, transition: { duration: 0.06 } },
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

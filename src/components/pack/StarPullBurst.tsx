"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import type { PlayerValueTier } from "@/app/actions/packs-reveal";

/**
 * Polish spec §10 — star-pull celebration.
 *
 * Wraps the freshly-flipped card and fires a celebration if the
 * player's value tier is `'star'` or `'starter'`. Reduced-motion
 * downgrades to a single instantaneous ring-pulse with no scale
 * change.
 *
 *   star:    hero-scale 1.4 + 8 radial particles + screen-darken.
 *   starter: hero-scale 1.15 + tier-frame glow pulse.
 *   other:   no effect (pass-through).
 *
 * Celebration does NOT block the tap-through — parent can dismiss /
 * advance while the animation is still settling.
 */

type Props = {
  active: boolean;
  tier: PlayerValueTier;
  children: ReactNode;
};

const SCALE_SPRING = { type: "spring" as const, stiffness: 300, damping: 22, mass: 1 };

export function StarPullBurst({ active, tier, children }: Props) {
  const reduced = useReducedMotion();

  // Only star + starter trigger. role + prospect are normal flips.
  const variant = tier === "star" || tier === "starter" ? tier : "none";

  return (
    <div className="relative inline-block">
      {/* Screen-darken for star tier only. Sits behind the card to
          spotlight it. Fades in on celebration start. */}
      <AnimatePresence>
        {active && variant === "star" && !reduced && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-40"
            style={{
              background: "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.55) 60%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Card hero scale. Star = 1.4, starter = 1.15, others = 1. */}
      <motion.div
        className="relative z-50"
        animate={{
          scale:
            active && !reduced ? (variant === "star" ? 1.4 : variant === "starter" ? 1.15 : 1) : 1,
        }}
        transition={SCALE_SPRING}
      >
        {children}

        {/* Starter tier: gold glow pulse along the frame. */}
        <AnimatePresence>
          {active && variant === "starter" && !reduced && (
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-[10px]"
              style={{
                boxShadow: "0 0 0 0 rgba(212,166,71,0.9), 0 0 30px 10px rgba(212,166,71,0.5)",
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 1, 0.6, 1, 0],
                boxShadow: [
                  "0 0 0 0 rgba(212,166,71,0)",
                  "0 0 30px 12px rgba(212,166,71,0.7)",
                  "0 0 20px 8px rgba(212,166,71,0.45)",
                  "0 0 32px 14px rgba(212,166,71,0.6)",
                  "0 0 0 0 rgba(212,166,71,0)",
                ],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        {/* Star tier: dust-puff particles that radiate out from
            behind the card. Motion layer spawns N particles with
            randomized velocity vectors; they fade + shrink over
            ~500ms. */}
        <AnimatePresence>
          {active && variant === "star" && !reduced && (
            <Particles key="star-particles" count={12} />
          )}
        </AnimatePresence>

        {/* Reduced-motion substitute: instant ring pulse, no scale. */}
        {active && reduced && (variant === "star" || variant === "starter") && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[10px]"
            style={{ boxShadow: "0 0 0 3px rgba(212,166,71,0.8)" }}
          />
        )}
      </motion.div>
    </div>
  );
}

function Particles({ count }: { count: number }) {
  // Pre-compute particle vectors so each particle has a stable trajectory.
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const distance = 120 + Math.random() * 80;
    return {
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 6 + Math.random() * 6,
    };
  });
  return (
    <>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="pointer-events-none absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: "rgba(212,166,71,0.85)",
            filter: "blur(1px)",
            translateX: "-50%",
            translateY: "-50%",
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0], x: p.dx, y: p.dy, scale: [0.3, 1, 0.1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

# Draft Deck — Phase 6 Roadmap (Feel Pass v1.1)

**Goal:** Ship the first batch of post-Phase-5 polish — the work that
makes the app stop feeling like a functional prototype and start feeling
like something a real collector would want to handle. Scoped to the two
features locked in `draft-deck-polish-spec.md` (physical card motion,
rich lineup card). Additional polish batches get their own phases.

**Estimated effort:** 4–6 days of focused solo engineering, with P6.1
as the largest single slice (visual redesign) and P6.2 as the most
technically involved (motion seam).

**Prerequisites:**
- Phase 5 shipped (ADR-0010).
- `motion` 12.38 and `react-dnd` 16 already in the locked stack.
- `draft-deck-polish-spec.md` read — both features and shared impl
  notes inform order.

---

## Milestones

| ID  | Milestone                               | Target | Outcome |
|-----|-----------------------------------------|--------|---------|
| P6.1 | Rich Small card redesign                | 1 day | Small cards on lineup + bench + vault-selection show tier, position, team, contract pips, dual FP, token indicator, status pill, name. No motion changes. |
| P6.2 | Motion foundation + lineup drag physics | 1.5 days | `useCardDrag` hook wraps motion + react-dnd. Lineup pick-up / drag / drop / invalid-bounce language lives. Bench ↔ slot, slot ↔ slot, slot ↔ bench. |
| P6.3 | Pack arrival + dissolve physics         | 1 day | Pack opening reveal uses the new spring language (no more flat flip). Quick-sell + season-end dissolve upgraded to a coherent motion vocabulary. |
| P6.4 | Vault selection drag                    | 0.5 day | Vault ceremony drag-into-dropzone replaces tap-toggle (tap stays as fallback). |
| P6.5 | Reduced-motion, E2E, ADR                | 1 day | `prefers-reduced-motion` swap. Playwright scenario for lineup build + drag-drop-settle. ADR-0011 retro. |

---

## P6.1 — Rich Small card redesign (Day 1)

### T6.1.1 Extend `CardViewModel` for season FP
- **What:** Add `seasonFp` field to `src/lib/contracts/cards.ts`
  `CardViewModel`, fed from the card's per-season aggregate. Derive
  from `card.career_fp_total - snapshot_at_season_start`; snapshot
  can live in `economy_config` or be computed on the fly.
- **Acceptance:** `seasonFp` surfaces on every call site that builds
  a `CardViewModel` (Collection, Lineup, Bench, Vault selection).
- **Spec refs:** polish spec §2 "Dual FP."

### T6.1.2 Redesign `<Card size="small">` face
- **What:** Rework `src/components/card/Card.tsx` Small branch per
  polish spec §2 layout. Preserve Medium + Large exactly as they are.
- **Pieces:**
  - Position chip (top-left)
  - Team abbreviation (top-right)
  - Photo / initials fallback (middle)
  - Status pill overlay for IL / DFA / expired
  - 15-dot contract pip row
  - Dual FP (season / career)
  - Token slot indicator
  - Last-name-only with graceful fallback
- **Acceptance:**
  - Storybook / palette page renders a full 8-state matrix (tier ×
    status × token-applied) at 96×134 and everything fits.
  - No layout regression on Collection (uses Medium) or Card Detail
    (uses Large).
  - `pnpm typecheck` + `pnpm lint` clean.
- **Spec refs:** polish spec §2; UI/UX spec §4.11.1.

### T6.1.3 Port to bench drawer + vault selection
- **What:** `src/components/lineup/BenchCard.tsx` and
  `src/components/vault/VaultCeremony.tsx` `CardThumb` swap to the
  shared Rich Small card. Remove their bespoke initials-only
  renderers.
- **Acceptance:** Visual parity across diamond, bench, and vault
  selection — same card, same density.

---

## P6.2 — Motion foundation + lineup drag physics (Day 2–3)

### T6.2.1 `useCardDrag` hook
- **What:** `src/hooks/useCardDrag.ts` that composes `react-dnd`
  (hit-testing, drop target validity) with `motion`'s
  `useDragControls` + `animate()` (render-side spring). Exposes
  `{ dragState, onPointerDown, onPointerMove, onDrop, dragRef }`.
- **Acceptance:**
  - Pick-up scales 1.03 + shadow deepens (spring).
  - Drag follows cursor with ~80ms lag.
  - Release over valid target snaps + eases in ~180ms.
  - Release over invalid / empty shakes back to origin ~350ms.
  - Reduced-motion kill switch swaps to instant.
- **Spec refs:** polish spec §1 Behavior table.

### T6.2.2 Replace `CustomDragLayer` default ghost
- **What:** Drag ghost renders the real `<Card>` at animated scale +
  tilt, not the default browser drag preview.
- **Acceptance:** The card you grab looks like the card you're
  dragging — same size, same tier, same info.

### T6.2.3 Lineup drag-drop wiring
- **What:** `LineupSlot`, `BenchCard`, `BenchDrawer` consume
  `useCardDrag`. The three paths land:
  - Bench → slot drop
  - Slot → slot reorder (swap)
  - Slot → bench (remove)
- **Acceptance:**
  - Playwright: drag a legal card onto a slot; after the drop, the
    slot is committed and the animation has settled.
  - Drag an illegal card onto a mismatched slot; card returns to
    origin with a shake; slot stays empty.
  - Slot → slot reorder: two cards swap positions with two settles
    (one per slot).
  - No jitter on fast drag paths. 60fps sustained during a
    10-drop sequence.

---

## P6.3 — Pack arrival + dissolve physics (Day 4)

### T6.3.1 Pack opening reveal
- **What:** `src/components/pack/PackOpenerModal.tsx` replaces its
  current flip with the spring-land language. Cards arrive from a
  shared "pack center" position with staggered springs.
- **Acceptance:** Each card settles with perceivable weight. Duplicate
  quick-sell stamp still plays after the settle. Star-pull
  celebration (§4.13.4) unchanged.

### T6.3.2 Quick-sell dissolve
- **What:** `src/components/card/QuickSellModal.tsx` — replace the
  current opacity fade with a downward drift + desaturate + fade.
  Short (~600ms).
- **Acceptance:** Feels coherent with the rest of the motion
  language; coin counter in the header still ticks up at the right
  moment.

### T6.3.3 Season-end dissolve upgrade
- **What:** `VaultCeremony` step 4 uses the same dissolve treatment
  as quick-sell, staggered ~40ms per card.
- **Acceptance:** Scales for 0..20 cards without framerate drop.

---

## P6.4 — Vault selection drag (Day 4 continued / 5)

### T6.4.1 Drag-to-dropzone in vault selection
- **What:** `VaultCeremony` step 3 gets a prominent "VAULT (n / 10)"
  dropzone. Cards are picked up with the same pick-up language as
  the lineup and dragged in. Tap-to-toggle remains as an
  accessibility fallback.
- **Acceptance:**
  - Drag + drop into the vault moves the card into the preserved
    set. Drag out returns it to the grid.
  - Tap still works.
  - Counter updates live.
  - Reduced-motion keeps tap-only (no drag spring).

---

## P6.5 — Reduced-motion, E2E, ADR (Day 5–6)

### T6.5.1 Reduced-motion sweep
- **What:** Audit every spring call for `prefers-reduced-motion`
  compliance. Utilities in `src/lib/motion/` wrap the switch.
- **Acceptance:** Forced-reduced-motion test in Playwright completes
  a lineup build without any spring durations > 0ms.

### T6.5.2 E2E scenarios
- **What:** Playwright additions:
  - Lineup build via drag (bench → slot × 10) with `waitForAnimations`.
  - Invalid drop bounce-back (SS card onto 1B slot) verifies the
    shake completes and slot stays empty.
  - Vault drag + tap both paths.

### T6.5.3 ADR-0011 — Phase 6 retro
- **What:** `docs/adr/ADR-0011_phase-6-retro.md` documenting what
  shipped, what was harder than expected, what's next (e.g., tier
  foil motion deferred per spec §4).

---

## What's NOT in Phase 6 (scope guard)

- **Tier foil motion** — silver hover shine, gold bloom cycle,
  diamond shimmer. Their own polish slice.
- **Sound design.**
- **Haptics** (no mobile web at launch).
- **Artwork / illustrations.**
- **Onboarding flow rework** — separate slice.
- **Live contest view polish** — separate slice.

---

## Per-task checklist

Same as Phase 1 §Per-Task Checklist — spec refs, tests, typecheck,
lint, PR format.

---

## Dependencies between tasks

```
P6.1 (Rich Small card) ─┬─► P6.2 (Motion + drag) ──► P6.3 (Pack + dissolve)
                        │
                        └─► P6.4 (Vault drag)
                        │
P6.2 ──────────────────┼─► P6.5 (Reduced-motion + E2E + ADR)
P6.3 ──────────────────┤
P6.4 ──────────────────┘
```

P6.1 is a pure visual rework and has no dependencies; do it first so
the rest of the motion work animates the final card face. P6.2 sets
the motion primitives that P6.3 and P6.4 reuse. P6.5 closes.

---

## After Phase 6

Next polish batches (proposed, not locked):

- **Tier foil motion pass** — the §4.5 silver/gold/diamond treatments.
- **Onboarding flow pass** — animations + copy polish + welcome
  warmth.
- **Live contest view pass** — scoring tick animations, event-feed
  cinematics, heat-map visualization.
- **Empty + error state pass** — sweep all §8 states.
- **Accessibility audit pass** — WCAG 2.1 AA, screen-reader, keyboard.
- **Onboarding + tutorial contest** — scripted mini-contest per UI/UX
  §6.1.
- **Sound design**.

Each gets its own mini-spec + roadmap when we turn to it — same
pattern as this doc.

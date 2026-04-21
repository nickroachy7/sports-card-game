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
| P6.3 | Dissolve physics                        | 0.5 day | Quick-sell + season-end dissolve upgraded to a coherent motion vocabulary. (Pack reveal deferred — gets its own slice; see end of this doc.) |
| P6.4 | Vault selection drag                    | 0.5 day | Vault ceremony drag-into-dropzone replaces tap-toggle (tap stays as fallback). |
| P6.5 | Reduced-motion, E2E, ADR                | 1 day | `prefers-reduced-motion` swap. Playwright scenario for lineup build + drag-drop-settle. ADR-0011 retro. |

---

## P6.1 — Rich Small card redesign (Day 1)

### T6.1.1 Unhide Medium anatomy at Small size
- **What:** In `src/components/card/Card.tsx`, drop the `!isSmall`
  guards on:
  - position tag (line 123)
  - team chip (line 136)
  - stats footer (line 166) — includes name, FP, contract count,
    `+ Token` badge
- **Tune for 96×134:** extend the ternaries (`isLarge ? X : Y`)
  across the component to handle three sizes, adjusting font sizes,
  padding, and photo-area height so Medium-tuned values don't leak
  into Small verbatim.
- **Acceptance:**
  - `/palette` page renders a full state matrix at Small: every
    tier × status × token-applied combo fits at 96×134.
  - No layout regression on Collection (Medium) or Card Detail
    (Large).
  - `pnpm typecheck` + `pnpm lint` clean.
- **Spec refs:** polish spec §2; UI/UX spec §4.11.1.

### T6.1.2 Sacrifice list if density is too high
- **What:** After T6.1.1 lands, eyeball at 96×134. If it reads as
  noise, apply the three-step sacrifice list from polish spec §2:
  `+ TOKEN` → icon, long names → truncate ~12 chars, team chip →
  8px.
- **Acceptance:** Readable from 18 inches without squinting on a
  2020-era laptop display.

### T6.1.3 Port vault selection to shared Card
- **What:** `src/components/vault/VaultCeremony.tsx` `CardThumb` —
  swap bespoke initials-only renderer for `<Card size="small">`.
  Bench drawer and lineup slot already consume `<Card size="small">`,
  so no call-site changes there.
- **Acceptance:** Visual parity across diamond, bench, vault
  selection, and Collection.

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

## P6.3 — Dissolve physics (Day 4)

### T6.3.1 Quick-sell dissolve
- **What:** `src/components/card/QuickSellModal.tsx` — replace the
  current opacity fade with a downward drift + desaturate + fade.
  Short (~600ms).
- **Acceptance:** Feels coherent with the rest of the motion
  language; coin counter in the header still ticks up at the right
  moment.

### T6.3.2 Season-end dissolve upgrade
- **What:** `VaultCeremony` step 4 uses the same dissolve treatment
  as quick-sell, staggered ~40ms per card.
- **Acceptance:** Scales for 0..20 cards without framerate drop.

> **Deferred:** pack opening reveal. The current carousel + flip
> needs its own redesign — a motion refresh alone won't fix it.
> Parked as a standalone polish slice (see "After Phase 6").

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

- **Pack opening reveal redesign.** Not just motion — the carousel,
  the reveal sequence, the tier-reveal flash, the dupe-sell stamp,
  the star-pull celebration (§4.13.4). Full pass. Deferred here
  explicitly — its own mini-spec when we get to it.
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

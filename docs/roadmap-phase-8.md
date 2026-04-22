# Draft Deck — Phase 8 Roadmap (Feel Pass v1.3)

**Goal:** Three deliverables locked in `draft-deck-polish-spec.md`
§10–§12: finish the lineup-page arc (Collection drawer migration,
slot↔slot swap drag, n8n-style diamond pan+zoom canvas), redesign
the pack opening moment (tap-through carousel + star-pull
celebration + dupe keep-one decision), and pay down two pieces of
hardening debt (real BDL webhook registration + MLB-official W/L
attribution).

**Estimated effort:** 7–9 days of focused solo engineering. Biggest
slice is pack reveal (~2–3 days), next is the diamond pan+zoom
canvas (~1.5 days). Largest single-file surface is the pack reveal
component tree.

**Prerequisites:**
- Phase 7 shipped (ADR-0012).
- `draft-deck-polish-spec.md` §10–§12 read and signed off.
- `CardDetailDrawer` + `getCardDetail` server action in place from
  P7.3.
- `CardDragLayer` + `TokenDragLayer` + `DissolveCard` domain-
  generic from Phase 6/7 — extend, don't rewrite.
- Test account "The Boys" available for real-flow smoke.

---

## Milestones

| ID   | Milestone                                          | Target   | Outcome |
|------|----------------------------------------------------|----------|---------|
| P8.1 | Collection drawer migration                         | 1 day    | `/collection` cards open the shared drawer; URL uses `?card=<id>` query param; direct `/collection/[cardId]` still renders for back-compat; Collection gains the corner `<AppliedTokenBadge>` for tokened cards (fixes P7.2 regression). |
| P8.2 | Slot ↔ slot swap drag                               | 1 day    | New `swap_lineup_slots` SQL fn with dual-eligibility check. `LineupSlot` becomes a drag source when filled. Swap is atomic, optimistic, and shakes back on invalid positions. |
| P8.3 | Diamond pan + zoom canvas                           | 1.5 days | New `<ZoomCanvas>` wrapper around `<DiamondGrid>`. Trackpad pinch, ctrl-scroll, `+/−/Fit` buttons, drag-to-pan when zoomed past fit. 0.5× – 2.0× bounds; elastic at edges. Removes P7.1's internal-overflow workaround. |
| P8.4 | Pack reveal redesign                                | 2–3 days | Tap-through carousel. Per-card flip animation. Star-pull celebration for `'star'` + `'starter'` players. Dupe panel with keep-new vs keep-existing choice; instance picker for multi-dupes. `/palette` gains a PackRevealDemo section. |
| P8.5 | Play-by-play W/L attribution                        | 1 day    | `reconcile.ts` + scoring SQL use MLB-official W/L from BDL payload. Heuristic preserved as fallback when official is absent. Unit + integration tests cover both paths. No retro-backfill of historical contests. |
| P8.6 | Real BDL webhook registration                       | 0.5 day + coord | Register prod webhook URL with BDL. Update `BDL_WEBHOOK_SECRET`. Smoke one real game event. Guard `/api/dev/webhook-sim` behind `NODE_ENV !== 'production'`. |
| P8.7 | Reduced-motion sweep, E2E, ADR-0013                 | 0.5 day  | Reduced-motion audit on pack reveal + pan/zoom + swap drag. Playwright: Collection drawer open/close + Slot swap state assertion. ADR-0013 Phase 8 retro. |

---

## P8.1 — Collection drawer migration (Day 1)

### T8.1.1 Collection grid → drawer state
- **What:** `src/app/(app)/collection/collection-grid.tsx` — replace
  the card `<Link>` with a click handler. Grid owns `detailCardId`
  state + renders `<CardDetailDrawer>`.
- **URL state:** when drawer opens, `router.push("/collection?card=<id>")`
  (shallow); on close, clear the query param. On mount, read
  `searchParams` and set the initial drawer state from `?card`.
- **Acceptance:**
  - Click opens drawer. URL updates.
  - Close clears `?card`.
  - Direct `/collection?card=<id>` link opens drawer on mount.
  - Forward/back navigation opens/closes the drawer without
    reloading the grid.
- **Spec refs:** polish spec §11.1.

### T8.1.2 Corner token badge on Collection cards
- **What:** Collection page's server data fetch already returns
  `applied_token_id`. Extend the query to join `token` by id and
  pick `token_type` + `bonus_fp`. Propagate to the grid's card
  models. Wrap each grid card in a relative container + render
  `<AppliedTokenBadge>` at the corner when the token is present.
- **Acceptance:**
  - Any Collection card with an applied token shows the corner
    pip.
  - Clicking the pip (as before) enters the two-step remove
    confirm.

### T8.1.3 Drawer Add-to-Vault path
- **What:** Collection drawer already uses the same
  `<CardDetailView>` which has the "Add to vault" button. Verify
  that path fires from within the drawer context (it's a client
  component; should work, but verify `router.push("/vault")`
  doesn't close before the `vaultCardMidseason` transition
  settles).
- **Acceptance:**
  - Vaulting from the Collection drawer navigates to `/vault`
    with the card pre-vaulted.

---

## P8.2 — Slot ↔ slot swap (Day 2)

### T8.2.1 SQL fn `swap_lineup_slots`
- **What:** New fn in `src/lib/db/functions/` + a migration to
  apply it. Signature:
  `swap_lineup_slots(p_user_id uuid, p_entry_id uuid, p_position_a lineup_position, p_position_b lineup_position) RETURNS jsonb`.
- **Logic:**
  - Resolve the cards at A and B. Validate both belong to the
    user + contest entry is in `'building'` state.
  - Dual eligibility: card at A must match B's position role
    AND card at B must match A's position role. If either fails,
    raise `23514` with a clear message.
  - Apply atomically: swap `starter_card_id` on both slots.
  - Clear any token application that would become invalid (e.g.,
    a hitter token on a slot now occupied by a pitcher).
- **Smoke:** DO-block `RAISE 'TEST_OK'` pattern — happy path,
  eligibility mismatch, locked-entry rejection.

### T8.2.2 Server action + drag wiring
- **What:** `swapLineupSlots` in `app/actions/lineup.ts`. Wraps
  SQL fn, revalidates `/lineup`, maps errors (`VALIDATION`,
  `CONFLICT`, `POSITION_INELIGIBLE`).
- **LineupSlot drag source:** filled slots become draggable.
  `useDrag` with a new drag-item shape `{ cardId, fromPosition }`.
  Existing drop target semantics extend: if drop item came from a
  slot, call `swapLineupSlots` instead of `updateLineupSlot`.
- **Acceptance:**
  - Drag a card from slot A onto slot B with matching positions →
    cards swap. Optimistic update is instant; server settles
    behind.
  - Incompatible swap → shake-back. No state change.
  - Drag slot card onto bench drawer → existing remove flow (keep
    the button too).

---

## P8.3 — Diamond pan + zoom canvas (Day 3 / half Day 4)

### T8.3.1 `<ZoomCanvas>` wrapper
- **What:** New `src/components/lineup/ZoomCanvas.tsx`. Owns:
  - `scale` state (default = computed fit), `tx`/`ty` pan state.
  - Wheel handler (ctrl/cmd + wheel = zoom around pointer; plain
    wheel = blocked to prevent page scroll on diamond).
  - Pinch handler (wheel with ctrlKey set — macOS pinch emits this).
  - Pointer drag handler when scale > fit (drag to pan; react-dnd
    reserves card drags by selector check).
  - Applied as `transform: translate(tx, ty) scale(scale)` on
    inner container.
  - Bounds: 0.5× min / 2.0× max; elastic resistance at edges.
- **Acceptance:**
  - Mounts at fit-to-pane. No internal scroll on 800px viewport.
  - Pinch / ctrl-scroll zooms around pointer.
  - Drag in empty space pans when zoomed past fit; no pan at fit.
  - Card drag (react-dnd) still works — the layer hit-tests in
    transformed space.

### T8.3.2 Control cluster overlay
- **What:** Floating `+/−/Fit` buttons, top-right of the pane.
  Styled like the existing collection sidebar treatment (minimal
  chrome). Bound to the same `ZoomCanvas` handlers.
- **Acceptance:**
  - Each button adjusts scale correctly.
  - Fit returns to mount-time transform.
  - Buttons respect reduced-motion (instant state change).

### T8.3.3 Retire internal-overflow workaround
- **What:** `LineupShell`'s diamond pane loses the `overflow-auto`
  workaround from P7.1. Pane becomes a fixed-size viewport for the
  `<ZoomCanvas>`.
- **Acceptance:**
  - At 800px viewport, diamond fits cleanly without any scroll.

---

## P8.4 — Pack reveal redesign (Day 4–6)

### T8.4.1 Reveal surface rewrite
- **What:** Rewrite the pack-opening modal's reveal component.
  Data model: server action `openPack` already returns the N
  pulled cards (with player + tier + dupe status). Reveal owns:
  - Carousel layout (cards face-down in a row, active card lifted).
  - Flip animation on tap (framer-motion, ~350ms spring per card).
  - Post-flip: emit celebration if `player_value_tier` ∈ {'star',
    'starter'}, or dupe panel if pulled player already exists in
    user's collection.
- **Spec refs:** polish spec §10.

### T8.4.2 Star-pull celebration
- **What:** Separate component (`<StarPullBurst>`) that wraps
  the flipped card during the celebration window.
  - **Star variant:** hero-scale to 1.4 (spring 300/22), radial
    particle burst, screen-darken backdrop, ~900ms total.
  - **Starter variant:** hero-scale to 1.15, tier-frame glow pulse,
    ~450ms.
  - Reduced-motion: no scale, no particles. Ring-pulse substitute.
- **Acceptance:**
  - `/palette` gains a "Pack reveal celebrations" section with
    both variants + a non-celebrating flip side-by-side.
  - Celebration layer doesn't block the "tap to continue" gesture
    — user can skip during the animation.

### T8.4.3 Dupe panel + keep-one decision
- **What:** Split panel after a dupe flip:
  - Left: new card + "Sell new (+Nc)" button.
  - Right: existing instance + "Sell existing (+Mc)" button.
  - If multiple existing instances exist: default to lowest-FP;
    "(change)" link opens a small radio picker.
- **Server:** calls `quick_sell_card(existingInstanceId)` for
  sell-existing, or a new `sell_pack_card(newCardId)` fn that
  credits coins without persisting the card (new). For sell-new,
  the card was inserted by `open_pack` — the simplest impl is to
  delete the just-inserted row + credit; check `open_pack` to
  decide whether to move the dupe decision upstream.
- **Acceptance:**
  - Non-dupe flow unaffected.
  - Dupe flow: user picks one side; unpicked destroys + coins
    credit; coin ticker updates live.
  - User with 2+ existing instances sees the default + can pick
    another.
- **Spec refs:** polish spec §10 Duplicate handling.

### T8.4.4 "Skip all" button + E2E
- **What:** During reveal, a "Skip all" button plays remaining
  flips as a fast cinematic (no celebration layer, no dupe
  panel — dupes auto-sell-existing at lowest FP). Pack-speedrun
  affordance.
- **E2E:** extend `tests/e2e/critical-path.spec.ts` (or new
  `pack-reveal.spec.ts`) to walk signup → claim pack → flip all
  → done.

---

## P8.5 — Play-by-play W/L attribution (Day 6–7)

### T8.5.1 Read MLB-official W/L from BDL
- **What:** Inspect BDL SDK types in `reference/` for the
  official W/L attribution field. Update `MLBDataProvider`
  interface if needed. `reconcile.ts` reads official attribution
  before falling back to the heuristic.
- **Acceptance:**
  - When official present: official drives FP credit.
  - When absent: heuristic fires as before (keep the code path).
- **Spec refs:** polish spec §12.2.

### T8.5.2 Scoring SQL update (if needed)
- **What:** If any scoring functions recompute W/L server-side
  independently, align them to consume the attribution from the
  ingested event. Touch `src/lib/db/functions/` scoring fns.

### T8.5.3 Unit + integration tests
- **What:** Vitest tests covering:
  - Official present → official wins.
  - Official absent → heuristic fires + matches pre-change
    behavior.
  - Edge: starter got the W per heuristic but reliever got it
    officially → new behavior credits reliever.

---

## P8.6 — BDL webhook registration (Day 7, external coord)

### T8.6.1 Register prod webhook
- **What:** Coordinate with BDL (confirm URL + generate / share
  secret). Update `BDL_WEBHOOK_SECRET` in Vercel prod.
- **Acceptance:**
  - Webhook registered; first real event arrives.
  - HMAC verification passes.
  - `webhook_delivery` row written with correct status.

### T8.6.2 Dev-sim guard
- **What:** `src/app/api/dev/webhook-sim/route.ts` returns 404
  when `NODE_ENV === 'production'`.
- **Acceptance:** prod can't be exercised via the dev-sim path.

### T8.6.3 One-shot real smoke
- **What:** After registration, fire or wait for one real event
  on a scheduled MLB game. Confirm end-to-end: webhook →
  ingestion → scoring → contest update → UI refresh.

---

## P8.7 — Close-out (Day 7–8)

### T8.7.1 Reduced-motion sweep
- **What:** Audit P8 surfaces:
  - Pack reveal flip + celebration (needs `useReducedMotion`).
  - ZoomCanvas transforms (instant, no easing).
  - Slot swap drag (inherits §1 vocabulary — already covered).
- **Acceptance:** forced-reduced-motion browser flag still
  completes the full pack-open and diamond-zoom flows.

### T8.7.2 Playwright additions
- **What:** New specs:
  - `collection-drawer.spec.ts` — open drawer, URL updates, close
    clears.
  - `slot-swap.spec.ts` — state-level (not drag) verification via
    a direct server action call + grid re-render assertion. Drag
    E2E deferred per ADR-0011.

### T8.7.3 ADR-0013 — Phase 8 retro
- **What:** `docs/adr/ADR-0013_phase-8-retro.md` — what shipped,
  surprises, open items, estimate vs reality.

---

## What's NOT in Phase 8 (scope guard)

Copied from polish spec §13:

- Ceremony fn tolerance for pre-vaulted cards (P7.4 followup;
  non-urgent).
- Empty + error state sweep.
- Tier foil motion.
- Onboarding flow pass.
- Live contest view polish (candidate for Phase 9).
- Accessibility audit (WCAG 2.1 AA).
- Rank-based XP against multi-user contests.
- Mobile layout, sound, haptics, artwork.

---

## Per-task checklist

Same as Phase 1 §Per-Task Checklist:
- Task acceptance met.
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- DB: migration up + down; RLS enforced; SQL fn wraps every
  mutation.
- New API / Action: zod contract + error code in catalog + Sentry /
  PostHog wraps.
- UI: `/palette` state added where applicable.
- Commit convention: `feat(<scope>): P8.N <slice>`.

---

## Dependencies between tasks

```
P8.1 (Collection drawer) ──┐
                           │
P8.2 (Slot swap) ──────────┼──► P8.7 (close-out)
                           │
P8.3 (Pan + zoom) ─────────┤
                           │
P8.4 (Pack reveal) ────────┤
                           │
P8.5 (W/L attribution) ────┤
                           │
P8.6 (BDL webhook) ────────┘
```

All six feature slices are independent — none blocks another.
Ordering is by user-visible value: drawer migration first (fixes
P7.2 regression on Collection corner badge), then slot swap
(closes lineup arc), then diamond pan+zoom (biggest UI lift
after pack reveal), then pack reveal (biggest moment + most
design work), then hardening last (W/L can ship anytime; BDL
coord may stall).

P8.7 closes.

---

## Standing follow-ups (ride-along if convenient)

From prior sessions, non-blocking:
- `commit_vault_selection` tolerance for pre-vaulted cards
  (P7.4 known followup).
- Rank-based XP against a multi-user contest (needs real users).
- Diamond drag-drop E2E once real user cohort justifies the
  Playwright investment.

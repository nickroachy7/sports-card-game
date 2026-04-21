# Draft Deck — Phase 7 Roadmap (Feel Pass v1.2)

**Goal:** Ship the second polish batch — a lineup-page shell rewrite
(no-scroll, right sidebar), tokens as first-class physical objects,
single-click detail on lineup cards, and mid-season vault. Scoped to
the five features locked in `draft-deck-polish-spec.md` §5–§8.

**Estimated effort:** 4–5 days of focused solo engineering. P7.1 is
the biggest single slice (layout refactor) and P7.4 is the deepest
backend slice (vault state + refunds + ceremony rework).

**Prerequisites:**
- Phase 6 shipped (ADR-0011).
- `draft-deck-polish-spec.md` §5–§8 read and signed off.
- `CardDragLayer` + `DissolveCard` domain-generic from Phase 6 — we
  extend, not rewrite.
- Test account "The Boys" (`user_id 81cb1cbb-6325-46d1-b390-
  866a1f7f74ac`) available for real-flow smoke.

---

## Milestones

| ID   | Milestone                                      | Target  | Outcome |
|------|------------------------------------------------|---------|---------|
| P7.1 | Lineup shell — sidebar + no-scroll bottom strip | 1.5 day | New `LineupShell` with persistent right sidebar (readiness, projected FP, auto-subs, submit CTA). Bench + tokens rows fixed at viewport bottom. No page scroll at 800px viewport. |
| P7.2 | Applied tokens — circular drag-drop            | 1 day   | `<TokenBadge>` corner overlay, drag-from-tray, 1-per-card cap, click-to-remove confirm, hover tooltips. `remove_applied_token` SQL fn. `/palette` gains Applied Tokens section. |
| P7.3 | Lineup card click → shared detail drawer       | 0.5 day | Single-click opens Collection's `<CardDetailDrawer>` with a lineup-context action row (quick-sell, extend, remove from slot, add to vault). 5px drag-vs-click threshold. |
| P7.4 | Mid-season vault                               | 1.5 day | `vault_card_midseason` + `destroy_vaulted_card` SQL fns with append-only audit. Server Actions. Vaulted card face. Submitted-lineup guard. Ceremony updated to last-chance-destroy flow. |
| P7.5 | Reduced-motion, E2E, ADR-0012                  | 0.5 day | Reduced-motion sweep on new surfaces. Playwright: token apply + remove; mid-season vault + destroy. ADR-0012 Phase 7 retro. |

---

## P7.1 — Lineup shell (Day 1 / half Day 2)

### T7.1.1 Extract shared sidebar primitive
- **What:** Pull the Collection sidebar's section-header + mono-value
  + divider pattern (collection-grid.tsx lines 162–254) into
  `src/components/layout/SidebarCard.tsx`. Collection consumes the
  primitive; no visual diff on Collection after refactor.
- **Acceptance:**
  - `pnpm typecheck` + `pnpm lint` clean.
  - Visual parity on Collection (spot-check `/collection` against
    pre-refactor screenshot).
- **Spec refs:** polish spec §8 Dependencies.

### T7.1.2 New LineupShell
- **What:** `src/components/lineup/LineupShell.tsx` implements the
  layout in polish spec §8:
  - Header row (existing).
  - Flex main row: diamond (flex-1, left) + sidebar (`w-72`, right).
  - Fixed-height bench row below main (~160px).
  - Fixed-height tokens row below bench (~72px).
  - Container uses `h-[calc(100vh-64px)]` so the whole page sits in
    the viewport; overflow-y degrades to scroll only when viewport
    < 800px.
- **Acceptance:**
  - At 1280×800, no page scroll; at 1280×700, graceful scroll.
  - Sidebar, diamond, bench, tokens all visible without interaction.
- **Spec refs:** polish spec §8 Layout + Budget.

### T7.1.3 Sidebar contents (readiness / projected FP / auto-subs / submit)
- **What:**
  - Readiness section: derive from existing slot state; show
    `N / 10 filled` + per-slot warnings.
  - Projected FP: sum `card.projected_fp` (confirm field name)
    across slotted cards; re-render on slot change.
  - Auto-subs: relocate existing component into sidebar without
    rewriting behavior.
  - Submit CTA: anchored bottom of sidebar; deadline countdown
    directly above.
- **Acceptance:**
  - Submit works from the new location; old below-lineup bar (if
    any) is removed.
  - Readiness reacts within 100ms of any drag-drop.
  - Projected FP matches hand-calc on the test-account lineup.

### T7.1.4 Bottom strip — bench + tokens rows with horizontal scroll
- **What:**
  - Bench row: existing `BenchDrawer` re-skinned to fixed height;
    horizontal scroll inside when cards overflow.
  - Tokens row: new container; renders token pips per §5 (stub now,
    wire to §5 component in P7.2).
- **Acceptance:**
  - Bench with >8 cards scrolls horizontally; page does not scroll.
  - Tokens row renders empty-state text when user has no tokens.

---

## P7.2 — Applied tokens (half Day 2 / Day 3)

### T7.2.1 `<TokenBadge>` corner overlay
- **What:** `src/components/token/TokenBadge.tsx`. Absolute-positioned
  circular pip (~40px visual) anchored to the card's bottom-right,
  overlaid ~50% outside the tier frame. Same anchoring pattern as
  the existing status pill.
- **Acceptance:**
  - Renders correctly on Small (96×134) and Medium cards.
  - Does not clip the stats footer at either size.
  - `/palette` gains "Applied Tokens" section showing the badge on
    every tier × status combo.

### T7.2.2 Token tray pips + hover tooltip
- **What:** `src/components/token/TokenTray.tsx` (new or refactored)
  renders each available token as a circular pip with hover tooltip
  (shadcn `Tooltip`). Tooltip shows the token's conditional rule
  verbatim.
- **Acceptance:**
  - Hover on a pip shows the tooltip; mouse-leave dismisses.
  - Tray fits inside the P7.1.4 tokens row (~72px tall).

### T7.2.3 Drag-to-apply via `CardDragLayer`
- **What:** Extend `CardDragLayer` (or add a sibling `TokenDragLayer`
  if domain separation feels cleaner) to support token pip drag.
  Valid drop target: any un-tokened card the user owns on the
  lineup page (bench or slot). Invalid drop (already-tokened card,
  empty space) → shake-back to tray.
- **Acceptance:**
  - Drag from tray to un-tokened bench card applies; pip consumes
    from tray.
  - Drag onto already-tokened card shakes back.
  - Drop in empty space shakes back.
  - Reduced-motion: instant apply, no shake.

### T7.2.4 Click-to-remove with inline confirm
- **What:** Click the applied `<TokenBadge>` → two-step inline
  confirm ("Remove?") → confirm destroys. No return to tray.
  `remove_applied_token(token_application_id)` SQL fn deletes the
  application record.
- **Acceptance:**
  - Click applied pip shows confirm; second click destroys.
  - Card reverts to un-tokened state visually + in DB.
  - Audit trail: the token's original `token_application` row
    remains for history (if schema already writes it); the card's
    `applied_to_card_id` clears.
- **Spec refs:** polish spec §5 Behavior.

---

## P7.3 — Lineup click → shared detail drawer (Day 3 / half Day 4)

### T7.3.1 Extend `<CardDetailDrawer>` with lineupContext
- **What:** Add optional
  `lineupContext?: { slotId?: string; onRemove?: () => void; onAddToVault: () => void; }`
  prop. When present, render an additional action row below the
  existing content with:
  - Quick-sell (reuse existing action).
  - Extend contract (reuse existing action).
  - Remove from slot (only if slotId present).
  - Add to vault (opens P7.4 mid-season vault flow).
- **Acceptance:**
  - Collection behavior unchanged when `lineupContext` is absent.
  - All four actions callable from lineup context.
  - Drawer height fits the 800px viewport budget.

### T7.3.2 5px drag-vs-click threshold on lineup + bench cards
- **What:** In `useCardDrag` (or equivalent), wire a 5px pointer-
  movement threshold. Single mousedown + release without passing
  threshold → click opens drawer. Mousedown + drag past 5px → drag
  path, click suppressed.
- **Acceptance:**
  - Single click opens drawer on slotted and bench cards.
  - Starting a drag (>5px) does not open drawer.
  - Keyboard: Tab + Enter opens drawer; Escape closes.

### T7.3.3 Remove-from-slot wiring
- **What:** Wire the "Remove from slot" action to
  `update_lineup_slot(slot_id, NULL)` (or new `remove_from_lineup_slot`
  fn if existing fn rejects NULL). On success: drawer closes, card
  plays the §1 slot → bench motion, bench drawer updates.
- **Acceptance:**
  - Removing a card from a slot moves it to bench immediately.
  - Animation coherent with the §1 motion language.
  - Server state + UI state match after reload.

---

## P7.4 — Mid-season vault (half Day 4 / Day 5)

### T7.4.1 Schema: vault state + destroy audit
- **What:** Migration 0020+:
  - Add `card.vaulted_at timestamptz null` +
    `card.vault_source vault_source_enum null`
    (enum values: `'midseason'`, `'ceremony'`).
  - New append-only `vault_card_destroy` table:
    `(id uuid pk default gen_random_uuid(), user_id, card_id,
    tier, refund_coins, created_at default now())`.
  - RLS: owner-only select; inserts via SQL fn only.
- **Acceptance:**
  - Migration applies + reverts cleanly on local.
  - `pnpm db:generate` produces matching Drizzle types.
  - `supabase db push --linked` applies to prod without errors.

### T7.4.2 SQL fns: `vault_card_midseason` + `destroy_vaulted_card`
- **What:** In `src/lib/db/functions/`:
  - `vault_card_midseason(p_card_id)`:
    - Asserts card is owned by `auth.uid()`.
    - Asserts card is not already vaulted.
    - Asserts user is below 10-card cap.
    - Asserts card is not locked in a submitted-but-unscored
      lineup (join `contest_lineup_slot` on unscored contests).
    - Sets `card.vaulted_at = now()`, `card.vault_source =
      'midseason'`.
  - `destroy_vaulted_card(p_card_id)`:
    - Asserts card is vaulted + owned.
    - Computes refund = `floor(0.15 * quick_sell_value(tier))`
      via economy config.
    - Credits via existing coin-credit path.
    - Appends `vault_card_destroy` row.
    - Deletes / archives the card per existing delete-card pattern
      (cascades already relaxed per ADR-0011 migration 0019).
- **Smoke:** DO-block `RAISE 'TEST_OK: %'` rollback against a test
  card before shipping.
- **Acceptance:**
  - Both fns callable only by the card's owner (RLS + fn assertions).
  - All pre-conditions produce clear SQLSTATE + message.
  - Smoke block passes.

### T7.4.3 Server Actions + error codes
- **What:** `app/actions/vault.ts`:
  - `vaultCardMidseason(cardId)` → wraps `vault_card_midseason`.
  - `destroyVaultedCard(cardId)` → wraps `destroy_vaulted_card`.
  - New error codes in catalog (per CLAUDE.md §6): `VAULT_CAP_FULL`,
    `VAULT_CARD_LOCKED_IN_LINEUP`, `VAULT_CARD_NOT_VAULTED`,
    `VAULT_CARD_ALREADY_VAULTED`.
- **Acceptance:**
  - Zod input schemas in `src/lib/contracts/vault.ts`.
  - Sentry + PostHog wrapped per CLAUDE.md §10.
  - Integration tests: happy path + one primary error each.

### T7.4.4 UI: vaulted card face treatment
- **What:**
  - `<Card>` reads `card.vaulted_at` (or a `viewModel.vaulted`
    boolean). When true, renders muted tier frame + "VAULTED"
    corner ribbon / stamp. Card cannot be dragged (disable at the
    drag-source layer).
  - `/palette` gains a "Vaulted" state row.
- **Acceptance:**
  - Vaulted card renders visually distinct at every size.
  - Drag is disabled on vaulted cards (bench + vault page).

### T7.4.5 UI: "Add to Vault" action in both drawers
- **What:**
  - Collection detail drawer gains "Add to Vault" action
    (enabled when card is playable).
  - Lineup detail drawer's action row (P7.3) reuses the same
    component.
  - Confirm dialog: "Add {name} to the vault? Vaulted cards can't
    play again this season."
- **Acceptance:**
  - Action visible + enabled on playable cards in both drawers.
  - Cap-full / locked-lineup errors surface as inline modal
    messages, not toasts.

### T7.4.6 Vault page — destroy flow + mid-season list
- **What:**
  - Vault page (`src/app/(app)/vault/page.tsx`) shows pre-vaulted
    cards + the ceremony CTA (unchanged when ceremony is live).
  - Click a pre-vaulted card → destroy confirm
    ("Destroy {name} for N coins? This can't be undone.").
  - Confirm → `destroyVaultedCard(cardId)` → card animates via
    `DissolveCard` (reuse Phase 6 component), coin counter ticks
    up.
- **Acceptance:**
  - Destroy refunds exact tier-scaled amount.
  - Dissolved card removed from page list.
  - Cap counter decrements.

### T7.4.7 Ceremony: last-chance destroy
- **What:** `VaultCeremony` updated so step 3 displays pre-vaulted
  cards alongside the remaining Collection. User can:
  - Destroy pre-vaulted cards mid-ceremony (same refund, same
    animation).
  - Add Collection cards until cap = 10.
  - Final confirm = hard lock (no more destroys or adds).
- **Acceptance:**
  - Pre-vaulted cards show in ceremony step 3.
  - Destroy mid-ceremony works + decrements cap.
  - After final confirm, attempts to destroy / add fail with clear
    error.

---

## P7.5 — Close-out (Day 5)

### T7.5.1 Reduced-motion sweep
- **What:** Verify `useReducedMotion` on:
  - Token pick-up / drop / shake-back (P7.2).
  - Card detail drawer open / close (P7.3).
  - Vaulted card dissolve (P7.4.6).
  - `LineupShell` sidebar / row transitions (P7.1).
- **Acceptance:** With `prefers-reduced-motion: reduce`, every new
  surface degrades to instant state changes (no tilts, no shakes, no
  slides).

### T7.5.2 Playwright scenarios
- **What:** Add to `tests/e2e/`:
  - `token-apply-remove.spec.ts` — drag a token onto a card,
    confirm applied state persisted; click to remove, confirm
    cleared.
  - `midseason-vault.spec.ts` — vault a card from Collection
    drawer, confirm frozen; destroy from vault page, confirm
    refund + removed.
  - `lineup-click-detail.spec.ts` — single-click a slotted card
    opens drawer; drag does not.
- **Acceptance:** Scenarios pass on CI. If drag E2E proves fragile
  (per ADR-0011 Simplified #3), cover the state-level assertions
  and skip the raw drag animation.

### T7.5.3 ADR-0012 — Phase 7 retro
- **What:** `docs/adr/ADR-0012_phase-7-retro.md` documenting:
  - What shipped per slice (commits).
  - What was harder than expected.
  - What's deferred / open.
  - Estimate vs reality.

---

## What's NOT in Phase 7 (scope guard)

Copied forward from polish spec §9, explicit guard:

- **Slot ↔ slot reorder and slot ↔ bench drag.** Still pending
  `swap_lineup_slots` SQL fn. §6 "Remove from slot" button covers
  slot → bench for now.
- **Pack opening reveal redesign.**
- **Tier foil motion.**
- **Onboarding flow pass.**
- **Live contest view polish.**
- **Empty + error state sweep.**
- **Accessibility audit.**
- **Mobile layout / sound / haptics / artwork.**

---

## Per-task checklist

Same as Phase 1 §Per-Task Checklist:
- Task acceptance met.
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- DB changes: migration up + down, RLS enforced, SQL fn wraps every
  mutation.
- New API / Action: zod contract + error code in catalog + Sentry /
  PostHog wraps.
- UI: `/palette` state added where applicable.
- Commit convention: `feat(<scope>): <slice>`. PR title:
  `[P7.N] <slice>`.

---

## Dependencies between tasks

```
P7.1 (Lineup shell) ──┬─► P7.2 (Applied tokens — needs tokens row)
                      │
                      └─► P7.3 (Lineup click — needs shell fits drawer in budget)
                                   │
                                   └─► P7.4.5 (Add to Vault action uses P7.3 drawer row)
                                                │
P7.4.1 (schema) → P7.4.2 (SQL) → P7.4.3 (actions) → P7.4.4/5/6/7 (UI)

All ──────────────────────────────────────────► P7.5 (close-out)
```

P7.1 unblocks everything below. P7.4 has the deepest backend work —
the P7.4.1 → P7.4.7 chain is strictly sequential within the slice
but runs in parallel with P7.2 / P7.3 as long as P7.4.5 waits for
P7.3 to land.

---

## Standing follow-ups (ride-along if convenient)

From prior sessions, non-blocking:
- Register the real BDL webhook URL (today only
  `/api/dev/webhook-sim` exercises the pipeline).
- Rank-based XP against a multi-user contest (needs real users).
- Play-by-play-driven W/L attribution (currently heuristic — most
  IP on winning team).

None of these are required for Phase 7 but can be picked up in a
spare slot.

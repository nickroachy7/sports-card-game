# ADR-0012 — Phase 7 (Feel Pass v1.2) Retrospective

**Status:** Accepted · **Date:** 2026-04-21
**Phase:** Phase 7 (Polish — v1.2 feel pass)
**Companion specs:** `draft-deck-polish-spec.md` §5–§9,
`docs/roadmap-phase-7.md`.

---

## Context

Phase 6 closed the v1.1 motion pass. Phase 7 was the second polish
batch — locked via a two-round interview session with five features:
applied tokens as physical circles, single-click lineup detail,
mid-season vault + destroy, a new lineup shell (right sidebar + no-
scroll bottom strip), and a minor-item cleanup. The shape held
through build; all five landed without needing a spec amendment.

Estimate: 4–5 days. Shipped in five slices over a single session.

## Decision

Same tempo as Phase 6: tight single-purpose slices, commit + deploy
per slice via `vercel --prod --yes`, migrations via
`supabase db push --linked`, visual state covered by `/palette` where
possible, live-flow verification on prod against the test account
("The Boys"). Drag-drop E2E stayed deferred per ADR-0011.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P7.1 | `9f7d87ca` | `LineupShell` — fixed-viewport flex layout, right sidebar (`w-72`) with readiness / projected FP / auto-subs / submit, stacked bench + tokens rows at bottom. Extracted `SidebarSection` / `SidebarStat` / `SidebarRow` primitives from Collection. 800px viewport budget. |
| P7.2 | `f1960651` | `TokenBadge` (44px tray, 32px applied, hover tooltip), `AppliedTokenBadge` (click-to-remove inline confirm), `TrayTokenPip` (drag source), `TokenDragLayer` (motion ghost mirroring CardDragLayer). Card corner overlay on every lineup surface. 1-per-card cap. `/palette` Applied Tokens section. |
| P7.3 | `f8ca5ef0` | `CardDetailDrawer` + `getCardDetail` server action. Single-click on slotted or bench card opens Sheet with reused `CardDetailView` + lineup-action footer (Remove from slot, Add to vault placeholder). Browser-native HTML5 DnD threshold handles drag-vs-click. |
| P7.4 | `c5abd8e7` | Mid-season vault. Migration 0020 (vault_source enum, `card.vault_source`, `vault_card_destroy` audit table, `vault_destroy` coin_reason) + 0021 (SQL fns `vault_card_midseason` / `destroy_vaulted_card`). Server actions with full error-code catalog. Vaulted card face (muted veil + diagonal VAULTED stamp). Add-to-Vault in both drawers. `PreVaultedList` with AlertDialog destroy confirm + DissolveCard exit. |
| P7.5 | *(this)* | Global `prefers-reduced-motion` CSS floor. Mid-season vault E2E spec. ADR-0012. |

All live on `draft-deck.vercel.app`.

## What went well

1. **Two-round interview → locked spec, again.** Same pattern as
   Phase 6 — sharp questions, tight answers, draft the spec, build.
   No mid-build redesigns. The one micro-decision I deferred to
   sign-off ("destroy token on remove vs. return to tray") landed
   quickly.
2. **Component surface from Phase 6 paid dividends.** `CardDragLayer`
   was domain-generic so `TokenDragLayer` was a ~120-line sibling
   with the same spring + shake vocabulary; no entanglement.
   `DissolveCard` dropped into `PreVaultedList` unchanged. The
   "three-size Card" work from P6.1 is what made the VAULTED overlay
   a single pass instead of three.
3. **SQL smoking via DO-block + intentional rollback** caught the
   happy path and the cap guard in two queries each. No test
   fixtures, no local DB gymnastics — just raise-to-rollback.
4. **Slice boundaries held.** P7.1 (shell) unblocked P7.2 (tokens
   needed the bottom strip) and P7.4 (drawer action row), but the
   slices landed in strict sequence without needing to revisit
   earlier commits.
5. **The RSC → client function-prop trap caught early again.** First
   `/palette` iteration for Applied Tokens passed `onRemove={() =>
   {}}` from the server component and blew up at runtime. Same
   lesson as ADR-0011 #2: wrapped in a client submodule
   (`token-demo.tsx`) and moved on. Worth leaving a snippet in
   CLAUDE.md if this happens a third time.

## What surprised us

1. **Enum `ADD VALUE` in a transaction.** Migration 0020 adds a
   `vault_destroy` value to `coin_reason` and migration 0021
   references it in the new SQL fn. Postgres 12+ allows `ADD VALUE`
   in a transaction, but the new value can't be referenced in the
   same transaction. `supabase db push` applies each migration file
   as its own transaction, so splitting across 0020/0021 was fine —
   but if I'd put both in one file it would have silently failed at
   runtime rather than at migration time. Good reason to always
   split `ADD VALUE` from its first use into sibling migrations.
2. **Diamond doesn't quite fit at 800px viewport.** 4 rows × 134px
   cards + padding overflows the ~472px middle pane. The lineup
   shell keeps the page from scrolling by letting the diamond pane
   scroll internally — acceptable degradation, but eyeballing on
   prod the overflow is noticeable. Candidate for a follow-up that
   shrinks the slot card on the diamond (or reflows the diamond
   layout) without touching the shared `<Card>` size tokens.
3. **Global `prefers-reduced-motion` CSS wasn't in place.**
   Phase 6's reduced-motion work was done at the framer-motion
   layer (`useReducedMotion` hook). The CSS-side animations (shadcn
   `animate-in/out`, tooltip transitions) were uncovered. Fixed in
   P7.5 with a single `@media` rule that zeros animation + transition
   duration globally. Should probably have existed since Phase 6;
   capturing as a precedent for future polish.
4. **Projected FP has no scoring model yet.** P7.1 ships a heuristic
   (career FP / plays used, tier baseline for unplayed cards). It's
   honest but rough — finish a real projection pass before anyone
   calls the number "wrong."

## What we deliberately simplified

1. **Drag-drop E2E stayed deferred.** ADR-0011's conclusion held —
   Playwright's HTML5 DnD is fragile enough that state-level
   assertions + `/palette` visual regressions are the right
   trade. The P7.5 E2E (`midseason-vault.spec.ts`) covers the
   non-drag flow (signup → claim → vault → destroy); token apply
   and lineup-click-detail rely on the pattern proving itself on
   prod with the test account.
2. **`commit_vault_selection` didn't get updated.** Existing SQL
   fn still rejects already-vaulted cards, so a user with mid-
   season vaulted cards would hit an error at end-of-season
   ceremony. Season isn't closing for months; punted to a later
   slice (documented in the P7.4 commit and §7 of the polish
   spec).
3. **Collection grid kept its Link-based navigation to
   `/collection/[cardId]`.** P7.3 added the drawer pattern to the
   lineup only; migrating Collection to the shared drawer is a
   scope-appropriate follow-up. The Collection full-page detail
   continues to work (and now includes the Add-to-Vault action
   too).
4. **`+ TOKEN` inline strip removed from `<Card>` without a
   backfill.** Collection surfaces lost the "has applied token"
   visual indicator since the corner overlay is only wired on
   lineup surfaces. Low-severity — users will re-encounter tokens
   when they click into the detail view. Fix in the Collection
   drawer migration slice.
5. **Vault destroy refund fixed at 15%.** Spec proposed tier-
   scaling; economics-wise 15% of each tier's quick-sell value
   does that linearly. If telemetry shows arbitrage (pack → vault
   → destroy for net coins) we revisit — worth instrumenting as
   part of the PostHog `vaulted_card_destroyed` event we already
   emit.

## What's ready for the next polish pass

- `SidebarCard` primitives (section / stat / row) are shared
  between Collection and Lineup; future pages can opt in for free.
- `TokenDragLayer` is a reusable sibling pattern — any additional
  small-asset drag (shop pack drag? future trade slot?) can clone
  ~60 lines.
- `CardDetailDrawer` + `getCardDetail` action form a replaceable
  unit for the future Collection-drawer migration. One change to
  Collection grid (`<Link>` → onClick → drawer state) and the
  migration is done.
- `PreVaultedList` is the blueprint for "grid of cards with a
  destructive action" — same pattern would fit a future tier-down
  revert flow, shop refund flow, etc.
- Global reduced-motion CSS + the `useReducedMotion` hook together
  give us confidence that any future shadcn or framer-motion
  addition degrades gracefully without bespoke wiring.

## Open items

1. **`commit_vault_selection` update for pre-vaulted cards** —
   minimum: relax the `is_vaulted = false` guard; idempotent
   vault_entry insert for cards already vaulted via 'midseason'.
   Also the P7.4.7 ceremony UI work (last-chance destroy in the
   ceremony) depends on this.
2. **Collection-surface corner token indicator.** Either migrate
   Collection cards to the drawer pattern or add the corner
   `AppliedTokenBadge` at the grid level.
3. **Diamond at 800px viewport.** Revisit smaller slot cards or a
   reflowed diamond so the middle pane doesn't scroll.
4. **Projected FP model.** Replace the heuristic with a real per-
   card projection — probably driven by the MLB data we already
   pull.
5. **Collection-to-drawer migration** (user-facing: single-click
   opens drawer instead of navigating to full page). Keeps page
   state for filters / scroll position.
6. **Slot ↔ slot / slot ↔ bench drag** — still pending the
   `swap_lineup_slots` SQL fn from ADR-0011.
7. **Drag-drop E2E revisit** — once real user cohort / bug-rate
   motivates it.

## Estimate vs reality

Estimate: 4–5 days. Shipped: five commits in the session. Held.

## Consequences

- Lineup page no longer feels like a scrolling form. The shell +
  stacked bench/tokens fit the 800px budget; sidebar surfaces
  auto-subs + readiness + submit at a glance.
- Tokens are first-class physical objects. Drag-to-apply, corner
  overlay, click-to-remove are coherent with the Phase 6 card
  motion vocabulary.
- Vault ceases to be a once-a-year moment. Users can mark any
  card as a keepsake any time, and the destroy-with-refund path
  gives them a way out without silently losing the card.
- The motion + card seams compound. Each polish slice rides on
  the shared plumbing from the previous ones; Phase 8 should
  continue extending rather than reinventing.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective (Vault + Milestones + Leaderboards).
- ADR-0010 — Phase 5 Retrospective (Seasonal crons + rank finalize).
- ADR-0011 — Phase 6 Retrospective (Feel Pass v1.1).

# ADR-0040 — Phase 40 (Token trigger indicators) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 40 (v1.25)
**Companion specs:** `draft-deck-polish-spec.md` §128–§132,
`docs/roadmap-phase-40.md`.

---

## Context

User audit question: "Are we actually checking for the token
trigger condition and adding bonus FP to the player's total?"
Audit surfaced **three** cascading issues:

1. `_apply_game_event_to_lineups` (the scoring pipeline) was
   gated on `ce.status IN ('submitted', 'live')`. Phase 39
   removed the user-initiated Submit flow, so entries sit in
   `'building'` indefinitely — the scoring loops matched zero
   rows for every webhook event. No base FP, no trigger
   evaluation, no `triggered = true` updates.
2. Even if scoring had been running, `triggered = NULL` was
   never flipped to `false` anywhere. "Pending" and "missed"
   were indistinguishable in the data.
3. No UI surfaced any of the three trigger states.

Migration 0043 (shipped before this phase) fixed (1). Phase 40
fixes (2) and (3).

## Decision

### Server

- **Migration 0044**: `_finalize_contest_entry` marks any
  remaining `triggered = NULL` applied-token rows as `false`
  before consuming + cleaning up. Three-state model now lives
  in the data:
  - `NULL` → pending (no fire yet AND entry not finalized)
  - `true` → hit (fired mid-game via `_apply_game_event_to_lineups`)
  - `false` → missed (game over, never fired)

### Client

- **Plumbing**: `tokenApplications[].triggered` came back from
  the DB all along; the page handler was stripping it before
  passing to `LineupView`. Restored, threaded through
  `tokenApps` → `slotFills.appliedToken.triggered` → both
  `LineupSlot` / `AppliedTokenBadge` and the sidebar roster row.

- **§129 AppliedTokenBadge**: new `triggered?: boolean | null`
  prop. Pending = current behavior (hover shows remove X). Hit
  = permanent emerald ✓ corner chip. Missed = permanent red ✗
  corner chip plus 50% opacity on the whole badge. Resolved
  tokens are non-interactive (result is final).

- **§130 Roster row glyph**: `RosterRow` in AppSidebar appends
  a tiny ✓ / ✗ after the FP cell when a token is applied.
  Color-matched to the badge.

### Deferred

- **§131 Event feed trigger rows** — the existing
  `LiveEventsProvider` only subscribes to `game_event`, not
  `token_application`. Tagging an event as "token hit" would
  require either a new realtime subscription on
  `token_application` or a server-side synthetic event row.
  Punted. Badge + roster glyph cover the primary question for
  v1.

## Consequences

**What got better:**

- Three token states are now visible at a glance: gold pending
  badge, green hit chip, red missed chip + dimmed.
- Scoring pipeline actually runs (migration 0043 from the
  audit) — no more silent-zero live_fp.
- Finalize marks misses deterministically, so the data is
  consistent even if the finalize cron runs late.

**What's still open:**

- Misses resolve only at **contest entry finalize**, not per-
  game. If Brady House's game ends at 4pm but Mookie Betts's
  runs to 11pm, Brady's missed tokens don't show ✗ until the
  whole entry wraps up. Faster per-game feedback would need a
  game-end reconcile hook. Noted as out-of-scope in §132.
- Event feed still doesn't call out trigger events
  distinctively. Same reason — LiveEventsProvider subscription
  shape doesn't cover `token_application` changes. §131.
- No retroactive fix for token_applications in past contests
  that still have `triggered = NULL` — they'll stay null
  forever since those entries already finalized before
  migration 0044. Cosmetic only; no gameplay effect.
- No trigger animation / celebration on the badge when a
  token fires mid-game. Possible follow-up phase.

## Tricky bits

- The optimistic `useOptimistic` reducer for token apply had
  to also carry `triggered: null` on the synthetic patch,
  otherwise TypeScript complained about the state shape.
  Mirror the DB default.
- Biome flagged `aria-label` on a plain `<span>` in the
  `TriggeredGlyph` — replaced with a `sr-only` span prefix
  and kept `title=""` for the hover tooltip.
- `AppSidebar`'s local `SlotFill` type was narrower than
  `LineupView`'s (bonusFp only). Widened to accept the
  `triggered` field optionally so both consumers can share
  the shape.

## Alternatives considered

- **Mark misses at each individual game's finalize.**
  Rejected for v1 — would need a new game-end SQL function
  (`_reconcile_game_finalize` or similar) and wiring into
  the BDL webhook. Worth revisiting if the delay between
  first-game-final and contest-final bugs users.
- **Drop the missed state entirely; just fade the pending
  badge when the slot's game finalizes without the fire.**
  Rejected — the explicit ✗ is unambiguous and matches the
  stated gameplay rule ("tokens are one-time use — hit or
  miss").
- **Use the FP delta in the event feed as an implicit
  "token hit" signal.** Rejected — the delta includes the
  token bonus already, but visually it's indistinguishable
  from the base event FP. Users wouldn't notice.

## Links

- Commit: (forthcoming) `feat(token): P40 pending / hit /
  missed state on badge + roster`
- Migration 0043 (scoring gate fix) — prereq audit finding.
- Migration 0044 (mark misses at finalize).
- Polish spec: §128, §129, §130, §131, §132
- Roadmap: `docs/roadmap-phase-40.md`
- Related: ADR-0041 (P41 one-time-use tokens) — Phase 40
  depends on consumed_at logic landing first.

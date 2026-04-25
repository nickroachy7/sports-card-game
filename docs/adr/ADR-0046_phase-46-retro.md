# ADR-0046 — Phase 46 (Sticky lineups) Retrospective

**Status:** Accepted · **Date:** 2026-04-25
**Phase:** Phase 46 (v1.31)
**Companion specs:** `draft-deck-polish-spec.md` §171–§180,
`docs/roadmap-phase-46.md`.

---

## Context

The DFS-style fresh-slate-every-day model fights the rest of
the design. Cards are persistent (career FP, tier progression,
vault); the lineup that uses them was ephemeral. Surfaced on
Apr 25 when the user logged in to find their Apr 24 lineup gone
+ today's lineup empty + games already final on cards they
couldn't roster anymore.

User direction:
> "It's not really drafting every day, it's setting your
> lineup every day. Auto setting or manual setting, but also
> giving control over individual players. Some users might
> want to keep a couple guys in there automatically but they
> might also be trying to do one game cards and we shouldn't
> penalize those players for forgetting to check their lineup
> that day."

## Decision

### §171–§172 Per-slot sticky flag, default true

- New `contest_lineup_slot.is_sticky boolean NOT NULL DEFAULT
  true`. All existing slots become sticky retroactively.
- Setting lives per-slot (not per-card). Matches "this slot
  for this purpose" mental model from interview.
- New placements default sticky; explicit toggle for one-shot.

### §173 Slate rollover carry-over

`create_contest_entry()` rewrites:
- Looks up user's most recent prior entry within a 7-day window
  whose contest started before today's contest, and which has
  at least one filled, sticky slot.
- For each sticky slot in the prior entry, attempts to carry
  the starter forward into today's matching position:
  - Skip if card no longer owned, vaulted, or expired
  - Skip if today's slot is already filled (idempotent — won't
    stomp a manual placement)
  - If player has a game today: copy starter_card_id + sticky
  - If player has no game today: leave slot empty but preserve
    is_sticky=true (smart-auto may fill via existing flow)
- Implemented as `_carry_over_sticky_slots(user_id, entry_id,
  starts_at, game_ids)` helper, called both on entry creation
  and on idempotent re-fetch.

### §174 Smart-auto fallback

Smart-auto for empty sticky slots leverages the existing
`auto_sub_mode = 'smart_auto'` infrastructure. No new code
path; sticky-emptied slots show up as "needs filling" same as
ineligible-starter slots already did.

### §175 Per-slot pin toggle UI

`LineupSlot` gains an optional `isSticky` + `onToggleSticky`
prop pair. Pin icon (Lucide `Pin`/`PinOff`) sits in the
top-right corner of filled, unlocked slots:
- Sticky → filled tier-gold pin
- One-shot → outlined muted pin-off

Click toggles. Hidden when slot is locked (lock glyph owns
that corner) and when slot is empty.

### §177 `toggleSlotSticky` Server Action

Wraps `public.update_slot_sticky` SQL helper. Asserts ownership
+ per-slot lock state before mutating. Standard error mapping
via `mapDbError`.

## Consequences

**What got better:**

- "Set it and forget it" works. Yesterday's lineup pre-fills
  today; user only intervenes when they want to chase a
  matchup.
- Solves the "user opens app at 3pm, half their lineup is
  already locked" problem from the Apr 25 feedback.
- Per-slot toggle gives power users explicit control without
  forcing the choice at draft time.
- Existing smart-auto flow handles "sticky player not playing
  today" gracefully — empty slot is filled from bench.

**What's still open:**

- No notification when carry-over partially fills (e.g. 8/10
  slots carried, 2 had ineligible cards). User just sees the
  current state; might wonder why some slots empty.
- Token carry-over not handled. Tokens consume daily per
  Phase 41 — user re-applies each morning. Could revisit if
  users want sticky tokens too.
- 7-day lookback cap means a 30-day-inactive user starts
  fresh. Probably fine.
- No bulk "make all my slots one-shot" affordance. Per-slot
  click only.

## Tricky bits

- `_carry_over_sticky_slots` runs both on new entry creation
  AND on idempotent re-fetch (for the case where the entry
  exists but has empty slots from the pre-Phase-46 era).
  Required because the existing entry path returns early in
  `create_contest_entry`.
- `LineupSlotVM` gained `slotId` + `isSticky` — needed by the
  client-side handler to identify the target slot for
  `toggleSlotSticky`. Required adding `id` to the slot select
  in `page.tsx`.
- Pin position competes with the per-slot lock glyph (also
  top-right). Lock takes priority; pin only renders when
  `!locked`. Avoids overlap.
- Carry-over JOIN through `card` + `player` to check vault /
  expiry / team status. Skip-if-stale logic baked into the
  cursor loop.
- `release_stale_contest_holds` (from Phase 45 hot-fix) still
  runs alongside this. The two are now compatible: stale-hold
  finalizes any active entry properly first, then this
  carry-over pre-fills today from yesterday's now-properly-
  finalized lineup state.

## Alternatives considered

- **Per-card sticky default.** Rejected via interview — users
  think "this slot, this matchup" rather than "this player
  always."
- **One-shot by default.** Rejected — violates the "no
  penalty for forgetting" principle.
- **Full season-long fantasy model** (set roster once, play
  for the full season). Out of scope — daily slates remain
  the unit of competition. Sticky lineups give the
  collecting-game feel without changing the underlying
  contest model.
- **Carry-over via cron at 4 AM ET globally.** Rejected —
  per-user via `create_contest_entry` is naturally idempotent
  and ties into the existing /lineup page-load flow. No
  additional cron infrastructure.

## Links

- Commit: (forthcoming) `feat(lineup): P46 sticky lineup
  carry-over`
- Polish spec: §171, §172, §173, §174, §175, §176, §177,
  §178, §179
- Roadmap: `docs/roadmap-phase-46.md`
- Related: ADR-0045 (Phase 45 pack pool quality) — the
  sticky carry-over depends on the canonical 26-man +
  game-state plumbing established there.

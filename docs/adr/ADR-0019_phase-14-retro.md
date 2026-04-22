# ADR-0019 — Phase 14 (Polish Bundle) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 14 (Feel Pass v1.8 — backfill fix + cross-fade + contract glow)
**Companion specs:** `draft-deck-polish-spec.md` §28–§32,
`docs/roadmap-phase-14.md`.

---

## Context

Three tied-to-recent-work items carried over from the
Phase 12–13 retros:

1. **P13 backfill match rate capped at ~76%.** ADR-0018
   flagged it as a follow-up; the 187 residual unmatched
   rows meant ~24% of cards would never get a photo
   without manual SQL.
2. **Sidebar swap snap.** ADR-0018 deferred the cross-fade
   as "decide by smoke" — daily use confirmed the abrupt
   mode change reads jarring.
3. **Per-slot contract-depletion glow.** ADR-0015 parked
   this for 3 phases as a natural sibling to the P12 FP
   glow. Enough signal now that live scoring had been
   running for weeks.

Estimated: ~2 days. Shipped in 4 commits + plan commit in
one session.

## Decision

- **Backfill.** Add `hydrate=currentTeam` to MLB Stats API
  search + Levenshtein ≤ 2 fuzzy fallback + `?retry_failed=
  true` param. Extract helpers to a pure module for unit
  tests.
- **Cross-fade.** One reusable `<SidebarFadeSwap>`
  component with a `modeKey` prop. `AnimatePresence
  mode="wait"` + 200ms opacity/y envelope. Reduced-motion
  drops the wrapper entirely.
- **Contract glow.** Separate `<CardContractEventsProvider>`
  subscribing to `public.card` UPDATEs (migration 0028).
  `<SlotContractGlow>` mirrors `<SlotFpGlow>`'s envelope
  with amber color + "−1 play" pill. Filters strictly to
  decrements.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `3e50bc27` | Polish spec §28–§32 + `docs/roadmap-phase-14.md`. |
| P14.1 | `2acc691c` | `hydrate=currentTeam` + `normalizeName` + `levenshtein` + `?retry_failed=true`. Pure helpers extracted to `src/lib/mlb/name-match.ts`. 12 unit tests in `tests/unit/name-match.test.ts`. Runbook entry updated. Response shape gains `strategies` breakdown. |
| P14.2 | `d27632eb` | `<SidebarFadeSwap>` component. 200ms opacity + y: 4→0→-4 cross-fade via AnimatePresence mode="wait". Reduced-motion skips wrapper. Wired into both lineup + collection pages. |
| P14.3 | `dc35fbc4` | Migration 0028 (`public.card` → `supabase_realtime` + REPLICA IDENTITY FULL) — applied to prod via `supabase db push --linked`. `<CardContractEventsProvider>` + `useCardDepleteEvent` hook. `<SlotContractGlow>` motion overlay. `LineupSlot` renders alongside `<SlotFpGlow>`. |
| P14.4 | *(this)* | ADR-0019. |

One prod deploy after P14.1 to run the backfill retry. Prod
is live at `draft-deck.vercel.app`.

## What went well

1. **`<SidebarFadeSwap>` shipped in 60 lines + 2 one-line
   call-site changes.** Reusable abstraction captured the
   whole animation story + reduced-motion posture in one
   place. Future pages that want the same pattern import
   it and move on.
2. **Extracting `normalizeName` + `levenshtein` to a pure
   module paid off immediately.** 12 unit tests locked in
   the diacritic + suffix + typo edge cases. If the matcher
   needs to grow (middle-name insertion, nicknames, etc.)
   the tests ratchet the new strategies without manual
   browser verification.
3. **Migration 0028 was a 2-line SQL file.** Phase 12's
   migration 0027 set the pattern (`REPLICA IDENTITY FULL`
   + `ALTER PUBLICATION supabase_realtime ADD TABLE`);
   Phase 14 copied it for `card`. The same pattern is now
   established for any table that needs Realtime UPDATE
   payloads.
4. **Separate provider for contract events, not extending
   `<LiveEventsProvider>`.** Game events and card events
   are different tables, different event types, different
   keys. Keeping them in separate providers means either
   can evolve without coupling.
5. **The "filter strictly to decrements" rule kept the glow
   semantically meaningful.** Card UPDATEs fire for token
   applications, tier bumps, vault flags, etc. — the glow
   only wants the "play used" signal. One-line check in
   the Realtime handler filtered everything else out.
6. **`supabase db push --linked` continues to Just Work.**
   Second migration this session (0027 in Phase 12, 0028
   now) — no Docker, no MCP drift, no incidents.

## What surprised us

1. **The Phase 14 matcher picked up only 7 additional
   players (~76% → ~77%).** Far short of the 90% target
   from spec §28. Running `?retry_failed=true` through
   12+ batches produced 0 additional matches after the
   first two. The residual 180 players are genuinely
   unmatchable with `statsapi.mlb.com/api/v1/people/search`
   — likely minor leaguers on the 40-man that the search
   endpoint doesn't return (it appears to filter to MLB-
   service-time players). A proper fix would use the
   `sports/1/roster/40-man` endpoint per team, which is a
   different API shape + needs team enumeration.
2. **`hydrate=currentTeam` fixed some same-name ambiguity
   but not most.** Of the 7 new matches, only 1 came from
   `team_disambiguated`. Most of the win was from fuzzy
   (4 matches) — one-character typos in our DB that I
   didn't realize were present until Levenshtein surfaced
   them.
3. **`retry_failed=true` needs pagination across batches.**
   Without the `photo_synced_at IS NULL` skip filter,
   every batch processes the same alphabetically-first 40
   rows. Ran 2 useful batches; batches 3–12 were no-ops
   because the same failures kept surfacing. The runbook
   recipe should recommend `&offset=N` (future
   improvement) or just "run once per matcher change, not
   in a loop."
4. **Docker remained hung for the 4th consecutive phase.**
   Pattern is fully normalized now; the typecheck + lint +
   unit test gate has held up across 3 provider/hook
   patterns + 3 motion components + 3 migrations without
   needing local browser verification. If the pattern ever
   bites us, we'll need to triage on a working Docker;
   until then, it's not blocking.
5. **The glow `newPlays < oldPlays` check had to be in the
   client, not the SQL `UPDATE` filter.** Postgres logical
   decoding emits every UPDATE; client filters. Pattern
   seen before in `useGamesActive` (status flip check).
   Not a surprise but worth noting — Realtime is "emit all,
   filter at edge."

## What we deliberately simplified

1. **No further backfill investigation this phase.** The
   180 residual is an open item. A proper fix needs a
   different MLB Stats API endpoint (`sports/1/roster/
   40Man`) + per-team enumeration. Out of scope for a
   polish bundle; files into Phase 15+ if photo coverage
   becomes a customer complaint.
2. **No card-to-card cross-fade inside the sidebar.** Only
   the mode transition (default ↔ detail) fades. Clicking
   a different card on the collection page while detail
   is already open snaps between cards. Spec-explicit.
3. **Contract glow: starter_card_id only.** Auto-sub
   decrements on `final_card_id` (backup) won't glow
   because the backup isn't on the diamond. The Event Feed
   narrates; acceptable.
4. **No SlotContractGlow unit test.** The animation is
   hard to test deterministically (same posture as
   SlotFpGlow in Phase 12). The decrement-filter logic in
   the provider could be unit-tested if it grows; right
   now it's 1 line.
5. **One `<SidebarFadeSwap>` not per-page variants.** Both
   pages use the same 200ms envelope; no need for
   lineup-specific vs collection-specific timing.

## What's ready for the next polish pass

- **`<SidebarFadeSwap>` is reusable.** Any future page
  with conditional sidebar content (vault, milestones,
  leaderboards, profile) imports it + passes a `modeKey`.
- **`<CardContractEventsProvider>` pattern scales.** The
  "subscribe to table UPDATEs, filter client-side,
  provide via context" template is now established three
  times (LiveEvents, useGamesActive, CardContractEvents).
  Any future hot-table-with-UI-reaction uses the same
  shape.
- **`src/lib/mlb/name-match.ts` is the matcher registry.**
  Future fuzzy-match tweaks land here + get tests
  alongside.
- **Migration pattern for Realtime publication is fully
  established.** 3 tables now live (`game_event`, `game`,
  `card`) — same 2-line recipe for any additional.

## Open items

1. **Backfill match rate still ~77%** — the big unfinished
   item. Needs a different MLB Stats API endpoint
   (`sports/1/roster/40Man` per team) + separate pipeline.
   Phase 15+ candidate if photo coverage becomes a real
   complaint.
2. **`retry_failed=true` pagination.** Add `&offset=N`
   so batches don't spin on the same alphabetically-first
   40 rows.
3. **Auto-sub contract glow edge case.** Phase 14's
   contract glow ignores backup decrements (they happen
   off-diamond). A future slice could surface this via
   the Event Feed or a small marker on the bench card.
4. **Sound cue on positive-FP events** — still parked.
5. **Onboarding pass** — still the highest-impact remaining
   retention item.
6. **All standard parked items** — a11y audit, empty/error
   sweep, tier foil motion, dupe picker, mobile, rank
   display.

## Estimate vs reality

Estimate: ~2 days. Shipped: 4 commits + plan + ADR in one
session (~90 minutes of work). Under the estimate. The
matcher improvement was the only item that didn't land
cleanly — the fuzzy fallback worked mechanically but
didn't hit the match-rate target; moved the needle only
marginally. The cross-fade + contract glow were both
routine by this point — established patterns from prior
phases made them shipping-easy.

## Consequences

- Sidebar swap on both pages now animates. Users get a
  visual cue that context changed rather than a content-
  swap surprise.
- Cards now show real player photos for the same ~77% as
  after Phase 13 — no meaningful change for end-users.
  The matcher improvements are surfaced (7 more players
  with photos, mostly typo-fixes) but not the step-change
  the spec targeted.
- Live play gets another ambient signal: when a starter
  burns a contract play, the slot pulses amber in sync
  with the Event Feed's narration. Users who were
  previously surprised by a "wait, that card's contract
  is down already?" question now see the moment of
  depletion.
- Three real-time providers (LiveEvents, useGamesActive,
  CardContractEvents) + three publications in
  `supabase_realtime` (game_event, game, card). The
  pattern is well-worn; future feature work can copy it
  without design decisions.

## Related ADRs

- ADR-0017 — Phase 12 Retrospective (Live-View Liveness).
  FP glow pattern Phase 14 copies for contract glow.
- ADR-0018 — Phase 13 Retrospective (Unified Sidebar +
  Photos). Backfill baseline + deferred cross-fade that
  Phase 14 closes.

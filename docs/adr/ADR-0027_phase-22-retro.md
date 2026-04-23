# ADR-0027 — Phase 22 (Live-State Polish) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 22 (Feel Pass v1.13)
**Companion specs:** `draft-deck-polish-spec.md` §62–§67,
`docs/roadmap-phase-22.md`.

---

## Context

Phase 21 closed the bench-legibility gap but left six parked
items. User asked to clear the top five plus a visual call-out:

> "the bench is a little hard to read now with those numbers
> stacked horizontally together. I still want this design to
> be uniform to the starting lineup slots though, maybe we
> do something different?"

Parked items addressed:
1. Bench filter chips for game state
2. Collection page "has game today" filter
3. Full doubleheader support
4. Outs live-tracking
5. `contest_status` enum cleanup (parallel to Phase 20's
   `contest_entry_status`)

Estimate: ~1.5 days. Shipped in one afternoon across five
feature commits (+ two follow-up fix commits caught in prod).

## Decision

Five slices, shippable in any order; the pill (P22.1) was the
visual tentpole everything else borrowed from.

- **P22.1 Tone-washed pill** — wrap every `<SlotGameState>`
  footer + bench variant body in a rounded-full bordered span
  tinted by `pillTone(status)`. Live = emerald wash, final =
  muted surface-2, scheduled/off = neutral surface-2.
- **P22.2 Filter chips** — bench + collection get a
  matching chip row (`All · Pre · Live · Final · Off`).
  Factored the contest-scoped game lookup into a shared
  `fetchSlotGameByCardId` server helper; the pure-TS
  `matchesGameStateFilter` + `GameStateFilter` type live in a
  separate `game-state-filter.ts` so client components don't
  drag `pg` into the browser bundle.
- **P22.3 Outs tracking** — migration 0034 adds
  `public.game.current_outs` (smallint NULL, CHECK 0-2);
  webhook handler IS-DISTINCT-FROM idempotent update on every
  batter event; LIVE footer renders `LIVE · T5 2O · 2-1`.
- **P22.4 Doubleheader support** — migration 0035 adds
  nullable `game_number` + partial unique index on
  (date, home, away, game_number) WHERE NOT NULL. Dedup
  backfill ranks partners by event_count DESC (keeps the BDL-
  authoritative row, not the earliest empty one), re-parents
  stragglers, deletes losers. MLB Stats second pass populates
  gameNumber for NULL rows; has_double_header window function
  gates the `(DH1)/(DH2)` marker in the slot footer.
- **P22.5 `contest_status` enum cleanup** — migration 0036
  drops `'locked'` per Phase 20's recipe (rename-create-drop-
  DEFAULT-drop-function-alter-restore-drop-old). The one
  function dependency (`vault_card_midseason` had
  `co.status IN ('locked', 'live')`) narrowed to
  `co.status = 'live'`.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `94d0686b` | Polish spec §62–§67 + roadmap. |
| P22.1 | `cc8bd5c1` | Tone-washed pill on SlotGameState. |
| P22.3 + P22.4 | `3035022f` | Migrations 0034 + 0035, webhook handler outs, MLB Stats gameNumber pull, SlotGameState outs + DH marker, window-function has_double_header. |
| P22.5 | `354cc0c6` | Migration 0036, enum narrow, `vault_card_midseason` recreated. |
| P22.2 | `23d46d5e` | `fetchSlotGameByCardId` helper, bench + collection chip rows, collection page contest lookup. |
| Roadmap | `561808fa` | Mark P22.1–P22.5 shipped. |
| Fix 1 | `e1bbc26d` | Split `game-state-filter.ts` out of `fetch-slot-games.ts` after the first Vercel build failed pulling `pg` into the client bundle. |
| Fix 2 | `4897d9d3` | MLB Stats subquery ORDER BY `IS TRUE DESC` (Postgres sorts NULL FIRST in DESC, which was picking unclaimed rows and hitting the partial unique) + self-healing BDL dupe cleanup tail step on `syncScheduleHorizon`. |
| P22.6 | *(deploy)* | All three migrations applied to prod; two Vercel deploys; prefetch cron re-run; 16 stale BDL dupe rows cleaned (8 manual, 8 by new self-healing). |
| P22.7 | *(this)* | ADR-0027. |

Prod verification after the final deploy:
- Bench + lineup slots render tone-washed pills uniformly.
- Bench + collection chip rows narrow by game state with
  counts that reflect the current position/tier/status
  filters.
- One NULL-game_number row persists (CHW@WSH 2026-04-25 —
  BDL-only ghost, MLB Stats hasn't listed it yet); zero
  matchup-date collisions; 67 claimed rows at game_number=1.
- `contest_status` enum now has 4 values
  (`pending / live / final / canceled`); no rows lost.

## What went well

1. **The pill treatment paid off twice.** Wrapping the game-
   state body in a bordered pill not only fixed the bench
   readability call-out but also gave the filter chips their
   tone vocabulary — the chip is visually a clickable
   preview of the pill it selects. Cheap uniformity.
2. **`fetchSlotGameByCardId` extraction.** The lineup page
   had the query inline; pulling it into a helper to reuse
   on the collection page simplified both call sites and
   left a clean template for future per-card-per-contest
   lookups.
3. **Partial unique index + NULL game_number is the right
   DH shape.** BDL emits both DH games as siblings before
   MLB Stats enriches them; the partial unique lets them
   co-exist as NULLs, then locks down uniqueness once the
   second pass claims them. No ordering constraint between
   the two sources.
4. **Event-count ranking in dedup.** Migration 0035's dedup
   CTE ranks by `event_count DESC` first, which kept the
   BDL-authoritative partner (the one receiving events) and
   dropped the empty one. Had this been `created_at ASC`
   first we'd have kept the wrong row in every prod pair
   observed — the partner with events was always created
   SECOND.
5. **P20 enum-narrow recipe held up.** Fourth time running
   the rename-create-drop-alter-restore-drop pattern. Migration
   0036 had only one function dependency to carry forward.
   Recipe is now muscle memory.
6. **Self-healing dedup tail.** Instead of a one-shot backfill
   that would let BDL's quirks rebuild dupes between crons,
   the tail step in `syncScheduleHorizon` re-cleans every
   tick. Observed in production on the very next cron run
   (8 fresh dupes detected + dropped).

## What surprised us

1. **Vercel build caught the client/server leak.** The first
   deploy failed because the `matchesGameStateFilter` function
   + `GameStateFilter` type lived in the same module as the
   `getDb()`-using helper, and two client components imported
   them. Tsc passed locally; Next's bundler noticed. Lesson:
   always split pure-TS utility modules from modules that
   import server-only primitives, even when nothing currently
   imports them cross-boundary — inevitable later coupling.
2. **Postgres NULL + DESC ordering.** The MLB Stats subquery's
   `ORDER BY (game_number = N) DESC` was intended to prefer
   claimed rows; we forgot Postgres's NULLS FIRST default for
   DESC. `(NULL = N)` evaluates to NULL, which landed first,
   sending the UPDATE at the wrong row and violating the
   partial unique. Fix was one keyword pair (`IS TRUE DESC`)
   but the bug only surfaced in prod on the first real BDL
   dupe pair.
3. **BDL keeps emitting dupes.** Expected this to be
   occasional; the very next cron tick produced 8 new ones
   across the 3-day horizon. The self-healing tail step is
   now load-bearing, not just defensive.
4. **`contest_status` cleanup had one function dependency
   we hadn't catalogued in Phase 20.** `vault_card_midseason`
   had `co.status IN ('locked', 'live')` — a vestigial check
   that P18's per-slot lock rendered pointless (the
   `ce.status IN (...)` guard on the same query already gates
   it). Narrowed to `'live'`; no behavior change.
5. **The chip row worked better on bench than collection at
   first.** Bench chips are inline in the header, compact;
   collection chips live on their own row above the select
   filters, which feels like a lot of chrome. Might revisit
   if users complain, but the chip rows are independent so
   each surface can iterate without coupling.

## What we deliberately simplified

1. **No baserunners.** Spec §67 parks it. `current_outs`
   alone pushes LIVE legibility meaningfully; base state is
   visually noisier and lower-signal per pixel.
2. **No collection multi-day schedule view.** §67 parks.
   Today-only chips get the 90% use case.
3. **DH marker only renders when `hasDoubleHeader=true`.**
   A single-game matchup with `gameNumber=1` (MLB Stats
   default) doesn't get suffixed — correct, prevents "(DH1)"
   from reading as a confusing label.
4. **Chip `Off` includes postponed/suspended/canceled.**
   Users care about "not actionable today"; the distinction
   between "no game" and "game got canceled" isn't worth its
   own chip.
5. **Parallel chip-component definitions** on bench +
   collection. Pulling them into a shared module would mean
   a client-only barrel or separating by directory. At two
   instances it's not worth it; flagged for refactor if a
   third surface wants one.
6. **Manual cleanup of 8 stale prod dupes** rather than
   waiting for the next cron tick. Belt-and-suspenders; the
   self-healing is verified, and the manual delete avoided
   any interim cron blast-radius questions.

## What's ready for the next polish pass

- **Tone-washed pill shape** is a reusable template —
  `PILL_BASE` + `pillTone()` could become a `<StatePill>`
  primitive if the leaderboard, profile page, or any other
  state-bearing surface wants it.
- **`fetchSlotGameByCardId` + `game-state-filter` split**
  is the working template for server-query helpers that
  want a client-safe companion module. New data surfaces
  (vault, milestones, leaderboards-per-contest) follow
  the pattern.
- **`game_number` + partial unique** generalizes cleanly to
  any "multiple rows per parent key, unique only when
  enriched" shape — useful for future per-pitcher starts
  vs. relief, per-inning linescores, etc.
- **Self-healing dedup tail** as a pattern for any
  upstream-flaky ingest pipeline. Log-in-summary, idempotent,
  guaranteed safe (no data loss thanks to event_count
  guard).

## Open items

1. **Baserunners** — parked.
2. **Pitcher-on-mound surface** — parked.
3. **Collection multi-day schedule view** — parked.
4. **Onboarding** — still the biggest user-facing parked
   item, going on five phases now.
5. **Insert-side BDL dedup** — currently self-healing via
   DELETE tail; a more robust path would detect the dupe at
   INSERT time and route to the existing partner. Not
   urgent while the tail works.
6. **Chip component dedup** — parallel definitions on bench
   + collection. Refactor trigger: a third surface.
7. **Standard parked items.**

## Estimate vs reality

Estimate: ~1.5 days. Shipped the full feature set in one
afternoon (~4 hours code + two ~2-minute deploys + fix
iterations). Two production fixes landed same-day after
surfacing in the first cron run. The plumbing from Phases
18-20 (webhook shape, realtime subscriptions, slot
game lookup) carried most of the load; Phase 22 bolted the
last visual + filter pass on top.

## Consequences

- Live game footers now carry out-count signal alongside
  inning + score. `LIVE · T5 2O · 2-1` reads as a single
  glance.
- Real doubleheaders can co-exist as distinct rows; the DB
  has the slot to represent them; the UI disambiguates via
  `(DH1) / (DH2)` only when warranted. Ready for the next
  MLB-calendar DH day.
- Bench + collection both answer "which of my cards have
  actionable games right now?" in one chip click.
- The `contest_status` enum is now minimal and matches the
  system's actual state space (no vestigial `locked`).
- BDL dupe rows self-heal on every cron tick; operators
  don't need to manually clean.
- Shared `fetchSlotGameByCardId` helper centralizes the
  contest-scoped game lookup — one place to touch if the
  DISTINCT ON logic or DH surfacing evolves.

## Related ADRs

- ADR-0023 — Phase 18 Retrospective. Shipped `<SlotGameState>`
  + `slotGameByCardId`; Phase 22 extracted and extended both.
- ADR-0024 — Phase 19 Retrospective. Shipped the MLB Stats
  `scheduled_start` second pass; P22.4 extended it to pull
  `gameNumber` + `doubleHeader`.
- ADR-0025 — Phase 20 Retrospective. Coined the enum-narrow
  recipe + `current_inning` populate path. Phase 22 reused
  both (migration 0036, outs-on-live alongside inning).
- ADR-0026 — Phase 21 Retrospective. Shipped the bench
  footer and priority sort; Phase 22 added the pill wrap
  for readability + chip row for filtering.

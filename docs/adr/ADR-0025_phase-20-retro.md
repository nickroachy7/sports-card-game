# ADR-0025 — Phase 20 (Live-Inning Legibility) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 20 (Feel Pass v1.12)
**Companion specs:** `draft-deck-polish-spec.md` §54–§57,
`docs/roadmap-phase-20.md`.

---

## Context

Three Phase 18+19 open items closed together:
1. Live inning on `game` row — webhook handler saw
   `play.inning` / `inning_half` but only wrote to
   `game_event`; slot footer never rendered inning.
2. Doubleheader + duplicate-row rendering — the lineup
   page's in-memory Map collapsed same-matchup-same-date
   rows arbitrarily, so OF3 / SP1 / SP2 users saw
   duplicate entries.
3. `contest_entry_status` enum carried a vestigial
   `'locked'` value from the pre-Phase-18 lock model.

Estimate: ~1 day. Shipped in ~90 minutes, 1 code commit
+ 2 migrations.

## Decision

- Migration 0032 adds `current_inning` + `current_inning_half`
  to `public.game`. Webhook handler writes them idempotently
  on `handleGameStarted` / `handleGameEvent` / `handleGameEnded`.
- Lineup page game query rewrites to
  `DISTINCT ON (home_team_id, away_team_id)` with status
  priority + start-time sort. No schema change for dedup.
- Migration 0033 drops `'locked'` from
  `contest_entry_status` via rename + recreate + re-cast.
  All trigger / policy / default dependencies dropped +
  recreated inline.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `ce50a6f6` | Polish spec §54–§57 + roadmap. |
| P20.1-P20.4 | `b6c29ab8` | Migrations 0032 + 0033, webhook handler inning writes, lineup page dedup query, SlotGameState LIVE branch enhanced, TS enum narrow. |
| P20.5 | *(this)* | ADR-0025. |

Prod verification post-deploy:
- Dedup: test account's OF3 / SP1 / SP2 rows collapse
  from 2 → 1 each. ✓
- 1B (CHC vs PHI @ 7:40pm ET) flipped scheduled → live
  after first pitch; correctly locked. ✓
- `current_inning` remains null until webhook batter
  events arrive for the live games (expected — no events
  have fired since migration 0032 landed).
- Enum reduced to 4 values (`building`, `submitted`,
  `live`, `final`). ✓

## What went well

1. **Idempotent inning UPDATE is clean.** `IS DISTINCT FROM`
   keeps the UPDATE a no-op when the value matches. Realtime
   only broadcasts genuine changes (half-inning transitions,
   ~18/game). No write amplification concern.
2. **DISTINCT ON + ORDER BY priority was a one-query fix.**
   Postgres picks one row per `(home_team_id, away_team_id)`
   using the ORDER BY as the tiebreaker. Live > scheduled >
   final priority + scheduled_start + created_at fallback.
   No app-code changes beyond the SQL rewrite.
3. **Enum narrow was a known recipe.** Rename-create-alter-
   drop is the Postgres-supported pattern for enum value
   removal. Found + handled every dependency inline — the
   three-hiccup sequence (DEFAULT → trigger → 2 policies) was
   a learning moment but each fix was formulaic.
4. **Zero-rows-at-`locked` precheck paid off.** Would've
   been ugly to migrate rows during the `ALTER COLUMN TYPE`
   cast; verifying there were none before the migration
   removed that risk entirely.

## What surprised us

1. **Three sequential dependency errors on migration 0033.**
   Applied attempt 1 → DEFAULT cast error. Fixed → trigger
   dependency error. Fixed → RLS policy dependency error.
   Fixed → second RLS policy (on child table) dependency
   error. Each one a distinct Postgres rule:
   - DEFAULT expressions can't auto-cast to new enum.
   - Triggers with typed WHEN clauses can't survive.
   - RLS policies with enum-literal comparisons can't
     survive.
   Migration file documents each hiccup in a comment so
   the next enum-narrowing migration has the recipe.
2. **Dedup surfaced that today's "doubleheaders" were
   just duplicate rows.** Same start time + same teams +
   same status for both rows = BDL data duplication, not
   a real DH. The dedup query handles both cases uniformly;
   real DHs (different start times) still collapse to one
   via the priority sort.
3. **Contest entry RLS policy depends on enum literals.**
   `USING (... AND status IN ('building', 'submitted'))` —
   Postgres requires the policy be rebuilt when the enum
   rebuilds. Same for the child-table policy that
   EXISTS-references the parent's status.
4. **`contest_lineup_slot_owner_write` is a cross-table
   RLS dependency.** Not obvious from looking at just the
   contest_entry table; had to drop the child-table policy
   too before ALTER TABLE would succeed. Once you know, you
   know.

## What we deliberately simplified

1. **No outs / baserunners.** `game` row tracks just
   inning + inning_half. Richer play-state is overkill
   for the slot footer.
2. **No full doubleheader support.** Second DH game is
   still invisible post-dedup. Acceptable because real DHs
   are rare in-season and the user feedback that drove
   this phase was about duplicate rendering, not DH loss.
   When DH support becomes a real complaint, schema adds
   `game_number` + UI surfaces both games.
3. **No migration test.** The three-hiccup sequence on
   migration 0033 was discovered via iterative push. With
   zero rows at `'locked'` and no production traffic
   depending on the enum value, the iterative approach
   was safer than a speculative dry-run framework.
4. **TS enum narrow doesn't update the generated types
   file.** If Drizzle's `db:generate` were re-run, types
   would align with the new enum. Skipped because we're
   hand-syncing type definitions (TS types in
   `lineup/types.ts` + the enum declaration in
   `db/schema/enums.ts`). Both manually matched.
5. **No inning-changed Realtime broadcast dedup.** The
   webhook fires handleGameEvent on every batter event;
   most batter events don't change the inning. Relying on
   Postgres's per-column UPDATE detection (Realtime only
   broadcasts a row UPDATE when a logged column changes)
   to keep the stream clean.

## What's ready for the next polish pass

- **Inning-tracking pattern** is now the canonical recipe
  for "webhook-driven live game state on the game row."
  Outs / baserunners / pitcher-on-mound could follow the
  same shape.
- **Enum narrow recipe** is documented + migration file
  comments explain each dependency drop. Next enum rebuild
  (e.g., `game_status`, `pack_type`) follows the same
  pattern.
- **DISTINCT ON + priority sort** is reusable for any
  query that needs one-row-per-key with preference rules.
  Future leaderboard queries might benefit.

## Open items

1. **Second doubleheader game surfacing.** Dedup hides it.
   Phase 21+ if real DH scheduling starts being a problem.
2. **Unique index on (date, home_team_id, away_team_id)**
   to prevent future dupe ingests from BDL. Would force
   real DHs to carry a `game_number`.
3. **Outs + baserunners live tracking.** Same shape as
   inning, if ever needed.
4. **Auto-transition `submitted → live`** on first game
   start (cron-driven today).
5. **`contest_status` enum** still carries `'locked'` —
   a different enum for the contest itself (not entry).
   Parallel cleanup if/when the contest-lock concept goes
   away there too.
6. **Onboarding pass.** Still the biggest parked user-
   facing item.
7. **Standard parked items.**

## Estimate vs reality

Estimate: ~1 day. Shipped: ~90 minutes wall time for the
code; ~15 minutes more on migration 0033 iterative
dependency-chasing; ADR 20 minutes. Under estimate
overall. The migration dependencies were the only
surprise and they resolved predictably once each was
surfaced.

## Consequences

- Slot footer on live games can now show "LIVE · T5 · 2-1"
  instead of just "LIVE · 2-1" — the webhook handler
  starts populating the inning columns on the next batter
  event.
- Dedup fixes the double-rendering bug visible in the
  pre-P20 data. Users see exactly one slot-footer-game per
  matchup.
- The `contest_entry_status` enum is now honest about
  what states exist. No more dead enum value for
  developers to trip over.
- Three Postgres dependency patterns (DEFAULT /
  trigger-on-column / RLS-policy-on-column) are captured
  in migration 0033's comments for future enum-shape
  work.

## Related ADRs

- ADR-0023 — Phase 18 Retrospective. Introduced per-slot
  lock + the slot footer / SlotGameState component that
  Phase 20's inning data flows into.
- ADR-0024 — Phase 19 Retrospective. Populated
  `scheduled_start` — Phase 20's dedup query's
  `NULLS LAST` on that column gracefully handles rows
  still missing it.

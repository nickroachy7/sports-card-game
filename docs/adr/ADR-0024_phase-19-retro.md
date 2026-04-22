# ADR-0024 — Phase 19 (Slate Robustness) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 19 (Feel Pass v1.11.1)
**Companion specs:** `draft-deck-polish-spec.md` §50–§53,
`docs/roadmap-phase-19.md`.

---

## Context

User ran Phase 18's new per-slot-lock UI in prod and asked
"Are we on the correct slate day? Will that correctly switch
day to day?" Investigation surfaced three real bugs:

1. **Slate date derived from UTC CURRENT_DATE.** Postgres
   server is UTC; date flips at 8 PM ET. Between 8 PM and
   midnight ET — prime MLB evening — the page would render
   tomorrow's empty slate.
2. **Stale `included_game_ids`.** `create_daily_contest`
   cached games at contest-creation time. Late-day BDL
   syncs that added games to today wouldn't make it into the
   contest's slate.
3. **`scheduled_start` always NULL.** BDL's `MLBGame` doesn't
   expose a game-start timestamp. The Phase 18 slot footer
   showed "TBD" for every pre-game slot and the backup lock
   predicate (`now() >= scheduled_start`) never fired.

Estimate: ~0.75 day. Shipped in one session (~60 minutes,
~230 lines + one migration).

## Decision

- ET-aware slate date with 4 AM ET pivot (`current_slate_date()`
  SQL helper). Matches DraftKings / FanDuel MLB convention —
  late-night West Coast games stay on "tonight's" slate until
  next morning.
- `create_daily_contest` recomputes `included_game_ids` on
  every call, idempotent UPDATE (`IS DISTINCT FROM`).
- MLB Stats API `/api/v1/schedule` as the `scheduled_start`
  source, second pass inside `syncScheduleHorizon`. Matched
  by (date, home_team_abbr, away_team_abbr) via reverse of
  Phase 15's `MLB_STATS_TEAM_IDS` map.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `a1d02dcb` | Polish spec §50–§53 + `docs/roadmap-phase-19.md`. |
| P19.1+P19.2+P19.3 | `c1c6874d` | Migration 0031 (`current_slate_date()` helper + `create_daily_contest` rewrite with ET default + refresh). New `fetchMlbStatsSchedule` helper. `syncScheduleHorizon` second pass for `scheduled_start`. `lineup/page.tsx` + `bdl-games-prefetch/route.ts` drop the `CURRENT_DATE` arg. Drive-by: Biome optional-chain fix in `roster-audit.ts`. |
| P19.4 | *(deploy + curl)* | Applied migration 0031 via supabase db push --linked. Deployed to draft-deck.vercel.app. Ran bdl-games-prefetch: `scheduled_starts_updated: 34` across 3 days, took 1.6s. |
| P19.5 | *(this)* | ADR-0024. |

Verification run post-deploy: test account's 10 slots now have
ET-readable game times; 9 of 10 correctly locked via game
status; 1B (CHC vs PHI @ 7:40 PM ET) correctly unlocked because
its game is still scheduled.

## What went well

1. **Postgres TZ math was straightforward.**
   `(now() AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date`
   does exactly what you'd want. STABLE fn, indexable
   where it matters.
2. **Recompute-on-every-call was the simplest fix for the
   stale cache.** `IS DISTINCT FROM` guard keeps the UPDATE
   idempotent — no-op when the game set matches, so
   `updated_at` only churns on actual changes. Every caller
   (lineup page load + cron) now refreshes; no need to
   thread invalidation separately.
3. **MLB Stats schedule shape was pleasant.** One URL per
   date, returns all games with team IDs + `gameDate` as
   a full ISO timestamp. Zero parsing surprises. Reverse-
   mapped `MLB_STATS_TEAM_IDS` into our abbreviation-based
   UPDATE; took 4 lines.
4. **Second pass inside `syncScheduleHorizon` was the
   right scope.** Keeping it inside the same loop that
   drives BDL upserts means one cron run covers both
   the status sync + the start-time sync. No new endpoint,
   no new schedule.
5. **Verification loop closed cleanly.** Pre-run: all 17
   games had `scheduled_start = NULL`. Post-run: 34
   updates (today + tomorrow + day after = 39 games, 34
   changed). Slot footer will now render "vs PHI · 7:40pm"
   instead of "vs PHI · TBD."
6. **Same-day response: three user-reported issues → plan
   → ship in ~90 min.** The investigation (5 min) →
   diagnosis (5 min) → scope interview (2 min) → build
   (30 min) → deploy + verify (10 min) → ADR (15 min) is
   a clean loop.

## What surprised us

1. **The 4 AM ET pivot turned out to matter more than I
   initially thought.** It's not just "avoid the UTC bug";
   it aligns the slate boundary with the actual end-of-
   baseball-night. A 10 PM PT game ending 1:45 AM ET still
   needs to be on "tonight's slate" for scores to make
   sense. Pivoting at midnight ET would roll mid-game for
   the west coast.
2. **One 1B slot was actually unlocked** all along —
   user's report of "everything is locked" was about 9 of
   10 slots being legitimately done/live. The real bug
   was that the pre-game footer showed "TBD" (no start
   time) so the user didn't realize 1B was still
   actionable. P19 fixes the display side.
3. **`scheduled_start` changes of a few seconds aren't
   real.** The `IS DISTINCT FROM ${iso}::timestamptz`
   guard on the UPDATE protects against re-running the
   endpoint at a different wall clock from churning
   `updated_at`. Glad I added it.
4. **Biome surfaces style fixes unrelated to the current
   phase.** `roster-audit.ts:159` had an outstanding
   `useOptionalChain` warning from Phase 16 that the
   lint step caught; fixed inline.

## What we deliberately simplified

1. **No exposed config for the 4 AM pivot.** Hardcoded in
   the SQL fn. If we need to shift it for MLB postseason
   games (which start later) or a different sport, update
   the fn. Cheap migration.
2. **No test for `current_slate_date()`.** It's 1 line of
   SQL and the behavior is eye-ballable; no value in a
   dedicated unit test against a mocked clock.
3. **Match MLB Stats games by team abbreviation, not
   MLBAM gamePk.** Adding a `mlbam_game_id` column +
   backfill would be a bigger change. Team-pair + date is
   enough — baseball schedules don't have two same-matchup
   games on the same day (doubleheaders get distinct
   MLBAM gamePks but our schema treats them as one row
   per team-pair-per-date anyway; the doubleheader second
   game is a separate Phase 18-open-item).
4. **500ms sleep between MLB Stats fetches.** Stayed with
   the same politeness cadence as the Phase 15 roster
   fetches. No rate-limit issues observed.
5. **No explicit slate-date UI anywhere.** The contest
   name ("Tonight's Slate · Apr 22") is enough narration
   that the user knows which slate is active. A
   "tomorrow's slate" preview would be nice but isn't
   needed now.

## What's ready for the next polish pass

- **`current_slate_date()` is reusable.** Any future
  server-side logic that needs "what's today for MLB" —
  contest creation, reconcile scheduling, auto-sub
  scheduling — imports / calls it. Single source of
  truth for our slate semantics.
- **`fetchMlbStatsSchedule` is the third MLB Stats API
  consumer after roster + search.** Could be extracted
  into a shared `mlb-stats-client.ts` module if the
  count grows. For now, three small files is fine.
- **Idempotent `included_game_ids` refresh** is the
  pattern for any future reactive-to-upstream-data
  SQL fn. `IS DISTINCT FROM` + UPDATE only when changed.
  Recipe established.
- **Cron-path counter instrumentation.** The
  `scheduled_starts_updated` counter joins the Phase 16
  audit counters + Phase 17 player counters as a
  freshness telemetry signal for ops.

## Open items

1. **Live inning / score on `game` row.** Phase 18 open
   item; still blocked on BDL webhook handler populating
   these fields. When it does, the LIVE slot footer gets
   "LIVE · T5 · 2-1" instead of just "LIVE · 2-1."
2. **Doubleheader second-game handling.** Still deferred —
   BDL's representation + our schema both treat a
   doubleheader as one row per matchup-date, which loses
   the second game. Real fix: track `mlbam_game_id` + have
   a row per MLBAM game.
3. **`contest_entry_status` enum collapse** (drop `locked`
   from the enum, phase 18 open item). Cosmetic; Phase 20+.
4. **`scheduled_start` real-time subscription.** Currently
   the client reads `scheduled_start` on page load; doesn't
   react to subsequent sync updates. Acceptable because the
   start time is nearly immutable post-sync; if MLB ever
   reschedules, a manual refresh picks it up.
5. **Onboarding pass.** Still the biggest user-facing
   parked item.
6. **Standard parked items.**

## Estimate vs reality

Estimate: ~0.75 day (~4-5 hours). Shipped: one session,
~90 minutes wall time. Under estimate. All three fixes
landed cleanly — Postgres TZ math + idempotent UPDATE +
one new MLB Stats endpoint with a straightforward shape.
No scope surprises.

## Consequences

- Slate date now pivots at 4 AM ET. Users can check their
  lineup at 10 PM ET, 1 AM ET, or 3 AM ET and consistently
  see tonight's slate; 5 AM ET and later rolls to
  tomorrow.
- BDL-added games throughout the day get picked up in
  the user's contest on the next page load — no more
  invisible-games bug.
- Slot footer renders "vs LAD · 7:10p" (readable local
  ET time) for pre-game slots, enabling actual
  "should I swap this in?" management decisions pre-lock.
- The backup lock predicate (`scheduled_start <= now()`)
  now fires, giving us a safety net if BDL's game status
  lags behind first pitch. Two-pronged lock: status-based
  OR time-based.
- 34 games' start times published for the 3-day horizon
  today; daily cron will keep the window fresh.

## Related ADRs

- ADR-0017 — Phase 12 Retrospective. Introduced `game`
  into the realtime publication; Phase 19's
  `scheduled_start` flows through that channel to the UI.
- ADR-0019 — Phase 14 Retrospective. Introduced the MLB
  Stats API integration (name-match helpers); Phase 19
  extends with the schedule endpoint.
- ADR-0023 — Phase 18 Retrospective. Shipped the per-slot
  lock + slot footer; Phase 19 fixes the TZ + cache + data
  issues that Phase 18's smoke surfaced.

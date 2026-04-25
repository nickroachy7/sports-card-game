# ADR-0048 — Phase 48 (BDL game-state trust predicate) Retrospective

**Status:** Accepted · **Date:** 2026-04-25
**Phase:** Phase 48 (v1.33)
**Companion specs:** `draft-deck-polish-spec.md` §190–§194,
ADR-0047 (P47 retro).

---

## Context

User feedback after seeing 0-0 FINAL pills on the lineup:
> "What about these Ties? There are no ties in baseball.
> We really need to make sure that the card game statuses
> are correct for all cards. Do we need to do a deeper
> spec on this or should we just continue patching by
> error?"

By this point we'd shipped 5 separate patches in 4 days
(P47 v1, v2, v3, plus a TBD-OFF filter), each addressing
a different way BDL emits a `final` we shouldn't trust:

  1. `final` + `scheduled_start > now()`
  2. `final` + `scheduled_start IS NULL`
  3. `final` + `now() − scheduled_start < 2h`
  4. `scheduled` + NULL start (TBD pills)
  5. `final` + `home_runs = 0 AND away_runs = 0`

The same demote logic was reimplemented at three layers
(display CTE, webhook handler, schedule prefetch) with
each new mode increasing the per-layer surface area.
The user's question was right on time: the next anomaly
would need a 6-place edit.

## Decision

Unify the demote logic behind a single SQL predicate:
`public.is_trustworthy_final(status, scheduled_start,
home_runs, away_runs)`. All three callsites consult it.
The next failure mode is one CASE branch in one place.

Three SQL functions in migration `0061`:

1. **`is_trustworthy_final()`** — full predicate (display
   + backfill).
2. **`final_passes_time_check()`** — time-only sub-gate
   (webhook ingest, where scores aren't reconciled yet).
3. **`final_trust_violation_reason()`** — returns NULL or
   a machine code (`missing_start | not_started |
   too_recent | null_score | zero_zero_tie`). Used in
   webhook rejection notes.

Backfill in the same migration demotes existing
untrustworthy finals — caught the BAL@BOS 0-0 case
immediately on prod apply.

## Decisions interview-confirmed

User picked all 4 recommendations in the AskUserQuestion
form (2026-04-25):

1. **Display state for not-trustworthy finals with
   past start:** demote to `live`, scores zeroed.
   Rationale: best-case correct (game still live);
   worst-case more honest than `FINAL T 0-0`.
2. **Threshold:** keep 2 hours. Conservative; covers
   shortest realistic MLB game length.
3. **Scope:** finals only this phase. Live/scheduled
   validation can be follow-ups if BDL surfaces issues.
4. **Telemetry:** `webhook_failed` row + reason code.
   Reuses existing audit table; trivially queryable by
   reason.

## Consequences

**What got better:**

- BAL@BOS 0-0 final demoted on backfill apply; no
  longer renders "FINAL T 0-0" on Dylan Beavers /
  Marcelo Mayer / Pete Alonso cards.
- Future BDL anomalies are 1-line predicate changes,
  not 5-place edits.
- Webhook rejections now land in `webhook_failed` with
  structured reason codes — auditable + grep-able.
- Retry cron picks up rejections on a 5-min schedule,
  re-evaluates the predicate, and self-heals once BDL
  sends correct data (or after reconcile populates
  scores).
- `untrustworthy_finals_overridden` cron counter
  surfaces BDL data quality over time.

**What's still open:**

- Live + scheduled state validation. Still relies on
  BDL accuracy. The framework is set up to accept a
  parallel `is_trustworthy_live` / `is_trustworthy_scheduled`
  in a future phase.
- DB-level CHECK constraint preventing untrusted writes.
  The predicate uses `now()` (STABLE not IMMUTABLE);
  CHECK requires IMMUTABLE. Could plumb a trigger but
  the ingest gate + display gate already cover the
  surface area.
- Long-tail audit. The `webhook_failed` row with
  `final_trust_violation:<reason>` is queryable, but no
  alerting is wired. If BDL data quality regresses
  significantly, we'd see it in the cron counter or
  manually grep webhook_failed.

## Tricky bits

- **Webhook can't run the full predicate at flip time.**
  The `mlb.game.ended` UPDATE flips the status before
  reconcile populates the box-score columns. So the
  webhook handler can only run `final_passes_time_check`,
  not the score-sanity portion. The score check happens
  later, at display time + via post-flip reconcile.
  Calling out this asymmetry explicitly avoids the
  "why aren't all three callsites running the full
  predicate?" question on next read.

- **`unhandled: true` vs `unhandled: false`.** The
  webhook processor treats `unhandled: true` as a
  no-op (no `webhook_failed` row, no retries). For
  trust violations we want auditing AND retries (data
  may correct itself), so we return `unhandled: false`.
  Reserved `unhandled: true` for the genuine no-handler
  case ("BDL sent us an event_type we don't model")
  and "game not in our DB" (no retry helps).

- **2-hour grace == minimum game duration.** The
  shortest MLB game ever was ~78 min in 1919. 2h covers
  the entire modern MLB envelope (post-pitch-clock the
  average is 2h 36min, never below 90 min). 90-min
  threshold was offered in the interview; user picked
  the conservative 2h.

- **0-0 ties — really impossible?** 2026 MLB enforces
  the Manfred man (extra-innings ghost runner). Every
  game guarantees a winner. A 0-0 final is now strictly
  impossible. A 0-0 result + status `final` is data
  error — BDL sandbox or pre-populated mock data
  leaking into prod.

- **Counter rename.** `future_finals_overridden` →
  `untrustworthy_finals_overridden`. No downstream
  consumers in the codebase, but if PostHog dashboards
  or external dashboards exist they'd need updating.
  ADR-0047 already documented `future_finals_overridden`;
  this ADR supersedes that name.

- **§189 OFF filter unchanged.** The TBD-OFF filter
  (`status IN ('scheduled', 'final') AND scheduled_start
  IS NULL → exclude → render OFF`) is a separate concern
  from trust. It addresses the question "should this
  card show a game pill at all?", not "is this row's
  data trustworthy?". Both filters coexist in the
  display CTE.

## Alternatives considered

- **Keep ad-hoc patches.** Faster per-anomaly but the
  per-layer code grows linearly with discovered modes.
  At 5 modes the cost-benefit clearly flipped.
- **TS-side predicate.** Considered putting the trust
  logic in TypeScript and running it post-fetch. SQL-side
  wins because the WHERE clause + display CTE both want
  to consult it, and SQL functions are reusable across
  Drizzle, raw SQL queries, future Postgres views.
- **Trigger to enforce on INSERT/UPDATE.** Would prevent
  bad finals from ever landing in the table. Rejected —
  the predicate uses `now()` (non-IMMUTABLE), and a
  trigger would need a more complex execution model. The
  ingest gate + display gate are simpler and cover the
  same surface.
- **Validate live + scheduled too.** Out of scope for
  this phase. No surfacing user pain there yet.

## Links

- Commit: (forthcoming) `feat(mlb): unified BDL final
  trust predicate (P48)`
- Migration: `supabase/migrations/0061_game_trust_predicate.sql`
- Polish spec: §190, §191, §192, §193, §194
- Tests: `tests/integration/game-trust-predicate.test.ts`
- Related: ADR-0047 (P47 retro) — surfaced the same
  problem space; this ADR supersedes its
  `future_finals_overridden` counter naming.

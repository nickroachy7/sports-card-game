# ADR-0047 — Phase 47 (Future-final game hygiene) Retrospective

**Status:** Accepted · **Date:** 2026-04-25
**Phase:** Phase 47 (v1.32)
**Companion specs:** `draft-deck-polish-spec.md` §181–§187,
`docs/roadmap-phase-47.md`.

---

## Context

User report on Apr 25 mid-day:
> "Altuve and Lee for example are showing games from yesterday."

The lineup slot pills displayed "FINAL L 4-12" (HOU) and
"FINAL L 4-9" (SF) on cards whose teams' games were scheduled
for **tonight at 7:10 PM ET and 4:05 PM ET respectively** —
hours in the future at view time (~2:28 PM ET).

DB inspection found **4 games** in `status='final'` with
`scheduled_start > now()` and pre-populated scores. Created
3 days prior (Apr 22). Affects only some games — TOR vs CLE
(Eloy's pill, "VS CLE · 3:07P") and MIN @ TB (Andrew's pill,
"@ TB · 4:10P") were correctly scheduled. Per-game data
corruption from BDL ingestion: sandbox / pre-populated final
scores leaking into prod data.

The app correctly displays whatever the DB says, but the DB
was wrong. Users perceive these (correctly!) as "yesterday's
games" because completed game scores feel historical.

## Decision

Three-layer defense:

### §183 Display-side guard

`fetchSlotGameByCardId` SQL CTE projects an `effective_status`
that demotes any `status='final' AND scheduled_start > now()`
to `'scheduled'` — and zeros home_runs / away_runs in the same
case. The DISTINCT ON ranking reads from `effective_status` so
future-finals fall behind real schedules in matchup
tie-breaking. Display layer never trusts a future-final.

This is the most important layer — it works even when
upstream data is lying.

### §184 Ingestion-side guard

**Webhook handler (`mlb.game.ended`):** the UPDATE that flips
`status='final'` now WHERE-clauses on `scheduled_start <= now()
+ INTERVAL '5 minutes'`. 5-min grace covers clock skew between
BDL and our DB. If 0 rows match, the dispatcher distinguishes
"game not in DB" from "future_final_rejected" in the audit
note so we can spot recurrence.

**Schedule prefetch cron (`bdl-games-prefetch`):** if BDL
returns a row mapped to `status='final'` for a date that's
today or later, override to `'scheduled'` before INSERT/
UPDATE. New `summary.future_finals_overridden` counter
surfaced via cron response for telemetry.

### §185 One-time backfill

Migration 0059 resets every existing future-final row to
`status='scheduled'` with cleared `home_runs` + `away_runs`.
Idempotent (no-op once everyone's clean). Applied to dev +
prod via MCP — verified 0 bad rows remaining on prod after
backfill.

## Consequences

**What got better:**

- Lineup pills correctly show "VS NYY · 7:10P" instead of
  "FINAL L 4-12" for tonight's HOU game.
- Future BDL sandbox/test-data leaks won't affect users —
  display + ingestion guards both downgrade.
- Telemetry: cron response now surfaces override count, so
  we can see if BDL keeps emitting bad data.
- Audit: webhook events for future-final games get logged
  with explicit "future_final_rejected" reason, easy to
  search.

**What's still open:**

- Audit count of how often this happened historically. The
  4 games we found today were the only ones currently in
  the bad state, but past `game_event` history could
  contain reconcile fallout from prior bad data. Spot-
  checked: no orphan rows.
- No DB-level CHECK or trigger preventing future-finals.
  Postgres CHECK can't reference `now()` (non-IMMUTABLE);
  a trigger would work but adds plumbing for what's already
  defended at app + ingestion layers.
- The bad games re-appear in BDL data on subsequent
  prefetch runs. The cron's override catches them, but if
  their `scheduled_start` ever gets set to the past
  (legitimately or via bad sync), they could flip to
  `final` legitimately. Defense-in-depth display guard
  catches that too.

## Tricky bits

- **Dev / prod schema drift.** Prod had `current_inning` /
  `current_inning_half` / `current_outs` columns; dev
  didn't (Phase 20+ migrations only landed on prod). First
  migration attempt failed on dev. Simplified the backfill
  to only touch `status` + `home_runs` + `away_runs` so it
  works on both. Live-state columns get zeroed by the
  webhook reducer when games re-enter scheduled state via
  ingest anyway.
- **5-minute grace window** in the webhook guard. Without
  it, a BDL `mlb.game.ended` event delivered exactly at
  `scheduled_start` (which sometimes happens on an
  abbreviated game) might be rejected due to nanosecond
  clock skew. 5 min is conservative; the user-visible
  "future-final" state requires hours of skew to be a
  problem.
- The prefetch override checks `g.date >= today`. The
  webhook check uses the `scheduled_start` timestamp.
  Different sources (date-string vs timestamp) but same
  spirit — refuse final if not yet started.
- `effective_status` in the display CTE plays nice with
  the existing DISTINCT ON priority (live > scheduled >
  final). Future-finals get demoted to scheduled, so they
  rank between live and final — correct behavior.

## Alternatives considered

- **Just fix the symptom (display guard) without ingestion
  guards.** Rejected — ingestion guards prevent the bad
  state from re-accumulating in the DB, which keeps
  `game_event` reconciles + scoring logic from running on
  fake data.
- **Database CHECK constraint.** Postgres CHECK can't use
  `now()`; would need a trigger. Plumbing > value.
- **Wait for natural BDL re-sync to clean up.** Rejected —
  the bad data sat for 3 days before user saw it. No
  guarantee a re-sync would correct it.
- **Source-tagging webhook events as sandbox vs real.** No
  reliable BDL flag for this. The behavior we want is
  "ignore bad data regardless of source."

## Links

- Commit: (forthcoming) `fix(mlb): future-final game state
  hygiene`
- Migration 0059: `backfill_future_finals.sql`
- Polish spec: §181, §182, §183, §184, §185, §186, §187
- Roadmap: `docs/roadmap-phase-47.md`
- Related: ADR-0046 (Phase 46 sticky lineups) — surfaced
  the same lineup-page area where this bug was visible.

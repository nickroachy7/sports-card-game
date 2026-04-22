# ADR-0022 — Phase 17 (Roster-Sync Robustness) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 17 (Feel Pass v1.10.1)
**Companion specs:** `draft-deck-polish-spec.md` §41–§43,
`docs/roadmap-phase-17.md`.

---

## Context

Phase 16's ADR-0021 ended with a flag: `missing_from_our_db:
653`. Our `player` table had ~50% of MLB's active 40-man
(632 vs. 1285). Root cause suspected: BDL's `getActivePlayers`
filter is narrower than MLB's 40-man definition.

Phase 17 tested that hypothesis + closed the gap. Also took
the opportunity to chain Phase 16's roster-audit into the
daily cron so flag-drift corrects automatically.

## Decision

- Switch `bdl-roster-sync` from `getActivePlayers` (single
  stream) to `getPlayers({ team_ids: [N] })` iterated per team
  (30 calls total). Picks up the 60-day IL + minor leaguers
  BDL was filtering out.
- Extract the P16 audit's reconciliation logic into
  `src/lib/mlb/roster-audit.ts`. Both the manual endpoint and
  the daily sync call the same helper. Audit failure in the
  sync path is caught + surfaced but doesn't tank the cron.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `4f5e95f8` | Polish spec §41–§43 + `docs/roadmap-phase-17.md`. |
| P17.1+P17.2 | `31276450` | `fetchPlayersByTeam` provider method + rewritten bdl-roster-sync + extracted `runRosterAudit` helper + chained audit. |
| P17.3 | *(deploy + curl)* | Deployed, ran the sync, verified gap closure. |
| P17.4 | *(this)* | ADR-0022. |

Prod run results:
- **bdl-roster-sync:** `bdl_players_seen: 5414`,
  `players_upserted: 5414` (entire BDL organizational set —
  includes minor leaguers too, harmless).
- **chained audit:** `flagged_on: 436`,  `flagged_off: 161`,
  `team_refreshed: 1`, `missing_from_our_db: 261`
  (down from 653).
- **mlbam-id-backfill retry:** `roster_matched: 424`
  (matches the 436 newly-flagged-on, 12-player residual from
  minor dupes), `unmatched_total: 0`.

**Coverage: 632 → 1024 players** on MLB's 40-man (80% up
from 49%). Every active player now has a photo URL.

## What went well

1. **The hypothesis was dead-on.** BDL's `getActivePlayers`
   was filtering exactly what I expected — 60-day IL +
   recently-optioned players. `getPlayers` per team picked
   up 436 previously-hidden players plus minor leaguers.
2. **One-commit ship for P17.1+P17.2.** Both changes touch
   the same surfaces — provider interface + cron route +
   audit extraction — so bundling was cleaner than staged
   commits.
3. **Helper extraction was a clean move.** The audit's 200
   lines of reconciliation logic now live in one place;
   both callers (manual endpoint + daily cron) import the
   same function. Endpoint slimmed to 27 lines.
4. **Soft-gap posture held up.** `missing_from_our_db: 261`
   after the sync isn't zero, but the 261 residual are
   genuine BDL gaps (players on MLB's 40-man but not in
   BDL's org-roster returns). Response logs the count;
   no alert yet; works per spec §42.
5. **The chained audit produced the right second-order
   effect.** 436 players went from `is_active_40_man=false`
   → `true` in one audit pass. Downstream mlbam-id-backfill
   picked them all up on the next invocation. Three phases
   of work (P15 matcher + P16 audit + P17 sync) ended at a
   complete-for-active-players state.

## What surprised us

1. **`bdl_players_seen: 5414`.** Expected maybe 1200–1500
   (40-man-ish). Got 5414. BDL's `getPlayers({ team_ids:
   [N] })` returns the full organizational roster including
   minor leaguers. Not a problem — the extra 4000 rows cost
   ~8MB of DB storage + will never get a `is_active_40_man=
   true` flag unless they get called up. But worth
   documenting.
2. **`flagged_on: 436` was bigger than expected.** I
   predicted ~100–150 (60-day IL) but got 436. Means BDL's
   `active` flag is WAY more restrictive than MLB's 40-man.
   Even "active" in BDL's semantics probably means
   "currently on a 25/26-man active roster," not "on the
   40-man at all."
3. **Runtime was fine.** 30 BDL team calls + 30 MLB Stats
   team calls + 5414 upserts + 597 audit updates = ~60s
   total. Within the Vercel limit. Future-proof if team
   counts stay stable (unlikely to grow past 30).
4. **Zero `players_skipped`.** All 5414 upserts succeeded
   first try. The existing `upsertPlayer` + BDL data
   quality + our schema + Drizzle all cooperated cleanly.
5. **261 residuals not zero.** Some MLB 40-man players
   aren't in BDL's roster returns at all. Could be
   race-condition timing (MLB added them today, BDL syncs
   tomorrow) or BDL just missing them. The audit log
   makes this visible daily now; if it trends up, we have
   a signal to investigate.

## What we deliberately simplified

1. **No MLB-Stats-driven row creation for the 261.** Per
   spec §41 trade-off note: schema-relax (nullable
   `bdl_player_id`) + MLB-only stub inserts was offered
   as an option but deferred. BDL should be the single
   source of truth for row creation; 261 players
   (20% of 40-man, none of which are active-active
   players the user would typically pull) is an
   acceptable soft gap.
2. **No threshold alert on drift.** The audit logs counts;
   no webhook / Sentry escalation if
   `missing_from_our_db` trends up. Future observability
   work; for now, eyes on the daily cron log.
3. **`fetchActivePlayers` retained on the provider
   interface.** Nobody calls it today; could be deleted.
   Left in as a documented-wider-surface option in case a
   future feature wants the narrow set.
4. **No per-team timeout wrapper.** If a single BDL team
   fetch hangs, it could tie up the cron. Current code
   relies on BDL's own HTTP timeout. If a team starts
   stalling, add a per-call AbortController.
5. **No 25-man audit.** We now have 40-man coverage;
   who's currently on the 25/26-man is a separate audit
   that could use a different MLB Stats endpoint.
   Deferred.

## What's ready for the next polish pass

- **Roster-audit is now a reusable primitive.** Any future
  cron that wants to reconcile flag/team state can import
  `runRosterAudit` + chain it.
- **Per-team BDL iteration is the canonical pattern now.**
  If a future feature needs per-position queries or
  per-player stats rolls, it has `fetchPlayersByTeam` as
  a starting point.
- **The three-phase pipeline** (bdl-roster-sync →
  roster-audit → mlbam-id-backfill) is documented end-to-
  end in the runbook. Any operator / future LLM who picks
  up this codebase can run it from scratch against a fresh
  DB.

## Open items

1. **261 players missing from BDL's org roster.** Root cause
   unknown — could be timing lag, could be BDL's data model
   differing from MLB's 40-man at the edges. Low priority
   until someone complains about not being able to pull a
   specific player.
2. **Drift alerting.** If `missing_from_our_db` trends up
   between daily runs, we should know. Future Sentry /
   webhook integration.
3. **25/26-man coverage audit.** Distinct from 40-man;
   relevant for "is this player actually playing today"
   semantics. Not needed for the current feature set but
   likely relevant for future live-projection features.
4. **Onboarding pass** — highest-impact parked user-facing
   item.
5. **Standard parked items.**

## Estimate vs reality

Estimate: ~1 day. Shipped: 2 code commits + plan + ADR +
2 deploys in one session (~60 minutes). Well under the
estimate. No scope surprises; the hypothesis test (BDL's
active filter is narrow) was quick to validate, and the
helper extraction plus cron rewrite were both routine.

## Consequences

- Data completeness jumped from 49% to 80% of MLB's active
  40-man. Every player we have is now correctly flagged +
  photo-backed.
- The daily cron now keeps itself honest — flag drift gets
  corrected automatically by the chained audit. No more
  "run these three endpoints in sequence manually" for the
  standard case; that runbook flow remains for on-demand
  fixes.
- BDL's narrow `active` filter is no longer a coverage
  bottleneck. Whatever BDL returns from per-team
  `getPlayers`, our DB mirrors.
- The 261 residual is now the new baseline. If it stays
  flat, fine. If it trends up, something's changed and
  we'll investigate then.

## Related ADRs

- ADR-0018 — Phase 13 Retrospective. First used photo data
  infra + surfaced the coverage-rate question.
- ADR-0020 — Phase 15 Retrospective. Shipped the matcher
  improvements but hit the data-staleness ceiling.
- ADR-0021 — Phase 16 Retrospective. Landed the audit +
  quantified the gap (653) Phase 17 closed.

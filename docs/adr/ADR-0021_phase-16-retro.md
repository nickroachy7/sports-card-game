# ADR-0021 — Phase 16 (Full-Height Sidebar + Roster Audit) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 16 (Feel Pass v1.10)
**Companion specs:** `draft-deck-polish-spec.md` §38–§40,
`docs/roadmap-phase-16.md`.

---

## Context

Two items that together closed Phase 15's open ends:

1. **Last visual delta between `/lineup` and `/collection`.**
   Collection sidebar runs full viewport height;
   lineup sidebar stopped above the bench/tokens strip. User
   asked to unify.
2. **ADR-0020's honest finding about the backfill ceiling.**
   Match rate stuck at ~77% because ~158 players our DB
   flagged `is_active_40_man = true` aren't actually on any
   MLB 40-man. Matcher was correct; input data was stale.

Estimate: ~1.5 days. Shipped in 4 commits + plan + ADR in
one session (~90 minutes).

## Decision

- `<LineupShell>` grows the sidebar to full main-row height
  by moving bench + tokens into the left column (nested
  flex-col: diamond → bench → tokens).
- New `/api/cron/mlb-roster-audit` endpoint reconciles
  `is_active_40_man` + `team_id` against MLB Stats API's
  actual 40-man rosters. Runs before re-triggering the
  mlbam-id-backfill to give it clean input.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `f5b8d5ba` | Polish spec §38–§40 + `docs/roadmap-phase-16.md`. |
| P16.1 | `35851827` | LineupShell restructure. Sidebar full height, bench + tokens in left column (narrower). |
| P16.2 | `dd7f278c` | `/api/cron/mlb-roster-audit` endpoint. Dry-run mode. Flips flags + refreshes team_ids based on MLB Stats rosters. Runbook entry added. |
| P16.3 | *(deploy + curl)* | Real audit run: `flagged_off: 163, team_refreshed: 1, unchanged: 632`. Follow-up backfill: `unmatched_total: 0`. |
| P16.4 | *(this)* | ADR-0021. |

Results from prod run:
- **Before Phase 16:** ~775 active flags, ~158 unmatched
  after all Phase 15 work.
- **After audit:** 632 genuinely-active players (all with
  mlbam_ids), 163 correctly flagged off.
- **After backfill re-run:** `unmatched_total: 0`. Every
  active 40-man row has a photo URL.

## What went well

1. **LineupShell change was 6 lines of re-nesting.** Moved
   bench + tokens from the outer shell's `<div>` into the
   inner left-column flex-col. Sidebar `md:flex` gate +
   overflow-auto unchanged. Zero regression risk.
2. **Audit endpoint followed the Phase 14/15 pattern.** Same
   roster-fetch loop, same `mlbStatsTeamId` helper, same
   `normalizeName` from name-match.ts. The three-phase
   investment in these primitives keeps paying.
3. **Dry-run flag paid for itself.** Real run's deltas
   matched the dry-run numbers exactly, confirming the
   audit's idempotency + avoiding a "we flipped 163 flags
   and now everything's broken" panic.
4. **The audit + backfill re-run produced a clean 0.**
   After the audit wrote 163 flags off, the next backfill
   invocation found zero rows with `is_active_40_man=true
   AND mlbam_id IS NULL`. Every active row is matched.
5. **Phase 15's ADR-0020 prediction was spot-on.** It said
   "the residual ~158 is a BDL-roster-sync-staleness
   problem, not a matcher problem; fix path is re-run
   BDL-sync then re-run backfill with retry_failed=true."
   Phase 16 validated that by doing exactly that (MLB
   Stats roster as the authority, not BDL).

## What surprised us

1. **`missing_from_our_db: 653`.** More than half of MLB's
   actual 1285-player 40-man is missing from our DB. Our
   full active set is ~632, vs. MLB's 1285. That's not a
   Phase 16 problem — our BDL roster-sync was likely never
   run fully for callups — but it means users could roll
   cards for players who aren't in our `player` table. A
   Phase 17+ item to chase. The audit's counter makes the
   gap visible now; next `bdl-roster-sync` should start
   closing it.
2. **Only 1 team refresh.** I expected more mid-season trade
   residuals. Either our `team_id` has been sync'd pretty
   well recently, or our residuals are mostly "not on the
   40-man anymore" (flag-off) rather than "moved teams but
   still on the 40-man" (team-refresh). The audit
   disambiguates those two cases cleanly.
3. **The `?retry_failed=true` backfill after audit showed
   zero attempts.** The audit flipped the 163 stale flags
   off → they no longer match `is_active_40_man = true AND
   mlbam_id IS NULL`. The backfill query's
   `is_active_40_man = true` filter skips them entirely.
   Initial reaction: "did it even run?" — but the counts
   were the expected outcome. `unmatched_total: 0` because
   every row still in the active set has an mlbam_id.

## What we deliberately simplified

1. **No auto-creation of missing_from_our_db rows.** Creating
   them without BDL's per-player metadata (positions,
   heights, full names, etc.) would make the rows second-
   class. BDL is source-of-truth for row creation. Next
   `bdl-roster-sync` picks them up.
2. **No schedule on the audit cron.** Vercel Hobby budget
   still one/day; manual trigger fits the pattern (same as
   mlbam-id-backfill).
3. **No handling of `missing_from_our_db` inside the audit.**
   Just the count. Turning that count into new rows is a
   separate concern + requires BDL shape.
4. **No batch UPDATE.** Each delta runs its own UPDATE. With
   ~163 updates + 500ms sleeps already in the fetch loop,
   sequential writes are a non-factor for the phase's
   one-shot nature. A future scheduled version might
   batch.
5. **Audit endpoint doesn't trigger the backfill itself.**
   Kept as a separate step — the runbook documents the
   flow (audit → backfill). Keeps responsibilities
   clean + lets operators re-run either independently.

## What's ready for the next polish pass

- **`mlb-roster-audit` + `mlbam-id-backfill` is a complete
  operational story.** Any future player-data hygiene
  problem routes through: run audit, read deltas, run
  backfill if needed.
- **The `rosterByName` + `mlbamIdSet` index pattern** is
  now used by both endpoints. Extract into a shared helper
  if a third consumer ever lands (e.g., a "find photos for
  legacy inactive players" flow).
- **`missing_from_our_db` counter** is a data-completeness
  health check we can watch. If it trends up significantly
  between runs, that's a BDL roster-sync issue to triage.
- **LineupShell's new shape** is the template if another
  surface wants both a fixed bottom strip AND a full-height
  sidebar.

## Open items

1. **653 MLB players missing from our `player` table.** The
   biggest open item from the audit. Fix: audit +
   instrument `bdl-roster-sync` to ensure it's pulling the
   full active set.
2. **`bdl-roster-sync` robustness.** Root cause of the gap
   — needs a review pass + probably a counter similar to
   `missing_from_our_db` so we can alarm.
3. **Scheduled audit + backfill cron.** Manual for now;
   automate once Vercel Pro or once we have a fuller
   operational picture.
4. **Onboarding pass** — still the biggest parked
   user-facing item.
5. **Standard parked items.**

## Estimate vs reality

Estimate: ~1.5 days. Shipped: 4 commits + plan + ADR in
one session (~90 minutes). Under estimate. The audit
endpoint was the bulk (~300 lines) but followed established
patterns; LineupShell change was trivial. Debug loop was
zero — dry-run then real-run, no surprises.

## Consequences

- `/lineup` + `/collection` are now visually unified. Right
  sidebar, full height, both pages. Bench + tokens narrower
  on lineup but within the left column, same vertical
  position.
- Every active 40-man player has a real photo on their card.
  Phase 15's ceiling closed.
- The data-completeness gap (`missing_from_our_db: 653`) is
  visible now. The audit makes drift detectable in a way
  BDL's opaque sync didn't.
- One more clean separation: BDL is row-creation-source-of-
  truth; MLB Stats is active-state-of-truth. The audit
  enforces that division.

## Related ADRs

- ADR-0017 — Phase 12 Retrospective. Called out the need
  to match the sidebar aesthetic across pages.
- ADR-0018 — Phase 13 Retrospective. First sidebar pattern
  that lineup + collection would need to match.
- ADR-0020 — Phase 15 Retrospective. Identified the
  BDL-staleness root cause Phase 16 fixed.

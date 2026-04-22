# Draft Deck — Phase 17 Roadmap (Feel Pass v1.10.1 — Roster-Sync Robustness)

**Goal:** Close the 653-player gap from Phase 16 by switching
BDL sync from `getActivePlayers` (narrow) to `getPlayers` per
team (full). Chain the Phase 16 roster-audit into the daily
cron so drift corrects automatically.

**Estimated effort:** ~1 day.

**Prerequisites:**

- Phase 16 shipped — `mlb-roster-audit` endpoint + runbook
  entry.
- `src/lib/mlb/provider.ts` + `src/lib/mlb/paginate.ts` from
  earlier phases handle cursor iteration.
- BDL's `getPlayers` supports `team_ids[]` filter (verified
  in the SDK's method signature).

---

## Milestones

| ID    | Milestone                                    | Target    | Outcome |
|-------|----------------------------------------------|-----------|---------|
| P17.1 | `fetchPlayersByTeam` provider method + rewrite bdl-roster-sync | 0.5 day | New provider method, sync iterates teams using it. `getActivePlayers` preserved on the interface. |
| P17.2 | Extract roster-audit core + chain into daily cron | 0.25 day | `src/lib/mlb/roster-audit.ts` shared helper; bdl-roster-sync calls it after player upserts. |
| P17.3 | Deploy + run sync + re-run backfill          | 0.15 day  | Prod deploy, curl the sync, verify `missing_from_our_db` dropped, run backfill. |
| P17.4 | ADR-0022 retro                               | 0.1 day   | Standard retro. |

---

## P17.1 — Per-team `getPlayers` sync

### T17.1.1 Add `fetchPlayersByTeam` to provider

- **What:** `src/lib/mlb/provider.ts` gains:
  ```ts
  fetchPlayersByTeam(teamBdlId: number): AsyncIterable<MLBPlayer>;
  ```
  Implementation wraps `bdl.mlb.getPlayers({ cursor, per_page:
  100, team_ids: [teamBdlId] })` via the existing `paginate`
  helper.
- **Acceptance:**
  - Interface updated; BallDontLieProvider implements the new
    method.
  - Existing `fetchActivePlayers` left in place.

### T17.1.2 Rewrite the cron body

- **What:** `src/app/api/cron/bdl-roster-sync/route.ts`:
  1. Upsert teams (unchanged).
  2. `teams = await provider.fetchTeams()` — already done in
     step 1; reuse the list.
  3. For each team: `for await (const p of
     provider.fetchPlayersByTeam(team.id))` → upsert via
     existing `upsertPlayer`.
  4. 200ms sleep between team iterations.
  5. Track `teams_processed` + `bdl_players_seen` counters in
     addition to upserts/skipped.
- **Acceptance:**
  - Response shape: `{ teams, players_upserted,
    players_skipped, teams_processed, bdl_players_seen,
    audit: {...} }`.
  - Runs cleanly end-to-end.

---

## P17.2 — Extract audit + chain into sync

### T17.2.1 Extract audit core

- **What:** Move the reconciliation logic out of
  `/api/cron/mlb-roster-audit/route.ts` into
  `src/lib/mlb/roster-audit.ts` — a pure async function that
  takes a `db` client + a dry-run flag and returns the counts
  object. Both endpoints call it.
- **Acceptance:**
  - Standalone endpoint still returns its existing response
    shape.
  - No behavior change from the manual path.

### T17.2.2 Chain audit into bdl-roster-sync

- **What:** After the player-upsert loop in bdl-roster-sync,
  call `runRosterAudit(db, { dryRun: false })`. Wrap in
  try/catch so a failing audit doesn't tank the sync. Include
  the result (or error message) in the cron response's
  `audit` field.
- **Acceptance:**
  - Sync response includes `audit: { flagged_off, flagged_on,
    team_refreshed, missing_from_our_db, ... }` on success,
    `audit: { error: "..." }` on failure.
  - Sync continues to report ok even if the audit errors.

---

## P17.3 — Deploy + verify

### T17.3.1 Deploy

- **What:** `vercel --prod --yes`.

### T17.3.2 Run daily sync manually

- **What:** Curl `bdl-roster-sync` with CRON_SECRET. Expected
  runtime: ~45s. Expected response:
  - `players_upserted`: 1100–1300
  - `audit.flagged_off`: small (since we already ran the
    audit in P16)
  - `audit.missing_from_our_db`: near 0 if the new BDL call
    picked up the missing 653
- **Acceptance:**
  - `audit.missing_from_our_db` < 20 (down from 653).

### T17.3.3 Re-run mlbam backfill

- **What:** After the sync, curl
  `mlbam-id-backfill?retry_failed=true&limit=200` so any newly-
  added players get their MLBAM id.
- **Acceptance:**
  - New players get matched via the 40-man roster pass.
  - `unmatched_total` stays near zero.

---

## P17.4 — ADR-0022

### T17.4.1 `docs/adr/ADR-0022_phase-17-retro.md`

Standard template. Focus areas: BDL's active-filter
surprise, the runtime trade-off, the chained-audit
posture.

---

## Dependencies between tasks

```
P17.1 (sync rewrite) ──► P17.3 (deploy + verify)
P17.2 (audit extract + chain) ──► P17.3
                                        │
                                        ▼
                                   P17.4 (ADR)
```

P17.1 + P17.2 can ship in one commit since the cron body
touches both. P17.3 is the deploy + verify. P17.4 closes.

---

## What's NOT in Phase 17

Per spec §43:

- Onboarding / empty-error / a11y / foil / dupe picker /
  mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Auto-creation of MLB-only rows (schema relax deferred
  until we see how often BDL misses 40-man in practice).
- Alerting on drift (`missing_from_our_db` threshold).

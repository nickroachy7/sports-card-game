# Draft Deck — Phase 16 Roadmap (Feel Pass v1.10 — Full-Height Sidebar + Roster Audit)

**Goal:** Close the last visual delta between `/lineup` and
`/collection` (sidebar height), and fix the upstream data
staleness that blocked Phase 15's backfill target.

**Estimated effort:** ~1.5 days.

**Prerequisites:**

- Phase 15 shipped — `<CollectionShell>` sets the sidebar
  aesthetic; `<LineupShell>` from Phase 13 is what we'll
  restructure.
- `src/lib/mlb/mlb-stats-team-ids.ts` + `name-match.ts` from
  Phase 15.
- `mlbam-id-backfill` endpoint from Phase 14/15 works end-
  to-end against prod.

---

## Milestones

| ID    | Milestone                                  | Target    | Outcome |
|-------|--------------------------------------------|-----------|---------|
| P16.1 | LineupShell restructure                    | 0.25 day  | Sidebar full height; bench + tokens confined to left column. |
| P16.2 | MLB roster audit endpoint                  | 0.75 day  | New `/api/cron/mlb-roster-audit`. Flips `is_active_40_man`, refreshes `team_id`, logs missing-from-our-db count. |
| P16.3 | Deploy + run audit + re-run backfill       | 0.25 day  | Audit lands; mlbam-id-backfill re-run with `retry_failed=true`; `unmatched_total` drops to near zero. |
| P16.4 | ADR-0021 retro                             | 0.25 day  | Standard retro. |

---

## P16.1 — LineupShell restructure

### T16.1.1 Flex tree rewrite

- **What:** `src/components/lineup/LineupShell.tsx` —
  restructure:
  ```tsx
  <div className="flex h-full min-h-[720px] flex-col bg-[var(--bg)]">
    {header}
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center overflow-auto">
          {diamond}
        </div>
        <div className="shrink-0">
          {bench}
          {tokens}
        </div>
      </div>
      <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        {sidebar}
      </aside>
    </div>
  </div>
  ```
- **Acceptance:**
  - Sidebar runs header-bottom to viewport-bottom at
    1440 + 1280 widths.
  - Bench strip + tokens strip end at sidebar's left edge.
  - Diamond still centers + scrolls horizontally when
    compressed.
  - No regression in drag-drop / glow / slot click.

---

## P16.2 — MLB roster audit endpoint

### T16.2.1 Scaffold endpoint

- **What:**
  `src/app/api/cron/mlb-roster-audit/route.ts`.
  CRON_SECRET-gated. Params:
  - `?dry_run=true` — compute deltas + return them without
    writing. Useful for seeing what a run would do.
- **Acceptance:**
  - 401 without auth header.
  - Dry-run returns the delta counts without mutation.

### T16.2.2 Fetch all 30 rosters

- **What:** Mirror P15.4's roster-fetch loop. 500ms
  politeness sleep. Build a set of MLBAM ids present in
  any roster + a name-key map (`firstNorm|lastNorm`)
  mapping to `{ mlbamId, teamAbbr }` entries.
- **Acceptance:**
  - `teams_processed: 30` on a clean run.
  - Error in one team's fetch doesn't abort others.

### T16.2.3 Reconcile flags

- **What:** Query our player table:
  - Collect all rows with `is_active_40_man = true` OR
    appearing as mlbam_id/name in the rosters.
  - For each row:
    - `inRosterById = mlbam_id !== null && mlbamIdSet.has(mlbam_id)`
    - `inRosterByName = ourNormalizedKey matches rosterByName`
    - `inRoster = inRosterById || inRosterByName`
    - If `is_active_40_man = true && !inRoster` → flip to
      false.
    - If `is_active_40_man = false && inRoster` → flip to
      true.
    - If matched via name to a team different from
      `team_id` → refresh `team_id` to the matched team.
  - Execute UPDATEs in a batch (or loop with small
    batches to stay under serverless timeout — 30 teams
    × 500ms = 15s already).
- **Acceptance:**
  - First real run: `flagged_off` ~130 (matches P15
    residual).
  - Subsequent run: all counts 0 or near-zero.

### T16.2.4 Missing-from-our-db counter

- **What:** After matching our players against rosters,
  count MLBAM ids in any roster NOT resolved to one of
  our `player` rows (either by mlbam_id or by name+team
  match). Log in response as `missing_from_our_db: N`.
- **Acceptance:**
  - Counter matches expectation (likely 5–20 — recent
    callups).

### T16.2.5 Runbook entry

- **What:** Add a "Roster audit" subsection under the
  BDL integration section in `docs/runbook.md`:
  ```bash
  # Run before re-running mlbam-id-backfill to clean stale
  # is_active_40_man flags.
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "https://draftdeck.com/api/cron/mlb-roster-audit" | jq

  # Then re-run mlbam backfill with retry_failed=true.
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "https://draftdeck.com/api/cron/mlbam-id-backfill?retry_failed=true&limit=200" | jq
  ```

---

## P16.3 — Deploy + run + verify

### T16.3.1 Deploy

- **What:** Commit P16.1 + P16.2 + redeploy via
  `vercel --prod --yes`.

### T16.3.2 Run audit

- **What:** Curl the new endpoint in dry-run first, verify
  the deltas look sensible, then run for real.
- **Acceptance:**
  - Response shows expected ~130 `flagged_off` + handful
    of `team_refreshed`.

### T16.3.3 Re-run backfill

- **What:** After the audit, re-run
  `mlbam-id-backfill?retry_failed=true&limit=200`.
- **Acceptance:**
  - `unmatched_total` drops from 158 to near zero.
  - Test-account lineup shows photos for nearly every
    slot.

---

## P16.4 — ADR-0021

### T16.4.1 `docs/adr/ADR-0021_phase-16-retro.md`

Standard template.

---

## Dependencies between tasks

```
P16.1 (shell) ──► independent
P16.2 (audit) ──► P16.3 (deploy+run)
                                   │
                                   ▼
                              P16.4 (ADR)
```

P16.1 ships standalone. P16.2 → P16.3 → P16.4.

---

## What's NOT in Phase 16

Per spec §40:

- Onboarding / empty-error / a11y / foil / dupe picker /
  mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Auto-creation of player rows missed by BDL.
- Scheduled roster-audit cron.
- Card detail URL sync on lineup page.

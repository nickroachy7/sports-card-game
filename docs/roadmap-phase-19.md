# Draft Deck — Phase 19 Roadmap (Feel Pass v1.11.1 — Slate Robustness)

**Goal:** Three slate-integrity fixes surfaced by Phase 18
smoke testing. TZ-correct slate rollover, stale-cache fix,
and populate the game start times so the UI can display them.

**Estimated effort:** ~0.75 day.

**Prerequisites:**

- Phase 15 `MLB_STATS_TEAM_IDS` const map.
- Phase 17 `mlb-stats-schedule` endpoint usage pattern.
- `syncScheduleHorizon` already exists at
  `src/lib/mlb/schedule-sync.ts`.

---

## Milestones

| ID    | Milestone                                    | Target    | Outcome |
|-------|----------------------------------------------|-----------|---------|
| P19.1 | Slate-date helper + rollover pivot           | 0.25 day  | `current_slate_date()` SQL helper, 4 AM ET pivot. `create_daily_contest` uses it. |
| P19.2 | Refresh `included_game_ids` on every call    | (combined) | `create_daily_contest` recomputes game set + UPDATE when it changes. |
| P19.3 | Populate `scheduled_start` via MLB Stats     | 0.25 day  | New schedule helper; augment `syncScheduleHorizon`; schedule-sync response gains counter. |
| P19.4 | Deploy + run sync + verify                   | 0.1 day   | Apply migration 0031, deploy, run `bdl-games-prefetch` manually. |
| P19.5 | ADR-0024                                     | 0.15 day  | Standard retro. |

---

## P19.1 + P19.2 — Migration 0031: slate date + refresh

### T19.1.1 `current_slate_date()` helper

- **What:** Migration 0031 defines a STABLE SQL fn:
  ```sql
  CREATE OR REPLACE FUNCTION public.current_slate_date()
  RETURNS date
  LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date;
  $$;
  ```

### T19.1.2 `create_daily_contest` — default + refresh

- **What:** Same migration rewrites `create_daily_contest` so:
  - Default param is `current_slate_date()`.
  - After the existing reuse-lookup succeeds, recompute
    `v_game_ids` from `public.game WHERE date = p_contest_date`.
  - If `v_game_ids IS DISTINCT FROM current included_game_ids`,
    `UPDATE contest SET included_game_ids = v_game_ids`.
- **Acceptance:**
  - Apply locally + prod.
  - Call `create_daily_contest()` without args → returns
    the current slate contest.
  - Insert a mock game for today + re-call → the contest's
    `included_game_ids` grows by one.

### T19.1.3 Caller cleanup

- **What:** `src/app/(app)/lineup/page.tsx` drops the
  `CURRENT_DATE` argument → `SELECT create_daily_contest()`.
- `src/app/api/cron/bdl-games-prefetch/route.ts` also passes
  the dates from its loop; change it to pass dates computed
  in ET (or let the default drive).

### T19.1.4 `src/lib/mlb/slate.ts` helper (client-side)

- **What:** Tiny module exporting `currentSlateDateEt():
  string` that returns YYYY-MM-DD using `4 AM ET` pivot.
  Not yet used in client code but available for UI copy
  ("tonight's slate", etc.).

---

## P19.3 — MLB Stats schedule for `scheduled_start`

### T19.3.1 `fetchMlbStatsSchedule(date)` helper

- **What:** `src/lib/mlb/mlb-stats-schedule.ts`. Exports
  `fetchMlbStatsSchedule(date: Date | string): Promise<Array<{ homeMlbId, awayMlbId, scheduledStartIso }>>`.
  - Hits `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD`.
  - Parses `dates[0].games[]` — each has `gameDate` (ISO
    timestamp) + `teams.home.team.id` + `teams.away.team.id`.
- **Acceptance:** Unit test with a mocked fetch response —
  or an integration check against prod.

### T19.3.2 Augment `syncScheduleHorizon`

- **What:** For each date in the horizon, after the BDL
  upsert loop:
  - Call `fetchMlbStatsSchedule(date)`.
  - For each entry: look up our `team` rows by the MLB
    Stats teamId (reverse `MLB_STATS_TEAM_IDS` → abbreviation
    → our team uuid).
  - UPDATE `public.game SET scheduled_start = ${iso}::timestamptz
    WHERE date = ${date} AND home_team_id = ${homeUuid}
    AND away_team_id = ${awayUuid}`.
  - 500ms sleep between date fetches.
  - Track `scheduled_starts_updated` in the summary.
- **Acceptance:**
  - Post-run, >90% of today's games have `scheduled_start`
    populated.
  - UI slot-footer shows "vs LAD · 7:10p" for scheduled
    games.

---

## P19.4 — Deploy + verify

### T19.4.1 Apply migration 0031

- **What:** `supabase db push --linked`.
- **Acceptance:** Migration lands, `current_slate_date()`
  callable, `create_daily_contest` fn updated.

### T19.4.2 Deploy code

- **What:** `vercel --prod --yes`.

### T19.4.3 Run `bdl-games-prefetch`

- **What:** Manual curl to pull schedule + hit new MLB Stats
  endpoint.
- **Acceptance:**
  - Response includes `scheduled_starts_updated > 0`.
  - Slot footer on lineup page shows start times.

---

## P19.5 — ADR-0024

Standard template.

---

## Dependencies between tasks

```
P19.1+P19.2 (migration) ──► P19.4 (deploy + verify)
P19.3 (schedule source) ──► P19.4
                                          │
                                          ▼
                                     P19.5 (ADR)
```

---

## What's NOT in Phase 19

Per spec §53:

- Onboarding / empty-error / a11y / foil / dupe picker /
  mobile / sound / haptics / artwork.
- Rank display / webhook retry observability / CI.
- Live inning tracking on `game` row.
- contest_entry_status enum collapse (Phase 18 carry-over).
- Configurable pivot hour via env var.
- Non-ET timezones.

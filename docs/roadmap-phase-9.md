# Draft Deck — Phase 9 Roadmap (Real-Game Scoring)

**Goal:** Close the gap between "BDL webhooks are live" and
"Draft Deck scores a real MLB game end-to-end." One deliverable,
locked in `draft-deck-polish-spec.md` §14: schedule sync +
first-game proof.

**Estimated effort:** 2–3 days of focused solo engineering plus
live observation time at a game window. Smaller than Phases 7–8
since the core pipeline (webhook receiver, scoring SQL,
reconcileGame) was built earlier. This phase is the integration
work that makes those pieces actually engage.

**Prerequisites:**
- Phase 8 shipped (ADR-0013).
- BDL webhook registered + firing against prod.
- `public.player` + `public.team` populated (verified live
  during P8.6 triage).
- A real MLB game day in range (every day during season).

---

## Milestones

| ID   | Milestone                                    | Target  | Outcome |
|------|----------------------------------------------|---------|---------|
| P9.1 | Schedule sync server module                   | 0.5 day | `syncScheduleHorizon(days)` + BDL status → enum translation table. Pure server-side, unit-testable. |
| P9.2 | Cron endpoint + `vercel.json` config         | 0.25 day | `/api/cron/sync-schedule` guarded by CRON_SECRET + Sentry-wrapped. Cron fires every 2h in the active window. |
| P9.3 | Status-transition guard (no-regress rule)     | 0.25 day | Sync never regresses a game's status backward past a webhook-driven transition. Simple: only upsert status if current is `'scheduled'`. |
| P9.4 | Tests — unit (status translation, upsert idempotency) + integration (schedule sync against a fixture payload) | 0.5 day | Vitest coverage so regressions don't slip. |
| P9.5 | First real end-to-end smoke                   | 1 day   | Observe one real MLB game from scheduled → live → final, with a test-account lineup resolving. Document timings + any edge cases in ADR-0014. |
| P9.6 | ADR-0014 Phase 9 retro                        | 0.25 day | Retro covering what worked, real-game surprises, what's still open. |

---

## P9.1 — Schedule sync server module (Day 1)

### T9.1.1 Module scaffold
- **What:** `src/lib/mlb/schedule-sync.ts` exports:
  - `syncScheduleHorizon(daysAhead: number): Promise<SyncSummary>`
  - `mapBdlStatus(raw: string): GameStatus` (pure, exported for
    unit tests)
  - `SyncSummary = { synced: number; skipped: number; errors: string[] }`
- **Acceptance:**
  - Pulls `provider.getGames({ dates: [d0, d1, d2] })` via
    existing `MLBDataProvider`.
  - Upserts `public.game` on `bdl_game_id`.
  - Returns a summary for the cron handler to log.
  - Does not throw on a single bad row (skips + records in
    `errors`).

### T9.1.2 BDL status translation table
- **What:** Map BDL's status strings to our `game_status` enum.
  Known BDL values (from SDK docs + observed in live payloads):
  `"Scheduled"`, `"Pre-Game"`, `"Warmup"`, `"In Progress"`,
  `"Final"`, `"Postponed"`, `"Delayed"`, `"Canceled"`,
  `"Suspended"`.
- **Translation:**
  - `Scheduled` / `Pre-Game` / `Warmup` → `'scheduled'`
  - `In Progress` → `'live'`
  - `Final` → `'final'`
  - `Postponed` → `'postponed'`
  - `Suspended` / `Delayed` → `'suspended'`
  - `Canceled` → `'canceled'`
  - Unknown → `'scheduled'` + push to `errors` for visibility.
- **Acceptance:** unit test covers every listed BDL value.

### T9.1.3 Team resolution guard
- **What:** Before upserting a game, resolve both team rows. If
  either is missing, log + skip the game; don't fail the whole
  sync.
- **Acceptance:** missing-team case returns `skipped++`, not an
  exception.

---

## P9.2 — Cron endpoint + Vercel config (Day 1)

### T9.2.1 Cron route
- **What:** `src/app/api/cron/sync-schedule/route.ts`:
  - `GET` handler gated by `Authorization: Bearer ${CRON_SECRET}`.
  - Calls `syncScheduleHorizon(2)`.
  - Sentry-wrapped for error capture.
  - Returns JSON `{ synced, skipped, errors, took_ms }`.
- **Acceptance:**
  - Unauthenticated → 401.
  - Authenticated → 200 + summary JSON.
  - Exceptions caught + logged; never leaks 500.

### T9.2.2 Vercel cron config
- **What:** `vercel.json` adds:
  ```json
  {
    "crons": [
      { "path": "/api/cron/sync-schedule", "schedule": "0 */2 11-3 * * *" }
    ]
  }
  ```
- Every 2h in UTC 11:00 → 03:00 (covers 7 AM → 11 PM ET).
- **Acceptance:** first prod deploy sees the cron registered in
  Vercel's dashboard.

---

## P9.3 — Status-transition guard (Day 2)

### T9.3.1 No-regress rule
- **What:** In `schedule-sync`, when upserting:
  - If existing row has status `'live'` or `'final'`, leave
    status alone (sync writes other fields only).
  - If existing row has status `'scheduled'`, accept new status.
  - If existing row has status `'postponed'` / `'suspended'` /
    `'canceled'`, allow BDL to write a new status (reversible
    edge cases).
- **Acceptance:**
  - A webhook-driven `'live'` transition followed by a sync run
    doesn't revert to `'scheduled'`.
  - A postponed game that gets rescheduled (re-synced as
    `'scheduled'`) correctly updates.

---

## P9.4 — Tests (Day 2)

### T9.4.1 Unit — status translation
- **What:** `tests/unit/mlb-status-map.test.ts` — every BDL
  status maps to the expected enum; unknowns get flagged.

### T9.4.2 Unit — upsert idempotency
- **What:** `tests/unit/schedule-sync.test.ts` — mock the
  provider; run sync twice; assert game row counts are the
  same + fields converge on the last input.

### T9.4.3 Integration (optional)
- **What:** Mock a BDL response payload (fixture JSON in
  `tests/fixtures/`), run sync against a local supabase, assert
  DB rows match. Skip if local supabase isn't reliably
  available; we have live-DB observation instead.

---

## P9.5 — First real end-to-end smoke (Day 2–3)

### T9.5.1 Pre-flight
- **What:**
  - Run cron manually to seed today's games:
    ```bash
    curl -sH "Authorization: Bearer $CRON_SECRET" https://draft-deck.vercel.app/api/cron/sync-schedule
    ```
  - Verify via SQL:
    ```sql
    SELECT bdl_game_id, status, scheduled_start, home_team_id, away_team_id
    FROM public.game
    WHERE scheduled_start::date = CURRENT_DATE
    ORDER BY scheduled_start;
    ```
  - Pick one game; note the BDL game id.

### T9.5.2 Contest + lineup
- **What:**
  - Ensure a daily contest exists referencing that game.
  - On the test account, submit a full 10-card lineup with
    cards for players rostered in that game.
  - Keep the lineup locked before `lineup_locks_at`.

### T9.5.3 Observation window
- **What:** During the game (~3 hours):
  - Watch `public.webhook_delivery` for events on that
    `bdl_game_id` (join via `raw_payload->'game'->>'id'`).
  - Confirm `public.game_event` rows land for each batter event
    on players in the lineup.
  - `contest_entry.live_score` should tick up as events process.
- **At game-end (`mlb.game.ended`):**
  - `public.game.status = 'final'`.
  - `reconcileGame(bdlGameId)` fires; `contest_lineup_slot.final_fp`
    populates for each slot.
  - Winning-pitcher attribution emits the synthetic
    `mlb.game.pitcher_win` event (per P8.5).
  - `contest_entry.status = 'final'`, `final_score > 0`.

### T9.5.4 Failure-mode capture
- **What:** Any anomaly (delayed event, missing attribution,
  FK failure on edge case) → captured in ADR-0014 with the
  payload + SQL state for post-hoc analysis.

---

## P9.6 — Close-out (Day 3)

### T9.6.1 ADR-0014
- **What:** `docs/adr/ADR-0014_phase-9-retro.md`:
  - What shipped.
  - The first-real-game observation notes (what hit cleanly,
    what surprised).
  - Open items for Phase 10.
  - Estimate vs reality.

### T9.6.2 Reduced-motion audit
- **What:** N/A for this phase. All work is server-side. ADR
  notes this explicitly.

### T9.6.3 Playwright
- **What:** N/A for this phase. Live-game observation covers
  the acceptance path. Unit tests cover the sync logic.

---

## What's NOT in Phase 9 (scope guard)

Copied from polish spec §15:

- Probable starting-pitcher enrichment (BDL SDK gap).
- Historical-season schedule sync.
- Ceremony fn tolerance for pre-vaulted cards (P7.4 carry-over).
- Live contest view polish.
- Onboarding pass.
- Empty + error state sweep.
- Accessibility audit.
- Tier foil motion.
- Mobile / sound / haptics / artwork.

---

## Per-task checklist

Same as prior phases:
- Acceptance met.
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- Cron endpoint guarded by `CRON_SECRET`.
- Sentry instrumentation + structured log on entry/exit.
- Commit convention: `feat(sync): P9.N <slice>`.

---

## Dependencies between tasks

```
P9.1 (Schedule sync module) ─┬─► P9.4 (Tests)
                             │
P9.2 (Cron endpoint) ────────┼─► P9.5 (End-to-end smoke) ──► P9.6 (ADR-0014)
                             │
P9.3 (No-regress guard) ─────┘
```

P9.1 is the core module; P9.2 + P9.3 wire it in. P9.4 (tests)
runs in parallel. P9.5 is the final observational milestone that
requires prod + a live MLB game. P9.6 closes.

---

## Standing follow-ups (ride-along if convenient)

- `commit_vault_selection` tolerance for pre-vaulted cards.
- Historical schedule sync (if we ever need it).
- Probable-SP enrichment (when BDL adds the field, or another
  provider is wired in).

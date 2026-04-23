# Draft Deck — Phase 22 Roadmap (Feel Pass v1.13 — Live-State Polish)

**Goal:** Close 5 open items + address the bench readability
call-out from user feedback.

**Estimated effort:** ~1.5 days.

**Prerequisites:**

- Phase 21's bench footer + SlotGameState shape.
- Phase 20's `current_inning` / `current_inning_half`
  populating from webhooks.
- Phase 15's `MLB_STATS_TEAM_IDS` reverse map.
- Phase 20 recipe for enum-narrow migrations (P22.5
  applies it).

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P22.1 | Tone-washed pill treatment                 | 0.2 day  | ✅ Shipped. `<SlotGameState>` footer + bench variants wrap body in a tone-washed pill. Slot diamond + bench read uniformly. |
| P22.2 | Game-state filter chips                    | 0.4 day  | ✅ Shipped. Bench + collection both gained a chip row (All · Pre · Live · Final · Off) with counts. Collection page now uses the shared `fetchSlotGameByCardId` helper. |
| P22.3 | Outs tracking (migration 0034)             | 0.2 day  | ✅ Shipped. `public.game.current_outs` + webhook handler idempotent UPDATE + SlotGameInfo + LIVE copy (`T5 2O`). Migration applied to prod. |
| P22.4 | Doubleheader support (migration 0035)      | 0.4 day  | ✅ Shipped. Real schema change: nullable `game_number` + partial unique index + MLB Stats second pass + DH marker only when `has_double_header`. Dedup backfill kept the BDL-authoritative (event-richest) partner, re-parented any stragglers. |
| P22.5 | `contest_status` enum cleanup (0036)       | 0.2 day  | ✅ Shipped. P20 recipe; only dependency was `vault_card_midseason` (narrowed to `co.status = 'live'`). Enum now `pending / live / final / canceled`. |
| P22.6 | Deploy + verify                            | 0.1 day  | Migrations 0034/0035/0036 live in prod. Next: `vercel --prod` + `bdl-games-prefetch`. |
| P22.7 | ADR-0027                                   | 0.1 day  | Pending (post-deploy). |

---

## P22.1 — Tone-washed pill visual

### T22.1.1 Update SlotGameState render

- **What:** `src/components/lineup/SlotGameState.tsx` —
  footer + bench variants wrap their body text in a pill:
  ```tsx
  <span className={cn(
    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider leading-tight",
    pillTone(info?.status ?? null),
    className,
  )}>
    {body}
  </span>
  ```
- `pillTone(status)` returns:
  - `scheduled`: `bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-3)]`
  - `live`: `bg-emerald-950/40 border-emerald-800/60 text-emerald-400`
  - `final`: `bg-[var(--surface-2)]/60 border-[var(--border)] text-[var(--text-2)]`
  - `null` (off-day): `bg-[var(--surface-2)]/30 border-[var(--border)] text-[var(--text-3)]`
- **Acceptance:** bench reads as discrete pills; slot
  footer adopts same pill.

### T22.1.2 Slot layout check

- **What:** LineupSlot's column is narrow (~96px). Verify
  the pill doesn't cause layout shift; use `whitespace-
  nowrap` + allow horizontal overflow inside the slot
  column.
- **Acceptance:** Diamond layout holds at 1040px+.

---

## P22.2 — Filter chips

### T22.2.1 Bench state filter + counts

- **What:** `<BenchDrawer>` gains `stateFilter` state
  variable: `"all" | "scheduled" | "live" | "final" | "off"`.
  New second chip row below the Hitters/Pitchers row.
  `filtered` memo applies `stateFilter` after position
  filter + search. Chip labels include counts computed
  over the pre-state-filter set.
- **Acceptance:** Toggling chips narrows bench; counts
  accurate.

### T22.2.2 Collection today-filter

- **What:** `<CollectionGrid>` gains the same chip row in
  its header (above the card grid). Needs per-card game
  state, so the server-side `collection/page.tsx` adds a
  game-lookup query mirroring the lineup page's. Thread
  `slotGameByCardId` to `CollectionGrid`.
  - Default chip: `All` (schedule-agnostic behavior
    unchanged).
  - Chips `Pre / Live / Final / Off` filter by game state.
- **Acceptance:**
  - Default behavior unchanged.
  - Pre narrows to scheduled games.
  - Combined with tier/position filters works.

---

## P22.3 — Outs tracking

### T22.3.1 Migration 0034

- **What:**
  ```sql
  ALTER TABLE public.game
    ADD COLUMN current_outs smallint,
    ADD CONSTRAINT game_current_outs_valid
      CHECK (current_outs IS NULL OR (current_outs >= 0 AND current_outs <= 2));
  ```

### T22.3.2 Webhook handler

- **What:** `src/lib/mlb/webhook-handler.ts`
  `handleGameEvent` reads `payload.play?.outs`. After the
  game_event INSERT, UPDATE `public.game SET current_outs
  = ${outs}::smallint WHERE IS DISTINCT FROM`.
  `handleGameStarted` sets `current_outs = 0` via
  COALESCE. `handleGameEnded` clears.

### T22.3.3 View model + footer

- **What:** `SlotGameInfo` gains `currentOuts: number | null`.
  Lineup page SELECT adds it. `<SlotGameState>` LIVE branch
  appends ` ${outs}O` after the inning when available.

---

## P22.4 — Doubleheader support

### T22.4.1 Migration 0035

- **What:**
  ```sql
  ALTER TABLE public.game
    ADD COLUMN game_number smallint NOT NULL DEFAULT 1,
    ADD CONSTRAINT game_game_number_valid
      CHECK (game_number IN (1, 2));

  -- Dedup existing duplicates: keep earliest created_at per
  -- matchup-date, delete the rest.
  DELETE FROM public.game g USING (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY date, home_team_id, away_team_id
        ORDER BY created_at ASC, scheduled_start NULLS LAST
      ) AS rn
      FROM public.game
    ) ranked
    WHERE rn > 1
  ) AS dupes
  WHERE g.id = dupes.id;

  -- Drop old unique index if present.
  DROP INDEX IF EXISTS game_bdl_game_id_uidx;
  -- Recreate as non-unique (BDL occasionally reuses ids).
  CREATE INDEX game_bdl_game_id_idx ON public.game (bdl_game_id);

  -- New unique for real DH boundary.
  CREATE UNIQUE INDEX game_matchup_number_uidx
    ON public.game (date, home_team_id, away_team_id, game_number);
  ```

### T22.4.2 schedule-sync gameNumber pull

- **What:** `src/lib/mlb/mlb-stats-schedule.ts` —
  `fetchMlbStatsSchedule` response already has access to
  `games[].gameNumber` + `games[].doubleHeader`. Extend
  the return shape:
  ```ts
  export type MlbStatsScheduleEntry = {
    homeMlbStatsTeamId: number;
    awayMlbStatsTeamId: number;
    scheduledStartIso: string;
    gameNumber: number; // 1 or 2
    doubleHeader: "N" | "D" | "S"; // None, Day-night, Split
  };
  ```
- **`syncScheduleHorizon`** UPDATE augmented:
  ```sql
  UPDATE public.game
  SET scheduled_start = ...,
      game_number = ${gameNumber}::smallint,
      updated_at = now()
  WHERE date = ...
    AND home_team_id = ...
    AND away_team_id = ...
  ```
  If a matchup has game_number 1 AND 2 in the same UPDATE
  pass, we need a way to disambiguate our pre-backfill
  row from the new second game. Strategy: match by
  `scheduled_start` proximity (within 10s).

### T22.4.3 Slot footer DH marker

- **What:** `SlotGameInfo` gains `gameNumber: number`.
  `SlotGameState` LIVE + PRE + FINAL branches append
  ` (DH${gameNumber})` when the matchup has a DH that
  day.
  - To know "is this a DH day?" for the matchup, the
    server query adds a `SELECT has_double_header` derived
    column: `CASE WHEN count(*) OVER (PARTITION BY date,
    home_team_id, away_team_id) > 1 THEN true ELSE false
    END`.
  - Render `(DH1)` / `(DH2)` only when
    `hasDoubleHeader === true`.

### T22.4.4 Lineup dedup update

- **What:** Lineup page's DISTINCT ON order becomes:
  ```sql
  ORDER BY
    g.home_team_id, g.away_team_id,
    CASE g.status WHEN 'live' THEN 0
                  WHEN 'scheduled' THEN 1
                  WHEN 'final' THEN 2
                  ELSE 3 END,
    g.scheduled_start NULLS LAST,
    g.game_number,
    g.created_at
  ```

---

## P22.5 — `contest_status` enum cleanup

### T22.5.1 Migration 0036

- **What:** Same recipe as P20's migration 0033:
  rename old type → create new type without `'locked'` →
  drop DEFAULT + any dependent policies / triggers →
  ALTER COLUMN TYPE → restore dependencies → drop old
  type.
  - Check + drop any RLS policies or triggers that
    reference `contest.status`.
- **Pre-migration check:**
  `SELECT status, COUNT(*) FROM public.contest GROUP BY status;`
  — verify zero rows at `'locked'`.
- **Acceptance:** Migration applies clean; enum has
  `pending / live / final / canceled`.

### T22.5.2 SQL fn cleanup

- **What:** Grep SQL fns for `contest.status IN (...
  'locked' ...)`; remove `'locked'` from the lists.

### T22.5.3 TS type narrow

- **What:** `src/lib/db/schema/enums.ts` — drop `"locked"`
  from the `contestStatus` pgEnum's list.

---

## P22.6 — Deploy + verify

### T22.6.1 Apply migrations 0034 + 0035 + 0036

- **What:** `supabase db push --linked`. Expect possible
  dependency cascade on 0036 (per P20 recipe).

### T22.6.2 Deploy

- **What:** `vercel --prod --yes`.

### T22.6.3 Run `bdl-games-prefetch`

- **What:** Triggers the `schedule-sync` second-pass so
  `game_number` gets populated on today's + tomorrow's
  rows. Verify via Supabase studio.

---

## P22.7 — ADR-0027

Standard retro template.

---

## Dependencies

```
P22.1 (pill) ──► independent
P22.2 (filter chips) ──► depends on P22.1's pill styling (no hard dep, but visual uniformity)
P22.3 (outs migration) ──► P22.2 nice-to-layer on, but independent
P22.4 (DH migration) ──► P22.2 nice-to-layer on, but independent
P22.5 (contest_status cleanup) ──► independent
                                       │
                                       ▼
                                  P22.6 (deploy)
                                       │
                                       ▼
                                  P22.7 (ADR)
```

All six ship in one commit batch.

---

## What's NOT in Phase 22

Per spec §67:

- Standard parked items.
- Baserunners + pitcher-on-mound.
- Collection multi-day schedule view.
- Onboarding.

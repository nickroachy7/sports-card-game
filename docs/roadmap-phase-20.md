# Draft Deck — Phase 20 Roadmap (Feel Pass v1.12 — Live-Inning Legibility)

**Goal:** Close three Phase 18+19 open items as a tight
cleanup pass.

**Estimated effort:** ~1 day.

**Prerequisites:**

- Phase 19 shipped — `scheduled_start` now populated
  + slate TZ correct.
- Phase 12's `game` Realtime publication + REPLICA
  IDENTITY FULL — new inning columns flow through
  without further migration work.
- Webhook handler at `src/lib/mlb/webhook-handler.ts`
  already receives `play.inning` / `play.inning_half`.

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P20.1 | Migration 0032 + webhook inning writes     | 0.25 day | `game.current_inning` + `current_inning_half`. handleGameEvent/Started/Ended write them idempotently. |
| P20.2 | Slot footer reads inning                   | 0.15 day | SlotGameInfo type + lineup/page.tsx SELECT + SlotGameState renders "LIVE · T5 · 2-1". |
| P20.3 | Lineup page dedup for doubleheaders        | 0.15 day | DISTINCT ON ordered by status priority + start time. |
| P20.4 | Migration 0033 + enum cleanup              | 0.25 day | Drop 'locked' from contest_entry_status. TS types narrow. |
| P20.5 | Deploy + verify                            | 0.1 day  | Apply migrations, deploy, test-trigger a webhook. |
| P20.6 | ADR-0025 retro                             | 0.1 day  | Standard retro. |

---

## P20.1 — Live inning on game row

### T20.1.1 Migration 0032

- **What:** `supabase/migrations/0032_game_live_inning.sql`:
  ```sql
  ALTER TABLE public.game
    ADD COLUMN current_inning integer,
    ADD COLUMN current_inning_half text
      CHECK (current_inning_half IN ('top', 'bottom') OR current_inning_half IS NULL);
  ```
- **Acceptance:** applied locally + prod, columns visible,
  check constraint enforces valid values.

### T20.1.2 handleGameEvent writes inning

- **What:** `src/lib/mlb/webhook-handler.ts` —
  `handleGameEvent` already extracts `payload.play?.inning`
  / `inning_half`. After the game_event INSERT, also:
  ```ts
  UPDATE public.game
  SET current_inning = ${inning}::int,
      current_inning_half = ${inning_half}::text,
      updated_at = now()
  WHERE id = ${gameId}::uuid
    AND (current_inning IS DISTINCT FROM ${inning}::int
         OR current_inning_half IS DISTINCT FROM ${inning_half}::text)
  ```
- **Acceptance:** the UPDATE fires only on value change;
  no-op when already matches.

### T20.1.3 handleGameStarted + handleGameEnded

- **What:**
  - `handleGameStarted`: set `current_inning = 1,
    current_inning_half = 'top'` if NULL.
  - `handleGameEnded`: clear to NULL, NULL.
- **Acceptance:** start/end transitions don't leave stale
  inning on the row.

---

## P20.2 — Slot footer reads inning

### T20.2.1 Extend SlotGameInfo type

- **What:** `src/lib/lineup/types.ts` — `SlotGameInfo`
  gains two optional fields:
  ```ts
  currentInning: number | null;
  currentInningHalf: "top" | "bottom" | null;
  ```

### T20.2.2 Lineup page SELECT

- **What:** `src/app/(app)/lineup/page.tsx` game query
  pulls `current_inning` + `current_inning_half`. Maps
  into `slotGameByCardId` entries.

### T20.2.3 SlotGameState renders inning

- **What:** `src/components/lineup/SlotGameState.tsx`
  `renderFooter()` LIVE branch gains inning when
  available:
  ```ts
  const halfPrefix = info.currentInningHalf === "top" ? "T" : "B";
  const inningPart = info.currentInning ? ` · ${halfPrefix}${info.currentInning}` : "";
  // "LIVE · T5 · 2-1"
  ```
  Falls back to `LIVE · ${score}` when inning is null.

### Acceptance

- [ ] Slot footer during live play shows inning.
- [ ] Degrades gracefully when inning is null.

---

## P20.3 — Lineup page dedup

### T20.3.1 DISTINCT ON query

- **What:** rewrite the game query in
  `src/app/(app)/lineup/page.tsx`:
  ```sql
  SELECT DISTINCT ON (g.home_team_id, g.away_team_id)
    g.id, g.home_team_id, g.away_team_id,
    ht.abbreviation AS home_abbr,
    at.abbreviation AS away_abbr,
    g.scheduled_start, g.status, g.home_runs, g.away_runs,
    g.current_inning, g.current_inning_half
  FROM public.game g
  LEFT JOIN public.team ht ON ht.id = g.home_team_id
  LEFT JOIN public.team at ON at.id = g.away_team_id
  WHERE g.id = ANY(...)
  ORDER BY
    g.home_team_id, g.away_team_id,
    CASE g.status WHEN 'live' THEN 0
                  WHEN 'scheduled' THEN 1
                  WHEN 'final' THEN 2
                  ELSE 3 END,
    g.scheduled_start NULLS LAST,
    g.created_at
  ```
- **Acceptance:** today's LAA@TOR dupe collapses to one
  entry; lineup shows one slot footer per matchup.

---

## P20.4 — Enum cleanup

### T20.4.1 Migration 0033

- **What:** `supabase/migrations/0033_drop_locked_entry_status.sql`:
  ```sql
  ALTER TYPE public.contest_entry_status
    RENAME TO contest_entry_status_old;

  CREATE TYPE public.contest_entry_status AS ENUM
    ('building', 'submitted', 'live', 'final');

  ALTER TABLE public.contest_entry
    ALTER COLUMN status TYPE public.contest_entry_status
    USING status::text::public.contest_entry_status;

  DROP TYPE public.contest_entry_status_old;
  ```
- **Acceptance:** migration applies; enum has 4 values;
  no data loss (verified pre-migration: zero rows at
  'locked').

### T20.4.2 SQL fn cleanup

- **What:** `update_lineup_slot`, `swap_lineup_slots`,
  `apply_token`, `remove_token` — remove `'locked'` from
  the `IN (...)` status checks. Update via migration
  0033 (include in same file).

### T20.4.3 TypeScript narrow

- **What:** `src/lib/lineup/types.ts` + any other files
  referencing `"locked"` as a contest-entry-status:
  drop from the union.
- **Acceptance:** typecheck clean after the union narrows.

---

## P20.5 — Deploy + verify

### T20.5.1 Apply migrations

- **What:** `supabase db push --linked`.
- **Acceptance:** migrations 0032 + 0033 apply cleanly.

### T20.5.2 Deploy code

- **What:** `vercel --prod --yes`.

### T20.5.3 Manual webhook smoke (optional)

- **What:** If live game is in progress, observe prod
  webhook events hitting and game row's inning columns
  updating in Supabase studio.
- **Acceptance:** inning-UPDATE happens; slot footer on
  lineup page (refreshed) shows "LIVE · T5 · 2-1".

---

## P20.6 — ADR-0025

Standard template.

---

## Dependencies

```
P20.1 (migration 0032 + handler) ──► P20.2 (slot footer)
P20.3 (dedup) ──► independent
P20.4 (enum cleanup) ──► independent
                                   │
                                   ▼
                              P20.5 (deploy)
                                   │
                                   ▼
                              P20.6 (ADR)
```

---

## What's NOT in Phase 20

Per spec §57:

- Standard parked items (onboarding / a11y / sound / etc.).
- Full doubleheader support (second-game surfacing,
  unique index, game_number).
- Outs / baserunners / pitcher-on-mound on game row.
- Auto-transition of contest_entry.status.

# Draft Deck — Phase 47 Roadmap (v1.32 — Future-final game hygiene)

**Goal:** Fix the user-visible bug where slot pills say
"FINAL L 4-12" on games that haven't started yet. Three-layer
defense: display guard, ingestion guard, one-time backfill.

User report:
> "Altuve and Lee for example are showing games from yesterday."

Diagnosed: BDL ingestion path is delivering pre-populated
`status='final'` for games with `scheduled_start` still in the
future. 4 games on prod today; could happen any day.

**Estimated effort:** ~0.3 day.

---

## Milestones

| ID    | Milestone                                              | Target    |
|-------|--------------------------------------------------------|-----------|
| P47.1 | Migration 0059 — backfill `future-final` rows           | 0.03 day  |
| P47.2 | `fetchSlotGameByCardId` display guard                  | 0.07 day  |
| P47.3 | Webhook handler: reject `mlb.game.ended` if future     | 0.07 day  |
| P47.4 | `bdl-games-prefetch` cron: override final→scheduled    | 0.05 day  |
| P47.5 | Verify on prod (visual check of Lee + Altuve pills)    | 0.02 day  |
| P47.6 | Lint / build / push + ADR-0047                         | 0.06 day  |

---

## Notes

- **P47.1** — single UPDATE, idempotent. Resets `status`,
  `home_runs`, `away_runs`, `current_inning`,
  `current_inning_half`, `current_outs` for every row matching
  `status='final' AND scheduled_start > now()`. Apply once on
  dev + prod via MCP.
- **P47.2** — modify the SQL CTE in `fetchSlotGameByCardId` to
  project `effective_status` via `CASE WHEN ... > now()
  THEN 'scheduled' ELSE c.status END`. Use `effective_status`
  in DISTINCT ON ranking + final SELECT. Zero scores in the
  same case. Display layer never trusts a future-final.
- **P47.3** — pre-write check in the webhook handler. If a
  `mlb.game.ended` event arrives for a game whose
  `scheduled_start > now() - 5 minutes`, log warning + write
  to `webhook_failed` with reason `'future_final_rejected'`.
  5-min grace for clock skew between BDL + our DB.
- **P47.4** — `bdl-games-prefetch` ingests game schedule
  data daily. If BDL returns a row with `status='final'` AND
  scheduled_start in the future, override the status to
  `'scheduled'` before upsert. Log override count in cron
  response.
- **P47.5** — quick check: the user's lineup page should now
  show `VS NYY · 7:10P` for Altuve and `VS MIA · 4:05P` for
  Lee instead of the FINAL pills.

---

## Files touched

- `supabase/migrations/0059_backfill_future_finals.sql` — NEW
- `src/lib/lineup/fetch-slot-games.ts` — display guard
- `src/app/api/webhooks/balldontlie/mlb/route.ts` — ingestion guard
- `src/app/api/cron/bdl-games-prefetch/route.ts` — override on prefetch
- `docs/adr/ADR-0047_phase-47-retro.md` — NEW

No schema changes; no Drizzle schema edits needed.

---

## Verification (after deploy)

```sql
-- Should return 0 rows after the backfill + going forward.
SELECT COUNT(*) FROM public.game
WHERE status = 'final' AND scheduled_start > now();
```

Re-run periodically. If the count climbs above 0, the
ingestion guard missed something — investigate the source
event.

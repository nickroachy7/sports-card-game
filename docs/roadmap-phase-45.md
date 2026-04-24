# Draft Deck — Phase 45 Roadmap (v1.30 — Pack pool quality)

**Goal:** Stop drawing AAA-optioned players. Filter packs to the
MLB 26-man active roster (authoritative source: MLB Stats API)
and weight draws by spec-aligned tier bands (star / starter / role).

Core intent (user):
> We are pulling a lot of players from the minor leagues right now
> and that's not great for a fantasy ecosystem. How would a big
> fantasy company handle this?

**Estimated effort:** ~0.8 day.

---

## Milestones

| ID    | Milestone                                              | Target    |
|-------|--------------------------------------------------------|-----------|
| P45.1 | New `MLBStatsProvider` (statsapi.mlb.com, public)      | 0.10 day  |
| P45.2 | Migration 0051 — `player.is_26_man` column + index     | 0.03 day  |
| P45.3 | Cron `/api/cron/mlb-26man-sync` — daily 4 AM ET        | 0.10 day  |
| P45.4 | Cron `/api/cron/player-tier-classify` — daily 4:15 AM  | 0.15 day  |
| P45.5 | Migration 0052 — `open_pack` tier-weighted draw        | 0.15 day  |
| P45.6 | Migration 0053 — `pack_value_weights` update           | 0.02 day  |
| P45.7 | First run: populate `is_26_man` + tiers on prod        | 0.05 day  |
| P45.8 | PostHog `drawn_tier_distribution` + Sentry on 5xx      | 0.05 day  |
| P45.9 | Verify / lint / build / deploy + ADR-0045              | 0.13 day  |

---

## Notes

- **P45.1** — MLB Stats API at `statsapi.mlb.com/api/v1/teams/{id}/roster?rosterType=active`
  is free + public. No auth. Fetches the 26-man per team. 30
  teams = 30 HTTP calls per cron, runs once a day. Cheap.
- **P45.2** — `is_26_man boolean NOT NULL DEFAULT false`. Add
  a partial index on `(is_26_man) WHERE is_26_man = true` if
  the player table grows past 10K rows. Current pool of 5,400
  doesn't need it yet.
- **P45.3** — Cron body:
  - Fetches all 30 team rosters
  - Builds unioned set of mlbam_ids (~780)
  - Single UPDATE on `public.player` — SET is_26_man based on
    membership in the set
  - Returns `{ teams_synced, mlbam_ids_active, flips_up, flips_down }`
- **P45.4** — Cron body:
  - Aggregates rolling-365-day FP from game_event for each
    26-man player (separately for hitters via
    `batter_player_id` and pitchers via `pitcher_player_id`)
  - Ranks and assigns tier per the §163 thresholds
  - Updates `player.designated_value_tier`
  - Skips non-26-man players (they stay whatever they were;
    irrelevant since `open_pack` filters them out)
- **P45.5** — `open_pack` SQL fn rewrite:
  - Replaces the single random-player draw with:
    1. Tier draw via `random() * 100` against
       `pack_value_weights[pack_type]`
    2. Random unowned player in that tier
    3. Tier-fallback chain: star → starter → role if no
       unowned player in the chosen tier
  - Premium packs prepend a guaranteed-star draw as the first
    slot
- **P45.6** — Updates the active `economy_config` row's
  `pack_value_weights` jsonb. Also adds
  `guaranteed_star_slot_per_pack: { "premium": true }` as a
  new JSON sibling.
- **P45.7** — On the prod DB, after migrations land:
  1. Manually invoke `/api/cron/mlb-26man-sync`
  2. Verify `is_26_man = true` count ≈ 780
  3. Manually invoke `/api/cron/player-tier-classify`
  4. Verify tier distribution: ~80 star / ~200 starter / ~500 role

---

## Expected pool after P45

Before (current):
- 936 drawable players (40-man + status='active')
- All tagged `role` — weights ignored by open_pack

After:
- ~780 drawable (MLB 26-man only)
- ~80 `star` (top 50 hitters + top 30 pitchers by 365d FP)
- ~200 `starter` (next tier by FP)
- ~500 `role` (rest of 26-man)
- 0 `prospect` in practice (filter excludes them)

---

## Pack weight table (authoritative)

| Pack     | Star | Starter | Role | Guaranteed star? |
|----------|-----:|--------:|-----:|------------------|
| Daily    |  0%  |   25%   | 75%  | No               |
| Standard |  8%  |   40%   | 52%  | No               |
| Premium  | 18%  |   52%   | 30%  | **Yes** (1 slot) |

---

## Files touched

- `src/lib/mlb/stats-api.ts` — NEW
- `src/app/api/cron/mlb-26man-sync/route.ts` — NEW
- `src/app/api/cron/player-tier-classify/route.ts` — NEW
- `supabase/migrations/0051_player_is_26_man.sql` — NEW
- `supabase/migrations/0052_open_pack_tier_weighted.sql` — NEW
- `supabase/migrations/0053_pack_value_weights_p45.sql` — NEW
- `vercel.json` — add cron entries for the two new crons

---

## Dependencies

- Phase 41 (tier-budget contracts) — no conflict.
- Phase 44 (reveal row redesign) — no conflict; reveal flow
  receives whatever player tiers open_pack returns.

---

## Out of scope (deferred)

- Real-time roster sync (webhook-style). MLB Stats API
  doesn't support webhooks; daily cron is acceptable.
- Minor-league-themed packs (separate pool of AAA/AA
  players). Possible post-v1 content drop.
- Positional tier scarcity ("top 3 SS"). Flat ranking only.
- Manual star overrides for injured-but-returning players.

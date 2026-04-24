# ADR-0045 — Phase 45 (Pack pool quality) Retrospective

**Status:** Accepted · **Date:** 2026-04-24
**Phase:** Phase 45 (v1.30)
**Companion specs:** `draft-deck-polish-spec.md` §161–§170,
`docs/roadmap-phase-45.md`.

---

## Context

User feedback during live testing: "We are pulling a lot of
players from the minor leagues right now and that's not great for
a fantasy ecosystem."

Diagnosis — the draw pool was everyone on `is_active_40_man =
true AND status = 'active'`. That's 936 players, but a 40-man
roster per team includes ~14 guys currently optioned to AAA
affiliates. Users were pulling "Jhonny Ramírez, AAA reliever
who's never been on an MLB mound" and bouncing off.

Gameplay spec §6.3 had already defined the remedy — four tiers
(star / starter / role / prospect) with per-pack weighting — but
it was never wired. Every player in the DB carried
`designated_value_tier = 'role'`; `pack_value_weights` JSON in
`economy_config` existed but was ignored by `open_pack`.

User pushed back on my first proposal (365-day rolling game-
participation window). "How would a big fantasy company handle
this?" Industry answer: DraftKings, FanDuel, and Topps Bunt all
source 26-man status from MLB's official Stats API. We were
flying blind on a BDL integration that only exposes
`active: boolean` (doesn't distinguish 26-man from
40-man-optioned).

## Decision

### §161 MLB Stats API as authoritative 26-man source

- New `src/lib/mlb/stats-api.ts` provider wraps
  `statsapi.mlb.com/api/v1/teams/{id}/roster?rosterType=active`.
  Free, public, no auth, no rate limits at our scale.
- Exposes `fetchActiveTeams()`, `fetchActiveRoster(teamId)`,
  and `fetchAllActiveRosters()` (parallel fetch across 30
  teams).

### §162 `player.is_26_man` column

- Migration 0051 adds `is_26_man boolean NOT NULL DEFAULT false`
  + partial index on `(mlbam_id) WHERE is_26_man = true`.
- New cron `/api/cron/mlb-26man-sync` (daily 05:00 ET):
  builds union of mlbam_ids across all 30 active rosters,
  single UPDATE sets flag based on membership. Partial failures
  (single-team 5xx) don't tank the sync — logged + counted.

### §163 Tier classification cron

- New cron `/api/cron/player-tier-classify` (daily 05:15 ET):
  rolling-365-day FP via `game_event` aggregation, ranked
  separately for hitters + pitchers using `_score_batter_event`
  and `_score_pitcher_event` (same helpers the live pipeline
  uses).
- Limits (gameplay spec §6.3 targets):
  - Top 50 hitters + top 30 pitchers → `star` (~80 players)
  - Next 200 hitters + next 100 pitchers → `starter` (~300)
  - Remainder of 26-man → `role` (~400)
- Non-26-man players reset to `role` for audit cleanliness.

### §164–§165 Tier-weighted `open_pack`

- Migration 0052 rewrites `open_pack` + adds two helpers:
  - `_roll_pack_tier(weights jsonb) → text` — weighted random
    tier selection. Tolerates weight drift.
  - `_draw_player_in_tier(user_id, tier, pool_rule) → uuid` —
    random unowned player in the given tier, with
    star → starter → role fallback chain.
- Premium packs reserve the **first** slot for a guaranteed
  star draw (falls back to starter if none available).
- `pool_rule` returns `'26_man'` if any players have
  `is_26_man = true`; otherwise `'40_man'`. Graceful bootstrap
  before the cron ever runs.

- Migration 0053 updates `economy_config.pack_value_weights`:

  | Pack     | Star | Starter | Role | Guaranteed star? |
  |----------|-----:|--------:|-----:|------------------|
  | Daily    |  0%  |   25%   | 75%  | No               |
  | Standard |  8%  |   40%   | 52%  | No               |
  | Premium  | 18%  |   52%   | 30%  | **Yes**          |

  Plus `guaranteed_star_slot_per_pack` sibling map.

### Cron schedule

- `05:00 ET` — mlb-26man-sync (before tier classify)
- `05:15 ET` — player-tier-classify (depends on fresh 26-man)

Both added to `vercel.json`.

## Consequences

**What got better:**

- Authoritative 26-man roster data — same source every major
  fantasy product uses.
- AAA-optioned players stop showing up in packs within 24h of
  being sent down.
- Premium packs finally feel premium (18% star + guaranteed
  first-slot star vs daily's 0% star).
- Tier classification responds to real-world performance —
  a slumping star drops out over ~12 weeks; a hot rookie
  climbs within a month of callup.
- All the code already lived in the DB (§6.3 shape, enum,
  config keys). This phase just activated dormant
  infrastructure.

**What's still open:**

- Tier classification runs once daily. A player traded Friday
  won't reflect in tier until Saturday 05:15 ET at earliest.
  Acceptable for v1.
- Guaranteed-star slot on premium could cause a race with dupe
  resolution for users who already own every star. Falls back
  to starter correctly, but if we ever have a user own all 80
  stars the pack degrades to standard weighting. Edge case —
  revisit if anyone complains.
- Prospect tier still unused in v1. Kept in the enum for a
  future themed-pack pass (e.g. "Prospect Pack" drawing only
  from `is_26_man = false` players with MLB debut_year set).
- Historical pack_value_weights revisions aren't tracked —
  economy_config is append-only in design but we mutate in
  place here. Audit of "when did weights change" is lost.
  Acceptable for now.
- MLB Stats API is unversioned public — if they ever change
  response shape our sync breaks silently. Mitigated by
  Sentry breadcrumbs on 5xx + the 40-man fallback in
  open_pack.

## Tricky bits

- `economy_config` has no `updated_at` column (append-only by
  design). Migration 0053 mutates in place rather than
  inserting a new row. Noted in migration comment.
- `_draw_player_in_tier` returns a TABLE not a scalar —
  callers need to `SELECT dp.id INTO r FROM ...(...) dp`.
  Wrapped inline in open_pack so the existing dupe flow stays
  unchanged.
- `game_event.event_at` is the timestamp column, not
  `occurred_at`. Initial spec draft had the wrong name;
  corrected during build.
- `_score_batter_event` lives in migration 0012 — already
  used by `_apply_game_event_to_lineups`. Reusing it in the
  tier classifier means tier ranks match the same FP math
  users see in contests.
- The 40-man fallback in open_pack (when nobody has
  `is_26_man = true` yet) means the initial deploy doesn't
  break packs — same behavior as pre-P45 until the crons
  populate the column.

## Rollout order on prod

1. Migration 0051 (column) ✅
2. Migration 0052 (open_pack rewrite) ✅
3. Migration 0053 (weights update) ✅
4. Ship code + cron config (this commit)
5. First automatic run at 05:00 ET tomorrow. User can trigger
   earlier via:
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://draft-deck.vercel.app/api/cron/mlb-26man-sync
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://draft-deck.vercel.app/api/cron/player-tier-classify
   ```

Until step 5 completes, open_pack uses the `'40_man'` fallback
pool and tier weighting no-ops (all role → all draws are role).
Graceful degrade; no user-facing break.

## Alternatives considered

- **Stat-based rolling window without MLB Stats API.** My first
  proposal. Industry-inauthentic; user pushed back. Works
  around not having roster data rather than solving it.
- **Themed prospect packs as separate SKU.** Deferred (§170).
  Could revisit if user wants to re-engage the minor-league
  player pool as content rather than noise.
- **Manual star-list curation.** Stability but staleness —
  misses mid-season breakouts / slumps. FP-based auto-classify
  wins.
- **Per-position tier bands** (top 3 SS etc.). More complex,
  no immediate user ask. Flat ranking ships.

## Links

- Commit: (forthcoming) `feat(pack): P45 pack pool quality`
- Polish spec: §161–§170
- Roadmap: `docs/roadmap-phase-45.md`
- Related: Gameplay spec §6.3 (defined the four-tier model,
  implemented ~8 phases later)
- Related: BDL integration spec §7.1 (daily roster sync —
  the MLB Stats API sync lives alongside, not replacing)

# ADR-0009 — Phase 4 Retrospective

**Status:** Accepted · **Date:** 2026-04-20
**Phase:** Phase 4 (Vault + Milestones + Leaderboards)
**Companion:** Phase 1 roadmap §"After Phase 1"; specs referenced per
slice.

---

## Context

Phase 4's charge: round out the season-long meta-game around the live
contest slice shipped in Phases 2–3.

- **Vault** — per-spec §11.4, §12, §5.5, §6.4, §3.6.
- **Milestones** — per §15, §5.6.
- **Leaderboards** — per §18.3, §5.7, §4.2.
- **Public profiles** — per §18.1, §4.3–4.4.

The slice also had to close three ride-along gaps identified in the
Phase 3 exit: bumping `card.career_fp_total` and decrementing
`contract_plays_remaining` on contest resolution, granting manager XP
for wins and token triggers, and preparing a real season-close path
(without yet building the Phase 5 cron).

Estimate: 4–6 days. Actual: shipped in nine atomic commits (P4.1–P4.9),
each a single acceptance slice followed by a prod deploy.

## Decision

Build and ship in tight vertical slices — SQL first, then actions, then
UI — with prod deploys per slice. No rewrites of P1–P3 code. Defer any
slice that required schema pain (real card dissolve semantics) or Phase
5 scope (season-close cron, Opening Day bulk grant, rank finalization).

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P4.1 | `f5379494` | 0013 resolution fn + trigger: career FP, contracts, milestone counters, XP on entry→final |
| P4.2 | `0063f2f3` | 0014 milestone tier-crossing awards + XP + coins; `_finalize_contest_entry` refreshed |
| P4.3 | `c4214b8f` | Milestones page: 4 progress bars, tier checkmarks, history feed |
| P4.4 | `53815a83` | 0015 vault commit SQL fn + preview fn + Server Actions; `token_application.card_id` relaxed |
| P4.5 | `cc7fbd79` | /vault page: by-season timeline with per-season recap banner |
| P4.6 | `05d352d7` | /api/leaderboards/[type] (4 types) + page with tab switcher + your-rank pin |
| P4.7 | `81a52df2` | /api/profile/[teamName] + /vault routes; public /p/[teamName] page |
| P4.8 | `561a7652` | /vault/ceremony 5-step flow; dev `season-close-sim` helper; vault banner |
| P4.9 | *(this)* | Retrospective ADR |

All nine deploys went live on `draft-deck.vercel.app`. Migrations
0013–0015 are applied on prod (`qifsxnwvxfsiucrlchka`).

## What went well

1. **The trigger chain just clicked.** Stacking
   `_finalize_contest_entry` on `AFTER UPDATE OF status WHEN NEW.status
   = 'final'` let every ride-along (career FP, contracts, milestones,
   XP) ride along for free on the existing
   `mark_contest_entries_on_game_end` path. Existing BEFORE-UPDATE
   triggers (`recompute_card_tier`, `recompute_card_expiry`,
   `_bump_season_fp`) fired naturally — no explicit orchestration.
2. **DO-block RAISE rollback was the right smoke-test pattern.**
   Every SQL slice was verified against prod inside a `DO $$ ... RAISE
   EXCEPTION 'TEST_OK: %' $$` that aborts the transaction. Fast, no
   state leakage, surfaces the verification report via the error
   message.
3. **Config-driven awards.** Milestone thresholds, reward bundles,
   per-event XP, and level thresholds all live in `economy_config`.
   Tuning dials without redeploys is already working; bonus-token
   rewards have the code path but zero seeded values — a config-only
   change turns them on.
4. **Public surface layering is clean.** A single query helper
   (`src/lib/leaderboards/queries.ts`, `src/lib/profile/queries.ts`) is
   consumed by both the external API route and the Server Component
   page. No duplication; the route handlers exist for external callers
   and edge cache.

## What surprised us

1. **Season-end card deletion needs schema cooperation.** The gameplay
   spec says non-vaulted cards "dissolve entirely" at season end, and
   the API spec says `card (update is_vaulted = true for chosen;
   delete for the rest)`. But `token_application.card_id` was `NOT
   NULL` with no cascade. Fix: relax to nullable + `ON DELETE SET
   NULL` in 0015. Audit rows survive the card they reference — which
   is the correct semantics anyway.
2. **PostgREST returns joined rows as arrays inconsistently.** The
   `season:season_id (year)` / `player:player_id (...)` joins land
   sometimes as an object, sometimes as an array, depending on how
   strict the generated types are. Solved with a `pickOne` helper in
   both vault-page and public-profile code. Probably worth folding into
   a shared helper if we do another page that joins this way.
3. **The unique index on `card (user_id, player_id) WHERE is_vaulted =
   false`** means dissolved cards must either be hard-deleted or moved
   out of that partial index. Going with hard-delete kept the index
   simple; the trade was the FK relaxation above.
4. **`DO $$` blocks inside `execute_sql` don't see RAISE NOTICE.** Had
   to use `RAISE EXCEPTION 'TEST_OK: ...'` to surface assertion reports.
   Slightly awkward (success path looks like an error) but reliable.
5. **PostgreSQL rank-within-a-partial-partition is hard to model.** The
   spec's rank-based contest XP (contest_win, contest_top_10) needs
   `final_rank` for *every* entry in a contest — which in turn needs a
   contest-level "all entries final" barrier. Deferred to a follow-up
   cron; per-entry XP (contest_entry, token_triggered) is live today.

## What we deliberately simplified

1. **`pitching_wins` milestone counter stays 0.** Requires winning-
   pitcher data from the post-game box score that P3 never pulled.
   Phase 5 reconciliation cron will populate it.
2. **Rank-based manager XP deferred.** `contest_win` (+100) and
   `contest_top_10` (+25) grants need a contest-level finalize pass
   that computes `final_rank` across all entries — lands alongside
   the Phase 5 season-close / contest-finalize work.
3. **`lifetime_contests_won`** likewise untouched; same rank-based
   gate.
4. **Ceremony recap is minimal.** Per spec §6.4 the recap should "type
   in" each stat one by one; the launch version is a static stat-pill
   grid. Polish lives in Phase 6.
5. **Selection is tap-to-toggle, not drag-drop.** Per react-dnd use
   elsewhere in the app we could do drag, but tap ships simpler and
   reads the same on desktop. Deferred to Phase 6.
6. **Dissolve animation is CSS opacity fade.** Spec calls for "motes
   of light over ~3 seconds"; we run a 2.5s opacity transition while
   the Server Action resolves. Enough for the beat; particle FX land
   with Phase 6.
7. **No real season-close cron.** /api/dev/season-close-sim is the
   only thing that flips `season.status` today. Phase 5 owns the
   actual cron.
8. **Tier-frame motion, ceremony particles, type-in recap** — all
   deferred to Phase 6, consistent with ADR-0008.

## What's ready for Phase 5

- Vault commit path is idempotent and dissolves non-chosen cards
  cleanly — the season-close cron only needs to flip `season.status`
  and nudge users; the vault commit itself is solved.
- Milestone tier awards, XP grants, coin credits, and lifetime-stat
  bumps all flow through `_finalize_contest_entry` on every contest
  resolution. No extra work for Phase 5 to pipe through.
- Leaderboards are live for all four types and are cache-friendly at
  `s-maxage=60`. Phase 5 just needs to handle Opening Day → season
  roll (which resets season-scoped boards naturally via the new
  `season.id`).
- Public profiles expose team identity + vault, link targets from
  leaderboard rows already work.

## Open items (unblock Phase 5 and launch)

1. **Season-close cron** (`/api/cron/season-close`) per API spec §5.11.
   Flips `season.status` to `offseason`, nudges the users (email / push
   TBD).
2. **Opening Day cron** (`/api/cron/opening-day`) — bulk-grants starter
   bundles for the new season; batched per spec §5.10.
3. **Contest finalize pass** — compute `final_rank` per contest when
   every entry hits `final`, then award rank-based XP + coin payouts
   + `lifetime_contests_won` bumps.
4. **`pitching_wins` population** — post-game reconciliation cron adds
   a winning-pitcher event to `game_event` per game; the existing
   `_finalize_contest_entry` milestone counter query extends to
   include it.
5. **Grace-period auto-dissolve** — 14 days post-close, auto-dissolve
   uncommitted vaults (per API spec §5.11).
6. **BDL webhook URL registration** — still pending per Phase 3 retro.
   Non-blocking; /api/dev/webhook-sim covers all dev testing.

## Follow-ups noted during Phase 4

| TODO | Lands in |
|---|---|
| Season-close cron + Opening Day cron | Phase 5 |
| Rank-based XP + `lifetime_contests_won` | Phase 5 |
| `pitching_wins` milestone counter | Phase 5 |
| Ceremony recap type-in animation | Phase 6 |
| Selection drag-drop + particle-mote dissolve | Phase 6 |
| Bonus-token milestone rewards (config-only) | Tuning pass |
| Shared PostgREST `pickOne` join helper | Next UI slice that needs it |

## Estimate vs reality

Estimate from the Phase 1 roadmap's forward-look: 4–6 days. Delivery
was nine slices over one working session. The estimate held.

## Consequences

- Phase 5 can focus purely on cron orchestration and rank
  finalization — no new business-logic surfaces required.
- The `card` table's dissolution story is committed: hard-delete with
  SET-NULL downstream. Reversing this (to a soft-delete marker) would
  be a future schema change if we ever need historical card records.
- `token_application` is no longer strictly append-only in one
  specific place: the FK cascade nulls `card_id` on card delete. The
  row survives, the audit survives, only the link is broken. This is
  documented in 0015 and consistent with "season-end is a special
  case" footnote in CLAUDE.md §7.3 spirit.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective (predecessor; listed most of the
  Phase 4 surfaces as "deferred to Phase 4").

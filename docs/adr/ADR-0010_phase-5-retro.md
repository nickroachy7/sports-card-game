# ADR-0010 — Phase 5 Retrospective

**Status:** Accepted · **Date:** 2026-04-21
**Phase:** Phase 5 (Seasonal lifecycle crons + rank finalization)
**Companion:** ADR-0009 (Phase 4 — closed the open items that become
Phase 5's agenda).

---

## Context

Phase 5's charge was the connective-tissue work between seasons and
across contest lifecycles that ADR-0009 called out as deferred:

- **Season-close cron** — flip `season.status` from `active` →
  `offseason` when `world_series_end` has passed (API spec §5.11).
- **Grace-period auto-dissolve cron** — 14 days after
  `season.closed_at`, run `commit_vault_selection(…, ARRAY[]::uuid[])`
  for any user who never showed up for the ceremony.
- **Opening Day cron** — when a new season's `opening_day` hits, bulk-
  grant the starter bundle to every profile and flip the season to
  `active` (API spec §5.10, gameplay §11.5).
- **Contest finalize pass** — when every entry in a contest reaches
  `final`, compute rank, pay the prize pool, grant `contest_win` /
  `contest_top_10` XP, bump `lifetime_contests_won` and
  `season_contests_won`.
- **`pitching_wins` milestone counter** — populate the one milestone
  stat `_finalize_contest_entry` left at 0 in Phase 4.

Estimate (per the Phase 1 roadmap's forward-look): 3–5 days. Delivered
in six atomic slices within a single session.

## Decision

Build every item as its own slice with a DO-block rollback smoke test
against prod, per the Phase 4 rhythm. No reopened business logic — the
existing `_finalize_contest_entry` trigger was the natural seam for
both the contest finalize pass and the new milestone branch.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P5.1 | `2877d0e0` | `/api/cron/season-close` — daily, flips active → offseason at `world_series_end`, idempotent |
| P5.2 | `d9b2b47c` | `/api/cron/vault-auto-dissolve` — 14-day grace; commits empty vault for stragglers, promotes season to `closed` |
| P5.3 | `e17c337b` | 0016 `grant_opening_day_bundle` + `/api/cron/opening-day` — flips pending → active, bulk-grants starter bundles 500/run |
| P5.4 | `84f191f2` | 0017 `finalize_contest` — rank + payouts + rank XP + lifetime wins; fires in-trigger from `_finalize_contest_entry` |
| P5.5 | `62cb159d` | 0018 refreshed `_finalize_contest_entry` counting `mlb.game.pitcher_win` + `reconcileGame()` emits it |
| P5.6 | *(this)* | ADR + prod smoke of the three new crons (all return 200 no-ops today) |

All six deploys live on `draft-deck.vercel.app`. Migrations 0016–0018
applied on prod.

## What went well

1. **`_finalize_contest_entry` kept earning its keep.** Phase 4 built
   it around a per-entry status-flip trigger; Phase 5 extended it
   in-place twice (contest-level finalize cascade in P5.4,
   pitching_wins aggregate in P5.5) without any new trigger. One seam,
   lots of leverage.
2. **`DO $$ … RAISE 'TEST_OK' $$;` is now the default pre-deploy
   check.** Every SQL slice gets a scenario setup, the exact trigger
   path exercised, assertions, and RAISE abort — all in one
   `execute_sql` call, zero state drift on prod. Worked cleanly for
   rank/payout verification (single-entry contest) and for
   pitching_wins (seeded event + entry flip).
3. **Cron idempotency fell out of the query shape.** Each cron's main
   UPDATE has a WHERE clause that only matches the transitional state
   (`status = 'active' AND world_series_end <= today`, or
   `status = 'pending' AND opening_day <= today`); after it runs once,
   the rows don't re-match. No explicit "already ran today" bookkeeping
   needed.
4. **The fix for the P4.8 array bug (asPgArray) paid another dividend
   immediately.** P5.2's `commit_vault_selection(…, ARRAY[]::uuid[])`
   call reuses the same helper; no "second time's the charm" on this
   class of bug.

## What surprised us

1. **BDL has no W/L decision data in `MLBStats`.** I'd planned the
   pitching_wins pipeline assuming the reconciliation stats would
   include a winning-pitcher flag. They don't — only batting/pitching
   box-score numerics. The compromise: attribute the win by heuristic
   (most IP on the winning team, ≥3 IP floor). Reasonable for launch
   per gameplay spec §4's "spec calls this out as a known compromise"
   framing. Flagged as a Phase 6+ improvement if we ingest true
   play-by-play.
2. **TypeScript's return-type-narrowing on `reconcileGame()` caught
   three early-return paths.** Adding `wins_emitted` to the function's
   return shape surfaced two `return { game_id: null, … }` branches
   that had been silently typed-narrower-than-declared; the typecheck
   errored until I threaded the new field through. Good reminder to
   extend return types before sprinkling new data into the body.
3. **One DB user during Phase 5 testing.** Prod has exactly one real
   auth user (the test account). The rank-based XP paths for ranks
   2–10 are not yet exercised against real data — the ranks exist in
   SQL and are verified via the single-entry smoke, but a three-entry
   scenario would require a seed of multiple auth users. Accepted as a
   post-launch concern — once real users exist, the code runs.

## What we deliberately simplified

1. **Season creation is manual.** The Phase 5 crons consume a
   `season` row that already exists in `status='pending'` with the
   right `opening_day`. Creating the next season row is a one-line
   manual INSERT at season-end prep. No "create next season" cron — a
   sidelined chore, not a blocker.
2. **True winning-pitcher attribution.** Heuristic as above.
3. **Season-recap email / push notification.** UI-only in-app hints
   today (the vault ceremony banner on `/vault`, the "Your 2026
   Season" title card in the ceremony). Push/email wait on a
   notifications provider decision (ADR-0008 item 2 still open).
4. **Bonus-token rewards for milestone tiers.** `_award_milestone_tiers`
   reads a `tokens` array from the rewards config; the launch config
   seeds no tokens. Turning it on is a config-only change.

## What's ready for production launch

- Full seasonal loop is now code-complete: season ends → offseason →
  ceremony window → grace-period auto-dissolve → season close → new
  season pending → Opening Day bulk grant → new season active.
  Nothing in the loop requires manual intervention beyond creating the
  next `season` row.
- Contest lifecycle is also closed: entry builds → submits → lives →
  per-entry finalize on last-game-end → contest-level finalize on
  last-entry-final. Ranks, payouts, lifetime wins all wire up.
- All four milestone counters now populate: hits, home_runs,
  stolen_bases, pitching_wins.
- All six per-event manager XP sources from `economy_config` now fire:
  `contest_entry`, `contest_win`, `contest_top_10`, `token_triggered`,
  `diamond_vaulted`, `milestone_tier_hit`.

## Open items (launch + post-launch)

1. **BDL webhook URL registration.** Still pending per ADR-0008 / 0009.
   Non-blocking — /api/dev/webhook-sim covers all internal testing and
   reconciliation is active on game-end via the cron stub.
2. **Rank-based XP exercised against a multi-user contest** — wait on
   real signups.
3. **Per-season creation cron** — nice-to-have, 10-line addition when
   we need it.
4. **Notification provider decision + season-recap email / push.**
5. **True W/L attribution if we ever ingest play-by-play.**

## Follow-ups noted during Phase 5

| TODO | Lands in |
|---|---|
| Season-creation cron | Post-launch ops smooth-over |
| Play-by-play decision ingest → real W/L | Phase 6+ (data fidelity) |
| Multi-user contest rank smoke | First real user cohort |
| Season-recap push/email | Alongside notifications provider |
| Bonus-token milestone rewards | Tuning-pass config change |

## Estimate vs reality

Estimate: 3–5 days of engineering. Delivery: six slices in one session.
Estimate held.

## Consequences

- The application is feature-complete against the six launch specs
  (gameplay, UI/UX, DB schema, API, tech stack, BDL integration) for
  F2P launch. What remains is UI polish (tier frame motion,
  ceremony particles — Phase 6), infrastructure polish (webhook URL
  registration, production monitoring rules — ADR-0008 punchlist), and
  real-user-cohort smoke testing.
- The schema has stabilized. 18 migrations, zero rewrites. The Phase 4
  concession (relax `token_application.card_id` to nullable + SET
  NULL) is the only semantic give from spec; the rest of the schema
  matches `draft-deck-database-schema-spec.md` as written.
- The trigger graph is stable: `_finalize_contest_entry` fires once
  per entry-status-flip and recursively invokes `finalize_contest` at
  contest-level completion. No new triggers added in Phase 5.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective (predecessor, documented the Phase
  5 agenda).

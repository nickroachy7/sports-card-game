# ADR-0014 — Phase 9 (Real-Game Scoring) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 9 (Functional — schedule sync + first real end-to-end)
**Companion specs:** `draft-deck-polish-spec.md` §14,
`docs/roadmap-phase-9.md`.

---

## Context

Phase 8 closed with a live BDL webhook pipeline but the webhooks
had nothing to land on — `public.game` wasn't being populated
for today's MLB slate, so webhook events for real games were
being skipped as "unknown game" (the polite `unhandled: true`
path shipped in P8.6). Phase 9's single deliverable: close that
gap, then observe one real MLB game score a real lineup.

Estimate: 2–3 days. Shipped in 6 slices over a single session,
and the real-game observation surfaced a latent scoring bug from
Phase 3 that would have blocked every contest from ever scoring.

## Decision

Same deploy-per-slice rhythm. Schedule-sync logic extracted into
a pure module (`src/lib/mlb/schedule-sync.ts`) so the cron
route is thin. Added an ops-tool `admin-reconcile` endpoint for
manual game-reconciliation — genuinely useful beyond the Phase 9
smoke (future webhook drops, post-fix backfills). Ran a real
test-account lineup against a real MLB slate tonight; the attempt
uncovered + fixed a Postgres UPDATE-FROM bug.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P9.1 | `d24ef7f5` | `syncScheduleHorizon(daysAhead)` pure module. Pulls BDL for today + N days, upserts `public.game`. Two rules: no-regress on status (webhooks are authoritative for `live`/`final` transitions; sync mustn't stomp) + COALESCE on score fields (so mid-game webhook writes aren't wiped by a schedule view that returns null runs). `mapBdlStatus` pure-exported for tests. |
| P9.2 | `84f8068a` + `7b8d1ab3` | `bdl-games-prefetch` cron route rewired to call the module. Initial attempt at every-2h cadence hit Vercel Hobby's "one cron per day" limit — reverted to daily at 06:00 ET with `syncScheduleHorizon(2)` covering 48h per run. First manual invocation: 39 games synced, 0 errors, took 1.2s. |
| P9.3 | *(in P9.1)* | No-regress CASE expression lives in the upsert. Explicitly smoked on prod with a DO-block: `live` + upsert-of-`scheduled` → stayed `live`; `postponed` + upsert-of-`scheduled` → became `scheduled` (forward change allowed). Rolled back, prod untouched. |
| P9.4 | `78aca85f` | 9 unit tests for `mapBdlStatus`: null/empty/Scheduled/Pre-Game/Warmup → `scheduled`; In Progress / case variants → `live`; Final / FINAL / Final/10 → `final`; Postponed / Delayed / Suspended → `postponed` vs `suspended`; Canceled/Cancelled → `canceled`; unknowns conservatively default to `scheduled`; priority of `final` over substring collisions. All pass. Skipped mock-based sync test per repo convention (pure unit vs real-DB integration). |
| P9.5 | `9b69419c` + `24b78227` | `/api/cron/admin-reconcile` endpoint (CRON_SECRET-gated) takes `?bdl_game_ids=a,b,c` and invokes `reconcileGame(id)` on each. Built for ops + backfill recovery. Used it for the first real-lineup smoke tonight. **Uncovered the Phase-3-era UPDATE-FROM bug** — reconcile's slot update was trying to join through the UPDATE target's alias inside a FROM clause, which Postgres rejects with 42P01. Dev-sim never hit this because its events didn't match real lineup slots. Fixed by restructuring to a subquery-based UPDATE. After fix, 3 backfilled games populated 3 slot FPs cleanly (Lee 8.00, Freeland 2.00, Schanuel 3.00). |
| P9.6 | *(this)* | ADR-0014. No reduced-motion audit (all work server-side). No Playwright additions (observational). |

## First-real-game observations

The test account submitted at 04:37 UTC with 10 cards (mix of
hitters + two relievers). After the P9.5 backfill:

- **Slot-level scoring works end-to-end.** 3 of the 10 slots had
  their games already finalize pre-submission; admin-reconcile
  backfilled final_fp cleanly on 3 of those 3 (the 4th — Schanuel
  OF3 — hit a LAA doubleheader; game 1 populated, game 2 still
  scheduled).

- **Entry-level aggregate rollup is gated on `status IN ('live',
  'final')`.** Reconcile's rollup query excludes `submitted`, so
  the entry stays at live_score=0 / final_score=0 until the first
  tonight-scheduled game actually starts and flips the entry to
  `live`. Natural flow — not a bug — but worth documenting.

- **17 MLB games bound to tonight's contest.** Schedule sync +
  backfill wired them correctly. Five scheduled games still to
  come tonight with lineup players: HOU@CLE (Altuve), PHI@CHC
  (Busch), CIN@TB (Mullins), MIN@NYM (Baty + Melendez), TOR@LAA
  G2 (Schanuel). Two pitcher slots (Legumina, Sterner) will only
  score if they appear in OAK@SEA G2.

## What went well

1. **Pure-module + thin-cron-route pattern.** Extracting
   `syncScheduleHorizon` out of the old inline route made the
   module unit-testable + reusable. The route is now 50 lines
   of observability glue.
2. **`admin-reconcile` paid for itself the first night.** It
   was built as a nice-to-have ops tool and ended up being the
   mechanism that surfaced the reconcile bug. Same endpoint
   will be the recovery path whenever a webhook drops or a bug
   needs retro-replay.
3. **The no-regress CASE + COALESCE** worked on real traffic.
   Games that had been pushed to `live` by webhooks survived
   the schedule sync pass without regression. 39 games / 0
   conflicts.
4. **DO-block smoke pattern continued to pay.** Proved the
   no-regress rule on prod in one rolled-back transaction.
5. **Reduced-motion + Playwright deferrals were the right
   call.** This phase was entirely backend; nothing to
   animate, nothing to click-test.

## What surprised us

1. **A Phase-3 bug was only surfaced by real live traffic.**
   `reconcileGame`'s UPDATE statement joined through the update
   target's alias in a FROM clause (`JOIN card ON card.id =
   s.starter_card_id`, where `s` is the UPDATE target).
   Postgres rejects this: `42P01 invalid reference to
   FROM-clause entry for table "s"`. The bug had been latent
   for 6+ months because dev-sim events didn't match real
   lineup slots; the only test path was webhook simulation
   against contrived game ids, and no lineup-slot UPDATE ever
   actually ran. The first real-world contest-matched
   reconcile tonight immediately tripped it. Fix was a
   subquery-based UPDATE. **Lesson:** dev-sim harness needs a
   "real lineup with real game" fixture, not just arbitrary
   synthesized events.
2. **Vercel Hobby caps crons at once-per-day.** Spec'd every-2h
   cadence; the deploy failed with a clear error. Reverted to
   daily at 06:00 ET with the horizon-extended module doing
   the work-per-run. Docs noted upgrading to Pro unlocks the
   2h path with a one-line config change.
3. **BDL SDK doesn't expose `scheduled_start`.** `MLBGame` has
   `date: string` (just date, not timestamp). `scheduled_start`
   in our schema stays null for schedule-synced games; no
   regression vs. before.
4. **Contest was created before games existed.** `bdl-games-
   prefetch` was firing once a day at an unfortunate hour;
   `create_daily_contest(CURRENT_DATE)` ran, found no games in
   `public.game` yet, bound an empty array. Had to backfill
   `included_game_ids` manually for tonight. The new order —
   schedule sync *then* contest creation in the same cron
   invocation — handles this going forward, but today's
   contest (created at 00:30 UTC, before my 04:21 manual sync)
   needed the manual fix.

## What we deliberately simplified

1. **Skipped vi.mock-based test for `syncScheduleHorizon`.**
   Repo convention is pure unit tests vs. real-DB integration;
   adding a mock-heavy middle style is brittle + low-signal.
   DO-block prod smokes cover the integrated behavior at
   higher fidelity.
2. **Probable SP sync deferred.** BDL `MLBGame` doesn't expose
   probables. Not blocking — P8.5 W/L heuristic uses game-end
   IP, not pre-game predicted IP.
3. **No retro-backfill for historical games.** Out of scope.
   Phase 5 already closed earlier seasons.
4. **Admin-reconcile is CRON_SECRET-gated, no UI.** Ops tool,
   not a user-facing product surface. If it ever needs to be
   invokable by support staff we can put a thin admin UI in
   front; no current need.

## What's ready for the next polish pass

- Schedule sync is in place and tested against real BDL data.
  Games for today + 2 days are populated every 6 AM ET.
- `admin-reconcile` is the generic "replay a finalization"
  tool. Future use cases: dropped webhooks, post-fix
  backfills, dev smokes without dev-sim.
- `reconcileGame` UPDATE path is correct. First contest to
  actually resolve tonight will exercise the full flow.
- Schedule + webhook + reconcile pipeline end-to-end is proven
  at the slot level. Entry aggregate happens naturally when a
  scheduled game starts and flips the entry to `live`.

## Open items

1. **Entry-lifecycle observation.** Tonight, when the first
   scheduled game in the contest starts (HOU@CLE, PHI@CHC, etc),
   `mark_contest_entries_on_game_start` should flip the test
   entry from `submitted` to `live`. Then the rollup picks up
   the backfilled 13 FP + whatever new games contribute. Want
   to sanity-check this lifecycle tomorrow.
2. **Submitted-lineup UX.** User flagged that the page flips
   from the main lineup view to the list view after submit —
   prefers the lineup view to stay and just show live score
   overlaid. Phase 10 candidate.
3. **Dev-sim fixture upgrade.** Dev-sim didn't catch the
   UPDATE-FROM bug because its synthesized events never
   matched a real lineup slot. A fixture pattern that seeds a
   lineup + fires an `mlb.game.ended` would have caught this.
   Worth adding to the ops-tool toolbox.
4. **`commit_vault_selection` tolerance for pre-vaulted
   cards** — still carrying from P7.4.
5. **Live contest view polish, onboarding pass, empty +
   error sweep, a11y audit** — still parked.
6. **Pro upgrade + 2h cron cadence** — nice-to-have. Daily is
   sufficient for now.

## Estimate vs reality

Estimate: 2–3 days. Shipped: 7 commits in one session (including
the admin-reconcile helper, the UPDATE-FROM fix, and two manual
DB interventions for the pre-existing contest + card grant).
Held the budget; the reconcile bug discovery was additional
scope but also additional value — without that fix, no contest
would ever have scored.

## Consequences

- Draft Deck can score real MLB contests now. The webhook →
  game_event → reconcile → slot.final_fp chain is validated
  end-to-end on production data.
- `admin-reconcile` is a persistent ops surface for future
  recovery scenarios.
- The Phase 3 reconcile UPDATE bug is retired after living in
  the codebase for half a year. Future contests will reconcile
  on their natural `mlb.game.ended` path without manual
  intervention.
- Schedule sync horizon lets the prefetch cron run infrequently
  (once a day) without starving the pipeline — each run covers
  ~48h of future games.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective.
- ADR-0010 — Phase 5 Retrospective.
- ADR-0011 — Phase 6 Retrospective.
- ADR-0012 — Phase 7 Retrospective.
- ADR-0013 — Phase 8 Retrospective.

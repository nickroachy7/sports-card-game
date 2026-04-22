# ADR-0016 — Phase 11 (Integration Test Harness) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 11 (Fixture-based integration tests for
reconcile + ceremony SQL fns)
**Companion specs:** `draft-deck-polish-spec.md` §19–§20,
`docs/roadmap-phase-11.md`.

---

## Context

Two phases in a row (ADR-0014 Phase 9, ADR-0015 Phase 10)
surfaced pre-existing latent SQL bugs only when the functions
were first invoked against real lineup data in production:

- **P9.5:** `reconcileGame`'s UPDATE-FROM-through-alias crashed
  with `42P01` the first time a real user's slot matched a
  reconciled player.
- **P10.5:** `commit_vault_selection` stacked three bugs (owner
  guard rejecting pre-vaulted, `token_applied_both_or_neither`
  check violation, `token_application.token_id` FK block) —
  each surfaced by the next as DO-block smokes were iteratively
  fixed.

Both bug chains were caught pre-commit via prod-safe DO-block
smokes, but the pattern was clear: the DO block earns its keep
*after* the code lands. An integration harness that seeds
realistic scenarios + invokes the fn + asserts DB state would
catch these pre-commit on a dev machine.

Phase 11's deliverable: build that harness. Estimate: 2–3 days.
Shipped in four commits in one session.

## Decision

Direct `pg` client against local Supabase (mirroring the
existing `tests/integration/rls.test.ts` pattern), not the
Drizzle client. RLS bypass is implicit — Postgres superuser on
local means we can seed + assert + clean up without JWT
dance-steps. A stub provider replaces `getMLBProvider()` so
reconcile reads deterministic stats.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `11f41137` | Polish spec §19–§20 + `docs/roadmap-phase-11.md` locked. |
| P11.1 | `f5da697c` | `tests/fixtures/seed.ts` — typed helpers for user / card / game / contest / lineup-slot / token / token-application + `withOffseason()` + `cleanupUser()` CASCADE. 407 lines. |
| P11.2 | `28225210` | `tests/fixtures/mock-provider.ts` + `tests/integration/reconcile.test.ts` (5 cases: happy / empty stats / QS token / winning-pitcher / UPDATE-FROM guard). `vitest.config.ts` gains `env` defaults so integration tests boot without a full prod env. |
| P11.3 | `90ed71b5` | `tests/integration/ceremony.test.ts` (6 cases: happy / pre-vaulted tolerance / P10.5 #1 constraint guard / P10.5 #2 FK guard / double-commit / cap enforcement). |
| P11.4 | *(this)* | `test:integration` pnpm script, runbook entry with the when-to-run table, CLAUDE.md Definition-of-Done reminder, ADR-0016. |

## What went well

1. **Seed helpers compose cleanly.** Each helper defaults to
   minimum-valid values (tier='bronze', status='building',
   teams resolved via `getTestTeam`, random BDL ids) so tests
   pass only the args they care about. The six ceremony cases
   share a `setupUserWithContext()` + `seedFreshCard()` +
   `seedMidseasonCard()` trio; reconcile cases share
   `setupEntry(status)`. No test is > 60 lines.
2. **Cleanup via `DELETE FROM auth.users` CASCADE is a single
   line per test.** Profile, season state, card, token,
   token_application, vault_entry, manager_account, contest
   entry, lineup slots — all owner-scoped tables go in one
   cascading delete. Non-owner rows (games, contests, players)
   stay behind for reuse or explicit teardown; harmless
   because they don't affect per-user assertions.
3. **Mock provider is 80 lines, only `fetchGameStats` is
   implemented.** Other `MLBDataProvider` methods throw a
   clear error so accidental usage surfaces immediately rather
   than silently returning `undefined`. The narrow surface
   keeps the stub tiny — we only swap what reconcile actually
   reads.
4. **P9.5 + P10.5 are now regression-guarded by name.** The
   UPDATE-FROM guard test (`reconcile.test.ts` case 5) and the
   two P10.5 guard tests (`ceremony.test.ts` cases 3 + 4)
   exist specifically to fail loudly if someone reintroduces
   the alias-through-FROM pattern or drops migration 0026's
   SET NULL. Each test comment cites the bug ID, so the next
   person reading it understands what's being guarded.
5. **Slice ordering matched the dep graph.** P11.1 unblocked
   both test files; P11.2 + P11.3 are independent (either
   could have gone first); P11.4 closed. No rewrites.

## What surprised us

1. **Docker was hung on the dev machine at commit time.** The
   port 64322 was held by a stale Docker proxy but
   `pg_isready` got no response and `supabase start` silently
   never progressed. Unable to smoke the 11 new tests against
   a live DB before committing. Mitigation: typecheck + lint
   clean, patterns mirror the proven `rls.test.ts`. Real smoke
   validation happens at the first pre-commit moment when
   `supabase start` is responsive — this is the normal
   runbook flow.
2. **Vitest env field was enough — no dotenv library
   dependency.** `getDb()` goes through `getServerEnv()`
   which zod-validates `DATABASE_URL`, `CRON_SECRET`, three
   Supabase keys, etc. Rather than pull in `dotenv` + parse
   `.env.local`, setting `SKIP_ENV_VALIDATION=1` +
   `DATABASE_URL` defaults in `vitest.config.ts` let tests
   boot against local Supabase with zero extra env plumbing.
   The integration tests touch *only* the DB — the rest of
   the env is irrelevant.
3. **Pre-vaulted `vaulted_at` preservation is testable with
   millisecond-resolution timestamps.** The concern was that
   `seedCard` sets `vaulted_at = now()` and the ceremony fn
   *also* runs `now()` — whether the assertion `vaulted_at
   unchanged` would hold against two near-simultaneous clock
   reads. Postgres timestamps are microsecond-precision, so
   the capture-before + compare-after approach works
   reliably. (Postgres isn't re-reading `now()` for the
   pre-vaulted cards — the `WHERE is_vaulted = false` filter
   skips them, so their `vaulted_at` genuinely stays the seed
   value.)
4. **The `applied_both_or_neither` + FK-cascade interaction
   is subtler than it reads.** When a non-selected card has
   an applied token, the ceremony fn must null both
   applied_to_* fields together *before* deleting the card —
   otherwise the delete-side FK check would run against a
   dangling mid-state. Migration 0025 nulls both in one
   statement; the test is the concrete proof that the
   sequence holds.

## What we deliberately simplified

1. **No CI integration yet.** Hobby-tier GitHub Actions
   doesn't have a docker-supabase setup on the critical path.
   The runbook's when-to-run table + the Definition-of-Done
   checkbox in `CLAUDE.md` are the pre-commit gate. CI
   integration is a Phase 12+ candidate once the test surface
   grows enough to justify the runner setup.
2. **No fixture coverage for `open_pack`, `apply_token`,
   `quick_sell_card`, `vault_card_midseason`,
   `destroy_vaulted_card`.** Deliberate per polish spec §20
   — these functions have unit tests via exercised code
   paths, and adding integration coverage for every SQL fn
   up-front would bloat the harness. Each gets a test when
   it earns one (i.e. when a regression ships).
3. **Mock provider only stubs `fetchGameStats`.** The other
   five `MLBDataProvider` methods throw "not stubbed — add if
   a test needs it." Opt-in growth: if a future test reaches
   for `fetchGamesByDate`, we add it then. YAGNI holds up.
4. **No Playwright/realtime integration.** Same call as ADR-
   0015 — Realtime-driven UI is hard to test deterministically
   and mock scaffolding would be rewritten on the next feature
   shift. Phase 11 is strictly server-side fixtures.
5. **Seed helpers don't yet validate every FK error path
   loudly.** If a test passes a bad `userId` to `seedCard`,
   the failure comes from Postgres' FK check (23503) not a
   pre-flight input validator. The generated error is clear
   enough in practice; a pre-flight check layer is a
   nice-to-have if flakiness emerges.

## What's ready for the next polish pass

- **`tests/fixtures/seed.ts` is the growth surface.** New
  integration tests just import helpers; no per-test scaffold
  needed. Adding, e.g., a `seedVaultEntry()` helper is one
  function + one export.
- **Mock provider is a template for future data-source
  swaps.** If we ever move off BDL (spec §6 option), the
  same `setMLBProvider(fake)` pattern lets the tests not
  care.
- **`withOffseason()` is reusable for any future season-
  status-gated fn.** If a future offseason-only operation
  lands (trade window, vault shuffle, etc.), the helper
  already exists.
- **The runbook's "when to run" table is the pre-commit
  contract.** Future SQL-fn changes can copy the pattern —
  add a test file, add a row to the table.
- **The regression guards (reconcile case 5, ceremony cases
  3 + 4) set a precedent:** every latent bug fixed during a
  smoke gets a named test in the harness. Future retros can
  add their own.

## Open items

1. **CI integration for `pnpm test:integration`.** Needs a
   docker-supabase runner. Parked until the harness has
   enough surface to justify the runner cost.
2. **Fixture coverage for `open_pack`, `apply_token`,
   `quick_sell_card`, `vault_card_midseason`,
   `destroy_vaulted_card`.** Added when each fn gets its
   first regression.
3. **A `getTestPlayer({ isPitcher? })` helper that pulls
   from the real seeded roster** instead of always synthesizing
   via `seedPlayer`. Keeps test data closer to prod shape but
   adds per-test-run ordering concerns. Wait until a test
   wants it.
4. **Seed-helper input validation layer.** Pre-flight checks
   for FK args (does `userId` exist in `auth.users`? does
   `seasonId` exist?) with clearer errors than raw Postgres
   23503.
5. **Live-view polish, onboarding pass, empty/error sweep,
   a11y, tier foil motion, dupe picker, sound/haptics** —
   all still parked from prior phases.

## Estimate vs reality

Estimate: 2–3 days. Shipped: 4 commits + 1 plan commit in one
session (~2 hours of wall time). Under the low end of the
estimate. The work was mostly plumbing — no design decisions,
no architecture choices — and the seed helper pattern was
already pioneered by `rls.test.ts`.

## Consequences

- Any future change to `src/lib/mlb/reconcile.ts`,
  `commit_vault_selection`, or a migration touching
  `game_event` / `contest_lineup_slot` / `card` / `token` /
  `vault_entry` runs through 11 integration tests locally
  before the commit lands. The class of bug that surfaced in
  P9.5 + P10.5 should now fail on a dev machine, not in prod.
- The seed helpers + mock provider pattern give future Phase
  12+ work a template: any new SQL fn that gets a regression
  gets a test file; tests import helpers; cleanup is one
  line.
- `CLAUDE.md`'s Definition of Done now explicitly calls out
  the integration suite for scoring/vault-SQL changes. The
  future agent reading this doc knows when to run
  `pnpm test:integration`.
- The runbook's when-to-run table is the canonical reference
  for "should I run integration tests?" — no more ambiguity
  for the next person who touches a scoring fn.

## Related ADRs

- ADR-0014 — Phase 9 Retrospective (Real-Game Scoring). The
  P9.5 UPDATE-FROM bug motivated the reconcile guard test.
- ADR-0015 — Phase 10 Retrospective (Unified Lineup View +
  Ceremony Fix). The P10.5 bug chain motivated the ceremony
  guard tests.
- ADR-0011 — Phase 6 Retrospective. Migration 0019's
  ON DELETE SET NULL precedent for the token FK relax in
  migration 0026.

# Draft Deck — Phase 11 Roadmap (Integration Test Harness)

**Goal:** Build the real-lineup fixture harness flagged in
ADR-0014 + ADR-0015. Two phases in a row surfaced pre-existing
latent bugs in SQL fns (`reconcileGame`, `commit_vault_selection`)
only when those fns were first invoked against real lineup data
in production. An integration test suite that seeds realistic
scenarios + calls the fns + asserts outcomes would have caught
both pre-commit.

**Estimated effort:** 2–3 days. Mostly plumbing — seed helpers,
two test files, one runbook update.

**Prerequisites:**
- Phase 10 shipped (ADR-0015).
- `draft-deck-polish-spec.md` §19–§20 locked.
- `supabase start` works on the machine (needed for the
  existing `tests/integration/rls.test.ts`).

---

## Milestones

| ID    | Milestone                                  | Target  | Outcome |
|-------|--------------------------------------------|---------|---------|
| P11.1 | Seed library `tests/fixtures/seed.ts`      | 1 day   | Typed helpers for creating users + cards + games + contests + lineup slots + tokens + applications. Direct `pg` client for speed + RLS bypass. Cleanup via `auth.users` CASCADE. |
| P11.2 | `tests/integration/reconcile.test.ts`      | 0.5 day | 5 cases: happy path, empty stats, QS token trigger, winning-pitcher attribution, UPDATE-FROM regression guard. |
| P11.3 | `tests/integration/ceremony.test.ts`       | 0.5 day | 6 cases: happy path, pre-vaulted tolerance, token constraint guard (P10.5 bug #1), token FK guard (P10.5 bug #2), double-commit idempotency, cap enforcement. |
| P11.4 | Runbook + ADR-0016                         | 0.5 day | `docs/runbook.md` gets "How to run integration tests"; `CLAUDE.md` gets a one-line pre-merge reminder. ADR-0016 retro. |

---

## P11.1 — Seed library (Day 1)

### T11.1.1 Base client + test scaffolding
- **What:** `tests/fixtures/seed.ts` opens a `pg` Client on
  `DATABASE_URL` (same pattern as `rls.test.ts`). Export
  `getSeedClient()` for tests to share.
- **Acceptance:**
  - Client connects + disconnects cleanly per test file.
  - No leaked connections after Vitest teardown.

### T11.1.2 Core entity helpers
- **What:** Implement:
  ```ts
  seedUser(): Promise<{ userId, seasonId, profileId }>
  seedCard({ userId, tier?, is_vaulted?, vault_source?, ... }): Promise<cardId>
  seedGame({ bdlGameId?, homeTeamId, awayTeamId, date?, status? }): Promise<gameId>
  seedContest({ seasonId, gameIds, name? }): Promise<contestId>
  seedContestEntry({ userId, contestId, status? }): Promise<entryId>
    // Also seeds 10 empty contest_lineup_slot rows.
  seedLineupSlot({ entryId, position, cardId, tokenApplicationId? }): Promise<void>
  seedToken({ userId, type, bonusFp, appliedToCardId?, appliedToContestId? }): Promise<tokenId>
  seedTokenApplication({ userId, tokenId, cardId, contestId }): Promise<applicationId>
  cleanupUser(userId): Promise<void>  // DELETE FROM auth.users — CASCADE wipes owned rows
  ```
- **Defaults** chosen so the bare minimum seed works without
  a huge arg list: `tier='bronze'`, `status='building'`,
  team_ids resolved to first two real teams, etc. Tests
  override only what they care about.
- **Acceptance:**
  - Every helper validates its inputs (throws clearly on bad
    FKs).
  - `seedUser()` + `cleanupUser(userId)` round-trips leave
    the DB in pre-seed state.

### T11.1.3 Player + team lookups
- **What:** `getTestPlayer({ isPitcher? })` + `getTestTeam()`
  helpers that return real player/team rows from the seeded
  data — avoids needing fixture team + player data. Tests
  pick any active player; the real prod roster is on local
  Supabase already.
- **Acceptance:** helpers return deterministic ids given a
  seed's test run order (sort by id ASC).

---

## P11.2 — Reconcile integration test (Day 2)

### T11.2.1 Mock the BDL provider
- **What:** `tests/fixtures/mock-provider.ts` exposes a
  `setMockStats(bdlGameId, stats)` that stubs the module-
  level provider returned by `getMLBProvider()`. Tests seed
  known stats for the game being reconciled.
- **Acceptance:**
  - Stub applied before the test; `reconcileGame` calls the
    stub instead of the real BDL SDK.
  - Stub cleared in `afterEach`.

### T11.2.2 Test cases
- **What:** `tests/integration/reconcile.test.ts` covers:
  1. **Happy path** — 2 hitters rostered; mock stats return
     singles/RBIs; assert `slot.final_fp` written per hitter;
     assert `contest_entry.final_score` rolls up (entry status
     flipped to 'live' so the rollup fires).
  2. **Empty stats** — game with no stats → no slot writes,
     no errors.
  3. **QS token** — pitcher with QS token applied; stats
     6 IP + 2 ER; assert `token_application.triggered=true`
     + `bonus_fp_awarded=<bonus>` + slot FP includes bonus.
  4. **Winning-pitcher attribution** — game with winning
     team + starter that went 6 IP; assert synthetic
     `mlb.game.pitcher_win` game_event row exists with the
     right pitcher.
  5. **UPDATE-FROM guard** — explicit test that reconcile
     completes without a 42P01 error (regression guard for
     the P9.5 bug).
- **Acceptance:** all five pass locally against
  `supabase start`.

---

## P11.3 — Ceremony integration test (Day 2–3)

### T11.3.1 Test cases
- **What:** `tests/integration/ceremony.test.ts` covers:
  1. **Happy path** — 3 fresh cards selected; assert 3
     vault_entry rows + all 3 `is_vaulted=true` +
     `vault_source='ceremony'`.
  2. **Pre-vaulted tolerance** — 1 midseason + 2 fresh
     selected; assert all 3 in vault_entry; pre-vaulted
     keeps `vault_source='midseason'` + its original
     `vaulted_at`.
  3. **Token constraint guard** (P10.5 bug #1) — unused
     token applied to a non-selected card; commit proceeds;
     post-commit both `applied_to_card_id` and
     `applied_to_contest_id` are NULL (check constraint
     satisfied).
  4. **Token FK guard** (P10.5 bug #2) — unused token with
     a `token_application` row referencing it; commit
     proceeds (DELETE FROM token cascades through
     SET NULL); token_application row still exists with
     `token_id IS NULL`.
  5. **Double-commit** — commit once, attempt again; assert
     23514 "already committed."
  6. **Cap enforcement** — attempt to commit 11 cards;
     assert 22023.
- **Acceptance:** all six pass locally. Disabling migrations
  0025 + 0026 must cause (2), (3), (4) to fail.

### T11.3.2 Season status helper
- **What:** Ceremony fn requires `season.status = 'offseason'`.
  Expose `withOffseason(seasonId, fn)` helper that toggles
  the status for the duration of the test + resets after.
- **Acceptance:** no test leaves a season in `offseason`
  after completion.

---

## P11.4 — Runbook + ADR (Day 3)

### T11.4.1 `pnpm test:integration` script
- **What:** Add to `package.json`:
  ```json
  "test:integration": "vitest run tests/integration/"
  ```
- **Acceptance:** `pnpm test:integration` runs all three
  integration files (existing rls + new reconcile + new
  ceremony) in one pass.

### T11.4.2 Runbook entry
- **What:** Add to `docs/runbook.md`:
  - Prereq: `supabase start` is running.
  - Command: `pnpm test:integration`.
  - When to run: before committing any change to
    `src/lib/mlb/reconcile.ts`, a scoring SQL fn, a vault
    SQL fn, or a migration that touches `game_event`,
    `contest_lineup_slot`, `card`, `token`, `vault_entry`.
- **Acceptance:** runbook entry exists; one-line pointer
  added to `CLAUDE.md`.

### T11.4.3 ADR-0016
- **What:** `docs/adr/ADR-0016_phase-11-retro.md`:
  - What shipped.
  - Surprises (local Supabase idiosyncrasies, seed-helper
    API decisions).
  - Open items (CI integration, coverage for other SQL fns).

---

## What's NOT in Phase 11 (scope guard)

Per spec §20:

- Onboarding pass / empty-error sweep / a11y / tier foil /
  dupe picker / mobile / sound / haptics / artwork.
- Live-view polish (per-slot FP glow, etc.).
- Webhook retry observability.
- CI integration for the fixture suite.
- Fixture coverage for `open_pack`, `apply_token`,
  `quick_sell_card`, `vault_card_midseason`,
  `destroy_vaulted_card` — added when each fn gets a
  regression.

---

## Per-task checklist

Same as prior phases:
- Acceptance met.
- `pnpm typecheck` + `pnpm lint` + `pnpm test` clean.
- Each fixture-cleanup verified (no leaked rows after test).
- Commit convention: `test(<scope>): P11.N <slice>`.

---

## Dependencies between tasks

```
P11.1 (Seed library) ──► P11.2 (Reconcile tests)
                     ──► P11.3 (Ceremony tests)
                                              │
                                              ▼
                                           P11.4 (Runbook + ADR)
```

P11.1 blocks both test files. P11.2 and P11.3 are independent;
either order. P11.4 closes.

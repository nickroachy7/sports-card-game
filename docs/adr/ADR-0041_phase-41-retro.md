# ADR-0041 — Phase 41 (Vault multiplier + tier-based contracts) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 41 (v1.26)
**Companion specs:** `draft-deck-polish-spec.md` §133–§139,
`docs/roadmap-phase-41.md`.

---

## Context

User proposed a gameplay-mechanic shift, framed as two linked ideas:

> "A card played 1 time for 40 FP should vault HIGHER than a card
> played 3 times for 60 FP. The multiplier is about celebrating
> specific game performances."
>
> "Should we continue to include contracts? I think we should but
> maybe it has to be redesigned to better fit the game."

Pre-P41 the vault preserved `final_fp` straight — whoever grinded
the most points always "won" the vault. Contracts were a flat 15
plays across all tiers with a coin-based Extend button that felt
more like a cost tax than a gameplay lever. Neither mechanic
celebrated strategic play.

A 3-round interview converged on: **single-peak multiplier
curve** (not two-peak) + **tier-based play budgets** (not flat) +
**retire Extend** (tier-up refills plays automatically).

## Decision

### Multiplier curve (§133)

| plays_used | multiplier |
|-----------:|-----------:|
|          0 | 0.0        |
|          1 | 5.0        |
|          2 | 3.5        |
|          3 | 2.5        |
|        4–5 | 1.8        |
|       6–10 | 1.3        |
|      11–20 | 1.1        |
|        21+ | 1.0        |

Vault score = `career_fp_total × card_vault_multiplier(plays_used)`.
Snapshots at ceremony commit; legacy rows backfilled from
`contest_lineup_slot.contract_play_consumed = true` history.

### Tier play budgets (§134)

| Tier    | Budget    |
|---------|-----------|
| Bronze  |  5 plays  |
| Silver  | 15 plays  |
| Gold    | 40 plays  |
| Diamond | 999 (∞)   |

Cards mint as Bronze with 5 plays. `recompute_card_tier` BEFORE
UPDATE trigger now refills `contract_plays_remaining` via
`GREATEST(current, tier_play_budget(new_tier))` on every tier-up
— leftover plays never shrink.

### Server

- **Migration 0046** — `card_vault_multiplier(int)`,
  `tier_play_budget(card_tier)` SQL fns; `card.plays_used` column
  with historical backfill; `vault_entry.plays_used / multiplier /
  vault_score` columns with historical backfill from slot history;
  `_finalize_contest_entry` increments `card.plays_used` per
  consumed slot.
- **Migration 0047** — `recompute_card_tier` refills plays on
  tier-up; `open_pack` sets `contract_plays_remaining =
  tier_play_budget('bronze')` = 5 on mint.
- **Migration 0048** — `commit_vault_selection` snapshots
  `plays_used / multiplier / vault_score` into `vault_entry`.
- **Migration 0049** — `DROP FUNCTION public.extend_card`.

### Client

- `TIER_PLAY_BUDGET` + `cardVaultMultiplier` helpers in
  `src/lib/card/tiers.ts` — mirror the SQL fns.
- `extendContractInputSchema` + `ExtendContractInput` removed from
  `@/lib/contracts/cards`.
- `ExtendContractModal` deleted. `extendCardContract` Server
  Action removed. "Extend" button gone from CardDetailView.
- `VaultScorePreview` section in CardDetailView renders the
  current `career_fp × multiplier` with copy explaining the
  plays-used band (1 = max gem, 21+ = 1×).
- All 8 `contractMax: 15` call sites now use
  `TIER_PLAY_BUDGET[tier]`.
- Public economy API (`/api/config/economy`) no longer surfaces
  `extensionCostPerPlay` / `extensionEscalator`. DB columns
  retained for historical audit rows.
- Shop flow gained `existingByCardId` plumbing (pre-existing type
  bug that was masked by a loose `CardViewModel[]` cast; unmasked
  when the state type got tightened to `RevealedCard[]`).

## Consequences

**What got better:**

- Vault now rewards strategic performance — a one-shot 40-FP
  gem (5× = 200 score) beats a three-game 60-FP grind (2.5× =
  150 score).
- Contracts stop being a coin tax. Progression *is* the
  renewal — tier-up from Bronze 5 → Silver 15 gives +10 plays
  for free.
- Extend button's death removes a whole modal + flow that
  never felt game-native.
- Pipeline is straight: `plays_used` is now first-class on
  `card` and survives tier changes; we don't need to derive
  it from budget arithmetic.

**What's still open:**

- `vault_card_midseason` still doesn't write a `vault_entry`
  row (frozen cards stay in `card` until ceremony). Score is
  computable on-the-fly, but any UI that wants a permanent
  midseason vault-score snapshot would need the ceremony path
  extended or a separate midseason snapshot table. Not needed
  for v1 — frozen cards don't accrue FP so the on-the-fly
  computation is stable.
- Legacy vault_entry rows with no slot history (test data)
  backfill to `plays_used = 0` → `multiplier = 0` →
  `vault_score = 0`. Loud zero, not silently-inflated — by
  design.
- Prod has 48 cards, 10 consumed slots, 7 cards with
  `plays_used > 0`. Backfill matches; no drift.
- `card.extension_count` column kept as a historical audit
  field. No code path updates it anymore.

## Tricky bits

- `recompute_card_tier` is a single trigger fn called by both
  BEFORE INSERT and BEFORE UPDATE of `career_fp_total`. The
  plays-refill branch must gate on `TG_OP = 'UPDATE'` —
  otherwise INSERTed cards (where OLD is NULL) would blow up.
- The column DEFAULT on `card.contract_plays_remaining` stayed
  at 15 so test fixtures and hand-inserts don't break. The
  canonical mint path (`open_pack`) sets the tier-appropriate
  value explicitly; it's the only mutation we care about.
- `fetchRevealedCards` returns `RevealedCard[]`, but
  shop-client.tsx typed its state as `CardViewModel[]` — a
  pre-P41 bug. Tightening the state surfaced a missing
  `existingByCardId` prop on `PackOpenerModal`. Replicated the
  lineup-view partition pattern (new vs. existing by card id)
  so the dupe panel works from the shop too.
- `card.plays_used` backfill is count-from-slot-history, not
  from `contract_plays_remaining` arithmetic — budgets differ
  per tier so the subtraction doesn't round-trip. The slot
  history is append-only after finalize, so it's the clean
  signal.

## Alternatives considered

- **Two-peak multiplier curve** (rare at 1 play + at 15 plays,
  trough in the middle). Rejected in interview round 2 — the
  user's 40-FP-in-1-game vs. 60-FP-in-3-games example made it
  clear they wanted a single-peak curve celebrating peak
  single-game performance. Season-long play is enabled by
  Diamond = unlimited contracts, not by multiplier bonuses.
- **Flat tier multipliers** (Bronze 1.0×, Silver 1.5×, Gold
  2×, Diamond 3×). Rejected — a card can't reach Diamond
  without FP from plays, so the multiplier needs to be
  per-game-played, not per-tier.
- **Keep Extend with tier-based cost.** Rejected — the whole
  point of tier budgets is that *progression is the renewal*.
  Charging coins to manually refill adds friction without
  adding a meaningful choice.
- **Drop `contract_plays_remaining` entirely + track only
  `plays_used`.** Rejected — keeping a countdown has UX value
  (the "3 plays left" halo still reads) and the tier refill
  story is cleaner when the column stays.
- **Compute multiplier on-read instead of snapshotting to
  vault_entry.** Rejected — snapshotting preserves the
  multiplier if the curve ever changes, and lets leaderboards
  sort by `vault_score` directly without a per-row fn call.

## Links

- Commit: (forthcoming) `feat(vault): P41 vault multiplier +
  tier-based contracts`
- Migration 0046 (helpers + plays_used + vault_entry columns)
- Migration 0047 (tier-budget plays + tier-up refill)
- Migration 0048 (commit_vault_selection uses multiplier)
- Migration 0049 (drop extend_card)
- Polish spec: §133, §134, §135, §136, §137, §138, §139
- Roadmap: `docs/roadmap-phase-41.md`
- Related: ADR-0040 (Phase 40 token trigger states) — the
  consumed-at + finalize-mark-missed infrastructure shipped
  in P39/P40 is what makes per-card `plays_used` accurate.

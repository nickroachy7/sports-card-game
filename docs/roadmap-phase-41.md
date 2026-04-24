# Draft Deck — Phase 41 Roadmap (v1.26 — Vault multiplier + tier-based contracts)

**Goal:** Gameplay-mechanic shift — vault rewards strategic rarity,
contracts retire in favor of tier-based play budgets.

Core intent (user):
> a card played 1 time for 40 FP should vault HIGHER than a card
> played 3 times for 60 FP. The multiplier is about celebrating
> specific game performances.

**Estimated effort:** ~0.7 day.

---

## Milestones

| ID    | Milestone                                          | Target    |
|-------|----------------------------------------------------|-----------|
| P41.1 | `card_vault_multiplier(plays)` SQL fn              | 0.05 day  |
| P41.2 | vault_entry schema: plays_used, multiplier, score  | 0.10 day  |
| P41.3 | vault_card_midseason + commit_vault_selection use multiplier | 0.10 day |
| P41.4 | open_pack sets tier-based contract_plays_remaining | 0.05 day  |
| P41.5 | Tier-up refills plays (`GREATEST(...)`)            | 0.10 day  |
| P41.6 | Deprecate extend_card SQL + action                 | 0.05 day  |
| P41.7 | Remove ExtendContractModal + CardDetailView button | 0.10 day  |
| P41.8 | Vault multiplier preview in CardDetailView         | 0.10 day  |
| P41.9 | Verify / lint / build / deploy + ADR-0041          | 0.05 day  |

---

## Notes

- **P41.2** requires a data migration: backfill existing `vault_entry`
  rows with plays_used / multiplier / score. One-time UPDATE in the
  same migration.
- **P41.5** needs recon first — find where tier-up actually happens
  in SQL (likely inside `_finalize_contest_entry` or a helper).
- **P41.7**: `extendCardContract` is still exported from
  `src/app/actions/cards.ts`. Remove export + delete impl. The
  ExtendContractModal component deletes entirely.
- **P41.8**: mirror the multiplier table in TS. Don't fetch the SQL
  function via API for each card — static lookup.
- Legacy cards: stay on their current `contract_plays_remaining`
  until tier-up refreshes them. No forced migration of existing
  card play counts.

---

## Multiplier table (authoritative)

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

## Tier play budgets (authoritative)

| Tier    | Budget |
|---------|-------:|
| Bronze  |      5 |
| Silver  |     15 |
| Gold    |     40 |
| Diamond |    999 (effectively unlimited) |

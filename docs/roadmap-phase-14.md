# Draft Deck — Phase 14 Roadmap (Feel Pass v1.8 — Polish Bundle)

**Goal:** Three tied-to-recent-work polish items that wrap
up Phase 12–13 open ends.

**Estimated effort:** ~2 days.

**Prerequisites:**

- Phase 12 shipped — `<LiveEventsProvider>` + `<SlotFpGlow>`
  pattern to clone.
- Phase 13 shipped — MLBAM backfill endpoint + sidebar swap
  to improve/animate.
- `motion/react` + Framer's `AnimatePresence` already used
  elsewhere.
- `supabase db push --linked` proven in Phase 12 without
  needing Docker.

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P14.1 | Backfill matcher — hydrate + fuzzy + retry | 0.5 day  | `?retry_failed=true` param + hydrate=currentTeam + Levenshtein ≤ 2 fallback. Strategies breakdown in response. |
| P14.2 | Sidebar cross-fade                         | 0.25 day | 200ms fade via AnimatePresence on both pages. Reduced-motion skips. |
| P14.3 | Migration 0028 + contract glow             | 1 day    | `card` table in Realtime publication. `useCardContractEvents` hook + `<SlotContractGlow>` component. Wire into LineupSlot. |
| P14.4 | ADR-0019 retro                             | 0.25 day | What shipped, surprises, open items. |

---

## P14.1 — Backfill matcher (Day 1 morning)

### T14.1.1 `hydrate=currentTeam` + strategies tracking

- **What:** `src/app/api/cron/mlbam-id-backfill/route.ts`
  gains:
  - `hydrate=currentTeam` appended to MLB Stats API URL.
  - `strategies` counter object tracking the match path
    (exact / stripped / fuzzy / team_disambiguated /
    ambiguous / unmatched).
  - Response shape includes strategies breakdown.
- **Acceptance:**
  - First batch after redeploy shows non-zero
    `team_disambiguated` + fewer `ambiguous` entries
    compared to Phase 13.

### T14.1.2 Fuzzy-match fallback

- **What:** Add `levenshtein(a, b)` helper (pure fn, ≤ 20
  lines). After exact + stripped passes fail, retry with
  `levenshtein(firstA, firstB) + levenshtein(lastA, lastB)
  ≤ 2`. Accept only single-candidate matches.
- **Acceptance:**
  - Players with known typo/nickname variants resolve
    (confirm by spot-checking a residual from the Phase 13
    list).
  - Fuzzy + ambiguous logged as separate counters.

### T14.1.3 `?retry_failed=true` param

- **What:** When present, the WHERE clause drops the
  `photo_synced_at IS NULL` filter. Processes all rows
  where `mlbam_id IS NULL AND is_active_40_man = true`
  regardless of prior attempts. Runbook updated with the
  flag.
- **Acceptance:**
  - `?retry_failed=true` produces non-zero `attempted`
    count on a fresh run.
  - Normal (no flag) behavior unchanged.

---

## P14.2 — Sidebar cross-fade (Day 1 afternoon)

### T14.2.1 Wrap lineup sidebar in AnimatePresence

- **What:** `src/app/(app)/lineup/lineup-view.tsx` — wrap
  the ternary sidebar content in `<AnimatePresence mode="wait">`.
  Each branch gets a `<motion.div key="detail|default">` with
  initial/animate/exit variants (opacity + `y: 4 → 0`, 200ms).
- **Acceptance:**
  - Card click → visible fade on the sidebar.
  - Back → reverse fade.

### T14.2.2 Wrap collection sidebar

- **What:** Same treatment in
  `src/app/(app)/collection/collection-grid.tsx`.
- **Acceptance:** Same test, collection page.

### T14.2.3 Reduced-motion handling

- **What:** Use `useReducedMotion()` — when true, render
  the branches without AnimatePresence wrap (instant swap).
- **Acceptance:** Chrome DevTools → Rendering → Emulate
  `prefers-reduced-motion: reduce` → snap behavior, no
  fade.

---

## P14.3 — Contract glow (Day 2)

### T14.3.1 Migration 0028

- **What:** `supabase/migrations/0028_realtime_card.sql`:
  ```sql
  ALTER TABLE public.card REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.card;
  ```
- **Acceptance:**
  - `pnpm db:push` locally applies cleanly.
  - `supabase db push --linked` applies to prod.
  - `SELECT * FROM pg_publication_tables WHERE tablename
    = 'card';` returns a row.

### T14.3.2 `useCardContractEvents` hook

- **What:** `src/components/lineup/useCardContractEvents.ts`.
  - Accepts `rosteredCardIds: string[]`.
  - Subscribes to `public.card` UPDATEs.
  - Filters client-side to ids in the set.
  - Fires map update when `new.contract_plays_remaining <
    old.contract_plays_remaining` (decrement only).
  - Returns `latestDepleteByCardId: Map<cardId, { at: number,
    newPlays: number }>`.
- **Acceptance:**
  - Only decrement events propagate (verify by hand-
    running an `UPDATE card SET contract_plays_remaining
    = contract_plays_remaining - 1` in Supabase Studio).

### T14.3.3 `<SlotContractGlow>` component

- **What:** `src/components/lineup/SlotContractGlow.tsx`.
  Mirrors `<SlotFpGlow>`'s motion envelope. Amber
  (`#D4A647`) halo, 1000ms. Floating `-1 play` pill above
  the slot.
- **Acceptance:**
  - Keyed on `event.at` timestamp so back-to-back
    decrements replay the animation.
  - Reduced-motion returns null.

### T14.3.4 Wire into LineupSlot

- **What:** `LineupSlot` renders `<SlotContractGlow>` as a
  sibling of `<SlotFpGlow>`. Both receive the card's id
  (not playerId — contract events key on card.id).
  Provider-level hook runs in `<LineupView>` or via a new
  small provider — decision at build time (simpler: call
  `useCardContractEvents` once in `LineupView` and pass
  `latestDeplete` down; or put it in its own context).
- **Acceptance:**
  - After a reconcile decrements a rostered card, the slot
    glows amber.
  - FP glow + contract glow render together on the same
    slot without visual conflict.

---

## P14.4 — ADR-0019 retro

### T14.4.1 `docs/adr/ADR-0019_phase-14-retro.md`

Standard template: what shipped, went well, surprised us,
simplified, open items, estimate vs reality.

---

## Dependencies between tasks

```
P14.1 (Backfill) ──► independent
P14.2 (Fade) ──► independent
P14.3.1 (Migration) ──► P14.3.2 (Hook) ──► P14.3.3 (Glow) ──► P14.3.4 (Wire)
                                                              │
                                                              ▼
                                                        P14.4 (ADR)
```

P14.1, P14.2, P14.3 are fully independent. Order doesn't
matter within the phase. P14.4 closes.

---

## What's NOT in Phase 14 (scope guard)

Per spec §32:

- Onboarding flow pass.
- Empty/error sweep.
- A11y audit.
- Tier foil motion.
- Dupe picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive FP.
- Manual-override column for unmatched MLBAM ids.
- Card-to-card cross-fade inside the sidebar.

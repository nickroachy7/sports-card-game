# ADR-0015 — Phase 10 (Unified Lineup View + Ceremony Fix) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 10 (Feel Pass v1.5 + ceremony hardening)
**Companion specs:** `draft-deck-polish-spec.md` §16–§18,
`docs/roadmap-phase-10.md`.

---

## Context

Phase 9 shipped real-game scoring and immediately exposed a UX
gap the user flagged during submit-night: the `/lineup` page
flipped from the main diamond view to a list view the moment
a lineup submitted. Exactly when the user wanted to *watch*
their submitted lineup live, the surface they'd been building
on disappeared. Phase 10's primary deliverable: kill the page-
flip by unifying the view across every entry state.

Secondary deliverable: close the `commit_vault_selection`
pre-vaulted-cards carry-over from P7.4.7. Low-priority on
calendar but load-bearing for the first real offseason.

Estimate: 3–4 days. Shipped in six slices over a single
session; the ceremony fn smoke exposed two latent bugs that
were fixed in the same phase.

## Decision

Same deploy-per-slice rhythm. Split the unified view into
four ordered slices (route consolidation → sidebar state
machine → event feed → locked visuals) so each could deploy
with a visible user-facing change. Ceremony fn update landed
as a single SQL slice at the end, after its smoke exposed the
bug chain.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `4dd563d8` | Polish spec §16–§18 + roadmap-phase-10.md locked. |
| P10.1 | `b79d4e6c` | `/lineup` route collapses the status branch — always renders `<LineupView>`. `<LiveListView>` retired (301 lines deleted). `liveScore` + `finalScore` + `contestGameIds` plumbed through `LineupViewProps`. |
| P10.2 | `be301f61` | `<LineupSidebar>` dispatches to building vs post-submit inner layouts. Post-submit shows Live Score (big number), Box Score (10-row per-slot FP table), and a Status Chip that replaces Submit. `LineupSlotVM` gains liveFp + finalFp so the sidebar doesn't need extra queries. |
| P10.3 | `0fad9ee7` + `d6f94de1` | `<EventFeed>` — Supabase Realtime subscription on `game_event` inserts, filtered client-side to lineup players. Initial fetch of 20 recent rows so it populates immediately. `eventFpDelta` + `eventActionLabel` pure helpers with 15 unit tests. Migration 0024 added `game_event` to the `supabase_realtime` publication. Follow-up fix `d6f94de1` split `createBrowserClient` into its own module — the original lived alongside `createServerClient` (next/headers) and broke the Vercel build when a `"use client"` module tried to import it. |
| P10.4 | `cf408ff4` | Bench + tokens trays gain a `[Locked]` chip in the header post-submit. Card opacity drops to 50%; click-to-open-detail is gated on the locked state per spec. Drag was already canDrag-gated; this slice adds the visual cue. Filters + search on the bench stay enabled (safe read-only). |
| P10.5 | `d8ae9659` | `commit_vault_selection` accepts pre-vaulted (`vault_source='midseason'`) cards. Newly-selected cards get `vault_source='ceremony'`; pre-vaulted keep their original source + `vaulted_at` for audit. Migration 0025 patches the fn; migration 0026 relaxes `token_application.token_id` FK to nullable + SET NULL (surfaced during the DO-block smoke). Two bonus latent-bug fixes along the way (see surprises). |
| P10.6 | *(this)* | ADR-0015. No reduced-motion audit needed (all new motion already honors the global floor or uses direct state updates). No Playwright additions (Realtime-driven UI is hard to test deterministically; deferred). |

## What went well

1. **Slice ordering held.** P10.1 opened the door by killing the
   route split. P10.2 populated the sidebar without touching
   interactions. P10.3 added the Realtime layer without
   changing the chrome underneath. Each slice was a visible
   delta on `/lineup`, which made review straightforward.
2. **Realtime "just worked" once `game_event` was in the
   publication.** The subscription pattern + client-side
   filter against lineup player IDs is lightweight; dedup via
   `game_event.id` with a `useRef<Set>` covered the
   subscribe-after-fetch race without special handling.
3. **Pure FP-delta helper separated from component logic.**
   `eventFpDelta` is 60 lines of switch-case + hash lookup;
   15 unit tests made the approximation trade-offs explicit
   in code. Reconcile remains authoritative for the Box Score;
   the feed is narration only.
4. **DO-block smoke on the ceremony fn was the right call.**
   Three latent bugs surfaced in one transaction, all rolled
   back cleanly. This is the same pattern that caught the
   P9.5 reconcile UPDATE-FROM bug — when a previously-
   unexercised path gets its first end-to-end run, the smoke
   earns its keep immediately.
5. **Server-only leak caught at deploy time.** `next/headers`
   in a shared supabase module broke only during the Vercel
   build (local typecheck + lint passed). The fix was
   mechanical once surfaced (split the module).

## What surprised us

1. **Ceremony fn had three latent bugs stacked.** Each
   revealed the next:
   - Ownership guard rejecting pre-vaulted (intentional scope:
     the P10.5 change).
   - `UPDATE token SET applied_to_card_id = NULL` violated the
     `token_applied_both_or_neither` check (needed to null
     both fields together).
   - `DELETE FROM token` tripped the `token_application.token_id`
     NOT NULL FK (needed to relax the FK like we did for
     card FKs in migration 0019).
   
   Each fix was one line. But finding them required running
   the full transaction end-to-end on real data. Same
   archeology lesson as ADR-0014's reconcile bug:
   dev-sim + fixture-based harness would catch these pre-
   commit. Open Phase 11 item.
2. **Supabase migration tracking drifted.** Using the MCP
   `apply_migration` tool for hot fixes during the smoke
   created timestamp-named tracking entries that diverged
   from the local `0025_...sql` + `0026_...sql` files. The
   `supabase migration repair --status reverted <ts>` +
   `--status applied 0026` incantation reconciled them.
   Going forward: prefer local files + `supabase db push
   --linked`, only use MCP's apply_migration for truly
   emergent hot fixes.
3. **Vercel Hobby build caching caught a Next.js-specific
   server-only boundary leak that local typecheck couldn't.**
   `createBrowserClient` in the same module as a
   `next/headers` importer: Next flags this only at build
   time, not typecheck. Worth noting as a pattern — when
   adding browser-side Supabase calls, put the browser
   client in its own module by default.
4. **The status chip text is plenty without adding inning /
   games-active detail.** Spec left room for "Live · Top 5th,
   3 games active" but shipping just "Live · Games in
   progress" reads cleanly and needs no extra Realtime state.
   Can add the detail later when we have good UX for it
   without cluttering the chip.

## What we deliberately simplified

1. **No Playwright additions.** Realtime-driven UI is hard
   to test deterministically; mocking `supabase.channel`
   across a full `/lineup` render adds scaffolding that
   would be rewritten when the next feature lands. Relying
   on prod Realtime + the client-side log to validate; add
   E2E later if flakiness emerges.
2. **Status chip kept to three-line narration** (no live
   inning pulse, no games-active count, no rank display).
   Each of those has a Phase 11+ home; not worth chasing
   here.
3. **Box Score column widths fixed via `grid-cols-[2rem_1fr_3rem]`**
   — works at the default sidebar width, would want
   revisiting if we ever shrink the right rail.
4. **Bench locked = full lock** (drag + click-to-detail
   both gated). Considered a "read-only detail" carve-out
   so users could still peek at bench cards post-submit,
   but spec §16 was explicit and the extra drawer-mount
   isn't worth the scope.
5. **No local migration for token FK relax dry-run.** The
   `token_application.token_id` FK change was urgent (the
   smoke required it) and made via MCP apply_migration.
   Local file in repo ships for fresh-DB parity.

## What's ready for the next polish pass

- `<EventFeed>` is a clean Realtime primitive — future
  surfaces (live contest view for opponents, shared
  watch-along, etc.) can copy the pattern.
- `<LineupSidebar>` state machine is declarative — adding a
  "Champions" state or a "Pre-ceremony preview" state is one
  switch-case.
- `eventFpDelta` is pure and unit-tested. If we ever swap
  scoring rules or add a fifth token type, the helper + its
  tests update together.
- `commit_vault_selection` is now exercised end-to-end
  (modulo the rolled-back smoke). Any Phase 11 work that
  touches ceremony flow has a clear baseline.
- `src/lib/db/supabase-browser.ts` is the canonical place
  for the browser Supabase client. Future `"use client"`
  features that need it import from there by default.

## Open items

1. **Dev-sim fixture with real-lineup seed.** The fixture
   pattern that would have caught both the P9.5 reconcile
   bug AND the P10.5 ceremony bug chain. High-value P11
   candidate.
2. **Status chip inning + games-active detail** — low
   priority, nice-to-have.
3. **Rank display on the status chip** — needs leaderboard
   query extension.
4. **Per-slot FP glow on the diamond** when an event fires
   for that slot — ties the Event Feed back to the diamond
   visually.
5. **Onboarding flow pass, empty/error sweep, a11y audit,
   tier foil motion, dupe multi-picker** — all still parked.
6. **Event Feed sound cue** on positive FP — haptics/sound
   parked.

## Estimate vs reality

Estimate: 3–4 days. Shipped: 8 commits in one session
(including one deploy-hotfix for the server-only leak, and
two migrations for the latent-bug fixes). Held the estimate;
the latent-bug work was unscoped but contained.

## Consequences

- `/lineup` is one page across every entry state. The post-
  submit experience keeps the user on the same diamond
  they built on, with a live-updating box score and event
  feed instead of a disorienting flip to a different layout.
- Vault ceremony now tolerates mid-season vaulted cards —
  the first real offseason won't choke on them.
- `token_application.token_id` relaxation matches the
  `card_id` relaxation from ADR-0011. Token delete paths
  (season-end, manual cleanup) are now universally safe.
- One more confirmation that a "real-lineup fixture in
  dev-sim" is a worthwhile investment. Two phases in a row
  where the first real end-to-end run surfaced pre-existing
  bugs. Building the fixture is a Phase 11 candidate.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective (Vault + Milestones + Leaderboards).
- ADR-0010 — Phase 5 Retrospective (Seasonal crons + rank finalize).
- ADR-0011 — Phase 6 Retrospective (Feel Pass v1.1).
- ADR-0012 — Phase 7 Retrospective (Feel Pass v1.2).
- ADR-0013 — Phase 8 Retrospective (Feel Pass v1.3).
- ADR-0014 — Phase 9 Retrospective (Real-Game Scoring).

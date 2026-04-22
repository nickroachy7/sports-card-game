# Draft Deck — Phase 15 Roadmap (Feel Pass v1.9.5 — Sidebar Fit + Bench Clarity + 40-man Backfill)

**Goal:** Close three user-visible gaps — the sidebar
horizontal-scroll bug, bench/tray showing in-use items, and
the 23% photo coverage hole.

**Estimated effort:** ~2–2.5 days.

**Prerequisites:**

- Phase 14 shipped — `<SidebarFadeSwap>` + contract glow +
  Phase 13 sidebar pattern are the baseline.
- Phase 13 orphaned the `/collection/[cardId]` route; nothing
  links to it.
- MLB Stats API `/api/v1/sports/1/roster/40Man?teamId=N` +
  `/api/v1/teams?sportId=1` are both free + public.
- `supabase db push --linked` continues to work without Docker.

---

## Milestones

| ID    | Milestone                                    | Target   | Outcome |
|-------|----------------------------------------------|----------|---------|
| P15.1 | CardDetailView compact sidebar layout        | 0.5 day  | Single column + medium card + tightened padding. No more horizontal scroll. |
| P15.2 | Redirect `/collection/[cardId]` → `/collection?card=` | 0.1 day | Orphan route becomes a 307 redirect. |
| P15.3 | Bench + tokens filter + counter              | 0.5 day  | In-lineup cards hidden from `<BenchDrawer>` + tokens hidden from `<TokenTray>`. Header counters: "Bench (12) · 4 in lineup". |
| P15.4 | 40-man roster backfill                       | 1 day    | New primary endpoint. 30 team calls. ~100% of active 40-man matched. Fallback to Phase 14 search for residuals. |
| P15.5 | ADR-0020 retro                               | 0.25 day | What shipped, surprises, open items. |

---

## P15.1 — CardDetailView compact sidebar layout

### T15.1.1 Drop two-column + shrink card

- **What:** `src/components/card/CardDetailView.tsx`:
  - Remove `md:flex-row` from the root — always
    single-column.
  - `<Card size="large">` → `<Card size="medium">`.
  - `gap-8 px-6 py-8 max-w-5xl` → `gap-4 px-2 py-3`
    (remove max-w for the sidebar case; let the parent
    sidebar width govern).
  - Consider `items-stretch` / `items-center` on the outer
    so the medium card centers in the column.
- **Acceptance:**
  - Load `/lineup` → click a card → no horizontal scroll.
  - Same for `/collection`.
  - Action buttons still visible + clickable.

### T15.1.2 Check other callers + layout

- **What:** The `/collection/[cardId]` page-level route also
  renders `<CardDetailView>`. After P15.2 lands (redirect),
  this becomes moot — but for the intermediate commit,
  verify the component still renders the full content in
  the sidebar.
- **Acceptance:** No content lost. Tier progress, token
  history, action footer all present.

---

## P15.2 — Redirect orphan route

### T15.2.1 Thin redirect page

- **What:** Rewrite
  `src/app/(app)/collection/[cardId]/page.tsx`:
  ```tsx
  import { redirect } from "next/navigation";

  export default async function CardDetailRedirect({
    params,
  }: { params: Promise<{ cardId: string }> }) {
    const { cardId } = await params;
    redirect(`/collection?card=${cardId}`);
  }
  ```
- **Acceptance:**
  - Navigate to `/collection/<any-card-id>` → lands on
    `/collection?card=<id>` with the sidebar detail open.
  - Server logs show 307 redirect.

---

## P15.3 — Bench + tokens filter

### T15.3.1 BenchDrawer — drop assigned + counter

- **What:** `src/components/lineup/BenchDrawer.tsx`:
  - `filtered` memo rewrites: filter out `c.id` in
    `assignedCardIds` (currently just sorts them to end).
  - Header gains a second counter:
    `{filtered.length} · {assignedCardIds.size} in lineup`
    when locked is false; just `{filtered.length}` when
    locked.
- **Acceptance:**
  - Drag a bench card → slot: the bench list shrinks by
    one immediately, counter updates.
  - Remove from slot: card reappears.
  - Hitters/Pitchers/search filter still work on the
    remaining set.

### T15.3.2 TokenTray — drop applied + counter

- **What:** `src/components/lineup/TokenTray.tsx`:
  - Compute `appliedTokenIds = tokens.filter(t =>
    t.appliedToContestId === currentContestId).map(t =>
    t.id)`. Or — simpler — if the existing prop set
    already provides this, use it.
  - Filter tokens from the render loop if applied.
  - Header gains `(X tokens) · Y applied` secondary
    counter.
- **Acceptance:**
  - Apply a token to a lineup card: token disappears
    from the tray.
  - Remove token: it reappears.

### T15.3.3 Verify both under post-submit + building

- **What:** No code change; just sanity-check that the
  filter behaves consistently in building vs. post-submit.
- **Acceptance:**
  - Post-submit: cards stay hidden (slots still have
    `starter_card_id` values).
  - Building: filter re-runs on drag, hide is immediate.

---

## P15.4 — 40-man roster backfill (Day 2)

### T15.4.1 MLB Stats team-id const map

- **What:** `src/lib/mlb/mlb-stats-team-ids.ts` — export
  a constant mapping team abbreviation → MLB Stats team_id:
  ```ts
  export const MLB_STATS_TEAM_IDS: Record<string, number> = {
    LAA: 108, ARI: 109, BAL: 110, BOS: 111, CHC: 112,
    CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117,
    KC: 118, LAD: 119, WSH: 120, NYM: 121, OAK: 133,
    PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138,
    TB: 139, TEX: 140, TOR: 141, MIN: 142, PHI: 143,
    ATL: 144, CWS: 145, MIA: 146, NYY: 147, MIL: 158,
  };
  ```
  Derived via a one-time call to
  `https://statsapi.mlb.com/api/v1/teams?sportId=1` + hand-
  transcribed. Worth a TODO comment to re-verify if team
  codes ever shift (unlikely).
- **Acceptance:**
  - Map has 30 entries.
  - Abbreviations match what our `team.abbreviation` column
    holds.

### T15.4.2 Roster-based matcher

- **What:** Rewrite
  `src/app/api/cron/mlbam-id-backfill/route.ts`:
  - For each team abbreviation in our DB:
    - Look up the MLB Stats team_id from the const map.
    - Fetch `https://statsapi.mlb.com/api/v1/sports/1/roster/40Man?teamId=N&hydrate=person`.
    - For each person in the returned roster:
      - `normalizeName(person.firstName)` + `normalizeName(person.lastName)`
      - Look up our `player` rows where
        `normalizeName(first_name) = firstNorm AND
         normalizeName(last_name) = lastNorm AND
         team_id = <our team uuid>`.
      - On match: write `mlbam_id = person.id`.
    - 500ms sleep between team requests.
  - **Fallback:** after all teams processed, any remaining
    unmatched rows get the Phase 14 search-based matcher
    (existing `resolveMlbamId` fn, fuzzy + strategies).
- **Acceptance:**
  - Post-run, `unmatched_total` drops below 20.
  - Response shape: `{ roster_matched, fallback_matched,
    ambiguous, unmatched, unmatched_total, teams_processed,
    strategies }`.
  - Idempotent — re-runnable.

### T15.4.3 Runbook update

- **What:** `docs/runbook.md` "Backfill MLBAM ids" section
  replaces the search-based recipe with the roster-based
  one. Note that the first run should be `?retry_failed=true`
  to catch the ~180 residuals the search-based matcher
  couldn't reach.

---

## P15.5 — ADR-0020 retro

### T15.5.1 `docs/adr/ADR-0020_phase-15-retro.md`

Standard template: shipped, went well, surprised us,
simplified, open items, estimate vs reality.

---

## Dependencies between tasks

```
P15.1 (sidebar layout) ──► independent
P15.2 (redirect) ──► depends on P15.1 (so the component renders cleanly)
P15.3 (bench filter) ──► independent
P15.4 (roster backfill) ──► independent
                                           │
                                           ▼
                                     P15.5 (ADR)
```

P15.1 + P15.3 + P15.4 independent. P15.2 after P15.1 for
clean diffs. P15.5 closes.

---

## What's NOT in Phase 15

Per spec §37:

- Onboarding / empty-error / a11y / foil motion / dupe
  picker / mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive FP.
- Auto-sub contract-depletion glow.
- `retry_failed=true` offset pagination.
- `/collection/[cardId]` as a full-page view.

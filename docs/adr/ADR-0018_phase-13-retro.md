# ADR-0018 — Phase 13 (Unified Sidebar + Player Photos) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 13 (Feel Pass v1.7 — Unified sidebar layout + real player photos)
**Companion specs:** `draft-deck-polish-spec.md` §24–§27,
`docs/roadmap-phase-13.md`.

---

## Context

Four seemingly-separate polish items that shared a single
theme: make the right sidebar the canonical "context" surface
everywhere, and close the long-parked player-photo gap.

1. **ZoomCanvas.** P8.3's pan/zoom/fit layer on the lineup
   diamond added friction without paying for itself — users
   don't pan around a 10-slot grid.
2. **Collection page sidebar.** Lineup had a polished sidebar
   (Live Score / Box Score / Event Feed / Status Chip);
   collection had a narrower w-60 with mixed stats + filters.
   Two pages, two aesthetics.
3. **Card detail drawer.** Clicking a card slid in a full-
   width drawer that felt like leaving the page. Broke flow
   on both pages.
4. **Player photos.** Schema (`player.mlbam_id`, `photo_url`,
   `photo_synced_at`) has been in place since Phase 1 with a
   stub cron that "would activate once MLBAM join strategy is
   locked." The strategy was never locked. Cards shipped with
   initials fallback for 13 phases.

Estimate: 3–4 days. Shipped in 7 commits + plan commit in
one session.

## Decision

- Delete ZoomCanvas wholesale. Diamond fits the viewport
  directly; horizontal scroll below ~900px beats further
  slot compression.
- Extract `<CardDetailPanel>` from the former `CardDetailDrawer`.
  Wrap in `<SelectedCardSidebar>` with a Back button. Both
  lineup + collection pages conditionally swap their sidebar
  content to this when a card is selected.
- Collection page grows a `<CollectionShell>` mirroring
  `<LineupShell>`. Sidebar default: `<CollectionSummaryStats>`.
  Filters + count move above the grid.
- Player photos derive from a deterministic MLBAM CDN URL
  given `mlbam_id`. BDL doesn't expose MLBAM ids — backfill
  via MLB Stats API's public name-search endpoint. Manual
  CRON_SECRET-gated trigger; no schedule (Vercel Hobby
  budget).

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `c14133e2` | Polish spec §24–§27 + `docs/roadmap-phase-13.md`. |
| P13.1 | `27a277f1` | ZoomCanvas deleted. `LineupShell` renders the diamond directly. `DiamondGrid` column min relaxed 96→80px. -278 net lines. |
| P13.2+P13.3 | `73be0e2d` | `<CardDetailPanel>` extracted + `<SelectedCardSidebar>` wrapper. Lineup page sidebar conditionally renders detail on card click. CardDetailDrawer removed from lineup. |
| P13.4 | `b4c62261` | `<CollectionShell>` + `<CollectionSummaryStats>` (overview / tiers / contracts). Filters relocated above the grid. URL-driven `?card=` state opens the sidebar detail. `CardDetailDrawer.tsx` deleted — drawer pattern fully retired. |
| P13.5 | `e51b1d27` | `mlbamHeadshotUrl` helper, `/api/cron/mlbam-id-backfill` endpoint, `<CardPhoto>` client component with onError silhouette fallback. Thread `mlbam_id` through every server-side card query. Runbook entry. |
| P13.5 fix | `5be77c40` | Normalize first+last for match: NFD decompose + strip diacritics + strip Jr./Sr./II/III/IV/V suffix. "Acuña" now matches "Acuna". |
| P13.5 fix | `44c599fe` | Track `photo_synced_at` on every attempt (hit or miss) so re-runs skip already-tried rows. Match rate went from ~3%/batch (stuck retrying same hard cases) to ~75-85%/batch. |
| P13.6 | *(this)* | ADR-0018. |

Two prod deploys: initial + matcher-hardening redeploy.
Backfill run produced ~540 MLBAM id matches over ~18
batches of 40 players each (~76% of active 40-man roster).

## What went well

1. **ZoomCanvas deletion was pure subtraction.** -278 net
   lines, no logic to preserve, no regressions. The p8.3
   retro was right that it never earned its keep; removing
   it felt more honest than keeping it around "just in case."
2. **`<CardDetailPanel>` extraction was clean.** The drawer
   was already a thin Sheet wrapper around pure content +
   action buttons. Stripping the Sheet left a ready-to-use
   flush panel. Zero action handlers needed to change.
3. **`<SelectedCardSidebar>` is consumed identically on both
   pages.** Same component, same Back button, same panel
   contents. Visual consistency fell out for free.
4. **URL-driven `?card=<id>` preserved on collection.** The
   existing shareable-link pattern (back/forward nav opens
   + closes the sidebar) survived the refactor verbatim.
5. **Delete-on-unreferenced worked as planned.** After P13.4
   landed, `CardDetailDrawer.tsx` was unused — deleted in
   the same commit. Zero dead code carried forward.
6. **Separate client boundary for `<CardPhoto>`.** Kept
   `<Card>` server-renderable. The `onError` image fallback
   is the only piece that needs client state; no reason to
   force the whole tree.
7. **The `attempted → skip on re-run` pattern unblocked the
   backfill dead-end.** Without it, the endpoint re-processed
   the same alphabetically-first 40 failing rows every run.
   Reading the numbers together (`unseen_remaining` vs
   `unmatched_total`) exposed the stall immediately.
8. **Deterministic CDN URL > uploaded Supabase Storage.** No
   sync, no invalidation, no storage bucket provisioning.
   When MLB updates a player's photo, our URL automatically
   serves the new version.

## What surprised us

1. **MLB Stats API and BDL disagree on two naming
   conventions.** BDL strips diacritics (`Acuna`); MLB Stats
   keeps them (`Acuña`). BDL includes suffix in last_name
   (`Acuna Jr.`); MLB Stats splits it (`Acuña` + `nameSuffix`).
   Initial match rate was ~60% collapsing to ~0% as easy wins
   got picked off. Normalization + suffix strip pushed it
   into the 75-85% range.
2. **Match rate plateaued at ~76%, not the spec target
   ~95%.** The residual 24% (~187 players) are likely:
   - Minor leaguers on the 40-man who aren't in MLB Stats
     API's active set.
   - Names with internal diacritics we didn't normalize
     (middle names, compound surnames).
   - Genuinely ambiguous two-player collisions that
     team-lookup couldn't break (e.g., mid-season trades
     where `player.team_id` points at a stale team).
   
   Acceptable for Phase 13 — the test-account lineup
   renders photos. A follow-up phase can add fuzzy matching
   + MLBAM Stats API `hydrate=currentTeam` to fix the
   ambiguous-by-team cases.
3. **Vercel serverless timeout was real.** First call with
   `?limit=200` hung (40s×200ms/player + HTTP). Dropped to
   `?limit=40` which fits comfortably under the 10s Hobby
   timeout. The runbook calls out the default limit now.
4. **Docker was hung the entire session (again).** Same as
   Phases 11, 12. Couldn't run `pnpm dev` locally; shipped
   straight to prod and relied on the unit test gate. The
   failure mode keeps not biting us because the refactors
   have clear code paths + the typecheck + lint + 62-test
   unit suite all ran green.
5. **`supabase db push --linked` was not needed this phase.**
   Only one trivial migration (`0027` for Realtime) landed
   in Phase 12; Phase 13's schema was already set up. The
   missing-column story ("player.mlbam_id has been there for
   13 phases") was a quiet pleasure.

## What we deliberately simplified

1. **No cron schedule for mlbam-id-backfill.** Vercel Hobby
   budget is one cron/day and it's spoken for (roster sync).
   Manual trigger via curl matches the `admin-reconcile`
   precedent. When we upgrade to Pro + have room, a weekly
   schedule is one `vercel.json` entry.
2. **No MLBAM photo upload to Supabase Storage.** The CDN
   URL is public + cached. Storing locally adds a sync
   pipeline without a use case. If MLB ever removes / paywalls
   the CDN, we revisit.
3. **Match only active 40-man players.** Legacy cards (e.g.,
   retired players) and minor leaguers stay with the
   silhouette. Expanding the match set would bloat the
   backfill + risk hitting inactive-player 404s.
4. **No cross-fade on the sidebar swap.** Instant is snappy
   + matches Next.js navigation feel. Animation is the kind
   of polish that reads jarring at the sample size — easy to
   add later if it ever feels wrong.
5. **No URL sync on the lineup page card detail.** Collection
   uses `?card=<id>` because shareable links make sense
   there. Lineup is a per-user contest surface — no need for
   the URL to survive refresh.
6. **No retry on backfill network errors.** Caught + marked
   attempted. If a transient error lost a player, reset
   `photo_synced_at = NULL` for that row and re-run.
7. **No test for the MLB Stats API response shape.** The
   endpoint is a private prod tool; the shape is documented.
   If MLB changes it, the fn fails loudly with null
   matches + we fix.

## What's ready for the next polish pass

- `<SelectedCardSidebar>` + `<CardDetailPanel>` are
  reusable primitives. Any future page that wants card
  detail in a sidebar (profile, vault detail, leaderboards?)
  wraps its own shell + imports them.
- `<CollectionShell>` is the second shell matching the
  lineup aesthetic. Future pages can copy the pattern
  (milestones, vault history, etc.).
- `mlbamHeadshotUrl(id, size)` is the single source of
  truth for photo URLs. If MLB ever rotates the pattern,
  one-line fix.
- The backfill endpoint's matcher can grow: fuzzy matching
  (Levenshtein ≤ 2?), MLBAM API `hydrate=currentTeam` for
  better team disambiguation, middle-name handling. Each is
  an opt-in iteration.
- `<CardPhoto>` is a reusable fallback primitive. If a
  future surface wants player photos without the full Card
  chrome, it's importable.

## Open items

1. **Backfill match rate ~76%, not ~95%.** Worth a follow-up
   to investigate the residual 187 unmatched players. Likely
   fuzzy-match improvements + `hydrate=currentTeam`.
2. **Backfill retry on transient network errors.** Currently
   marks attempted on any thrown error. Could distinguish
   "429/503/etc = retry" from "200 but no match = accepted
   failure."
3. **No cron schedule for photo sync.** Manual for now;
   schedule once roster-sync cadence stabilizes.
4. **Cross-fade on sidebar swap.** Deferred; revisit if it
   reads jarring in real use.
5. **Mobile sidebar.** The `md:flex` gate on the sidebar
   hides it below 768px. No mobile treatment yet; broader
   mobile work is parked.
6. **Card detail URL sync on lineup page.** Deferred;
   doesn't match the use case.
7. **Onboarding pass, empty/error sweep, a11y audit, tier
   foil motion, dupe picker, sound/haptics** — all still
   parked from prior phases.

## Estimate vs reality

Estimate: 3–4 days. Shipped: 7 commits + plan commit in one
session. P13.5 had the only real surprise — the backfill
dead-end from stale "retry the same failing rows" behavior,
and the normalization gap that took two follow-up commits
to close. Still under the estimate overall.

## Consequences

- One sidebar pattern across the app. Lineup + collection
  read as the same surface. Any future page that wants card
  detail in-context imports `<SelectedCardSidebar>`.
- The `<CardDetailDrawer>` is retired. 13 phases of shipping
  it is a nice run; the replacement is cleaner + more
  consistent with the rest of the UI.
- Cards show real player photos for ~76% of active 40-man
  rosters — most visible cards will render with a real
  headshot. The silhouette fallback is graceful for the
  remainder.
- Every new MLB player who joins will need a backfill re-run
  post-roster-sync. Runbook covers this. Follow-up cron
  schedule when we upgrade Vercel tier.
- Schema scaffolding that sat dormant for 13 phases is now
  earning its keep. The early ADR-0008 decision to put
  `mlbam_id` + `photo_url` on `player` paid off — zero
  migration needed this phase.

## Related ADRs

- ADR-0013 — Phase 8 Retrospective. ZoomCanvas shipped here;
  P13.1 retires it.
- ADR-0015 — Phase 10 Retrospective (Unified Lineup View).
  Set the pattern the collection page now follows.
- ADR-0017 — Phase 12 Retrospective (Live-View Liveness).
  The LineupView + LineupSidebar architecture Phase 13
  builds on.

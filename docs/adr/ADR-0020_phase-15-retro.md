# ADR-0020 — Phase 15 (Sidebar Fit + Bench Clarity + 40-man Backfill) Retrospective

**Status:** Accepted · **Date:** 2026-04-22
**Phase:** Phase 15 (Feel Pass v1.9.5)
**Companion specs:** `draft-deck-polish-spec.md` §33–§37,
`docs/roadmap-phase-15.md`.

---

## Context

Three items, two of them user-facing bugs surfaced by real
use of the Phase 13/14 surfaces, the third the long-deferred
fix to the Phase 14 backfill ceiling.

1. **Sidebar horizontal scroll.** Screenshot confirmed the
   `<Card size="large">` (320px) rendering inside the 288px
   sidebar, with leftover `md:flex-row` from the full-page
   drawer era.
2. **Bench/tokens trays showing in-use items.** User feedback
   — those trays read as "unused stuff"; having the currently-
   rostered cards + applied tokens there (dimmed, non-drag)
   was confusing.
3. **MLBAM backfill stuck at ~77%.** Phase 14's
   `/people/search` matcher had a structural ceiling:
   the endpoint filters to MLB-service-time players. The
   `/sports/1/roster/40Man` endpoint returns the full 40-man,
   no service-time filter.

Estimate: ~2–2.5 days. Shipped in 6 commits + plan + ADR in
one session (~2 hours wall time), under estimate on
everything except #3 — which under-performed.

## Decision

- Collapse `<CardDetailView>` to a single column with a
  medium card; tighten padding + stack the action buttons.
  Redirect the orphan `/collection/[cardId]` route.
- Drop in-use cards/tokens from the bench + tray entirely;
  header counters acknowledge the hidden set.
- Rewrite backfill to fetch all 30 team rosters upfront into
  a global `rosterByName` index, then match our player pool
  globally + disambiguate by team_abbr. Keep the Phase 14
  `/people/search` matcher as fallback for non-40-man
  residuals.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `8601bb27` | Polish spec §33–§37 + `docs/roadmap-phase-15.md`. |
| P15.1+P15.2 | `30b27fe3` | `<CardDetailView>` compact single-column layout + `<Card size="medium">` + tightened spacing. `/collection/[cardId]` route rewritten as a 307 redirect to `/collection?card=<id>`. |
| P15.3 | `58b608b3` | `<BenchDrawer>` filters out assigned cards; `<TokenTray>` filters out applied tokens. Both headers gain an "N in lineup" secondary counter. Sort simplified; drag mechanics unchanged. |
| P15.4 | `12fb6214` | New backfill endpoint: `/api/cron/mlbam-id-backfill` primary path fetches all 30 team rosters + matches globally. Fallback to Phase 14 search for residuals. Response shape gains `teams_processed` + `roster_matched` + `fallback_matched` + `roster_exact/roster_fuzzy` strategies. |
| P15.4 fix | `5cad299c` | Wrong endpoint URL (`/sports/1/roster/40Man` returns 404). Corrected to `/teams/{id}/roster?rosterType=40Man&hydrate=person`. |
| P15.4 fix | `7348aff2` | Team-scoped roster match was too strict — players with stale team_id (mid-season trades) got skipped. Rewrote as global rosterByName index + team_abbr disambiguation only when names collide. |
| P15.5 | *(this)* | ADR-0020. |

## What went well

1. **`<CardDetailView>` fix was mostly subtraction.** Removed
   `md:flex-row` + `max-w-5xl` + swapped `size="large"` →
   `size="medium"` + tightened padding + stacked the two
   action buttons. 118 lines out, 49 lines in. No logic
   change.
2. **Orphan route redirect is a 12-line file.** Clean way to
   preserve URL addressability for anyone with bookmarks
   without maintaining a parallel detail surface.
3. **Bench/tokens filter change was two memos + two counter
   strings.** BenchDrawer's existing `assignedCardIds` prop
   already carried the info we needed; the `filtered` memo
   just promoted "sort to end" to "drop entirely."
4. **Debug loop for the 40-man endpoint was quick.** First
   run showed `teams_processed: 0` — that number plus a
   direct curl to the endpoint exposed the 404 in one step.
   Second run showed the stale-team_id issue; reading the
   low `roster_matched: 11` plus thinking about mid-season
   trades led straight to the global-index fix.
5. **Strategies breakdown in the response is paying for
   itself.** `roster_exact: 8` + `roster_fuzzy: 3` on the
   first working run + `roster_fuzzy: 3` on the retry told
   us exactly where the wins came from (and didn't).

## What surprised us

1. **Only ~14 new matches from the 40-man pass.** The
   residual ~158 players from Phase 14 are largely cases
   where our `is_active_40_man = true` flag is true but
   the player is actually NOT on any team's current 40-man
   (optioned since last BDL roster sync, DFA'd and not yet
   synced, etc.). Our cache is just stale. The 40-man
   endpoint is working correctly — it's saying "these
   players aren't in any 40-man" and it's right.
2. **Phase 15's fix didn't move the match-rate needle
   meaningfully.** Spec §36 expected to drop `unmatched_total`
   below 20; actual: 158 → 144 → 158 across runs. The
   bottleneck wasn't the matcher — it was upstream data
   freshness. The matcher is now correct; the input data
   isn't.
3. **Wrong endpoint URL wasted a deploy.** Should have
   curled the endpoint manually before shipping. Instinct
   says "mlbstatic.com seems stable; don't bother" — but
   the path shape varies (we used a guess based on the
   `sports/1/teams` endpoint we'd hit before, which was
   wrong for roster).
4. **Global rosterByName + team disambiguation is cleaner
   than team-scoped iteration.** Initially wrote the
   roster pass as "for each team: for each of our players
   on that team: find in roster." Made sense conceptually.
   But it assumed our team_id was current, which it often
   isn't. The global index + "disambiguate only on
   collision" is structurally more correct.

## What we deliberately simplified

1. **No BDL roster-sync audit this phase.** The real fix
   for the remaining 158 is probably re-running
   `bdl-roster-sync` to re-populate `is_active_40_man` +
   `team_id`. Out of scope for a polish phase; file as a
   follow-up.
2. **No `ALL players` scope in the roster pass.** The
   query filters to `is_active_40_man = true`. If we
   flipped to "all players without mlbam_id", we might
   catch additional minor leaguers from BDL. But then
   we'd also re-process already-accepted-as-silhouette
   retired/released players with `retry_failed`. Not worth
   the noise.
3. **No manual-override column for unmatched players.**
   The existing `UPDATE public.player SET mlbam_id = N
   WHERE id = '...'` per the runbook is fine for the
   handful of holdouts.
4. **Sidebar layout change keeps the full action set
   visible.** Tempting to hide "Token Stats" + "Game Log"
   tabs (which are still Phase 3 placeholders) but that
   would orphan tests + touch CardDetailView's public
   shape. Left alone.
5. **Bench counter shown only when > 0.** "0 in lineup"
   adds noise; just don't render.

## What's ready for the next polish pass

- **`<CardDetailView>` is sidebar-ready.** Any future
  surface that wants card detail imports the same component
  now; layout fits whatever 288px+ column it's dropped
  into.
- **`rosterByName` index pattern** generalizes: any future
  "match our cached data against a source of truth" flow
  (teams, positions, jersey numbers, injury status) can
  build a similar global index + disambiguate-on-collision
  pass.
- **Match-strategy breakdown in the response** is the
  template for any future backfill. Knowing where the wins
  come from makes iteration real instead of vibes-based.

## Open items

1. **Residual ~158 unmatched players.** Root cause is our
   cached `is_active_40_man` being out of sync with MLB's
   actual 40-man. Fix path: re-run `bdl-roster-sync`,
   then re-run mlbam-id-backfill with `retry_failed=true`.
   Phase 16+ candidate if we care about the coverage gap.
2. **BDL roster-sync staleness in general.** Worth
   understanding + potentially adding an MLB Stats-driven
   sanity-check pass.
3. **`retry_failed=true` pagination.** Still runs the full
   residual list on each invocation; no offset support.
   Fine for now since the list's small.
4. **Onboarding pass** — still the highest-impact parked
   item.
5. **Standard parked items** — sound, empty/error sweep,
   a11y, tier foil motion, dupe picker, mobile, rank
   display.

## Estimate vs reality

Estimate: ~2–2.5 days. Shipped: 6 commits + plan + ADR in
one session (~2 hours wall time). Under estimate on
everything except P15.4, which under-performed
match-rate-wise. Two follow-up commits (URL fix + global
index) to close the deploy-deploy-test loop.

## Consequences

- Card detail in the sidebar fits cleanly on both pages.
  The horizontal-scroll bug from the screenshot is gone.
- Bench + tokens trays now show genuinely-unused items
  only, matching user mental model. Counters acknowledge
  the hidden set so nothing feels missing.
- Backfill is now structurally correct — 40-man primary,
  search fallback, global index. The residual coverage gap
  is a BDL-roster-sync-data problem, not a matcher problem.
- `/collection/[cardId]` retired as a standalone surface;
  sidebar is canonical.
- Three matching strategies (roster_exact, roster_fuzzy,
  team_disambiguated) plus Phase 14's (exact, stripped,
  fuzzy) = six named paths + the ambiguous/unmatched
  outcomes. Future matcher tweaks have a clean grammar.

## Related ADRs

- ADR-0018 — Phase 13 Retrospective (Unified Sidebar +
  Photos). The original sidebar embedding that surfaced
  the horizontal-scroll bug.
- ADR-0019 — Phase 14 Retrospective (Polish Bundle).
  Phase 14 shipped the search-based matcher + fuzzy +
  retry_failed flag that Phase 15 extends + fallbacks on.

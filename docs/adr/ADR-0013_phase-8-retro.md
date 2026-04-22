# ADR-0013 — Phase 8 (Feel Pass v1.2 → v1.3) Retrospective

**Status:** Accepted · **Date:** 2026-04-21
**Phase:** Phase 8 (Polish — v1.3 feel pass)
**Companion specs:** `draft-deck-polish-spec.md` §10–§13,
`docs/roadmap-phase-8.md`.

---

## Context

Phase 7 closed the v1.2 arc. Phase 8's interview locked three
deliverables: redesign pack opening (the biggest visual moment),
finish the lineup arc (Collection drawer + slot swap + n8n-style
pan/zoom), and pay down two pieces of hardening debt (real BDL
webhook + MLB-official W/L attribution). The last two ended up
being the biggest surprises of the phase.

Estimate: 7–9 days. Shipped in 8 slices + 2 live-triage fixes
over a single session.

## Decision

Same tempo as Phases 6 + 7: tight single-purpose slices, commit +
deploy each. For the first time this phase, external coordination
entered the loop — BDL registration required a secret handoff and
surfaced three real-payload bugs post-launch. We triaged those in
real time while the webhook was firing, a useful rehearsal for
incident response the product hasn't had yet.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P8.1 | `6dd93840` | Collection drawer migration — `/collection` cards open the shared `CardDetailDrawer` (P7.3) in place, URL updates to `?card=<id>`, back/forward toggles the drawer. Corner `AppliedTokenBadge` lands on Collection cards (fixes P7.2 regression). Stale-card guard auto-closes the drawer if `?card=<id>` points at a destroyed/vaulted/quick-sold card. |
| P8.2 | `db90b3c6` | Slot ↔ slot swap drag. New `swap_lineup_slots(user, entry, pos_a, pos_b)` SQL fn with dual pitcher/hitter eligibility check. `LineupSlot` becomes a drag source when filled. Drop routes to swap (via `fromPosition`) or existing `update_lineup_slot` based on drag origin. Self-drops rejected via `canDrop`. |
| P8.3 | `b1aa4889` + `d638d129` | Diamond pan + zoom canvas (`ZoomCanvas`). Initial version gated pan on "zoomed past fit" + required ctrl/cmd for scroll-zoom; user feedback flipped both — pan at any zoom, plain scroll zooms. 0.5×–2.0× of mount fit. Trackpad pinch + scroll + `+/−/Fit` buttons + drag-to-pan. Retired the P7.1 `overflow-auto` workaround. |
| P8.4 | `0c3417a4` | Pack reveal redesign. Tap-through carousel; `PackCardFlip` (180° Y-rotation spring); `StarPullBurst` (hero-scale + radial particles + screen-darken for `'star'`, glow pulse for `'starter'`, nothing for role/prospect); `PackDupePanel` with keep-new vs keep-existing choice. SQL (0023): `open_pack` no longer auto-quick-sells dupes — every pull becomes a card row; `card_results` array carries per-card dupe metadata. Skip-all fast-forwards with auto-resolve. `/palette` gains an interactive reveal demo (crucial — user had no coins to exercise live). |
| P8.5 | `6c3a4ea1` | Tightened winning-pitcher heuristic. Spec called for "MLB-official W/L from BDL play-by-play" but BDL's SDK doesn't expose decisions — verified against their type defs. New `pickWinningPitcher` pure fn: starter ≥ 5 IP on winning team wins; fallback to most-IP-on-winning-team (≥ 3 IP floor). Closer to MLB's actual rule than the legacy "most IP" heuristic. 10 unit tests. Bulk-fetched player meta removed N+1 queries. |
| P8.6 | `40624689` | Dev-sim route 404s in production; receiver already prod-ready (HMAC verified, idempotent, webhook_failed-gated). `docs/bdl-webhook-registration.md` runbook for the external handoff. |
| P8.6 fix | `81936875` | Post-registration live triage. Three bugs surfaced from real BDL payloads: (1) `event_type` read from a header BDL doesn't send — fixed by parsing body first; (2) unregistered event types were being retried forever — `DispatchResult.unhandled: true` flag; processor treats as success no-op; (3) events for MLB games not in our `public.game` table FK-crashed on `game_event.game_id` — handlers now return `unhandled: true` when the game lookup is null. Deploy + SQL cleanup; 42+ deliveries 100% processed after the fix. |
| P8.7 | *(this)* | Reduced-motion audit (no code changes — P7.5 global floor + component `useReducedMotion` hooks cover everything). New `tests/e2e/collection-drawer.spec.ts` for the click → drawer → URL path. ADR-0013. |

All live on `draft-deck.vercel.app`.

## What went well

1. **Shared drawer from P7.3 paid dividends.** P8.1 Collection
   migration was an afternoon slice — the `CardDetailDrawer` just
   needed a parent with `?card` query-param state. Same `Card`
   component, same actions, same corner `AppliedTokenBadge`
   propagation as lineup surfaces.
2. **CardDragLayer stayed domain-neutral.** P8.2 slot-swap was
   another extend-don't-rewrite win — the existing drag ghost +
   bounce-back shake worked for slot→slot without changes. Only
   new wiring was `fromPosition` on `CardDragItem` + the route-
   to-swap-vs-update branch in `handleCardDropped`.
3. **`/palette` carried Phase 8 through the budget freeze.** User
   had no coins for paid packs; tap-through flip + celebration
   variants + dupe panel were all verifiable via the client
   demo. This pattern keeps paying off — every new motion
   vocabulary gets a palette section.
4. **SQL DO-block smoke continued to pay rent.** P8.2
   (swap_lineup_slots happy path + pitcher/hitter mismatch
   guard) and P8.4 (open_pack returning card_results shape)
   both caught via rollback-after-assertions in seconds.
5. **Live-triage rhythm worked.** When the BDL registration went
   live and three bugs surfaced at once (event_type header,
   unhandled-retry-loop, unknown-game FK), we fixed + deployed +
   cleaned stale rows in a tight loop. The SQL access via the
   Supabase MCP made the DB-side cleanup pattern first-class.

## What surprised us

1. **BDL's SDK + webhooks don't expose W/L decisions.** Spec
   called for MLB-official attribution from play-by-play
   metadata; verifying against `reference/balldontlie-sdk-mlb-
   types.d.ts` showed `MLBStats` has IP/K/ER per player per game
   but no `winning_pitcher_id`. The webhook payloads I saw post-
   registration confirmed the same shape. Pivoted to a tighter
   heuristic in P8.5 + flagged that upgrading to a richer
   provider (or finding W/L in a different BDL endpoint) is
   deferred-but-tracked.
2. **BDL webhooks required All-Access tier.** Dashboard wouldn't
   let us register without upgrading. User upgraded mid-phase;
   we moved from a "build a polling cron" contingency back to
   the webhook path.
3. **Real BDL payloads differ from our header-based assumptions
   in three places.** Fixed post-registration:
   - `event_type` is in the body, not `x-bdl-webhook-event-type`.
   - BDL subscribes us to more event types than we model (e.g.,
     `mlb.batter.groundout`, `mlb.batter.lineout`,
     `mlb.game.inning_ended`, `mlb.injury.updated`). Retry cron
     was infinitely re-processing these; fix = explicit
     `unhandled: true` path.
   - BDL fires events for every live MLB game; our `public.game`
     only holds games referenced by contests. FK to `game_event.
     game_id` failed for the other ~15 MLB games running at any
     time. Fix = handlers return `unhandled: true` when game
     lookup is null.
4. **User-driven ZoomCanvas refinement.** Initial P8.3 gated
   pan on `scale > fit` and required ctrl/meta for scroll-zoom.
   User feedback immediately: "pan at any zoom, plain scroll
   zooms." Tweak shipped as a separate commit; good reminder
   that spec assumptions die on contact with the actual
   interaction.
5. **Diamond cards still fit at the new ZoomCanvas mount.** The
   mount-time fit scale gracefully compresses the 4-row grid
   into any pane height, so the P7.1 known-issue ("diamond may
   scroll internally at 800px") is retired. No `overflow-auto`
   needed.

## What we deliberately simplified

1. **No game-sync cron.** The "unknown game" fix skips quietly
   rather than syncing today's MLB schedule into `public.game`.
   When real contests reference games, contest-creation
   populates them. Building a full schedule sync is a separate
   slice we haven't needed yet.
2. **No retro-backfill for W/L rule change.** P8.5 only affects
   new reconciliations; historical contests keep their scored
   FPs. If leaderboards look unusual post-change we can add a
   recompute script later.
3. **Pack reveal keeps tap-through-single-card, not fanned
   hand.** Considered showing all N face-down in a visible row;
   went with single-card-with-dot-nav for viewport economy and
   to match the user's "I want to control the flip 1 at a time"
   answer.
4. **Dupe panel single-instance picker only.** If a user owns
   3+ copies of a pulled player, we default to the lowest-FP
   instance without offering the "(change)" picker. Spec left
   room for both; shipped the default-only version to keep P8.4
   focused.
5. **Drag-drop E2E still deferred** (per ADR-0011). Slot swap
   smoked via DO-block on prod. Collection drawer E2E covers
   the click-path only.

## What's ready for the next polish pass

- `CardDetailDrawer` is now the universal single-click detail
  surface (Lineup + Collection). Future surfaces (Vault
  pre-vaulted? live contest?) can reuse without rewiring.
- `ZoomCanvas` is lineup-bound today but the internals
  (pan + zoom state + gesture handlers) are domain-neutral.
  Any future canvas-like surface (e.g., a league standings
  tree) would fit.
- `StarPullBurst` is tied to `PlayerValueTier` but the variant
  + reduced-motion scaffold would generalize (tier-up
  celebrations, milestone animations).
- Webhook pipeline is battle-tested against real traffic now.
  42 deliveries / 0 failures across 11 event types = the
  `unhandled: true` flag design is validated.

## Open items

1. **BDL webhook for game sync.** We currently skip events for
   games not in our DB. When contest creation populates a game,
   future events route correctly — but the system is reactive,
   not preemptive. A small cron that imports scheduled games
   ahead of time would tighten the live-score UX when a user's
   contest starts.
2. **`commit_vault_selection` tolerance for pre-vaulted cards**
   — still open from P7.4.7. Not blocking (season isn't close to
   ending).
3. **W/L attribution revisit** — if BDL adds decisions to
   payloads, or we pivot to MLB Stats API / FantasyData, we can
   retire the heuristic.
4. **Dupe panel multi-instance picker** — P8.4 scope-cut. Low
   priority (users with 3+ copies of one player are rare; the
   lowest-FP default usually matches intent).
5. **Live contest view polish, onboarding pass, empty + error
   sweep, a11y audit** — still parked from the Phase 7
   backlog.
6. **Drag-drop E2E** — deferred each retro; revisit when
   Playwright's DnD stability improves or when real user bug
   rates demand it.

## Estimate vs reality

Estimate: 7–9 days. Shipped: 8 commits in the session
(including 2 live-fix commits post-BDL-registration). Held the
budget; the live triage was additional unplanned work but the
webhook delivery rate settled quickly once the bugs were
addressed.

## Consequences

- The lineup page arc is finished. Collection cards open the
  drawer; slots swap via drag; diamond zooms with n8n-style
  gestures. No remaining P7-era placeholders.
- Pack opening is the moment it should be. Tap-through pacing,
  celebrations for star + starter pulls, user agency on dupes.
  Palette makes it a visual-regression target.
- The real-time MLB data pipeline is live. BDL webhooks fire
  against production, HMAC-verified, idempotent, with clean
  handling of unhandled events and off-contest games. First
  real game event → contest scoring will be the final
  validation.
- Three new "unhandled is success" patterns across the webhook
  pipeline (no handler, no game in db, no payload field) make
  the retry cron's job cleanly scoped to genuine transient
  failures.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective (Vault + Milestones + Leaderboards).
- ADR-0010 — Phase 5 Retrospective (Seasonal crons + rank finalize).
- ADR-0011 — Phase 6 Retrospective (Feel Pass v1.1).
- ADR-0012 — Phase 7 Retrospective (Feel Pass v1.2).

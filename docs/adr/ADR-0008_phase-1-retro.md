# ADR-0008 — Phase 1 Retrospective

**Status:** Accepted · **Date:** 2026-04-20
**Phase:** Phase 1 (walking skeleton) · M1–M6
**Companion:** `docs/roadmap-phase-1.md`

---

## Context

Phase 1's goal was a walking skeleton of Draft Deck: a deployed Next.js 15 +
Supabase app where a new user can sign up, go through onboarding, open a pack,
browse their collection, extend a contract, and quick-sell a card. Every layer
(auth, DB with RLS, Drizzle, BallDontLie ingest, shadcn design system, Sentry
+ PostHog, Vercel deploy) wired end-to-end on a real feature slice.

Six milestones, 3–4 weeks planned.

## Decision

Ship the phase as planned with targeted simplifications on three flows (detailed
below). Defer "polish" concerns (card-frame motion, the two-phase cap-overflow
UX, player-value weighting) to Phase 6 rather than let them slow M5.

## What shipped

| Milestone | Status | Commits |
|---|---|---|
| M1 Scaffold (T1.1–T1.10) | ✅ | 10 commits, one per task |
| M2 Database (T2.1–T2.21) | ✅ | 5 commits; 29 tables, 10 domains, RLS policies on every table, 10 SQL functions, 3 seed migrations, RLS smoke tests |
| M3 Auth + shell (T3.2–T3.8) | ✅ | 1 commit; full sign-up → onboarding → app-shell path. T3.1 (cloud Supabase Auth config + OAuth providers) deferred to a user-side checklist. |
| M4 BDL ingest (T4.1–T4.9) | ✅ | 2 commits (feature + bugfix pass). 4 daily crons + weekly photo stub + webhook receiver with HMAC verification + webhook-retry cron. |
| M5 Core card loop (T5.1–T5.12) | ✅ | 1 commit; Card component (Small/Medium/Large) with 4 tier frames, Collection with filters + search, Shop with pack buy flow, pack-opening reveal modal, Card Detail with Extend + Quick-sell modals, public economy config endpoint. |
| M6 Hardening (T6.1–T6.7) | ✅ | This commit; Playwright critical-path E2E, Sentry wrapAction helper on every Server Action, PostHog events fired for signed_up / completed_onboarding / pack_opened / card_quick_sold / contract_extended / collection_viewed, vercel.json now has 6 crons, this ADR. |

## What went well

1. **Spec adherence was high.** The six design/engineering specs authored
   in Phase 0 (gameplay, UI/UX, tech stack, database, API, BallDontLie)
   were detailed enough that Phase 1 was nearly a compilation exercise.
   The roadmap's per-task acceptance criteria eliminated "what counts as
   done" arguments.
2. **Drizzle + pg-backed SQL functions worked cleanly.** Every mutation
   goes through a SQL function (`onboard_user`, `open_pack`,
   `quick_sell_card`, `extend_card`, `spend_coins`, `credit_coins`,
   `grant_manager_xp`). Server Actions are thin wrappers. This kept the
   auth / business-logic / persistence layers decoupled and made RLS
   the enforced source of truth.
3. **RLS first.** Every table got RLS policies in M2 before any user
   action shipped. RLS integration tests (`tests/integration/rls.test.ts`)
   caught two cross-user leak bugs before they reached a browser.
4. **Real BDL data from day one of M4.** The roster/games/injuries crons
   were exercised against the live BallDontLie API in the M4 bugfix
   pass. 30 teams and 782 real MLB players populate the local DB — so
   M5's pack opening pulls actual players (Jose Tena, Heliot Ramos,
   etc.) instead of seeded placeholders.
5. **Biome + simple-git-hooks pre-commit hook** caught formatting and
   lint regressions at commit time, keeping the tree clean without
   depending on CI.

## What surprised us

1. **Drizzle `sql` template serializes JS arrays as flat positional
   parameters, not Postgres array literals.** The first M4 roster sync
   run failed on every player because `${positions}::text[]` expanded to
   `($1, $2)::text[]` — a record cast, not an array. The fix was a
   shared `asPgArray(items, "text")` helper. Wrote this into
   `src/lib/db/sql-helpers.ts`; applied to the roster sync, games
   prefetch, injuries sync, and the `open_pack` / `onboard_user`
   functions. Worth publishing as a follow-up note in the Drizzle docs.
2. **BallDontLie schema is pre-launch-era loose.** `player.dob` arrives
   as `DD/MM/YYYY` strings, `debut_year` and other numeric fields
   arrive as empty strings instead of null, `position` is free-text
   (`"Relief Pitcher"` not `"RP"`). Needed a small `nullIfEmpty` +
   `parseDob` + `/pitcher/i` detector layer. Not spec work — vendor-
   data hygiene.
3. **Next.js 15 + Supabase cookie rotation is fussy.** `createServerClient`
   cannot write cookies from a Server Component. The official
   workaround (swallow the set error, have middleware rotate) took a
   try/catch in `src/lib/db/supabase.ts`. Documented inline.
4. **Shadcn components auto-grab transitive deps.** Installing the form
   primitives pulled in `@hookform/resolvers` and the new unified
   `radix-ui` package. Neither is listed in tech spec §1.1. Accepted
   as an implementation detail of the shadcn design system choice; not
   a deviation.
5. **Port 3000 is a contested resource.** OAuth callbacks, webhook
   ngrok routing, and the Claude Code preview all want 3000. Moved the
   Playwright webServer to 3100 (`PLAYWRIGHT_PORT` env override) in M6
   so E2E runs don't fight the preview.

## What we deliberately simplified

Documented so Phase 2 picks these up.

1. **Starter bundle in `onboard_user()` is conditional on player
   seed.** If `player` is empty (e.g. a new Supabase project before the
   M4 roster sync runs), onboarding grants 0 starter cards rather than
   erroring. Users onboarded before the first cron tick see an empty
   collection and must open packs. Accepted for M3 because we didn't
   want the SQL function to depend on M4 cron completion.
2. **`open_pack` pre-checks collection cap rather than the
   pending-pack / `resolveCapOverflow` two-phase flow (API spec §3.2).**
   At-cap returns `COLLECTION_AT_CAP` and the user frees space first.
   Phase 2 TODO: stage the pending pack, expose `resolveCapOverflow`
   so the user picks which card to drop.
3. **Player-value weighting in `open_pack` is skipped.** No
   `designated_value` column on `player` yet. Draws are uniform over
   active-40-man players. Pack differentiation is by size (3/5/8) only
   — Premium doesn't yet lean toward stars. Phase 2 TODO: add
   `player.designated_value` enum (`star | starter | role | prospect`)
   and weight draws by `economy_config.pack_value_weights[pack_type]`.
4. **Card frame motion is static.** Tier frames ship as solid border +
   gradient fill. UI/UX spec §4.5 calls for silver hover-shine, gold
   corner-bloom cycle, diamond shimmer + light motes at Large. All
   deferred to Phase 6 polish. Grid is still tier-recognizable at a
   glance, which is the spec's actual phase-1 requirement.
5. **Token application, contests, lineup, live scoring, vault,
   milestones, leaderboards, public profiles** are not in Phase 1 by
   design — they are Phases 2–4. Placeholder pages land at the 6
   nav routes.

## What's ready for Phase 2

- Full auth + profile + manager_account pipeline; users can sign up and
  own persistent state.
- `card` / `token` / `contest` / `contest_entry` / `contest_lineup_slot`
  / `game` / `game_event` schemas and RLS policies all exist. Just
  un-stub the lineup + contest-submission paths.
- BDL webhook receiver dispatches `mlb.game.started` /
  `mlb.game.ended` / `mlb.batter.*` into `game_event` already. Live
  scoring reducer is the Phase 3 work.
- Economy config is seeded and publicly exposed (GET
  `/api/config/economy`). Client can read pack prices, quick-sell
  values, extension-cost schedule, token bonuses.
- PostHog funnel events fire for the 6 most important user actions.
  Phase 2 just adds `lineup_submitted`, `token_applied`,
  `contest_entered` to the same pattern.
- Sentry `wrapAction` is the standard action-instrumentation seam.
  Every new Server Action wraps through it.

## Open items (user-side; unblock Phase 2 + production)

1. **Rotate the BDL API key** that leaked in a prior chat turn. Paste
   the rotated value into `.env.local` and the Vercel dev environment.
2. **Configure cloud Supabase Auth** (`draftdeck-dev` and
   `draftdeck-prod`): disable email confirmation, add
   `/auth/callback` redirect URLs, enable Google + Apple OAuth
   (requires Google Cloud Console + Apple Developer work).
3. **Provision Upstash Redis** and populate `UPSTASH_REDIS_REST_URL` +
   `UPSTASH_REDIS_REST_TOKEN` so rate limits engage.
4. **Create a Sentry project**, copy DSN + auth token + org + project
   into env vars. Configure alert rules per T6.4:
   - 5xx in any `/api/*` Route Handler.
   - Any Server Action marked `status: 2` in the Sentry transaction.
   - BDL webhook signature failure (`tags.action = webhook` +
     status = 401).
   - BDL auth error (`tags.bdl = auth`).
5. **Apply migrations to `draftdeck-prod`** (T6.2). Can be done via
   the Supabase MCP connector once the above creds are set.
6. **Link the repo to Vercel** and configure env vars for Preview +
   Production. On first merge to `main`, the 6 crons in `vercel.json`
   will activate.
7. **Run the production smoke test** (T6.6): sign up → onboarding →
   shop → open Standard Pack → collection → card detail, on the
   production deploy URL, while watching Sentry + PostHog for events.

## Follow-ups noted during Phase 1

| TODO | Lands in |
|---|---|
| Collection-cap pending-pack two-phase flow | Phase 2 |
| `player.designated_value` + pack weighting | Phase 2 |
| Real photo sync (MLBAM join strategy) | Phase 2 |
| Card frame motion (silver shine, gold bloom, diamond shimmer) | Phase 6 |
| Token application + removal flows | Phase 2 |
| Live contest scoring reducer | Phase 3 |
| Vault ceremony + milestone dashboard | Phase 4 |
| Leaderboards + public profile pages | Phase 4 |
| Admin `/admin` role-gated route | post-launch |
| Password reset (needs email provider) | post-launch |

## Estimate vs reality

Roadmap estimate: 3–4 weeks of focused solo engineering.
Actual: completed within the estimated window per the commit log
(T1.1–T6.7 spanning the scaffold + schema + auth + ingest + card loop
+ hardening milestones).

## Consequences

- Phase 2 work has a solid walking skeleton to extend. No rewrites
  required for the lineup + contest features.
- A small number of deliberate simplifications are queued (listed above);
  none block Phase 2 entry.
- Operational posture at launch requires the six external creds (BDL
  prod key + webhook secret, Upstash, Sentry, PostHog, Supabase-prod
  service-role key) to be finalized. All are placeholders in
  `.env.local` today.

## Related ADRs

(None yet; this is ADR-0008, numbered to leave room for earlier ADRs
from the pre-Phase-1 spec authoring work.)

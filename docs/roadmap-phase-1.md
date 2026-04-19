# Draft Deck — Phase 1 Engineering Roadmap (v0.1)

**Goal:** Ship a **walking skeleton** of Draft Deck — a deployed Next.js 15 + Supabase app where a new user can sign up, go through onboarding, open a pack, browse their collection, extend a contract, and quick-sell a card. No contests yet; no live scoring; no vault ceremony. Every layer of the stack (auth, DB with RLS, Drizzle, BallDontLie ingest, shadcn design system, Sentry + PostHog, Vercel deploy) is wired end-to-end on a real feature slice.

**Estimated effort:** 3–4 weeks of focused solo engineering.

**Phase 1 ≠ the final product.** Phases 2–6 (lineup + tokens, live contests, vault, milestones, leaderboards, seasonal flows) come after and are scoped separately.

---

## Prerequisites (complete before T1.1)

- [ ] Vercel account with Pro tier (or Hobby for earliest scaffolding).
- [ ] Supabase account with two projects provisioned:
  - `draftdeck-dev` (development + preview deploys)
  - `draftdeck-prod` (production)
- [ ] BallDontLie account with **GOAT tier active** ($39.99/mo). Generate two API keys (dev + prod).
- [ ] Sentry project created. DSNs copied for frontend + backend.
- [ ] PostHog project created. API key copied.
- [ ] Upstash Redis instance provisioned (for rate-limit + idempotency).
- [ ] Domain name registered (optional at this stage; default `*.vercel.app` works).
- [ ] `draftdeck.com` (or chosen domain) reserved.
- [ ] Google OAuth app created in Google Cloud Console (for Supabase OAuth).
- [ ] Apple OAuth Services ID created (for Supabase OAuth on Apple).
- [ ] Figma access for design team (not blocking; informational).
- [ ] `CRON_SECRET` generated (random 32+ char) and saved.
- [ ] Local dev machine: Node 20 LTS, pnpm 9+, Docker Desktop, Supabase CLI installed.

---

## Milestones

| ID  | Milestone                                 | Target | Outcome                                                |
|-----|-------------------------------------------|--------|--------------------------------------------------------|
| M1  | Project scaffold                          | Day 1–2 | Next.js 15 app boots locally, deploys a hello page to Vercel |
| M2  | Database foundation                       | Day 3–6 | All tables migrated, RLS enabled, first seed data loaded |
| M3  | Auth + shell                              | Day 7–10 | Users can sign up, land on a shell with header + sidebar |
| M4  | BallDontLie ingest foundation             | Day 11–14 | Daily cron syncs rosters + games; webhook receiver verified |
| M5  | Core card loop                            | Day 15–21 | Users can open packs, browse collection, extend, quick-sell |
| M6  | Phase 1 hardening + first deploy          | Day 22–25 | Sentry + PostHog live; Playwright critical path passing; smoke-tested in prod |

---

## M1 — Project Scaffold (Day 1–2)

### T1.1 Create fresh Next.js 15 project
- **What:** `pnpm create next-app@latest draft-deck --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm`
- **Where:** New directory alongside existing Vite prototype.
- **Acceptance:**
  - `pnpm dev` boots on `localhost:3000`.
  - `tsconfig.json` has `strict: true`.
  - Tailwind renders.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §13.1.

### T1.2 Install and pin the locked dependency set
- **What:** Install exactly the deps in the tech spec §1.1. Pin versions with `pnpm add <pkg>@<version>`.
- **Packages:**
  - `@supabase/supabase-js`, `@supabase/ssr`
  - `drizzle-orm`, `drizzle-kit`, `pg`
  - `@balldontlie/sdk`
  - `@tanstack/react-query`
  - `zustand`
  - `zod`
  - `motion`, `react-dnd`, `react-dnd-html5-backend`
  - `sonner`, `lucide-react`, `react-hook-form`, `recharts`
  - `class-variance-authority`, `clsx`, `tailwind-merge`
  - `@sentry/nextjs`, `posthog-js`, `posthog-node`
  - `@upstash/redis`, `@upstash/ratelimit`
  - Dev: `vitest`, `@vitest/ui`, `happy-dom`, `@playwright/test`, `@biomejs/biome`
- **Acceptance:** `pnpm install` resolves cleanly; `package.json` matches the tech spec.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §1.1.

### T1.3 Configure Biome
- **What:** Add `biome.json` with strict TypeScript rules, import ordering, and format-on-save.
- **Acceptance:**
  - `pnpm lint` runs Biome check.
  - `pnpm format` auto-fixes.
  - Pre-commit hook via `simple-git-hooks` runs Biome on staged files.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §8.4.

### T1.4 Configure Vitest + Playwright
- **What:** `vitest.config.ts`, `playwright.config.ts`, sample tests in `tests/unit/example.test.ts` and `tests/e2e/smoke.spec.ts`.
- **Acceptance:**
  - `pnpm test` runs a single passing unit test.
  - `pnpm e2e` runs a single passing Playwright test against `localhost:3000`.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §8.

### T1.5 Wire Sentry (client + server)
- **What:** Follow `@sentry/nextjs` setup. Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `next.config.ts` Sentry wrapper.
- **Env vars:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- **Acceptance:**
  - A thrown error in a dev page appears in Sentry within 30s.
  - Source maps uploaded during `pnpm build`.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §10.1.

### T1.6 Wire PostHog (client + server)
- **What:** Init `posthog-js` in a provider component; init `posthog-node` for server events. Wrap root layout.
- **Env vars:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
- **Acceptance:**
  - `$pageview` events land in PostHog for the landing page.
  - A test server event (`app_boot`) fires on first page load.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §10.2.

### T1.7 Environment configuration
- **What:** Create `.env.example` listing every variable with a descriptive comment. Create `.env.local` locally.
- **Variables at minimum:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
  - `BDL_API_KEY`, `BDL_WEBHOOK_SECRET`
  - `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
  - `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - `CRON_SECRET`
- **Acceptance:** Env validation at boot via zod schema in `src/lib/env.ts` — missing required vars throw a clear error.

### T1.8 Shadcn/ui primitives + theme
- **What:** `pnpm dlx shadcn@latest init` with charcoal + cream palette. Port `theme.css` custom properties from the prototype's `src/styles/theme.css`, updating to the spec values.
- **Colors to define:** `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-2`, `--text-3`, `--muted`, tier colors (`--tier-bronze`, `--tier-silver`, `--tier-gold`, `--tier-diamond`).
- **Fonts:** Add Inter + JetBrains Mono via `next/font`.
- **Acceptance:** An example page renders the color palette and both fonts correctly.
- **Spec refs:** `draft-deck-ui-ux-spec.md` §2.

### T1.9 Vercel deploy
- **What:** Connect repo to Vercel, configure env vars, deploy `main` branch.
- **Acceptance:**
  - `main` deploys automatically on push.
  - PR creates a preview deploy.
  - Both have env vars set.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §9.

### T1.10 Vercel Cron skeleton
- **What:** Add `vercel.json` with empty crons array (we'll populate in M4). Add cron-auth middleware helper.
- **Acceptance:** `vercel.json` parses; `src/lib/auth/cron.ts` exports `assertCronAuth(req)`.

---

## M2 — Database Foundation (Day 3–6)

### T2.1 Configure Supabase CLI + local Docker
- **What:** `supabase init`; `supabase start`; verify Studio at `localhost:54323`.
- **Acceptance:** Local Postgres, Auth, Storage, and Realtime all boot via `supabase start`.
- **Spec refs:** `draft-deck-tech-stack-spec.md` §12.

### T2.2 Configure Drizzle
- **What:** `drizzle.config.ts` pointing at local Supabase; `src/lib/db/client.ts` that creates a Drizzle client from `DATABASE_URL`.
- **Acceptance:**
  - `pnpm db:generate` stubs work against an empty schema.
  - `pnpm db:push` applies migrations to local.

### T2.3 Drizzle schema: enums
- **What:** `src/lib/db/schema/enums.ts` with every pg enum in `draft-deck-database-schema-spec.md` §3.
- **Acceptance:** Enums defined; importable from other schema files.
- **Spec refs:** DB schema §3.

### T2.4 Drizzle schema: identity domain
- **What:** `src/lib/db/schema/identity.ts` — `season`, `profile`, `manager_account`, `user_season_state`.
- **Acceptance:** Tables render in Drizzle; migration generates correct SQL.
- **Spec refs:** DB schema §4.

### T2.5 Drizzle schema: MLB reference domain
- **What:** `src/lib/db/schema/mlb_reference.ts` — `team`, `player`, `game`, `game_event`.
- **Acceptance:** Matches DB schema §5. All BDL-facing columns present (`bdl_team_id`, `bdl_player_id`, `bdl_game_id`).
- **Spec refs:** DB schema §5.

### T2.6 Drizzle schema: configuration
- **What:** `src/lib/db/schema/config.ts` — `economy_config`.
- **Acceptance:** Single table with JSONB columns for tunables. Migration orders this before other domains (to seed first).
- **Spec refs:** DB schema §12.

### T2.7 Drizzle schema: cards domain
- **What:** `src/lib/db/schema/cards.ts` — `card`, `contract_extension`, `vault_entry`.
- **Acceptance:** Partial unique index `(user_id, player_id) WHERE is_vaulted = false` declared.
- **Spec refs:** DB schema §6.

### T2.8 Drizzle schema: tokens domain
- **What:** `src/lib/db/schema/tokens.ts` — `token`, `token_application`.
- **Acceptance:** Check constraint on `(applied_to_card_id IS NULL) = (applied_to_contest_id IS NULL)`.
- **Spec refs:** DB schema §7.

### T2.9 Drizzle schema: contests domain
- **What:** `src/lib/db/schema/contests.ts` — `contest`, `contest_entry`, `contest_lineup_slot`.
- **Acceptance:** All FKs declared. Normalized slot structure.
- **Spec refs:** DB schema §8.

### T2.10 Drizzle schema: economy domain
- **What:** `src/lib/db/schema/economy.ts` — `coin_transaction`, `pack_opening`.
- **Acceptance:** Append-only pattern (no updates from app).
- **Spec refs:** DB schema §9.

### T2.11 Drizzle schema: milestones domain
- **What:** `src/lib/db/schema/milestones.ts` — `team_milestone_state`, `team_milestone_award`.
- **Acceptance:** `tiers_hit` array fields as `int[]`.
- **Spec refs:** DB schema §10.

### T2.12 Drizzle schema: operational domain
- **What:** `src/lib/db/schema/operational.ts` — `webhook_delivery`, `webhook_failed`, `manual_grant`, `moderation_flag`.
- **Acceptance:** `webhook_delivery.delivery_id` is the primary key (text, vendor-provided).
- **Spec refs:** DB schema §11.

### T2.13 Idempotency log (new — not in DB spec v0.1)
- **What:** Add an `idempotency_log` table for Server Action idempotency keys. Columns: `user_id`, `key`, `request_hash`, `response`, `created_at`. TTL: 24h.
- **Acceptance:** Table created; `expireIdempotency()` cron job plan documented.
- **Spec refs:** API spec §2.6; add ADR-0005 when implemented.

### T2.14 SQL functions: utility
- **What:** `supabase/migrations/<n>_functions_util.sql` — `touch_updated_at()`, `recompute_card_tier()`, `recompute_card_expiry()`, `grant_manager_xp(user_id, amount, source)`.
- **Acceptance:** Functions compile in Supabase; trigger references them.
- **Spec refs:** DB schema §15.

### T2.15 SQL functions: economy
- **What:** `supabase/migrations/<n>_functions_economy.sql` — `spend_coins(user_id, season_id, amount, reason, ref_table, ref_id)`, `credit_coins(...)`.
- **Acceptance:** Both functions atomically update `user_season_state.coins` and insert `coin_transaction`; reject on overdraw.
- **Spec refs:** DB schema §15.4.

### T2.16 Triggers
- **What:** `supabase/migrations/<n>_triggers.sql` — `updated_at` trigger on every mutable table; `card_tier_on_fp_change` trigger; milestone counter triggers.
- **Acceptance:** Updating `card.career_fp_total` past a threshold flips `current_tier` within the same transaction.
- **Spec refs:** DB schema §15.

### T2.17 RLS policies migration
- **What:** `supabase/migrations/<n>_rls.sql` enabling RLS on every table and applying the policy families in DB schema §14.
- **Acceptance:** `SELECT` on any table from the `anon` role returns only public rows; from `authenticated` returns own + public.
- **Spec refs:** DB schema §14.

### T2.18 Seed `economy_config`
- **What:** `supabase/migrations/<n>_seed_economy_config.sql` inserting the launch config row with the defaults in DB schema §12.1.
- **Acceptance:** `SELECT get_active_economy_config()` returns the expected JSONB bundles.

### T2.19 Seed first season
- **What:** `supabase/migrations/<n>_seed_season.sql` inserting a `season` row for the 2026 MLB season. (Or whatever the current season is when this lands — confirm Opening Day date.)
- **Acceptance:** Row exists.

### T2.20 RLS smoke tests
- **What:** `tests/integration/rls.test.ts` — creates two fake users, confirms user A cannot read user B's card / token / contest_entry / coin_transaction rows.
- **Acceptance:** All tests pass. Covers the 10 critical RLS-scoped tables.
- **Spec refs:** DB schema §14.

### T2.21 Connect to cloud dev Supabase
- **What:** Point `.env.local` at `draftdeck-dev` project; run migrations against it via `supabase db push --linked`.
- **Acceptance:** Dev project has the full schema; seed data present.

---

## M3 — Auth + Shell (Day 7–10)

### T3.1 Supabase Auth configuration
- **What:** In Supabase Studio (dev + prod):
  - Disable email confirmation.
  - Enable Google OAuth.
  - Enable Apple OAuth.
  - Configure redirect URLs: `/auth/callback`.
- **Acceptance:** OAuth test succeeds in the dashboard.

### T3.2 `@supabase/ssr` client factories
- **What:** `src/lib/db/supabase.ts` with `createServerClient()` (for server components / route handlers) and `createBrowserClient()` (for client components).
- **Acceptance:** Each factory reads cookies correctly; session persists across SSR → client handoff.
- **Spec refs:** Tech spec §3.3.

### T3.3 Middleware: auth + rate limit
- **What:** `src/middleware.ts` — refresh Supabase session cookies on every request; apply Upstash rate-limits on mutating routes per the API spec.
- **Acceptance:**
  - Authenticated pages 302-redirect to `/signin` when session missing.
  - Over the rate limit returns `429 RATE_LIMITED` with `X-RateLimit-*` headers.
- **Spec refs:** API spec §2.5.

### T3.4 Sign-in / sign-up pages
- **What:** `app/(auth)/signin/page.tsx`, `app/(auth)/signup/page.tsx`, `app/auth/callback/route.ts`.
  - Email + password form (auto-sign-in on signup, no email confirmation).
  - Google + Apple OAuth buttons.
  - Styled with shadcn + theme.
- **Acceptance:** New user can sign up and is redirected to `/onboarding`.

### T3.5 Onboarding: team setup
- **What:** `app/(auth)/onboarding/page.tsx` — three-step form: team name, color pickers, logo library grid.
  - Uses `react-hook-form` + zod schema in `src/lib/contracts/profile.ts`.
  - Calls `completeOnboarding` Server Action on submit.
- **Acceptance:**
  - Team name uniqueness enforced (409 on duplicate).
  - On success, user lands at `/lineup` (temporary placeholder).
- **Spec refs:** UI/UX spec §6.1; API spec §3.1.

### T3.6 `completeOnboarding` Server Action
- **What:** `src/app/actions/profile.ts` — action that inserts `profile`, `manager_account`, `user_season_state`, 10 starter Bronze cards, 500 coins, 2 tokens.
- **Wraps SQL function** `onboard_user(user_id, team_name, color1, color2, logo_id)`.
- **Acceptance:**
  - Single transaction.
  - Starter bundle players drawn from a curated list seeded in `economy_config` (or hardcoded in the function for launch).
  - Returns `{ ok, data }` or `{ ok, error }` per convention.
- **Spec refs:** API spec §3.1; gameplay spec §9.

### T3.7 App shell: header + sidebar + profile drawer
- **What:** `app/(app)/layout.tsx` with:
  - **Header:** team logo + name (left); coin balance + Daily Pack indicator + Manager Level + Profile avatar (right).
  - **Sidebar:** 6 items (Lineup, Collection, Shop, Vault, Milestones, Leaderboards). Active state + hover.
  - **Profile drawer:** slides in on avatar click; shows Manager Level, career stats, team customization link, sign out.
- **Acceptance:** All nav items present. Sign-out routes back to `/signin`.
- **Spec refs:** UI/UX spec §3.

### T3.8 Placeholder pages for all 6 nav items
- **What:** Stubs for each: Lineup, Collection, Shop, Vault, Milestones, Leaderboards. Each renders a heading + "Coming in Phase X" note.
- **Acceptance:** Clicking each nav item loads the correct stub.

---

## M4 — BallDontLie Ingest Foundation (Day 11–14)

### T4.1 BDL client + provider abstraction
- **What:** `src/lib/mlb/client.ts` (singleton `BalldontlieAPI`), `src/lib/mlb/provider.ts` (MLBDataProvider interface + default `BallDontLieProvider`), `src/lib/mlb/retry.ts` (`withBdlRetry` helper).
- **Acceptance:** All BDL access flows through the provider. Unit tests with a mock provider pass.
- **Spec refs:** BDL integration §4, §9.

### T4.2 Cursor pagination helper
- **What:** Generic `paginate()` async generator in `src/lib/mlb/paginate.ts`.
- **Acceptance:** Unit test with fixture confirms pagination iterates correctly.
- **Spec refs:** BDL integration §4.

### T4.3 Cron: daily roster sync
- **What:** `app/api/cron/bdl-roster-sync/route.ts`. Calls `bdl.mlb.getActivePlayers()` paginated; upserts into `player` by `bdl_player_id`. Registers in `vercel.json` to run 04:00 ET daily.
- **Acceptance:** Manual trigger (with `CRON_SECRET` header) populates `player` table.
- **Spec refs:** API spec §5.1; BDL integration §7.

### T4.4 Cron: daily games pre-fetch
- **What:** `app/api/cron/bdl-games-prefetch/route.ts`. Calls `bdl.mlb.getGames({ dates: [today] })`; upserts into `game`.
- **Acceptance:** After run, `game` table has today's MLB games.
- **Spec refs:** API spec §5.3.

### T4.5 Cron: daily injuries sync
- **What:** `app/api/cron/bdl-injuries-sync/route.ts`. Calls `bdl.mlb.getPlayerInjuries()`; updates `player.status` to `il` / `active`.
- **Acceptance:** Players on IL are flagged.
- **Spec refs:** API spec §5.2.

### T4.6 Player photo sync (stubbed)
- **What:** `app/api/cron/bdl-photo-sync/route.ts` scaffolded but leaves `photo_url` null for now. Placeholder avatar component renders when null.
- **Acceptance:** Empty sync run completes; UI falls back gracefully.
- **Spec refs:** API spec §5.6; UI/UX spec §4.4.

### T4.7 Webhook receiver
- **What:** `app/api/webhooks/balldontlie/mlb/route.ts`.
  - Reads raw body; verifies HMAC-SHA256 signature against `{timestamp}.{rawBody}` with `BDL_WEBHOOK_SECRET`.
  - Rejects timestamps older than 5 min (replay protection).
  - Dedupes via `webhook_delivery.delivery_id`.
  - Dispatches by `event_type` to handler (initial handlers: `mlb.game.started`, `mlb.game.ended` — update `game.status`, insert `game_event`).
  - Always returns 200 unless signature fails (401).
- **Acceptance:**
  - Unit test with a known-good signature passes.
  - Unit test with a known-bad signature returns 401.
  - Duplicate delivery_id returns 200 without re-processing.
- **Spec refs:** BDL integration §5.

### T4.8 Local webhook testing via ngrok
- **What:** Document ngrok setup in `docs/runbook.md`. Point BDL dev webhook URL at the ngrok tunnel. Trigger a real event and confirm end-to-end.
- **Acceptance:** At least one real webhook processed end-to-end into `game_event`.

### T4.9 Webhook retry cron
- **What:** `app/api/cron/webhook-retry/route.ts`. Processes `webhook_failed` rows with `retry_count < 5` every 5 min.
- **Acceptance:** Failed webhook test (e.g. unknown event_type) lands in `webhook_failed`; retry cron processes it.
- **Spec refs:** API spec §5.7.

---

## M5 — Core Card Loop (Day 15–21)

### T5.1 `Card` component (Medium size)
- **What:** `src/components/card/Card.tsx` implementing the anatomy in UI/UX spec §4 — photo-hero, tier frame, name, stats footer, token slot, status pills.
- **Tier frame CSS:** Bronze, Silver, Gold, Diamond per §4.5 — subtle chrome, not jewelry.
- **Acceptance:**
  - All 4 tiers render correctly in a Storybook page.
  - Photo fallback (silhouette + number) works when `photoUrl` is null.
  - Hover state: 2px lift + 4% brightness, action tray appears.
- **Spec refs:** UI/UX spec §4.

### T5.2 `CardDetailView` component with tabs
- **What:** `src/components/card/CardDetailView.tsx` — Overview / Token Stats / Game Log tabs.
  - Overview: tier progress bar, contract, extend button, quick-sell button.
  - Token Stats: placeholder (populated in later phase).
  - Game Log: placeholder.
- **Acceptance:** Opens on card click from Collection page.
- **Spec refs:** UI/UX spec §5.3.

### T5.3 Collection page
- **What:** `app/(app)/collection/page.tsx` — grid view with right-rail filters.
  - Filters: position, tier, status, contract remaining, applied token.
  - Sort: tier, FP, acquisition date, contract remaining, name.
  - Search by player name.
  - Collection stats panel (X/100 used, tier breakdown).
- **Server component** for initial load; **client component** for filter state and search.
- **Acceptance:** Filters narrow results instantly; near-cap warning appears at ≥95%.
- **Spec refs:** UI/UX spec §5.2.

### T5.4 `quickSellCard` Server Action
- **What:** `src/app/actions/cards.ts` — exports `quickSellCard({ cardId, idempotencyKey })`.
- **Wraps SQL function** `quick_sell_card(card_id)` which deletes card + writes coin_transaction + updates user_season_state.coins atomically.
- **Acceptance:**
  - Test: card owned + no token → success.
  - Test: card has applied token → `TOKEN_APPLIED` error.
  - Test: duplicate idempotency key → same result.
- **Spec refs:** API spec §3.3.

### T5.5 `extendCardContract` Server Action
- **What:** `extendCardContract({ cardId, plays, idempotencyKey })`.
- **Wraps SQL function** `extend_card(card_id, plays)` which computes cost from `economy_config` tier + extension count escalator, debits coins, extends plays, clears `is_expired`.
- **Acceptance:**
  - Cost matches `economy_config` schedule.
  - Insufficient coins → `INSUFFICIENT_COINS` error.
- **Spec refs:** API spec §3.3; gameplay spec §5.4.

### T5.6 Extension modal UX
- **What:** `src/components/card/ExtendContractModal.tsx` — option picker (+5/+10/+15), cost preview, confirm.
- **Acceptance:** Preview correctly reflects escalator (`+50% · ext. #N` badge).
- **Spec refs:** UI/UX spec §4.13.2.

### T5.7 Quick-sell confirmation modal
- **What:** `src/components/card/QuickSellModal.tsx` — confirmation dialog for Silver+; warning for Diamond.
- **Acceptance:** Dissolve animation plays; coin counter in header ticks up.
- **Spec refs:** UI/UX spec §4.13.1.

### T5.8 Shop page
- **What:** `app/(app)/shop/page.tsx` — three pack cards side by side (Daily, Standard, Premium) with buy / claim actions.
- **Acceptance:**
  - Daily Pack shows countdown when already claimed.
  - Standard / Premium disabled when user can't afford.
- **Spec refs:** UI/UX spec §5.4.

### T5.9 `openPack` Server Action + `open_pack` SQL function
- **What:** `src/app/actions/packs.ts` — `openPack({ packType, idempotencyKey })`.
- **SQL function** `open_pack(user_id, pack_type)`:
  - Reads pack config from `economy_config` (size, player-tier weighting).
  - Debits coins (if paid).
  - Draws N cards with weighted random.
  - Auto-quick-sells duplicates, credits coins.
  - Draws tokens at per-pack-type rate.
  - Inserts `pack_opening`, `card`, `token`, `coin_transaction`.
- **Acceptance:**
  - Test: Daily claim respects 24h window.
  - Test: Duplicate pull auto-sells and increments coin balance.
  - Test: `COLLECTION_AT_CAP` returned when cap reached (next task handles overflow UI).
- **Spec refs:** API spec §3.2; gameplay spec §4, §6.

### T5.10 Pack-opening reveal modal
- **What:** `src/components/pack/PackOpenerModal.tsx` — sequential reveal (tier-colored flash, dupe quick-sell stamp, Star-pull celebration). Port + rewrite from the prototype's existing `PackOpener`.
- **Acceptance:**
  - Each card reveals with tier animation.
  - Dupes show `SOLD` stamp + coin counter tick.
  - Reduced-motion honored.
- **Spec refs:** UI/UX spec §6.2, §4.13.4.

### T5.11 Collection cap overflow flow
- **What:** When `openPack` returns `COLLECTION_AT_CAP`, show inline decision UI: "pick cards to quick-sell to make room" OR "sell the new card instead." Implements `resolveCapOverflow` action.
- **Acceptance:** User can resolve without losing the pull.
- **Spec refs:** API spec §3.2; UI/UX spec §8.2.

### T5.12 Economy config exposure
- **What:** `app/api/config/economy/route.ts` — public read of active `economy_config`, trimmed to client-relevant fields; cache headers.
- **Acceptance:** Returns 200; data shape stable; cache hits at the edge.
- **Spec refs:** API spec §4.1.

---

## M6 — Hardening + First Deploy (Day 22–25)

### T6.1 Playwright: critical path E2E
- **What:** `tests/e2e/critical-path.spec.ts` covering:
  1. Sign up → onboarding → land on Lineup.
  2. Visit Shop → open Standard Pack → see reveal.
  3. Visit Collection → see cards.
  4. Click a card → see Card Detail.
  5. Quick-sell a card → coin balance updates.
  6. Extend a contract → plays increase.
- **Acceptance:** All steps pass in a dev Vercel preview; run in CI.

### T6.2 Smoke-test migrations against `draftdeck-prod`
- **What:** Apply all migrations to prod Supabase project. Seed `economy_config` and first `season`.
- **Acceptance:** Prod DB matches dev schema.

### T6.3 PostHog event instrumentation
- **What:** Fire events for: `signed_up`, `completed_onboarding`, `pack_opened`, `card_quick_sold`, `contract_extended`, `collection_viewed`.
- **Acceptance:** Events appear in PostHog for manual test actions.

### T6.4 Sentry alert rules
- **What:** Configure alert rules for: any 5xx in a Route Handler; Server Action throwing; BDL auth failure; webhook signature failure.
- **Acceptance:** Rules active; test by forcing an error.

### T6.5 Vercel cron production enablement
- **What:** Merge `vercel.json` with all 6 crons registered (roster sync, games prefetch, injuries, photo sync, webhook retry, login streak eval — latter two scaffolded but not functionally required yet).
- **Acceptance:** Vercel Cron dashboard shows schedules.

### T6.6 Production smoke test
- **What:** Go through the critical path manually on `draftdeck.com` (or the Vercel deploy URL).
- **Acceptance:** Everything works. Sentry + PostHog receive events. BDL daily cron ran overnight.

### T6.7 Phase 1 retrospective
- **What:** `docs/adr/ADR-0008_phase-1-retro.md` — what went well, what surprised, what changed vs. spec, what's ready for Phase 2.
- **Acceptance:** ADR written; Phase 2 roadmap planning session scheduled.

---

## What's NOT in Phase 1 (scope guard)

Do not build any of these in Phase 1 without an explicit decision to expand scope:

- Lineup building UI (diamond layout, drag-drop from bench, token application in-lineup).
- Live contest view (real-time score updates, events feed).
- Contest entry / submission flow.
- Vault page or vault ceremony.
- Milestones dashboard.
- Leaderboards.
- Public profile pages.
- Tier-up cut-in animation.
- Auto-sub / late-swap.
- Notification system (Daily Pack ready push, tier-up push).
- Admin panel.
- Mobile web responsive polish.
- Sound design.

These are Phases 2–6. Planned separately. Do not let scope creep eat Phase 1.

---

## Dependencies Between Tasks

```
M1 (scaffold) ───► M2 (DB) ───► M3 (auth + shell) ───► M5 (core card loop)
                        ├──────► M4 (BDL ingest) ───┘
                        │
                        └──────► M6 (hardening/deploy)
```

M4 can run in parallel with M3 once M2 is complete. M5 depends on M3 (auth needed to own a card) and M4 (player data needed for pack draws — though initial seed can be manual).

---

## Per-Task Checklist (use this for every task)

- [ ] Task read; spec section(s) referenced.
- [ ] Branch created: `feat/T<id>-<short-desc>`.
- [ ] Code written; follows conventions in CLAUDE.md §6.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` passes.
- [ ] If UI: renders correctly against spec mocks.
- [ ] If DB: migration applied locally; RLS policies tested; smoke test in `tests/integration/`.
- [ ] If API/Action: zod contracts exist in `src/lib/contracts/`; error codes from catalog.
- [ ] Idempotency key on destructive mutations.
- [ ] Sentry instrumentation + PostHog event.
- [ ] PR opened with `[T<id>] <title>` format; references spec sections.
- [ ] PR merged; task marked complete in roadmap.

---

## Estimated Team Shape

Solo-founder-friendly. If a designer is parallel-working on card frame artwork, pack art, logo library, sound design — they don't block Phase 1 (placeholder/minimal assets are fine). If a second engineer is available, they can own M4 (BDL ingest) while you own M2–M3.

---

## After Phase 1 — Next Phases Preview

- **Phase 2 — Lineup + Tokens (5–7 days).** Diamond layout, bench drawer, drag-drop, token application, auto-sub config, submit flow.
- **Phase 3 — Live contests (3–5 days).** Live state transformation, Supabase Realtime, event feed, live scoring reconciliation.
- **Phase 4 — Vault + Milestones + Leaderboards (4–6 days).** Vault timeline, milestone progress bars, 4-way leaderboards, public profiles.
- **Phase 5 — Seasonal flows (3–5 days).** Vault ceremony, Opening Day, season close cron.
- **Phase 6 — Hardening for public launch (1–2 weeks).** Visual polish, accessibility audit, load testing, E2E coverage expansion, pre-launch checklist.

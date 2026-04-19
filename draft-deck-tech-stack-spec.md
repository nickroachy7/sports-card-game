# Draft Deck — Tech Stack Specification (v0.1)

**Companion to:** `draft-deck-gameplay-spec.md` (v0.2) and `draft-deck-ui-ux-spec.md` (v0.1).
**Status:** Technology choices locked, migration plan + data flow described, implementation-level detail deferred to engineering kickoff.
**Scope:** Architecture shape, chosen technologies per layer, migration from the existing Vite prototype, data pipelines, real-time, scheduled jobs, observability, local development.

---

## 1. Executive Summary

Draft Deck is a full-stack TypeScript app built on **Next.js 15 (App Router)** with **Supabase** providing Postgres, Auth, Storage, and Realtime. The frontend uses **Tailwind CSS 4**, **Radix/shadcn primitives**, **motion** for animation, and **react-dnd** for card/token drag-drop — all inherited from the existing prototype. **Drizzle ORM** provides type-safe database access; **TanStack Query** handles client-side mutations and caching alongside Next.js Server Components. **BallDontLie API** supplies MLB player and stat data at launch. **Vercel** hosts the app; **Vercel Cron + Supabase Edge Functions** run scheduled work. **Sentry + PostHog** cover observability. **Vitest + Playwright + Biome** handle testing and code quality. **pnpm + Supabase CLI + Docker** is the local dev setup.

**Launch scope is F2P-only.** Cash-entry DFS contests, Stripe, KYC, and associated legal apparatus are fully deferred.

### 1.1 Stack at a glance

| Layer                  | Choice                                                              |
|------------------------|----------------------------------------------------------------------|
| Framework              | Next.js 15 (App Router)                                              |
| Language               | TypeScript                                                           |
| Styling                | Tailwind CSS 4 + Radix/shadcn + `theme.css` custom properties        |
| Animation              | motion (framer-motion)                                               |
| Drag-drop              | react-dnd + react-dnd-html5-backend                                  |
| Toasts                 | sonner                                                               |
| Icons                  | lucide-react                                                         |
| Forms                  | react-hook-form                                                      |
| Charts                 | recharts                                                             |
| Database               | Supabase Postgres                                                    |
| ORM / migrations       | Drizzle ORM + Supabase CLI                                           |
| Auth                   | Supabase Auth (email/password + OAuth; email confirmation disabled)  |
| Object storage         | Supabase Storage                                                     |
| Real-time              | Supabase Realtime (Postgres change subscriptions)                    |
| Server state / cache   | TanStack Query                                                       |
| Local UI state         | Zustand (or Context) for truly-local state only                      |
| External data          | BallDontLie API (MLB)                                                |
| Deployment (app)       | Vercel                                                               |
| Deployment (backend)   | Supabase (dev + prod projects)                                       |
| Scheduled jobs         | Vercel Cron (Next.js API routes) + Supabase Edge Functions + pg_cron |
| Testing                | Vitest (unit/integration) + Playwright (E2E)                         |
| Lint / format          | Biome                                                                |
| Error tracking         | Sentry                                                               |
| Product analytics      | PostHog (also handles feature flags)                                 |
| Notifications (launch) | In-app only (sonner). No web push. No transactional email.           |
| Admin tools (launch)   | Supabase Studio + SQL scripts                                        |
| Package manager        | pnpm                                                                 |
| Local dev              | Supabase CLI + Docker (local Postgres + Auth + Studio)               |
| Repo                   | Single repo, single Next.js app                                      |
| Environments           | `dev` + `prod` (two Supabase projects, Vercel preview + prod)        |

---

## 2. Current State (the existing Vite prototype)

The prototype lives in `src/` as a Vite 6 + React 18 + TypeScript app. Everything is client-side. There is no backend, no persistence, no routing (React Router 7 is installed but unused). `gameData.ts` contains a hardcoded array of 20 basketball cards used to drive the UI. State is held in `useState` inside `App.tsx` (hand, lineup, tokens, slotTokens, packsLeft, opener/carousel open flags, activeView).

Reusable assets to preserve:

- Component tree: `CardFront`, `CardBack`, `CardDetailView`, `CardHand`, `GameCard`, `LineupArea`, `LineupSlot`, `CourtLineup`, `PackOpener`, `PackCarousel`, `PackCard`, `TokenTray`, `TokenChip`, `CustomDragLayer`, `QuickActions`, `Sidebar`, `CollectionPage`, `figma/ImageWithFallback`, plus 38 Radix/shadcn UI primitives in `components/ui/`.
- Type system: `Card`, `Token`, `DragItem`, `TokenDragItem`, enums, constants (`LINEUP_POSITIONS`, `RARITY_COLOR`, `TOKEN_META`, `CARD_DIMS`).
- Style layer: `theme.css` with CSS custom properties for light/dark, Tailwind 4 via `@tailwindcss/vite`.
- Third-party libraries: all the ones in §1.1 are already in `package.json`.

What must change for the Next.js rebuild:

- Basketball-oriented components (`LineupArea`, `CourtLineup`, `LINEUP_POSITIONS`) must be rewritten for MLB's 10-slot diamond layout.
- Rarity concept (`Rarity`, `RARITY_COLOR`, OVR rating) must be replaced by tier (Bronze/Silver/Gold/Diamond) earned via career FP.
- `gameData.ts` and all `useState`-based client state must be replaced by Supabase queries + Drizzle types + TanStack Query caching.
- Vite-specific bits (`vite.config.ts`, `figma:asset/` resolver, `src/main.tsx` entry) are replaced by Next.js App Router conventions.
- MUI 7 is redundant against Radix/shadcn and is removed.
- React Router 7 is removed; Next.js routing replaces it.

---

## 3. Target Architecture

### 3.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                             USER (Browser)                          │
│  React + Next.js App Router · Tailwind · Radix · motion · react-dnd │
└───────────────┬──────────────────────────────────────┬──────────────┘
                │ HTTPS (server components + API)       │ WebSocket
                │                                       │ (Supabase Realtime)
                ▼                                       ▼
┌─────────────────────────────────────────┐   ┌────────────────────────┐
│           Next.js 15 (on Vercel)        │   │   Supabase Realtime    │
│                                         │   │  (Postgres changes)    │
│  ├─ React Server Components             │   └────────┬───────────────┘
│  ├─ API Route Handlers                  │            │
│  ├─ Middleware (auth, rate limit)       │            │
│  └─ Vercel Cron endpoints               │            │
└──────────────┬─────────────────┬────────┘            │
               │                 │                     │
               │ Drizzle         │ Supabase JS          │
               ▼                 ▼                     │
       ┌──────────────────────────────────────┐        │
       │         Supabase (dev / prod)        │◀───────┘
       │                                      │
       │  ├─ Postgres (schema, RLS)           │
       │  ├─ Auth (email/pw + OAuth)          │
       │  ├─ Storage (player headshots)       │
       │  ├─ Realtime (WS broadcaster)        │
       │  └─ Edge Functions (pg_cron targets) │
       └──────────────────────────────────────┘
                         ▲
                         │ scheduled ingest
                         │
              ┌────────────────────┐
              │  BallDontLie API   │
              │  (MLB rosters,     │
              │   games, stats)    │
              └────────────────────┘
```

### 3.2 Rendering strategy

Default posture is **server components first**:

- **Public profile, Vault, Leaderboards, Milestones dashboard** — render on the server for SEO, share-ability, and fastest TTFB. Data is fetched via Supabase SSR client in a React Server Component.
- **Collection, Card Detail (read)** — server components for initial data; mutations (quick-sell, extend contract, apply token) are client components backed by TanStack Query.
- **Lineup page, Live Contest view, Pack Opening, Token application** — client components. They need drag-drop, realtime subscriptions, animations, and optimistic mutations.
- **Onboarding, Vault Ceremony, Opening Day flows** — client components with server-component shells.

### 3.3 Authentication flow

Supabase Auth handles identity. At launch:

- **Methods enabled:** email + password, plus OAuth (Google, Apple).
- **Email confirmation: disabled.** Users sign up and are immediately signed in. No confirmation email is sent.
- **Password reset: disabled at launch.** Users who forget a password must sign back in with OAuth, or go through a manual support path. This is a known constraint; re-enable with an email provider (Resend) in a later release.
- **Session strategy:** Supabase issues a JWT that's stored in an HTTP-only cookie via `@supabase/ssr`. Server components read the session via `createServerClient`; client components use `createBrowserClient`. Middleware verifies the session on protected routes.
- **Row-level security (RLS):** every table has RLS enabled. Policies bind row access to `auth.uid()` so users can only read/write their own cards, tokens, contest entries, etc. Public surfaces (profiles, vaults, leaderboards) have explicit `SELECT` policies for `anon` / `authenticated` roles.

### 3.4 Data access layer

Three patterns coexist:

1. **Drizzle ORM** is the canonical data layer for server-side code (Server Components, API routes, Edge Functions). Schema is defined in TypeScript; queries are type-safe. Example: `db.select().from(cards).where(eq(cards.user_id, userId))`.
2. **Supabase JS client** is used for auth session handling (`@supabase/ssr`), Realtime subscriptions (client side), and Storage operations (photo uploads/fetches).
3. **TanStack Query** on the client orchestrates mutations and cache. Server Components pass initial data via props, and TanStack Query's `initialData` hydrates the client cache. Mutations (`useMutation`) call API routes, which use Drizzle server-side.

Why two query mechanisms: Drizzle is strict-typed and server-only, which is exactly what we want for secure server-side queries. The Supabase JS client is the right fit for Realtime and for simple browser-side fetches that don't need Drizzle's types (we use generated types from Supabase CLI for those).

---

## 4. Database Schema Strategy

### 4.1 Where schema lives

Schema is defined in Drizzle TypeScript files under `src/lib/db/schema/`. The Supabase CLI is used to:

- Apply migrations (`supabase db push`) to dev / prod projects.
- Generate Supabase type definitions for client-side `supabase-js` calls.
- Manage local Docker Postgres for development.

Drizzle migrations are generated from the TypeScript schema via `drizzle-kit generate`, then applied via the Supabase CLI (or Drizzle's own migrator for local dev).

### 4.2 Core tables (from gameplay spec §20)

- `player` — canonical MLB player reference (synced from BallDontLie).
- `card` — one row per card instance owned by a user.
- `token` — one row per token instance owned by a user.
- `pack_opening` — audit log of pack opens.
- `contest_entry` — per-contest per-user entry (lineup, tokens, results, rewards).
- `team_milestone_state` — per-user, per-season counters.
- `manager_account` — per-user lifetime data (Manager Level, team identity, career stats).
- `vault_entry` — per-vaulted-card, per-season record.
- `season` — season metadata (year, start/end dates, status).
- `notification` — optional: persist in-app notifications so they show on next login if the session was closed.

Secondary / support tables (not yet in the gameplay spec but implied):

- `profile` — user's public-facing identity (team name, colors, logo id). 1:1 with `manager_account` but may split for RLS simplicity.
- `game` — per-MLB-game record, with status (scheduled / live / final / postponed / suspended) and a foreign key to the BallDontLie game id.
- `game_event` — play-by-play events ingested from BallDontLie. Driven by live stat pulls. Used by live contest scoring.
- `contract_extension` — audit log of contract extensions (card id, plays added, coins spent, tier at time, extension count, timestamp).
- `token_application` — audit log of token applications (token id, card id, contest id, triggered y/n, bonus FP awarded).

### 4.3 Schema conventions

- All PKs are UUID v7 (lexicographically sortable, index-friendly). Drizzle's `uuid` type with default `gen_random_uuid()` works; migrate to v7 when Postgres support lands.
- All tables have `created_at` / `updated_at` timestamps.
- RLS on every table, no exceptions. Public `SELECT` policies for read-public tables; scoped `ALL` policies elsewhere.
- Foreign keys cascade on delete for user-owned data where appropriate; restrict on shared references (`player`, `game`).
- Indexes on: `card.user_id`, `card.player_id`, `card.is_expired`, `card.is_vaulted`; `contest_entry.user_id`, `contest_entry.contest_id`; `game_event.game_id`; `token_application.card_id`. Add as query patterns solidify.

### 4.4 Seasons

A `season` table holds the canonical season reference. Every seasonal record (`card.season_tag`, `contest_entry.season_tag`, `team_milestone_state.season_tag`, `vault_entry.season_tag`) references it. When a season ends (after the World Series), a transition job runs that marks the season `status = 'closed'` and triggers per-user vault ceremonies.

---

## 5. MLB Data Ingest Pipeline

BallDontLie is the external data source. **GOAT tier ($39.99/mo, 600 req/min) is committed.**

> ⚠️ **This section is superseded by `draft-deck-balldontlie-integration.md`** for the live-ingest architecture. The integration doc replaces the "poll every 30s" design described below with a webhook-driven receiver backed by REST fallbacks. Keep both docs in sync; the integration plan is canonical for BallDontLie specifics.

Coverage for MLB is confirmed to include rosters, teams, games, event-level webhook notifications (per-at-bat), and box-score stats. Remaining verification items (pitcher granularity on `mlb_get_stats`, full webhook event catalog, MLBAM ID on player responses) are listed in the integration doc §15.

### 5.1 Scheduled ingest jobs

Four scheduled jobs handle data ingest:

1. **Daily roster sync** (04:00 ET, one time per day).
   - Pulls all active MLB 40-man rosters from BallDontLie.
   - Upserts into `player`.
   - Detects status changes (IL, DFA, call-ups, trades) and writes appropriate flags.
   - Emits domain events for cards whose players changed status (for notifications and card-state updates).
   - Runs as a Vercel Cron → Next.js API route handler → Drizzle writes.

2. **Daily games pre-fetch** (06:00 ET).
   - Pulls the day's scheduled games from BallDontLie.
   - Upserts into `game` with status = `scheduled`, start time, teams.
   - Sets up the day's contest surfaces.

3. **Live game ingest** (polled during live windows, e.g. every 30s from first pitch through final).
   - Polls BallDontLie for current events / box scores on all live games.
   - Writes play-by-play to `game_event`.
   - Triggers a Postgres function that recomputes FP for every `contest_entry` containing a card whose player is in this game.
   - Emits Realtime events so client lineup views update live.
   - Runs via Vercel Cron hitting a `/api/cron/live-ingest` route that checks which games are live and pulls their events.

4. **Player photo sync** (weekly, Sunday 02:00 ET).
   - For every player in `player` without a current Supabase Storage URL, fetch headshot from BallDontLie (or fallback CDN) and upload to Supabase Storage with a stable key (`players/{player_id}/headshot.jpg`).
   - Cache-bust when a player's photo metadata changes.
   - Never hotlink to external URLs at the card level.

### 5.2 Provider abstraction

A thin provider interface (`src/lib/mlb/provider.ts`) wraps BallDontLie so the app doesn't depend on it directly:

```
interface MLBDataProvider {
  fetchActiveRosters(): Promise<RosterSnapshot[]>;
  fetchGamesByDate(date: Date): Promise<GameSummary[]>;
  fetchLiveEvents(gameId: string): Promise<GameEvent[]>;
  fetchPlayerPhoto(playerId: string): Promise<Buffer | null>;
}
```

Swapping to MLB Stats API, Sportradar, or Stats Perform later is an implementation change in one file.

### 5.3 Rate limiting & error recovery

- BallDontLie has per-tier request limits. Track usage via Sentry instrumentation; alert before hitting caps.
- All ingest jobs retry transient failures with exponential backoff. Persistent failures escalate to Sentry.
- Live ingest must be idempotent — events are keyed by `(game_id, event_id)` from the provider; duplicates are dropped on upsert.

---

## 6. Real-time Architecture

### 6.1 Supabase Realtime subscriptions

Clients use Supabase Realtime to watch:

- `contest_entry` rows belonging to the current user (for live contest score + rank updates).
- `game_event` rows for the game IDs the user's current lineup is exposed to (for the live events feed).
- `card` rows updated recently for the current user (for tier evolution, status flag changes).

Subscriptions are set up in client components via `supabase.channel(...).on('postgres_changes', ...)`. On change, the handler invalidates the relevant TanStack Query key to trigger a refetch or merge, keeping TanStack Query as the single cache.

### 6.2 Write path

When live ingest (§5.1.3) writes a new `game_event`:

1. A Postgres function recalculates affected `contest_entry.final_score` (or `live_score`).
2. Both inserts fire Realtime events.
3. Clients receive both events and update their views.

### 6.3 Fallback

If a Realtime subscription drops (network, idle), the client falls back to polling the same data via TanStack Query's `refetchOnWindowFocus` and `refetchInterval` for the live contest view (5s interval). When the socket reconnects, polling drops back to default.

---

## 7. Scheduled Jobs Catalog

All jobs are defined in the repo under `src/app/api/cron/` (Vercel Cron) or `supabase/functions/` (Edge Functions + pg_cron).

| Job                            | Schedule                 | Home                     | Notes                                           |
|--------------------------------|--------------------------|--------------------------|--------------------------------------------------|
| Daily roster sync              | 04:00 ET                 | Vercel Cron → API route  | Upserts `player` from BallDontLie                |
| Daily games pre-fetch          | 06:00 ET                 | Vercel Cron → API route  | Upserts `game` for today                         |
| Webhook receiver (BDL)         | continuous (inbound HTTP)| Next.js API route        | BallDontLie pushes MLB events — primary live path |
| Game repair cron               | every 10 min (during games) | Vercel Cron → API route | Reconciles if webhook delivery drops              |
| Post-game box score pull       | on `mlb.game.ended`      | Next.js API route        | Pulls pitcher box-score stats via `mlb_get_stats` |
| Player photo sync              | Sunday 02:00 ET          | Vercel Cron → API route  | Updates Supabase Storage                         |
| Daily Pack reset               | 00:00 UTC                | Supabase Edge Function   | Resets per-user `daily_pack_claimed_at` flag     |
| Login streak evaluation        | 04:00 ET                 | Supabase Edge Function   | Decrements or resets streaks for users who missed yesterday |
| Team milestone evaluation      | Triggered on score write | Postgres trigger         | Evaluates thresholds when FP is added             |
| Contest resolution             | On game final            | Postgres function        | Finalizes `contest_entry.final_score`, pays out coins, consumes contract plays |
| Opening Day bundle distribution| Opening Day 06:00 ET     | Vercel Cron → API route  | Grants the 10-card bundle to every user           |
| Season end / vault trigger     | Day after WS final       | Vercel Cron → API route  | Marks season closed; opens vault ceremony per user |

Vercel Cron has function time limits (default 60s on Hobby, 300s on Pro). Long-running jobs (season end, Opening Day distribution for many users) are split into queued batches. When user count scales, consider moving to Inngest or a dedicated worker.

---

## 8. Testing Strategy

### 8.1 Vitest (unit + integration)

- Target: business logic, scoring math, contract-extension cost calculations, token-trigger evaluations, milestone threshold checks.
- Runs on PR in CI.
- Mocks Drizzle via in-memory Postgres (pg-mem) or by faking at the repository interface.

### 8.2 Playwright (E2E)

- Target: critical user flows only.
- Flows in the launch suite:
  - Sign up + onboarding (team setup + starter bundle + tutorial contest).
  - Open a Standard Pack + handle a duplicate quick-sell.
  - Build a lineup + apply a token + submit.
  - Observe a scripted live contest resolve (using a stubbed BallDontLie response).
  - Quick-sell a card manually (with confirm dialog).
  - Extend a contract.
- Runs on main branch and per-PR previews against a seeded test database.

### 8.3 Visual regression

- Per §4.14 of the UI/UX spec, card rendering has a matrix of 168 snapshot combinations (tier × state × size × motion preference).
- Use Percy or Chromatic integrated with Storybook for component snapshots.
- Ship v1 with snapshots on card, lineup slot, pack reveal, and tier-up cut-in; expand over time.

### 8.4 Lint & format

- Biome (via `biome check` / `biome format`) runs as a pre-commit hook and in CI.
- Enforces TypeScript strict mode, no unused imports/variables, formatting.

---

## 9. Deployment & Environments

### 9.1 Two-environment setup

- **dev** — Supabase project `draftdeck-dev`. Vercel preview deployments per pull request use this DB. All migrations are applied to dev first.
- **prod** — Supabase project `draftdeck-prod`. Vercel production deployment from `main`. Migrations applied on merge-to-main after preview verification.

Environment variables are managed in Vercel's dashboard (encrypted). Local `.env.local` uses a `.env.example` template checked into the repo.

### 9.2 Migration workflow

1. Developer updates Drizzle schema in `src/lib/db/schema/*`.
2. Runs `pnpm db:generate` to produce SQL migration files under `supabase/migrations/`.
3. Applies locally: `pnpm db:push` (uses Supabase CLI against local Docker).
4. Commits schema + migration; opens PR.
5. Vercel preview deploys; migration auto-applies to `draftdeck-dev` via CI.
6. Merge to main; migration auto-applies to `draftdeck-prod` via CI.

### 9.3 CI/CD

- **GitHub Actions** runs on every PR and push to main.
- PR pipeline: install → biome lint/format check → typecheck → vitest unit + integration → drizzle schema check → Playwright preview tests against Vercel preview.
- Main pipeline: additional `supabase db push` to prod; Vercel auto-deploys on merge.
- Secrets managed via GitHub Actions secrets + Vercel env vars.

### 9.4 Rollback strategy

- Vercel rollback for app-level bugs is instant (previous deployment promoted).
- Database rollback is **not automatic**. Every migration must be reversible; production migrations should not drop columns or tables without a deprecation window. Destructive migrations require explicit approval and are gated behind a manual step.
- Supabase has daily backups on all paid tiers; dev is disposable.

---

## 10. Observability

### 10.1 Sentry — errors & performance

- Frontend SDK in the Next.js app (client + server).
- Source maps uploaded during Vercel build.
- Custom context on every error: `user_id`, `season_tag`, active view, relevant query keys.
- Performance traces on: lineup submit, pack open, contest resolution cron, MLB ingest cron.

### 10.2 PostHog — product analytics + feature flags

- Events instrumented for: signup, onboarding step complete, pack open (by type), card quick-sold, contract extended, token applied, contest entered, contest resolved, tier-up reached, vault card selected, profile viewed.
- Funnels for: signup → first pack open → first contest submitted → first contest resolved → return day 2.
- Retention cohorts by signup week.
- Feature flags for: enable experimental UI, gated access to new pack types, A/B copy tests.

### 10.3 Vercel logs

- Default log retention for server-side request logs, function invocations, cron job runs.
- Grep + Axiom integration (optional) for structured query on production incidents.

---

## 11. Security

### 11.1 Row-Level Security (RLS)

Every table in Postgres has RLS enabled. Policies:

- User-owned tables (`card`, `token`, `contest_entry`, `manager_account`, `team_milestone_state`, `vault_entry`, `pack_opening`, `contract_extension`, `token_application`): `auth.uid() = user_id` for `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Public read tables (`profile`, `vault_entry` joined to `profile`, `manager_account.public_stats`, leaderboard views): `SELECT` for `anon` and `authenticated`; writes only via RLS-protected service functions.
- Reference tables (`player`, `game`, `game_event`, `season`): read for all; write only via service role (used by cron jobs).

### 11.2 Rate limiting

- Edge middleware on API routes with a per-user + per-IP rate limit (Upstash Redis backed, cheap).
- Pack open, contest submit, contract extend, quick-sell all limited to sane per-minute caps to block abuse.
- Cron endpoints are protected by a shared secret (Vercel Cron header) + RLS service role check.

### 11.3 Secrets management

- Runtime secrets in Vercel env vars + GitHub Actions secrets.
- Never commit secrets to the repo; `.env.example` has keys only, no values.
- Supabase service role key is server-only and used exclusively in cron jobs + admin operations; never exposed to the client.

### 11.4 Auth hardening

- Enforce strong password (min 8 chars, complexity check) for email/password signups.
- OAuth providers (Google, Apple) are the default recommended path.
- Session cookies: HTTP-only, Secure, SameSite=Lax.
- CSRF protection on all mutation endpoints (Next.js middleware enforces double-submit cookie).

---

## 12. Local Development

### 12.1 Prerequisites

- Node 20 LTS.
- pnpm 9+.
- Docker (for Supabase CLI local stack).
- Supabase CLI (`brew install supabase/tap/supabase` on macOS).

### 12.2 First-run setup

```
git clone <repo>
cd draft-deck
pnpm install
supabase start         # boots local Postgres + Auth + Studio + Storage
pnpm db:push           # applies migrations to local DB
pnpm db:seed           # optional: seed test players + users
pnpm dev               # starts Next.js on localhost:3000
```

Local Supabase Studio is available at `http://localhost:54323` for browsing tables.

### 12.3 Working against the cloud dev project (optional)

Point `.env.local` at the `draftdeck-dev` Supabase project instead of local Docker when:

- Testing MLB data ingest against real BallDontLie responses.
- Debugging issues that don't reproduce locally.
- Collaborative feature work where teammates need shared data.

### 12.4 Package scripts (proposed)

- `pnpm dev` — Next.js dev server.
- `pnpm build` — Next.js production build.
- `pnpm start` — Next.js production server (local preview).
- `pnpm lint` — Biome check.
- `pnpm format` — Biome format.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — Vitest run.
- `pnpm test:watch` — Vitest watch.
- `pnpm e2e` — Playwright (against local Next.js).
- `pnpm db:generate` — Drizzle migration generator.
- `pnpm db:push` — apply migrations to local Supabase.
- `pnpm db:seed` — seed test data.
- `pnpm db:reset` — reset local Supabase (drop + re-migrate + seed).

---

## 13. Migration Plan (Vite → Next.js)

Approach: **fresh Next.js project, port components incrementally.**

### 13.1 Phase 1 — scaffold (1–2 days)

- Create a new Next.js 15 app at `app/` using `create-next-app --typescript --tailwind --app --use-pnpm`.
- Remove the redundant Vite entry (`src/main.tsx`, `vite.config.ts`, `index.html`) once Phase 2 is underway.
- Install the core dependency set: Supabase JS + SSR, Drizzle, TanStack Query, motion, react-dnd, sonner, lucide-react, react-hook-form, recharts, Radix primitives that are actually in use.
- Remove MUI 7 and any unused Radix primitives to keep the bundle lean.
- Set up Biome, Vitest, Playwright configs.
- Wire Sentry and PostHog SDKs (server + client).
- Wire Tailwind 4 with `theme.css` custom properties.
- Copy `components/ui/` shadcn primitives into the new app.

### 13.2 Phase 2 — schema + data (3–5 days)

- Author the Drizzle schema for every table in §4.
- Set up Supabase dev + prod projects; wire CI/CD.
- Write initial migrations + seed data.
- Stand up the BallDontLie provider stub with fake responses; gate it behind an env flag so tests and local dev don't hit the real API.

### 13.3 Phase 3 — auth + shell (2–3 days)

- Supabase Auth integration (email/password + Google + Apple OAuth). Email confirmation disabled.
- Protected middleware + server session reads.
- App shell: header (team identity + coins + Daily Pack + Manager Level + Profile drawer) + sidebar (6 nav items).

### 13.4 Phase 4 — Collection + Card Detail (3–5 days)

- Port `CardFront` → new photo-hero + tier frame anatomy (§4 of UI/UX spec).
- Build the Collection page (grid + right-rail filters).
- Build the Card Detail page (hero + tabbed info) with extend-contract, quick-sell flows.
- TanStack Query wiring for mutations; optimistic updates.

### 13.5 Phase 5 — Packs + Shop (3–5 days)

- Port `PackOpener` animation to match the UI/UX spec's sequential reveal + Star celebration.
- Build the Shop (3 pack SKUs + Daily claim).
- Pack-opening server-side logic (draw cards from `player` pool with designated-tier weighting; upsert into `card`).

### 13.6 Phase 6 — Lineup + Tokens (5–7 days)

- **This is the biggest rewrite.** The existing basketball `LineupArea` is replaced entirely with the MLB 10-slot diamond layout.
- Bench drawer, position-filtered.
- Token tray + drag-drop + apply/remove flows.
- Auto-sub configuration (Smart Auto / Manual Priority).
- Submit flow.

### 13.7 Phase 7 — Live Contest + Real-time (3–5 days)

- Live state transformation (diamond → list view).
- Supabase Realtime subscriptions.
- Live-events feed.
- Contest Final recap + tier-up cut-in.

### 13.8 Phase 8 — Vault + Milestones + Leaderboards (4–6 days)

- Vault page (season timeline).
- Milestones dashboard (progress bars + history feed).
- Leaderboards page (tab switcher, top 100, user rank).
- Public profile view.

### 13.9 Phase 9 — Seasonal flows (3–5 days)

- Vault Ceremony guided flow.
- Opening Day welcome flow.
- End-of-season cron job (dissolve, vault, recap email — if enabled later).

### 13.10 Phase 10 — hardening + launch prep (1–2 weeks)

- E2E Playwright coverage of the critical flows.
- Sentry + PostHog instrumentation audit.
- Load test the live-ingest job with simulated concurrent contests.
- Security audit (RLS, rate limits, auth flows).
- Admin SQL scripts for common ops tasks.

Total rough estimate: 6–10 weeks of focused solo engineering, depending on scope trims. Parallelizable with a designer working on card frame art, pack art, and logo library in §12 of the UI/UX spec.

---

## 14. Admin Tooling at Launch

Per the interview, launch uses **Supabase Studio + SQL scripts**. Concrete operational playbooks:

- **Seed / update the player pool:** roster sync handles this automatically daily. Manual overrides via Studio for edge cases (two-way player flag, DFA misread).
- **Adjust economy values:** token bonus values, contract extension pricing, Daily/Standard/Premium pack coin costs live in a `config` table (or `manager_account.economy_config_version` if we need versioning). Tune via SQL updates.
- **Moderate a team name:** direct UPDATE on `profile.team_name` to a placeholder + flag in a separate `moderation` table. User notified in-app on next login.
- **Grant coins / cards / tokens to a user:** SQL scripts with clear audit trail writes to a `manual_grants` log.
- **Close a season manually:** cron job can be triggered manually via Studio if the schedule-based trigger fails.
- **Inspect a user's state:** custom SQL views joined across `manager_account`, `card`, `contest_entry` for fast support responses.

Upgrade path: a `/admin` route in the Next.js app, gated by a `role` claim on the Supabase user, using the same Drizzle layer. Scheduled for post-launch.

---

## 15. Open Questions & Deferred Decisions

Numbered for reference.

1. ~~**BallDontLie live-play-by-play coverage**~~ — **RESOLVED**: confirmed via webhook event catalog (`mlb.batter.home_run`, `mlb.batter.hit`, `mlb.batter.strikeout`, `mlb.batter.walk`, `mlb.batter.hit_by_pitch`, `mlb.game.*`, `mlb.team.scored`, and 130+ total events). Implementation plan in `draft-deck-balldontlie-integration.md`. Open sub-items (full event catalog, pitcher-specific events, `mlb_get_stats` granularity) tracked in that doc's §15.
2. **Password reset at launch** — confirmed: no email-based password reset at launch. Users who forget passwords sign in via OAuth or manual support. Post-launch: re-enable with Resend.
3. **Manager Level XP values** — deferred from gameplay spec; tune during playtest.
4. **Contract extension cost escalator numbers** — deferred; tune during playtest.
5. **Token bonus values** — deferred; tune during playtest.
6. **Pack coin prices** — deferred; tune during playtest.
7. **Login streak curve** — deferred; tune during playtest.
8. **Team milestone reward sizing** — deferred; tune during playtest.
9. **Long-running cron job execution** — if season-end or Opening Day distribution exceeds Vercel function time limits, migrate to Inngest.
10. **Sound design** — spec'd in UI/UX as deferred; implementation is Howler.js or native `<audio>` if/when enabled.
11. **Web push notifications** — deferred; OneSignal when retention work begins.
12. **Transactional email provider** — deferred; Resend when needed.
13. **Admin panel** — deferred; Supabase Studio at launch.
14. **Mobile web optimizations** — deferred; desktop-only at launch.
15. **Data warehouse / BI** — deferred; PostHog + Vercel analytics cover launch needs.
16. **Accessibility audit** — run a full WCAG 2.1 AA audit before launch; fix issues found.
17. **Load testing methodology** — simulate a busy slate (10 MLB games running concurrently, 1k active users) against the live-ingest pipeline.
18. **Image licensing posture** — BallDontLie photo usage terms need legal review before launch.
19. **MLB license** — not required for BallDontLie-based MVP, but required for a paid cash-contest v2.
20. **Analytics retention / privacy** — PostHog GDPR stance; cookie banner; privacy policy draft.
21. **Database backup & point-in-time recovery** — Supabase tier includes daily backups; consider upgrading for PITR before launch.
22. **Turborepo / monorepo** — deferred; single repo at launch.
23. **Bundle size budget** — set + enforce in CI (Vercel bundle analyzer). Target <250KB initial JS.

---

## 16. Glossary (tech terms)

- **App Router** — Next.js 15's React-Server-Components-first routing system under `app/`.
- **RLS (Row-Level Security)** — Postgres feature that filters rows returned to a query based on the current authenticated user. Supabase leans heavily on this.
- **Drizzle ORM** — TypeScript-first Postgres ORM; schemas defined in TS, queries type-safe.
- **TanStack Query** — React data-fetching / cache library (formerly React Query).
- **Supabase Realtime** — Postgres-change-triggered WebSocket broadcasts to subscribed clients.
- **Edge Function** — Supabase or Vercel serverless function running on edge infrastructure, low-latency.
- **pg_cron** — Postgres extension for SQL-defined cron jobs, runs entirely in the DB.
- **Biome** — all-in-one lint + format + TypeScript tool; faster alternative to ESLint + Prettier.
- **BallDontLie** — third-party sports data API used for MLB data at launch.
- **pnpm** — fast, disk-efficient package manager.
- **Vercel Cron** — cron-style triggers on Vercel that hit Next.js API routes on a schedule.
- **`@supabase/ssr`** — Supabase's Next.js SSR helpers (cookie-based session handling).

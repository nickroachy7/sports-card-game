# Draft Deck

Fantasy baseball collectible-card web app. Real MLB players, licensed, with tier progression earned from career fantasy points; conditional tokens before contests; a seasonal rebuild where only the Vault and your Manager Level persist year over year.

Built on Next.js 15 + Supabase + BallDontLie. F2P at launch. Desktop web only at launch.

---

## Quickstart

**Prerequisites:** Node 20 LTS · pnpm 9+ · Docker Desktop · Supabase CLI (`brew install supabase/tap/supabase`)

```bash
git clone <repo>
cd draft-deck
pnpm install
cp .env.example .env.local     # fill in your values
supabase start                 # boots local Postgres + Auth + Storage + Studio
pnpm db:push                   # applies migrations to local Supabase
pnpm db:seed                   # seeds economy_config + first season + test data
pnpm dev                       # starts Next.js on http://localhost:3000
```

Supabase Studio: `http://localhost:54323`. Full command reference: [`docs/runbook.md`](./docs/runbook.md).

---

## How to Navigate This Repo

If you're new — or you're an AI coding agent — read in this order:

1. **[`CLAUDE.md`](./CLAUDE.md)** — operational guide. Conventions, what's non-negotiable, when to ask, definition of done. Read this every session.
2. **[`draft-deck-gameplay-spec.md`](./draft-deck-gameplay-spec.md)** — what Draft Deck *is*. Mechanics, seasonal lifecycle, contracts, vault, DraftKings-style scoring.
3. **[`draft-deck-database-schema-spec.md`](./draft-deck-database-schema-spec.md)** — data shape. 29 tables, enums, RLS policy families, indexes, migration ordering.
4. **[`draft-deck-api-spec.md`](./draft-deck-api-spec.md)** — every Server Action, Route Handler, cron endpoint, webhook receiver, Realtime subscription.
5. **[`draft-deck-ui-ux-spec.md`](./draft-deck-ui-ux-spec.md)** — visual system, screens, card anatomy deep dive, big-moment flows.
6. **[`draft-deck-tech-stack-spec.md`](./draft-deck-tech-stack-spec.md)** — stack choices, architecture, migration plan from the Vite prototype.
7. **[`draft-deck-balldontlie-integration.md`](./draft-deck-balldontlie-integration.md)** — MLB data integration: SDK usage, webhook receiver, signature verification, scoring reconciliation.

**Working on Phase 1?** Start with [`docs/roadmap-phase-1.md`](./docs/roadmap-phase-1.md).

**Looking for the *why* behind a decision?** Check [`docs/adr/`](./docs/adr/).

**Need a command?** [`docs/runbook.md`](./docs/runbook.md).

---

## Tech Stack (at a glance)

- **Next.js 15** App Router · **TypeScript** strict · **Tailwind 4** + **Radix/shadcn** + **motion** + **react-dnd** + **sonner** + **lucide-react** + **react-hook-form** + **recharts**
- **Supabase** (Postgres · Auth · Storage · Realtime) via **Drizzle ORM** + **@supabase/ssr** + **@supabase/supabase-js**
- **BallDontLie** (`@balldontlie/sdk`, GOAT tier) for MLB rosters, games, stats, live event webhooks
- **Vercel** (app + cron) · **Upstash Redis** (rate-limit + idempotency)
- **Vitest** + **Playwright** + **Biome** · **Sentry** + **PostHog**
- **pnpm** + **Supabase CLI** + **Docker** for local dev

Full rationale: [`draft-deck-tech-stack-spec.md`](./draft-deck-tech-stack-spec.md).

---

## Directory Structure

```
.
├── CLAUDE.md                         ← Read every session
├── README.md                         ← You are here
├── package.json                      ← Deps
├── biome.json                        ← Lint + format config
├── drizzle.config.ts                 ← ORM config
├── next.config.ts                    ← Next.js config (+ Sentry wrapper)
├── vercel.json                       ← Deploy + cron schedules
├── .env.example                      ← Env var template
│
├── app/                              ← Next.js App Router
│   ├── (auth)/                       ← Sign in, sign up, onboarding
│   ├── (app)/                        ← Authenticated app
│   │   ├── lineup/                   ← Default landing
│   │   ├── collection/               ← Card browser
│   │   ├── shop/                     ← Pack store
│   │   ├── vault/                    ← Keepsake showcase (public)
│   │   ├── milestones/               ← Team milestones dashboard
│   │   └── leaderboards/             ← 4-way leaderboard
│   ├── api/                          ← Route Handlers
│   │   ├── config/economy/
│   │   ├── cron/                     ← Vercel Cron targets
│   │   ├── leaderboards/
│   │   ├── profile/
│   │   └── webhooks/balldontlie/
│   └── actions/                      ← Server Actions (all user mutations)
│
├── src/
│   ├── components/                   ← React components
│   │   ├── ui/                       ← shadcn/ui primitives
│   │   ├── card/                     ← Card anatomy
│   │   ├── lineup/                   ← Lineup page (Phase 2+)
│   │   ├── pack/                     ← Pack open + shop
│   │   ├── token/                    ← Token chip + tray
│   │   └── layout/                   ← App shell (header, sidebar, drawer)
│   └── lib/
│       ├── db/
│       │   ├── schema/               ← Drizzle schemas (by domain)
│       │   ├── functions/            ← SQL function definitions
│       │   ├── triggers/             ← Trigger SQL
│       │   ├── policies/             ← RLS policies as SQL
│       │   ├── client.ts             ← Drizzle client
│       │   └── supabase.ts           ← @supabase/ssr factories
│       ├── mlb/                      ← BallDontLie provider + webhook
│       ├── contracts/                ← Shared zod schemas
│       ├── auth/                     ← Session helpers
│       ├── rate-limit/               ← Upstash rate limiter
│       └── observability/            ← Sentry, PostHog wrappers
│
├── supabase/
│   ├── migrations/                   ← Numbered SQL migrations
│   ├── functions/                    ← Supabase Edge Functions
│   └── config.toml
│
├── tests/
│   ├── unit/                         ← Vitest
│   ├── integration/                  ← RLS + SQL function tests
│   └── e2e/                          ← Playwright
│
├── reference/                        ← Third-party type extracts (do not edit)
│   ├── balldontlie-sdk-mlb-methods.d.ts
│   └── balldontlie-sdk-mlb-types.d.ts
│
├── docs/
│   ├── roadmap-phase-1.md            ← Ordered Phase 1 task list
│   ├── runbook.md                    ← Commands + recipes
│   └── adr/                          ← Architecture Decision Records
│
├── .claude/
│   └── skills/                       ← Claude Code scaffolding skills
│
└── (draft-deck-*.md at root)         ← The six specs
```

---

## Specs — One-line Summaries

| Spec                                                  | TL;DR                                                                               |
|-------------------------------------------------------|-------------------------------------------------------------------------------------|
| [Gameplay](./draft-deck-gameplay-spec.md) (v0.2)      | Cards + tiers + contracts + tokens + seasonal rebuild + DraftKings scoring          |
| [UI/UX](./draft-deck-ui-ux-spec.md) (v0.1)            | Charcoal + cream palette, Inter + mono, card anatomy (§4) + 6 screens + big moments |
| [Tech Stack](./draft-deck-tech-stack-spec.md) (v0.1)  | Next.js 15 + Supabase + Vercel + BDL — one stack-at-a-glance table in §1.1          |
| [BallDontLie](./draft-deck-balldontlie-integration.md) (v0.1) | GOAT tier, SDK-based, webhook-driven live ingest, post-game reconciliation    |
| [Database](./draft-deck-database-schema-spec.md) (v0.1) | 29 tables, pg enums, RLS policies, Drizzle schema ordering                        |
| [API](./draft-deck-api-spec.md) (v0.1)                | 18 Server Actions + 4 public routes + 10 crons + 1 webhook + 5 Realtime channels    |

---

## Development Status

**Phase 0 — Specs & planning:** complete (this repo currently).
**Phase 1 — Walking skeleton:** not started. See [`docs/roadmap-phase-1.md`](./docs/roadmap-phase-1.md).
**Phase 2+ — Lineup, live contests, vault, milestones, leaderboards, seasonal flows, hardening:** planned.

The current `src/` directory contains a Vite-based prototype from Figma Make. It is **being replaced** by a Next.js 15 app built alongside it. Components are ported incrementally.

---

## Contributing

Solo-founder project right now. If that changes:

- Branch naming: `feat/`, `fix/`, `chore/`, `docs/` with scope.
- Commit format: Conventional Commits (`feat(cards): add quick-sell flow`).
- PR title: `[T<roadmap-id>] <description>` — e.g. `[T5.4] cards: quickSellCard server action`.
- Every PR references spec sections in the description.
- Follow the Definition of Done checklist in [`CLAUDE.md`](./CLAUDE.md) §13.

---

## License

TBD. Not yet open-source.

---

## Contact

Nicholas Roach · nickroachy@gmail.com

# CLAUDE.md — Draft Deck Repo Guide

You're working on **Draft Deck**, a fantasy baseball collectible-card web app built on Next.js 15 + Supabase. This doc tells you how to operate in this repo.

**Read this first, every session.**

---

## 1. What Draft Deck Is (30 seconds)

MLB fantasy card game. Users collect licensed-player cards, apply conditional tokens before contests, watch real-world stats score their lineup live. Cards have 15-play contracts and tiered cosmetic progression (Bronze → Silver → Gold → Diamond) earned from career fantasy points. Every MLB season is a fresh rebuild; the vault preserves 10 cards per year. Launch is F2P-only (no cash contests in v1). Desktop web only at launch.

Full mechanics: see `draft-deck-gameplay-spec.md`.

---

## 2. How to Read the Specs (in order)

There are six specs plus this file. Read in this order when you need context:

1. **`README.md`** — project overview + quickstart.
2. **`draft-deck-gameplay-spec.md`** — mechanics, seasonal lifecycle, DK-style scoring. The "what we're building."
3. **`draft-deck-database-schema-spec.md`** — 29 tables, every column, every RLS policy. The "shape of the data."
4. **`draft-deck-api-spec.md`** — every Server Action, Route Handler, cron, webhook, Realtime subscription. The "what the code does."
5. **`draft-deck-ui-ux-spec.md`** — visual system, screens, card anatomy deep dive, big-moment flows. The "what the user sees."
6. **`draft-deck-tech-stack-spec.md`** — stack choices, architecture, migration plan. The "how it's built."
7. **`draft-deck-balldontlie-integration.md`** — MLB data integration specifics (webhooks, SDK usage, scoring reconciliation).

Reference files under `reference/` contain the BallDontLie SDK type definitions we build against.

**Every other task in this repo ultimately traces back to one of those specs.** When in doubt, check the spec before inventing.

---

## 3. Current State of the Codebase

The repo currently contains a **Vite React prototype** that predates most of the specs. It's basketball-flavored and uses concepts (rarity, OVR rating, trades) that are no longer part of the product. Useful pieces:

- Component tree under `src/app/components/` — `PackOpener`, `CardFront`, `TokenTray`, etc. Many port forward cleanly.
- Design tokens in `src/styles/theme.css`.
- Tailwind 4 + shadcn/ui primitives.
- Dependencies listed in `package.json`.

**The Phase 1 roadmap (`docs/roadmap-phase-1.md`) describes migrating to a fresh Next.js 15 app next to this prototype, porting components incrementally.** Don't edit the Vite prototype — port components out of it into the new Next.js tree.

Key mismatches to remember when porting:
- Basketball 5-slot lineup → MLB 10-slot diamond (C / 1B / 2B / 3B / SS / 3 OF / 2 SP).
- Rarity tiers → tiers earned by career FP (Bronze/Silver/Gold/Diamond).
- Trades feature → removed entirely. Cards are non-transferable.
- `OVR Rating` → removed. Cards have no skill rating.

---

## 4. Tech Stack at a Glance

| Layer           | Tool                                                  |
|-----------------|-------------------------------------------------------|
| Framework       | Next.js 15 App Router                                 |
| Language        | TypeScript (strict)                                   |
| Styling         | Tailwind CSS 4 + Radix/shadcn primitives              |
| Animation       | motion (framer-motion)                                |
| Drag-drop       | react-dnd                                             |
| Icons           | lucide-react                                          |
| Database        | Supabase Postgres                                     |
| ORM             | Drizzle ORM                                           |
| Auth            | Supabase Auth (email/pw + Google + Apple; no confirmation emails) |
| Storage         | Supabase Storage                                      |
| Real-time       | Supabase Realtime (Postgres changes → WebSockets)     |
| Data source     | BallDontLie API (`@balldontlie/sdk`), GOAT tier       |
| Hosting         | Vercel                                                |
| Scheduled jobs  | Vercel Cron + Supabase Edge Functions                 |
| Testing         | Vitest (unit) + Playwright (E2E)                      |
| Lint + format   | Biome                                                 |
| Observability   | Sentry + PostHog                                      |
| Package manager | pnpm                                                  |

Full rationale: `draft-deck-tech-stack-spec.md`.

---

## 5. Repo Layout (target structure for the Next.js build)

```
app/
├── (auth)/                    — auth routes (signin, signup, callback)
├── (app)/                     — authenticated app shell
│   ├── lineup/                — Lineup page (default landing)
│   ├── collection/            — Card browser
│   ├── shop/                  — Pack shop
│   ├── vault/                 — Keepsake showcase
│   ├── milestones/            — Team milestones dashboard
│   └── leaderboards/          — 4-way leaderboard
├── api/
│   ├── config/economy/        — Public economy config endpoint
│   ├── cron/                  — All Vercel Cron targets
│   ├── leaderboards/[type]/   — Public leaderboard API
│   ├── profile/[teamName]/    — Public profile API
│   └── webhooks/balldontlie/  — BDL webhook receiver
├── actions/                   — All Server Actions
│   ├── profile.ts
│   ├── packs.ts
│   ├── cards.ts
│   ├── tokens.ts
│   ├── lineup.ts
│   ├── vault.ts
│   └── support.ts
└── layout.tsx, page.tsx, etc.

src/lib/
├── db/
│   ├── schema/                — Drizzle schemas (one file per domain)
│   ├── functions/             — SQL functions
│   ├── triggers/              — Trigger SQL
│   ├── policies/              — RLS policy SQL
│   ├── client.ts              — Server-side Drizzle client
│   └── supabase.ts            — @supabase/ssr client factories
├── mlb/
│   ├── client.ts              — BalldontlieAPI singleton
│   ├── provider.ts            — MLBDataProvider interface
│   └── webhook.ts             — Signature verification
├── contracts/                 — Shared zod schemas for actions/routes
├── auth/                      — Session helpers
├── rate-limit/                — Upstash rate-limit middleware
├── observability/             — Sentry, PostHog wrappers
└── utils/                     — Generic utilities

src/components/                — React components
├── ui/                        — shadcn/ui primitives (low-level)
├── card/                      — Card-related components (anatomy deep dive)
├── lineup/                    — Lineup page components
├── pack/                      — Pack opening + shop
├── token/                     — Token chips, tray
└── layout/                    — Shell (header, sidebar, drawer)

supabase/
├── migrations/                — Numbered SQL migrations
├── functions/                 — Supabase Edge Functions
└── config.toml                — Supabase CLI config

reference/                     — BallDontLie SDK type extracts (don't edit)
docs/
├── roadmap-phase-1.md         — Phase 1 task list
├── runbook.md                 — Commands reference
└── adr/                       — Architecture Decision Records
.claude/
└── skills/                    — Claude Code skills (scaffolding generators)
```

---

## 6. Coding Conventions

**TypeScript**
- Strict mode, no `any`, no `@ts-ignore` without a follow-up ticket.
- Prefer `type` over `interface` for unions; `interface` for object shapes meant to be extended.
- Exhaustive `switch` over discriminated unions — let the compiler catch missing cases.
- `import type { ... }` for type-only imports.

**Naming**
- Files: `kebab-case.ts`, components `PascalCase.tsx`.
- React components: `PascalCase`.
- Hooks: `useCamelCase`.
- SQL (tables, columns): `snake_case`.
- Enums / pg enums: `snake_case` values (`'bronze'`, `'silver'`).

**Imports**
- Absolute imports via path alias `@/` → `src/`.
- Sort: external packages, then `@/...`, then relative, alphabetized within groups. Biome enforces this.

**Error handling**
- Never swallow errors silently.
- Every Server Action returns `{ ok: true; data } | { ok: false; error: { code, message, detail? } }`.
- Every Route Handler returns `{ data, meta? }` on success or `{ error: { code, message, detail? } }` on error.
- All error codes come from the catalog in `draft-deck-api-spec.md` §2.2.
- Wrap every Server Action / Route Handler body in try/catch and report to Sentry.

**Code style**
- Biome is the source of truth. Don't hand-format.
- Don't mix Server Components and Client Components in the same file. Put `"use client"` at the top of the client file.
- Server Components fetch via Drizzle; Client Components use TanStack Query + Server Actions.

---

## 7. Database Rules (non-negotiable)

1. **RLS is always enabled.** Every table, every migration. If you're about to write `ALTER TABLE foo DISABLE ROW LEVEL SECURITY`, stop.
2. **Mutations go through SQL functions.** Every state-changing operation (coin spend, pack open, quick-sell, extend, vault commit, token apply, contest submit) has a Postgres function (e.g. `spend_coins`, `open_pack`, `commit_vault_selection`). Server Actions wrap these — never update tables directly from TypeScript.
3. **Audit tables are append-only.** Don't `UPDATE` or `DELETE` rows in `coin_transaction`, `pack_opening`, `contract_extension`, `token_application`, `team_milestone_award`, `manual_grant`, `webhook_delivery`, `webhook_failed`.
4. **Migrations are reversible.** Every `.sql` migration has a matching `.down.sql`. Destructive changes (DROP COLUMN/TABLE) require deprecation windows.
5. **Never hand-edit the DB in prod.** Changes flow: Drizzle schema → `drizzle-kit generate` → review SQL → `supabase db push` to dev → PR review → merge → prod apply via CI.

Full schema: `draft-deck-database-schema-spec.md`.

---

## 8. Server Actions vs. Route Handlers

**Server Action** when:
- User-initiated mutation (button click, form submit).
- Caller is a Next.js client component in this app.

**Route Handler** when:
- External caller (Vercel Cron, BallDontLie webhook, future mobile app).
- Need edge caching or public read.
- Need programmatic access from outside Next.js.

Full split: `draft-deck-api-spec.md` §1.

---

## 9. Testing Expectations

**Always write:**
- Unit tests for scoring math, token trigger evaluation, contract cost computation, RLS validators.
- Integration test for each new Server Action: covers happy path + one primary error case.
- E2E test for any user flow that lands in the spec's "critical flows" list (onboarding, open pack, build lineup, submit, contract extend, quick-sell).

**Skip tests for:**
- Thin UI wrappers that add no logic.
- Visual-only changes (use Percy/Chromatic snapshots instead).

**Never:**
- Comment out a failing test to ship.
- Mark a test `.skip` without a linked issue.

Run with `pnpm test`, `pnpm test:watch`, `pnpm e2e`. See `docs/runbook.md`.

---

## 10. Observability — what to instrument

Every Server Action and Route Handler:
- Wraps its body in a Sentry transaction (use the `wrapAction` helper from `src/lib/observability/`).
- Emits a PostHog event on success for key user actions (`pack_opened`, `contract_extended`, `lineup_submitted`, `card_quick_sold`, `token_applied`, `tier_up_reached`, etc.).
- Logs to Vercel structured logs on failure — don't `console.log`; use the `log` helper.

---

## 11. Rate Limiting

Enforced in Next.js middleware via Upstash Redis. Caps in `draft-deck-api-spec.md` §2.5. Never bypass in production code. The middleware returns `429 RATE_LIMITED` with `X-RateLimit-*` headers — client UI must handle this.

---

## 12. When to Ask vs. When to Proceed

**Proceed without asking if:**
- The task is in `docs/roadmap-phase-1.md` and has clear acceptance criteria.
- Behavior is specified in one of the six specs.
- You're filling in a known pattern (adding a Server Action, adding a table, writing a test).

**Ask first if:**
- A spec contradicts itself or another spec.
- The task implies a new table, new enum value, or new error code not in the specs.
- You need to pick between two architectures with materially different trade-offs.
- You're about to commit a workaround because the spec is impossible or wrong.

When asking, cite the spec section by path and heading.

---

## 13. Definition of Done

A task is "done" when all of these are true:

- [ ] The acceptance criteria in the roadmap task are met.
- [ ] `pnpm typecheck` is clean.
- [ ] `pnpm lint` is clean (Biome).
- [ ] `pnpm test` passes.
- [ ] If it touches UI: the rendered result matches the spec (tier frame colors, spacing, typography from `draft-deck-ui-ux-spec.md`).
- [ ] If it touches DB: a migration exists and has been applied locally; RLS policies are in place.
- [ ] If it touches an API / Action: zod contracts exist in `src/lib/contracts/`, error codes come from the catalog.
- [ ] If it's a visible feature: at least one integration test covering the happy path.
- [ ] The ADR has been updated if a decision was made that's not in an existing spec.

---

## 14. Security Reflexes

- Every API surface has a session check (or `CRON_SECRET` / webhook signature for external surfaces).
- RLS is the primary defense. API-layer auth is belt + suspenders.
- Never log user PII (email, IP) at `info`+; use `debug` only, scrubbed in prod.
- Never expose the service-role key to the client (it bypasses RLS). `NEXT_PUBLIC_*` variables go to the browser — double-check every new env var.
- CSRF is handled by Next.js Server Actions inherently; don't disable.

---

## 15. Git & Commits

- Branch: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`.
- Commit format: conventional commits (`feat(cards): add quick-sell flow`).
- One concern per PR. If you find yourself doing two things, split.
- Reference the roadmap task id in the PR title: `[T2.5] Drizzle schema: cards domain`.

---

## 16. Where to Write Your Progress Notes

- **In-repo ADRs** (`docs/adr/`) for architectural decisions worth preserving.
- **Roadmap task comments** for progress on a specific task.
- **Never** commit scratch notes to the root or `src/`. Use `docs/notes/` (gitignored).

---

## 17. Key Commands

Full list in `docs/runbook.md`. The ones you'll hit most:

```
pnpm install                 # once, or after deps change
pnpm dev                     # Next.js dev server at :3000
pnpm typecheck               # tsc --noEmit
pnpm lint                    # Biome check
pnpm format                  # Biome format
pnpm test                    # Vitest
pnpm e2e                     # Playwright
pnpm db:generate             # Drizzle migration from schema diff
pnpm db:push                 # Apply migrations to local Supabase
pnpm db:reset                # Drop, re-migrate, re-seed local
supabase start               # Boot local Postgres + Auth + Studio
supabase status              # Check local stack
```

---

## 18. Skills Available

Check `.claude/skills/` for scaffolding skills. At launch:

- `new-server-action` — scaffold a Server Action with zod, types, Sentry, test.
- `new-drizzle-migration` — generate schema + up/down SQL + RLS.
- `new-cron-endpoint` — scaffold cron Route Handler with auth + Sentry.
- `new-shadcn-component` — scaffold a new UI component matching design tokens.

When a skill applies, use it rather than hand-scaffolding — the generated code has the right error handling, logging, and conventions baked in.

---

## 19. Red Flags — Stop and Ask

- About to write `raw()` SQL without a reason.
- About to disable RLS.
- About to add a new dependency not in the locked stack (check `draft-deck-tech-stack-spec.md` §1).
- About to hand-edit prod data.
- About to commit a secret.
- About to commit code that references concepts from the old Vite prototype (rarity, OVR rating, trades).

If you catch yourself doing one of these, stop, document the situation, and ask.

---

## 20. One-Paragraph Summary

**Draft Deck is TypeScript-everywhere (Next.js 15 + Supabase) with RLS-first data access, Drizzle-typed queries, Server Actions for user mutations, Route Handlers for external surfaces, and BallDontLie MLB webhooks driving live scoring. Every decision lives in one of six specs; every state change goes through an audited SQL function; every tier of the design system matters.** Read the specs, pattern-match against what's already built, and when in doubt, ask.

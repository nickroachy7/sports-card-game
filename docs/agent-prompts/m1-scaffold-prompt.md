# Agent Prompt — Milestone 1: Project Scaffold

**Audience:** first Claude Code agent session on Draft Deck.
**Scope:** tasks T1.1 through T1.10 from `docs/roadmap-phase-1.md`. No Supabase or BallDontLie work yet — those are M2 / M4.
**Prerequisites (agent-side):** none. Everything needed is in the repo.
**Prerequisites (user-side):** none for this session. External service signups happen after M1, before M2 starts.

---

## The Prompt

Copy-paste the block below into a fresh Claude Code session. Do not edit it — every detail is load-bearing.

```
You're the first engineering agent on Draft Deck, a fantasy baseball collectible-card web app. The repo has a complete set of six specs and a roadmap, but no production code yet — just a Vite-based prototype (`src/`) from Figma Make that predates the specs. Your job today is to land **Milestone 1: Project Scaffold** from the Phase 1 roadmap.

## Step 1: Orient

Read in full, in order:
1. `CLAUDE.md` — operational rules for this repo. Canonical.
2. `README.md` — project orientation.
3. `docs/roadmap-phase-1.md` — your work queue. Your mission today is Milestone 1 (M1) only: tasks T1.1 through T1.10.

Skim only as needed for specific tasks:
- `draft-deck-tech-stack-spec.md` — especially §1.1 (locked dependency set) and §13 (migration plan).
- `draft-deck-ui-ux-spec.md` §2 — color palette and typography you'll set up in T1.8.

Do **not** read the full gameplay, database, API, UI/UX, or BallDontLie specs today. M1 is pure scaffolding; those specs inform later milestones.

## Step 2: Handle the Vite prototype

Before scaffolding the new Next.js app, preserve the prototype as reference material:

1. Create a `prototype/` subdirectory at the repo root.
2. Move the following into `prototype/`:
   - `src/`
   - `index.html`
   - `vite.config.ts`
   - `package.json`
   - `package-lock.json` (if present)
   - any other Vite-only files (`tsconfig.json` if it's Vite-specific — check first)
3. Leave at the repo root: all `draft-deck-*.md` specs, `CLAUDE.md`, `README.md`, `docs/`, `reference/`, `.git/`, `.github/` if present.
4. Commit: `chore(repo): preserve Vite prototype under prototype/ before Next.js scaffold`.

The prototype is reference-only from now on. Don't edit it. Components get ported into the new app only when needed in later milestones.

## Step 3: Execute M1 tasks T1.1 through T1.10

Work them in order. Use your TodoWrite to track; mark each `in_progress` when starting and `completed` when its acceptance criteria pass.

For every task:
- Read the task block in `docs/roadmap-phase-1.md` (T1.x).
- Implement per the acceptance criteria.
- Run `pnpm typecheck`, `pnpm lint`, and any relevant tests.
- Commit with Conventional Commits format referencing the task id: `<type>(<scope>): T1.x <short desc>`. Example: `chore(scaffold): T1.1 create Next.js 15 app`.

High-level summary of each task (full details in the roadmap):

- **T1.1** — `pnpm create next-app@latest draft-deck --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm`, scaffolded at the repo root (prototype is already moved out of the way).
- **T1.2** — Install the locked dependency set per tech spec §1.1. Pin versions. Do not add anything not on the list; if you think you need something else, stop and ask.
- **T1.3** — Configure Biome (`biome.json`). Replace/remove any default ESLint/Prettier config.
- **T1.4** — Configure Vitest (`vitest.config.ts`) and Playwright (`playwright.config.ts`). Land one passing unit test and one passing Playwright smoke test.
- **T1.5** — Wire `@sentry/nextjs` (client, server, edge configs + `next.config.ts` wrapper). Use placeholder DSNs in `.env.example`. Don't hit a real Sentry project.
- **T1.6** — Wire PostHog (client via `posthog-js`, server via `posthog-node`). Same placeholder pattern.
- **T1.7** — Create `.env.example` with every variable from the roadmap's T1.7 list, each with a descriptive comment. Create `src/lib/env.ts` that zod-validates required vars at boot.
- **T1.8** — Install shadcn/ui (`pnpm dlx shadcn@latest init`). Port the charcoal + cream palette and tier accent colors per UI/UX spec §2.1. Configure Inter + JetBrains Mono via `next/font`. Land a simple `/palette` page that renders the color tokens and both fonts as a smoke test.
- **T1.9** — Write `vercel.json` with an empty `crons` array. **Do not actually deploy to Vercel** — the user's Vercel account isn't linked yet. Note this in your final report.
- **T1.10** — Scaffold `src/lib/auth/cron.ts` exporting `assertCronAuth(req: Request)` that checks `Authorization: Bearer ${CRON_SECRET}`. No endpoints yet — just the helper.

## Step 4: What NOT to do today

- Don't touch anything under `prototype/` after the move.
- Don't start M2, M3, M4, or any later work. Supabase accounts don't exist yet.
- Don't install dependencies outside the locked stack in `draft-deck-tech-stack-spec.md` §1.1. If you believe something else is needed, stop and ask.
- Don't write real credentials (Sentry DSN, PostHog key, etc.) anywhere, not even in comments. The user adds these post-M1.
- Don't carry forward anything from the Vite prototype's vocabulary: no `rarity`, no `OVR Rating`, no `trades`, no basketball positions. Those are gone in the new product.
- Don't tweak the specs. If something in the specs is unclear or contradictory, stop and ask — don't silently adjust.

## Step 5: Definition of Done

Before declaring M1 complete, verify ALL of these pass:

- [ ] `prototype/` subdirectory exists; Vite prototype is inside; committed.
- [ ] All 10 M1 tasks are completed per their acceptance criteria.
- [ ] `pnpm install` runs cleanly from the repo root against the new Next.js app.
- [ ] `pnpm dev` boots on `http://localhost:3000`.
- [ ] `/palette` page renders the charcoal + cream tokens and both fonts correctly.
- [ ] `pnpm typecheck` is clean.
- [ ] `pnpm lint` is clean (Biome).
- [ ] `pnpm test` passes (the one unit test).
- [ ] `pnpm e2e` passes (the one Playwright test against `localhost:3000`).
- [ ] `.env.example` exists and includes every variable referenced anywhere in the new code.
- [ ] `vercel.json` exists with an empty cron array.
- [ ] `src/lib/env.ts` validates required env vars at boot.
- [ ] `src/lib/auth/cron.ts` exports `assertCronAuth`.
- [ ] Every change is committed with Conventional Commits format.

## Step 6: Final report (what to send the user when you're done)

Structure your final message:

1. **What shipped.** Bullet list of commits (or a branch + commit summary).
2. **What's verified.** Confirm each Definition-of-Done item.
3. **User TODOs before M2.** The user must do these before the next agent session can start M2:
   - Create two Supabase projects: `draftdeck-dev` and `draftdeck-prod`.
   - Subscribe to BallDontLie GOAT tier ($39.99/mo); generate dev + prod API keys; note the webhook signing secret.
   - Create a Sentry project; copy DSN + auth token + org + project slug.
   - Create a PostHog project; copy API key + host.
   - Provision an Upstash Redis instance; copy REST URL + REST token.
   - Connect the repo to Vercel; configure env vars in the Vercel dashboard.
   - Generate `CRON_SECRET`: `openssl rand -hex 32`.
   - Set up Google OAuth in Google Cloud Console (for Supabase OAuth).
   - Set up Apple OAuth Services ID (for Supabase OAuth).
   - Paste every value into `.env.local`.
4. **Recommended next prompt.** Suggest the M2 prompt: "Proceed to Milestone 2 (Database Foundation) — T2.1 through T2.21 from `docs/roadmap-phase-1.md`. Requires `.env.local` populated with Supabase credentials."

## Step 7: When to stop and ask

Stop and surface a question if:
- A spec section says one thing and another spec says something different.
- A task acceptance criterion is ambiguous.
- You're about to deviate from the spec in a way the spec doesn't explicitly allow.
- You think a dependency outside the locked stack is needed.
- Something in the existing `prototype/` (once moved) needs to influence M1 work — it shouldn't, so flag if you think it does.

Don't silently ad-lib. When in doubt, quote the spec section you're reading from and ask.

---

Start with Step 1. Report back when M1 is complete.
```

---

## After M1

When this agent session finishes and the user has done the signups listed in Step 6, open a new Claude Code session with the M2 prompt (to be written at `docs/agent-prompts/m2-db-foundation-prompt.md`).

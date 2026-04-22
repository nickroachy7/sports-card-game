# New-machine onboarding — Draft Deck

Everything needed to set Draft Deck up on a new computer so your
Claude Code agent can work the same way it does on your main
machine (build, deploy, run SQL, read ADRs, etc.).

Takes ~15 minutes of setup, most of which is logging into CLIs.

---

## 0. What the new machine needs

| Tool | Required for | Install |
|---|---|---|
| **Node.js 20+** | Building the Next.js app | https://nodejs.org or `brew install node` |
| **pnpm** | Package manager the repo uses | `npm i -g pnpm` or `brew install pnpm` |
| **Git + GitHub auth** | Clone + push | `brew install gh` → `gh auth login` (or SSH key) |
| **Vercel CLI** | Deploys + env-var management | `npm i -g vercel` |
| **Supabase CLI** | DB migrations + `db push` | `brew install supabase/tap/supabase` |
| **Claude Code** | The AI agent | Already installed by your employer |

Optional but nice:
- `curl` (default on macOS/Linux) — for cron smokes.
- `psql` — only if you want to run raw SQL locally. Not required; the Supabase MCP covers it.

---

## 1. Clone the repo

```bash
git clone https://github.com/nickroachy7/sports-card-game.git
cd sports-card-game
pnpm install
```

All the docs are already in the repo:
- `CLAUDE.md` — operational rules for the AI agent. Read this first.
- `draft-deck-*-spec.md` — the six product specs (gameplay, database-schema, api, ui-ux, tech-stack, balldontlie-integration).
- `draft-deck-polish-spec.md` — the polish spec (live document, grows phase-by-phase).
- `docs/adr/ADR-000N_phase-N-retro.md` — one per shipped phase. Start at ADR-0008 if you want the sequential history.
- `docs/roadmap-phase-N.md` — the per-phase plans.
- `docs/runbook.md` — common commands.
- `docs/bdl-webhook-registration.md` — if you ever re-register the BDL webhook.

---

## 2. Link external services

### Vercel

Signs you in to the Draft Deck project so you can deploy + pull env.

```bash
vercel login          # opens a browser; log in with your account
vercel link           # when prompted, pick the nickroachy7s-projects/draft-deck project
```

### Supabase

Links the local CLI to the prod project so `supabase db push --linked` works.

```bash
supabase login                                      # browser flow
supabase link --project-ref qifsxnwvxfsiucrlchka    # the prod project ref
```

Verify:

```bash
supabase migration list --linked
# should show 0000 through 0026 as applied in both local + remote columns
```

---

## 3. Pull env vars (the fast path)

The project needs ~20 env vars (Supabase URL / keys, BDL API key + webhook secret, Upstash, Sentry, PostHog, CRON_SECRET). Don't transfer them by hand — pull from Vercel:

```bash
vercel env pull .env.local --environment production
```

This writes a fully-populated `.env.local` at the repo root. The file is gitignored so it never leaves the machine.

Notes:
- `.env.example` is checked in and lists every variable; treat it as the source of truth for what should exist.
- If you want a separate dev Supabase, override `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `DATABASE_URL` after the pull. For now the setup points at prod, which is fine for read + local experimentation; be careful with write paths.

---

## 4. Claude Code MCP servers

These live in Claude Code's local config (not in the repo). You'll set them up per-machine.

### Supabase MCP

Lets Claude run SQL + apply migrations against the linked project. I use it constantly (execute_sql, apply_migration, execute_sql, list_projects, etc.).

- In Claude Code: add the **Supabase MCP server**.
- When it asks for project scope, point it at `qifsxnwvxfsiucrlchka` (the prod ref).
- The MCP generates its own access token; you authorize it via browser.

### Claude Preview MCP

Lets Claude spin up `pnpm dev` and take screenshots. Optional but makes UI work much faster.

- Already configured in-repo via `.claude/launch.json` (tracked in git). The Preview server spec reads from that file.
- In Claude Code: enable the **Claude Preview MCP server** (it's usually one click).

### Other MCPs

Your machine may also have:
- **Claude in Chrome** — for browser automation on web apps.
- **Computer-use** — for native apps.
- **Scheduled tasks**, **Gmail**, **Slack**, etc.

None of these are required for Draft Deck. Install only what you'd actually use.

---

## 5. Smoke test the setup

```bash
pnpm typecheck        # clean = TS is happy
pnpm lint             # clean = Biome is happy
pnpm test             # runs vitest unit tests
pnpm dev              # starts Next.js at http://localhost:3000
```

`pnpm dev` will read `.env.local`. Visit `http://localhost:3000/palette` for the public visual-regression surface (no auth). Sign in at `/signin` with the test account to hit the real lineup page.

**Test account:** "The Boys" · `user_id 81cb1cbb-6325-46d1-b390-866a1f7f74ac` · team "Roachs Team". Email is nickroachy@gmail.com; the password is the one you used when creating it (check your password manager).

---

## 6. Deploy from the new machine

Same rhythm as always:

```bash
git add <files>
git commit -m "feat(scope): slice description"
vercel --prod --yes
```

That's literally it. Vercel remembers the link from step 2, so every slice deploys with one command.

For DB changes:

```bash
supabase db push --linked
```

Or, if the migration is a hot fix, ask Claude to use the Supabase MCP's `apply_migration` tool directly (it'll hit prod without touching local files — the corresponding local migration file still wants to exist for fresh-DB parity).

---

## 7. First thing to tell the AI agent

Once Claude Code is open in the repo, paste something like:

> Read CLAUDE.md, then check `docs/adr/ADR-0015_phase-10-retro.md` for where we left off. We're between phases; I'll tell you when to kick off Phase 11.

That gets the agent oriented. The CLAUDE.md file is designed to be read every session; it has the codebase conventions, spec index, coding rules, and "when to ask vs. proceed" guidance.

---

## Common gotchas

- **`pnpm build` failures that don't happen on `pnpm typecheck`** → usually a Next.js server/client boundary issue (e.g., a `"use client"` component importing a module that uses `next/headers`). Vercel's build will catch it; local typecheck won't. Fix by splitting the module (see `src/lib/db/supabase-browser.ts` for the pattern).
- **Supabase migration drift** → if `supabase migration list --linked` shows timestamp entries you didn't create, that's from a `supabase_mcp.apply_migration` call on another machine. Repair with `supabase migration repair --status reverted <timestamp> --linked` and `--status applied <filename>`.
- **BDL webhook secret rotation** → if the signing secret changes, update Vercel env (`vercel env rm` + `vercel env add`), redeploy, and update the BDL dashboard. See `docs/bdl-webhook-registration.md`.
- **Vercel Hobby cron limits** → Hobby plan caps at one cron invocation per day. If you upgrade to Pro, `vercel.json` can flip `0 10 * * *` to `0 */2 * * *` for the schedule-sync cron (see ADR-0014).

---

## Things that live *only* on a machine (can't pull from git)

- `.env.local` → pull from Vercel, don't commit.
- `.claude/settings.local.json` → your personal Claude Code preferences.
- Claude Code MCP server configurations → set up per-machine.
- Vercel + Supabase + GitHub CLI tokens → one-time login per machine.

Everything else (source, docs, ADRs, migrations, specs, tests, `.env.example`, `.claude/launch.json`) is in git and will be there after you clone.

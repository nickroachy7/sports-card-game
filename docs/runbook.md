# Draft Deck — Runbook

One page. Every command you'll need. Grouped by scenario.

---

## First-time local setup

```bash
# Clone + install
git clone <repo>
cd draft-deck
pnpm install

# Env vars
cp .env.example .env.local
# Fill in: Supabase URL + keys, BDL API key + webhook secret,
#         Sentry DSN, PostHog key, Upstash Redis creds, CRON_SECRET
# Env is zod-validated at boot — missing required values throw.

# Boot local Supabase stack (Postgres + Auth + Storage + Realtime + Studio)
supabase start

# Apply migrations + seed data
pnpm db:push
pnpm db:seed

# Start the Next.js dev server
pnpm dev
# → http://localhost:3000
# Supabase Studio → http://localhost:54323
```

---

## Daily dev

```bash
pnpm dev                       # Next.js dev server, hot reload
pnpm typecheck                 # tsc --noEmit (run on save in IDE)
pnpm lint                      # Biome check
pnpm format                    # Biome auto-fix
pnpm test                      # Vitest, once
pnpm test:watch                # Vitest watch mode
pnpm e2e                       # Playwright against http://localhost:3000
pnpm e2e:ui                    # Playwright UI mode (interactive)
```

---

## Database

### Schema changes

```bash
# 1. Edit a schema file in src/lib/db/schema/*.ts

# 2. Generate the SQL migration
pnpm db:generate
# Creates: supabase/migrations/<timestamp>_<name>.sql
# Hand-author the matching down migration: <timestamp>_<name>.down.sql

# 3. Review the generated SQL
cat supabase/migrations/<latest>

# 4. Apply to local Supabase
pnpm db:push

# 5. Smoke-test via Supabase Studio or tests
```

### Other DB commands

```bash
pnpm db:reset                  # DROP + re-migrate + re-seed local
pnpm db:seed                   # Re-run seed script (idempotent)
pnpm db:diff                   # Show pending migrations vs. Drizzle schema
supabase db pull               # Pull live schema from cloud dev project
supabase db push --linked      # Apply local migrations to linked cloud project
supabase status                # Check local stack state
supabase stop                  # Stop local Supabase containers
```

### Connecting to cloud Supabase

```bash
# Point .env.local at the dev project instead of localhost
# Required when:
#   - Testing BDL webhook integration (needs public URL)
#   - Debugging issues that don't repro locally
#   - Collaborating on shared data

# Edit .env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://<dev-project>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev-anon>
#   SUPABASE_SERVICE_ROLE_KEY=<dev-service-role>
#   DATABASE_URL=<dev-direct-connection>
# pnpm dev
```

---

## Production deploy

### Apply a migration to prod

1. Merge the PR containing the migration to `main`.
2. GitHub Actions CI applies migration to `draftdeck-prod` automatically.
3. Verify in Supabase Studio (prod project).
4. Verify no Sentry alerts fire in the 15 minutes after deploy.

### Manual prod migration (emergency only)

```bash
supabase link --project-ref <prod-project-ref>
supabase db push --linked
# Requires SUPABASE_ACCESS_TOKEN
```

Rollback:

```bash
# Apply the .down.sql migration manually via Supabase SQL editor.
# Never auto-roll-back in CI — destructive operations require eyes on them.
```

### Vercel deploy

- `main` → production (`draftdeck.com`).
- PR branches → preview URL posted as a check.
- Env vars managed in Vercel dashboard. Secrets never checked into git.
- To force-redeploy prod: `vercel --prod` (requires `VERCEL_TOKEN`).
- To rollback prod: Vercel dashboard → Deployments → promote a previous deploy.

---

## Testing recipes

### Run the integration test suite

Integration tests drive SQL functions end-to-end against local
Supabase using typed seed helpers in `tests/fixtures/seed.ts`.
Catches the class of latent bug P9.5 + P10.5 surfaced
(reconcile UPDATE-FROM, ceremony check-constraint /
FK cascades) pre-commit rather than post-deploy.

```bash
# Prereq: local Supabase stack running + migrations applied.
supabase start
pnpm db:push

# Run all three integration files (rls + reconcile + ceremony).
pnpm test:integration
```

**When to run** (pre-commit reminder):

| Change touches…                                 | Run `pnpm test:integration` |
|-------------------------------------------------|-----------------------------|
| `src/lib/mlb/reconcile.ts`                      | Yes                         |
| Any scoring SQL function (`_compute_*_fp`, etc.)| Yes                         |
| Any vault SQL function (`commit_vault_selection`, `vault_card_midseason`, `destroy_vaulted_card`) | Yes |
| A migration that touches `game_event`, `contest_lineup_slot`, `card`, `token`, or `vault_entry` | Yes |
| Pure UI / `src/components/`                     | No                          |
| New Server Action (non-scoring)                 | No, write a targeted unit test |

Seed library + mock-provider contract live in
`tests/fixtures/{seed,mock-provider}.ts`. Each test cleans up
via `cleanupUser(userId)` which `DELETE FROM auth.users`
CASCADEs through every owner-scoped row.

### Run one test file

```bash
pnpm test tests/unit/scoring.test.ts
pnpm test -- --run tests/integration/rls.test.ts
pnpm e2e tests/e2e/critical-path.spec.ts
```

### Test with a specific Supabase project

```bash
TEST_DATABASE_URL=postgres://... pnpm test:integration
```

### Seed a specific test state

```bash
pnpm db:seed:scenario <scenario-name>
# Scenarios: "fresh-user", "near-cap", "mid-season",
#            "expired-cards", "vault-eligible"
```

### Playwright trace / debug a failure

```bash
pnpm e2e --trace on
# Opens trace viewer: npx playwright show-trace test-results/<trace>.zip
```

---

## BallDontLie integration

### Test a webhook locally (ngrok)

```bash
# 1. Install ngrok if you haven't (one-time)
brew install ngrok

# 2. Start the dev server
pnpm dev

# 3. In another terminal, expose localhost
ngrok http 3000
# → copy the forwarding URL (e.g. https://abc123.ngrok-free.app)

# 4. In the BallDontLie dashboard (dev account):
#    - Webhooks → New subscription
#    - URL: <ngrok-url>/api/webhooks/balldontlie/mlb
#    - Copy the signing secret → paste into BDL_WEBHOOK_SECRET in .env.local
#    - Restart pnpm dev so the new env var loads

# 5. Trigger a test event from the BDL dashboard

# 6. Verify end-to-end:
#    - Next.js terminal: "POST /api/webhooks/balldontlie/mlb 200"
#    - Postgres: SELECT * FROM webhook_delivery ORDER BY received_at DESC LIMIT 1;
#    - status should be 'processed'
#    - If 'failed', check webhook_failed.error_message for the reason.
```

### Verify signature verification (unit)

```bash
pnpm test tests/unit/webhook-hmac.test.ts
```

### Run a cron manually (local)

Every cron requires `Authorization: Bearer $CRON_SECRET`. Source env and run with:

```bash
export CRON_SECRET=$(grep ^CRON_SECRET .env.local | cut -d= -f2- | tr -d '"')

# Daily roster sync (teams + active players)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/bdl-roster-sync | jq

# Daily games pre-fetch (today's schedule)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/bdl-games-prefetch | jq

# Daily injuries sync (sets player.status = 'il' / clears it)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/bdl-injuries-sync | jq

# Photo sync (stubbed until MLBAM join strategy is locked — §8.1)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/bdl-photo-sync | jq

# Webhook retry (re-dispatches rows in webhook_failed)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/webhook-retry | jq
```

Missing or wrong `Authorization` header → 401 `UNAUTHENTICATED`.
Missing `BDL_API_KEY` → 500 with "BDL_API_KEY is not set".

---

## Debugging

### View server logs (local)

Logs stream to the terminal where `pnpm dev` runs. Structured fields. Use `log.child({ ... })` to scope.

### View server logs (prod)

```bash
vercel logs --follow
# Or: Vercel dashboard → Deployments → latest → Functions
```

### Check Sentry for recent errors

- Dashboard: `https://sentry.io/organizations/<org>/issues/`
- Filter by `environment: production` or `preview`.

### Inspect PostHog events

- Dashboard → Events. Filter by `event name` and `user ID`.

### Inspect Supabase data

```bash
# Local
open http://localhost:54323

# Cloud (dev / prod)
# Supabase dashboard → SQL editor or Table editor
```

### Run arbitrary SQL on local DB

```bash
psql postgres://postgres:postgres@localhost:54322/postgres
# Or via Studio SQL editor at localhost:54323
```

### Check RLS for a user

```sql
-- Impersonate a user (server-side only)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '<user-uuid>';
SELECT * FROM card; -- returns only their cards
RESET ROLE;
```

---

## Common scenarios

### Add a new table

1. Read the DB schema spec to check the table isn't already specified.
2. Add to the appropriate `src/lib/db/schema/*.ts` file.
3. `pnpm db:generate` creates the migration.
4. Hand-author the RLS policy file: `supabase/migrations/<ts>_rls_<table>.sql`.
5. Write the matching down migration.
6. `pnpm db:push` locally.
7. Add a smoke test that confirms RLS works.
8. If using the `new-drizzle-migration` skill, all the above is one invocation.

### Add a new Server Action

1. Read the API spec for the action's contract.
2. Add zod schema to `src/lib/contracts/<domain>.ts`.
3. Write the SQL function first (if it mutates). `supabase/migrations/<ts>_fn_<name>.sql`.
4. Write the Server Action in `app/actions/<domain>.ts`, wrapping the SQL function.
5. Wrap with `wrapAction()` (from `src/lib/observability/`) for Sentry + PostHog.
6. Write an integration test in `tests/integration/actions/<domain>.test.ts`.
7. Wire UI that calls it.
8. Or use the `new-server-action` skill for all of the above scaffolded.

### Add a new cron endpoint

1. Create `app/api/cron/<name>/route.ts`.
2. Call `assertCronAuth(req)` at the top.
3. Implement the work; wrap in `withSentry(...)` transaction.
4. Register schedule in `vercel.json`.
5. Test locally with `curl -H "Authorization: Bearer $CRON_SECRET" ...`.
6. Or use the `new-cron-endpoint` skill.

### Reset a stuck local dev DB

```bash
supabase stop
docker volume ls | grep supabase | awk '{print $2}' | xargs docker volume rm
supabase start
pnpm db:push
pnpm db:seed
```

### Invalidate TanStack Query cache during dev

- In DevTools: `queryClient.clear()` from the TanStack Query devtools panel.

---

## CI (GitHub Actions)

All PRs run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (unit + integration)
- `pnpm e2e` against a Vercel preview URL

`main` merges also:
- Apply migrations to `draftdeck-prod` via `supabase db push --linked`.
- Vercel auto-promotes deploy.
- Trigger PostHog feature-flag sync.

Workflows live in `.github/workflows/`.

---

## Package scripts reference

All `pnpm` scripts (defined in `package.json`):

| Command                     | What it does                                                |
|-----------------------------|-------------------------------------------------------------|
| `pnpm dev`                  | Next.js dev server on :3000                                 |
| `pnpm build`                | Next.js production build                                    |
| `pnpm start`                | Next.js production server (local preview)                   |
| `pnpm lint`                 | Biome check                                                 |
| `pnpm format`               | Biome format (auto-fix)                                     |
| `pnpm typecheck`            | `tsc --noEmit`                                              |
| `pnpm test`                 | Vitest run (unit + integration)                             |
| `pnpm test:watch`           | Vitest watch mode                                           |
| `pnpm test:unit`            | Vitest: unit only                                           |
| `pnpm test:integration`     | Vitest: integration only                                    |
| `pnpm e2e`                  | Playwright against local dev                                |
| `pnpm e2e:ui`               | Playwright UI mode                                          |
| `pnpm db:generate`          | Generate a Drizzle migration from schema diff               |
| `pnpm db:push`              | Apply migrations to local Supabase                          |
| `pnpm db:seed`              | Run seed script (economy config + season + test data)       |
| `pnpm db:reset`             | Drop + re-migrate + re-seed local                           |
| `pnpm db:diff`              | Show pending migrations vs. schema                          |
| `pnpm db:seed:scenario`     | Seed a specific test scenario                               |
| `pnpm webhook:replay`       | Re-dispatch a `webhook_failed` row                          |
| `pnpm seed:game-events`     | Generate fake webhook payloads for offline dev              |

---

## When something is on fire

- **App returning 500s broadly:** Vercel → Rollback to previous deploy (one click). Then investigate.
- **Sentry flooding with `BDLAuthError`:** BDL key rotated or expired. Check BDL dashboard, regenerate, update Vercel env.
- **Webhook endpoint auto-disabled by BDL:** Check webhook dashboard; error rate > threshold. Fix root cause in `webhook_failed`, re-enable.
- **Rate limiter blocking legitimate traffic:** Raise the limit in `src/lib/rate-limit/` after understanding what spiked.
- **DB migration wedged in prod:** DO NOT rerun blindly. Check Supabase logs. Usually a naming or constraint issue. If the migration is half-applied, you may need a manual SQL fix via Supabase SQL editor.
- **Supabase Realtime silent:** Check browser console for subscription errors; check RLS policies (Realtime respects RLS).

Sentry + Vercel logs + Supabase logs — triangulate from all three.

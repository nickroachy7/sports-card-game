# Draft Deck — API & Server Actions Specification (v0.1)

**Companion to:** `draft-deck-gameplay-spec.md` (v0.2), `draft-deck-ui-ux-spec.md` (v0.1), `draft-deck-tech-stack-spec.md` (v0.1), `draft-deck-database-schema-spec.md` (v0.1), `draft-deck-balldontlie-integration.md` (v0.1).
**Status:** Canonical catalog of every API route, Server Action, cron target, webhook receiver, and Realtime subscription the launch app needs.
**Platform:** Next.js 15 App Router + Vercel + Supabase.

---

## 1. Design Principles

1. **Two styles, clear boundaries.** Internal user-initiated mutations use **Server Actions**. External surfaces (webhooks, Vercel Cron invocations, public-read endpoints called outside the Next.js app, future mobile clients) use **Route Handlers** under `app/api/*`. Never mix.
2. **Type-safety end-to-end.** Server Actions are typed TypeScript functions called directly by client components. Route Handlers are wrapped with zod-validated request/response schemas shared between server and client via a thin `contracts/` module.
3. **Don't fight the database.** Anywhere a mutation exists, the authoritative state lives in a database function (`spend_coins`, `credit_coins`, `apply_token`, `resolve_contest_entry`, etc.) — the Server Action or Route Handler is a thin wrapper around the SQL.
4. **RLS is the first line of defense.** Auth checks in the API layer are an additional belt on top of the RLS suspenders. Never an alternative to RLS.
5. **Everything that mutates is rate-limited.** Upstash-backed middleware enforces per-user + per-IP caps on write endpoints. Reads are not rate-limited in v1.
6. **Idempotency where it matters.** Pack open, contest submit, contract extend, quick-sell all accept an `Idempotency-Key` header (or `idempotency_key` arg on Server Actions) to prevent duplicate writes from network retries.

---

## 2. Conventions

### 2.1 Response envelope

All Route Handlers return JSON in one of two shapes:

**Success:**
```json
{ "data": { ... }, "meta": { ... } }
```

**Error:**
```json
{
  "error": {
    "code": "INSUFFICIENT_COINS",
    "message": "Need 250 more coins.",
    "detail": { "required": 1000, "balance": 750 }
  }
}
```

Server Actions return typed result unions: `{ ok: true; data } | { ok: false; error }`.

### 2.2 Error code catalog

| Code                          | HTTP | Meaning                                                             |
|-------------------------------|------|---------------------------------------------------------------------|
| `UNAUTHENTICATED`             | 401  | No valid session                                                    |
| `FORBIDDEN`                   | 403  | Authenticated but not allowed (admin-only route, wrong user, etc.)  |
| `NOT_FOUND`                   | 404  | Resource doesn't exist or isn't visible to this user                |
| `VALIDATION`                  | 400  | Input failed schema validation (zod issue list in `detail`)         |
| `CONFLICT`                    | 409  | State conflict (e.g. lineup already locked, card already expired)    |
| `RATE_LIMITED`                | 429  | Request exceeded rate cap                                           |
| `INSUFFICIENT_COINS`          | 409  | Not enough coins for the action                                     |
| `COLLECTION_AT_CAP`           | 409  | Collection cap reached; can't add a new card without quick-sell     |
| `TOKEN_ALREADY_APPLIED`       | 409  | Token is already on a card                                          |
| `TOKEN_INELIGIBLE`            | 409  | Token type doesn't apply to this card (hitter token on pitcher, etc.) |
| `CARD_EXPIRED`                | 409  | Card can't be played; needs extension                                |
| `CARD_INELIGIBLE`             | 409  | Card can't fill this slot (position mismatch, IL, DFA, retired)     |
| `CONTEST_LOCKED`              | 409  | Submission / edit window has closed                                 |
| `IDEMPOTENCY_KEY_REUSED`      | 409  | Key was used with a different payload                                |
| `VENDOR_UNAVAILABLE`          | 502  | Upstream (BallDontLie) failure after retries                        |
| `INTERNAL`                    | 500  | Unhandled server error — always reported to Sentry                   |

### 2.3 Path naming

- Route Handlers live under `src/app/api/<domain>/<resource>/route.ts`.
- Cron-only routes live under `src/app/api/cron/<job>/route.ts`.
- Webhook receivers live under `src/app/api/webhooks/<provider>/<event-group>/route.ts`.
- Server Actions live under `src/app/actions/<domain>.ts`.

### 2.4 Authentication header / session

- Client requests carry Supabase session cookie automatically via `@supabase/ssr`.
- Server Actions and Route Handlers read the session with `createServerClient(cookies)`.
- Cron endpoints require `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron injects this; no other caller has the secret.
- Webhook endpoints verify per-vendor signatures (see §6.1 for BallDontLie).

### 2.5 Rate limits (defaults)

Global per-user caps on write endpoints, enforced in Next.js middleware:

| Endpoint class                 | Limit                              |
|--------------------------------|------------------------------------|
| Pack open                      | 30/minute per user                  |
| Contract extend                | 20/minute per user                  |
| Quick-sell                     | 60/minute per user                  |
| Token apply / remove           | 60/minute per user                  |
| Contest entry mutation         | 60/minute per user                  |
| Contest entry submit           | 10/minute per user                  |
| Profile update                 | 10/minute per user                  |
| Read endpoints                 | Not rate-limited at launch          |
| Webhook receiver (inbound)     | 3000/minute (vendor-level)          |
| Cron endpoints                 | Vercel-controlled                   |

Backed by Upstash Redis. Responses include `X-RateLimit-*` headers.

### 2.6 Idempotency

Any mutation that moves coins, creates a `card`, or writes a `contest_entry` accepts an optional `idempotency_key` (UUID). Duplicate calls with the same `(user_id, key)` within 24h return the original result. Stored in a lightweight `idempotency_log` table (not yet in the schema spec — add in Phase 1).

---

## 3. Server Actions (user-initiated mutations)

Called directly from client components via Next.js Server Actions. All automatically carry the user's session. All return `{ ok, data? , error? }`.

All Server Actions are grouped under `src/app/actions/`:

```
actions/
├── profile.ts       — team identity, onboarding
├── packs.ts         — pack opening flows
├── cards.ts         — quick-sell, extend contract
├── tokens.ts        — apply / remove tokens
├── lineup.ts        — build, edit, submit contest lineup
├── vault.ts         — end-of-season vault ceremony
└── support.ts       — user-initiated support flows (account delete, etc.)
```

### 3.1 `profile.ts`

#### `updateTeamIdentity({ teamName, primaryColor, secondaryColor, logoId })`
Updates the user's profile.
- **Tables:** `profile` (update).
- **Validates:** team name length (3–24 chars), uniqueness globally, color hex format, logo id in preset library.
- **Errors:** `VALIDATION`, `CONFLICT` (name taken).
- **Moderation hook:** runs team name through `text-moderation` check (deferred: built-in deny list at launch, LLM-based review later).

#### `completeOnboarding({ teamName, primaryColor, secondaryColor, logoId, idempotencyKey })`
Single-call onboarding: creates profile, grants starter bundle (10 Bronze cards + 500 coins + 2 tokens), marks onboarding complete.
- **Tables:** `profile` (insert), `manager_account` (insert), `user_season_state` (insert), `card` (insert × 10), `token` (insert × 2), `coin_transaction` (insert), `pack_opening` (insert — source = `onboarding`).
- **Transaction-wrapped** (SQL function `onboard_user()`).
- **Errors:** `CONFLICT` (already onboarded).

#### `completeTutorial({ idempotencyKey })`
Marks tutorial complete and grants one free Standard Pack.
- **Tables:** inserts a `pack_opening` with pack_type = `standard` and no coin cost; updates `manager_account.flags`.
- **Errors:** `CONFLICT` (already completed).

---

### 3.2 `packs.ts`

#### `openPack({ packType, idempotencyKey })` where `packType ∈ 'daily' | 'standard' | 'premium'`
Opens a pack. Handles daily-claim logic, coin debit, card draw with player-tier weighting, duplicate auto-quick-sell, token drop, collection-cap check.
- **Preconditions:**
  - `daily`: user's `daily_pack_claimed_at` is null for today.
  - `standard` / `premium`: user has enough coins; collection has room OR has been resolved via subsequent `resolveCapOverflow` action.
- **Tables:** `pack_opening` (insert), `card` (insert N — for keeps), `token` (insert 0..N), `coin_transaction` (insert — debit for paid, credit for dupe sells), `user_season_state` (update coins, daily_pack_claimed_at).
- **Wraps SQL function** `open_pack(user_id, pack_type)` that does the weighted random draw and all inserts atomically.
- **Returns:** `{ openingId, cardsGranted, duplicatesSold, tokensGranted, coinsEarnedFromDupes, balanceAfter }`.
- **Errors:** `INSUFFICIENT_COINS`, `COLLECTION_AT_CAP` (unless `capOverride` strategy supplied; see below).

#### `resolveCapOverflow({ openingId, keepCardId, sellCardIds, idempotencyKey })`
When `openPack` returns `COLLECTION_AT_CAP`, the server has already drawn the new cards and marked them in a pending state. This action commits the user's decision: pick one new card to keep (from the new draw) and one existing card to quick-sell to make room, OR quick-sell the newly-drawn one.
- **Tables:** `card` (updates pending cards, deletes via quick-sell flow), `coin_transaction`.
- **Errors:** `NOT_FOUND`, `VALIDATION`.

---

### 3.3 `cards.ts`

#### `quickSellCard({ cardId, idempotencyKey })`
- **Preconditions:** card is owned by user, not vaulted, no applied token.
- **Tables:** `card` (delete), `coin_transaction` (insert), `user_season_state` (update coins).
- **Wraps SQL function** `quick_sell_card(card_id)`.
- **Returns:** `{ coinsEarned, balanceAfter }`.
- **Errors:** `NOT_FOUND`, `TOKEN_APPLIED`, `CONFLICT` (vaulted — cannot sell).

#### `extendCardContract({ cardId, plays, idempotencyKey })` where `plays ∈ 5 | 10 | 15`
- **Preconditions:** card owned by user, not vaulted, user has enough coins.
- **Tables:** `contract_extension` (insert), `card` (update: `contract_plays_remaining += plays`, `extension_count += 1`, `is_expired = false`), `coin_transaction`, `user_season_state`.
- **Wraps SQL function** `extend_card(card_id, plays)` which computes cost from `economy_config` + current tier + extension count, atomically debits and applies.
- **Returns:** `{ newPlaysRemaining, coinsCost, balanceAfter }`.
- **Errors:** `INSUFFICIENT_COINS`, `NOT_FOUND`.

---

### 3.4 `tokens.ts`

#### `applyToken({ tokenId, cardId, contestId, idempotencyKey })`
- **Preconditions:** token owned by user, not yet applied, not consumed. Card owned by user, not expired, not vaulted. Contest is not locked. Token type is eligible for card (hitter tokens on hitter cards, pitcher tokens on pitcher cards). Card is a starter in user's lineup for this contest (or this is a Card-Detail-level application that also sets the card as a starter — decide).
- **Tables:** `token` (update: set `applied_to_card_id`, `applied_to_contest_id`), `token_application` (insert with `triggered = null`), `card` (update: `applied_token_id`, `tokens_applied_count += 1`), `contest_lineup_slot` (update: set `token_application_id`).
- **Wraps SQL function** `apply_token(token_id, card_id, contest_id)`.
- **Errors:** `TOKEN_INELIGIBLE`, `TOKEN_ALREADY_APPLIED`, `CARD_EXPIRED`, `CARD_INELIGIBLE`, `CONTEST_LOCKED`.

#### `removeToken({ tokenApplicationId, idempotencyKey })`
- **Preconditions:** user owns the application, contest not yet locked.
- **Tables:** `token_application` (delete), `token` (update: clear applied_to_*), `card` (update: clear applied_token_id, decrement tokens_applied_count), `contest_lineup_slot` (update: clear token_application_id).
- **Errors:** `CONTEST_LOCKED`, `NOT_FOUND`.

---

### 3.5 `lineup.ts`

#### `createOrEnterContestEntry({ contestId, idempotencyKey })`
Creates a `contest_entry` in `building` state if one doesn't exist for this user + contest.
- **Preconditions:** contest is in `pending` status.
- **Tables:** `contest_entry` (insert), `contest_lineup_slot` (insert × 10 empty rows).
- **Wraps SQL function** `create_contest_entry(user_id, contest_id)`.
- **Returns:** the entry with all 10 slots.

#### `updateLineupSlot({ entryId, position, starterCardId?, backup1CardId?, backup2CardId? })`
Drag-drop handler. Updates one slot at a time.
- **Preconditions:** user owns entry, entry in `building` state, card(s) are eligible for this position.
- **Tables:** `contest_lineup_slot` (update).
- **Errors:** `CARD_INELIGIBLE`, `CONTEST_LOCKED`.

#### `setLineupAutoSubMode({ entryId, mode })` where `mode ∈ 'smart_auto' | 'manual_priority'`
- **Tables:** `contest_entry` (update).
- **Errors:** `CONTEST_LOCKED`.

#### `submitLineup({ entryId, idempotencyKey })`
Locks the entry, pays coin entry fee, validates complete and legal lineup.
- **Preconditions:** all 10 slots filled with legal cards, user has enough coins for entry fee, contest not yet locked, each starter card has ≥ 1 contract play remaining.
- **Tables:** `contest_entry` (update: status = `submitted`, `submitted_at = now()`, `entry_coin_cost = X`), `coin_transaction` (insert), `user_season_state` (update coins).
- **Wraps SQL function** `submit_lineup(entry_id)`.
- **Returns:** the entry.
- **Errors:** `VALIDATION` (missing slots / illegal lineup), `INSUFFICIENT_COINS`, `CONTEST_LOCKED`, `CARD_EXPIRED`.

#### `lateSwap({ entryId, position, newCardId, idempotencyKey })`
Manual late-swap when a starter is scratched before their game's first pitch.
- **Preconditions:** entry is in `submitted` or `live` status, the card's game hasn't started, new card is eligible and owned.
- **Tables:** `contest_lineup_slot` (update: `final_card_id`, `sub_reason`), `token_application` (if applicable — reassign or cancel).
- **Errors:** `CONTEST_LOCKED` (past first pitch of that game), `CARD_INELIGIBLE`.

---

### 3.6 `vault.ts`

#### `getVaultCeremonyPreview({ seasonId })`
Read-side companion to the ceremony. Returns season recap + list of vault-eligible cards.
- **Tables:** `manager_account`, `user_season_state`, `team_milestone_state`, `team_milestone_award` (season summary); `card` (eligible list).
- **Returns:** `{ recap, eligibleCards: Card[] }`.

#### `commitVaultSelection({ seasonId, cardIds, idempotencyKey })`
Finalizes the end-of-season ceremony. Vaults the chosen 0–10 cards, dissolves the rest, zeros out coins and tokens.
- **Preconditions:** season status = `offseason` (window opened by the season-close cron), user has not yet committed.
- **Tables:** `vault_entry` (insert × ≤10), `card` (update is_vaulted = true for chosen; delete for the rest), `token` (delete all), `user_season_state` (update: `coins = 0`).
- **Wraps SQL function** `commit_vault_selection(user_id, season_id, card_ids)`.
- **Errors:** `VALIDATION` (more than 10 cards), `CONFLICT` (already committed), `NOT_FOUND` (card not in user's collection).

---

### 3.7 `support.ts`

#### `requestAccountDeletion()`
Marks account for deletion. Manual-support flow for v1.
- **Tables:** Writes to a `support_ticket` table (not yet in schema — add in Phase 1 alongside idempotency log).
- Does NOT actually delete data. Support processes manually.

---

## 4. Public Read Route Handlers

Server-rendered routes (collection pages, public profiles, leaderboards) fetch data inside Server Components using Drizzle directly — no API route needed. But a handful of reads still want Route Handlers: anything cached at the edge, shared with a future mobile app, or externally callable.

### 4.1 `GET /api/config/economy` (public, cacheable)
Returns the currently-active `economy_config` row, trimmed to only fields the client needs (tier thresholds, quick-sell values, extension cost schedule, pack prices, pack sizes, token bonus FP, milestone tiers).
- **Cache:** `s-maxage=300, stale-while-revalidate=60`.
- **Tables:** `economy_config`.

### 4.2 `GET /api/leaderboards/[type]` (public)
`type ∈ 'manager-level' | 'season-fp' | 'card-prestige' | 'vault-prestige'`.
Returns top 100 + the requesting user's rank if they're below 100.
- **Query params:** `season_id?` (for season-scoped boards), `cursor?`, `per_page?` (default 100).
- **Tables:** depends on type:
  - `manager-level`: `manager_account` JOIN `profile`.
  - `season-fp`: `user_season_state` JOIN `profile` scoped to current season.
  - `card-prestige`: aggregated query counting `card.current_tier = 'diamond' AND is_vaulted = false` per user this season.
  - `vault-prestige`: aggregated query counting lifetime `vault_entry.final_tier = 'diamond'` per user.
- **Cache:** `s-maxage=60, stale-while-revalidate=30`.

### 4.3 `GET /api/profile/[teamName]` (public)
Returns a user's public profile by team name.
- **Response shape:** `{ profile, managerAccount, currentSeasonStats, vaultSummary }`.
- **Cache:** `s-maxage=60`.
- **Tables:** `profile`, `manager_account`, `user_season_state`, `team_milestone_state`, `vault_entry` (counts / summary).

### 4.4 `GET /api/profile/[teamName]/vault` (public)
Paginated vault view by season.
- **Query params:** `season_id?`, `cursor?`, `per_page?`.
- **Tables:** `vault_entry` JOIN `player`.

---

## 5. Cron Route Handlers

All under `src/app/api/cron/<job>/route.ts`. All require `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron configuration lives in `vercel.json`.

### 5.1 `GET /api/cron/bdl-roster-sync` — daily 04:00 ET
Pulls active rosters from BDL and upserts into `player`.
- **Calls:** `bdl.mlb.getActivePlayers()` (paginated via cursor helper).
- **Tables:** `player` (upsert). Detects status changes and logs to an optional `player_status_change` audit (nice-to-have, deferred).
- **Alerts:** Sentry on auth failures, rate-limit failures, or if total players drop by >5% session-to-session (catch data issues).

### 5.2 `GET /api/cron/bdl-injuries-sync` — daily 04:15 ET
Pulls player injuries and updates `player.status`.
- **Calls:** `bdl.mlb.getPlayerInjuries()`.
- **Tables:** `player` (update status to `il` or back to `active`).

### 5.3 `GET /api/cron/bdl-games-prefetch` — daily 06:00 ET
Pulls today's scheduled games.
- **Calls:** `bdl.mlb.getGames({ dates: [today] })`.
- **Tables:** `game` (upsert).

### 5.4 `GET /api/cron/bdl-game-repair` — every 10 min during game windows
Reconciles games that have been `live` for too long without a recent `game_event` (webhook drop indicator).
- **Calls:** `bdl.mlb.getGame(gameId)` for affected games.
- **Tables:** `game` (update status, scores), `game_event` (insert reconciliation rows with `source = 'repair'`).

### 5.5 `GET /api/cron/bdl-game-final` — triggered by `mlb.game.ended` webhook (not strictly a cron, but lives here)
Post-game box-score pull to reconcile pitcher stats and fill gaps webhooks didn't cover.
- **Calls:** `bdl.mlb.getStats({ game_ids: [id] })`.
- **Tables:** `game_event` (insert box-score events with `source = 'backfill'`), triggers `contest_entry` scoring reconciliation.

### 5.6 `GET /api/cron/bdl-photo-sync` — weekly Sun 02:00 ET
Iterates `player` rows missing `photo_url`, fetches from MLB static CDN, uploads to Supabase Storage.
- **Tables:** `player` (update `photo_url`, `photo_synced_at`).

### 5.7 `GET /api/cron/webhook-retry` — every 5 min
Processes `webhook_failed` rows with `retry_count < 5` and `next_retry_at <= now()`.
- **Tables:** `webhook_failed` (update), `game_event` (insert if reprocess succeeds).

### 5.8 `GET /api/cron/daily-pack-reset` — daily 00:00 UTC
Clears `user_season_state.daily_pack_claimed_at` for all users (or more efficiently — the Daily Pack is "ready" if `daily_pack_claimed_at < today at 00:00 UTC`, so no reset needed; this cron can be a no-op placeholder or deleted).
- **Decision:** Use a comparison-based check instead of a reset job. This cron **removed** in v1.

### 5.9 `GET /api/cron/login-streak-eval` — daily 04:30 ET
For users whose `login_streak_last_day < yesterday`, reset streak to 0. For users who logged in yesterday but no coin credit yet — credit tier-appropriate streak bonus.
- **Tables:** `user_season_state` (update), `coin_transaction` (insert).

### 5.10 `GET /api/cron/opening-day` — Opening Day 06:00 ET (one-time per season)
Bulk-grants the starter bundle to every user account for the new season.
- **Tables:** `card` (insert × 10 × users), `token` (insert × 2 × users), `coin_transaction` (insert × users), `user_season_state` (insert new rows for the new season).
- **Batched** via a background queue to avoid Vercel function time limits at scale.

### 5.11 `GET /api/cron/season-close` — day after World Series final
Closes the season, flips all season-scoped balances to 0, opens the vault ceremony window for every user.
- **Tables:** `season` (update status to `offseason`, `closed_at`), `user_season_state` (... see vault-ceremony flow).
- **Does NOT** dissolve cards/tokens/coins immediately — that happens per-user via `commitVaultSelection`.
- **After a grace period** (e.g. 14 days post-close), a follow-up job auto-dissolves for users who haven't committed, preserving nothing.

---

## 6. Webhook Receivers

### 6.1 `POST /api/webhooks/balldontlie/mlb`

Full receiver spec lives in `draft-deck-balldontlie-integration.md` §5. Summary:

- **Signature verification** via HMAC-SHA256 over `{timestamp}.{raw_body}`, matched against `X-BDL-Webhook-Signature`.
- **Replay protection** via `X-BDL-Webhook-Timestamp` (5-min window).
- **Dedup** via `X-BDL-Webhook-Id` → `webhook_delivery` table upsert.
- **Always returns 200** unless signature fails (then 401). Failed processing writes to `webhook_failed` and returns 200.
- **Tables:** `webhook_delivery` (insert), `webhook_failed` (insert on error), `game_event` (insert on success), triggers `contest_entry.live_score` recompute, triggers `token_application.triggered` evaluation.

Rate-limit: 3000/minute (trusted vendor; actual incoming rate is well below).

---

## 7. Admin Routes (role-gated)

Deferred to post-launch. Launch uses **Supabase Studio + SQL scripts** per tech spec §14. When the admin panel is built, routes will live under `src/app/api/admin/*` gated by a `role = 'admin'` JWT claim.

Sketch of eventual routes:

- `POST /api/admin/grants` — create a `manual_grant`.
- `PATCH /api/admin/profile/[userId]` — rename or moderate a user.
- `POST /api/admin/economy/rollout` — publish a new `economy_config` row.
- `POST /api/admin/season/close` — manual trigger for the season-close flow.
- `GET /api/admin/webhooks/failed` — inspect `webhook_failed` rows.
- `POST /api/admin/webhooks/replay/[deliveryId]` — re-dispatch a failed webhook.

All require admin JWT claim. Audit all actions.

---

## 8. Realtime Subscriptions (Supabase Realtime from the client)

Not API routes, but part of the app's data contract. Clients subscribe directly to Supabase Realtime channels for live updates.

| Channel                                         | Filter                                                   | Surface                              |
|-------------------------------------------------|----------------------------------------------------------|--------------------------------------|
| `contest_entry:row_updates`                     | `user_id = auth.uid() AND contest_id = X`                | Live contest view: score + rank      |
| `contest_lineup_slot:row_updates`               | via join to contest_entry with user_id filter            | Per-slot live FP updates             |
| `game_event:inserts`                            | `game_id IN (games touching user's current lineup)`      | Live event feed                      |
| `card:row_updates`                              | `user_id = auth.uid()`                                   | Tier-up cut-in triggers              |
| `user_season_state:row_updates`                 | `user_id = auth.uid()`                                   | Coin balance in header               |

Clients set these up in a `useRealtimeX` hook per surface. RLS ensures users only see their own rows.

On each Realtime event, the client either updates React state directly (for small denormalized fields like coin balance) or calls `queryClient.invalidateQueries(...)` (for richer views like the live contest).

---

## 9. Open Questions

1. **Idempotency log table.** Not yet in the schema spec. Add in Phase 1 alongside support ticket table. Retention: 24h rolling.
2. **Server Actions vs. Route Handlers for onboarding.** Onboarding is a form submission — Server Action fits cleanly. But it's also a new-user flow where cookies aren't yet set reliably — consider making it a Route Handler for explicit cookie handling.
3. **Late swap window precision.** Spec says "before first pitch of THAT game." Implementation question: is `game.scheduled_start` a reliable first-pitch time, or do we need a BDL `mlb.game.started` webhook-driven cutoff? Likely the latter.
4. **Pack "capOverflow" UX vs. API.** Is the pack drawn server-side and then gated at commit, or do we refuse the draw if the cap is full? Current spec draws first and commits with a decision. Reconsider if this leads to locked-in-limbo state on abandoned sessions.
5. **Contest entry coin-refund on late-scratch.** If a card is subbed out pre-game, no contract play is consumed — but no coin entry fee refund either. Confirm this is the right call.
6. **Manager XP writes.** Manager XP is incremented from multiple sources (contest win, tier up, milestone, token trigger). Should be a single `grant_manager_xp(user_id, amount, source)` SQL function called from each code path. Design locked; implementation in Phase 1.
7. **Bulk opening day distribution.** At 10k users × 10 starter cards, the opening-day cron inserts 100k rows. Likely fine within Vercel Pro's 300s window, but benchmark. If tight, shard by user ID modulo or move to Inngest.
8. **Route-level observability.** Each Route Handler / Server Action should emit a Sentry transaction for performance tracing. Standardize via a small `wrapAction(...)` helper.
9. **zod schemas location.** Shared `src/lib/contracts/` directory holds zod schemas used by both Server Actions (for input validation) and Route Handler handlers. Clients can import types from here for form validation. Locked design.

---

## 10. Endpoint Summary (index)

### Server Actions (18)

| Module       | Action                           | Mutates                                            |
|--------------|----------------------------------|----------------------------------------------------|
| `profile`    | `updateTeamIdentity`             | `profile`                                          |
| `profile`    | `completeOnboarding`             | `profile`, `manager_account`, `user_season_state`, `card × 10`, `token × 2`, `coin_transaction`, `pack_opening` |
| `profile`    | `completeTutorial`               | `manager_account`, `pack_opening`                  |
| `packs`      | `openPack`                       | `pack_opening`, `card`, `token`, `coin_transaction`, `user_season_state` |
| `packs`      | `resolveCapOverflow`             | `card`, `coin_transaction`                         |
| `cards`      | `quickSellCard`                  | `card`, `coin_transaction`, `user_season_state`    |
| `cards`      | `extendCardContract`             | `card`, `contract_extension`, `coin_transaction`, `user_season_state` |
| `tokens`     | `applyToken`                     | `token`, `token_application`, `card`, `contest_lineup_slot` |
| `tokens`     | `removeToken`                    | `token`, `token_application`, `card`, `contest_lineup_slot` |
| `lineup`     | `createOrEnterContestEntry`      | `contest_entry`, `contest_lineup_slot × 10`        |
| `lineup`     | `updateLineupSlot`               | `contest_lineup_slot`                              |
| `lineup`     | `setLineupAutoSubMode`           | `contest_entry`                                    |
| `lineup`     | `submitLineup`                   | `contest_entry`, `coin_transaction`, `user_season_state` |
| `lineup`     | `lateSwap`                       | `contest_lineup_slot`, `token_application`         |
| `vault`      | `getVaultCeremonyPreview`        | (read-only)                                        |
| `vault`      | `commitVaultSelection`           | `vault_entry × N`, `card`, `token`, `user_season_state` |
| `support`    | `requestAccountDeletion`         | `support_ticket`                                   |

### Route Handlers — public read (4)

- `GET /api/config/economy`
- `GET /api/leaderboards/[type]`
- `GET /api/profile/[teamName]`
- `GET /api/profile/[teamName]/vault`

### Route Handlers — cron (9 active, 1 removed)

- `GET /api/cron/bdl-roster-sync`
- `GET /api/cron/bdl-injuries-sync`
- `GET /api/cron/bdl-games-prefetch`
- `GET /api/cron/bdl-game-repair`
- `GET /api/cron/bdl-game-final` *(event-triggered, lives here)*
- `GET /api/cron/bdl-photo-sync`
- `GET /api/cron/webhook-retry`
- `GET /api/cron/login-streak-eval`
- `GET /api/cron/opening-day`
- `GET /api/cron/season-close`
- ~~`GET /api/cron/daily-pack-reset`~~ *(removed — comparison-based check replaces)*

### Route Handlers — webhooks (1)

- `POST /api/webhooks/balldontlie/mlb`

### Admin routes

Deferred.

---

## 11. Glossary

- **Server Action:** Next.js 15 App Router pattern for calling server-side functions directly from client components with automatic typed serialization.
- **Route Handler:** the Next.js App Router file (`app/api/.../route.ts`) that handles HTTP requests.
- **Vercel Cron:** platform feature that invokes a Route Handler on a schedule.
- **Upstash Redis:** serverless Redis used for rate-limiting tokens and idempotency keys.
- **Idempotency key:** client-provided opaque token that prevents duplicate side effects on retry.
- **Supabase Realtime:** Postgres-change-triggered WebSocket broadcasts to subscribed clients, scoped by RLS.

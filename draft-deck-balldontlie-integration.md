# Draft Deck — BallDontLie Integration Plan (v0.1)

**Companion to:** `draft-deck-tech-stack-spec.md` (v0.1). This document supersedes §5 (MLB ingest) and §7 (scheduled jobs) of the tech spec where they conflict.
**Tier assumed:** GOAT ($39.99/mo, 600 req/min). Committed by user.
**Status:** Research-backed plan, some items flagged for live verification against the actual API before committing code.

---

## 1. Verified Facts

Verified directly from the official npm package `@balldontlie/sdk@1.2.2` (bundled type definitions and client source) and from BallDontLie's webhooks documentation. Reference type copies are checked into `reference/balldontlie-sdk-mlb-methods.d.ts` and `reference/balldontlie-sdk-mlb-types.d.ts` in this repo.

- **Package:** `@balldontlie/sdk` (MIT, axios-based, TypeScript types bundled).
- **Base URL:** `https://api.balldontlie.io` (default; overridable via `baseUrl` config).
- **Auth header:** `Authorization: <apiKey>` — raw key, **no `Bearer` prefix**. SDK also sends `x-bdl-client: js` automatically.
- **Client entry:** `new BalldontlieAPI({ apiKey }).mlb` exposes `getTeams`, `getTeam`, `getPlayers`, `getActivePlayers`, `getGames`, `getGame`, `getStats`, `getStandings`, `getPlayerInjuries`, `getSeasonStats`, `getTeamSeasonStats` (11 methods).
- **Error classes:** `APIError`, `AuthenticationError` (401), `ValidationError` (400), `NotFoundError` (404), `RateLimitError` (429), `ServerError` (5xx). All thrown from the SDK; no need to hand-roll.
- **Response envelope:** `ApiResponse<T> = { data: T, meta?: { next_cursor, per_page } }`. Pagination is **cursor-based** (`cursor` query param, `meta.next_cursor` in response).
- **Array params:** SDK serializes as `key[]=v1&key[]=v2` (confirmed in client source).
- **GOAT tier:** 600 requests/minute; unlocks advanced stats + box scores + betting odds.
- **Webhooks:** HMAC-SHA256 signed, known scheme (§5).
- **Webhook event types for MLB:** ≥ 9 confirmed; vendor documentation claims 130+ total across sports.

**Endpoints the SDK does NOT expose** (will require fall-through to raw fetch or defer):

- `getPlayerSplits` (GOAT tier) — missing from SDK 1.2.2. Not needed for gameplay; defer.
- `getPlayerVersus` (GOAT tier) — missing. Not needed for gameplay; defer.

**Still flagged for verification before production:**

1. Whether any MLB webhook events cover **stolen bases** specifically (partial list observed; full catalog needs vendor-dashboard confirmation).
2. Whether the webhook event payload's `play.type` field differentiates single / double / triple on `mlb.batter.hit` (so we can compute DK-scoring bases without a separate event per hit type).
3. Exact webhook registration flow (dashboard UI only, or programmatic endpoint?).
4. Whether BallDontLie exposes MLBAM IDs on the player object for photo-URL resolution. **The SDK's `MLBPlayer` type has `id`, `jersey`, `dob`, `full_name`, `team` — no `mlbam_id` field.** So we must join externally (name + team + DOB) or accept best-effort matching. See §8.
5. Whether rate-limit response includes `X-RateLimit-*` headers (for proactive throttling), or only 429 on breach.

---

## 2. Architecture — Webhooks-First

This is a meaningful change from the tech spec's original "poll every 30s" design. BallDontLie exposes webhooks, so we pivot to event-driven ingest. Polling remains as a daily roster sync and a scheduled fallback, not the primary live path.

```
┌──────────────────────┐
│ BallDontLie Cloud    │
│                      │
│  REST API            │◀───── scheduled pulls (daily roster, daily games,
│  Webhooks            │          weekly photo sync, live-ingest fallback)
└─────────┬────────────┘
          │ HTTP POST on each MLB event
          │ (HMAC-SHA256 signed)
          ▼
┌───────────────────────────────────────────────┐
│ Next.js on Vercel                             │
│                                               │
│  /api/webhooks/balldontlie/mlb                │ ◀── webhook receiver
│    │                                          │
│    ├─ verify signature (HMAC-SHA256)          │
│    ├─ dedupe via X-BDL-Webhook-Id             │
│    ├─ parse event_type + payload              │
│    └─ insert to game_event; upsert game state │
│                                               │
│  /api/cron/bdl-roster-sync        (daily)     │
│  /api/cron/bdl-games-prefetch     (daily)     │
│  /api/cron/bdl-photo-sync         (weekly)    │
│  /api/cron/bdl-live-fallback      (during games)│
└───────────────────────┬───────────────────────┘
                        │ Drizzle writes
                        ▼
┌───────────────────────────────────────────────┐
│ Supabase Postgres                             │
│                                               │
│  player · game · game_event                   │
│  contest_entry · card · token_application     │
│                                               │
│  Postgres triggers recompute contest scores   │
│  on game_event inserts                        │
└───────────────────────┬───────────────────────┘
                        │ Realtime change broadcast
                        ▼
                   Clients (live contest view)
```

**Why event-driven wins for MLB specifically:** MLB events cluster around pitches (2–4 seconds apart during at-bats) and are sparse between. Polling every 30s misses the dopamine timing of a home run; webhooks put our live-score update on screen within a couple seconds of real life. And 600 req/min is plenty of budget for our REST needs *if* we're not burning it on polling.

---

## 3. MLB REST Endpoint Inventory (SDK-Typed)

All REST access goes through `@balldontlie/sdk`. SDK method names and params shown here are verified against `mlb.d.ts` in v1.2.2.

| SDK call                                  | Tier      | Draft Deck usage                                                                |
|-------------------------------------------|-----------|---------------------------------------------------------------------------------|
| `api.mlb.getTeams({ division?, league? })`| Free      | Seed / sync team metadata                                                        |
| `api.mlb.getTeam(id)`                     | Free      | Rare lookup                                                                      |
| `api.mlb.getPlayers({ ...filters })`      | Free      | Initial pool seed; backup for lookup-by-id (pass `player_ids: [id]`)             |
| `api.mlb.getActivePlayers({ ...filters })`| Free      | **Daily roster sync** — primary driver of `player` table                         |
| `api.mlb.getGames({ dates?, seasons?, team_ids?, postseason? })` | Free | **Daily games pre-fetch** — primary driver of `game`        |
| `api.mlb.getGame(id)`                     | Free      | Game repair / reconcile when a webhook is missed                                 |
| `api.mlb.getStats({ player_ids?, game_ids?, seasons? })` | All-Star | **Post-game box score pull** — fills stats gaps webhooks don't cover     |
| `api.mlb.getSeasonStats({ season, player_ids?, team_id?, postseason?, sort_by?, sort_order? })` | All-Star | Season stat displays (profile, leaderboards)       |
| `api.mlb.getTeamSeasonStats({ season, team_id?, postseason? })` | All-Star | Team milestone eval helpers                                          |
| `api.mlb.getStandings({ season })`        | All-Star  | (Optional display; not required for gameplay)                                    |
| `api.mlb.getPlayerInjuries({ team_ids?, player_ids? })`| All-Star | Sets `player.status = 'il'` for the IL pill                        |
| ~~`getPlayerSplits`~~                     | GOAT      | **Not in SDK 1.2.2.** Raw fetch required if ever needed. Deferred.              |
| ~~`getPlayerVersus`~~                     | GOAT      | **Not in SDK 1.2.2.** Raw fetch required if ever needed. Deferred.              |

**Pagination** is cursor-based on every list endpoint: pass `cursor` + `per_page`, iterate via `response.meta.next_cursor` until it's null.

**Usage cadence (expected):**

- Daily roster sync: 1 call (+ pagination) — once a day.
- Daily games pre-fetch: 1 call — once a day.
- Player injuries sync: 1 call — once a day.
- Post-game box score pull: 1 call per game ending — ~15 calls per evening.
- Game repair cron: up to ~15 calls every 10 min during live slates.
- Total steady state: comfortably under 600 req/min.
- Fallback polling during live games (only if webhooks drop): throttled to ≤ 10 req/sec total via Upstash limiter (§11).

---

## 4. REST Access via the Official SDK

All REST access uses `@balldontlie/sdk` v1.2.2+. The SDK handles auth header construction, cursor pagination helpers, array param serialization, and typed error class mapping. We don't hand-roll a fetch wrapper.

**Single shared client:**

```typescript
// src/lib/mlb/client.ts
import { BalldontlieAPI } from "@balldontlie/sdk";

const apiKey = process.env.BDL_API_KEY;
if (!apiKey) throw new Error("BDL_API_KEY is not set");

export const bdl = new BalldontlieAPI({ apiKey });
// bdl.mlb.getGames(...), bdl.mlb.getStats(...), etc.
```

The client is module-scoped so we get a single axios instance per server runtime. Dev and prod read different `BDL_API_KEY` values from Vercel env.

**Error handling:**

The SDK throws typed subclasses of `APIError` which we map to domain concerns:

```typescript
import { APIError, AuthenticationError, ValidationError,
         NotFoundError, RateLimitError, ServerError } from "@balldontlie/sdk";

async function withBdlRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof RateLimitError) {
        await sleep(1000 * 2 ** attempt);          // 1s, 2s, 4s
        continue;
      }
      if (err instanceof ServerError) {
        await sleep(500 * 2 ** attempt);           // 500ms, 1s, 2s
        continue;
      }
      if (err instanceof AuthenticationError) {
        // Never retry auth errors — this is a config/tier issue.
        captureException(err, { tags: { bdl: "auth" } });
        throw err;
      }
      throw err;                                   // Validation / NotFound / unknown
    }
  }
  throw lastError;
}
```

**Cursor pagination helper** for full-list sync jobs:

```typescript
async function* paginate<T>(
  call: (cursor?: number) => Promise<ApiResponse<T[]>>,
): AsyncGenerator<T> {
  let cursor: number | undefined = undefined;
  do {
    const page = await withBdlRetry(() => call(cursor));
    for (const row of page.data) yield row;
    cursor = page.meta?.next_cursor ?? undefined;
  } while (cursor !== undefined);
}

// Usage in daily roster sync:
for await (const player of paginate((cursor) =>
  bdl.mlb.getActivePlayers({ cursor, per_page: 100 })
)) {
  await upsertPlayer(player);
}
```

**Throttle layer** (Upstash Redis-backed ≤ 10 req/sec outbound) wraps `withBdlRetry`, ensuring we never burst above our budget even during fallback polling scenarios.

---

## 5. Webhook Receiver — Full Implementation Spec

### 5.1 Endpoint

`POST /api/webhooks/balldontlie/mlb` in the Next.js app.

Route handler reads the **raw body** before parsing (signature is over raw bytes), verifies, then parses.

### 5.2 Verification

Three headers are sent by BallDontLie with every webhook delivery:

| Header                     | Purpose                                  |
|----------------------------|-------------------------------------------|
| `X-BDL-Webhook-Signature`  | Signature of `{timestamp}.{raw_body}`, formatted `v1={hex}` |
| `X-BDL-Webhook-Timestamp`  | Unix seconds at send time                |
| `X-BDL-Webhook-Id`         | Globally unique delivery ID (for dedup)  |

**Verification steps (server-side):**

```typescript
import crypto from 'node:crypto';

function verifyBDLWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const signatureHeader = headers.get('x-bdl-webhook-signature');
  const timestamp = headers.get('x-bdl-webhook-timestamp');
  if (!signatureHeader || !timestamp) return false;

  // Reject replays older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age > 300 || age < -30) return false;

  // Expected signature = v1={hmac-sha256(timestamp.rawBody, secret)}
  const message = `${timestamp}.${rawBody}`;
  const expectedHex = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const expected = `v1=${expectedHex}`;

  // Timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

### 5.3 Deduplication

Writes to `webhook_delivery` table keyed by `X-BDL-Webhook-Id`. Insert with `ON CONFLICT (delivery_id) DO NOTHING`. If the row already existed, return 200 without reprocessing. This handles vendor retries safely.

### 5.4 Handler flow

```
1. Read raw body as text (not JSON-parsed yet).
2. Verify signature + timestamp window (§5.2).
3. Check dedup table (§5.3); if already seen → 200 OK, exit.
4. Parse JSON body. Extract event_type.
5. Dispatch to handler for that event_type (§6 catalog).
6. Handler writes to game_event (insert) and optionally updates game.
7. Postgres trigger on game_event fires Supabase Realtime broadcast.
8. Return 200 OK within 5 seconds (to keep the vendor happy and avoid auto-disable).
```

If dispatch fails (parser error, DB error), respond **200 OK** anyway and enqueue the raw payload to a `webhook_failed` table for async reprocessing. Returning 5xx causes the vendor to retry, and auto-disable endpoints that fail consistently.

### 5.5 Secret management

- Webhook secret stored in Vercel env var `BDL_WEBHOOK_SECRET`.
- Dev and prod have distinct secrets.
- Rotation: update secret in BallDontLie dashboard + Vercel env within a few-minute window; brief webhook pause is acceptable.

### 5.6 Local development

Webhooks can't hit localhost. Use `ngrok http 3000` or Cloudflare Tunnel during integration work, point BallDontLie's dev webhook URL at the tunnel. For offline dev, seed `game_event` rows via a script that mimics real webhook payloads.

---

## 6. Webhook Event Catalog (MLB)

### 6.1 Confirmed events (partial; verify full list against vendor dashboard)

| event_type                   | Trigger                         | Fires token  |
|------------------------------|---------------------------------|--------------|
| `mlb.game.started`           | First pitch                     | —            |
| `mlb.game.ended`             | Final out                       | — (closes contest scoring window) |
| `mlb.game.extra_innings`     | Game enters extra innings       | —            |
| `mlb.team.scored`            | Team scored (any run)           | —            |
| `mlb.batter.hit`             | Batter records a hit (any)      | Multi-Hit Bonus accumulator |
| `mlb.batter.home_run`        | Batter hits a HR                | **HR Bonus** |
| `mlb.batter.strikeout`       | Batter struck out (batter POV)  | —            |
| `mlb.batter.walk`            | Batter walked                   | —            |
| `mlb.batter.hit_by_pitch`    | Batter HBP                      | —            |

### 6.2 Events we need and MUST verify (deferred research)

We need all of these to fully support gameplay; verify they exist or find equivalents.

- `mlb.batter.stolen_base` (or equivalent) — for **SB Bonus** token
- `mlb.batter.single` / `.double` / `.triple` — OR parse hit-type from `mlb.batter.hit` payload (likely; `play.type` field probably encodes this)
- `mlb.batter.rbi` or run-scored attribution — scoring needs RBI counts
- `mlb.pitcher.strikeout` — pitcher-POV K count (for **Strikeout Bonus** 8+ K token)
- `mlb.pitcher.inning_pitched` — for IP contribution to pitcher FP
- `mlb.pitcher.earned_run` — negative scoring for pitcher
- `mlb.pitcher.win` / `.loss` — pitcher W (+4 FP)
- `mlb.pitcher.quality_start` — or synthesize at game end

If webhook events don't cover all pitcher outcomes, we fall back to calling `mlb_get_stats` for the completed game right after `mlb.game.ended` to capture the full box score. This is an acceptable hybrid.

### 6.3 Scoring data source map (CRITICAL)

Inspecting the SDK's `MLBStats` interface against our DraftKings-style scoring system (`draft-deck-gameplay-spec.md` §4) reveals gaps that must be filled by webhooks. `MLBStats` (post-game, per-player) has the following fields: `at_bats, runs, hits, rbi, hr, bb, k, avg, obp, slg, ip, p_hits, p_runs, er, p_bb, p_k, p_hr, pitch_count, strikes, era`.

#### Hitter scoring

| DK Event    | DK Points | Source                                                         |
|-------------|-----------|----------------------------------------------------------------|
| Single      | +3        | Derive: `getStats.hits − doubles − triples − HR`. Doubles/triples not in `MLBStats` — **must come from webhook `play.type`** or per-hit webhook events. If unavailable, conservative fallback: treat all non-HR hits as singles (minor scoring drift). |
| Double      | +5        | **Webhook** (`mlb.batter.hit` with `play.type = 'double'`) or a dedicated `.double` event |
| Triple      | +8        | **Webhook** |
| Home Run    | +10       | `MLBStats.hr` ✅ or `mlb.batter.home_run` webhook                |
| RBI         | +2        | `MLBStats.rbi` ✅                                                |
| Run scored  | +2        | `MLBStats.runs` ✅                                               |
| Walk (BB)   | +2        | `MLBStats.bb` ✅ or `mlb.batter.walk` webhook                    |
| Hit-By-Pitch| +2        | **Not in `MLBStats`.** `mlb.batter.hit_by_pitch` webhook required |
| Stolen Base | +5        | **Not in `MLBStats`.** Need SB webhook event (verify catalog) or alternative source |

#### Pitcher scoring

| DK Event              | DK Points | Source                                                         |
|-----------------------|-----------|----------------------------------------------------------------|
| Inning Pitched        | +2.25     | `MLBStats.ip` ✅                                                 |
| Strikeout             | +2        | `MLBStats.p_k` ✅                                                |
| Win                   | +4        | **Not in `MLBStats`.** Derive at `mlb.game.ended`: check `MLBGame` status + winning pitcher logic, or use `MLBSeasonStats.pitching_w` incremental delta |
| Earned Run allowed    | −2        | `MLBStats.er` ✅                                                 |
| Hit allowed           | −0.6      | `MLBStats.p_hits` ✅                                             |
| Walk allowed          | −0.6      | `MLBStats.p_bb` ✅                                               |
| HBP allowed           | −0.6      | **Not in `MLBStats`.** Derive from `mlb.batter.hit_by_pitch` webhooks where the pitcher matches |
| Complete Game         | +2.5      | Derive at game end: `MLBStats.ip ≥ 9` (or per rain-shortened rules) |
| CG Shutout            | +2.5      | Derive: CG + `MLBStats.p_runs = 0`                               |
| No-Hitter             | +5        | Derive: CG + `MLBStats.p_hits = 0`                               |
| Quality Start (token) | +X        | Derive: `MLBStats.ip ≥ 6 && MLBStats.er ≤ 3`                     |

#### Operational implication

**Live contest scoring has two write paths:**

1. **Webhook handler (real-time, partial):** on each webhook event, increment the card's live contest score for the events we *know* webhooks cover (HR, hit, walk, HBP, team.scored). This drives the live contest view.
2. **Post-game reconciliation (authoritative, full):** when `mlb.game.ended` fires, call `bdl.mlb.getStats({ game_ids: [id] })` and reconcile every card rostered in any contest touching that game. Any drift between the live-accumulated score and the box-score-computed score is resolved in favor of the box score. Final FP that lands in `card.career_fp_total` and `contest_entry.final_score` is always the reconciled value.

This two-path design tolerates missed webhook events: worst case, the live score is slightly off until game end, then gets corrected by the stats pull.

### 6.4 Event → token-condition mapping

Draft Deck has 5 launch token types. Every time a relevant event fires, we check every applied token on cards currently rostered in a live contest and evaluate the condition.

| Token              | Triggers on                                                           |
|--------------------|-----------------------------------------------------------------------|
| HR Bonus           | `mlb.batter.home_run` where `batter.id` matches the card's player      |
| Multi-Hit Bonus    | On `mlb.batter.hit`, increment a per-card-per-game counter. Fire when counter ≥ 2. |
| Stolen Base Bonus  | SB webhook event (verify) where `batter.id` matches                    |
| Strikeout Bonus (pitcher) | On `mlb.pitcher.strikeout` (verify), increment a counter. Fire when counter ≥ 8. |
| Quality Start Bonus | On `mlb.game.ended`, pull the box score via `mlb_get_stats` and check if the pitcher recorded a QS (6+ IP, ≤3 ER). |

Token-trigger writes go to `token_application` as `triggered_at`, `bonus_fp_awarded`. The triggering is idempotent because `token_application.token_id` is unique and we only set `triggered_at` once.

### 6.5 Example payload shape (mlb.batter.home_run)

```json
{
  "event_type": "mlb.batter.home_run",
  "game": {
    "id": 782931,
    "home_team_id": 147,
    "away_team_id": 111
  },
  "play": {
    "type": "home_run",
    "text": "Aaron Judge hits a 2-run HR to center field",
    "score_value": 2,
    "inning": 5,
    "inning_half": "top",
    "home_score": 2,
    "away_score": 5
  },
  "batter": {
    "id": 12345,
    "name": "Aaron Judge",
    "team": { "id": 147, "abbreviation": "NYY" }
  },
  "pitcher": {
    "id": 67890,
    "name": "Tarik Skubal",
    "team": { "id": 116, "abbreviation": "DET" }
  }
}
```

(Shape is inferred from vendor examples; verify and lock via zod schemas during integration.)

---

## 7. Scheduled Jobs (REST-Based)

These run on Vercel Cron, hitting Next.js API routes. All use the same `bdlFetch` wrapper (§4).

| Job                         | Schedule         | REST endpoint called         | Writes to                | Notes                                              |
|-----------------------------|------------------|------------------------------|--------------------------|----------------------------------------------------|
| Daily roster sync           | 04:00 ET daily   | `mlb_get_active_players`      | `player`                 | Detects trades, call-ups, IL changes                |
| Daily injuries sync         | 04:15 ET daily   | `mlb_get_player_injuries`    | `player.status`          | Sets/clears IL flags                                |
| Daily games pre-fetch       | 06:00 ET daily   | `mlb_get_games` (today range) | `game`                   | Sets up the day's schedule                          |
| Weekly photo sync           | Sun 02:00 ET     | MLB static URLs (§8)         | `supabase-storage/players/` | Not BDL — hits MLB CDN                             |
| Game repair cron            | Every 10 min     | `mlb_get_game_by_id` for live games without a recent event | `game`, `game_event` | Reconciles when webhook drops or is delayed          |
| Post-game box score pull    | On `mlb.game.ended` | `mlb_get_stats?game_ids=...` | `game_event` (as aggregate rows) | Captures pitcher box-score stats webhooks may not emit |

**Total steady-state load:** well under the 600 req/min limit. Live-slate peak (15 games all ending within a 1-hour window) fires 15 box-score pulls + 6 reconciliation pulls = ~21 requests in that hour. Safe.

---

## 8. Player Photo Sourcing

**BallDontLie does not (visibly) provide player headshot URLs.** Plan for an alternate source.

### 8.1 Primary: MLB static CDN (pragmatic MVP)

MLB serves player headshots on publicly accessible static URLs:

```
https://midfield.mlbstatic.com/v1/people/{mlbam_id}/spots/120
https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:good,f_auto/v1/people/{mlbam_id}/headshot/67/current
```

BallDontLie player IDs may not match MLB Advanced Media (MLBAM) IDs. Options:

- **Option A:** If BDL exposes MLBAM ID as a field on the player object, use that directly. Verify during integration.
- **Option B:** If only BDL internal IDs are available, join via name + team + DOB against a cached MLBAM roster list (downloadable elsewhere).

**Ingest pipeline:**

1. Weekly cron (Sun 02:00 ET) iterates `player` rows lacking a `photo_url`.
2. For each, fetch the MLB static image URL via HTTPS.
3. Upload bytes to Supabase Storage at `players/{player_id}/headshot.jpg`.
4. Store `photo_url` on `player` with cache-bust token.
5. On player trade events (webhook or roster sync), mark photo for re-fetch only if the team branding differs (uniform changes).

**Caveat:** MLB static image URLs are widely hotlinked by fantasy apps but are not officially licensed. Acceptable for F2P MVP; revisit licensing before any cash-contest v2.

### 8.2 Fallback

Silhouette + player number + team initial placeholder (spec'd in `draft-deck-ui-ux-spec.md` §4.4). Fires when photo URL hasn't been ingested yet (new call-up) or when the fetch fails.

### 8.3 Deferred alternative: SportsDataIO

If MLB static licensing ever becomes a concern, SportsDataIO sells headshots at ~$50–100/mo with official licensing. Swap in by changing the photo sync cron source.

---

## 9. Provider Abstraction

All MLB data access flows through a provider interface (`src/lib/mlb/provider.ts`). The default implementation wraps `@balldontlie/sdk`; an alternate implementation could be swapped in for MLB Stats API, Sportradar, or Stats Perform.

```typescript
import type {
  MLBPlayer, MLBGame, MLBStats, MLBPlayerInjury
} from "@balldontlie/sdk";   // Re-exported from the SDK

export interface MLBDataProvider {
  fetchActiveRosters(): AsyncIterable<MLBPlayer>;
  fetchPlayerInjuries(): Promise<MLBPlayerInjury[]>;
  fetchGamesByDate(date: Date): Promise<MLBGame[]>;
  fetchGame(gameId: number): Promise<MLBGame>;
  fetchGameStats(gameId: number): Promise<MLBStats[]>;
  verifyWebhookSignature(
    rawBody: string,
    headers: Headers,
  ): { valid: boolean; eventType: string | null; deliveryId: string | null };
}

// Default implementation uses the SDK internally.
export const mlbProvider: MLBDataProvider = new BallDontLieProvider(bdl);
```

Key points:

- **SDK types are the canonical shapes.** Domain types in Drizzle tables map to the same fields; we don't invent parallel types. This keeps provider outputs → DB writes trivial.
- **Webhook verification lives on the provider** so that all BDL-specific concerns (REST + webhook) are behind one interface.
- Swapping providers later is a matter of writing a new class that implements the interface. Callers stay unchanged.

---

## 10. Drizzle Schema Additions

Touchpoints added or tightened from the tech spec's implied schema (§4 of that doc):

### 10.1 `webhook_delivery` (new)

Tracks every webhook received. Primary key = vendor-provided delivery ID, giving us idempotent dedup.

```sql
CREATE TABLE webhook_delivery (
  delivery_id TEXT PRIMARY KEY,       -- X-BDL-Webhook-Id
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'  -- received | processed | failed
);
```

RLS: service-role only.

### 10.2 `webhook_failed` (new)

Failures get parked for retry.

```sql
CREATE TABLE webhook_failed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT NOT NULL,
  event_type TEXT,
  error_message TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_count INT NOT NULL DEFAULT 0
);
```

A separate cron job (`/api/cron/webhook-retry`, every 5 minutes) picks up `webhook_failed` rows with `retry_count < 5` and attempts to process them again.

### 10.3 `game_event` columns

```sql
-- Add to the existing game_event table:
ALTER TABLE game_event ADD COLUMN provider_event_id TEXT UNIQUE;
ALTER TABLE game_event ADD COLUMN source TEXT NOT NULL DEFAULT 'webhook';
  -- 'webhook' | 'backfill' | 'repair'
```

`provider_event_id` is a deterministic hash of the webhook payload if BDL doesn't provide a per-event ID (verify). `source` lets us distinguish webhook-ingested events from backfilled ones for observability.

### 10.4 `player` columns for BDL

```sql
ALTER TABLE player ADD COLUMN bdl_player_id INT UNIQUE;
ALTER TABLE player ADD COLUMN mlbam_id INT;           -- for photo URLs
ALTER TABLE player ADD COLUMN photo_url TEXT;         -- Supabase Storage path
ALTER TABLE player ADD COLUMN photo_synced_at TIMESTAMPTZ;
```

The canonical `player.id` stays as our UUID; `bdl_player_id` and `mlbam_id` are foreign-system references.

---

## 11. Rate Limit Budget

GOAT tier caps us at **600 requests per minute**. Actual usage plan:

| Source                                  | Frequency          | Requests     |
|-----------------------------------------|--------------------|--------------|
| Scheduled jobs (roster / games / injuries) | Daily / weekly  | < 10/day     |
| Game repair cron                        | Every 10 min       | ~150/day     |
| Post-game stats pull                    | On each `game.ended` | 15/day avg |
| Live ingest fallback (webhook-down mode)| ~2 req/sec/game    | ~1,800/min peak |

**Steady-state budget:** 0.1 req/sec on average. Well below ceiling.

**Peak-risk mode:** if webhooks stop working during a 15-game slate, we'd blow the ceiling by 3×. Mitigation:

- Fallback polling targets `/mlb/v1/games/{id}` at a throttled 1 req/3 sec per game = 300 req/min total at 15 concurrent games. Under the ceiling.
- If the throttle isn't enough, degrade to polling only games where the user has a card rostered (narrower set).
- Alert via Sentry + PagerDuty if sustained fallback lasts > 15 minutes — this is a "call BDL support" scenario.

A bearer token-only per-second rate limiter (using Upstash Redis) sits in front of every outbound BDL request, enforcing ≤ 10 req/sec to stay comfortably under the 600/min cap.

---

## 12. Error Handling & Retry

| Scenario                              | Response                                                      |
|---------------------------------------|---------------------------------------------------------------|
| 401 / 403 (auth or tier)              | Fail loudly — Sentry alert, halt job. Engineering fix required. |
| 429 (rate limit)                      | Exponential backoff (1s, 2s, 4s), max 3 retries, then fail     |
| 5xx (backend)                         | Exponential backoff (0.5s, 1s, 2s), max 3 retries              |
| Webhook signature mismatch            | Respond 401; log to Sentry with payload; do not process        |
| Webhook replay (age > 5 min)          | Respond 400; discard                                           |
| Webhook duplicate (dedup hit)         | Respond 200; exit without reprocessing                         |
| Unknown event_type                    | Respond 200; log at `warn` level; insert into `webhook_failed` for manual review |
| DB error during event insert          | Respond 200; insert into `webhook_failed`; retry cron picks it up |

---

## 13. Development & Local Testing

### 13.1 Env vars (add to `.env.example`)

```
BDL_API_KEY=                # dev key from app.balldontlie.io
BDL_WEBHOOK_SECRET=         # secret from BDL webhook config
BDL_API_BASE_URL=https://api.balldontlie.io
BDL_ENV=development         # enables verbose webhook logging
```

### 13.2 Local webhook testing with ngrok

```
# Start Next.js dev server
pnpm dev

# In another terminal, expose localhost
ngrok http 3000

# Register the ngrok URL as the dev webhook endpoint in BDL dashboard
# e.g. https://abc123.ngrok.io/api/webhooks/balldontlie/mlb
```

### 13.3 Seed script (offline dev without live webhooks)

`pnpm run seed:game-events` generates realistic payloads for 5 common event types against a fixed game, inserting directly into `game_event`. Useful when developing the live contest UI without a live slate running.

### 13.4 Replay a failed webhook

`pnpm run webhook:replay <delivery_id>` re-dispatches a `webhook_failed` row through the handler for debugging.

---

## 14. Launch Readiness Checklist

Before first production cron + webhook goes live:

- [ ] GOAT plan purchased. Production API key generated.
- [ ] Dev + prod webhook secrets configured in Vercel.
- [ ] `mlb_get_stats` endpoint verified to return pitcher-granular data (IP, ER, hits-allowed, BB-allowed, HBP-allowed). **If not, add secondary source for pitcher stats.**
- [ ] Full MLB webhook event catalog pulled from vendor dashboard and documented in §6.2.
- [ ] SB, pitcher.strikeout, pitcher.inning_pitched, pitcher.earned_run, pitcher.win webhook availability confirmed. Gaps filled with post-game box-score pulls.
- [ ] Webhook signature verification tested with known-good and known-bad signatures.
- [ ] Webhook delivery dedup verified (send the same delivery ID twice, confirm only one processed).
- [ ] Replay-attack window (5 min) tested.
- [ ] Fallback polling tested: manually disable webhook endpoint, confirm cron-based scoring works.
- [ ] Rate-limit throttle (Upstash Redis) tested: confirm we never exceed 10 req/sec outbound.
- [ ] Player photo pipeline tested against MLB static URLs. Fallback avatar renders for brand-new call-ups.
- [ ] Sentry alerts configured for: 401/403 from BDL, webhook signature failures, `webhook_failed` table depth > 50, rate-limit 429 events, fallback-polling sustained > 15 min.
- [ ] Webhook endpoint documented for BDL dashboard configuration.
- [ ] Runbook written for common ops events (webhook outage, photo 404s, roster sync mismatch, unknown event_type).

---

## 15. Open Questions / Verify Before Build

1. ~~Exact REST paths~~ — **resolved.** SDK handles paths; base URL is `https://api.balldontlie.io`.
2. ~~`getStats` pitcher granularity~~ — **resolved via SDK types.** `MLBStats` returns `ip, p_hits, p_runs, er, p_bb, p_k, p_hr, pitch_count, strikes, era`. Gaps (HBP-allowed, Win, CG, CGSO, No-hitter) are derivable from webhooks + game state; documented in §6.3.
3. **Full webhook event catalog** — partial list known; need confirmation on: `mlb.batter.double`, `mlb.batter.triple`, `mlb.batter.stolen_base` (or whether singles/doubles/triples are differentiated via `play.type` on a generic `mlb.batter.hit`).
4. **Webhook registration** — dashboard-only, or is there a programmatic endpoint in v1.2.2's next release / docs?
5. ~~MLBAM ID on player objects~~ — **resolved:** no `mlbam_id` field in SDK's `MLBPlayer`. Photo pipeline must join externally by name + team + DOB.
6. Rate-limit response headers — are there `X-RateLimit-*` headers for proactive throttling, or only 429 on breach?
7. Webhook per-event stable ID — the payload's event ID (separate from `X-BDL-Webhook-Id` delivery ID). For idempotent storage of the same real-world event that might be re-delivered.
8. Webhook retry policy — how many retry attempts before BDL auto-disables our endpoint?
9. Outage SLA — GOAT tier support response time (99.9% SLA is Enterprise-only).
10. Photo licensing — confirm MLB static CDN usage for headshots doesn't violate MLB terms for F2P MVP. Revisit for cash-contest v2.
11. **Hit-type in webhook `play.type` field** — for a `mlb.batter.hit` event, does the play object encode single/double/triple, or is each hit type a separate `event_type`? Decides whether DK single/double/triple/HR is trivially reconstructable live or requires post-game stats pull. Practical answer: live scoring approximates, post-game reconciliation makes it exact.

---

## 16. Reference files

The SDK's authoritative MLB type definitions are checked into this repo at:

- `reference/balldontlie-sdk-mlb-methods.d.ts` — the `MLBClient` interface, every method signature.
- `reference/balldontlie-sdk-mlb-types.d.ts` — `MLBTeam`, `MLBPlayer`, `MLBGame`, `MLBStats`, `MLBStandings`, `MLBSeasonStats`, `MLBTeamSeasonStats`, `MLBPlayerInjury`, plus `APIError`, `ApiResponse`, `Pagination`.

These were extracted from `@balldontlie/sdk` v1.2.2. When bumping the SDK, re-extract and update.

---

## 17. Summary — What Changed vs. the Tech Spec

- **§5.1.3 Live game ingest** — was "poll BallDontLie every 30s during live windows." Now: **webhook-driven**, with a 10-minute game-repair cron and a fallback polling mode only when webhooks fail.
- **§7 Scheduled jobs catalog** — the "Live game ingest (every 30s)" row is replaced with "Webhook receiver" (continuous, HTTP POST in) and "Game repair cron (every 10 min)" and "Post-game box score pull (on `mlb.game.ended`)".
- **§15 open question** about live play-by-play coverage is resolved: yes, BallDontLie supports it via webhooks. New open questions (above) are scoped to endpoint verification details.
- **§5.1.4 Player photo sync** — source is now explicitly MLB static CDN (keyed by MLBAM ID), not BallDontLie. Flagged as legal gray zone for F2P MVP; revisit before cash-contest v2.
- **Tier** is formally locked to GOAT ($39.99/mo) with an explicit 600 req/min budget plan.

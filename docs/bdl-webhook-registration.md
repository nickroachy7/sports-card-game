# BallDontLie Webhook — Production Registration Runbook

**Status:** pending real BDL coord · **Owner:** you (Nick) ·
**Code:** P8.6 dev-sim guard shipped. Receiver is prod-ready.

Today the live pipeline is exercised only by `/api/dev/webhook-sim`
(CRON_SECRET-gated, now 404s in production). Real BDL webhooks
have never reached `/api/webhooks/balldontlie/mlb`. This runbook
covers the handoff: generate the shared secret, register the URL
with BDL, smoke one real event end-to-end.

---

## Pre-flight check

1. **Webhook endpoint is prod-ready** (verified P8.6).
   - URL: `https://draft-deck.vercel.app/api/webhooks/balldontlie/mlb`
   - Verb: `POST`
   - Content-Type: `application/json`
   - Required headers:
     - `x-bdl-webhook-id` — unique delivery id (BDL generates).
     - `x-bdl-webhook-timestamp` — Unix seconds; must be within
       ±5 min of server time.
     - `x-bdl-webhook-signature` — `v1=<hex>` where `<hex>` is
       `HMAC-SHA256(secret, timestamp + "." + raw_body)`.
   - Bad signature → `401`. Missing delivery id → `400`. All
     other errors → parked in `webhook_failed` for retry; we
     still `200` to stop BDL auto-disabling us.

2. **Event types we subscribe to** (from
   `src/lib/mlb/webhook-handler.ts`):
   - `mlb.game.started`
   - `mlb.game.ended`
   - `mlb.game.extra_innings`
   - `mlb.team.scored`
   - `mlb.batter.hit`
   - `mlb.batter.home_run`
   - `mlb.batter.strikeout`
   - `mlb.batter.walk`
   - `mlb.batter.hit_by_pitch`

   Any event type not in this registry is a `202`-style no-op
   (dispatched=false). Safe to subscribe to more than we
   handle.

---

## Step 1 — Generate + set the shared secret

Generate a strong random secret (32 bytes hex = 64 chars):

```bash
openssl rand -hex 32
```

Store it in three places (same value):

1. **Vercel prod env** — `BDL_WEBHOOK_SECRET` on the
   draft-deck project. Use the Vercel dashboard or:
   ```bash
   vercel env add BDL_WEBHOOK_SECRET production
   # paste the hex when prompted
   vercel env pull
   ```
2. **BDL dashboard** — when registering the webhook, enter the
   same secret in their "Signing secret" field.
3. **1Password** (or wherever you store prod secrets) — back
   up the value in case you need to rotate later.

**After setting the env var, redeploy** so the new value is
picked up:

```bash
vercel --prod --yes
```

---

## Step 2 — Register the webhook with BDL

Log into the BDL dashboard and add a new webhook with:

- **URL:** `https://draft-deck.vercel.app/api/webhooks/balldontlie/mlb`
- **Secret:** the hex value from Step 1.
- **Events:** all nine types listed in pre-flight §2. If BDL
  has a "subscribe to all MLB game + batter events" preset,
  use that.
- **Sport:** MLB only.

Save + confirm BDL returns a registration success.

---

## Step 3 — Verify HMAC with a BDL test-ping

Most vendors expose a "send test event" button in the dashboard.
Fire it. Then check on our side:

```sql
-- Did we receive the test ping?
SELECT delivery_id, event_type, status, created_at
FROM public.webhook_delivery
WHERE delivery_id NOT LIKE 'dev-sim:%'
ORDER BY created_at DESC
LIMIT 1;

-- Did the signature verify?
-- (status = 'processed' or 'received' — NOT 'failed' with
--  signature-verify error).
SELECT * FROM public.webhook_failed
WHERE created_at > now() - interval '10 minutes';
```

**If `webhook_delivery` has a fresh non-dev-sim row with
status `received` / `processed`** → HMAC is good, dispatch
is wired. Ship it.

**If `webhook_delivery` has NO rows** → verify:
- Vercel prod env has `BDL_WEBHOOK_SECRET` set (the redeploy
  picked it up).
- BDL is pointing at the right URL (check HTTPS + trailing
  slash).
- Check Vercel logs for `draft-deck.vercel.app/api/webhooks/balldontlie/mlb`:
  ```bash
  vercel logs draft-deck.vercel.app --since 10m | grep balldontlie
  ```

**If `webhook_delivery` has a row but `webhook_failed` shows
a signature error** → secrets don't match. Recheck Step 1.

---

## Step 4 — Smoke one real MLB game

Wait for a scheduled MLB game in our contest. Confirm:

1. `mlb.game.started` fires:
   ```sql
   SELECT delivery_id, event_type, status, created_at
   FROM public.webhook_delivery
   WHERE event_type = 'mlb.game.started'
   ORDER BY created_at DESC LIMIT 1;
   ```

2. Live events flow (hits, walks, HRs) — spot-check:
   ```sql
   SELECT event_type, COUNT(*) AS n
   FROM public.webhook_delivery
   WHERE created_at > now() - interval '2 hours'
     AND delivery_id NOT LIKE 'dev-sim:%'
   GROUP BY 1;
   ```

3. `mlb.game.ended` triggers `reconcileGame()`:
   ```sql
   SELECT * FROM public.webhook_delivery
   WHERE event_type = 'mlb.game.ended'
   ORDER BY created_at DESC LIMIT 1;
   -- And:
   SELECT id, status, final_score
   FROM public.contest_entry
   WHERE status = 'final' AND contest_id IN (
     SELECT id FROM public.contest WHERE ... -- the game's contest
   );
   ```

---

## Step 5 — After registration: tell the team

Once the above passes:
- Mark P8.6 done in the ADR.
- Remove this runbook from active docs (move to
  `docs/retired/` if you want the history).

---

## What's deliberately not in this runbook

- **Signature rotation.** Redo Step 1 + Step 2 with a new secret;
  BDL usually supports dual-secret windows for seamless swaps.
  If needed, we can add `BDL_WEBHOOK_SECRET_SECONDARY` to
  `verifyBDLWebhook` later.
- **Rate limits.** BDL hasn't published per-webhook rate limits;
  if we get throttled, the retry cron picks up the slack from
  `webhook_failed`.
- **Replay protection.** The 5-min timestamp window +
  `delivery_id` dedupe cover replay attacks already.

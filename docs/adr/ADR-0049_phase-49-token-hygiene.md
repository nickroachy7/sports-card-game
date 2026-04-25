# ADR-0049 — Phase 49 (Token inventory hygiene) Retrospective

**Status:** Accepted · **Date:** 2026-04-25
**Phase:** Phase 49 (v1.34)
**Companion specs:** `draft-deck-polish-spec.md` §195–§200,
`docs/adr/ADR-0048_phase-48-trust-predicate.md`.

---

## Context

User feedback after a week of play:
> "The user is getting way too many tokens and I think we
> need to limit the amount they can [have]."

The TokenTray showed "60 available" with horizontal scroll.
Premium packs rolled tokens at 60% per card with no inventory
ceiling. Specs §35, §62 showed a single-row tray as the design
intent — 60+ tokens broke that.

User also requested:
- Click a token → sidebar detail with quick-sell.
- Multi-select to bulk-sell tokens (extending the cards
  select mode).
- Player choice when a pack would push you over cap.
- Token slot in the pack reveal flip animation.

## Decision

Three waves shipped under Phase 49.

### Wave 1 (commit `d237d763`) — cap + sidebar quick-sell

- `economy_config.token_cap` = 20 (default), tunable.
- `economy_config.token_quicksell_values` = per-type jsonb.
- `public.quicksell_token()` SQL fn: mirror of
  `quick_sell_card`. Validates ownership + non-consumed +
  non-applied; refunds coins; marks consumed.
- New `TokenDetailPanel` sidebar (`?token=id` URL param)
  mirroring the `CardDetailPanel` swap pattern. Quick-sell
  button shows the exact payout for the token's type.
- Tray header now reads `X / 20 available`, tone shifts at
  ≥90%, special copy at exactly cap.
- `open_pack`: when at cap, silent skip of token rolls with
  `tokens_skipped_at_cap` counter.

### Wave 1.1 (commit `69b2d328`) — multi-select tokens

User: "Can we make the select option for the cards also work
for tokens so we can quickly sell these?"

- Same `selectMode` toggle now accepts both cards and tokens.
- Token tray drag is suppressed in select mode; click
  toggles selection (gold ring on selected pips).
- `SelectionPanel` shows separate Cards + Tokens sections
  with a combined running total.
- `quickSellTokens({tokenIds})` server action mirrors
  `quickSellCards`. `handleBulkQuickSell` fires both in
  parallel via `Promise.all` and combines results.

### Wave 2 (this commit) — overflow resolve + reveal slot

Replaces Wave 1's silent skip with the player-choice flow
specced at the start of Phase 49.

- `token.is_pending boolean` column. Pending rows are limbo —
  not in cap count, not in tray, awaiting resolve.
- `open_pack` now inserts at-cap rolls as `is_pending=true`
  and returns them in `pending_token_ids`.
- `resolve_pending_token(p_user_id, p_pending_id, p_action,
  p_replaced_id)` SQL fn:
  - `keep_replace`: quicksell `p_replaced_id`, flip pending
    to active.
  - `quicksell_new`: quicksell the pending one directly.
- `PackTokenFlip` component — sibling of `PackCardFlip`, chip-
  sized 3D-Y-rotation flip. Renders at end of the pack reveal
  row; pending tokens show "WILL RESOLVE" pill.
- `TokenOverflowResolveModal` — appears after the batch
  reveal completes when any pending tokens were rolled. Shows
  pending one at a time; replace picker lists all active
  tokens sorted by ascending bonus_fp; user picks
  `Replace & next` or `Sell new`.
- Bailout-safe: `props.initialPendingTokenIds` (server-rendered)
  re-opens the modal on next mount if user closed mid-flow.

## Consequences

**What got better:**

- TokenTray fits cleanly on one row at cap=20.
- Player has full control: per-token detail + sell, bulk
  multi-select sell, pack-time overflow choice.
- Pack opens at cap no longer feel like "missing rewards" —
  the rolled token shows up, the user picks the resolution.
- Audit trail intact: every token transition (roll →
  pending → kept/sold) is in the row's history (acquired_at,
  is_pending, consumed_at, acquired_source).

**What's still open:**

- No way to apply pending tokens to cards before resolution
  (intentional — pending is limbo). If we wanted that we'd
  need separate "applied while pending" handling.
- The reveal modal blocks the user from interacting with the
  lineup until they resolve. Could be more forgiving (let
  them dismiss + reopen later via a tray badge), but that's
  a future polish; current behavior matches the dupe-resolve
  pattern.
- No "auto-quicksell new" preference setting. User has to
  click through each pending. With cap=20 + drop rates around
  0.6 on Premium, we expect ~3 pending per 5-pack batch — not
  enough to warrant an opt-in setting yet.

## Tricky bits

- **`quicksell_new` reusing `quicksell_token`.** The existing
  fn validates `consumed_at IS NULL AND applied_to_card_id
  IS NULL` but doesn't check `is_pending`. To avoid a circular
  validation, `resolve_pending_token` flips `is_pending=false`
  *before* calling quicksell_token. Order matters; doing it
  after would have the row still flagged pending mid-fn.
  This is documented inline in the SQL fn header.

- **Cap count excludes pending.** Otherwise a 5-pack batch at
  cap would only generate 1 pending (the first roll), then
  silently skip the rest. The intent is "show every pack's
  rolled token" — so pending rows don't gate further rolls.
  Side effect: a user who never resolves pending could
  accumulate them indefinitely. Mitigation: the modal re-opens
  on next mount via `initialPendingTokenIds`, so they can't
  hide for long.

- **Card + token detail sidebars share the swap mechanism.**
  `?token=id` and `?card=id` are mutually exclusive URL
  params. Click handlers strip the other. Tested back/forward
  + refresh paths in Wave 1.

- **Tokens in `props.tokens` include pending ones now.** Page
  query was `consumed_at IS NULL`; now also returns
  `is_pending`. `effectiveTokens` filters `!isPending` so
  the tray + selection panel never see pending. The
  `initialPendingTokenIds` prop is a separate
  array (lineup-view stages it into the modal queue without
  needing to scan props.tokens client-side).

- **Multi-select bulk dialog wording.** With both cards and
  tokens selected, copy reads "X cards + Y tokens for Z
  coins" instead of the generic "items". Tested with all
  combinations (cards-only, tokens-only, mixed).

## Alternatives considered

- **Per-type cap** (e.g. 5 of each type, 25 total). Rejected
  in interview — added picker complexity for marginal benefit.
- **Auto-quicksell oldest at cap.** Rejected — no player
  agency.
- **Hard refuse at cap.** Rejected — feels emptier than the
  modal-driven choice.
- **Drop-rate scaling near cap.** Rejected — same drop rate
  preserves gameplay parity; the cap mechanic is the only
  input layer that needs to know about cap.
- **Single combined modal for cards-dupes + tokens-overflow.**
  Considered. Rejected — different decision shapes (dupe is
  per-card pick existing/new; token is per-pending pick
  replace/sell). Two specialized modals is clearer.

## Links

- Wave 1 commit: `d237d763 feat(tokens): cap inventory at 20
  + sidebar quick-sell (P49 Wave 1)`
- Wave 1.1 commit: `69b2d328 feat(tokens): multi-select
  extends to tokens for bulk quick-sell (P49 Wave 1.1)`
- Wave 2 commit: (forthcoming)
- Migrations: `0062_token_cap_and_quicksell.sql`,
  `0063_token_overflow_resolve.sql`
- Polish spec: §195–§200
- Related: ADR-0048 (P48 trust predicate) — same session,
  different domain.

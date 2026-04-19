# Draft Deck — Gameplay Specification (v0.2)

**Status:** Draft, core loop + seasonal model + contracts. Contest formats (DFS lineup construction, season-long leagues, cash-entry contests) are deferred to a companion spec.
**Scope:** Card system, tiers, leveling, contracts, packs, tokens, duplicates, coin economy, scoring system, player universe, seasonal lifecycle, vault, Manager Level, onboarding, collection management, team milestones, social layer, UX details, edge cases.
**Platform:** Web app.
**Sport:** MLB (licensed, real athletes only).

---

## 1. Vision & Design Pillars

Draft Deck is a web-based fantasy baseball collectible card game with a **seasonal rebuild** at its heart. Each MLB season, a user assembles a fresh team of cards, signs them to limited-play contracts, applies conditional tokens, and competes in fantasy contests. When the World Series ends, the user picks a small number of cards to **vault** as a permanent keepsake — everything else dissolves — and begins again on Opening Day.

**Design pillars:**

1. **Stat purity.** On-field scoring mirrors real MLB fantasy points. No card is mechanically stronger than another of the same player. Tier and card "prestige" never affect score. Skill comes from player selection, token usage, and contract management.
2. **Play to level.** Cards only accumulate fantasy points and advance tiers when they are actually started in contests. Collections that sit in a drawer never progress. This encourages rotation and active play over hoarding.
3. **Non-transferable cards.** Cards are bound to the user who opened them. No trading, no marketplace, no secondary economy.
4. **Seasonal rebuild.** Every MLB season is a fresh start. Only the Vault and the user's Manager Level persist across years. Coins, tokens, and non-vaulted cards dissolve at season end. The vault ceremony is an annual emotional beat.
5. **Contracts are a scarce resource.** Every card can only be played a limited number of times before it expires. Coins can extend contracts, but the cost climbs. This creates ongoing demand for new pack pulls and forces real decisions about which cards to deploy and when.
6. **F2P-viable, cash-optional.** The in-game economy runs entirely on earned coins. Real money enters the game only through cash-entry DFS contests (spec'd separately).
7. **Public-by-default prestige.** Profiles, vaults, season stats, and leaderboards are public. Collection psychology is fueled by visible career progression.

---

## 2. Core Game Loop

1. **Claim Daily Pack** (free, once per day) and/or **buy Standard / Premium packs** with earned coins.
2. **Open packs.** New players go into the collection (subject to cap). Duplicates auto quick-sell to coins.
3. **Manage the roster.** Browse collection, extend contracts on favorites with coins, set auto-sub bench priority or manual backups.
4. **Apply tokens.** Drag-and-drop conditional tokens onto cards before contest lock. One token per card per contest.
5. **Enter a contest** (coin entry). Submit a lineup of owned cards.
6. **Watch live.** Live contest view from the lineup page updates scores and standings play-by-play as real MLB games unfold.
7. **Resolve.** Each card's real fantasy points + any triggered token bonus adds to the card's career FP total. One contract play is deducted.
8. **Tier up.** Crossing an FP threshold auto-evolves the card (Bronze → Silver → Gold → Diamond).
9. **Hit team milestones.** Cumulative season stats (Team Hits, HRs, SBs, Wins) cross thresholds and reward coins + Manager Level XP + bonus tokens.
10. **Return tomorrow.** Daily Pack refresh + login streak bonus + continued contest cadence.
11. **End of season.** World Series ends → guided vault ceremony → preserve 10 cards → everything else dissolves → Opening Day starts with a fresh starter bundle.

---

## 3. Card System

### 3.1 Card anatomy

Every card represents a single MLB player and carries the following attributes:

- **Player ID** — reference to the real MLB player (MLBAM ID recommended as canonical key).
- **Player name, team, position(s)** — live fields sourced from MLB data; update automatically on trades, call-ups, position expansions, etc.
- **Card ID** — unique identifier for this specific card instance.
- **Owner ID** — the user who holds the card. Cards are non-transferable; owner never changes.
- **Season tag** — the MLB season this card was acquired in. Determines its seasonal lifecycle.
- **Acquired at** — timestamp.
- **Career FP total** — cumulative fantasy points earned across every contest this card was started in, plus token bonuses that triggered.
- **Current tier** — Bronze / Silver / Gold / Diamond, derived from career FP total.
- **Contract remaining** — integer count of plays left (starts at 15). When it hits 0, the card is marked Expired.
- **Extension count** — how many times this card's contract has been extended with coins (drives the escalator).
- **Applied token ID** — `null` or one token currently attached for the next contest.
- **Token triggers** — counters tracked for the card detail view: successful triggers, total applied, per-type breakdown.
- **Status flags** — derived from player state: `Active`, `Injured List`, `DFA / Free Agent`, `Retired`, and card-state flag `Expired`.
- **Art variant** — cosmetic art tied to the card's tier.

### 3.2 Tiers (replaces rarity)

Draft Deck has no mint-level rarity. Every card starts at Bronze and evolves as it accumulates fantasy points from being started in contests. Tiers are **purely cosmetic** — they never affect on-field scoring — but they are the primary visible progression signal and they drive quick-sell value and extension cost.

| Tier    | FP threshold (proposed) | Visual treatment             |
|---------|-------------------------|------------------------------|
| Bronze  | 0 FP                    | Base frame, matte finish     |
| Silver  | 250 FP                  | Silver frame, subtle shine   |
| Gold    | 1,000 FP                | Gold frame, holofoil accent  |
| Diamond | 5,000 FP                | Animated frame, full holo    |

Thresholds are a starting recommendation. For reference, a star hitter playing every day of a full MLB season earns roughly 400–600 fantasy points on standard DK scoring, so Gold represents ~2 full seasons of heavy use and Diamond is multi-year.

### 3.3 Leveling rules

- FP accrues **only when the card is started in a contest**. Benched cards, cards held but never rostered, and cards on the IL when rostered earn 0 FP for that contest.
- A card's FP earned in a contest = its real-world fantasy-point score + any token bonus that triggered. Tokens count toward the career total.
- Tier advancement is automatic. When career FP crosses a threshold, the card visually upgrades and a celebration animation plays on next view. Notification is sent (see §14).
- There is no prestige reset. Tiers are monotonic-increasing.

### 3.4 Multi-position cards

A card is **legal at any position the player has started at** in real MLB games. For example, Mookie Betts's card shows `OF / 2B` and can fill either lineup slot — but only one slot per contest. Position eligibility updates dynamically as the real player is used at new positions in MLB.

### 3.5 Two-way players (Ohtani model)

Shohei Ohtani (and any other two-way player) has a single card in the pool, not two. When the card is rostered, it occupies one lineup slot (user chooses which at lineup build; typically SP on start days, OF/UTIL otherwise). That single card **scores both hitting AND pitching stats** relevant to the game. FP accrues to the one card.

This intentionally makes two-way cards extremely valuable — mirroring the real-world outlier nature of the player.

### 3.6 Collection cap

- **Default cap: ~100 cards.** Starting recommendation; tune during playtesting.
- **Expired cards DO count against the cap.** An expired card (contract = 0) is dead weight unless the user extends its contract with coins, manually quick-sells, or preserves it via the season-end vault.
- When the collection is at cap, pack opens prompt a **keep-or-quick-sell** decision per new card. No overflow storage.
- No slot-expansion purchases in v1.

---

## 4. Fantasy Scoring System

Draft Deck uses a **DraftKings-style flat-point scoring system**. Every on-field event has a fixed point value; a card's contest score is the sum of those points for every event the player produced. Tokens and contract-play costs are balanced against this baseline.

### 4.1 Hitter scoring

| Event              | Points |
|--------------------|--------|
| Single             | +3     |
| Double             | +5     |
| Triple             | +8     |
| Home Run           | +10    |
| Run Batted In      | +2     |
| Run                | +2     |
| Walk (BB)          | +2     |
| Hit-By-Pitch (HBP) | +2     |
| Stolen Base        | +5     |

### 4.2 Pitcher scoring

| Event                 | Points  |
|-----------------------|---------|
| Inning Pitched (IP)   | +2.25   |
| Strikeout (K)         | +2      |
| Win (W)               | +4      |
| Earned Run allowed    | −2      |
| Hit allowed           | −0.6    |
| Walk allowed (BB)     | −0.6    |
| HBP allowed           | −0.6    |
| Complete Game (CG)    | +2.5    |
| CG Shutout            | +2.5    |
| No-Hitter             | +5      |

### 4.3 Worked example

Aaron Judge goes 2-for-4 with 1 HR, 2 RBI, 2 R, 1 BB:
1 Single (3) + 1 HR (10) + 2 RBI (4) + 2 R (4) + 1 BB (2) = **23 FP**.

Values are finalized for v1; adjustment during playtesting may shift IP or ER by small amounts to balance hitter vs. pitcher lineup economics.

---

## 5. Contracts

Every card enters the collection with a **contract** that limits how many contests it can be played in. This is the game's primary churn driver and creates genuine choices about when to deploy star cards.

### 5.1 Default contract length

**15 plays per card.** Every newly-pulled card has a contract of exactly 15, regardless of player value or pack source.

Each time the card is **started in a contest**, the contract decrements by 1. If the card is on the lineup but subbed out pre-first-pitch (see §16), the play is NOT consumed.

### 5.2 Contract UX

Each card prominently displays its remaining plays: `15/15` when fresh, counting down. Color indicator on the card frame turns amber below 5 plays and red below 2. Filter view in the collection lets the user surface all cards with low contract remaining.

### 5.3 Contract expiry

When a card hits 0 plays:

- It is flagged **Expired**.
- It remains in the collection (counting against the cap) but is **unplayable** in any contest.
- It can be manually quick-sold at its current tier's value, extended with coins to become playable again, or preserved for the end-of-season vault ceremony.

### 5.4 Contract extension (coin sink)

Users can spend coins to add plays to any card — expired or active — via a "Renew Contract" action on the card detail view.

**Pricing schedule (per-play coin cost, proposed):**

| Card tier | 1st extension | 2nd extension | 3rd extension | 4th+  |
|-----------|---------------|---------------|---------------|-------|
| Bronze    | 20 / play     | 30 / play     | 45 / play     | +50% each step |
| Silver    | 50 / play     | 75 / play     | 113 / play    | +50% each step |
| Gold      | 150 / play    | 225 / play    | 338 / play    | +50% each step |
| Diamond   | 500 / play    | 750 / play    | 1,125 / play  | +50% each step |

There is **no hard cap** on extensions — the user can keep renewing as long as they can afford the escalating cost. The cost escalator is the soft cap: at a high-enough extension count, the coins required exceed what any user would spend, and the card is effectively retired.

Extensions are purchased in multiples of plays (e.g. extend by 5, by 10, or by 15). Fixed-size bundles may be added as convenience options.

---

## 6. Pack System

### 6.1 Pack types (launch)

| Pack             | Cost                      | Cards per pack | Player weighting                     |
|------------------|---------------------------|----------------|--------------------------------------|
| **Daily Pack**   | Free (1 / day)            | Small (~3 cards)  | Weighted toward bench / role players |
| **Standard Pack**| Coin-purchased            | Medium (~5 cards) | Mixed, balanced across player pool   |
| **Premium Pack** | Coin-purchased (expensive) | Larger (~8 cards) | Heavily weighted toward star players |

Exact card counts and coin prices to be tuned.

### 6.2 Pack differentiation

Premium packs are better than Standard packs along two dimensions simultaneously: **volume** (more cards) and **star weighting** (higher odds of star-tier players). This creates a clean gradient from free → premium without ever adding a rarity-boost mechanic to the card itself.

### 6.3 Player-quality weighting (internal)

Every MLB player on an active 40-man roster is assigned a **designated value tier** (internal, not shown to users):

- **Star** — top ~50 hitters, top ~30 pitchers league-wide
- **Starter** — regular MLB starters beyond the top tier
- **Role player** — regular bench, platoon, setup relievers
- **Prospect / depth** — 40-man fringe, rookies with limited MLB time

Drop weights are tuned per pack type so that opening a Premium Pack produces a meaningfully better expected set of players than Standard or Daily.

### 6.4 Card supply

**Infinite supply.** Any player can be pulled any number of times across all users. No mint numbers, no serial numbers, no scarcity-based pricing. Dupes for the same user are handled by auto quick-sell (§7).

### 6.5 Pack odds / pity

**No pity system.** Odds are the odds. This keeps the economy clean and avoids gaming the pity counter.

### 6.6 Pack opening UX

Sequential reveal with building tension:

1. Card slots reveal one by one.
2. Each card enters with a tier-colored flash (Bronze = white, Silver = silver glow, Gold = gold glow, Diamond = full-screen holo animation). Note: fresh pulls are always Bronze — higher-tier animations only come into play for non-pack sources (e.g. vaulted legacy displays).
3. The final slot is reserved for the pack's highest-value pull to build anticipation.
4. Duplicates animate with a "quick-sell" sweep showing the coin payout landing in the wallet.
5. For star-tier pulls, a brief celebratory moment with team colors and player photo.

---

## 7. Tokens

Tokens are the game's primary strategic amplifier. They are applied to cards before contests and, if their condition triggers during the real MLB game, award bonus fantasy points to the card's contest score (and the card's career FP total).

### 7.1 Token anatomy

- **Token ID** — unique instance.
- **Owner ID** — the user.
- **Token type** — defines the condition and payout (see §7.4).
- **Applied to card ID** — `null` or the card it's currently attached to.
- **Consumed at** — `null` until the target contest resolves.

### 7.2 Application rules

- Tokens are applied via **drag-and-drop** from inventory onto a card in the lineup builder.
- **One token per card per contest, maximum.**
- Tokens are **single-use consumables**. Once the contest resolves, the token is consumed regardless of whether its condition triggered.
- A token must be applied **before lineup lock** for that card's game.
- Tokens cannot be removed or reassigned once the contest has locked.
- If the player does not play at all (late scratch, rainout), the token is **refunded** (see §16).

### 7.3 Token tiers

**No tiers at launch.** Differentiation is by *type*, not by *strength*. All tokens of a given type have identical effects.

### 7.4 Token catalog (launch — minimal, expandable)

All tokens are **conditional bonuses** tied to real player performance in the format *"If ⟨event⟩, +⟨bonus⟩ FP."*

Proposed v1 starter set:

| Token                  | Applies to | Trigger condition                            | Bonus |
|------------------------|------------|----------------------------------------------|-------|
| Home Run Bonus         | Hitter     | Player hits a home run                       | +X    |
| Multi-Hit Bonus        | Hitter     | Player records 2+ hits                       | +X    |
| Stolen Base Bonus      | Hitter     | Player records a stolen base                 | +X    |
| Strikeout Bonus        | Pitcher    | Pitcher records 8+ strikeouts                | +X    |
| Quality Start Bonus    | Pitcher    | Pitcher records a Quality Start (6+ IP, ≤3 ER) | +X  |

Bonus values (+X) are tuned relative to the DK scoring table in §4. Rare-event jackpot tokens (cycle, no-hitter, walk-off) are candidates for post-launch expansion.

### 7.5 Token acquisition

- **Pack drops.** Tokens drop from packs alongside cards at a tunable rate.
- **Contest rewards & team milestone rewards.** Winning contests and crossing team milestone thresholds (§15) pay out tokens.
- **Not** purchasable directly with coins in v1.

### 7.6 Token success tracking

Each card's **detail view** (not the card face) displays token-trigger stats:

- Total tokens applied
- Total tokens triggered successfully
- Success rate (%)
- Per-type breakdown (HR tokens triggered / applied, Strikeout tokens triggered / applied, etc.)

This gives the user a "clutch-ness" story for each card beyond its raw FP total. Card front stays clean (tier + FP + contract only).

---

## 8. Duplicates & Quick-Sell

### 8.1 Duplicate rule

A user cannot own two copies of the same player. If a pack pull would produce a duplicate, the duplicate is **automatically quick-sold** and coins are credited.

### 8.2 Quick-sell value

Payout is based on the **current tier of the card being sold**.

| Tier being sold | Coin payout (proposed) |
|-----------------|------------------------|
| Bronze          | 10 coins               |
| Silver          | 50 coins               |
| Gold            | 200 coins              |
| Diamond         | 1,000 coins            |

Because pack-pulled duplicates are always fresh Bronze, automatic duplicate-sells always pay the Bronze rate. Higher-tier payouts apply when a user manually quick-sells a leveled-up card they already own (e.g., to free a collection slot).

### 8.3 Manual quick-sell

Users can manually quick-sell any card in their collection at any time. Cards with attached tokens cannot be quick-sold until the token is removed or consumed (prevents accidental token loss). Manual quick-sell of Silver+ cards requires a confirm dialog.

---

## 9. Coin Economy

### 9.1 Coin sources (all F2P)

- **Contest winnings** — coin-entry contests pay coins to winners.
- **Quick-selling cards** — automatic duplicates and manual sells.
- **Team milestone rewards** — crossing cumulative season thresholds pays out coins (§15).
- **Login streak bonus** — escalating daily coins for consecutive logins (see §14).
- **Daily Pack claim** (indirectly — free cards convert via dupe quick-sell).

Coins are **not** purchasable with real money in v1.

### 9.2 Coin sinks

- Standard Pack purchases
- Premium Pack purchases
- Contract extensions (§5.4)
- Coin-entry contest fees

### 9.3 Real-money monetization

Real money enters Draft Deck only through **cash-entry DFS contests** (spec'd in the contest-format companion doc). Cash prizes pay out in cash. Coins never convert to cash; the two ecosystems are fully separated.

### 9.4 End-of-season reset

At season end, **all coin balances dissolve to 0** along with tokens and non-vaulted cards. Every Opening Day starts the user back at 0 coins (plus whatever the starter bundle grants). Only the Vault and the Manager Level persist.

---

## 10. Player Universe & Live MLB Integration

### 10.1 Eligible player pool

- **Active MLB only.** Every player on an MLB team's active 40-man roster has a card in the pack pool.
- **No minor-league prospects at launch.** When a prospect is called up to a 40-man roster, the card becomes eligible for pack drops.
- **No retired legends / throwback sets at launch.**
- Data source: MLB Stats API or equivalent licensed real-time feed. Player-record sync runs daily, with near-real-time updates during contests.

### 10.2 Live event handling

| MLB event                         | Effect on the card                                                                                              |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Trade to new team                 | Team tag on every affected card updates automatically. Card functions normally. Tier and FP preserved.          |
| Promoted to MLB (call-up)         | Player becomes eligible in the pack pool.                                                                       |
| Placed on IL                      | Card is flagged **IL**. Card is still legal to roster but scores 0 FP while inactive. Flag clears on activation.|
| Designated for Assignment / released / free agent | Card is flagged **DFA / FA**. Not legal to roster until player is re-added to a 40-man roster.  |
| Retirement                        | Card is **locked as legacy**. FP and tier preserved. Cannot be played. Remains in collection. Does not count against the collection cap. |

### 10.3 Contest eligibility

A card is legal to start in a contest only if the player's current status is `Active` (on a 40-man roster, not IL) AND the card is not `Expired`.

---

## 11. Seasonal Lifecycle

This is the backbone of Draft Deck's meta-design. A "season" equals one MLB season, and almost everything about a user's collection is seasonal.

### 11.1 Season boundaries

A Draft Deck **season** runs from MLB Opening Day through the final game of the World Series. The offseason (late October/November through Opening Day) is quiet: no live contests run, but the app remains open for vault browsing, profile viewing, leaderboards, and offseason planning.

### 11.2 What persists across seasons

- **The Vault** — permanent keepsake of cards preserved at each season's end.
- **Manager Level** — lifetime XP-based prestige level (§13).
- **Team identity** — user's team name, colors, logo selection.
- **Lifetime stats** (contests won, career FP, lifetime vaulted cards, lifetime token triggers).

### 11.3 What dissolves at season end

- **All non-vaulted cards** — active, expired, IL-flagged, DFA-flagged. Dissolved entirely, no coin payout. Only the 10 preserved cards survive.
- **All coins** — balance drops to 0.
- **All unused tokens** — inventory empties.
- **Team milestone counters** — reset to 0 for the new season.
- **Current season stats** (FP, contests won this year, tokens triggered this year) — these are archived into career totals and the current-season number resets.

### 11.4 Vault ceremony (end-of-season flow)

After the World Series ends, a guided multi-step flow greets the user on next login:

**Step 1 — Season in Review.** Auto-generated recap:
- Team name, Manager Level at start vs. end of season
- Total FP earned, contests played, contests won
- Best card (by FP)
- Most successful token
- Team milestones hit
- Notable moments (biggest single-contest score, longest win streak, etc.)

**Step 2 — Vault Selection.** Card-by-card selection screen. User picks up to 10 cards from their active collection to preserve. Currently-expired cards are also eligible.

**Step 3 — Dissolving animation.** Un-chosen cards visually dissolve in a single animated sequence. The ceremony is weighty but takes <30 seconds.

**Step 4 — Vault view.** User sees their updated vault including the newly added cards.

**Step 5 — Offseason teaser.** Short transition screen: "Opening Day begins in X days."

### 11.5 Opening Day (start-of-season flow)

On MLB Opening Day (or the user's first login after it):

1. Welcome-back animation (uses the user's team colors).
2. Starter bundle is granted:
   - **10 Bronze cards** forming a legal default positional lineup (1 C, 1 1B, 1 2B, 1 3B, 1 SS, 3 OF, 2 SP).
   - **500 coins.**
   - **2 basic tokens** (one hitter-type, one pitcher-type).
3. The user can immediately enter a free tutorial contest or go directly to packs/contests.
4. The starter bundle is identical for all users at launch. (Potential future: bundle sizing scales with Manager Level — deferred.)

### 11.6 Offseason mode

During the offseason (post-World-Series, pre-Opening-Day), the app is in a read-mostly state:

- Vault is browsable.
- Profiles and leaderboards are viewable.
- Manager Level is frozen until Opening Day.
- No packs open, no contests run, no coins earned.
- Daily Pack is paused.

This keeps the "seasonal rebuild" feel strong and provides a natural breathing period for the player.

---

## 12. The Vault

### 12.1 Purpose

The Vault is a **pure keepsake / showcase**. Vaulted cards are permanent and fully public. They display tier, career FP total, the season they were vaulted, and token-trigger stats.

### 12.2 Rules

- Vault cap: **10 cards per season** added. Selected during the end-of-season ceremony.
- Vaulted cards **cannot be played** in any future contest.
- Vaulted cards carry forward their final tier, final FP total, and final token stats exactly as they were at vault time.
- The vault's lifetime size is uncapped — it grows by up to 10 cards per season the user plays.

### 12.3 Vault view UX

- Organized by season (scrollable timeline).
- Each season shows the 10 cards selected that year, plus a mini-recap banner (FP total that season, Manager Level at year end, team milestones hit).
- Public — anyone can browse any user's vault.
- Each card in the vault is clickable to its full detail view.

---

## 13. Manager Level / Meta-Account

### 13.1 Overview

The **Manager Level** is the user's lifetime prestige score. It persists across every season and is the user's career identity in Draft Deck.

### 13.2 XP sources

XP contributes to Manager Level from many places — "a lot going to basic XP," across:

- **Team milestone rewards** (§15) — primary source.
- **Contest wins** — placement-based.
- **Card tier advancements** — small XP bump each time a card crosses a tier.
- **Successful token triggers** — small XP per trigger.
- **Completing a full season** — end-of-season XP grant based on total season FP.
- **First-time achievements** (first Silver card, first Diamond, first vault, first 100-hit team milestone, etc.) — one-time lifetime bonuses.

Specific XP amounts are tuning values to be set during playtesting.

### 13.3 Effects

**Pure prestige for v1.** Manager Level is a visible number next to the user's team name on profile pages, contest standings, and leaderboards. It does **not** unlock gameplay bonuses, bigger starter bundles, or extra vault slots.

Future-facing: gameplay effects (Opening Day bonus packs, extra vault slots, cosmetic unlocks) are deferred and may be added in later versions.

### 13.4 Scale

Open level cap (no ceiling at 100 or similar). Level growth should feel continuous; doubling time increases gradually as level climbs.

---

## 14. Onboarding, Daily Engagement & Notifications

### 14.1 Onboarding — first-time user experience

A new user signup flow:

1. Account creation (email + auth).
2. Team branding setup: pick a team name, primary color, secondary color, and a logo from the preset library (~50 options at launch).
3. Starter Bundle grant (same structure as Opening Day bundle in §11.5):
   - 10 Bronze cards forming a legal starter lineup.
   - 500 coins.
   - 2 basic tokens.
4. Tutorial contest — a guided walk-through that teaches lineup building, token application, and live scoring. Completion rewards a free Standard Pack.
5. User arrives in the collection / packs / contests home.

### 14.2 Daily engagement

Two retention mechanics at launch:

- **Daily Pack.** Free claim every 24 hours. Notification sent when available.
- **Login streak bonus (coins).** Consecutive days logged in grant escalating coin bonuses. Missing a day resets the streak. Proposed escalator: Day 1 = 25 coins, Day 2 = 50, Day 3 = 75, Day 4 = 100, Day 5 = 150, Day 6 = 200, Day 7+ = 300/day until break.

No daily challenge contest, daily-milestone-progress pop-up, or featured matchup at launch.

### 14.3 Notifications

Notifications (push + in-app) fire on:

- **Daily Pack ready to claim.**
- **Card tier evolution** — "Your Aaron Judge card just leveled up to Gold!"

That's the launch set. Player status changes and lineup-lock reminders are deferred.

### 14.4 Customization

- Team name (editable, subject to moderation rules).
- Primary & secondary colors (picker).
- Logo selected from **preset library**. No custom logo upload in v1 (avoids moderation burden).

---

## 15. Team Milestones (the achievement system)

At launch, the **team milestones** ARE the achievement system. They are cumulative, season-long counters that tally the stats produced by every card the user has started in contests that season.

### 15.1 Milestones & tiers

| Milestone              | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|------------------------|--------|--------|--------|--------|
| Team Hits              | 50     | 250    | 500    | 1,000  |
| Team Home Runs         | 10     | 50     | 100    | 200    |
| Team Stolen Bases      | 10     | 30     | 60     | 100    |
| Team Pitching Wins     | 5      | 15     | 30     | 50     |

### 15.2 Rewards

Each tier pays out a bundle of:

- Coins (scaling with tier)
- Manager Level XP
- Bonus tokens (sometimes)

Exact values to be tuned; a reasonable anchor is Tier 1 → small reward, Tier 4 → meaningful reward that feels like a "season achievement."

### 15.3 Reset behavior

Team milestone counters **reset at the start of every season**. Lifetime cumulative totals are archived in the user's career stats and contribute to Manager Level XP.

### 15.4 Launch scope

**Only team milestones exist at launch.** Individual-card achievements, tier achievements, token achievements, collection-completion achievements, and seasonal achievements are deferred. This keeps launch scope small.

---

## 16. Late-Swap & Auto-Sub

Users can configure substitution behavior per-contest. Neither the card's contract play nor its applied token is consumed for a card that is subbed out before first pitch.

### 16.1 Two modes

The user selects one of two modes per lineup:

- **Smart Auto** — if any starter is scratched pre-game, the system automatically subs in the user's highest-FP available bench card at that position. Zero configuration. Best for low-friction users.
- **Manual Priority** — for each starter, the user drag-and-drops up to 2 ranked backup cards from the bench. If the starter is scratched, backup #1 fills in; if #1 is also unavailable, #2 does. Max strategic control.

### 16.2 Manual late-swap window

In either mode, if a player is scratched *before the first pitch of their game* (not the contest's start), the user can manually override the sub with any owned, contest-legal card at the same position. Late-swap window closes at first pitch of that player's game.

### 16.3 No-consumption rule

A card that is subbed out pre-game contributes 0 FP and does **not** consume a contract play. Its applied token (if any) is **refunded** to inventory unconsumed.

---

## 17. Scoring Edge Cases

### 17.1 Late scratch (player announced out after lineup lock, before first pitch)

- Auto-sub / manual late-swap fires per §16.
- If no sub is available (e.g., user has no other eligible card at that position), the scratched card scores 0 for the contest, contract play is NOT consumed, token is refunded.

### 17.2 Rainout / postponement

- If the game is canceled or postponed out of the contest window: card scores 0, contract play NOT consumed, token refunded.
- If the game is rescheduled (makeup) within the contest window: the card scores on the makeup, contract play consumed, token evaluates against the makeup game stats.

### 17.3 Doubleheader

- If the carded player plays in a doubleheader that falls within the contest window: the card scores from both games combined. Contract play is consumed only once. Token evaluates against combined stats for condition trigger purposes.

### 17.4 Suspended game

- A game that's suspended and resumed later within the contest window: stats from both segments are combined for scoring.
- If the suspension extends beyond the contest window: stats to the point of suspension count; no further scoring.

### 17.5 Mid-game trade

- An MLB mid-game trade is exceptionally rare and handled by the real-time data feed. The card's team tag updates post-game. Scoring within that game is unaffected.

---

## 18. Social Layer

### 18.1 Profile visibility

**Everything is public by default** for v1.

Visible on a user's public profile:

- Team identity (name, colors, logo, Manager Level).
- Vault (full, browsable by season).
- Current season stats (rostered card count, FP total, team milestones hit this season, contests won this season).
- Lifetime stats (career FP, career contests won, lifetime vaulted cards, lifetime token triggers).

**Not visible:** active rostered cards, upcoming lineups, applied tokens for upcoming contests. This prevents lineup copying.

### 18.2 Social interactions

**View-only for v1.** No following, no friending, no messaging. Users can browse any other user's public profile but there's no relationship layer. Social features are a candidate for a post-launch release.

### 18.3 Leaderboards

Four leaderboards at launch, selectable via a single "Leaderboards" screen with a view-toggle:

- **Manager Level** (lifetime prestige)
- **Season FP** (current season only, resets Opening Day)
- **Card prestige** — most Diamond cards this season
- **Vault prestige** — lifetime Diamond cards vaulted

Each leaderboard shows global top 100 + the user's rank relative to the viewer.

---

## 19. UX Details

### 19.1 Collection UI

Primary view: **grid view with strong filters**.

- Filters: by position (C/1B/2B/3B/SS/OF/SP), tier (Bronze/Silver/Gold/Diamond), player status (Active/IL/DFA/Retired/Expired), contract remaining (Any/Low <5/Critical <2), applied token (yes/no).
- Sort: tier, career FP, acquisition date, contract remaining, player alphabetical.
- Search: by player name.
- Tap into a card → detail view (full stats, token success breakdown, contract info, extend button, quick-sell button).

### 19.2 Live contest view

Accessed from the user's lineup page. When a contest is live:

- Shows the submitted lineup with each card's live contest score.
- Updates play-by-play as MLB games unfold.
- Pulsing animation when a card scores.
- Recent events feed ("Judge just hit a 2B! +5 FP on your card").
- Total score and live contest rank update in real time.
- Token status per card (pending / triggered / missed / not yet possible).

### 19.3 Pack opening

Sequential reveal with tier-colored flashes (§6.6). Final card slot reserved for the highest-value pull to build anticipation. Tap-to-reveal for user-paced engagement.

### 19.4 Vault ceremony

Full-screen guided flow at end-of-season (§11.4). 4–5 steps, <2 minutes total. Dissolving animation for un-chosen cards is the emotional peak — cards flake into motes of light and dispersion effect.

---

## 20. Data Model Sketch (engineering handoff preview)

This is preliminary; the full data model belongs in a technical spec.

**`player`** — canonical MLB player reference.
- `player_id` (MLBAM), `first_name`, `last_name`, `team_id`, `positions[]`, `status` (`active`/`il`/`dfa`/`retired`), `designated_value_tier`, `is_pitcher`, `is_two_way`.

**`card`** — one row per card instance.
- `card_id`, `user_id`, `player_id`, `season_tag`, `acquired_at`, `career_fp_total`, `current_tier` (cached), `contract_plays_remaining`, `extension_count`, `applied_token_id`, `is_expired`, `is_vaulted`, `vaulted_season_tag`, plus denormalized `token_success_counters`.

**`token`** — one row per token instance.
- `token_id`, `user_id`, `token_type`, `applied_to_card_id`, `consumed_at`.

**`pack_opening`** — audit log.
- `opening_id`, `user_id`, `pack_type`, `opened_at`, `cards_granted[]`, `tokens_granted[]`, `coins_from_dupes`.

**`contest_entry`** — every contest entered.
- `entry_id`, `user_id`, `contest_id`, `lineup[]` (card_ids + positional slot), `tokens_applied[]`, `auto_sub_mode`, `manual_priorities`, `final_score`, `coins_in`, `coins_out`, `cards_awarded[]`, `tokens_awarded[]`, `contract_plays_consumed[]`.

**`team_milestone_state`** — per-user, per-season.
- `user_id`, `season_tag`, `hits`, `home_runs`, `stolen_bases`, `pitching_wins`, `tiers_hit[]`.

**`manager_account`** — per user, cross-season.
- `user_id`, `manager_level`, `manager_xp`, `lifetime_fp`, `lifetime_contests_won`, `lifetime_diamond_cards_vaulted`, `lifetime_token_triggers`, `team_name`, `team_colors`, `team_logo_id`.

**`vault_entry`** — one row per vaulted card.
- `vault_id`, `user_id`, `card_id` (preserved reference), `season_tag`, `final_tier`, `final_fp`, `final_token_success_stats`.

---

## 21. Deferred Decisions & Open Questions

Items intentionally deferred, flagged for later, or parked for playtesting:

1. **Contest formats** — DFS lineup construction rules (positional slots proposed: 1C / 1-1B / 1-2B / 1-3B / 1-SS / 3-OF / 2-SP), scoring system application, contest cadence (daily slate, single-game showdown, weekend multi-day, live), cash-entry flow, regulatory and KYC requirements. Entire companion spec.
2. **Tier FP thresholds** — 0 / 250 / 1,000 / 5,000 is a proposal; tune against DK-scaled stat distributions.
3. **Collection cap size** — 100 is a starting proposal.
4. **Contract default length** — 15 is the starting proposal; tune against expected contest cadence and card refresh rate.
5. **Contract extension pricing** — tier-scaled escalator numbers in §5.4 are proposals.
6. **Token bonus values** — specific +X values to be tuned against DK scoring and economy goals.
7. **Token drop rates from packs** — specific percentages per pack type.
8. **Pack coin prices** — Standard and Premium coin costs.
9. **Login streak curve** — specific coin amounts per day.
10. **Team milestone reward sizing** — coin/XP/token payouts at each tier.
11. **Manager Level XP values** — per-event XP amounts.
12. **Starter bundle players at launch** — editorial curation of 10 Bronze players forming a playable lineup.
13. **Preset logo library** — ~50 logo designs need creation.
14. **Token tiers (future)** — whether to introduce Bronze/Silver/Gold/Diamond token strength tiers.
15. **Manager Level gameplay effects (future)** — bigger Opening Day bundles, extra vault slots, cosmetics.
16. **Themed / event packs** — Opening Day Pack, All-Star Pack, etc.
17. **Rich achievements beyond team milestones** — collection, tier, token, seasonal.
18. **Tutorial contest design** — real contest vs. scripted sandbox.
19. **Social features** — follow, friend, activity feeds, messaging.
20. **Card moderation / team name moderation policy.**
21. **Legacy retired-player cards** — whether they stay in collection forever or auto-vault.
22. **Vault preservation of expired cards** — does an expired card count as a vault slot the same as an active one? (Current assumption: yes.)
23. **Cap interactions during trades/call-ups** — if a card's player is DFA'd, does the collection cap still count it?

---

## 22. Glossary

- **Card** — a collectible representing one MLB player, owned by one user, bound to that user for life.
- **Tier** — a card's cosmetic progression level (Bronze / Silver / Gold / Diamond), earned by accumulating FP.
- **FP (fantasy points)** — standard fantasy-baseball scoring points, using DK-style values in §4.
- **Career FP total** — cumulative FP a specific card has earned across every contest it was started in, plus triggered token bonuses.
- **Contract** — the number of plays a card can still be started in before expiring. Starts at 15.
- **Expired card** — a card whose contract has hit 0. Stays in collection but unplayable until renewed, sold, or vaulted.
- **Extension** — paying coins to add plays to a card's contract. Cost scales with tier and extension count.
- **Token** — a single-use consumable with a conditional trigger and a fantasy-point bonus.
- **Pack** — a bundle of randomly drawn cards (and sometimes tokens). Daily (free), Standard, Premium.
- **Quick-sell** — converting a card into coins. Automatic on duplicate pulls; also available manually.
- **Coin** — in-game soft currency, F2P-earned only, dissolves at season end.
- **Collection cap** — maximum number of cards (active + expired) a user can hold. Proposed: 100.
- **Vault** — permanent public keepsake archive. User preserves up to 10 cards per season at the end-of-season ceremony.
- **Manager Level** — lifetime XP-based prestige level, visible on profile and leaderboards. Persists across seasons.
- **Season** — MLB Opening Day through World Series end. Draft Deck resets at season boundaries (coins, tokens, non-vaulted cards all dissolve).
- **Team milestone** — season-long cumulative counter (Team Hits, HRs, SBs, Pitching Wins) that pays out coins + XP + tokens at threshold tiers. Launch achievement system.
- **Designated value tier** (internal) — Star / Starter / Role player / Prospect. Governs pack drop weights. Never visible to users.
- **Smart Auto / Manual Priority** — two auto-sub modes. Smart Auto subs in highest-FP bench card; Manual Priority uses user-ranked backups.
- **Late-swap window** — user's opportunity to manually replace a scratched card before that game's first pitch.

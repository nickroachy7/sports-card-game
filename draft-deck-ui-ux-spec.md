# Draft Deck — UI/UX Specification (v0.1)

**Companion to:** `draft-deck-gameplay-spec.md` (v0.2)
**Platform:** Desktop web (mobile web deferred to a post-launch pass).
**Status:** Direction + per-screen architecture. Visual assets (card frame art, pack art, logo library, player photography treatments, icon library) are deferred to the design execution phase.

---

## 1. Design Principles

1. **GM dashboard by day, collectible card by night.** The everyday UI is serious, data-forward, and professional — like a sports-tech product. The cards themselves are premium collectibles. Big moments (pack open, tier-up, vault ceremony) are theatrical.
2. **Cards are the hero.** Photography-driven, framed with tier-specific foil treatments. The rest of the UI is chrome that lets cards shine.
3. **Tier is unmistakable at a glance.** A user should be able to tell Bronze from Silver from Gold from Diamond from across the room. Frame color and foil escalation do the work.
4. **Motion is reserved.** Quiet, purposeful micro-interactions on everyday actions; cinematic sequences only on earned big moments.
5. **Public prestige is the reward.** Vault, Leaderboards, and profile stats are first-class destinations, not buried tabs.
6. **Don't decorate gameplay, support it.** Status flags (IL, DFA, Expired), contract countdowns, and token applications are surfaced clearly — they're not fun to discover at lineup-lock time.

---

## 2. Visual Identity

### 2.1 Color palette

**Base: charcoal + cream.** Warm dark shell with cream typography; evokes a nostalgic card-shop while still feeling contemporary.

| Token          | Hex (proposed) | Usage                                       |
|----------------|----------------|---------------------------------------------|
| `--bg`         | `#1A1816`      | Page background (warm near-black)           |
| `--surface`    | `#24211E`      | Panels, cards of UI, sidebar                |
| `--surface-2`  | `#2E2B27`      | Elevated surfaces, hover states             |
| `--border`     | `#3A3631`      | Dividers, card outlines, filter chips       |
| `--text`       | `#F5F1E8`      | Primary text (cream)                        |
| `--text-2`     | `#C9C3B5`      | Secondary text                              |
| `--text-3`     | `#8A8478`      | Tertiary / helper text, timestamps          |
| `--muted`      | `#5E584F`      | Disabled, placeholder, inactive indicators  |
| `--accent`     | TBD            | A single interactive-accent color (link / primary button hover). Candidates: deep clay red, stadium green, or bronze. Decide with the logo library. |

**Tier accents (used on card frames, badges, and tier-up moments only):**

| Tier    | Hex anchor | Foil treatment                          |
|---------|------------|------------------------------------------|
| Bronze  | `#A57248`  | Matte copper frame, no foil              |
| Silver  | `#C5C0B8`  | Brushed steel frame, subtle linear shine |
| Gold    | `#D4A647`  | Gold frame, holofoil accent at corners   |
| Diamond | `#A8DDE2`  | Full animated holo frame + shimmer on hover; iridescent teal-pearl base |

Tier colors **never appear in general UI chrome**. They're reserved for card frames, tier-up sequences, progress bars, and tier-related iconography. Everyday UI stays in the charcoal + cream system.

### 2.2 Typography

**Sans primary + mono for numbers.**

- **UI type:** Inter (400 / 500 / 600 / 700). Used for body, labels, buttons, headings.
- **Numeric / stats:** JetBrains Mono (500 / 700). Used for career FP, contract counts, contest scores, coin balances — anywhere digits need to align and feel engineered.
- **No decorative / display face at launch.** Player names use Inter at large sizes with tight tracking for confidence.

Type scale (rough):

| Role            | Size / weight          | Usage                          |
|-----------------|------------------------|--------------------------------|
| Display         | 40px / Inter 700       | Hero moments, recap headers    |
| Heading 1       | 28px / Inter 700       | Page titles                    |
| Heading 2       | 20px / Inter 600       | Section headers                |
| Heading 3       | 16px / Inter 600       | Subsection / card titles       |
| Body            | 14px / Inter 400       | Body text                      |
| Label           | 12px / Inter 500 (tracked 0.05em) | Filter labels, tags |
| Stat big        | 28px / JBMono 700      | Hero numbers (contest score, career FP total on card detail) |
| Stat            | 14px / JBMono 500      | Inline stats (FP, coins)       |
| Tag             | 11px / Inter 600 uppercase | Position tags, status pills |

### 2.3 Iconography

Line icons with a 1.5px stroke, rounded caps, matching the cream palette. A single set at 16 / 20 / 24 px. Baseball-specific icons (bat, ball, diamond, HR-arc, strikeout, glove) drawn as a small custom set. Everything else from a general system (search, filter, settings, notifications, close, chevrons).

### 2.4 Spacing & radius

4-px base grid: spacing tokens at 4 / 8 / 12 / 16 / 24 / 32 / 48. Border radius tokens: 4 (chips, inputs), 8 (buttons, cards UI), 12 (panels), 20 (pack-shop cards), card-frame-specific radius for actual collectible cards.

### 2.5 Surfaces & elevation

Elevation uses surface color shifts rather than shadows (shadows read oddly on warm dark). Three levels: `--bg` → `--surface` → `--surface-2`. A subtle 1px `--border` separates surfaces. Shadows reserved for floating elements (drawers, modals, hovered cards).

---

## 3. Layout & Navigation

### 3.1 App shell

Desktop-first layout:

```
┌──────────────────────────────────────────────────────────┐
│ HEADER (persistent)                                      │
│ [Team logo + name] ................... [Coins] [DP] [ML] [Profile] │
├──────┬───────────────────────────────────────────────────┤
│ SIDE │                                                   │
│  NAV │           MAIN CONTENT                            │
│      │                                                   │
│ 6 it │                                                   │
└──────┴───────────────────────────────────────────────────┘
```

### 3.2 Sidebar navigation

6 top-level items, icon + label (collapsible to icon-only on narrow desktop; expands on hover):

1. **Lineup** — default landing. Team builder + contest entry + live contest.
2. **Collection** — card browser.
3. **Shop** — pack store.
4. **Vault** — permanent keepsake showcase.
5. **Milestones** — team milestones dashboard + recap feed.
6. **Leaderboards** — four rankings with view switcher.

Active state: left accent bar + text weight shift. Hover: surface-2 background.

### 3.3 Header (persistent chrome)

Slim bar, `--surface` background, bottom `--border`:

- **Left:** Team logo + team name.
- **Right (in order):**
  - **Coin balance** with a coin glyph. Animated tick on coin changes.
  - **Daily Pack indicator** — a small chip that pulses when today's pack is ready to claim. Clicking routes to Shop. Disappears/greys after claim.
  - **Manager Level** — small badge showing `LVL 24` (or similar). Click navigates to Leaderboards (which is also where career stats live in-context).
  - **Profile button** — avatar/initial. Click opens a right-side drawer (see §3.4).

No live-contest chip in the header. Live-contest entry is via the Lineup page itself.

### 3.4 Profile drawer

Slides in from the right when the Profile button is clicked. Overlays, does not navigate away.

Contents (stacked top-to-bottom):

- Team identity: name, logo, colors.
- Manager Level: current level + XP progress bar to next level.
- Career stats snapshot: lifetime contests won, lifetime diamond cards vaulted, lifetime token triggers, career FP.
- Quick links: "View my public profile", "Team customization", "Account settings", "Sign out".
- Close (X) top-right; click-outside also closes.

---

## 4. Card Anatomy (Deep Dive)

Cards are the visual centerpiece of Draft Deck. This section is the canonical spec for what a card looks like, how it behaves at every size and state, and the micro-flows that radiate from card interactions (quick-sell, contract extension, token drag-drop, Star-player pack reveal).

### 4.1 Design intent

Cards read as understated premium. The photo and tier frame carry the visual story; typography stays confident but not loud; no team color on the card body; no ornamental flourishes beyond tier material escalation. A user should be able to tell at a glance — across a 5×4 collection grid — which cards are Bronze, Silver, Gold, or Diamond, purely from the frame surface. Higher tiers earn subtle ambient motion; everyday tiers stay still. Status modifiers (IL, DFA, Expired, Retired) are communicated with uniform pills — never with dramatic overlays that disrupt the visual grid.

### 4.2 Dimensions & sizes

All cards share the 5:7 portrait aspect ratio (equivalent to the standard trading-card 2.5" × 3.5"). Three fixed sizes exist:

| Size    | Width × Height (px) | Corner radius | Frame (outer / inner bevel) | Used in                                                                         |
|---------|---------------------|---------------|------------------------------|---------------------------------------------------------------------------------|
| Small   | 96 × 134            | 6px           | 3px / 6px                    | Lineup slots when filled, bench drawer, vault timeline thumbnails, profile drawer |
| Medium  | 160 × 224           | 10px          | 4px / 8px                    | Collection grid (default), starter bundle reveal, quick-sell/extension modals     |
| Large   | 320 × 448           | 16px          | 7px / 14px                   | Card Detail hero, Pack Opening reveal, tier-up cut-in                            |

### 4.3 Layer stack

From bottom to top (z-order):

1. Card base panel (`--surface` charcoal with a subtle 1px inner `--border`).
2. Player headshot photo.
3. Inner bevel shadow (1px, `rgba(0,0,0,0.4)`).
4. Tier frame (material + inner bevel — see §4.5).
5. Position tag (top-left) and team logo (top-right).
6. Status pill (top-center, only one at a time — see §4.10).
7. Player name typography (below photo).
8. Stats footer strip (bottom, `--surface-2` background).
9. Token chip inside the stats footer (empty placeholder or filled chip).
10. Hover overlay — quick-action icon tray (§4.12), only at Medium size on hover.
11. Tier-specific ambient motion layer (Silver hover shine, Gold corner bloom, Diamond shimmer, Diamond Large-size particle motes).

### 4.4 Photo treatment

- Subject: head-and-shoulders player headshot. Neutral fantasy-app style (think DraftKings, FanDuel, ESPN Fantasy).
- Background: pure `--surface` charcoal — no team color, no gradient, no stadium, no tint. The photo sits directly on the card panel, reading as "cut-in" to the card rather than as a separate scene. This is the primary unifying visual decision of the whole design system: every card shares the same background canvas.
- Photo occupies the top ~60% of the card body (the area inside the frame, above the stats footer).
- Subjects roughly centered horizontally; faces in the top half of the photo area.
- Lighting: press / roster shots preferred — even illumination, neutral expression.
- Fallback (brand-new call-ups before photo ingestion): silhouette avatar with the player's uniform number large-numbered in cream. A small banner at the bottom of the photo area reads `PHOTO COMING SOON`.

### 4.5 Tier frames

All four tier frames share identical **geometry** (4px outer border + 8px inner bevel at Medium size, proportionally scaled at Small and Large). What differs is the **material finish** and the **ambient motion**. Per user direction: subtle — frame reads more like chrome than jewelry; the photo still dominates. Diamond is the only tier with continuous motion.

#### 4.5.1 Bronze — matte copper, quiet baseline

- Outer border: solid `#A57248`.
- Inner bevel (8px): vertical linear gradient `#B8814C → #8E5E38`.
- No shine, no ambient motion.
- On hover (Medium size only): none — Bronze stays completely still. Brightness bump of the card comes from the hover state of the card itself (§4.12), not the frame.

#### 4.5.2 Silver — brushed steel, shines on hover

- Outer border: solid `#A8A099`.
- Inner bevel (8px): horizontal linear gradient `#C5C0B8 → #D8D3C8 → #B0ABA2` with a vertical-grain noise overlay at 8% opacity.
- Ambient (idle): none.
- Hover (Medium): single linear shine pass — a bright highlight band (10% wider than the frame) sweeps diagonally across the bevel in 350ms, then rests.
- At Large: shine triggers automatically every 6s (same motion, same timing).

#### 4.5.3 Gold — polished gold, holofoil corners, periodic bloom

- Outer border: solid `#B8923A`.
- Inner bevel (8px): diagonal (135°) linear gradient `#F5C768 0% → #D4A647 50% → #A37B2A 100%`.
- Corner accents: 12×12px iridescent holofoil patches at each of the four corners. Barely-there rainbow gradient (cyan → magenta → gold, ~30% opacity).
- Ambient: every 6 seconds, the four corner accents glow brighter in sequence (top-left → top-right → bottom-right → bottom-left), each fading in over 300ms and out over 900ms. A full corner-cycle takes ~4s with staggered timing.
- Hover (Medium): ambient cycle doesn't change, but the card's photo-area brightness lifts +4% (§4.12).
- At Large: ambient cycle runs as described; no additional motion.

#### 4.5.4 Diamond — iridescent, continuous subtle animation

- Outer border: solid `#8DC3C9`.
- Inner bevel (8px): a conic gradient rotating continuously (20s per full cycle) with these hue stops: `#A8DDE2 → #F0E3F5 → #C8D8E8 → #E8E0D8 → #A8DDE2`. The result is a slow-turning iridescent pearl effect.
- Ambient: in addition to the rotating conic, a brief shimmer ripple plays every 3 seconds — a bright linear pass across the bevel, 250ms in-out.
- At Large only: 3–5 drifting light motes over the frame, each ~2px cream-tinted, travelling along soft curves with 4–6s paths. Motes are generated with randomized start points, travel vectors, and opacity curves (10% → 40% → 10%). Rendered in Canvas/WebGL for performance.
- Hover (Medium): card's photo brightens +4%; frame motion unchanged.

### 4.6 Typography on the card face

| Element        | Font             | Weight | Size (Medium) | Case / tracking              |
|----------------|------------------|--------|---------------|------------------------------|
| Player name    | Inter            | 700    | 14px          | All caps, tracked 0.02em     |
| Position tag   | Inter            | 600    | 10px          | All caps, tracked 0.04em     |
| Team logo      | (vector glyph)   | —      | 14 × 14px     | —                            |
| Career FP      | JetBrains Mono   | 700    | 14px          | Numeric                      |
| Contract (x/y) | JetBrains Mono   | 500    | 11px          | Numeric                      |
| Token chip     | Inter            | 600    | 10px          | All caps                     |
| Status pill    | Inter            | 600    | 10px          | All caps, tracked 0.04em     |
| 2-WAY chip     | Inter            | 600    | 9px           | All caps, tracked 0.05em     |

At Small size, scale type approximately ×0.75 (player name 10px, stats hide). At Large size, scale approximately ×1.75 (player name 22px, stats 20px / 18px, extended footer with tier name + progress bar). Tracking and weights stay constant.

### 4.7 Position tag, team logo, two-way indicator

**Position tag** — top-left corner of the card body, 10px inside the frame.

- Background: `--surface-2`.
- Border: 1px `--border`.
- Radius: 4px.
- Padding: 3px vertical × 6px horizontal.
- Text: position abbreviation (`C`, `1B`, `2B`, `3B`, `SS`, `OF`, `SP`). For multi-position players, slash-separated (`OF/2B`, `SP/OF` for two-way).
- Max two positions; if a player is eligible at more, show the two most recent real-game starts.

**Team logo** — top-right corner, 10px inside the frame.

- 14 × 14px (Medium), 10 × 10px (Small), 22 × 22px (Large).
- Mono-glyph style: single-color cream (`--text`) SVG rendering of each MLB team's primary mark. A tiny desaturated adaptation — no team color ever, to preserve the unified palette.
- Updates automatically on trades.

**Two-way indicator** (Ohtani model):

- Position tag shows both roles (`SP/OF`).
- A separate `2-WAY` chip renders immediately to the right of the position tag, same row, same height.
- Chip styling: cream text on `--surface-2`, 1px `--border`, 4px radius, tracked 0.05em.
- No special frame treatment — two-way players use their normal tier frame. Uniqueness is communicated by the dual position tag + chip.

### 4.8 Stats footer

A horizontal strip at the bottom of the card body, separated from the photo area by a 1px `--border` hairline. Background: `--surface-2`.

**Structure (Medium size, ~36px tall):**

- Left: Career FP. JBMono 700, 14px, cream. Example: `1,240 FP`.
- Right: Contract count with a small counter glyph (`⌞`). JBMono 500, 11px. Example: `⌞ 12/15`.
- If a token is applied, the token chip replaces the empty placeholder (see §4.9) on a second row (~18px tall, ~54px total footer height at Medium).

**Contract color coding:**

| Plays remaining  | Color of contract text + glyph | Frame outer halo          |
|------------------|--------------------------------|---------------------------|
| ≥ 5              | `--text` (cream)               | None                      |
| 3–4 (low)        | `#D4A647` (amber/gold)         | None                      |
| ≤ 2 (critical)   | `#C47262` (muted red)          | 2px blur outer halo, 30% opacity, muted-red tint |
| 0 (expired)      | `#5E584F` (muted)              | None — card handled via EXPIRED pill + photo desaturation |

The critical-state halo is the only context where a non-tier color touches the frame. It's scannable from across a grid — a user with two expiring-soon cards sees them immediately.

### 4.9 Token slot

Lives inside the stats footer, right-aligned, below the FP/contract row.

**Empty state** (no token applied, card is token-eligible):

- Dotted outline placeholder: 80 × 18px at Medium.
- 1px dashed `--text-3` (tertiary cream) border.
- 4px radius.
- Text inside: `+ TOKEN`, Inter 600, 9px, `--text-3`, centered.
- **Drop-context hover** (during a token drag): the outline brightens to solid `--text`, cream tint, 110% scale. Signals valid drop target.

**Filled state** (token applied):

- Solid chip, `--surface` background, 1px `--border`, 4px radius, 80 × 18px.
- Token glyph on the left (e.g. `⚾` for HR Bonus, `K` for Strikeout Bonus, `2H` for Multi-Hit, `SB` for Stolen Base, `QS` for Quality Start — an icon + letters design for each token type).
- Condition text on the right: abbreviated condition + bonus (e.g. `HR +20`, `K8+ +30`, `QS +25`, `2H +15`, `SB +20`).
- On hover: small `×` button appears at the top-right of the chip, allowing manual removal (only before lineup lock).

**Live-contest states** (during and after a contest the card is rostered in):

| Token state  | Visual                                                                                          |
|--------------|-------------------------------------------------------------------------------------------------|
| Pending      | Default filled chip. Cream text.                                                                |
| Active       | Same chip, subtle pulse on the glyph (opacity 0.8 ↔ 1.0 on 1.5s ease-in-out loop).             |
| Triggered    | Chip inverts — cream `--text` background, `--surface` text. Plus a small `✓` glyph added. A one-time `+X earned` micro-animation floats up from the chip and fades (0.9s travel, cream text, Inter 600, 11px). |
| Missed       | Chip greys to `--muted` text on `--surface` background. No more updates.                        |

**At Small size:** token chip reduces to a 12 × 12px glyph-only indicator in the card's bottom-right corner. No text, no placeholder when empty.

**At Large size:** token chip is proportionally larger (~140 × 28px), token glyph renders at 16px, text at 12px. All state transitions unchanged.

### 4.10 Status pills

All non-default states render as uniform pills at the top-center of the card, sitting over the photo area. Only one pill shows at a time. Pills never dim, desaturate, or watermark the card — the card itself stays visually legible.

**Pill geometry:**

- Medium: 18px tall, 8px horizontal padding, 4px radius, Inter 600 10px all-caps tracked 0.04em.
- Small: 14px tall, 6px horizontal padding, same radius, 9px text.
- Large: 22px tall, 10px horizontal padding, same radius, 12px text.
- Positioned 10px below the top frame edge, horizontally centered.

**Catalog:**

| State      | Text         | BG color                   | Text color | Applies when                                                                 |
|------------|--------------|----------------------------|-----------|------------------------------------------------------------------------------|
| —          | (no pill)    | —                          | —         | Active, default                                                              |
| IL         | `IL`         | muted red `#C47262`        | `--text`  | Real player on IL                                                            |
| FA         | `FA`         | amber `#D4A647`            | `--bg`    | Real player DFA'd / released / unsigned                                      |
| EXPIRED    | `EXPIRED`    | `--muted` `#5E584F`        | `--text`  | Card contract = 0 plays                                                      |
| LEGACY     | `LEGACY`     | cream `#F5F1E8`            | `--bg`    | Real player retired (card is locked from play)                               |
| NEW        | `NEW`        | `--text` `#F5F1E8`         | `--bg`    | Pulled this session, user hasn't opened detail yet                           |
| LEVELED UP | `LEVELED UP` | (tier-accent color of new tier) | `--bg` | Card just crossed a tier boundary in the most recent contest, not yet acknowledged |
| VAULTED    | `VAULTED`    | `--text` + lock glyph      | `--bg`    | Only shown in the Vault context if the rendering surface isn't already "Vault" |

**Priority order** (if multiple states are active, only the highest-priority pill shows): `LEVELED UP > NEW > EXPIRED > IL > FA > LEGACY > VAULTED`.

LEVELED UP and NEW are **dismissible** — opening the Card Detail once clears the pill. EXPIRED, IL, FA, LEGACY, VAULTED reflect real-world state and clear only when that state changes.

### 4.11 Size adaptation

#### 4.11.1 Small (96 × 134)

Used in lineup slots, bench drawer, vault timeline thumbnails, profile-drawer recent pulls.

- Tier frame: 3px outer + 6px inner bevel (proportional).
- Photo: visible, hero.
- Player name: **last name only**, Inter 700, 10px, all caps. `JUDGE`, `OHTANI`, `DE LA CRUZ`.
- Position tag: visible, condensed (7px text, compact padding).
- Team logo: **hidden**.
- Stats footer: **hidden** entirely.
- Token chip: **glyph-only**, 12 × 12px, bottom-right corner of the card body (outside stats footer since footer is hidden). Empty placeholder hidden.
- Status pill: visible, Small-sized (14px tall, 9px text).
- Frame ambient motion: Gold corner bloom and Diamond shimmer continue but at reduced amplitude (−30% opacity) to avoid distraction in dense grids.
- Hover: 1px cream outline pulse only — no quick-action tray (no room).
- Click: opens Card Detail at the containing page level; for in-lineup context, click opens an inline options mini-menu (Remove from slot / Open Detail / Swap).

#### 4.11.2 Medium (160 × 224)

Default size. Collection grid, starter bundle reveal, quick-sell modal preview.

- Full anatomy per §4.1–§4.10.
- Hover: quick-action tray fades in along the bottom edge (§4.12).

#### 4.11.3 Large (320 × 448)

Card Detail hero panel, Pack Opening reveal center-stage, tier-up cut-in center-stage.

- Tier frame: 7px outer + 14px inner bevel.
- Photo: larger, ~272px tall.
- Player name: full first + last, Inter 700, 22px, all caps.
- Position tag: 14px text, larger padding.
- Team logo: 22 × 22px.
- **Stats footer is expanded**:
  - Row 1: Career FP (JBMono 700, 24px, cream) — e.g. `1,240 FP`. Large and confident.
  - Row 2: Tier name in tier-accent color (`GOLD TIER`, Inter 600, 12px all-caps tracked 0.04em) + a 2px-tall FP progress bar to next tier, tier-color fill on `--surface` track. Bar hover shows `750 / 1,000 FP to DIAMOND` tooltip.
  - Row 3: Contract (`⌞ 12/15`, JBMono 500, 14px) + last-played date (`LAST PLAYED · MAY 14`, Inter 500, 11px, `--text-3`). Aligned left-right.
  - Row 4 (if token applied): token chip, larger (~140 × 28px), glyph 16px, text 12px.
- Frame ambient motion: Silver hover-shine auto-triggers every 6s; Gold corner bloom cycle as usual; Diamond shimmer as usual; Diamond **light motes** visible (only here).
- No hover quick-action tray — all actions live in the Card Detail side panel (§5.3).

### 4.12 Hover & interaction

**Medium-size hover (in Collection grid or elsewhere):**

- 200ms ease-out:
  - Card `translateY(-2px)`.
  - Photo area brightness `+4%` (filter: brightness(1.04)).
  - Subtle shadow under card (`0 4px 16px rgba(0,0,0,0.4)`).
  - Tier ambient motion triggers a one-time pass: Silver shine runs, Gold corner bloom cycles once, Diamond shimmer pulses once. Bronze does nothing extra.
- Quick-action tray fades in along the card's bottom edge (28px tall strip on top of the stats footer, `--surface-2` background, 95% opacity):
  - `⊘ Extend` — appears only if contract is < 15. Click → opens Extension modal (§4.14.2).
  - `✕ Quick-sell` — click → opens Quick-sell dialog (§4.14.1).
  - `⊕ Detail` — click → navigates to Card Detail page.
  - Each icon: 24 × 24px, cream-on-surface-2, 4px gap.
- Tray exits on mouseleave (150ms fade-out).

**Small-size hover:** 1px cream outline pulse only. No tray.

**Large-size:** no hover state behavior — all actions in side panel.

**Drag state (Medium, from Collection into Lineup):**

- `mousedown` → card scales to 1.06, shadow deepens, cursor grabs (120ms ease-out).
- Drop targets (eligible lineup slots) get a 2px dashed cream inner outline + subtle cream wash (10% opacity).
- Invalid targets (wrong position, expired card, card already in lineup) get a 2px dashed muted-red outline.
- `mouseup` on valid target: card settles with a small bounce (150ms ease-out, overshoot to 1.02 then back to 1.0).
- `mouseup` on invalid target: card snaps back to origin with a spring (250ms ease-in-out). Toast: `${player name} can't fill a ${position} slot.`

**Focus state (keyboard):**

- 2px cream outline, 4px offset around the card.
- On Enter/Space: opens a keyboard-navigable `Move to…` menu listing valid destinations (for lineup moves) or the default card actions (Detail, Extend, Quick-sell).
- Menu follows the same type and border system as other UI menus.

### 4.13 Card-adjacent flows

Four micro-flows that originate from card-level interactions. Each is specified end-to-end so engineering can implement without open questions.

---

#### 4.13.1 Quick-sell flow

**Trigger points (Medium size):**

- Hover `✕ Quick-sell` icon → click.
- Card Detail side panel → `Quick-sell` primary action.
- Automatic (no dialog): duplicate pull during a pack opening.

**Manual quick-sell steps:**

1. Confirmation dialog appears, modal, centered on the current page. Modal dimensions ~480 × 320px, `--surface-2` background, 12px radius.
2. Contents:
   - Title: `Quick-sell ${player first + last}?` (Inter 700, 20px).
   - Left column: the card rendered at Medium size (static, no hover state).
   - Right column, top-to-bottom:
     - Tier chip: `GOLD TIER` (tier-accent color).
     - Payout row: `Payout` label (Inter 500, 12px, `--text-3`) + `200 coins` (JBMono 700, 28px, cream). A small coin glyph to the right of the number.
     - For Silver / Gold / Diamond: a warning note — `This action is permanent.` (Inter 500, 11px, `--text-2`).
     - If token is applied: the confirm flow blocks. Instead of the payout block, show `A token is still applied. Remove it before selling.` with a `[Remove token]` button that clears the token (returning it to inventory), then the payout block reveals.
   - Action row at the bottom: `Cancel` (secondary button, left) and `Sell` (primary button, `--accent` fill, right).
3. On `Sell`:
   - Modal dissolves (200ms crossfade).
   - Card in the collection grid scales briefly to 1.05 (100ms ease-out), then dissolves into cream motes (~450ms) — the same dissolve used in the vault ceremony, at mini-scale.
   - Coin count in header: counter flickers upward from previous value to new value in ~400ms (JBMono digit roll).
   - Toast top-right: `${Last name} sold for 200 coins.` (5s auto-dismiss).
4. Collection count decrements, grid reflows, any active filters reapply.

**Auto-dupe sell during pack open:**

- No confirmation modal. The dupe card in the reveal sequence flips to its normal face briefly, then a cream `SOLD` pill appears at the top, and the card dissolves (shorter 250ms animation) while the coin count in the header ticks up inline.
- After the pack completes, the pack summary screen lists sold dupes with their individual payouts for transparency.

**Keyboard flow:**

- Tab to card → Enter → action menu → Quick-sell → confirmation dialog → Tab to Sell → Enter.

---

#### 4.13.2 Extend contract flow

**Trigger points:**

- Hover `⊘ Extend` icon (only shown if contract < 15 remaining).
- Card Detail Overview tab → `Extend` button.
- Inline `⊘ Extend` chip in the stats footer (appears at critical / low contract state **only if** the user has enough coins for at least +5 plays).

**Steps:**

1. Extension modal opens, centered, ~520 × 400px, `--surface-2` background.
2. Contents:
   - Title: `Extend ${player first + last}'s contract` (Inter 700, 20px).
   - Left column: card at Medium, showing current contract state.
   - Right column, top-to-bottom:
     - Sub-header: `Add plays to your contract` (Inter 600, 14px).
     - Three option rows, each a radio button:
       - `+5 plays · 750 coins` — preview: `Contract becomes 5/15 → 10/15`.
       - `+10 plays · 1,500 coins` — preview: `Contract becomes 5/15 → 15/15`.
       - `+15 plays · 2,250 coins` — preview: `Contract becomes 5/15 → 20/15` (plays remaining can exceed 15).
     - Pricing per gameplay spec §5.4 (tier-scaled base + escalator per extension count). If this is the Nth extension, prices reflect the `(1.5)^(N-1)` escalator. A small note beside the prices shows `+50% · ext. #${N}` when N ≥ 2 so the user knows why prices climb.
     - Tier-pricing explainer (collapsible, below the options): `Gold cards cost more to extend. Price scales with the card's current tier.`
     - Balance row: `Balance: 2,650 coins → 1,900 after purchase` (JBMono, the "after" value updates as the user selects different options).
   - Action row: `Cancel` and `Extend` (primary, `--accent`; disabled if insufficient coins, with tooltip `Need X more coins`).
3. On `Extend`:
   - Modal plays a 300ms confirmation: the contract number in the mini card preview ticks up (`5/15 → 10/15`, JBMono digit roll), coin count in the header ticks down simultaneously.
   - Modal closes (200ms fade).
   - Card's stats footer updates in place. Contract color recomputes. If the card was in critical state, the muted-red halo clears.
   - If the card was `EXPIRED`: pill removes, card transitions from expired visual treatment (desaturated) back to Active over 400ms.
   - Toast top-right: `${Last name}'s contract extended. 10 plays remaining.` (5s auto-dismiss).

**Error states:**

- Insufficient coins: `Extend` disabled, tooltip `Need X more coins.`
- Expired card: modal pre-selects `+15` and shows a note `This card will return to playable status.`

---

#### 4.13.3 Token drag-drop onto card

**Trigger:** during Lineup Building state (§5.1.1) or from the Token Tray on the Card Detail page, user drags a token chip onto an eligible card.

**Sequence:**

1. **Grab:** User mouses-down on a token chip in the tray. Chip scales to 1.08, slight shadow beneath, 80ms ease-out. Cursor changes to grab.
2. **Drag feedback:**
   - Token chip follows cursor via `CustomDragLayer`.
   - Other tokens in the tray dim to 60% brightness.
   - **Eligible cards** (where the token type validates — HR Bonus / Multi-Hit / SB Bonus on hitters; Strikeout Bonus / Quality Start Bonus on pitchers) glow: 2px cream outer halo + brightness `+10%`. A subtle cream tint warms the photo area.
   - **Ineligible cards** (wrong role, `EXPIRED`, not in lineup if context is lineup-only) dim to 60% brightness, no halo.
3. **Hover over valid card:**
   - Card scales to 1.02.
   - Halo brightens further.
   - Empty token slot in the stats footer brightens and switches from dashed to solid outline, cream background.
4. **Hover over invalid card:**
   - Card shows a 2px dashed muted-red outline.
   - Token chip (following cursor) shakes slightly (3px left-right, 2 cycles, 150ms each).
   - No drop cursor.
5. **Drop on valid:**
   - Token chip animates from drop point toward the card's stats footer, scaling down to slot size (~200ms ease-in-out).
   - Token slot renders the filled chip (`HR +20` etc.) in cream-on-surface.
   - A single 200ms cream glow pulse ripples outward from the card frame.
   - Token Tray: the applied token type count decrements by 1. If it was the last of its type, the type chip in the tray greys out (remains visible but non-draggable).
   - Toast top-right: `HR Bonus applied to ${Last name}.` (5s auto-dismiss).
6. **Drop on invalid / whitespace:**
   - Token chip snaps back to the tray (250ms spring).
   - Toast: `${Last name} can't use this token. Strikeout Bonus only applies to pitchers.` (or the relevant reason).

**Removing / reassigning a token (before contest lock):**

- **Option A:** User drags the filled token chip off the card's stats footer back to the Token Tray (or anywhere outside the card). Standard drag feedback; token returns to inventory; slot reverts to empty placeholder.
- **Option B:** Hover the filled token chip — a small `×` appears at the chip's top-right. Click → token returns to inventory silently.

**Contest-lock guard:**

- If the contest's lineup-lock window is ≤ 5 minutes away, removing or reassigning a token triggers a confirmation toast: `Lineup locks in 4 minutes. Remove token anyway? [Undo]` with a 4s snackbar Undo.

**Undo window on application:**

- After successful apply, the toast includes `[Undo]` as an action for 4 seconds. Clicking reverses the application (token returns to inventory, slot reverts). This is the standard one-tap safety.

**Keyboard flow:**

- Tab to a token chip in the tray → Enter → focus enters a picker mode highlighting all valid target cards → Tab between valid cards → Enter on the target applies the token. Esc cancels at any point.

**Accessibility:**

- Screen-reader announcement on drag start: `Dragging HR Bonus token. Select a hitter card.`
- On valid hover: `Apply HR Bonus to Aaron Judge.`
- On apply: `HR Bonus applied to Aaron Judge. Undo available for 4 seconds.`

---

#### 4.13.4 First-pull celebration (Star-tier player)

The only moment in the Draft Deck UI where team color appears as a background treatment. Triggered when a pack reveals a player with `designated_value_tier = Star` — normally reserved for the Premium Pack's final / chase slot.

**Steps (continuing from within the pack-opening sequence §6.2):**

1. Previous card reveal completes. Reveal sequence pauses briefly (~500ms) before the chase-slot card begins its reveal.
2. The area around the upcoming slot ripples outward — a soft radial pulse (1200ms, expanding from 0 → 60% of the modal, opacity 0.3 → 0) to signal anticipation.
3. The card back flips forward more slowly than a standard reveal (600ms ease-in-out vs. 300ms for non-Star cards).
4. As the card face emerges, a **team-color accent bloom** radiates from the card edges (18px blur radius, 40% opacity). The color is the player's team primary color, sourced from MLB team color metadata. The bloom fades over ~1.5s.
5. The player's name types in letter-by-letter (Inter 700, 22px, 20ms per letter), unveiling below the photo.
6. A small `STAR PLAYER` pill (cream on `--bg`, Inter 600, 11px all-caps tracked 0.05em) appears below the card for ~2 seconds, then fades.
7. Sequence advances to the pack summary screen.

**Audio (if sound enabled):** a brief musical sting — richer than the standard card-flip tick. Plays only on the first Star pull per session to prevent audio fatigue.

**Reduced-motion:** bloom becomes a simple 300ms crossfade behind the card (no ripple, no letter-by-letter typing — full name appears at once). No effect on gameplay outcomes.

**Frequency guard:** celebration fires for every Star pull in a session, but:

- Audio sting is once per session.
- Bloom opacity reduces to 25% for subsequent Stars in the same session.
- The `STAR PLAYER` pill always shows (it's informational, not just celebratory).

---

### 4.14 Implementation notes

- **CSS vs SVG vs Canvas:** Frame bevels and basic tier gradients are pure CSS. Gold corner holofoil accents and Diamond's conic-gradient rotation are SVG for crispness at all DPIs. Diamond's Large-size light motes use Canvas (or a minimal WebGL scene) for per-frame performance. The single-shimmer pass on Silver/Diamond can be a CSS pseudo-element with translate/opacity keyframes.
- **Animation budget:** in a collection grid of 100 cards, only visible cards animate. Use `IntersectionObserver` to pause ambient motion on off-screen cards. Target ≤ 2ms aggregate animation cost per frame on the visible viewport. If more than 10 Diamond cards are visible at once, adaptively reduce shimmer frequency (every 3s → every 6s).
- **`prefers-reduced-motion`:** disable all ambient frame animations (Silver shine, Gold corner bloom, Diamond shimmer + motes). Status transitions use instant swaps instead of dissolves. Pack-reveal Star-player bloom becomes a crossfade.
- **Focus + a11y:**
  - Every card element is a single `role="button"`. Accessible name = `${full name}, ${tier}, ${position}, contract ${x} of ${y}, ${optional token text}, ${optional status}`.
  - Status pills exposed as supplementary `aria-label` additions.
  - Drag-drop alternatives for keyboard users (above).
  - Focus outlines must be visible in both dark and hypothetical light mode.
- **Photo fallback pipeline:** placeholder renders at any size with the silhouette + number + `PHOTO COMING SOON` banner. When a real photo is ingested, the placeholder transitions to the photo on next card render (no hard refresh).
- **Localization hooks:** all pill text and token labels resolved via a translation layer. Token abbreviations (HR, K, QS, 2H, SB) are likely to stay English for baseball-idiom reasons, but surrounding text ("plays remaining", "Bonus", "Extend") should be localizable.
- **Testing:** visual regression snapshot matrix — 4 tiers × 7 state pills × 3 sizes × 2 motion preferences = 168 snapshots. Manageable with Percy / Chromatic. Add hover and drag state snapshots for Medium-size only (Small hover is one outline, Large has no hover).

### 4.15 Card detail data (lives in Card Detail page, not on face)

Per gameplay spec, these details never appear on the card face. They live exclusively in the Card Detail page (§5.3):

- Token trigger stats: total applied, total triggered, success rate, per-type breakdown.
- Last-N-games log: per-game FP earned, which tokens were applied, trigger outcomes.
- Contract extension history: count of extensions, cost paid, dates.
- Tier progression timeline: when each tier was crossed.
- Status change history: IL periods, trades, DFA events.

---

## 5. Screens

### 5.1 Lineup (default landing)

The most-used screen. Its layout **transforms across four states**: Building → Submitted → Live → Final.

#### 5.1.1 Building state

```
┌────────────────────────────────────────────────────────┐
│ Contest: Tonight's Slate — locks at 7:05 PM            │
│ 8 of 10 slots filled · 2 tokens applied · Auto-sub: ON │
├────────────────────────────────────────────────────────┤
│                                                        │
│         ┌──────┐                ┌──────┐               │
│         │  SP  │                │  SP  │               │  ← Pitchers (top)
│         └──────┘                └──────┘               │
│                                                        │
│   ┌──────┐  ┌──────┐    ┌──────┐  ┌──────┐             │
│   │  3B  │  │  SS  │    │  2B  │  │  1B  │             │  ← Infield row
│   └──────┘  └──────┘    └──────┘  └──────┘             │
│                                                        │
│                   ┌──────┐                             │
│                   │  C   │                             │  ← Catcher
│                   └──────┘                             │
│                                                        │
│    ┌──────┐       ┌──────┐       ┌──────┐              │
│    │  LF  │       │  CF  │       │  RF  │              │  ← Outfield (bottom)
│    └──────┘       └──────┘       └──────┘              │
│                                                        │
├────────────────────────────────────────────────────────┤
│ BENCH [position filter] [search] ·········· < scroll > │
│ [card] [card] [card] [card] [card] [card] [card] ....  │
├────────────────────────────────────────────────────────┤
│ TOKENS: [HR +X] [K +X] [Multi-hit +X] [SB +X] [QS +X]  │
├────────────────────────────────────────────────────────┤
│ Auto-sub: ○ Smart Auto ● Manual Priority               │
│                                    [ SUBMIT LINEUP ]   │
└────────────────────────────────────────────────────────┘
```

- **Diamond-inspired positional grid** (as selected). Empty slots show position tag + drag-hint ("Drag a 2B here"). Filled slots show the card at Small size with contract-remaining and any applied token.
- **Bench drawer** is a horizontally-scrolling strip of eligible cards. When a lineup slot is clicked/focused, the bench auto-filters to cards eligible at that position.
- **Token tray** is a fixed row above the submit bar. Each token type is a chip; drag to a card slot. One token per card max.
- **Auto-sub config:** Smart Auto (default) subs the highest-FP available bench card; Manual Priority reveals backup-rank dropdowns per starter.
- **Submit lineup CTA** shows countdown to first pitch, warns on illegal lineup, disables if any slot is empty.

#### 5.1.2 Submitted state

Same diamond layout, read-only. Cards show a subtle "LOCKED" pulse at edges. Header strip reads "Locked · First pitch in 12m." Bench, token tray, and auto-sub config hide. A "View Lineup Details" link expands to show the applied tokens and auto-sub config as read-only.

#### 5.1.3 Live state — layout transforms to list view

Once any game is live, the page flips to a list view:

```
┌────────────────────────────────────────────────────────────────────┐
│ LIVE · Contest rank 42/8,103 · Your score 147.3                    │
├────────────────────────────────────────────────────────────────────┤
│ SP   Skubal (DET)    vs CLE 7:05pm  ⬤ Live 4th inn   46.25 FP  [🎟✓] │
│ SP   Skenes (PIT)    vs STL 7:40pm  ○ Starts 7:40pm   —        [🎟] │
│ C    W. Smith (LAD)  vs ARI 10:10pm ○ Starts 10:10pm  —        [ ] │
│ 1B   Freeman (LAD)   vs ARI 10:10pm ○ Starts 10:10pm  —        [🎟] │
│ 2B   Altuve (HOU)    vs SEA FINAL   ✓ Final          12.0 FP   [ ] │
│ ...                                                                │
├────────────────────────────────────────────────────────────────────┤
│ RECENT: Skubal K #8 → 🎟 STRIKEOUT BONUS triggered! +20 FP         │
│ Skubal IP 6th → +2.25 FP                                           │
│ Altuve RBI single → +5 FP                                          │
└────────────────────────────────────────────────────────────────────┘
```

- Each row: position tag, player name + team, game status + first-pitch time, live score, token status indicator (🎟 = applied, ✓ = triggered, ∅ = missed).
- Token status chip pulses when a condition is met and awards bonus FP.
- Recent-events feed at the bottom streams play-by-play events relevant to this user's lineup.
- Total contest score + live rank persist at the top.

#### 5.1.4 Final state

Contest recap screen:

- Final score + rank + coin payout + tokens awarded + cards awarded (if any).
- Lineup summary: each card's FP contribution + token outcomes.
- Cards that leveled up get a "Tier Up" callout with the cut-in animation (see §6.3).
- Contract plays consumed shown per card.
- CTA: "Next contest in X hours" or "Enter another contest."

---

### 5.2 Collection

Grid + right-rail filters layout. The largest surface after Lineup.

```
┌────────────────────────────────────────┬──────────────┐
│                                        │ COLLECTION   │
│  [card] [card] [card] [card] [card]    │ 87 / 100     │
│  [card] [card] [card] [card] [card]    │              │
│  [card] [card] [card] [card] [card]    │ TIERS        │
│                                        │ ◆ 3 Diamond  │
│  (scroll)                              │ ● 12 Gold    │
│                                        │ ● 34 Silver  │
│                                        │ ● 38 Bronze  │
│                                        │              │
│                                        │ FILTERS      │
│                                        │ Position ▾   │
│                                        │ Tier ▾       │
│                                        │ Status ▾     │
│                                        │ Contract ▾   │
│                                        │ Token ▾      │
│                                        │              │
│                                        │ SORT         │
│                                        │ ⇅ Career FP  │
│                                        │              │
│                                        │ [ Reset ]    │
└────────────────────────────────────────┴──────────────┘
```

- **Center grid:** Medium cards (160×224), responsive flex-wrap. Hover reveals quick-action icons (extend contract, quick-sell, view detail).
- **Right rail:** Collection stats (X / 100 used + tier breakdown), filter controls, sort, search, and a reset button.
- **Filters:** Position (C/1B/2B/3B/SS/OF/SP/two-way), Tier (Bronze/Silver/Gold/Diamond), Status (Active/IL/DFA/Retired/Expired), Contract remaining (Any / Low <5 / Critical <2 / Expired), Token applied (Any / With / Without).
- **Sort:** Tier, Career FP, Acquired date, Contract remaining, Player name.
- **Search:** Player name, by any substring.
- **Near-cap warning:** When collection is ≥95% full, a subtle amber banner at the top prompts "Collection nearly full — quick-sell low-value cards or visit Shop."
- **Click a card** → opens the Card Detail page.
- **Contract-low highlight:** Cards at <5 contract plays get a subtle amber frame accent in the grid; <2 plays is red-ish. Helps surface cards needing extension.

---

### 5.3 Card Detail

Hero card on the left, tabbed data on the right.

```
┌───────────────────────┬──────────────────────────────────────────┐
│                       │ Aaron Judge · OF · NYY                   │
│                       │ Tier: Gold  ·  Contract 11/15            │
│                       │                                          │
│   [ LARGE CARD        │ ┌────────────────────────────────────┐   │
│     RENDER (320x448)] │ │ Overview | Token Stats | Game Log  │   │
│                       │ └────────────────────────────────────┘   │
│                       │                                          │
│                       │ CAREER FP:  2,114                        │
│                       │ NEXT TIER:  Diamond @ 5,000 FP           │
│                       │ [progress bar toward 5,000]              │
│                       │                                          │
│                       │ CONTRACT                                 │
│                       │ 11 of 15 plays remaining · 0 extensions  │
│                       │ [ Extend +5 plays · 750 coins ]           │
│                       │                                          │
│   [ actions ]         │ STATUS: Active                           │
│   • Quick-sell        │                                          │
│   • Extend contract   │                                          │
│   • Apply token       │                                          │
└───────────────────────┴──────────────────────────────────────────┘
```

- **Tabs on the right panel:**
  - **Overview** (default): career FP, tier progress bar, contract details + extend action, status, recent tier progressions.
  - **Token Stats**: total tokens applied / triggered / success rate, per-type breakdown (HR Tokens: 7 triggered / 11 applied, etc.).
  - **Game Log**: reverse-chron list of games this card played, with per-game FP, tokens applied and whether they triggered.
- **Extend contract action** opens a small inline picker: extend by 5 / 10 / 15 plays, with cost shown per option (pricing per §5.4 of gameplay spec, tier-scaled + escalator).
- **Quick-sell** requires confirm dialog for Silver+.
- **Apply token** is the same drag-drop as on lineup, but also offers a click-based picker here for accessibility.

---

### 5.4 Shop

Simple, focused: three pack cards.

```
┌────────────────────────────────────────────────────────┐
│ PACKS                                                  │
├──────────────┬──────────────┬──────────────────────────┤
│              │              │                          │
│ DAILY PACK   │ STANDARD     │ PREMIUM                  │
│              │              │                          │
│ Free daily   │ ~5 cards     │ ~8 cards                 │
│ [claim]      │ 250 coins    │ 1,000 coins              │
│ Next in 4h   │ [Buy]        │ [Buy]                    │
│              │              │                          │
└──────────────┴──────────────┴──────────────────────────┘
```

- Three large pack-shop cards side by side. Each shows pack name, description of contents ("~5 cards · mixed weighting"), cost (or "Free daily + countdown"), and a primary CTA.
- On claim/buy: the Pack Opening modal (§6.2) takes over.
- **Extensions are NOT in Shop.** Contract extensions live on Collection (hover-action) and Card Detail (primary action).
- **Tokens are NOT sold.** They're earned; no shop for them.

---

### 5.5 Vault

Trophy-case feel, organized by season.

```
┌────────────────────────────────────────────────────────┐
│ VAULT — 24 cards across 3 seasons                      │
├────────────────────────────────────────────────────────┤
│ ═ 2026 ═══════════════════════════════════════════════ │
│ Season recap: 1,247 contests · Lvl 22 → 28 · ...       │
│                                                        │
│ [card] [card] [card] [card] [card] [card] [card] [card] [card] [card] │  ← 10 cards
├────────────────────────────────────────────────────────┤
│ ═ 2025 ═══════════════════════════════════════════════ │
│ Season recap: 891 contests · Lvl 10 → 22 · ...         │
│                                                        │
│ [card] [card] [card] [card] [card] [card] [card] [card] [card] [card] │
├────────────────────────────────────────────────────────┤
│ ═ 2024 ═══════════════════════════════════════════════ │
│ (first season — 4 cards vaulted mid-season rollout)    │
│                                                        │
│ [card] [card] [card] [card]                            │
└────────────────────────────────────────────────────────┘
```

- **Organized by season,** most recent at top.
- **Per-season banner:** season recap stats (contests played, level change, top card, top milestone hit).
- **Card thumbnails** at Small size. Clicking a vaulted card opens a Card Detail view showing the card with its final tier, FP total, and token success stats frozen at vault time.
- **Publicly viewable:** other users navigating to this user's profile land on the Vault as the primary identity surface.
- **Empty state (new user, no season completed yet):** a placeholder showing "Your first vault moment arrives at the end of the MLB season. Play to fill it."

---

### 5.6 Milestones

Analytical dashboard look.

```
┌────────────────────────────────────────────────────────┐
│ 2026 SEASON MILESTONES                                 │
├────────────────────────────────────────────────────────┤
│ TEAM HITS                                              │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  347 / 500 (Tier 3)              │
│ Tier 1 ✓ 50  Tier 2 ✓ 250  Tier 3 500  Tier 4 1000     │
│                                                        │
│ TEAM HOME RUNS                                         │
│ ▓▓▓▓▓░░░░░░░░░░░░░░░░  38 / 100 (Tier 3)               │
│ Tier 1 ✓ 10  Tier 2 50  Tier 3 100  Tier 4 200         │
│                                                        │
│ TEAM STOLEN BASES                                      │
│ ▓░░░░░░░░░░░░░░░░░░░░  11 / 30 (Tier 2)                │
│ Tier 1 ✓ 10  Tier 2 30  Tier 3 60  Tier 4 100          │
│                                                        │
│ TEAM PITCHING WINS                                     │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  14 / 15 (Tier 2)                │
│ Tier 1 ✓ 5  Tier 2 15  Tier 3 30  Tier 4 50            │
├────────────────────────────────────────────────────────┤
│ MILESTONE HISTORY (this season)                        │
│ · Team Hits Tier 2 — Jun 4 — +1,000 coins, +200 XP     │
│ · Team HR Tier 1 — May 12 — +500 coins, +100 XP        │
│ · Team SB Tier 1 — May 3 — +400 coins, +100 XP         │
│ · Team Wins Tier 1 — Apr 28 — +400 coins, +100 XP      │
│ · Team Hits Tier 1 — Apr 22 — +300 coins, +100 XP      │
└────────────────────────────────────────────────────────┘
```

- **Top section:** four milestone progress bars. Each shows current count, next tier target, checkmarks for hit tiers.
- **History feed:** reverse-chron list of milestones achieved this season with reward summaries.
- **Previous seasons archive:** a "View previous seasons" link at the bottom opens a timeline of past-season milestone histories.

---

### 5.7 Leaderboards

Social scannable list with a view switcher.

```
┌────────────────────────────────────────────────────────┐
│ LEADERBOARDS                                           │
│ [ Manager Lvl | Season FP | Card Prestige | Vault ]    │  ← tab switcher
├────────────────────────────────────────────────────────┤
│ YOUR RANK                                              │
│ #142 · Roach Dynasty · LVL 28 · 184,203 XP             │
│                                        [ view profile ]│
├────────────────────────────────────────────────────────┤
│ TOP 100                                                │
│ 1   Oliver's Yard   LVL 97    1,492,812 XP             │
│ 2   Fair Territory  LVL 94    1,418,007 XP             │
│ 3   Grip It & Rip   LVL 91    1,367,441 XP             │
│ 4   ...                                                │
│ (scroll)                                               │
└────────────────────────────────────────────────────────┘
```

- **Tab switcher at top:** Manager Lvl / Season FP / Card Prestige (most Diamond this season) / Vault Prestige (lifetime Diamond vaulted).
- **"Your Rank" anchor:** shows user's current rank pinned above the top-100 list if they're below 100.
- **Each row:** rank number, team name (click → their public profile/vault), Manager Level, metric value.
- **No direct social actions** at launch (no follow, no message). Just view-only profiles.

---

## 6. Big Moments (theatrical flows)

### 6.1 First-time onboarding

4-step guided flow, total time 3–5 minutes:

1. **Create account.** Email/auth, minimal form.
2. **Team setup.** Full-screen, three substeps:
   a. Team name (text input with real-time availability check).
   b. Primary + secondary color pickers (swatches preview against card frame).
   c. Logo selection from preset library (grid of ~50 options).
3. **Starter bundle reveal.** Animated pack opening for the 10 starter cards. Sequential reveal with tension (same treatment as real packs — see §6.2). At the end, 500 coins and 2 tokens slide into the header with a counter animation.
4. **Tutorial contest.** Scripted mini-contest:
   a. Walk user through dragging cards onto the diamond lineup.
   b. Drag a token onto a card ("Apply this HR Bonus token to your best hitter").
   c. Submit lineup. A scripted 15-second "live" contest plays, concluding with the HR token triggering for a celebratory bonus.
   d. Recap screen showing FP earned + tier progression + token success.
   e. CTA: "Enter tonight's real contest."

Tutorial steps are **skippable** via a small "Skip tutorial" link in each step.

### 6.2 Pack opening

Modal overlay, full-screen blur behind.

Sequence:

1. **Pack entry:** user sees the sealed pack rendered large, rotating subtly, with a "Tap to open" prompt.
2. **Rip animation:** pack tears/opens with a satisfying motion (200–400ms).
3. **Card reveal:** cards emerge one at a time. Each card enters with:
   - A subtle white flash for fresh Bronze pulls.
   - A tap-to-flip option to reveal each card at the user's pace (optional; user can tap "Reveal All" to skip).
   - Player photo, name, team appear with a soft fade.
4. **Duplicate handling:** if a card is a dupe, after reveal a brief "SOLD" stamp appears with coin icon animating from the card to the coin balance in the header. Rest of the pack continues.
5. **Final card:** for Premium packs, the last card is reserved for the highest-designated-value player in the pack (a "chase slot"). The reveal has slightly bigger animation — deeper photo zoom, team-color bloom.
6. **Pack summary:** end screen shows all pulled cards in a row, total coin value of dupes sold, any tokens included. CTA: "Add to collection" (routes back to wherever the user came from).

### 6.3 Tier-up cut-in

Occurs on the **contest Final state** (§5.1.4) when any card in the lineup crosses a tier threshold.

Sequence (~2.5s):

1. Card zooms to center of recap screen.
2. Old frame (e.g. Silver) dissolves into motes of light.
3. New frame (e.g. Gold) forms with particle bloom, in the tier color.
4. Career FP number ticks up to the threshold.
5. Title card displays: "AARON JUDGE · GOLD". Team colors bloom subtly in the background.
6. Card settles, cut-in ends, recap continues.

A push notification also fires: "Your Aaron Judge card just leveled up to Gold!"

### 6.4 Vault ceremony (end of season)

5-step guided sequence, skippable at each step. Total ~90 seconds if not skipped.

1. **Title card.** "Your 2026 Season" with team identity animation. 2–3 seconds, skippable.
2. **Season recap.** Stat cards stream in one by one: total FP, contests played, contests won, best card, biggest token trigger, team milestones hit, notable moments. Each stat has a type-in animation. Skip advances to next or skips remaining.
3. **Vault selection.** Grid of the user's active (and expired) cards. Drop zone at the top marked "VAULT (0 / 10)". Drag or tap-to-add up to 10 cards into the vault. Cards not selected are marked "DISSOLVE" with a small warning. Skippable only after at least 1 card is selected (minimum commitment).
4. **Dissolve animation.** Unselected cards simultaneously fade and dissolve into motes of light over ~3 seconds. Sombre but beautiful. Always plays; no skip here.
5. **Vault reveal.** User lands on their updated Vault page with the new season's cards added. A "Opening Day in X days" banner sits at the top.

### 6.5 Opening Day (start of season)

On the user's first login on or after Opening Day:

1. **Welcome-back animation.** Full-screen splash with team colors blooming, "OPENING DAY · 2027" type treatment. 2–3 seconds.
2. **Starter bundle reveal.** Animated pack opening for the 10 starter cards + 500 coin counter animation + 2 tokens dropping into inventory. Same treatment as first-time onboarding starter bundle.
3. **First-contest prompt.** "Tonight's contest is ready. Build your lineup." CTA routes to Lineup.

---

## 7. Motion System

**Philosophy:** quiet everyday, theatrical big moments.

### 7.1 Micro-interactions (everyday UI)

- Hover states: 150ms ease-out color/background transitions.
- Card hover (collection): 2px lift with a subtle shadow + 4% brightness bump, 200ms.
- Drag-and-drop: cards scale to 105% while dragging, slot receivers highlight with tier-neutral accent border, 120ms springs.
- Button presses: 80ms scale-down to 98% on press-in, bounce back on release.
- Sidebar expand/collapse: 200ms ease.
- Tab switches: 150ms fade+shift.

### 7.2 Big moments (cinematic)

- Pack opening: 3–8 seconds total (depending on pack size).
- Tier-up cut-in: 2.5 seconds.
- Vault dissolve: 3 seconds.
- Vault ceremony total: 60–90 seconds.
- Onboarding tutorial "live" contest: ~15 seconds scripted.

### 7.3 Reduced motion

Respect `prefers-reduced-motion: reduce`. In reduced-motion mode:

- All transitions are ≤80ms linear.
- Pack opening uses simple crossfades, no rip animations.
- Tier-up cut-in becomes a static frame swap with a one-time ping.
- Vault dissolve cross-fades instead of particle-disperse.

---

## 8. Empty & Error States

### 8.1 Empty states

- **Collection empty (returning user, Opening Day):** Large photo treatment with message "Your 2027 collection starts now. Open your starter bundle or visit Shop."
- **Vault empty (brand-new user, season not ended):** "Your first vault moment arrives at the end of the MLB season. Play to fill it."
- **No tokens:** Lineup token tray shows "Tokens are earned from packs, contests, and milestones. Win some."
- **No contests available (offseason):** Lineup page shows a "The offseason is here. Live contests return Opening Day 2027 (Mar 28)" banner. Collection, Vault, Leaderboards remain browsable.
- **No search results / filtered-to-zero:** "No cards match these filters. Reset or try different criteria."

### 8.2 Error & edge states

- **Collection at cap during pack open:** Pack opening pauses before commit. Modal asks "Your collection is full. Choose cards to quick-sell to make room." Compact grid of the user's collection with checkboxes.
- **Insufficient coins on purchase:** Shop cards show greyed-out Buy button with "Need X more coins" helper text.
- **Incomplete lineup on submit:** Submit button disabled; visual prompt near empty slots.
- **Illegal lineup (position mismatch):** Shouldn't be possible via drag-drop, but if forced via API, error banner surfaces at submit time.
- **Real-time stat feed delay:** live contest header shows "Stat feed delayed — last update 30s ago" instead of stale scores.
- **Connection lost:** Toast "Connection lost. Retrying…" with persistent retry. Critical flows (lineup submit) have local retry.

---

## 9. Notifications & Toasts

Per gameplay spec, notifications fire on two events at launch:

1. **Daily Pack ready to claim.** Push + in-app badge on header Daily Pack indicator. In-app toast on login "Your Daily Pack is ready."
2. **Card tier evolution.** Push "Your Aaron Judge card just leveled up to Gold!" In-app: happens as part of the contest Final state cut-in.

Toast positioning: top-right, stack, auto-dismiss after 5s for info / 8s for success / 12s for error. Toasts do not cover the header or sidebar.

---

## 10. Accessibility Baseline

- **Color contrast:** AA minimum on all text (4.5:1 body, 3:1 large). Cream-on-charcoal meets this; tier accent frames are not text-carrying.
- **Keyboard navigation:** All nav, interactions, and drag-drop flows must have keyboard equivalents. Drag-drop has a "Move to…" fallback: select card, press Enter, pick slot from keyboard-navigable menu.
- **Screen readers:** Card elements expose player name, position, team, tier, contract status, token status, and status flags as ARIA labels.
- **Focus visibility:** clear focus rings on all interactive elements (cream outline, 2px, 4px offset).
- **prefers-reduced-motion:** honored as described in §7.3.
- **Color is not the only indicator:** tier is visually reinforced with frame shape and badges (not just color), status flags use icons + text, contract state uses icons + numbers.

---

## 11. Sync with Existing Prototype

The current React/TypeScript prototype needs the following updates to align with this spec:

### Keep (with stylistic evolution)

- **App shell architecture** (state-driven view switching, modal pack opener via AnimatePresence).
- **Drag-and-drop library** (react-dnd) and `CustomDragLayer` component.
- **Component breakdown** (CardFront, CardDetailView, LineupArea, CardHand, TokenTray, TokenChip, PackOpener, PackCarousel, CollectionPage, Sidebar, QuickActions, ImageWithFallback).
- **Vite + Tailwind + Radix UI + motion** tech stack.

### Replace / rework

- **LineupArea:** basketball 2-2-1 (PG/SG/SF/PF/C) → baseball diamond layout with 10 slots (SP/SP, 3B/SS/2B/1B, C, LF/CF/RF).
- **Rarity throughout:** replace with tier (Bronze/Silver/Gold/Diamond). Remove "OVR Rating" concept — there's no skill rating in Draft Deck; career FP and tier are the only card-level values.
- **Sidebar nav items:** Lineup / Collection / Pack Store / Trades / Rankings → Lineup / Collection / Shop / Vault / Milestones / Leaderboards. Remove Trades entirely. Remove Rankings (replaced by Leaderboards + Manager Level in header).
- **Card face anatomy:** evolve from current rarity-stripe design to Photo-hero + tier frame + footer strip (career FP + contract + token slot).
- **Color palette:** monochrome grays (#2e2e2e etc.) → charcoal + cream + tier accents (§2.1).
- **Typography:** Space Mono everywhere → Inter + JetBrains Mono (§2.2).
- **CollectionPage filters:** Rarity / OVR Rating filters → Tier / Status / Contract / Token filters.

### Add (new components)

- Header bar component (team identity + coin balance + Daily Pack indicator + Manager Level + Profile button).
- Profile drawer.
- Lineup live-state list view (transforms from diamond when contest is live).
- Card Detail page with Overview / Token Stats / Game Log tabs + extension flow.
- Vault page (seasonal timeline).
- Milestones page (progress bars + history feed).
- Leaderboards page (tab switcher + ranked list).
- Vault Ceremony multi-step flow.
- Opening Day welcome flow.
- Onboarding flow (account / team setup / starter bundle / tutorial contest).
- Tier-up cut-in overlay component.

### Remove entirely

- **Trades** feature and all UI surfaces.
- **OVR Rating** concept.
- **Rarity filter / rarity-tinted reveals** (rarity doesn't exist as a concept).
- **Pack Carousel** if the new Shop design makes it redundant (three static pack cards side by side is simpler and supports the goal).

---

## 12. Open Questions & Deferred Decisions

Numbered parking lot. Roughly ordered by execution dependency.

1. **Accent color choice.** Pick `--accent` (deep clay red / stadium green / bronze candidate). Decide with the logo library design.
2. **Preset logo library.** ~50 logos to design for team branding.
3. **Card frame artwork** at each tier (actual metallic treatments, foil specs).
4. **Player photography pipeline.** Licensing agreement, cutout/treatment specs, fallback for brand-new call-ups.
5. **Pack artwork** per pack type (Daily / Standard / Premium).
6. **Custom icon set.** ~12–20 baseball-specific icons.
7. **Tutorial contest script.** Exact steps, copy, scripted events.
8. **Vault ceremony copy.** Title cards, recap headlines, encouragement text.
9. **Opening Day copy.**
10. **Empty / error state copy** (see §8).
11. **Notifications copy.** Daily Pack ready, tier-up.
12. **Team-name moderation policy.** What's not allowed in team names.
13. **Right-rail collection stats:** exact composition and sort of the tier breakdown chart.
14. **Milestone reward sizing** visible on milestone bars (coin / XP / token amounts).
15. **Mobile web design pass.** Deferred.
16. **Dark mode is default — is there a light mode ever?** Deferred.
17. **Animation curves & timing polish.** Specific cubic-beziers for every motion.
18. **Sound design.** Do we have sound? (Card rip, coin clink, tier-up sting, token trigger.)
19. **Contest-format UX** (DFS lineup building, contest lobby, cash-entry flow) is its own UX pass paired with the deferred gameplay-contest spec.
20. **Error telemetry / analytics events** mapping.

---

## 13. Glossary (UI/UX terms)

- **Header / persistent chrome** — the top bar that stays on every screen (team identity + coin balance + Daily Pack + Manager Level + Profile).
- **Sidebar** — left-hand primary nav, 6 items.
- **Card face / card anatomy** — the visual design of a card as it appears wherever rendered.
- **Tier frame** — the card frame color + foil treatment tied to tier.
- **Tier accent** — the four tier colors (Bronze copper / Silver steel / Gold / Diamond holo), reserved for card frames and tier-up moments.
- **Cinematic big moment** — flows that deviate from everyday UI motion tempo for emotional payoff (pack open, tier-up, vault ceremony, Opening Day).
- **Live state (Lineup)** — the list-view mode the Lineup page transforms into when a contest is live.
- **Diamond layout** — the baseball-authentic arrangement of the 10 positional slots on the Lineup page's Building state.
- **Vault ceremony** — the end-of-season multi-step flow where users preserve 10 cards and dissolve the rest.
- **Opening Day flow** — the start-of-season welcome flow, including starter bundle reveal.

# Draft Deck — Polish & Feel Spec (v1.1)

**Status:** Draft · **Owner:** user
**Companion specs:** `draft-deck-ui-ux-spec.md` (§4 card anatomy, §6 big
moments, §7 motion system).

This document is the home for post–Phase 5 polish work — pieces of the
product that are *functional today* but feel flat, unpolished, or
under-legible. Entries here are executed after the launch-critical
cron + rank wiring (Phase 5), and either get their own phase milestone
or ride along with other polish work in a named "feel pass."

Each entry has:
- **Goal** — what the user should feel after
- **Behavior** — concrete interaction rules
- **Acceptance** — testable criteria
- **Dependencies** — code that needs to exist or change
- **Trade-offs** — what we're trading away

---

## 1. Physical card motion (every card-movement moment)

### Goal

Cards should feel like physical objects — lifted, dragged, and
dropped with weight. The player's mental model is "I'm moving a
collectible, not clicking a cell in a spreadsheet." Today every card
movement is instant or uses a generic CSS transition; everywhere a
card moves, that should feel like an object in motion.

### Scope — applies to every drag-drop card-movement surface in v1.1

1. **Lineup building**
   - Bench → slot drop
   - Slot → slot reorder (swap)
   - Slot → bench (remove from lineup)
2. **Vault selection** — drag-to-vault-dropzone (replaces today's
   tap-to-toggle).
3. **Quick-sell dissolve** and **season-end dissolve** — currently
   opacity fade; upgrade to a coherent motion vocabulary.
4. **Tier-up cut-in** (§6.3, already deferred) — when it lands, it
   uses this vocabulary.

**Out of v1.1 scope** (gets its own polish slice later):
- **Pack opening reveal.** The carousel + flip needs its own redesign
  pass — current version is lackluster and deserves more than a motion
  refresh. Parked; revisit as a standalone "pack reveal polish" slice.

Everything below applies uniformly to every in-scope surface unless
the "where" column notes otherwise.

### Behavior

| Phase | What happens | Where |
|---|---|---|
| Idle | Card sits with a resting elevation (`shadow-sm`). | All |
| Hover | 2px lift + shadow grows (matches UI/UX §4.12 rest state). | Lineup, collection, bench, vault selection |
| Pick-up (`mousedown` / pointer grab) | Card scales 1.03, shadow deepens sharply. Max 3° tilt during fast drags, invisible at rest — subtle. Spring-based (not linear). | Any draggable card |
| Dragging | Card follows the cursor with a spring-delay (~80ms lag). Origin slot goes empty (outlined empty slot — no ghost silhouette, no label swap). Ghost image is **the card**, not the default browser drag preview. | Any draggable card |
| Hover-over-valid-target | Target slot highlights (team accent border pulse). Card shadow lightens to signal "about to commit." | Lineup slots, vault drop zone |
| Hover-over-invalid-target | Target stays inert. Card cursor shows dashed-forbidden border. | Lineup slots where position doesn't match |
| Drop on valid | Card snaps into slot with ease-out over ~180ms. Slot briefly flashes team accent, then settles. | All |
| Drop on invalid | Card bounces back to origin with a shake (small lateral oscillation, ~350ms). | All |
| Release in empty space | Same as invalid — return to origin with shake. | All |

### Spring personality — iOS-snappy

Locked: **quick pick-up, tight follow, firm snap.** Think "paper card,
responsive" — not "thick cardstock with foil bounce." The feel is
slick and immediate; you feel the card respond as fast as you're
moving it.

Motion config (starting point, tunable during P6.2):
- `stiffness: 400`
- `damping: 30`
- `mass: 1`

Any spring that feels sluggish gets tuned toward stiffer / higher
damping during the P6.2 smoke pass.

### Tilt on pick-up — subtle

Max 3° during fast drags, imperceptible at rest. No casino-dealer
theatrics — the tilt is a speed cue, not a flourish.

### Origin slot during drag — empty

When a card leaves its slot mid-drag, the slot shows the outlined
empty state (same as a never-filled slot). No ghost silhouette, no
position-label text swap. Clean.

### Invalid-drop treatment (confirmed)

Card bounces back to origin with a short horizontal shake. No toast.
The forbidden cursor during the drag is enough signal — post-drop
should land in place, not nag. Shake is visual feedback that the
attempt was seen and rejected.

### Acceptance

- [ ] Dragging a bench card onto a legal lineup slot spring-lands
  with a perceivable settle, not an instant snap.
- [ ] Dragging a SS card onto the 1B slot bounces back with a shake
  and no error toast.
- [ ] Dragging a card from slot → bench removes it with the same
  physics language.
- [ ] Vault ceremony selection uses drag-into-vault-dropzone; tap
  still toggles as a fallback (accessibility).
- [ ] Pack opening reveal uses the same spring language on arrival
  (not the current flip-in).
- [ ] Reduced-motion honored: all springs degrade to instant
  snaps + opacity swap. No shake. No tilt. Per UI/UX §7.3.
- [ ] 60fps sustained on a 2020-era MBP during a full lineup build
  (10 drag-drops back-to-back).

### Dependencies

- `motion` (framer-motion) — already locked in stack §1.1. Use its
  `useDragControls` + `animate()` primitives.
- `react-dnd` — already in use for bench→slot; combine with motion
  by treating react-dnd for validity/target logic and motion for the
  render-side spring. Alternative: migrate fully to motion's drag
  API and drop react-dnd. **Decision:** keep react-dnd for the hit-
  testing layer (already spec-approved in UI/UX §11 "Keep"); motion
  handles visuals only.
- New shared hook: `useCardDrag(cardId)` that wraps both libs and
  exposes `{ dragState, onPointerDown, onPointerMove, onDrop }`.
- The existing `CustomDragLayer` pattern (§11) stays — we replace
  its default ghost with the real `<Card>` element at animated
  scale + tilt.

### Trade-offs

- **Motion cost:** springs at 60fps on every slot + the card face is
  more GPU work than today's opacity-only transitions. Need to verify
  on low-end hardware during P6 smoke.
- **Keyboard accessibility:** drag-drop-only interactions break for
  keyboard users. We mitigate via the tap-fallback for vault
  selection and by keeping keyboard-first flows (arrow-key slot
  traversal + enter-to-pick) working in the lineup.
- **Scope creep risk:** "coherent motion language across every
  movement" is easy to keep expanding. v1.1 ships the six movement
  paths listed in Scope — any new movement (e.g., a future trade
  screen) gets the vocabulary for free but isn't part of this slice.

---

## 2. Full-anatomy Small card (match Collection, just smaller)

### Goal

Today's Small card (96×134) is intentionally stripped — the
component (`src/components/card/Card.tsx`) hides position, team,
stats footer, and name at this size. Only the photo + status pill
survive. With photo sync still stubbed, the user sees two initials
and nothing else, which is why managing a lineup feels like reading
cell IDs.

**Fix: Small renders the same anatomy as Medium / Collection, just
scaled.** No new widgets invented. No separate design language. The
card you drag into the Collection page is the card you see on the
diamond, only smaller.

### What changes in the `<Card>` component

Drop the `!isSmall` guards on the position tag, team chip, stats
footer, name, FP, contract count, and `+ Token` badge. Tune the
Small-size values in the `SIZE_STYLES` table and the font-size
ternaries so everything fits readably at 96×134.

### Layout (all of Medium, re-tuned for 96×134)

```
┌──────────────────────┐ ← tier border (§4.5 palette)
│ C           NYY      │ ← position chip + team chip (already in
│                      │   component at Medium; unhide at Small)
│     [photo or        │
│      initials]       │ ← photo area ~60% of height (matches
│                      │   Medium proportions, not current 75%)
│                      │
├──────────────────────┤
│ JOSE CABALLERO       │ ← name, uppercase tracked, trimmed at width
│ 1,247 FP      12/15  │ ← FP + contract count (existing Medium
│ + TOKEN              │   footer rows, tighter padding)
└──────────────────────┘
```

### What gets sacrificed at 96×134

Candidates to drop if the face reads as noise during P6.1 smoke:

1. `+ TOKEN` badge → swap to a small icon in the footer corner
   (fewer pixels, same signal).
2. Long names → truncate at ~12 chars with ellipsis.
3. Team chip text size → already 9px at Medium; may need 8px at
   Small. Keep monospace so digits don't shift the box width.

These are P6.1 tuning decisions, not locked-in-spec calls. If the
full-Medium layout fits at 96×134 cleanly, nothing gets sacrificed.

### Acceptance

- [ ] Small card renders: tier border, position chip, team chip,
  photo (or initials fallback), status pill, name, FP, contract
  count, token badge — all elements Medium has.
- [ ] A full legal lineup is readable from 18 inches away on a
  laptop screen without squinting.
- [ ] Same `<Card>` component drives diamond, bench drawer, vault
  selection, and Collection — no forked "small-on-lineup" code path.
- [ ] Photo sync (when live) drops into the existing photo slot
  without layout shift.
- [ ] Medium + Large cards untouched — no regression on Collection
  or Card Detail.

### Bench drawer + vault selection

Same component, same size. The bench drawer stays a horizontal
scroller. Vault selection grid switches from its bespoke thumb to
the shared Small card.

### Dependencies

- `src/components/card/Card.tsx` — remove `!isSmall` guards on
  position tag (line 123), team chip (line 136), stats footer (line
  166). Tune `SIZE_STYLES` padding + font-size ternaries for Small.
- `src/components/lineup/BenchCard.tsx`,
  `src/components/lineup/LineupSlot.tsx` — already consume `<Card
  size="small">`, no call-site changes.
- `src/components/vault/VaultCeremony.tsx` `CardThumb` — replace
  with `<Card size="small">`.
- **No schema changes.** `CardViewModel` already has every field
  the component needs.

### Trade-offs

- **Readability at 96×134.** Medium font sizes were tuned for 160×224;
  at 75% of that canvas some text may be too small. P6.1 smoke
  validates; tune down if needed.
- **No hover-expand.** A user who wants truly deep stats still
  clicks into Card Detail. Medium-card info never leaks onto the
  diamond separately — it *is* the diamond.

---

## 3. Shared implementation notes

### Motion language cross-reference

Both features touch `<Card>`. Order of work:
1. **Rich Small card first** (doesn't depend on motion rework).
2. **Physical motion second** — we want to animate the new richer
   card, not rebuild the animation then the face.

### Performance budget

- 60fps during a full lineup build on mid-tier hardware.
- First meaningful paint on the Lineup page ≤ current baseline.
- Bundle size increase ≤ 8KB gzipped (we're re-using existing deps).

### Testing

- Visual: Chromatic snapshot per card state (idle / hover / dragging
  / invalid-drop / dropped).
- E2E: Playwright scenario that drags a card onto a slot and
  verifies the assignment persisted + the motion completed (use
  `waitForAnimations()`).
- Reduced-motion: unit test that the spring config swaps to instant
  when `prefers-reduced-motion: reduce` is set.

---

## 4. Not in scope for v1.1

Flagged so they don't sneak in during the polish pass:

- Tier-frame foil motion (silver shine, gold bloom, diamond
  shimmer). UI/UX §4.5 deferred these; they're a separate polish
  slice.
- Haptic feedback (no mobile web at launch per §1).
- Sound design — still deferred.
- Pack-opening full redesign — only its arrival physics gets the
  new language; the carousel + reveal sequence stays.
- Card face illustrations / artwork — separate art pass.

---

# Phase 7 batch — polish items locked 2026-04-21

The five entries below were locked via interview after Phase 6 shipped.
Same authoring pattern as §1–§2. These define the Phase 7 (v1.2) feel
pass.

---

## 5. Applied tokens — circular drag-drop with corner overlay

### Goal

Tokens today are a static list in a tray — users don't know which
player a conditional modifier was *meant for* until contest time.
Promote tokens into the same physical vocabulary as cards: circular
pips that you pick up and drop onto a player. Once applied, the token
rides on the card's corner so the user sees their commitments at a
glance.

### Behavior

- **Tray:** each token renders as a circular pip (~44px at rest).
  Multiple of the same token type surface as separate pips, not a
  stack (single-token cap per card means stacking isn't useful).
- **Hover tooltip:** hovering a tray pip OR an applied pip shows a
  small popup with the conditional rule verbatim ("If this player
  hits a HR, +5 FP"). Dismisses on mouse-leave. Same tooltip
  component in both places.
- **Apply (drag):** pick up a tray pip; while dragged, hovered cards
  light up using the §1 valid-target treatment. Drop on a card →
  pip springs into the card's bottom-right corner, overlaid so ~50%
  of the pip sits outside the tier frame (breaks the border). Tray
  pip is **consumed** (disappears).
- **One token per card.** Dropping on an already-tokened card
  shake-bounces back to the tray (§1 invalid vocabulary).
- **Remove (click):** click the applied pip → inline "Remove?"
  confirm → second click destroys the token. **Removal does not
  return the token to the tray** — consistent with the "consumed on
  apply" rule. Mistakes are recoverable by re-earning the token.
  *(Proposed; confirm on review. Softer alternative: remove returns
  to tray. Destroy is simpler and aligns with the vault destroy-on-
  remove pattern.)*

### Motion

Reuses the §1 vocabulary:
- Pick-up: 1.08 scale + spring lift.
- Drag: cursor-follow with ~80ms lag.
- Valid drop: pip snaps to corner, ~180ms ease-out, tiny settle.
- Invalid drop (already tokened, or released in empty space):
  shake-back to origin.
- Reduced-motion: instant apply + remove, no tilt, no shake.

### Acceptance

- [ ] Token tray renders circular pips with working hover tooltips.
- [ ] Dragging a pip onto an un-tokened card applies it; tray pip is
  consumed.
- [ ] Dragging onto an already-tokened card shakes back.
- [ ] Applied pip sits at bottom-right, overlaid outside the tier
  frame; does not clip the stats footer at Small or Medium.
- [ ] Hover on applied pip shows the same conditional tooltip.
- [ ] Click applied pip → confirm → token destroyed; card returns
  to un-tokened state.
- [ ] `/palette` gains an "Applied tokens" section (Small + Medium
  card states, tooltip open state).
- [ ] Reduced-motion: instant apply, instant remove, no tilt.

### Dependencies

- New `<TokenBadge>` component at `src/components/token/TokenBadge.tsx`
  — absolute-positioned corner overlay, same anchoring pattern as
  the existing status pill.
- Tray rework in `src/components/token/TokenTray.tsx` (or equivalent):
  circular pip, hover tooltip, `useCardDrag`-compatible pick-up.
- SQL fns: `apply_token(token_id, card_id)` exists per API spec;
  add `remove_applied_token(token_application_id)` that destroys the
  application record (the token row is already consumed). Confirm
  naming against API spec §.
- Reuses `CardDragLayer` motion plumbing from Phase 6 (generic per
  ADR-0011).
- Tooltip: shadcn `Tooltip` primitive — already in stack.

### Trade-offs

- **1-token cap** trades strategic depth for legibility. If future
  phases want stacking, the corner slot grows into a row; backwards-
  compatible.
- **Destroy-on-remove vs restore-to-tray.** Destroy is simpler and
  punishes mistakes in a way that's consistent with the vault
  destroy rule. If retention telemetry shows frequent accidental
  applies, revisit.
- **No drag-off-card path.** Click-confirm is the only removal
  gesture. Symmetric drag-out would be nice but adds UX cost for
  marginal gain.

---

## 6. Lineup card single-click → shared detail drawer

### Goal

Clicking a card in a lineup slot does nothing today; drag is the only
interaction. To see a slotted card's stats or act on it, users remove
it, switch to Collection, find it, click. Add single-click-to-open on
lineup cards, reusing the Collection detail drawer with a thin
lineup-context action row appended.

### Behavior

- Single click on any card in a lineup slot OR in the bench drawer
  opens the shared `<CardDetailDrawer>` (same component Collection
  uses).
- **Drag preservation:** 5px mousedown-threshold — pointer movement
  past 5px cancels the click and starts a drag (react-dnd / motion
  standard).
- **Lineup action row** (appended below the existing drawer content
  when opened from lineup or bench):
  - Quick-sell (same path as Collection).
  - Extend contract (same path as Collection).
  - Remove from slot — sends card to bench, closes drawer, plays
    the §1 slot → bench motion. (Bench-origin cards hide this
    action.)
  - Add to vault — opens the §7 mid-season vault confirm.
- Closing the drawer returns focus to the card's origin location.

### Acceptance

- [ ] Single click on a slotted card opens the detail drawer.
- [ ] A drag starting on the same card (>5px of pointer movement)
  does not fire the click open.
- [ ] All four lineup actions are callable; each delegates to its
  existing SQL fn (§7 for vault).
- [ ] Drawer fits within the §8 no-scroll viewport budget.
- [ ] Keyboard: tab-focus + Enter opens; Escape closes.
- [ ] Reduced-motion: drawer opens without slide.

### Dependencies

- Extend `<CardDetailDrawer>` with an optional
  `lineupContext?: { slotId; onRemove; onAddToVault }` prop. When
  absent, drawer renders as on Collection.
- `remove_from_lineup_slot(slot_id)` SQL fn — confirm existing
  `update_lineup_slot` can take `card_id = NULL`; if not, add the
  paired fn.
- Mid-season vault action (§7).
- Drag-threshold helper — add to `useCardDrag` if not already there.

### Trade-offs

- **Click-vs-drag conflict** is a known pattern risk; 5px is a
  tested default. Widen to 8px on trackpads if edge cases surface.
- **Drawer height budget.** Extra action row costs vertical space;
  must still clear the §8 800px floor.

---

## 7. Mid-season vault

### Goal

The vault is only a season-end moment today — powerful, but it means
users can't mark a card as "this one's a keepsake" while the season
is live. Let users pre-vault cards any time. Once vaulted the card is
**frozen** (can't play) and can't return to Collection. Users can
destroy a pre-vaulted card for a **small** coin refund — a deliberate
exit, not a take-back. The end-of-season ceremony becomes a
confirm / last-chance moment rather than the first-and-only pick.

### Behavior

- **Entry points:**
  - Collection detail drawer → "Add to Vault".
  - Lineup detail drawer (§6) → "Add to Vault".
- **On vault:**
  - Card is moved out of the playable set **immediately**. It cannot
    be placed in a lineup. Contract plays lock (no burn, no extend,
    no refund). Status pill reads "Vaulted"; tier frame gets a muted
    / ribbon treatment.
  - Counts toward the season's 10-card vault cap.
- **Cap guard:** at 10 pre-vaulted, "Add to Vault" is disabled with
  inline reason ("Vault full — destroy a vaulted card to free a
  slot").
- **Locked-lineup guard:** if the card is currently locked into a
  submitted-but-not-yet-scored lineup, vaulting is blocked. Modal:
  "This card is in a locked lineup. Vault it after today's contest
  scores." (Answered: option A — block until scoring completes.)
- **Remove (destroy):**
  - From the Vault page, click a pre-vaulted card → confirm
    ("Destroy this card for N coins? This can't be undone.").
  - Confirm destroys the card permanently, credits tier-scaled
    coins, frees a cap slot.
  - **Refund formula:** ~15% of the card's quick-sell value at its
    tier (bronze / silver / gold / diamond), much less than quick-
    sell. Exact coin values computed in the SQL fn from economy
    config; finalize numeric in the roadmap task.
- **End-of-season ceremony:**
  - Review screen shows the pre-vaulted set + remaining collection.
  - User can **last-chance destroy** pre-vaulted cards (same
    dialog, same refund) to free cap slots.
  - If fewer than 10 pre-vaulted, user picks from collection to
    reach 10 (existing ceremony flow).
  - Final confirm = hard lock. After lock: no destroy, no add, no
    swap.

### Acceptance

- [ ] User can vault from Collection detail drawer.
- [ ] User can vault from lineup detail drawer.
- [ ] Vaulted card cannot be dragged into a slot, cannot be quick-
  sold, cannot be extended.
- [ ] Vault page lists pre-vaulted cards with the muted / ribbon
  treatment and a destroy action.
- [ ] Destroy refunds tier-scaled coins (15% of quick-sell rate),
  removes the card permanently, frees the cap slot.
- [ ] Cap of 10 is enforced on add; blocked state shows reason.
- [ ] Submitted-lineup guard prevents vaulting until the contest
  scores.
- [ ] Ceremony reuses existing pre-vaulted records; user can destroy
  during ceremony, cannot exceed 10.
- [ ] All state changes go through SQL fns (per CLAUDE.md §7).
- [ ] Append-only audit row on every destroy.

### Dependencies

- **SQL fns:**
  - `vault_card_midseason(card_id)` — validates cap, not-frozen,
    not-in-locked-lineup; inserts into vault; marks the card.
  - `destroy_vaulted_card(card_id)` — destroys the card, credits
    coins via `spend_coins`-mirror, appends to audit.
  - `commit_vault_selection(card_ids)` — existing; tighten to
    ceremony-only (idempotent if cap is already full).
- **Server Actions** in `app/actions/vault.ts`:
  `vaultCardMidseason`, `destroyVaultedCard`.
- **Schema:**
  - `card.vaulted_at timestamptz null` + `card.vault_source
    enum('midseason','ceremony') null`. RLS keeps the card visible
    to its owner but blocks playability via the existing playable-
    predicate path.
  - `vault_card_destroy` append-only audit table:
    `(id, user_id, card_id, tier, refund_coins, created_at)`.
- **UI:**
  - Vaulted card face treatment: muted tier frame + corner ribbon /
    stamp ("VAULTED").
  - "Add to Vault" action in both detail drawers.
  - Vault page updated to surface pre-vaulted cards alongside the
    ceremony CTA (in-season) and the ceremony review (season-end).

### Trade-offs

- **Freeze-on-vault vs play-until-contract-ends.** Freeze is the
  simplest rule and matches "cosmetic keepsake" framing. Play-
  through adds lifecycle complexity (vaulted-but-playable states).
- **15% refund** is generous enough to soften a mistake but small
  enough to discourage exploiting the vault as a coin sink. If a
  pack → vault → destroy arbitrage appears, drop to 5% or add a
  cooldown.
- **Cap enforced on add** (not rolling at ceremony). Simpler for
  users; forces a destroy to free slots. Ceremony last-chance-
  destroy catches the edge where someone wants to swap in a late-
  season favorite.

---

## 8. Lineup shell — right sidebar + no-scroll bottom strip

### Goal

The lineup page today is a single scrolling column: header → diamond
→ bench → tokens → auto-sub controls. Even on a 1080p laptop, users
scroll to reach auto-subs. Refactor into a fixed-viewport shell:
diamond center, persistent right sidebar, stacked bottom strip. **No
page scroll at 800px viewport height.**

### Layout

```
┌────────────────────────────────────────────────────┐
│  Header (contest countdown, nav)                   │
├───────────────────────────────────┬────────────────┤
│                                   │  Sidebar       │
│                                   │  ─────────     │
│         Diamond (10 slots)        │  Readiness     │
│                                   │  Projected FP  │
│                                   │  Auto-subs     │
│                                   │  Submit CTA    │
├───────────────────────────────────┴────────────────┤
│  Bench (horizontal scroll inside strip)            │
├────────────────────────────────────────────────────┤
│  Tokens tray (horizontal scroll inside strip)      │
└────────────────────────────────────────────────────┘
```

### Behavior

- **Sidebar:** persistent right column, ~288px (Tailwind `w-72`),
  visual treatment mirrors the Collection sidebar
  (`src/app/(app)/collection/collection-grid.tsx` lines 162–254):
  same uppercase-tracked section headers, mono numeric values,
  section gap. Contents top-to-bottom:
  - **Readiness:** `10 / 10 slots filled`; per-slot warnings
    (missing position, low contract, token conflicts).
  - **Projected FP:** sum across slotted players, live-updating as
    cards change.
  - **Auto-subs:** the toggles relocated from their current below-
    bench position.
  - **Submit CTA:** "Submit Lineup" button anchored at the sidebar
    bottom with the contest-deadline countdown directly above.
- **Diamond** fills the remaining main-row width (left of sidebar).
- **Bottom strip — two stacked rows:**
  - **Bench row:** Small cards, ~160px tall, horizontal scroll
    inside the row when cards overflow.
  - **Tokens tray row:** ~72px tall, circular pips (§5), horizontal
    scroll same-pattern.
  - Rows have a subtle divider; neither collapses.
- **Budget at 800px viewport:**
  - Header ~64px
  - Main (diamond + sidebar) flex-1, ~504px
  - Bench row ~160px
  - Tokens row ~72px
  - Total ~800px.
- Below 800px viewport height, page falls back to page scroll (soft
  degradation, no hard layout break).

### Acceptance

- [ ] On 1280×800 viewport, lineup page fits with no page scroll.
- [ ] Bench + tokens rows anchored to viewport bottom at any height
  ≥ 800px.
- [ ] Sidebar visible on every lineup state (empty / partial / full
  / submitted).
- [ ] Auto-sub toggles reproduce current behavior from the sidebar.
- [ ] Submit CTA lives in the sidebar; no duplicate button elsewhere.
- [ ] Projected FP updates within 100ms of any slot change.
- [ ] Below 800px viewport, page degrades to scroll without layout
  break (spot-checked at 1280×700 and 1280×600).

### Dependencies

- New shell component: `src/components/lineup/LineupShell.tsx`.
- Lineup route refactor: `src/app/(app)/lineup/page.tsx` delegates
  layout to the new shell.
- Extract Collection sidebar treatment into
  `src/components/layout/SidebarCard.tsx` (shared primitive: section
  header, mono value, divider) consumed by both pages.
- Readiness state derived from the existing lineup slot state
  machine.
- Projected FP: existing `projectFantasyPoints` helper if present;
  otherwise simple sum over `card.projected_fp` (confirm field name
  during roadmap task).
- Auto-sub component — relocate, do not rewrite.

### Trade-offs

- **Desktop-only.** ≥800px rule is fine because v1 is desktop-only
  per `draft-deck-ui-ux-spec.md` §1.
- **Fixed sidebar width** eats horizontal space on narrow laptops
  (13" @ 1280). 288px sidebar leaves ~992px for diamond — still
  comfortable.
- **No sidebar collapse.** Keeps the UI predictable; adds density
  cost. Collapse is a later polish if needed.
- **Tokens row always present.** Empty-state ("No tokens yet —
  earn some from packs") rather than collapsing the row; keeps
  layout stable.

---

## 9. Not in scope for v1.2

Carries forward §4 entries that remain parked, plus new deferrals:

- **Slot ↔ slot reorder and slot ↔ bench drag** — needs
  `swap_lineup_slots` SQL fn (ADR-0011 open item #2). §6's "Remove
  from slot" button covers slot → bench by click for now.
- **Pack opening reveal redesign** — still parked as its own mini-
  spec.
- **Tier foil motion** (silver shine, gold bloom, diamond shimmer).
- **Onboarding flow pass.**
- **Live contest view polish.**
- **Empty + error state sweep.**
- **Accessibility audit pass** (WCAG 2.1 AA).
- **Mobile layout.**
- **Sound design / haptics / artwork.**

---

# Phase 8 batch — polish items locked 2026-04-21

The three entries below were locked via a two-round interview after
Phase 7 shipped. They target the biggest remaining UX moment (pack
opening), finish the lineup-page arc (slot swap, collection drawer
migration, n8n-style diamond viewport), and pay down two pieces of
hardening debt (real BDL webhook, MLB-official W/L attribution).

---

## 10. Pack opening reveal redesign

### Goal

The current pack opening is a quick flip card-by-card — functional
but flat. A pack opening should feel like the biggest moment in the
app. Rebuild the reveal as a paced, user-controlled sequence with
a proper celebration when you hit a star-tier player, and a clear
choice when you pull a duplicate.

### What we're building on top of

All pulled cards start at Bronze tier (tier progression happens
later via career FP). So the reveal's scarcity axis isn't the
card's tier — it's the **player's talent tier**, which the schema
already tracks via `player.player_value_tier` enum
(`'star' | 'starter' | 'role' | 'prospect'`). That's what drives
the celebration moment.

### Behavior

- **Carousel + tap-through:** all N cards in the pack land face-
  down in a row. One card is "active" (centered, slightly lifted).
  Tap the active card → flip reveal animation (180° flip, ~350ms,
  eased). The next card becomes active; user taps again.
- **Reveal animation (per card):**
  - Face-down → flip to face-up (tier frame materializes).
  - If player is `'star'` or `'starter'` → fire the star-pull
    celebration AFTER the flip completes (brief pause, ~150ms).
  - Dupe stamp (if applicable) lands with the face-up flip.
- **Star-pull celebration:**
  - **`'star'`:** full celebration — card hero-scales to 1.4 with a
    brief radial burst + particles ('dust puffs' from behind the
    card) + a subtle screen-darken behind the card to spotlight it.
    ~900ms total. Feels earned.
  - **`'starter'`:** smaller variant — card hero-scales to 1.15
    with a single glow pulse along the tier frame. No screen-
    darken, no particles. ~450ms. A notable but less reverent
    moment.
  - No celebration for `'role'` / `'prospect'` — just a normal
    flip.
- **Duplicate handling (keep one, sell one):**
  - When the pulled card is a player the user already owns, the
    reveal pauses after the flip with a split panel:
    - Left: the **new** card (fresh 15-play contract, bronze).
      Shows the coins earned from selling this one.
    - Right: the **existing** card (user's current instance, with
      its career FP + contract count). Shows the coins earned
      from selling this one instead.
  - User picks one. The unpicked card is destroyed + coins are
    credited (via existing `quick_sell_card` for the existing
    instance, or a pack-opening-equivalent credit for the new one).
  - If the user owns **multiple** existing instances of the
    player: the "existing" side picks the instance with the lowest
    career FP as the default candidate; a small "(change)" link
    opens a tiny picker for power users to select a different
    instance. Default flow is one-tap.
- **End of reveal:** "Done" / "Back to Shop" CTA. Coin ticker in
  the header has ticked up live as each sell resolved.

### Star-pull particle physics

Reuses the Phase 6 motion vocabulary (§1) — same iOS-snappy spring
personality, no new motion primitives. Specifics:
- Scale spring: `stiffness 300, damping 22, mass 1` for the hero
  lift (slightly softer than the drag spring).
- Particles: 8–12 dust puffs spawn behind the card with randomized
  velocity vectors; decay via opacity + scale over ~500ms. Motion
  (framer-motion) handles the parallel animations.
- Reduced-motion: no hero-scale, no particles. Card emits a brief
  ring-pulse instead (matches the muted Phase 7 reduced-motion
  behavior everywhere else).

### Acceptance

- [ ] Pack opening shows N cards face-down in a carousel.
- [ ] Tap the active card → it flips face-up. Next card becomes
  active.
- [ ] A `'star'` pull triggers the full celebration (hero scale +
  particles + screen-darken). Covers feel-testable on `/palette`
  via a dedicated demo.
- [ ] A `'starter'` pull triggers the small celebration (glow
  pulse). Same `/palette` coverage.
- [ ] A `'role'` or `'prospect'` pull plays only the flip — no
  celebration layer.
- [ ] A dupe pull shows the keep-new vs keep-existing panel; user
  picks one; unpicked card destroys + coins credit.
- [ ] User with multiple existing instances defaults to the
  lowest-FP instance; can change via a picker.
- [ ] Coin counter in header ticks up on each sell resolution (no
  batching at end of reveal).
- [ ] Reduced-motion: flip is instant, dupe panel is instant, no
  particles or hero scale; coin ticker still updates.
- [ ] Playwright scenario: signup → open daily pack → reveal all →
  back to collection with expected count.

### Dependencies

- `src/components/pack/` — existing reveal components. Major
  rewrite; keep the data-loading server action (`openPack`) as-is.
- New `/palette` section demonstrating the three flip variants +
  dupe panel (client demo; keep server↔client seam safe per ADR-
  0011 #2).
- SQL: no new fns. Dupe handling calls `quick_sell_card` for the
  existing-instance path; new-instance sell needs a
  `credit_coins` wrapper in the pack-opening flow (may already
  exist in `open_pack`; verify during build).
- `reference/` type extracts: BDL SDK's player schema already
  exposes `player_value_tier`; no new data plumbing.

### Trade-offs

- **Tap-through pacing loses the batch-open speedrun.** Users
  opening five packs in a row tap more than they do today. Mitigate
  with a "Skip all" button that plays the remaining flips as a
  cinematic (no celebration).
- **Dupe panel adds a decision point the current flow doesn't
  have.** If users regret sell-new more than sell-existing, the
  picker default biases against that — lowest-FP existing is
  usually what the user meant. Instrument (PostHog event
  `pack_dupe_decision`) so we can tune.
- **Star-pull frequency hinges on pack composition.** If the daily
  pack rolls mostly role/prospect players, the celebration is
  rare — which is the point, but we should monitor and adjust
  pack seeds if it feels too sparse.

---

## 11. Lineup finish — collection drawer, slot swap, diamond pan+zoom

### Goal

Close the Phase 7 arc. Three pieces that each stand alone but
finish the lineup-page story: make the detail drawer universal
(Collection too), let users drag a card in a slot onto another
slot to swap them, and replace the "internal scroll at 800px"
compromise with a proper pan+zoom canvas on the diamond.

### 11.1 Collection drawer migration

**Behavior:**
- Click a card in `/collection` → `<CardDetailDrawer>` opens in
  place. URL updates to `/collection?card=<id>` (query param, not
  a new route).
- On direct visit of `/collection?card=<id>`, the grid renders
  with the drawer pre-opened.
- Back button closes the drawer (history stack: grid → grid+card
  → grid).
- `/collection/[cardId]` stays as a route (direct links still
  work). The full-page version becomes secondary — consider it the
  permalink surface.

**Acceptance:**
- [ ] Collection grid cards open the drawer, not a new page.
- [ ] URL query param updates on open / clears on close.
- [ ] Forward/back navigation moves the drawer open / closed.
- [ ] Direct `/collection?card=<id>` link opens the drawer on
  mount.
- [ ] Direct `/collection/[cardId]` still renders the existing
  full-page view (back-compat).
- [ ] Collection cards gain the corner `AppliedTokenBadge` for
  any card with an applied token (the regression flagged in P7.2
  fixes here).

**Dependencies:**
- `src/app/(app)/collection/collection-grid.tsx` — swap `<Link>`
  to a click handler that sets `?card=<id>` via `router.push` +
  opens the drawer. Grid owns the drawer state + cardId lookup.
- `<CardDetailDrawer>` already built in P7.3; add an optional
  `onAddToVault` path that the Collection context wires to
  `vaultCardMidseason`.
- Corner badge propagation: Collection page loads applied-token
  metadata (already in `applied_token_id` column — just need to
  join tokens + render badge).

### 11.2 Slot ↔ slot swap drag

**Behavior:**
- Drag a card from one filled slot onto another filled slot →
  swap the two cards. Atomic server-side (single SQL fn).
- Position eligibility check: the dragged card's positions must
  include the target slot's role, AND the displaced card's
  positions must include the dragged card's origin role. If
  either fails → shake-back (existing §1 invalid-drop), no swap.
- Drag from a slot onto an empty slot: just move (existing
  behavior, but via the new fn for symmetry).
- Drag from a slot onto the bench drawer: existing "Remove from
  slot" button is still there; add this as a second path.

**Acceptance:**
- [ ] Two hitters of compatible positions swap via drag.
- [ ] Incompatible swap (SS onto OF where SS can't play OF or OF
  can't play SS) shakes back without moving.
- [ ] Slot → bench drop moves the card to bench.
- [ ] Optimistic UI: both slots update instantly; server round-
  trip settles via `useOptimistic`.
- [ ] E2E coverage skipped per ADR-0011 drag-drop posture; manual
  smoke on prod.

**Dependencies:**
- New SQL fn `swap_lineup_slots(entry_id, position_a, position_b)`
  — validates ownership, eligibility both directions, applies
  both updates atomically.
- New server action `swapLineupSlots` in `app/actions/lineup.ts`.
- `LineupSlot` becomes a drag SOURCE when filled (currently only
  drop target). `useDrag` wrapper with `canDrag` gated on
  `!locked && card`.
- `CardDragLayer` works as-is (domain-generic per ADR-0011).

### 11.3 Diamond pan + zoom canvas

**Goal:** Drop the internal overflow-scroll workaround. Diamond
lives on a pan+zoom canvas; user can zoom in to inspect a slot,
pan around, or tap "Fit" to return to the default.

**Behavior:**
- Default zoom level fits the diamond to the pane (derived at
  mount from pane dimensions). Slot cards render at the shared
  `<Card size="small">` (96×134) — no shrink required because
  zoom handles the fit.
- **Gestures:**
  - Trackpad pinch → zoom around the pointer.
  - Ctrl/Cmd + scroll → zoom around the pointer.
  - Drag on empty diamond space (when zoomed past fit) → pan.
  - Floating control cluster (top-right of the diamond pane):
    - `+` / `−` buttons — zoom in / out by 20%.
    - `Fit` button — scale + recenter to the mount-time fit.
- **Zoom bounds:** 0.5× (min) to 2.0× (max) of the mount-time
  fit. Hard clamp; scroll past bounds dampens.
- **Pan bounds:** diamond stays within the pane (can't pan all
  content off-screen). Elastic resistance at edges.

**Acceptance:**
- [ ] Pane mounts with the full diamond visible (no internal
  scroll at 800px viewport).
- [ ] Trackpad pinch, ctrl-scroll, and buttons all zoom around the
  pointer (or pane center for buttons).
- [ ] Drag-to-pan only activates when zoomed past fit. At fit
  level, drag does nothing (avoids accidental pan).
- [ ] Fit button returns to mount-time transform.
- [ ] Dragging a card onto a slot still works — slot drop targets
  ignore the pan/zoom transform correctly (hit-testing is done in
  transformed coordinate space by default; verify).
- [ ] Reduced-motion: zoom + pan are instant (no easing). Fit
  button still works.

**Dependencies:**
- New `<ZoomCanvas>` component (or reuse a motion wrapper) —
  probably wraps the `<DiamondGrid>`'s outer container with a
  `transform: scale() translate()` CSS + handles gesture events.
- Consider `@use-gesture/react` or motion's drag/pinch primitives
  — both already adjacent to our stack. If adding a dep,
  `@use-gesture/react` is the narrow choice; otherwise
  hand-rolled pinch detection from wheel events with ctrlKey.
- Removes P7.1's "internal overflow scroll" workaround on the
  diamond pane. `LineupShell`'s middle row becomes a fixed-size
  pan surface.

### Trade-offs

- **Pan+zoom is more UI than a fixed diamond needs.** n8n's
  canvas pays off because workflows scale with content. The
  diamond is always 10 slots. But: it gives users a way to
  inspect a slot + feels modern + avoids the "cards too small to
  read" objection if we later shrink default size. Accepted per
  interview.
- **Gesture precedence.** Pinch, ctrl-scroll, and drag-pan all
  compete. Resolution: pinch zooms; wheel without ctrl scrolls
  the page (which we want suppressed on the diamond pane anyway);
  drag on cards drags the card (react-dnd has priority); drag on
  empty space pans. Document clearly.
- **Collection migration loses `/collection/[cardId]` as the
  primary surface.** Anyone relying on that URL as a permalink
  still gets a full page. If we drop the page later, flip to a
  redirect to `/collection?card=<id>`.

---

## 12. Hardening — BDL webhook + MLB-official W/L attribution

### Goal

Two pieces of load-bearing debt. Both replace scaffolding built
for development with the real production path.

### 12.1 Real BallDontLie webhook registration

**Today:** `/api/dev/webhook-sim` is the only path that exercises
the MLB event ingestion pipeline. Real BDL webhooks have never
been wired to the production endpoint.

**Plan:**
- Coordinate with BDL to register the prod webhook URL
  (`https://draft-deck.vercel.app/api/webhooks/balldontlie`) and
  configure the HMAC signing secret on both sides.
- Update `BDL_WEBHOOK_SECRET` env var in Vercel prod.
- Run a subscription test: fire one real MLB game event from BDL,
  confirm our endpoint accepts, verifies HMAC, and writes to
  `webhook_delivery` + downstream tables.
- Leave `/api/dev/webhook-sim` in place as a dev-only path (guard
  with `NODE_ENV !== 'production'`).

**Acceptance:**
- [ ] Webhook registered with BDL; secret stored in Vercel prod
  env.
- [ ] One real BDL event arrives + is accepted + processed end-
  to-end (game event → scoring → contest update).
- [ ] `webhook_delivery` audit shows the real event distinct from
  dev-sim events (different `source` or similar marker).
- [ ] Dev-sim route returns 404 in prod.

**Dependencies:**
- BDL coordination (may stall until user confirms credentials).
- No app code changes beyond env + a small `NODE_ENV` guard on
  dev-sim route.

### 12.2 Play-by-play W/L attribution

**Today:** `src/lib/mlb/reconcile.ts` uses a heuristic — the
pitcher with the most innings pitched on the winning team gets
the W. For most games this lines up with the official MLB rule,
but it diverges in games where a reliever picks up the W, or
where the SP was pulled before 5 IP and someone else met the
scoring requirement.

**Plan:**
- BDL's play-by-play payload includes MLB's official W/L
  attribution per game. Read it; use it directly instead of
  computing our own.
- Update `reconcile.ts` to read the `winning_pitcher_id` /
  `losing_pitcher_id` (or whatever the BDL shape names them) and
  apply them to the rostered pitcher's scoring.
- If BDL doesn't publish the official attribution (edge: game in
  progress, no decision yet), keep the heuristic as fallback
  only.
- Backfill: one-time script to recompute W/L for contests scored
  under the old heuristic (optional; depends on how many contests
  are affected).

**Acceptance:**
- [ ] `reconcile.ts` reads MLB-official W/L from the play-by-play
  payload.
- [ ] When the official attribution is present, it drives the FP
  stat; heuristic only fires when official is absent.
- [ ] Unit test covers the happy path + the "official missing →
  heuristic fallback" path.
- [ ] No change to existing finalized contests without an
  explicit backfill run (guard via script; don't silently rewrite
  history).

**Dependencies:**
- BDL SDK types (`reference/` extracts) — verify the field name
  for official W/L attribution. Update `src/lib/mlb/provider.ts`
  if needed.
- Scoring logic in `reconcile.ts` + `src/lib/db/functions/` scoring
  fns may need SQL updates too.

### Trade-offs

- **BDL webhook registration stalls on external coord.** If BDL
  doesn't turn around quickly, 12.1 slips. Slice 12.2 has no
  external dep so it can ship regardless.
- **Backfill history vs leave it.** Changing the W/L rule
  retroactively rewrites past contest outcomes. Default: don't
  rewrite. If the divergence is small, skip entirely. If it
  affects leaderboards meaningfully, surface a one-time recompute
  script in P8.5 and document what changed.

---

## 13. Not in scope for v1.3

Carries forward §4 + §9 entries that remain parked, plus
deferrals from Phase 8 interviewing:

- **Ceremony fn tolerance for pre-vaulted cards** (P7.4 followup;
  not urgent, season's months out).
- **Empty + error state sweep** (still parked — candidate for
  Phase 9).
- **Tier foil motion** (silver shine, gold bloom, diamond
  shimmer).
- **Onboarding flow pass.**
- **Live contest view polish** (score tick animations, event-feed
  cinematics, heat-map). Good candidate for next phase.
- **Accessibility audit** (WCAG 2.1 AA).
- **Rank-based XP against multi-user contests** (needs real users
  first).
- **Mobile layout, sound, haptics, artwork.**

---

# Phase 9 batch — locked 2026-04-22

Phase 8 shipped the BDL webhook pipeline but events only fire
against `public.game` rows that already exist. Today only contest
creation can populate those rows, and contest creation is gated
on the season having scheduled games in it. The product is
one sync away from being actually playable against live MLB
data; Phase 9 closes that gap.

Single deliverable: schedule sync + proof that one real MLB game
scores a real user's lineup end-to-end.

---

## 14. Game schedule sync + first real end-to-end

### Goal

Make the product playable with live MLB data. A 2-hourly cron
pulls today + next 2 days of scheduled games from BDL and upserts
them into `public.game`. Webhook events for those games land
correctly (not skipped as "unknown game"). A lineup submitted
against a card pool of players in one of those games scores end-
to-end when the game finalizes.

This is functional work, not UX polish — no `/palette` demo,
no new animations, no reduced-motion concerns.

### What works today

- Player sync exists and keeps `public.player` fresh (verified:
  9/9 sample players resolved during P8.6 triage).
- Team data is stable (static 30 MLB franchises; seeded).
- `public.game` has a schema but nothing auto-populates it for
  current-day MLB. Phase 4 and earlier flows created rows
  opportunistically; no ongoing pull.
- Webhook pipeline handles unknown-game events by skipping
  quietly (P8.6 `unhandled: true` path).
- Contest creation (`create_daily_contest`) references games via
  `contest.included_game_ids uuid[]`. When games aren't
  pre-populated, the contest either has an empty array or creates
  the game row itself. Schedule sync makes the former the norm.

### What Phase 9 builds

**14.1 — Schedule sync server function.**
- New file `src/lib/mlb/schedule-sync.ts` exporting
  `syncScheduleHorizon(daysAhead: number)`:
  - Fetches `getGames({ dates: [today, today+1, today+2] })` via
    the existing `MLBDataProvider`.
  - For each returned `MLBGame`:
    - Resolve `home_team_id` + `away_team_id` via
      `SELECT id FROM public.team WHERE bdl_team_id = $1`.
    - If either team is missing, log + skip the game (shouldn't
      happen with a full team seed; surfaces data gaps
      explicitly).
    - Upsert `public.game` keyed on `bdl_game_id` with:
      `home_team_id`, `away_team_id`, `scheduled_start`,
      `status` (translated from BDL's `game.status` string),
      `venue`, `season_id` (derived from BDL `season` year).
  - Returns `{ synced: number, skipped: number, errors: string[] }`
    for observability.

**14.2 — BDL `status` → our enum translation.**
- Our `game_status` enum: `'scheduled' | 'live' | 'final' | 'postponed' | 'suspended' | 'canceled'`.
- BDL publishes its own string set (e.g., `"Scheduled"`,
  `"In Progress"`, `"Final"`, `"Postponed"`, `"Delayed"`).
  Translation table lives in `schedule-sync.ts`, conservative on
  unknowns (map to `'scheduled'` + log).

**14.3 — Cron endpoint.**
- `src/app/api/cron/sync-schedule/route.ts`:
  - `GET` (cron-friendly), `CRON_SECRET`-gated.
  - Wraps `syncScheduleHorizon(2)` with Sentry instrumentation.
  - Returns the summary JSON for observability in Vercel logs.
- `vercel.json` cron config: `0 */2 7-23 * * *` (every 2h from
  7 AM to 11 PM ET — UTC-5/UTC-4 handled by Vercel at runtime
  via a TZ-aware schedule; document the offset).
- Idempotent — re-running within the same 2-hour window is safe.

**14.4 — Status-transition guard.**
- Sync may overwrite a `'live'` game back to `'scheduled'` if BDL
  momentarily reports the earlier state. Guard the upsert: only
  move a game backward in the lifecycle (live → scheduled,
  final → live) if the BDL timestamp is more recent than the last
  webhook-driven update.
- Simpler alternative: never regress status. Prefer this —
  webhooks are authoritative for status.

**14.5 — First real end-to-end smoke.**
- Hand-run scenario: pick a scheduled MLB game tonight; ensure it
  lands in `public.game`; create a contest that references it;
  submit a lineup with cards for players in that game; observe
  `webhook_delivery` fill + `game_event` rows write + `final_fp`
  populate + `contest_entry.status = 'final'` after
  `mlb.game.ended` fires.
- Document the run in `ADR-0014` as the "first real game"
  verification — the moment the product works without any dev-sim
  events.

### Acceptance

- [ ] `syncScheduleHorizon(2)` upserts N scheduled games from
  BDL; rerun without duplicates.
- [ ] Every BDL `game.status` maps to a valid `game_status` enum
  value (no default-to-scheduled without logging).
- [ ] Cron endpoint returns `{ synced, skipped, errors }` JSON
  and is reachable only with a valid `CRON_SECRET`.
- [ ] `vercel.json` schedules the cron every 2 hours in the
  active window.
- [ ] After one successful cron run on prod, at least one
  scheduled game for today exists in `public.game`.
- [ ] A real `mlb.game.started` webhook for a synced game updates
  `public.game.status = 'live'` (no longer unknown-game-skipped).
- [ ] A lineup-resolving end-to-end completes: `game_event` rows
  land, `reconcileGame` fires at game-end, `contest_entry`
  settles with `final_score > 0`, test-account lineup reflects
  the scoring.
- [ ] Integration / unit test for the status translation table +
  upsert idempotency.

### Dependencies

- BDL SDK `getGames` — already wired via
  `src/lib/mlb/provider.ts`.
- `public.game` schema — no migration needed (columns already
  exist per Phase 1).
- Vercel cron infrastructure — already in use for other jobs
  (season close, etc.).
- Player / team sync — assumed working; any data gaps logged +
  skipped, not fatal.

### Trade-offs

- **2h cadence means up-to-2h lag** for last-minute schedule
  changes (rain-outs, reschedules). Acceptable; contests are
  daily-granular not hour-granular.
- **BDL status is authoritative for schedule, but webhooks are
  authoritative for real-time status transitions.** The no-
  regress rule keeps sync from stomping on webhook writes.
- **Probable starting pitchers not available from BDL SDK.**
  Parked — P8.5 W/L heuristic uses game-end stats, so probables
  aren't a functional requirement. Future slice if we pivot
  providers or BDL adds the field.
- **No retro-backfill of historical games.** Only today + next
  2 days. Historical contest resolution is already done.
- **One real-game smoke is not "works every game" proof.** If a
  bug surfaces on an edge case (double-header, suspended game,
  postponement), we'll learn it in live traffic, not
  pre-launch. Acceptable given the webhook pipeline's observable
  failure paths (`webhook_failed`, `unhandled: true` skips).

---

## 15. Not in scope for this pass

Still deferred. Carries forward §13 plus new items surfaced in
Phase 8:

- **Schedule sync for historical seasons.**
- **Probable SP enrichment** (depends on BDL adding the field or
  a second data source).
- **Onboarding flow pass.**
- **Empty + error state sweep.**
- **Accessibility audit** (WCAG 2.1 AA).
- **Tier foil motion.**
- **Dupe panel multi-instance picker.**
- **Mobile / sound / haptics / artwork.**

---

# Phase 10 batch — locked 2026-04-22

Closes two open items after the first real-game scoring night:
the user-flagged post-submit page flip (spec'd to keep users on
the main lineup page with live score overlaid), and the ceremony
fn tolerance carried from P7.4.7 that blocks the first real
offseason commit.

---

## 16. Unified lineup view

### Goal

Kill the page-flip you hit last night. Lineup page stays the
Lineup page across every entry state — building, submitted, live,
final. Only the sidebar + bottom-strip chrome transforms; the
diamond always shows the same 10 slotted cards.

Today the page delegates to two entirely different views (
`<LineupShell>` for building, `<LiveListView>` for the rest).
Users submit a lineup and the entire surface they were just
looking at disappears. Bad — the submitted lineup is what you
*want* to look at while games play.

### Behavior

**Page shell is identical in all states.** `<LineupShell>` from
P7.1 renders:
- Header row: contest name + lock countdown.
- Main row: `<DiamondGrid>` (centered) + right sidebar (`w-72`).
- Bottom strip: bench row + tokens tray row (both stacked).

**State-driven chrome inside the shell:**

| Surface | Building | Submitted / Live / Final |
|---|---|---|
| Diamond | Draggable cards, click-to-detail. | Read-only cards, click-to-detail still works. Drag disabled at source (no ghost). |
| Sidebar — Readiness | `N / 10 slots filled` + warnings | *(hidden)* |
| Sidebar — Projected FP | Heuristic projection | *(hidden)* |
| Sidebar — Auto-sub | Smart / Manual radios | *(hidden)* |
| Sidebar — **Live Score** | *(hidden)* | Big number (sum of slot `final_fp` or `live_fp`). Updates via Realtime. |
| Sidebar — **Box Score** | *(hidden)* | Per-slot row: `C   Jung Hoo Lee   8.0`. Pending slots show `—`. |
| Sidebar — **Event Feed** | *(hidden)* | Scrollable list of events where `batter_player_id` or `pitcher_player_id` matches a card in this lineup. Newest first. Empty state: "Waiting for first pitch…" |
| Sidebar — Submit / Status | `Submit lineup` button | Status chip (see below) |
| Bench tray | Interactive, drag source | Visible, disabled (no drag source, no click-to-open-detail on bench cards either). |
| Tokens tray | Interactive, drag source | Visible, disabled (no drag source). |

### Event feed format

One row per event:

```
Altuve hit a double · +5.0 · 8:47 PM
Baty struck out · 0.0 · 9:03 PM
Lee singled; RBI · +5.0 · 9:11 PM
```

Fields:
- **Player name** (short form — last name first).
- **Action** — lowercased play text, normalized from BDL's
  `play.text` or `play.type` fallback.
- **FP delta** — `+N.N` for positive, `0.0` for non-scoring. Bold.
- **Time** — local time HH:MM.

Scope: only events where the batter or pitcher is in the user's
lineup. All other events skipped. If an event lands on both
(user has both the batter AND pitcher), show it once.

### Status chip

Replaces the Submit CTA. Text varies by state:

- **Submitted, no games live yet** — `Submitted · Waits for
  first pitch` (if >15 min to first pitch) or `Submitted ·
  Locks in 42m` (countdown during the pre-game window).
- **Live** — `Live · Top 5th, 3 games active`. Inning pulled
  from the most-recently-updated lineup-player game; games-
  active count from the contest's game rows with
  `status='live'`.
- **Final** — `Final · 97.5 FP`. Rank display (`Placed 3rd of
  8`) deferred — §17 adds it if cheap, otherwise P11.

Chip is a visual block (not a button); no click interaction.

### Live update mechanism

Supabase Realtime subscription on `game_event` insert, filtered
client-side to `batter_player_id | pitcher_player_id IN (lineup
player ids)`. Re-fetches entry + slot state on any matching
event. Event feed state is client-derived — don't
`revalidatePath`; use optimistic updates keyed on
`provider_event_id` to prevent double-render.

Fallback: polling every 30s if Realtime connection drops. A
connection indicator (small dot in the sidebar header) shows
live / reconnecting.

### Acceptance

- [ ] Submitting a lineup does not navigate. Page stays at
  `/lineup`, diamond keeps showing the 10 cards.
- [ ] Sidebar transitions from building chrome to box score +
  event feed within one render after the entry status change.
- [ ] Bench + tokens rows are visible, non-interactive.
- [ ] Live Score sum reflects current slot FPs (live_fp during
  live games, final_fp after).
- [ ] Event feed renders at most the user's lineup's events.
- [ ] Realtime subscription connects on page load + tears down
  on unmount.
- [ ] Status chip text reflects accurate live/final state.
- [ ] Reduced-motion: FP updates are instant (no tick animations
  unless ~60ms counter).

### Dependencies

- `contest_lineup_slot.live_fp` + `final_fp` columns — already
  written by the scoring reducer + reconcile.
- `contest_entry.live_score` + `final_score` — aggregate fields
  already on the entry.
- Supabase Realtime — in stack; already used for webhook
  pipeline debugging.
- `public.game` rows populated — P9 schedule sync ensures this.

### Trade-offs

- **One page, many states** trades code cleanliness (one route
  handler vs. two) for more complex state management. Worth it
  given the user-visible win.
- **Event feed client-filtered** means a user on many tabs
  sees the full firehose of events on each connection. BDL's
  volume is tolerable (~hundreds/hr during active windows);
  revisit if Realtime quota becomes a concern.
- **Rank display deferred.** Requires the existing leaderboard
  path to expose per-entry rank at query time. Can add post-
  shipping if cheap; not blocking.

---

## 17. Ceremony fn tolerance for pre-vaulted cards

### Goal

`commit_vault_selection` today rejects cards that are already
`is_vaulted = true`. Since P7.4 shipped mid-season vault
(cards enter vault with `vault_source='midseason'`), any user
with pre-vaulted cards at season end would hit this guard and
be blocked from their first real offseason ceremony.

Fix: relax the guard to accept pre-vaulted cards as valid
selections. Skip the `card` update for already-vaulted rows
(they already have `is_vaulted=true`, `vaulted_at=...`), but
still insert the `vault_entry` snapshot row for the ceremony
audit.

### Behavior

- `commit_vault_selection(user_id, season_id, card_ids[])`:
  - Selected cards can be `is_vaulted=false` OR `is_vaulted=true
    AND vault_source='midseason'`.
  - For `is_vaulted=false`: existing path — insert vault_entry
    + mark card as vaulted (`is_vaulted=true`,
    `vault_source='ceremony'`).
  - For `is_vaulted=true AND vault_source='midseason'`: insert
    vault_entry snapshot only; leave `card.is_vaulted=true` +
    `vault_source='midseason'` alone. The card is already in
    the vault; we're just memorializing it in `vault_entry`.
- `is_vaulted=true AND vault_source='ceremony'` still raises —
  that's a double-commit attempt.

### Acceptance

- [ ] User with 5 pre-vaulted (midseason) + 3 fresh selections
  can commit the ceremony: all 8 end up in `vault_entry`, cards
  all `is_vaulted=true`, sources preserved per original path.
- [ ] User selecting a ceremony-committed card (re-run attempt)
  still raises `vault_commit_already_processed`.
- [ ] Existing 10-card cap still enforced across selection set.
- [ ] DO-block smoke passes on prod.

### Dependencies

- Migration (0024) that patches `commit_vault_selection`. No
  schema change, just fn body update.

### Trade-offs

- None — strict semantics win from P7.4 are preserved, the
  guard is just made aware of the new mid-season source.

---

## 18. Not in scope for v1.5

Carries forward §15 minus what we're shipping this phase:

- Onboarding flow pass.
- Empty + error state sweep.
- Accessibility audit (WCAG 2.1 AA).
- Tier foil motion (silver shine, gold bloom, diamond shimmer).
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Dev-sim fixture with real-lineup seed (considered for Phase
  10; scope-cut to keep focus).
- Webhook retry observability dashboard.
- reconcileGame integration test.

---

# Phase 11 batch — locked 2026-04-22

Closes the ADR-0014 / ADR-0015 carry-over: two phases in a row
surfaced pre-existing latent bugs only when the relevant SQL
fns were first exercised against real lineup data in
production. A local-Supabase integration test harness that
seeds realistic scenarios + calls the fns + asserts outcomes
would have caught both pre-commit. This phase builds it.

---

## 19. Integration test harness — real-lineup fixture

### Goal

Prevent the "latent SQL bug surfaces on first live invocation"
class of issue that bit us in P9.5 (reconcile UPDATE-FROM alias)
and P10.5 (ceremony token constraint + FK chain). Each bug was
a one-line fix once found; the cost was the debugging time +
manual DO-block smoke required to find them. A fixture pattern
that seeds a realistic scenario, calls the SQL fn, and asserts
the DB state would have caught both pre-commit.

Two integration test suites + a shared seed library. Run locally
against `supabase start`; not in CI (matches the existing
`tests/integration/rls.test.ts` posture). The bar is
"regressions in scoring or ceremony paths get caught before
commit."

### Scope

- `tests/fixtures/seed.ts` — shared helpers for creating users,
  cards, tokens, games, contests, lineup slots, applied-token
  records. Mirrors the real schema invariants; cleanup via
  `auth.users` CASCADE.
- `tests/integration/reconcile.test.ts` — exercises
  `reconcileGame(bdlGameId)` against a seeded lineup + game +
  stats. Would catch a regression on the P9.5 class of bug.
- `tests/integration/ceremony.test.ts` — exercises
  `commit_vault_selection` through pre-vaulted / fresh /
  mixed-selection paths. Would catch a regression on the P10.5
  class of bug.
- `docs/runbook.md` update: add a "How to run integration
  tests" section (prereqs + commands).

### Behavior

**Seed library (`tests/fixtures/seed.ts`) exports:**

```ts
seedUser(): Promise<{ userId: string; seasonId: string }>
seedCard({
  userId, playerId?, tier?, is_vaulted?,
  vault_source?, contract_plays_remaining?,
}): Promise<string>  // card_id
seedGame({
  bdlGameId?, homeTeamId, awayTeamId,
  date?, status?,
}): Promise<string>  // game_id
seedContest({
  seasonId, gameIds, name?,
}): Promise<string>  // contest_id
seedContestEntry({
  userId, contestId, status?,
}): Promise<string>  // entry_id (creates empty 10 slots)
seedLineupSlot({
  entryId, position, cardId, tokenApplicationId?,
}): Promise<void>
seedToken({
  userId, type, bonusFp,
  appliedToCardId?, appliedToContestId?,
}): Promise<string>  // token_id
seedTokenApplication({
  userId, tokenId, cardId, contestId,
}): Promise<string>  // token_application_id
cleanupUser(userId): Promise<void>
```

All writes via a direct `pg` Client on `DATABASE_URL`, not the
Supabase JS client — matches the `rls.test.ts` pattern and
bypasses RLS cleanly for test setup.

**Reconcile test coverage:**

- **Happy path** — seed a lineup with 2 hitters rostered in a
  completed game; mock `provider.fetchGameStats` to return box-
  score numbers; assert `slot.final_fp` is written for each
  slot and `contest_entry.final_score` rolls up (when
  `entry.status IN ('live','final')`).
- **Empty stats** — game with no stats returns; no slot writes.
- **QS token trigger** — seeded pitcher with QS token, stats
  showing 6+ IP + ≤3 ER; assert token_application.triggered=true
  + slot FP includes bonus.
- **Winning-pitcher attribution** — seeded game with team runs +
  pitcher stats; assert `mlb.game.pitcher_win` game_event row
  emitted with correct pitcher.
- **Regression guard** — a test that specifically runs the
  UPDATE-FROM subquery from reconcile.ts and asserts it
  completes without a 42P01 error.

**Ceremony test coverage:**

- **Happy path** — user with 3 fresh cards, calls
  `commit_vault_selection` in offseason; asserts 3 vault_entry
  rows + all 3 cards marked `is_vaulted=true` +
  `vault_source='ceremony'`.
- **Pre-vaulted tolerance** — user with 2 fresh + 1 midseason-
  vaulted; commits all 3; asserts pre-vaulted retains
  `vault_source='midseason'` + original `vaulted_at`; fresh
  two get `vault_source='ceremony'`.
- **Token constraint regression guard** — user with an applied
  token on a non-selected card; commit clears both
  applied_to_card_id AND applied_to_contest_id (the P10.5 bug).
- **Token FK regression guard** — user with an unused token
  that has a token_application row; commit succeeds without
  23503 (the P10.5 bug).
- **Double-commit idempotency** — commit once, attempt again;
  assert second raises 23514 "already committed."
- **Cap enforcement** — attempt to commit 11 cards; assert
  22023.

### Acceptance

- [ ] `pnpm test:integration` (new script) runs both suites
  against local Supabase and passes.
- [ ] All reconcile tests pass without manual fix-ups.
- [ ] All ceremony tests pass; each of the two specific
  regression-guard tests fails if you revert migration 0025 /
  0026.
- [ ] `docs/runbook.md` explains how to `supabase start` + run
  the integration suite.
- [ ] `CLAUDE.md` gets a one-line pointer: "Before merging
  SQL-fn changes, run `pnpm test:integration`."

### Dependencies

- Local Supabase already runs for `tests/integration/rls.test.ts`.
  No new infrastructure.
- `pg` client (already a transitive dep via Drizzle). If
  missing from devDeps, add it.
- New Vitest config entry to scope an integration-only run
  (optional — can reuse the existing `pnpm test` and rely on
  users to run when relevant).

### Trade-offs

- **Local-only** — no CI coverage. If you ship a broken SQL
  fn without running the suite, prod catches it. Same posture
  as `rls.test.ts`. Re-evaluate when adding contributors.
- **Direct pg client for seeds** — bypasses RLS. That's the
  intent (setup needs to write anywhere); the prod safety
  story is unchanged because RLS still applies at runtime
  via the Supabase JS path.
- **Not covering every SQL fn** — open_pack, apply_token,
  quick_sell_card, vault_card_midseason, destroy_vaulted_card
  are all out of scope for this phase. Reconcile + ceremony
  are the two that surfaced bugs; rest stay covered by their
  existing unit tests + DO-block smokes. Add fixture tests
  when a fn gets touched.

---

## 20. Not in scope for v1.6

- Onboarding flow pass.
- Empty + error state sweep.
- Accessibility audit (WCAG 2.1 AA).
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Live-view polish (per-slot FP glow, status chip details,
  rank display).
- Webhook retry observability dashboard.
- CI integration for the fixture suite.
- open_pack / apply_token / quick-sell / vault-midseason /
  destroy-vaulted integration tests (extend as needed when
  those fns get touched).

---

# Phase 12 batch — locked 2026-04-22

Feel Pass v1.6. Two phases built the mechanics (Phase 9 real-
game scoring) + the chrome (Phase 10 unified lineup view +
Event Feed). The diamond itself still sits static during live
play — events are narrated in the sidebar but the positions
don't react. Phase 12 closes that loop: the diamond reacts to
events in real time, and the status chip gets the narration
detail that ADR-0015 deferred ("has a Phase 11+ home").

Pure client-side work. No SQL, no migrations, no new cron,
no new integration tests (animations are hard to test
deterministically — same posture as the Event Feed itself).

---

## 21. Per-slot FP glow on the diamond

### Goal

Tie the Event Feed's narration back to the diamond visually.
When a `game_event` fires for a player rostered in a user's
lineup, the corresponding slot on the diamond briefly glows
with the FP delta: green halo + floating `+N.N` for positive,
red halo + `−N.N` for negative, nothing for zero. Quick,
additive feedback; doesn't replace the Event Feed — complements
it.

### Scope

- Single shared Realtime subscription at the `LineupView`
  level (currently lives in `EventFeed`). Lifted into a
  provider so both `EventFeed` and each `LineupSlot` read
  from the same event stream.
- Each `LineupSlot` subscribes to events for its slot's
  starter player and plays a short motion whenever the latest
  event's id changes.
- Bench slots do not glow (bench cards don't score during the
  contest).
- Post-submit only (glow requires `entryStatus IN ('live',
  'final')`). Building state: no events reaching the diamond.

### Behavior

**Visual (per slot):**

- **Halo:** 1200ms animation. Emerald-400 at 60% opacity for
  positive delta, `#C47262` at 60% for negative. Scales from
  the slot edge outward ~8px, fades to 0. Matches the motion
  envelope of the existing tier-up sparkle.
- **Floating delta:** `+3.0` / `−2.0` pill centered ~20px
  above the slot. Rises 16px, fades from 100% → 0% opacity
  over 1200ms. Monospace tabular-nums so multi-digit deltas
  don't shift layout.
- **Zero delta (strikeout looking, foul-out, etc.):** no
  animation. Event still appears in the feed.
- **Reduced motion:** skip the halo + float entirely. Event
  Feed remains the source of truth. (Matches the `prefers-
  reduced-motion` posture established in ADR-0011 / §10.)

**Event routing:**

- Provider maintains `latestByPlayerId: Map<playerId,
  FeedEvent>`. Updated on each Realtime INSERT that projects
  to a known lineup player.
- Each `LineupSlot` reads `useLatestPlayerEvent(playerId)`
  and animates on id change.
- Multiple events in quick succession on the same slot:
  the latest event wins — if a new event arrives while the
  prior animation is still playing, it replaces mid-flight.
  Don't queue. Latest narrative is what matters.

**Off-screen behavior:**

- Same as Event Feed today — the `/lineup` page can be
  backgrounded; animations play when the page is visible.
  Browser throttling handles the rest. No manual visibility
  hook needed.

### Acceptance

- [ ] Live game + test lineup: Meidroth walks → 2B slot
  halos green with `+2.0` briefly.
- [ ] Strikeout on a pitcher slot → glow is red with
  `−0.0` / nothing (decide: treat `0` as no-glow, match the
  Event Feed's grey-dash posture).
- [ ] Bench cards do not glow when their player's events
  fire (they're not in any slot's `starter_card_id`).
- [ ] Building / submitted / locked states: no glow (no
  events are reaching the diamond yet per policy).
- [ ] `prefers-reduced-motion: reduce` disables halo +
  float.
- [ ] Event Feed continues to work unchanged (same events
  feed it — both surfaces read from the shared provider).
- [ ] Rapid-fire events on the same slot don't stack (last
  one wins).

### Dependencies

- `eventFpDelta` + `eventActionLabel` (Phase 10) already
  compute the delta from event_type + play_type + role.
  Reused 1:1 — no new FP math.
- `createBrowserClient` (ADR-0015's split) already exists.
- `motion` (framer-motion) already in deps.
- Reduced-motion posture matches ADR-0011's existing
  global floor.

### Trade-offs

- **Shared provider, not a context lib like Jotai.** One
  `<LiveEventsProvider>` + a small `useLatestPlayerEvent`
  hook is enough; Jotai/Zustand would be overkill for a
  single stream.
- **No per-slot pulse for "same-side of play" events** —
  e.g., a pitcher giving up an HR doesn't glow the pitcher
  slot red. The event already projects with `role='pitcher'`
  via `eventFpDelta`, so the red glow happens naturally.
  Confirmed not a gap.
- **No sound.** Sound cue on positive FP is spec'd but
  parked again (same as ADR-0015). Phase 12 is visual-only.
- **Latest-wins, not queue.** Accepts that a rapid triple
  event sequence will only animate the last one. Feed is
  authoritative for the narrative.

---

## 22. Status chip enrichment — inning + games-active count

### Goal

The status chip currently reads "Live · Games in progress".
ADR-0015 deferred inning + games-active detail explicitly
("each has a Phase 11+ home"). Phase 12 is that home. The
chip should communicate *which* inning + *how many* of the
user's contest games are currently live.

### Scope

- `<StatusChip>` (in `LineupSidebar.tsx`) gets two new
  derived pieces of state:
  - `latestInning: { inning: number; half: 'top' | 'bottom' } | null` — derived from the same shared event stream that P12.1 lifts up. Latest event wins.
  - `gamesActive: number` — count of contest games in
    `status='live'` at load time. Updated via a Realtime
    subscription on `public.game` filtered to
    `contestGameIds`.
- Chip text becomes:
  - `entryStatus='live'` + inning known: `"Live · Top 5th · 3 games active"`
  - `entryStatus='live'` + no inning yet: `"Live · 3 games active"` (games started but no events yet)
  - `entryStatus='live'` + gamesActive=0: `"Live · Games ending"` (reconcile is about to fire)
  - `entryStatus='submitted' / 'locked' / 'final'`: unchanged from today.

### Behavior

**Inning formatting:**

- `"Top 5th"`, `"Bottom 3rd"`, `"Top 1st"`, etc.
- Ordinal suffixes: 1st/2nd/3rd, then *th*.
- `half` values from `game_event.inning_half` are `'top'` /
  `'bottom'` (schema); map to `'Top'` / `'Bottom'`.
- If multiple games are live and events are firing for both,
  the chip shows the most-recent-event's inning (not a
  max-innings calc). Simpler + matches what a fan expects
  (the chip narrates the most recent thing).

**Games-active derivation:**

- Initial fetch: `SELECT count(*) FROM game WHERE status='live'
  AND id = ANY($contestGameIds)` on page load. Lightweight
  client read via the browser Supabase client (RLS allows
  game rows to authenticated users).
- Realtime: subscribe to `public.game` UPDATE events for
  any of `contestGameIds`; when a row's status flips, recompute
  the count. Game table is not currently in the
  `supabase_realtime` publication — we'll add it in a tiny
  migration (0027). Same shape as the game_event migration
  0024.
- No backoff / no polling fallback. If Realtime drops, the
  count is stale until page refresh. Acceptable for a
  narration chip.

### Acceptance

- [ ] Pre-first-pitch: "Live · 3 games active" (or
  whatever the user's contest size is).
- [ ] First event fires → chip updates to include inning.
- [ ] Game finalizes (status → 'final') → count decrements;
  chip re-renders.
- [ ] All games final: "Live · Games ending" (matches
  reconcile-window perception).
- [ ] Pre-game / submitted states unchanged.
- [ ] Chip width doesn't jitter as inning changes
  (reserve space with `min-w` + tabular nums if needed).

### Dependencies

- Shared event provider from §21 exposes `latestInning` (a
  second consumer on the same stream — cheap).
- Migration 0027 adds `public.game` to `supabase_realtime`.
  No schema change; one `ALTER PUBLICATION` line.

### Trade-offs

- **Most-recent-event inning, not max-or-min across live
  games.** A pedant could prefer "furthest along", but the
  chip is narration, not scoreboard. Latest event = latest
  narrative.
- **No per-user score delta on the chip.** Already shown
  by the Live Score section above; redundancy adds noise.
- **No rank display yet.** ADR-0015 parked it ("needs
  leaderboard query extension") — still parked; low
  priority.
- **Realtime for game-status changes, not polling.** If the
  Realtime publication ever has a bug, the count goes stale.
  Worth the trade for the live feel.

---

## 23. Not in scope for v1.7

- Onboarding flow pass.
- Empty + error state sweep.
- Accessibility audit (WCAG 2.1 AA).
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on the status chip (needs leaderboard query
  extension).
- Webhook retry observability dashboard.
- CI integration for the fixture suite.
- Per-slot contract-depletion animation (a card losing a
  play should arguably tick its contract bar; deferred
  because it'd need another provider consumer + the `card`
  table isn't in the Realtime publication).
- Sound cue on positive-FP events (still parked per ADR-0015).

---

# Phase 13 batch — locked 2026-04-22

Feel Pass v1.7. Four related polish items, one unifying
theme: make the right sidebar the canonical "context" surface
everywhere + close the long-parked player-photo gap.

1. Kill the ZoomCanvas wrapper on the lineup page. The
   drag-pan-zoom mechanic from P8.3 never paid its keep;
   the diamond should just fit the viewport.
2. Bring the lineup's sidebar aesthetic to the collection
   page. Filters + count move above the grid; the sidebar
   gains a summary-stats default.
3. Clicking a card anywhere (lineup or collection, building
   or live) swaps the sidebar to a card-detail panel with a
   Back button. Replaces the `CardDetailDrawer`.
4. Real player profile photos on cards. Schema scaffolding
   has been in place since Phase 1 (`player.mlbam_id` +
   `player.photo_url` + `player.photo_synced_at`);
   Phase 13 activates it.

---

## 24. Lineup layout — remove ZoomCanvas, auto-fit diamond

### Goal

The `<ZoomCanvas>` from P8.3 added pinch-to-zoom + drag-to-pan
around the MLB positional diamond. It was meant to handle
small viewports and let users scan closer to a slot, but in
practice users don't want to pan — the diamond already fits
most desktop viewports at default scale, and the zoom
interactions are a friction layer on what should be a
point-and-click UI. Remove the wrapper; re-fit the diamond
to live in a simple flex box.

### Scope

- Delete `<ZoomCanvas>` usage from `<LineupShell>`.
- `DiamondGrid`'s grid columns become `minmax(80px, 1fr)` so
  slots shrink on narrow viewports down to a readable
  minimum (currently `minmax(96px, 1fr)`). Slot card size
  stays 96×134 at default; slots auto-center inside their
  grid cells. Below ~1040px diamond width, slots compress to
  ~88px; below ~900px, the page gains a horizontal scroll
  rather than a further compress — diamond identity is
  worth preserving.
- The zoom / fit / +/- control buttons go away entirely.
  No re-home needed; they were self-contained in
  `ZoomCanvas`.
- No change to the slot internals — drag/drop, glow,
  locking all carry forward unchanged.

### Behavior

- On any viewport ≥ 1040px wide: the diamond renders at its
  natural size, centered in the left pane.
- Between 900–1040px: slots compress to ~88×120 to keep the
  diamond visible without scroll.
- Below 900px: the diamond's parent pane keeps the diamond at
  natural 96×134 size and the whole left pane gains
  `overflow-x: auto`. The sidebar remains fixed 288px (`w-72`)
  since spec §11 doesn't support mobile yet.

### Acceptance

- [ ] `ZoomCanvas` removed from `LineupShell` imports + usage.
- [ ] The `ZoomCanvas.tsx` file itself stays in the repo for
  now (other pages might reuse it later; deletion is a
  follow-up if nothing imports it). Confirmed no other
  imports → ok to delete.
- [ ] Diamond fits at 1440/1280/1040 widths without scroll.
- [ ] At 900px width the horizontal scroll on the left pane
  appears without breaking the sidebar.
- [ ] All existing drag-drop + glow + slot-click behaviors
  still work.
- [ ] `src/components/lineup/ZoomCanvas.tsx` either deleted
  (preferred) or explicitly marked "unused — retained for
  future reuse" in a header comment.

### Trade-offs

- **Losing the zoom mechanic.** No sub-viewport platforms
  supported at launch; below 900px we scroll. When mobile
  lands (out-of-scope per spec §23), the revisit is a
  different layout (per-slot list?) not the ZoomCanvas.
- **Slot size does not shrink below 88×120.** Card art +
  tier frame stop being legible below that; the horizontal
  scroll is the lesser evil.

---

## 25. Unified sidebar pattern — collection page + card detail swap

### Goal

The lineup page's right sidebar reads cleanly — Live Score,
Box Score, Event Feed, Status Chip, each in a
`<SidebarSection>` card. Collection page currently has no
sidebar; filters + the "N / 250 cards" count live above the
grid. Align the two pages on a shared pattern:

- Collection page grows a right sidebar matching the lineup
  aesthetic. Default content: collection summary stats
  (total cards, career FP total, tier breakdown).
- Filters + count stay above the grid (no change there;
  they're already in the right place per spec).
- Clicking any card anywhere — collection, lineup slot,
  bench, live view — replaces the sidebar with a
  `<CardDetailPanel>` (the former `CardDetailDrawer`
  contents, chrome stripped) + a Back button at the top
  that restores the prior sidebar content.

### Scope

- **Extract `<CardDetailPanel>`** from `CardDetailDrawer`.
  Panel is the pure content (photo, tier frame,
  name/position, career FP, contract bar, action buttons).
  Drawer chrome is discarded; panel renders flush in a
  sidebar column.
- **`<SelectedCardSidebar>`** — wrapper that renders
  `<CardDetailPanel>` with a Back button bar at the top.
  The Back button calls `onBack()` which clears
  `selectedCardId`.
- **Lineup page wiring:**
  - `selectedCardId` state moves to `<LineupView>`.
  - `<LineupSidebar>` becomes conditional: if
    `selectedCardId`, render `<SelectedCardSidebar>`;
    otherwise render the existing building/post-submit
    tree.
  - Remove `<CardDetailDrawer>` usage from `<LineupView>`.
  - Click handlers on `LineupSlot` + `BenchCard` call
    `setSelectedCardId(id)` instead of the old
    `openDetail` drawer path.
- **Collection page:**
  - `<CollectionShell>` — new layout matching
    `<LineupShell>`: left pane (filters + count + grid),
    right sidebar (288px, matches lineup).
  - `<CollectionSidebar>` — renders
    `<CollectionSummaryStats>` by default, swaps to
    `<SelectedCardSidebar>` when a card is selected.
  - `<CollectionSummaryStats>` — new component. Three
    `<SidebarSection>` blocks:
    1. Overview: Total cards · Career FP total · Active
       contract cards.
    2. Tier breakdown: Diamond N · Gold N · Silver N ·
       Bronze N. Each row has a small tier-colored swatch.
    3. Contracts: expiring soon count (≤ 3 plays left),
       oldest card (earliest acquired), newest card.
- **Uniform session:** selecting a card on the lineup page
  should not bleed into the collection page (separate
  `selectedCardId` per-page). Just scope the state locally
  to each page's top-level component.

### Behavior

- Select → sidebar fully swaps to detail, Back returns.
- No animation on the swap (keeps it snappy; matches the
  spec §7 "instant UI" posture for navigational clicks).
  Could add a 200ms cross-fade in a follow-up if it reads
  jarring — parked as a nice-to-have.
- Back button: top-left of the detail panel, a small
  ←-arrow row with "Back". Consistent label on both pages.
- Action buttons in the detail panel (Extend Contract,
  Quick Sell, Apply Token, Vault) still work identically —
  they were already callbacks; just calling them from a
  sidebar column instead of a drawer.
- On the lineup page specifically: if the selected card IS
  the one currently being dragged, the detail view should
  not interfere with the drag operation. Detail state is
  separate from drag state; tested by keeping the drag
  handlers on `LineupSlot` and letting them run regardless
  of `selectedCardId`.

### Acceptance

- [ ] `<CardDetailPanel>` extracted; `<CardDetailDrawer>`
  reduced to a thin wrapper (or deleted if unused).
- [ ] Lineup page: clicking any card (lineup slot, bench)
  swaps the sidebar to detail with a Back button.
- [ ] Collection page: clicking any card swaps the sidebar
  from summary stats → detail with a Back button.
- [ ] `<CollectionSummaryStats>` renders correct counts
  against the seeded test account.
- [ ] Back button restores the correct default content on
  each page (building vs post-submit vs summary stats).
- [ ] All detail action buttons work end-to-end — Extend,
  Quick Sell, Apply Token, Vault.
- [ ] No visual regression on the existing sidebar sections
  (Live Score, Box Score, Event Feed, Status Chip).

### Trade-offs

- **Lineup page loses the live view during card detail
  browsing.** User must click Back to see score again.
  The Event Feed in particular was always on during
  live play; now it's behind a Back. Accepted trade per
  interview — "consistent everywhere, one pattern, no mode
  switching."
- **No cross-fade animation.** The sidebar swap is hard.
  If jarring in practice, we add a 200ms fade later.
- **Drawer → sidebar for card detail, but the sidebar is
  width-constrained (288px).** Some long card actions or
  extended narratives might wrap awkwardly. The panel
  contents were always designed for a constrained side
  column; re-audit during build.

---

## 26. Real player profile images on cards

### Goal

Cards currently show a silhouette + initials (spec §4.4
fallback). The schema has `player.mlbam_id`,
`player.photo_url`, `player.photo_synced_at` in place since
Phase 1. Phase 13 activates the pipeline + renders photos in
the card front.

### Scope

- **MLBAM id backfill** — an admin endpoint
  `/api/cron/mlbam-id-backfill` (CRON_SECRET-gated). Iterates
  `player` rows with `mlbam_id IS NULL`, hits the MLB Stats
  API search endpoint
  (`https://statsapi.mlb.com/api/v1/people/search?names={name}`)
  for each, disambiguates by team + first/last name match,
  writes `mlbam_id` on match. BDL doesn't expose MLBAM ids
  directly — this is the bridge.
- **Photo URL derivation** — deterministic given
  `mlbam_id`:
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/{mlbam_id}/headshot/67/current`
  (or the `midfield.mlbstatic.com` spots URL — either works,
  pick the faster-cached one). No separate `photo_url`
  column write needed initially — the URL is derivable at
  render time from `mlbam_id`. We keep `photo_url` as an
  override column for edge cases (photo temporarily wrong
  in MLBAM, we want to pin a specific asset).
- **Card rendering** — `<Card>` gets a `playerMlbamId` prop
  (added to `LineupCardVM` + downstream view-model types).
  Renders:
  - If `playerMlbamId`: `<img>` with the MLBAM URL +
    `onError` handler that swaps to the silhouette.
  - Else: silhouette + initials (existing fallback).
  - Photo area is circular, 48px on small cards (96×134
    card), 72px on medium, 96px on large. Positioned at
    the top-center of the card face, above the name.
- **Admin triggers** — no cron schedule. The backfill runs
  manually via `curl`:
  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    https://draftdeck.com/api/cron/mlbam-id-backfill | jq
  ```
  Runbook entry documents the flow. Re-run after any
  `bdl-roster-sync` that adds new players.

### Behavior

- **Image load failure** (404, network, etc.) → `onError`
  replaces `<img>` with the silhouette. Graceful degrade,
  no broken-image icon.
- **Privacy / licensing** — MLB's public headshot CDN is
  the same source fantasy sites use; no different
  licensing posture than current BDL usage. CLAUDE.md
  flags this as non-commercial for launch (F2P).
- **Cache policy** — images are CDN-cached aggressively.
  No app-level cache needed; browser + MLBAM CDN handle it.

### Acceptance

- [ ] `mlbam_id` backfilled for ≥ 95% of active 40-man
  players. Gap (5%) is acceptable — new callups or
  name-ambiguous players fall through to the next run.
- [ ] Card component renders MLBAM photo when
  `playerMlbamId` is set.
- [ ] Image load failure falls back to silhouette without
  flicker.
- [ ] Runbook documents the manual backfill command.
- [ ] Test account's lineup shows photos for all 10
  starters.

### Dependencies

- Schema already has the columns. No migration needed.
- `admin-reconcile` route is the precedent for CRON_SECRET-
  gated admin endpoints (`src/app/api/cron/admin-reconcile/route.ts`).
- MLB Stats API (`statsapi.mlb.com`) is publicly accessible;
  no key required. Rate limits are generous but we should
  batch with a ~200ms delay between calls to be polite.

### Trade-offs

- **MLB Stats API as the join source** — not BDL. BDL
  doesn't expose MLBAM ids. MLB Stats is the canonical
  source and gives us the right id with high confidence.
  Adds a dependency on a third-party endpoint, but it's
  run manually + one-time-ish, not on the critical path.
- **No local storage upload** — we serve MLBAM's CDN URLs
  directly. If MLB changes the URL pattern in the future,
  we need to update the renderer. Accepted risk; the URLs
  have been stable for 5+ years.
- **No bulk lookup endpoint** — MLB Stats API search is
  one-name-at-a-time. For ~1500 active players this is
  ~5 minutes of sequential calls. Runs manually + rarely;
  no need to parallelize.
- **Name disambiguation ambiguity** — two players named
  "Jose Ramirez" will need team-based match. If team is
  also ambiguous (traded mid-season), we pick the first
  MLB Stats API result + mark the row for manual review
  in logs.

---

## 27. Not in scope for v1.8

- Onboarding flow pass.
- Empty + error state sweep.
- Accessibility audit (WCAG 2.1 AA).
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on the status chip.
- Webhook retry observability dashboard.
- CI integration for the fixture suite.
- Per-slot contract-depletion animation.
- Sound cue on positive-FP events.
- Photo sync cron (daily/weekly schedule) — Phase 13 is
  manual admin trigger only. Scheduling is a later phase
  once we see how churn + new-player pace play out.
- Uploading photos to Supabase Storage. Phase 13 serves
  MLBAM CDN URLs directly.
- Card detail panel cross-fade animation.

---

# Phase 14 batch — locked 2026-04-22

Feel Pass v1.8. Three tied-to-recent-work polish items:

1. Close the P13 backfill match-rate debt. 76% → target 90%+
   via `hydrate=currentTeam` on the MLB Stats API call +
   fuzzy Levenshtein matching on residuals.
2. Cross-fade animation on the sidebar swap. ADR-0018's
   parked "decide by smoke" item — the abrupt snap reads
   more jarring than anticipated now that the pattern is
   used daily.
3. Per-slot contract-depletion glow — amber pulse when a
   slot's starter loses a play. Parked for two phases as
   natural sibling to P12's FP glow; enough signal now to
   ship.

---

## 28. Backfill match-rate improvement

### Goal

Raise the `player.mlbam_id` match rate from ~76% (Phase 13's
initial run) to ≥ 90%. Residuals are mostly two classes:

- **Mid-season trades.** `player.team_id` points at a stale
  team after a trade but before the next roster sync; team-
  based disambiguation fails for same-name collisions.
- **Name variants.** Middle-name insertion, nickname-as-first
  (`Alex` vs `Alexander`), compound surnames, typos.

### Scope

- **`hydrate=currentTeam` on MLB Stats API.** Default search
  response doesn't include team data; hydration populates it
  so disambiguation checks MLB's source-of-truth team.
- **Fuzzy-match fallback.** After exact + stripped passes
  fail, retry with Levenshtein ≤ 2 on both first AND last
  (normalized). Accept only single-candidate matches.
- **`?retry_failed=true` param.** Ignores the skip-attempted
  filter so the hardened matcher gets one more crack at the
  residual 187.
- **Response gains `strategies` counts.** `{ exact, stripped,
  fuzzy, team_disambiguated, ambiguous, unmatched }`.

### Acceptance

- [ ] Post-run, `unmatched_total` drops below 80 on active
  40-man.
- [ ] Response includes the `strategies` breakdown.
- [ ] Runbook updated with `?retry_failed=true`.

### Trade-offs

- **Fuzzy ≤ 2 can over-match short names.** Require
  exactly-one candidate post-fuzzy; otherwise ambiguous.
  Two false positives per ~500 retries acceptable (onError
  fallback catches them visually).
- **`hydrate=currentTeam` adds ~150ms per call.** Still
  under serverless timeout at `?limit=40`.

---

## 29. Cross-fade on sidebar swap

### Goal

`<SelectedCardSidebar>` replaces the default sidebar in a
single-frame snap. Gentle 200ms fade reads better.

### Scope

- Wrap the conditional sidebar branch in `<AnimatePresence
  mode="wait">` on lineup + collection pages.
- 200ms motion: opacity 0 → 1 + `y: 4 → 0` on enter,
  reverse on exit.
- `prefers-reduced-motion: reduce` skips.

### Acceptance

- [ ] Card click on both pages → visible 200ms fade.
- [ ] Back produces matching reverse fade.
- [ ] Reduced-motion kills the fade.
- [ ] No layout shift mid-fade.

### Trade-offs

- **`mode="wait"` sequences exit then enter** (~400ms
  total). If it reads slow, swap to `mode="popLayout"`.
- **Card-to-card within the sidebar doesn't fade.** Only
  mode transitions; same-mode swaps stay snappy.

---

## 30. Per-slot contract-depletion glow

### Goal

When a slot's starter loses a play, the slot pulses amber.
Sibling to Phase 12's FP glow; closes the "wait, my card
burned a play?" narrative on the diamond.

### Scope

- **Migration 0028** — `public.card` → `supabase_realtime`
  publication + `REPLICA IDENTITY FULL`. Mirrors 0027 for
  `game`.
- **`useCardContractEvents(cardIds)` hook** — subscribes to
  `public.card` UPDATEs, filters client-side to rostered
  ids, fires only when `new.contract_plays_remaining <
  old.contract_plays_remaining`.
- **`<SlotContractGlow>`** — amber halo (1000ms) + floating
  `-1 play` pill. Mirrors `<SlotFpGlow>`'s envelope.
- **Wire in `LineupSlot`** — renders alongside SlotFpGlow,
  same gates (post-submit, card present, reduced-motion).

### Behavior

- Reconcile decrements `contract_plays_remaining` →
  Realtime UPDATE → slot glows amber with `-1 play`.
- Color: amber `#D4A647` (matches contract-bar "low" warning
  color). Not red — play consumed is expected, not alarming.
- Multiple decrements in quick succession: each plays a
  fresh 1000ms (keyed on UPDATE timestamp).
- Composites cleanly with `<SlotFpGlow>` — both can fire on
  the same slot in the same tick.
- Building state: no glow (cards don't decrement).

### Acceptance

- [ ] Migration 0028 applied to prod.
- [ ] After a real game reconciles, the starter's slot
  glows amber with `-1 play`.
- [ ] No conflict with FP glow on the same slot.
- [ ] Building: no glow. Reduced-motion: no glow.

### Trade-offs

- **Separate Realtime channel from `<LiveEventsProvider>`.**
  Different table, different event, separate concern.
  Pattern matches `useGamesActive`.
- **`REPLICA IDENTITY FULL` on `card`** emits the whole
  row on UPDATE. `card` is a hot table; modest payload
  increase but fine at our scale.
- **Auto-sub backup decrement** won't glow (backup isn't on
  the diamond). Event Feed still narrates; acceptable.

---

## 32. Not in scope for v1.9

- Onboarding flow pass (next phase candidate).
- Empty + error state sweep.
- Accessibility audit (WCAG 2.1 AA).
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on the status chip.
- Webhook retry observability dashboard.
- CI integration for the fixture suite.
- Sound cue on positive-FP events.
- Manual-override column for unmatched MLBAM ids.
- Card-to-card cross-fade inside the selected-card sidebar.

---

# Phase 15 batch — locked 2026-04-22

Feel Pass v1.9. Three user-visible fixes — including one
surfaced by real use of the Phase 13 sidebar pattern — plus
the proper fix to the Phase 14 backfill ceiling.

1. Card detail in the sidebar overflows horizontally. The
   layout was designed for the old full-page drawer; Phase
   13 reused the component in a 288px sidebar without
   re-fitting. Screenshot confirmed the scroll.
2. Cards + tokens currently in a lineup still appear in the
   bench / tokens tray (dimmed, non-draggable). Users read
   those trays as "unused" — in-use items should drop out
   entirely with a counter acknowledging they exist.
3. MLBAM backfill is stuck at ~77% because MLB Stats API's
   `/people/search` filters to MLB-service-time players.
   `/api/v1/sports/1/roster/40Man?teamId=N` returns the
   full 40-man for a given team, MLBAM ids included — one
   call per team, 30 calls total.

---

## 33. Card detail view — sidebar-friendly layout

### Goal

The existing `<CardDetailView>` component renders at a
five-column max-w-5xl width with `<Card size="large">`
(320px). Phase 13 embedded it inside a 288px sidebar. The
horizontal scroll is visible + confirmed via screenshot.

### Scope

- `<CardDetailView>` always renders single-column. Drop
  the `md:flex-row` two-column split.
- `<Card>` in the detail view drops from `size="large"` to
  `size="medium"` (160×224) — fits cleanly inside the 288px
  sidebar with margin.
- Padding tightens: `gap-8 px-6 py-8` → `gap-4 px-2 py-3`
  to reclaim vertical space now that everything stacks.
- Action buttons + stats + tier progress + token history
  all remain — just stacked in one scrolling column.

### Behavior

- No content removed. Narrative stays the same — the
  change is purely layout density.
- The `/collection/[cardId]` page-level route is orphaned
  (nothing links to it) and still renders `<CardDetailView>`.
  It becomes a stack-of-content page too (fine on desktop
  at the narrower width).

### Acceptance

- [ ] Click a card on `/lineup` — detail sidebar fits
  without horizontal scroll at 288px.
- [ ] Click a card on `/collection` — same.
- [ ] Action buttons (Extend / Quick Sell / Vault / Remove
  from slot) visible and clickable.
- [ ] Tier progress bar + career FP still render legibly.

### Trade-offs

- **Medium card in a narrow column loses some "holding a
  card" moment** vs. the previous large card on a wide
  page. Trade for legibility. If the sidebar ever grows
  past ~320px we can revisit.
- **`/collection/[cardId]` page-level route inherits the
  compact layout.** One file for two contexts; acceptable
  since the route is orphan anyway — P15.2 redirects it.

---

## 34. Redirect orphan detail route

### Goal

`/collection/[cardId]` has been an orphan since Phase 13
(the sidebar pattern became canonical + nothing links to
the page). Keep the URL addressable for any bookmarks or
external links; redirect through to the sidebar pattern.

### Scope

- `src/app/(app)/collection/[cardId]/page.tsx` becomes a
  thin Server Component that calls
  `redirect(\`/collection?card=${cardId}\`)`. Existing data
  fetch + detail render code deleted.

### Acceptance

- [ ] Hitting `/collection/abc-123` redirects to
  `/collection?card=abc-123`.
- [ ] Redirect status 307 (temporary redirect — Next's
  default for `redirect()` from server components).

### Trade-offs

- **Losing a dedicated detail URL.** Deep-linking to a
  card's detail still works via `?card=<id>`; the old URL
  pattern just rewrites. Nobody loses anything.

---

## 35. Bench + tokens — hide in-lineup, show counter

### Goal

The bench tray displays all non-vaulted cards, including
ones currently in a slot (dimmed + non-draggable). User
feedback: that tray reads as "unused stuff" — having
in-use cards there is confusing. Same for tokens tray +
token applications.

### Scope

- **`<BenchDrawer>`** filters out any card whose id is in
  `assignedCardIds` (already wired as a prop). Previously
  the filter sorted them to the end; now it drops them.
- Header gains a secondary count: `Bench (12) · 4 in lineup`
  so users know their collection didn't shrink.
- **`<TokenTray>`** filters out any token whose id
  corresponds to an existing `token_application` for the
  current contest. Currently applied tokens show in the
  tray but can't be dragged; now they disappear.
- Header gains: `Tokens (3) · 2 in lineup`.

### Behavior

- Drag a card from bench → slot: card disappears from
  bench, counter increments (2 → 3).
- Remove from slot: card reappears in bench, counter
  decrements.
- Same pattern for tokens.
- Filters (Hitters/Pitchers/search on bench) apply after
  the in-lineup filter — counter always reflects the full
  set.
- Building state + post-submit state: same filter applies.
  Post-submit locked, drags don't work anyway, but the
  cleaner tray is the same improvement.

### Acceptance

- [ ] Cards in slots don't appear in the bench.
- [ ] Tokens applied to lineup cards don't appear in the
  tray.
- [ ] Counter chip reads accurately after drag/remove
  operations.
- [ ] Filter / search on bench operates on the reduced
  set.
- [ ] Locked state: counter still shown, no regression.

### Trade-offs

- **Loses visual confirmation that you own the assigned
  card.** Users who liked seeing "ghosted" cards in bench
  as a memory anchor lose that. Counter + the slot
  rendering is enough signal.
- **No dedicated "In lineup" view.** If users want to
  browse what they've committed, the diamond + sidebar
  detail is the surface. Not adding a third view.

---

## 36. MLBAM backfill via /sports/1/roster/40Man

### Goal

Raise the MLBAM id match rate from ~77% to effectively
100% of active 40-man players. MLB Stats API's
`/people/search` filters to MLB-service-time players,
which excludes ~23% of our 40-man records (callups,
recently optioned, on the 60-day IL, etc.). The
`/api/v1/sports/1/roster/40Man?teamId=N` endpoint returns
the full 40-man for a given team, MLBAM id included, with
no service-time filter.

### Scope

- **`/api/cron/mlbam-id-backfill`** rewritten. One call
  per team (30 teams × 1 call = 30 HTTP requests total,
  vs. per-player search). For each team's 40-man roster:
  - Match our `player` rows by `first_name + last_name`
    (normalized) + `team_id` join.
  - Write `mlbam_id` + `photo_synced_at` on match.
- **Ambiguous cases disappear.** Two "Jose Ramirez"
  players on different teams now resolve cleanly — each
  team's roster is scoped.
- **Fallback to the Phase 14 search-based matcher** for
  players not in any team's 40-man (e.g., released /
  retired in-season). Keep the fuzzy + team_disambiguated
  strategies for that fallback path.
- **Response shape** gains `roster_matched` + `fallback_matched`
  counters.
- **Query params:**
  - `?limit=N` — cap on how many teams to process
    (default 30, max 30). Each team's 40-man takes ~1–2s
    inclusive of the rate-limit sleep.
  - `?retry_failed=true` — same as Phase 14; ignores the
    `photo_synced_at IS NOT NULL` skip.

### Behavior

- Teams fetched in parallel-friendly but rate-limited way:
  sequential with 500ms between requests. ~15–30s total
  run.
- For each 40-man roster response:
  - For each person: `normalize(firstName) +
    normalize(lastName)` → look up `player` rows on that
    team. Match.
  - Team-scope prevents same-name collisions by construction.
- Players not matched after all 30 teams processed: fall
  through to the Phase 14 search matcher (single HTTP call
  per residual player, fuzzy + team strategies intact).

### Acceptance

- [ ] After a run, `unmatched_total` drops below 20
  (residual genuinely-unknown).
- [ ] Response includes `roster_matched` (from 40-man) +
  `fallback_matched` (from search) + `ambiguous` +
  `unmatched` + strategies.
- [ ] Idempotent — safe to re-run.
- [ ] Runbook updated.

### Dependencies

- MLB Stats API `/api/v1/sports/1/roster/40Man?teamId=N`
  is free + public.
- `public.team.bdl_team_id` or `team.abbreviation` — need
  a way to look up MLB Stats' teamId (which differs from
  both BDL's id and our own internal id). MLB Stats uses
  a canonical teamId (e.g., 108 = Angels, 119 = Dodgers).
  Add a lookup table — either a small JSON constant or
  derive via `/api/v1/teams?sportId=1` once.

### Trade-offs

- **Adds a one-time team lookup.** The MLB Stats teamId
  ↔ abbreviation map is ~30 rows. Shipping as a const
  (`src/lib/mlb/mlb-stats-team-ids.ts`) is simpler than a
  DB column.
- **Roster endpoint gives `team_id` indirectly** — the
  player row comes back with its current team implicit
  in the roster URL. We don't need to trust MLB's
  returned team field.
- **Still ~2 HTTP calls per player for the fallback
  path.** A handful; not a budget concern.

---

## 37. Not in scope for v1.9.5

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability dashboard.
- CI integration for fixture suite.
- Sound cue on positive-FP events.
- Auto-sub contract-depletion glow on bench cards.
- `retry_failed=true` offset pagination.
- `/collection/[cardId]` as a full-page experience (sidebar
  is canonical; route redirects).

---

# Phase 16 batch — locked 2026-04-22

Feel Pass v1.9.6. Two items:

1. Lineup-page shell: sidebar extends to viewport bottom,
   matching the collection-page shape. Bench + tokens strip
   narrows horizontally (loses ~288px) but stays in its
   current vertical position. Closes the last visual
   inconsistency between `/lineup` and `/collection`.
2. Roster-sync audit against MLB Stats. Phase 15's ADR-0020
   identified that BDL's `is_active_40_man` flag is stale
   for ~130 players; matcher is now correct but upstream
   data isn't. New `/api/cron/mlb-roster-audit` endpoint
   reconciles flags + team_ids against MLB's actual 40-man,
   then re-running the mlbam backfill unlocks the residual
   matches.

---

## 38. Lineup shell — full-height sidebar

### Goal

On `/lineup`, the right sidebar currently extends only down
to the top of the bench + tokens strip; the strip runs full
page width below. Collection-page sidebar runs the full
viewport height. Unify the two by letting the lineup sidebar
also extend to the bottom; bench + tokens become confined
to the left column (narrower by the sidebar width).

### Scope

- `<LineupShell>` restructure:
  - Main flex row grows to full remaining height (as today).
  - Left column becomes a vertical flex container holding
    `{diamond (flex-1) → bench (shrink-0) → tokens (shrink-0)}`.
  - Right sidebar fills full height of that row (as today
    it does horizontally, now also vertically relative to
    the main row — because it's in the same flex row the
    bench strip is no longer above/below).
- Bench + tokens render unchanged internally; they just sit
  inside a narrower containing column.
- The bench's horizontal-scroll already handles narrow
  widths — nothing to re-code.

### Behavior

- At ≥ 1040px viewport: sidebar is 288px (w-72); diamond +
  bench + tokens share the rest (min. ~752px).
- At ~900–1040px: diamond compresses first (spec §24 kept
  the 80px column min); bench gains horizontal scroll earlier.
- Below 900px: the existing `<main>` wraps with
  `overflow-auto`; sidebar may wrap below the left column
  if needed (unchanged from today's `md:flex` gate).

### Acceptance

- [ ] Sidebar visible from header bottom all the way to the
  viewport bottom at ≥ 1440px widths.
- [ ] Bench strip ends at the sidebar's left edge (no longer
  runs full page width).
- [ ] Tokens strip same.
- [ ] Diamond still fits + scrolls horizontally if compressed.
- [ ] Sidebar content still scrolls independently (important
  for the card-detail panel which can exceed viewport
  height).
- [ ] No regression to existing drag/drop, glow, slot click.

### Trade-offs

- **Bench loses ~288px of horizontal room.** At narrow
  viewports fewer bench cards fit at once; horizontal
  scroll compensates. Matches the aesthetic win.
- **Sidebar height is now unbounded by the bench above.**
  If detail content is short, the sidebar has more
  breathing room. If it's long, the sidebar scrolls (it
  already does). Either way cleaner than the cut-off
  behavior.

---

## 39. MLB roster audit — fix stale is_active_40_man + team_id

### Goal

Phase 15's ADR-0020 closed with an honest finding: the
~158-player residual from MLBAM backfill is a BDL roster-
sync staleness problem, not a matcher problem. Our cached
`is_active_40_man = true` flags are true for players MLB's
actual 40-man doesn't include, and our `team_id` can point
at a player's old team after a trade. Add an audit pass
that reconciles our flags against MLB Stats + gives us a
one-button fix before re-running the mlbam backfill.

### Scope

- **New endpoint** `/api/cron/mlb-roster-audit`,
  `CRON_SECRET`-gated. For each of the 30 teams:
  - Fetches `/api/v1/teams/{mlbStatsTeamId}/roster?rosterType=40Man&hydrate=person`.
  - Collects the MLBAM ids in the roster set.
- Global steps once all rosters fetched:
  - **Turn flags OFF** for players where
    `is_active_40_man = true` but their `mlbam_id` isn't in
    any of the 30 rosters AND their normalized name
    doesn't match any roster entry. Rationale: we might
    not have an mlbam_id yet for a player who IS on a 40-
    man; guard by name-fallback before flipping off.
  - **Turn flags ON** for players where `is_active_40_man
    = false` but they are in a 40-man roster (by mlbam_id
    or name match). Rare but handles re-callups where BDL
    is late.
  - **Refresh `team_id`** for any player whose matched
    roster belongs to a different team than `team_id`
    currently points to. Accepts the MLB Stats team as
    source of truth.
- **Players on MLB's 40-man but absent from our
  `public.player`**: log the count only. Creating those
  rows would drift our data model away from BDL's shape
  (we'd be missing BDL's per-player fields). Next
  `bdl-roster-sync` picks them up.

### Behavior

- Response shape: `{ teams_processed, flagged_off,
  flagged_on, team_refreshed, missing_from_our_db,
  unchanged }`.
- Idempotent: running it again after a clean run updates
  nothing.
- Re-running is cheap (30 HTTP calls).
- Must be invoked manually via `curl` with
  `Authorization: Bearer $CRON_SECRET`. No schedule
  (Vercel Hobby cron budget).

### Acceptance

- [ ] First run shifts ~100+ players via `flagged_off`
  (the P15 residual).
- [ ] Subsequent run shows 0 changes.
- [ ] Immediately after the audit, running
  `mlbam-id-backfill?retry_failed=true` drops
  `unmatched_total` close to 0 (now that the active set is
  correct).
- [ ] Runbook entry added.

### Dependencies

- `src/lib/mlb/mlb-stats-team-ids.ts` from Phase 15.
- Same `normalizeName` + `levenshtein` from
  `src/lib/mlb/name-match.ts`.
- No schema change.

### Trade-offs

- **MLB Stats as source of truth for the flag/team.** BDL
  remains source for row creation + per-player metadata
  (positions, heights, etc.); MLB Stats corrects
  operational state (is-on-40-man + current team).
- **Name-fallback before flipping off** is a safety — a
  player might genuinely be on a 40-man but we haven't
  backfilled their mlbam_id yet. If the name matches a
  roster entry, leave the flag on; if not, the player
  really isn't there.
- **No automatic mlbam_id backfill in the audit.** The
  audit only corrects flags/teams. Backfill remains a
  separate step so the responsibilities stay clean.

---

## 40. Not in scope for v1.10

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Auto-sub contract-depletion glow.
- Auto-creation of player rows missed by BDL sync.
- Scheduled roster-audit cron.
- Card detail URL sync on lineup page.

---

# Phase 17 batch — locked 2026-04-22

Feel Pass v1.10.1. One theme: close the 653-player data gap
identified by Phase 16's audit. Two deliverables:

1. Rewrite `bdl-roster-sync` to use BDL's `getPlayers` endpoint
   (no "active" filter) iterated per team. BDL's
   `getActivePlayers` — what the sync has always used — is
   narrower than MLB's 40-man; it filters out 60-day IL and
   recently-optioned players. `getPlayers({ team_ids: [N] })`
   returns everyone BDL knows on a given team.
2. Chain the P16 MLB-roster-audit into the same daily cron so
   `is_active_40_man` stays in sync automatically, not just
   when someone manually curls the audit endpoint.

---

## 41. Roster sync — use `getPlayers` per team

### Goal

Our `player` table under-populates MLB's active 40-man by
~653 rows (P16 audit). Root cause: `bdl.mlb.getActivePlayers`
filters to players "actively playing MLB games right now"
which excludes the 60-day IL + recently-optioned players
that ARE on the 40-man.

### Scope

- **New provider method** `fetchPlayersByTeam(teamBdlId)` on
  `MLBDataProvider`. Wraps `bdl.mlb.getPlayers({ team_ids:
  [N], per_page: 100, cursor })` via the existing
  `paginate` helper.
- **Rewrite `/api/cron/bdl-roster-sync`** to iterate teams
  (reference data upserted as today) and call the new
  per-team fetch. Upsert logic stays the same; existing
  `bdl_player_id`-keyed ON CONFLICT handles dedup.
- **Keep `fetchActivePlayers`** on the provider — other
  code paths may still want the narrower set (none today,
  but keeps the interface stable).
- **Response shape gains** `teams_processed` +
  `bdl_players_seen` counters alongside the existing
  `players_upserted` / `players_skipped`.

### Behavior

- Sync runs 30 `getPlayers` calls (one per team).
- Each call paginates until BDL's cursor is exhausted (the
  `paginate` helper handles this).
- Each player is upserted against our existing
  `bdl_player_id` unique index — so a player traded
  mid-season appears in BOTH team lists during the
  crossover window, but the second upsert just updates
  their team_id to the current one. Fine.
- Expected: ~1100–1300 `players_upserted` (matches or
  exceeds MLB's 1285 40-man count, since BDL may include
  minor leaguers too).
- Polite 200ms sleep between team fetches — ~6s added
  runtime.

### Acceptance

- [ ] Post-run, `player` row count grows by ~653 from the
  Phase 16 baseline.
- [ ] P16 audit's `missing_from_our_db` drops from 653 to
  near zero.
- [ ] `mlbam-id-backfill` post-run catches any newly-added
  players.
- [ ] No regression to existing webhook handlers,
  reconcile, or lineup queries.

### Dependencies

- BDL's `getPlayers` endpoint is documented in the SDK's
  MLBClient (reference/balldontlie-sdk-mlb-methods.d.ts
  line 8).
- `paginate` helper already supports cursor-based pagination.

### Trade-offs

- **30 HTTP calls vs. 1 streaming call.** `getActivePlayers`
  returned everything in one cursor-paginated stream; the
  new path is per-team. Net effect: modest runtime increase
  (~6s added) for a complete data set.
- **BDL minor leaguers show up too.** `getPlayers` returns
  everyone on the team, not just 40-man. Harmless —
  `is_active_40_man` flag is set from BDL's `active` field
  during upsert, which won't be true for minor leaguers.
  Extra rows cost ~2MB of DB storage; not a concern.
- **Still no 100% guarantee.** If a player is genuinely
  absent from BDL (edge case — someone MLB just added to a
  40-man and BDL hasn't caught yet), they remain missing.
  `mlb-roster-audit` surfaces this via
  `missing_from_our_db`. Soft gap per spec guidance.

---

## 42. Chain roster audit into daily cron

### Goal

P16 shipped the `mlb-roster-audit` endpoint as a manual
tool. Running it once closed the current drift, but future
drift accumulates until someone re-runs it. Chain it into
the daily sync so flag/team corrections happen
automatically.

### Scope

- Inside `/api/cron/bdl-roster-sync`, after the player-upsert
  loop finishes, call the same logic
  `mlb-roster-audit` uses (extracted to a shared helper).
  Fetches MLB Stats rosters, reconciles flags, refreshes
  teams, counts missing-from-our-db.
- Extract the roster-audit core logic to
  `src/lib/mlb/roster-audit.ts` so both the standalone
  endpoint AND the daily cron call the same code path.
- Response shape of `bdl-roster-sync` gains an `audit`
  sub-object with the P16 audit's counts.
- Standalone `/api/cron/mlb-roster-audit` endpoint stays
  (keeps the on-demand manual path).

### Behavior

- Daily sync now takes ~45s total (30 BDL team calls +
  30 MLB Stats team calls + player UPDATEs). Still well
  under the 60s Vercel limit.
- Order: BDL sync first → then audit. Audit runs AFTER
  new rows land so it sees them.
- If the audit step fails, the sync still succeeds;
  failure is logged + returned in response but doesn't
  tear down the whole cron.

### Acceptance

- [ ] After one daily run, `missing_from_our_db` is stable
  (no regression).
- [ ] Audit's `flagged_off` + `flagged_on` stabilize near
  zero on subsequent daily runs (steady state).
- [ ] Manual `mlb-roster-audit` endpoint still works.

### Trade-offs

- **Longer cron runtime.** ~45s vs. ~20s today. Fits the
  budget; not a concern.
- **Single point of failure — but audit step is optional.**
  Wrapped in try/catch so a bad MLB Stats response
  doesn't kill the BDL sync. We take the sync progress +
  skip the audit on that run.
- **Cron fire-and-forget — no alert on drift yet.** If
  `missing_from_our_db` trends up between runs, nothing
  alerts. Future observability work; not this phase.

---

## 43. Not in scope for v1.10.1

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability dashboard.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Auto-creation of MLB-only rows (schema relax) — deferred
  until we see how often BDL genuinely misses 40-man.
- Alerting on drift (`missing_from_our_db` threshold).
- `retry_failed=true` offset pagination.

---

# Phase 18 batch — locked 2026-04-22

Feel Pass v1.11 — Gameplay Legibility. Five items that make
the live-contest surface actually playable:

1. **Per-slot lock model.** Individual slots lock when
   their player's game starts, not the whole lineup at
   once. Users can still edit later-starting slots after
   earlier ones have gone live.
2. **Game-state visualization on each slot.** Pre-game /
   live / final indicator plus opponent + time / score.
3. **Live FP on the card face** during live and final
   contests (currently always shows career FP).
4. **Event feed gains game start + game end + token
   trigger narration.**
5. **Box Score rows show game state** so the right sidebar
   reflects the same context as the diamond.

---

## 44. Per-slot lock model

### Goal

Current behavior: contest goes through `building →
submitted → locked → live → final`; `locked` kills edits
for every slot simultaneously. User feedback: that's too
coarse. A slot whose player's game starts at 10 PM should
stay editable until 10 PM even if another slot's game
went live at 7 PM.

### Scope

- **Contest status simplified** to `building → submitted
  → live → final`. Drop `locked` as a distinct state — it
  was always the step between "submitted" and "first
  game starts" and serves no purpose once per-slot lock
  lands.
- **Per-slot lock is a derived predicate**, not a DB
  column:
  - Locked ⟺ the slot's player's game exists AND
    `now() >= game.scheduled_start_time` (or
    `game.status IN ('live','final')`).
  - Unlocked ⟺ no game found OR game still 'scheduled'
    and start time is in the future.
- **Server Actions check per-slot lock** before mutating:
  - `updateLineupSlot`, `swapLineupSlots`, `applyToken`,
    `removeToken` — reject with `SLOT_LOCKED` if the
    target slot's game has started.
  - The SQL fns gain a `is_slot_locked(slot_id)` helper.
- **`submitLineup` still required** to enter the contest
  (full 10 slots). After submit, per-slot edits allowed
  until each slot's game start.

### Behavior

- Drag-drop / click-to-remove / apply-token on an
  **unlocked** slot works post-submit identically to
  building state.
- Locked slots: drag source disabled (visual lock
  indicator), drop target rejects with toast (`SLOT_LOCKED:
  This player's game has started`).
- Swap between two slots: both must be unlocked. One
  locked → toast rejection.

### Acceptance

- [ ] Contest status enum collapses to 4 values.
- [ ] `updateLineupSlot` rejects `SLOT_LOCKED` when the
  target slot's game has started.
- [ ] Lineup UI visually locks a slot once its game goes
  live; other slots remain editable.
- [ ] Submit flow unchanged: 10 filled slots required
  before the contest entry is "submitted."
- [ ] Integration test covering per-slot lock added to
  `tests/integration/lineup.test.ts` (new file, or
  extend reconcile test suite).

### Trade-offs

- **Derived state vs. a per-slot column.** Computing on
  read means zero writes but an extra join per action.
  Acceptable — the action path already touches game for
  other reasons.
- **Loses the "locked" narrative moment.** The chip that
  says "Locked · Games starting" after submit disappears;
  becomes "Live · (N games active)" at the moment the
  first game starts. Trade for flexibility.

---

## 45. Game-state visualization on slots

### Goal

Users cannot currently tell whether a slot's player is
pre-game, live, or final just by scanning the diamond.
Management decisions (swap, token) require that info.

### Scope

- **New slot-footer line** under each LineupSlot, below
  the existing `remove` link. Shows three states:
  - **Pre-game:** `vs LAD · Fri 7:10p` (home) or
    `@ LAD · Fri 7:10p` (away). Color: muted grey.
  - **Live:** `LIVE · T5 · 2-1` (inning + current score).
    Color: emerald.
  - **Final:** `FINAL W 5-2` (win or loss + final score).
    Color: neutral.
- **Data source:** a per-contest game fetch that joins
  `public.game` to the starter card's `player.team_id`.
  Included in the lineup page's `LineupViewProps`.
- **Fallback:** no game scheduled today → no footer line.

### Behavior

- Updates via existing `game` Realtime publication
  (migration 0027 already added the table). When a game
  goes `scheduled → live` or `live → final`, the slot
  footer re-renders.
- Inning / score updates piggyback on the game UPDATE
  events too (if the webhook handler sets them).
- Reduced-motion: no animation on state transitions —
  direct text swap.

### Acceptance

- [ ] Slot footer shows the right state for pre/live/
  final.
- [ ] Opponent abbreviation + time in pre-game state.
- [ ] Inning + score in live state.
- [ ] Win/loss + final score in final state.
- [ ] Updates reactively via Realtime game UPDATEs.

### Trade-offs

- **Vertical growth: ~14px per slot.** Diamond grid stays
  readable; total page height grows by ~14px in the
  bench + tokens row area. Acceptable.
- **One slot = one game assumption.** A player in a
  doubleheader day has two games; we show the next-
  scheduled one. Fine for launch.

---

## 46. Card FP during live / final contests

### Goal

During live play, the card still shows career FP ("0 FP"
for Schanuel despite live 3.0 FP scored this contest).
Users expect the card to reflect today's contribution.

### Scope

- `LineupCardVM` gains `contestFp?: number | null`. When
  set, the Card footer shows it instead of career FP —
  with a distinct visual treatment (italic or different
  color) so it reads as "contest-scoped."
- Building state: `contestFp` is null, card shows career
  FP as today.
- Submitted / live / final: `contestFp = slot.liveFp +
  slot.finalFp` (the same sum the Box Score uses).

### Acceptance

- [ ] Card footer shows career FP in building state.
- [ ] Card footer shows contest FP (live or final) in
  submitted/live/final states.
- [ ] Small visual marker distinguishes the two (e.g.,
  label "FP" for career, "LIVE" or "FINAL" abbrev for
  contest).

### Trade-offs

- **Card gains a new state.** Keeps the component's
  public API stable via an optional prop (`contestFp`);
  null behavior is unchanged.

---

## 47. Event Feed — game start, game end, token triggers

### Goal

The feed currently narrates only per-player batting /
pitching events. Users asked for broader contest context:
game starts, game ends, token triggers / misses.

### Scope

- **Game start / end narration.** When a game in
  `contestGameIds` transitions `scheduled → live` or
  `live → final`, emit a FeedEvent with copy:
  - Start: `⚾ Mets @ Dodgers · First pitch`
  - End: `⚾ Mets @ Dodgers · Final 5-2`
- **Token triggers.** When a `token_application.triggered`
  flips from null to true/false (reconcile sets this),
  emit a FeedEvent:
  - Triggered: `🪙 QS bonus hit · Skubal +8 FP`
  - Missed: `🪙 QS bonus missed · Skubal`
- **New Realtime subscription:** `token_application`
  UPDATEs. Needs migration 0029 — add to
  `supabase_realtime` publication + `REPLICA IDENTITY
  FULL`.

### Behavior

- `LiveEventsProvider` subscribes to three channels now:
  - `game_event` INSERTs (existing)
  - `game` UPDATEs (existing from Phase 12)
  - `token_application` UPDATEs (new)
- Game start/end events are synthesized client-side from
  `game` UPDATE payloads — no server-side event row
  needed.
- Token trigger narration uses
  `token_application.{triggered, bonus_fp_awarded}` from
  the UPDATE payload.
- No inning-switch events (spec §47 omits to match user
  answer).

### Acceptance

- [ ] Feed shows a start line when first game goes live.
- [ ] Feed shows an end line when last game goes final.
- [ ] Feed shows token fire/miss when reconcile resolves
  a token application.
- [ ] Migration 0029 applied (token_application in
  Realtime publication).
- [ ] Existing player-event narration unchanged.

### Trade-offs

- **Three Realtime channels open.** Minimal websocket
  overhead; Supabase handles channel multiplexing.
- **Token triggers require the token_application table
  in the publication.** That table is owner-scoped via
  RLS, so Realtime authorizes per-user. Fine.

---

## 48. Box Score — game state per row

### Goal

The right sidebar Box Score lists each slot's FP. Users
want the game-state context surfaced here too, matching
the new slot-footer line.

### Scope

- Each row gains a small state chip after the position
  label: `[1B] PRE`, `[1B] LIVE T5`, `[1B] FINAL`.
- Chip color matches the slot footer palette (muted
  grey / emerald / neutral).
- No inning / score detail — that's for the slot footer
  + status chip. Box Score stays compact.

### Acceptance

- [ ] Each row shows the chip.
- [ ] Chip matches the slot footer's state in sync.
- [ ] No layout shift when state updates.

### Trade-offs

- **Mild clutter.** Counterbalanced by giving the user
  all the in-progress / final info they need without
  leaving the sidebar.

---

## 49. Not in scope for v1.11

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Inning-switch events in the feed (user's interview
  choice — feed stays cleaner).
- Doubleheader second-game handling (single-game per
  day assumption).
- Auto-creation of MLB-only rows (still deferred).
- Drift alerting on `missing_from_our_db`.

---

# Phase 19 batch — locked 2026-04-22

Feel Pass v1.11.1. Three slate-robustness fixes surfaced by
Phase 18 smoke testing:

1. **Slate-date timezone.** `create_daily_contest(CURRENT_DATE)`
   uses the Postgres server's UTC date; rolls over at 8 PM ET.
   Between 8 PM ET and midnight ET, the lineup page shows
   tomorrow's (empty) slate while tonight's games are still
   playing.
2. **Stale `included_game_ids`.** Fn caches the game set at
   contest-creation time. If BDL's schedule-sync adds games
   AFTER the contest is first created that day, the contest
   doesn't pick them up.
3. **`scheduled_start` is always NULL** because BDL doesn't
   expose game start times. Pre-game slot footer shows "TBD"
   and the backup lock predicate (`now() >= scheduled_start`)
   never fires.

---

## 50. Slate date with 4 AM ET rollover

### Goal

Contest date is "today" from the perspective of MLB fans —
late-night games on the West Coast that end 1 AM ET should
still count as "last night's slate" until the next morning.
DraftKings / FanDuel MLB convention: 4 AM ET rollover.

### Scope

- New SQL helper `public.current_slate_date()` returning the
  ET-aware slate date with 4 AM pivot:
  ```sql
  (now() AT TIME ZONE 'America/New_York' - INTERVAL '4 hours')::date
  ```
- `create_daily_contest` default changes from `CURRENT_DATE`
  to `public.current_slate_date()`.
- `src/app/(app)/lineup/page.tsx` stops passing `CURRENT_DATE`
  explicitly; lets the fn default do the right thing.
- Constant exposed in `src/lib/mlb/slate.ts` so client-side
  code (e.g., UI copy about "tomorrow's slate") derives the
  same value.

### Acceptance

- [ ] At 7 PM ET Apr 22: slate date = Apr 22 ✓
- [ ] At 10 PM ET Apr 22: slate date = Apr 22 ✓ (not 23)
- [ ] At 2 AM ET Apr 23: slate date = Apr 22 ✓ (late-night
      games still on "tonight's" slate)
- [ ] At 5 AM ET Apr 23: slate date = Apr 23 ✓ (rolled over)
- [ ] Previously-created contests stay on their original
      dates — idempotent lookup still finds them.

### Trade-offs

- **4 AM ET is an opinionated choice.** If the user wants a
  different pivot, change the `INTERVAL '4 hours'` constant.
  Not exposed as config (overkill for the phase).
- **Users in other timezones see the slate in ET.** Fine for
  MLB-centric product; revisit if we ever add NBA/NFL.

---

## 51. `create_daily_contest` refreshes included_game_ids

### Goal

When `bdl-games-prefetch` or `schedule-sync` picks up a new
game for today AFTER the daily contest has already been
created, the contest's cached `included_game_ids` doesn't
update. Fix: recompute on every call.

### Scope

- `create_daily_contest` fn body: after the reuse-existing
  lookup, re-query games for the contest date + `UPDATE` the
  contest row's `included_game_ids` if the set changed.
- Kept idempotent — same inputs + same game set = no-op UPDATE.
- `bdl-games-prefetch` cron already calls `create_daily_contest`
  after syncing schedule; this change makes that call actually
  refresh the cache.

### Acceptance

- [ ] Create a contest for today with N games.
- [ ] Insert a new game for today directly.
- [ ] Re-call `create_daily_contest(today)` → contest's
      `included_game_ids` now includes the new game.
- [ ] No-op case (no new games) doesn't churn the row's
      updated_at unnecessarily (use `WHERE included_game_ids
      IS DISTINCT FROM new_set`).

### Trade-offs

- **Refresh-on-every-read is chatty.** `lineup/page.tsx`
  calls `create_daily_contest` on every page load; the
  query + potential UPDATE runs every time. Cheap (index on
  `game.date`) but worth noting.
- **No back-reference from game → contest.** We can't
  incrementally invalidate. Full recompute is simplest.

---

## 52. scheduled_start populated via MLB Stats API

### Goal

BDL's `MLBGame` type doesn't expose game start times. Pull
from MLB Stats API's `/api/v1/schedule?date=X&sportId=1`
during the same schedule-sync pass; map by MLBAM game id.

### Scope

- New helper `fetchMlbStatsSchedule(date)` in
  `src/lib/mlb/mlb-stats-schedule.ts`. Hits
  `statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD`,
  returns an array of `{ mlbamGameId, scheduledStart: ISO }`.
- `syncScheduleHorizon()` augmented: for each date, after the
  BDL fetch pass, also call `fetchMlbStatsSchedule(date)` and
  UPDATE `public.game` rows by… **we don't have a `game.mlbam_id`
  column.** Match by (date, home_team_mlbam_id, away_team_mlbam_id)
  via the `player`-side MLBAM map; OR via team abbreviation +
  date.
- Alternative match key: MLB Stats teamIds (from the Phase 15
  `MLB_STATS_TEAM_IDS` map) + date. Simple + reliable.
- Schedule-sync summary response gains a
  `scheduled_starts_updated` counter.

### Acceptance

- [ ] Post-run, today's + tomorrow's games have
      `scheduled_start IS NOT NULL` for every scheduled
      game.
- [ ] Pre-game slot footer shows `vs LAD · 7:10p` instead
      of `TBD`.
- [ ] Schedule-sync summary includes the counter.

### Trade-offs

- **Two HTTP calls per date now (BDL + MLB Stats).** Polite
  sleep between them; ~1s added runtime per date. Still
  under the 60s Vercel limit for 2-day horizon.
- **Team-abbreviation match instead of mlbam_id match.**
  Safer than adding a new column; Phase 15's team-id map
  covers 30 teams + aliases.
- **MLB Stats API is free + public.** Same source Phase 15
  uses for the 40-man roster. No new dependency.

---

## 53. Not in scope for v1.11.1

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Live inning tracking on `game` row (still blocked on
  BDL data + webhook handling).
- contest_entry_status enum collapse (Phase 18 open item).
- Configurable slate-pivot hour via env var.
- Non-ET timezones.

---

# Phase 20 batch — locked 2026-04-22

Feel Pass v1.12 — Live-Inning Legibility. Three open items
from Phase 18+19 cleaned up together:

1. **Live inning on the `game` row.** Webhook handler
   already sees `play.inning` / `play.inning_half` on every
   batter event but only writes to `game_event`; slot
   footer has been showing "LIVE · 2-1" without inning.
2. **Doubleheader / duplicate-game display.** Two games
   on the same matchup + date collapse to one arbitrary
   row in our lookup Map. Sort + dedup so the most-relevant
   game surfaces.
3. **`contest_entry_status` enum cleanup.** Drop the
   vestigial 'locked' value (zero rows at it in prod).

---

## 54. Live inning on the `game` row

### Goal

Enrich the `<SlotGameState>` LIVE footer from "LIVE · 2-1"
to "LIVE · T5 · 2-1" by tracking inning on the `game` row
itself. Webhook handler fires the updates.

### Scope

- **Migration 0032** adds two columns to `public.game`:
  - `current_inning integer` (nullable; 1-15+ during play,
    NULL when scheduled / final)
  - `current_inning_half text` with a CHECK constraint
    allowing only `'top'` / `'bottom'` / NULL.
- **Webhook handler** (`src/lib/mlb/webhook-handler.ts`
  `handleGameEvent`): after inserting the `game_event`
  row, also UPDATE the game row's inning columns.
  Idempotent via `IS DISTINCT FROM` — no Realtime broadcast
  when the value hasn't changed.
- **`handleGameEnded`** resets inning columns to NULL
  (final games show "FINAL" without trailing inning).
- **`handleGameStarted`** sets `current_inning = 1,
  current_inning_half = 'top'` if not already populated by
  a prior event.
- **`<SlotGameState>`** LIVE branch reads the new fields
  via `SlotGameInfo` + renders ordinal when present.
- **`<StatusChip>`**'s "Live · Top 5th · 3 games active"
  copy already uses the event-stream `latestInning` — keep
  that path; the `game` columns are game-scoped (per-slot)
  while StatusChip is contest-scoped (aggregate).
- **Lineup page query** extends the game SELECT to pull
  `current_inning` + `current_inning_half` into
  `slotGameByCardId`.

### Behavior

- Game scheduled → `current_inning = NULL`. Slot footer:
  `vs LAD · 7:40p`.
- Game starts → handler sets `(1, 'top')`. Slot footer:
  `LIVE · T1 · 0-0`.
- Batter events fire → inning values update as the game
  progresses. Slot footer: `LIVE · B5 · 2-1`.
- Game ends → handler clears to `NULL` + `NULL`. Slot
  footer: `FINAL W 5-2`.

### Acceptance

- [ ] Migration 0032 applied locally + prod.
- [ ] Live slot footer renders `T5` / `B5` where appropriate.
- [ ] Values reset to NULL on game end; FINAL footer shows
      no trailing inning.
- [ ] Realtime UPDATE from the game row reaches the
      client subscriber (already in publication per Phase 12).
- [ ] StatusChip still reads inning from the event stream —
      unchanged.

### Trade-offs

- **Per-event UPDATE has write amplification.** ~50
  batter events per game × 30 games = 1500 UPDATEs per
  live night. All idempotent via IS DISTINCT FROM, but
  Postgres still touches the row. Acceptable at our scale.
- **Two inning sources** (this column + event stream) —
  Spec §21 still derives the Status-Chip inning from
  events. Keeping them separate is fine; they answer
  different questions.

---

## 55. Doubleheader + duplicate-game dedup

### Goal

When two `game` rows share the same (date, home_team,
away_team) — either a real doubleheader or a BDL data
duplicate — our lineup-page Map collapses to one
arbitrarily. Fix: surface the most-relevant game with a
deterministic priority.

### Scope

- **Priority:** per matchup + date, pick one game via:
  1. Live > scheduled > final (by status).
  2. Within status, prefer earliest `scheduled_start`
     (NULLS LAST).
  3. Fallback: earliest `created_at`.
- **Implementation:** change the lineup-page game query
  from a plain `SELECT` + in-memory Map overwrite to a
  `SELECT DISTINCT ON (home_team_id, away_team_id)` with
  `ORDER BY` matching the priority.
- **Sort keys:**
  ```sql
  ORDER BY
    home_team_id, away_team_id,
    CASE status WHEN 'live' THEN 0
                WHEN 'scheduled' THEN 1
                WHEN 'final' THEN 2
                ELSE 3 END,
    scheduled_start NULLS LAST,
    created_at
  ```
- **No schema change.** Phase 20 handles the display
  side; real DH support (second-game surfacing,
  unique-index preventing dupes) remains parked for when
  it matters.

### Acceptance

- [ ] Today's LAA@TOR duplicate shows exactly one slot
      footer (not two merged state).
- [ ] If a live game + a scheduled DH2 exist for the same
      team, the live one shows (per priority).
- [ ] After DH1 finalizes + DH2 goes live, DH2 shows.

### Trade-offs

- **Second DH game is invisible post-dedup.** Until we
  surface both, users lineup'ing a DH2-only player will
  see `FINAL W` from DH1 in their footer while their
  actual game is still scheduled. Rare edge case; flag
  in ADR as known.
- **No schema change** keeps the dedup logic local to
  the page query. Easy to evolve if we add a
  `game_number` column later.

---

## 56. `contest_entry_status` enum cleanup

### Goal

The 'locked' value on `contest_entry_status` was retired
in Phase 18 (per-slot lock replaced contest-level lock).
Zero rows at 'locked' in prod. Drop it from the enum.

### Scope

- **Migration 0033**:
  1. Create new enum `contest_entry_status_v2` as
     `('building', 'submitted', 'live', 'final')`.
  2. `ALTER TABLE public.contest_entry ALTER COLUMN status
      TYPE contest_entry_status_v2 USING status::text::contest_entry_status_v2`.
  3. Drop old enum.
  4. Rename new enum to `contest_entry_status`.
- **SQL fn cleanup:** `update_lineup_slot`,
  `swap_lineup_slots`, `apply_token`, `remove_token`
  conditions drop 'locked' from the `IN (...)` lists
  (harmless to keep, but cleaner without).
- **TypeScript type cleanup:** `EntryStatus` type in
  `LineupSidebar.tsx` + `LineupViewProps.entryStatus` in
  `types.ts` drop the `'locked'` union member.

### Acceptance

- [ ] Migration applied. Enum now has 4 values.
- [ ] Typecheck passes after union narrows.
- [ ] No runtime code references `'locked'` as a state.

### Trade-offs

- **Breaking-change for anyone holding a pre-migration
  client.** Since we're F2P single-user testing, not a
  concern. New deploy ships right after migration.
- **Enum rebuild is slightly heavier than simple DROP
  VALUE** (which Postgres doesn't support). Accepted.

---

## 57. Not in scope for v1.12

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Full doubleheader support (second-game surfacing,
  unique index on matchup + game_number).
- Outs / baserunners on `game` row (deliberately capped at
  inning only).
- Pitch count / pitcher on mound.
- Auto-transition of contest_entry.status (submitted → live).

---

# Phase 21 batch — locked 2026-04-22

Feel Pass v1.12.1 — Bench Legibility. Phases 18+20 put
rich game-state info on every lineup slot (matchup, time,
live inning, final score). The bench — where users
actually pick who to start — stayed information-bare.
This phase closes the gap.

---

## 58. Bench cards show game state + OFF indicator

### Goal

Bring the `<SlotGameState>` line from the lineup diamond
down to the bench. Every bench card shows whether its
player has a game today, when it starts (or what inning
they're in), and its final result. Cards with no game
in today's contest surface a muted `OFF` indicator so
users know at a glance those aren't actionable tonight.

### Scope

- **`<BenchCard>` renders a footer line below the existing
  stats row.** Same `<SlotGameState>` component used by
  `LineupSlot` (polish spec §45 + §54), driven by the same
  `slotGameByCardId` map the lineup page already computes.
- **New `SlotGameState` "off-day" branch:** when `info` is
  null AND the bench card is being rendered, show a muted
  `OFF` label. When `info` is null on a lineup slot, we
  continue to render nothing (no contest games for that
  player — either their team's not in the slate or we
  lack schedule data; showing `OFF` there would be
  redundant with the lineup-slot layout).
- **`<BenchDrawer>` threads `slotGameByCardId`** from
  props into `<BenchCard>` per card.

### Behavior

- Pre-game bench card: `vs LAD · 7:40p` muted grey.
- Live bench card: `LIVE · T5 · 2-1` emerald.
- Final bench card: `FINAL W 5-2` neutral.
- Off-day bench card: `OFF` (single short word, dim).
  Card remains draggable (user can still roster for
  future days).
- Card height grows ~14px. Bench tray remains
  horizontally scrollable.

### Acceptance

- [ ] Pre-game bench card shows the matchup + start time.
- [ ] Live bench card shows LIVE + inning + score (same
      as slot).
- [ ] Final bench card shows FINAL W/L + score.
- [ ] Off-day card shows `OFF` in muted tone.
- [ ] Card click (to open detail) still works.
- [ ] Drag behavior unchanged.

### Trade-offs

- **Bench grows taller by ~14px.** Acceptable — the
  horizontal-scroll bench strip has vertical headroom in
  the Phase 16 left-column layout.
- **`SlotGameState` `variant="off"` is mildly special.**
  A render branch just for bench; easy to maintain.

---

## 59. Bench sort by game state

### Goal

Currently alphabetical. Post-§58, the user wants
actionable players first — the ones whose games haven't
started yet and who can still be rostered for tonight.

### Scope

- **`<BenchDrawer>` sort** in the `filtered` memo changes
  to a priority-ordered sort:
  1. **Pre-game**, earliest `scheduledStart` first.
  2. **Live**.
  3. **Final**.
  4. **Off-day** (no game today).
  Within each bucket: alphabetical by player name.
- The `assignedCardIds` filter (cards in a slot don't
  appear in bench — Phase 15) stays; sort operates on
  the filtered set.
- Hitters / Pitchers filter chips + search continue to
  work; they filter THEN sort.

### Behavior

- User with 20 bench cards: pre-game players cluster at
  the left edge. Live players next. Final + OFF cards
  trail right. Horizontal scroll still works.
- Sort is stable within each bucket — cards don't shuffle
  as minute-by-minute game-time passes.

### Acceptance

- [ ] Pre-game players appear first in the bench row.
- [ ] Within pre-game, earliest-start is leftmost.
- [ ] Live players appear after all pre-game.
- [ ] Final players after live.
- [ ] Off-day players last.
- [ ] Alphabetical within each bucket.
- [ ] Filter chips + search still work (filter → sort).

### Trade-offs

- **Priority-sort replaces alphabetical.** Users who
  learned "my favorite is around position 8 in the bench"
  have to relearn. One-time adjustment; the priority sort
  is more useful for the actual decision moment.

---

## 60. Collection page stays schedule-agnostic

### Goal

Explicitly scoped OUT. Collection is "all your cards"
regardless of today's contest. Game-state info there
would be noise.

### Scope

- No changes to `<CollectionGrid>` or
  `<CollectionSummaryStats>`.
- Card detail (opened from collection) still shows
  schedule-sensitive info when applicable — that part is
  independent.

---

## 61. Not in scope for v1.12.1

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Bench filter chips for game state (could layer on top
  of the sort; not needed yet).
- Collection page "Has game today" filter (deferred).
- Full doubleheader support.
- Outs / baserunners.
- contest_status enum cleanup (parallel to 0033).

---

# Phase 22 batch — locked 2026-04-22

Feel Pass v1.13 — Live-State Polish. Six cleanup / enrichment
items landing together:

1. **Bench + slot footer visual treatment.** Phase 21's
   bench footer reads as a noisy horizontal stream. Tone-
   washed pill applied to both bench AND slot footers for
   uniformity.
2. **Game-state filter chips** on bench and collection.
3. **Outs tracking** on `game` row; shown inline in slot
   footer LIVE copy.
4. **Full doubleheader support** — `game_number` column +
   unique index + DH marker on the slot footer.
5. **`contest_status` enum cleanup.** Drop the vestigial
   `'locked'` value (parallel to P20's work on
   `contest_entry_status`).
6. (ADR only: retro).

---

## 62. SlotGameState tone-washed pill

### Goal

Phase 21's bench footer renders game-state text as a plain
horizontal band under each card. When 10+ bench cards sit
side-by-side, the state lines bleed together visually.
Wrap the state text in a rounded pill with a subtle
state-toned background so each card's footer reads as its
own visual unit. Apply the same pill to the lineup slot
footer for uniformity (user call-out).

### Scope

- `<SlotGameState>` `footer` + `bench` variants render
  inside a rounded pill:
  - **Pre-game:** `bg-[var(--surface-2)]` + muted text.
    "vs LAD · 7:40p"
  - **Live:** `bg-emerald-950/40` + emerald text + subtle
    emerald ring. "LIVE · T5 2O · 2-1"
  - **Final:** `bg-[var(--surface-2)]/50` + neutral text.
    "FINAL W 5-2"
  - **Off:** `bg-[var(--surface-2)]/30` + muted text.
    "OFF"
- Chip variant (used in Box Score rows) unchanged — that
  context is text-only and works fine inline.
- Width: pill width = content width (auto-sizes). On bench
  cards where the pill exceeds card width, it can slightly
  overflow or the card rows get a min-width.
- Same padding + font-size on both surfaces for uniformity.

### Acceptance

- [ ] Each bench card's footer is a visually distinct pill.
- [ ] Lineup slot footer uses the same pill.
- [ ] Pills are tone-washed by state (grey / emerald /
      neutral).
- [ ] Reading bench from left to right feels discrete, not
      a stream.
- [ ] No layout shift on state transitions.

### Trade-offs

- **Pill adds ~4px of vertical real estate.** Still fits.
- **Overflow on bench cards with long pre-game copy**
  (e.g., "vs CWS · 10:07p" when the pill wants ~110px but
  the card is 96px). Acceptable — pill stays
  whitespace-nowrap; visual overflow communicates "this
  card's state is more than fits," which is honest.

---

## 63. Game-state filter chips

### Goal

Let users filter bench + collection grids by today's game
state. The priority sort from Phase 21 groups by state;
filter chips let users narrow to just the actionable bucket.

### Scope

- **Bench header:** new second row of chips below the
  existing Hitters/Pitchers/Search row. `All · Pre · Live
  · Final · Off`. Single-select (mutually exclusive with
  `All`). Applies on top of the existing
  position/search/assigned filters.
- **Collection header:** new `Today` chip row. Same 5
  chips. When any state chip is active, the grid is
  narrowed to players whose card's team has a game in
  the current slate with that status. `All` resets to the
  schedule-agnostic view.
- **`All` is the default** — preserves current behavior.
- **Counts per chip** render inline: `Pre (8) · Live (5) ·
  Final (7) · Off (3)`. Totals reflect post-position-filter
  + post-search set.
- **Collection data requirement:** `CollectionGrid` needs
  access to the `slotGameByCardId`-equivalent for
  collection cards. Add a server-side query mirroring the
  lineup page's one — one-shot game lookup for the user's
  card teams.

### Acceptance

- [ ] Bench: clicking Pre narrows to cards whose player's
      game is in scheduled state.
- [ ] Bench: chip counts update as the user toggles
      Hitters/Pitchers or types in search.
- [ ] Collection: chip row visible; filtering works.
- [ ] Collection: default (All) behavior unchanged.
- [ ] Combining with position filter works: Hitters + Live
      narrows to hitters whose game is live.

### Trade-offs

- **Collection page gains a schedule dependency.**
  Previously pure "your cards" view; now joins to today's
  games. One extra query; fine for today's feature set.
- **Chip counts refresh on any filter change.** Minor
  re-compute; not a concern at our sizes.

---

## 64. Outs tracking

### Goal

Enrich the LIVE slot footer from `LIVE · T5 · 2-1` to
`LIVE · T5 2O · 2-1`. One more signal on a slot that's
in the middle of an inning.

### Scope

- **Migration 0034** adds `current_outs smallint` to
  `public.game` with CHECK constraint 0–2 or NULL.
- **Webhook handler** reads `payload.play?.outs` on every
  batter event. Idempotent UPDATE (IS DISTINCT FROM).
  `handleGameStarted` seeds `0`. `handleGameEnded` clears
  to NULL.
- **`SlotGameInfo`** type gains `currentOuts: number | null`.
  Lineup page SELECT pulls it.
- **`<SlotGameState>` LIVE branch** appends `${outs}O` if
  available: `LIVE · T5 2O · 2-1`. Falls back gracefully
  when outs is null.

### Acceptance

- [ ] Migration 0034 applied.
- [ ] Live slot footer renders outs when available.
- [ ] FINAL footer doesn't show stale outs (cleared on
      end).
- [ ] Absent outs → footer degrades to no-outs version.

### Trade-offs

- **Outs change every pitch/play.** IS DISTINCT FROM
  keeps the UPDATE a no-op for reps with no outs change;
  Realtime only broadcasts actual changes. ~20–30 out-
  changes per game.
- **BDL's `play.outs` may not always be present.** Handler
  tolerates null; fn guards against bad writes.

---

## 65. Doubleheader support

### Goal

Real DHs (two distinct games on the same matchup-date,
different start times) become first-class. BDL-duplicate
rows get rejected at the schema level going forward.
Slot footer for a DH day shows `DH1` or `DH2` marker.

### Scope

- **Migration 0035**:
  - Add `game_number smallint` to `public.game` with CHECK
    constraint `game_number IN (1, 2) OR game_number IS NULL`.
    Default 1 for backfill via schedule-sync pull.
  - Drop the existing unique index on `bdl_game_id`; keep
    as a non-unique index (BDL occasionally re-uses ids
    across DH1/DH2 — confirmed by today's LAA@TOR data).
  - Add unique index on `(date, home_team_id, away_team_id,
    game_number)` to prevent future dupes. Same-matchup-
    same-number rejected at schema level.
- **Backfill** — one-time SQL in migration: for every
  existing (date, home, away) that has >1 row, DELETE
  the duplicates (keep earliest `created_at`). Running
  today this wipes the LAA@TOR and SEA@OAK dups.
- **`schedule-sync`** augmented: use MLB Stats API's
  `schedule?date=X&sportId=1` response to pick up
  `gameNumber` + `doubleHeader` fields per game. Set
  `game_number` on matching rows. Rows without a clean
  match default to `1`.
- **Lineup page dedup query** updated: still `DISTINCT ON
  (home_team_id, away_team_id)` but tiebreak favors the
  game with the soonest scheduled_start that hasn't
  finished (real DHs: DH2 rises when DH1 finals).
- **Slot + bench footer** shows `DH1` / `DH2` marker when
  `game_number !== null && game_number != 1 OR (game_number
  == 1 && a DH exists on this matchup)`. Simple:
  `LIVE · T3 · 2-1 (DH2)`.

### Acceptance

- [ ] Migration 0035 applied. Today's LAA@TOR dup
      collapses to one row.
- [ ] Unique index prevents re-inserting a dup via
      schedule-sync.
- [ ] schedule-sync populates `game_number` from MLB Stats
      on next run.
- [ ] Slot footer renders DH marker on a real DH day.

### Trade-offs

- **`bdl_game_id` unique index removal.** BDL sometimes
  duplicates ids across a matchup's two games — observed
  in today's data. Keep the index as non-unique for lookup
  speed; dedup at schema level via the new triple-key
  unique.
- **Backfill deletes rows.** Pre-migration verification
  (below) lists the rows that would be deleted so the
  user can confirm. Deletion is safe because the Phase
  20 DISTINCT ON query already hid them.
- **MLB Stats' `gameNumber` may not always match BDL's
  `bdl_game_id` pairing.** Best-effort match via
  (date, home_mlb_team_id, away_mlb_team_id); MLB Stats
  gives both game entries. Rare edge case where the
  match is ambiguous; defaults to 1.

---

## 66. `contest_status` enum cleanup

### Goal

Drop `'locked'` from the `contest_status` enum. Parallel
to Phase 20's `contest_entry_status` cleanup. Zero
business logic transitions to this value today.

### Scope

- **Migration 0036** follows the P20 recipe:
  rename old type → create new type → drop dependencies
  (DEFAULT, RLS policies, any triggers) → ALTER COLUMN
  TYPE → restore dependencies → drop old type.
- Pre-migration check: verify zero rows at `'locked'`.
- **SQL fn cleanup:** any fn that checks
  `contest.status IN ('pending', 'locked', ...)`
  simplified to just `'pending'`.

### Acceptance

- [ ] Zero rows at `'locked'` pre-migration.
- [ ] Migration applies clean.
- [ ] Enum has 4 values: `pending` / `live` / `final` /
      `canceled`.
- [ ] No TS references to `"locked"` on contest status.

### Trade-offs

- **Recipe already documented from P20.** Expect similar
  dependency cascade (DEFAULT + possibly some triggers).

---

## 67. Not in scope for v1.13

- Onboarding flow pass.
- Empty / error state sweep.
- Accessibility audit.
- Tier foil motion.
- Dupe panel multi-instance picker.
- Mobile / sound / haptics / artwork.
- Rank display on status chip.
- Webhook retry observability.
- CI integration for fixtures.
- Sound cue on positive-FP events.
- Baserunners live tracking.
- Pitcher-on-mound indicator.
- Collection page multi-day schedule view.

---

# Phase 23 — Feel Pass v1.14 (Lineup layout + surface cleanup)

User feedback after Phase 22 shipped:

> "The way the lineup cards are laid out right now just
> don't work. I wanted to do something with the cards on a
> real field or something but I just don't think it's
> working. Maybe we could do them in rows and ordered in a
> way that works?"

Plus four narrower surface fixes. One phase, five slices.

---

## 68. Three-role-row lineup layout

### Goal

Replace the 5×4 diamond-shaped CSS grid with three
role-based rows that read top-to-bottom: pitchers,
infielders (C + IF4), outfielders. Uniform card size
across roles. The "diamond / field" metaphor is removed —
the visual priority is "who's starting where + what's
their game state" over "here are the defensive positions."

### Scope

- **Row 1 — Rotation:** SP1, SP2 (2 cards).
- **Row 2 — Infield:** C, 1B, 2B, 3B, SS (5 cards).
- **Row 3 — Outfield:** OF1, OF2, OF3 (3 cards).
- Row 1 + Row 3 center-justify in the column so the
  2-card and 3-card rows don't look left-biased against
  the 5-card infield.
- Column gap equals the gap between infield slots so the
  three rows read as the same pixel rhythm.
- Row labels above each row in the muted mono style the
  bench already uses (`ROTATION · INFIELD · OUTFIELD`).
- Retire `DiamondGrid` (or rebrand as `LineupGrid`). The
  LineupShell `diamond` slot is renamed `grid` for
  consistency with the new name.
- Keep `LineupSlot` unchanged — it's the per-slot card
  primitive and doesn't know about global layout.
- Drop the pitcher-pair visual grouping inside DiamondGrid
  if any (the current grid already has SP1+SP2 side-by-
  side in the top row, which transfers cleanly).

### Acceptance

- [ ] Lineup page renders three rows, labeled above each.
- [ ] Card size is uniform across all 10 slots (the old
      diamond had some implied smaller cards on the edges).
- [ ] Rows 1 + 3 visually center against the 5-card
      infield row.
- [ ] Drop behavior + per-slot lock behavior unchanged.
- [ ] Mobile-friendly: at narrower widths (≥768px is our
      desktop-first target), rows still hold.

### Trade-offs

- **Loses the "field" visual metaphor.** Upside: the
  diamond never carried weight — users scanned left-to-
  right anyway, not catcher-up-to-outfield. Three clearly
  labeled rows read as a roster, which matches user mental
  model.
- **Uniform card size = bigger cards on the pitcher row.**
  Two cards can breathe more. Same card component, same
  shape; the grid column width is just less constrained.

---

## 69. Event feed matchup chip

### Goal

Each row in the Event Feed gets a small matchup chip next
to the existing inning label so users can tell which game
an event belongs to — currently you see "Judge HR +5.0 ·
T5" with no indication that this happened in NYY@BOS vs.
some other contest game.

### Scope

- `FeedEvent` type gains `gameMatchup: string | null` —
  preformatted as `"NYY@BOS"` or `"vs LAD"` depending on
  whether the tracked player is home or away.
- `LiveEventsProvider` builds this at subscribe time from
  `contestGameIds` + the game ↔ team mapping it already
  joins for the per-player filter. If the mapping isn't
  available (rare / initial render races), `gameMatchup`
  stays null and the chip doesn't render.
- EventFeed row adds a compact mono chip rendered inline
  with the inning: `T5 · NYY@BOS`.
  - Chip uses the neutral pill tone (same `border-
    [var(--border)] bg-[var(--surface-2)] text-[var(--text-
    3)]` as the muted state chips from §62).
  - No hover / click behavior (future-hookable).
- The box-score chip (same underlying render) is unchanged
  — boxscore already surfaces which slot/player, adding a
  matchup to every row would duplicate.

### Acceptance

- [ ] Event rows show matchup chip inline with inning.
- [ ] No chip when `gameMatchup` is null (pre-data race
      case).
- [ ] No layout shift on initial render (reserve space
      when matchup is expected but still loading).

### Trade-offs

- **Requires threading game→matchup data to
  LiveEventsProvider.** Provider already filters by
  `contestGameIds`; adding a `game_id → "ABC@XYZ"` lookup
  is a small prop extension.
- **Chip adds horizontal width.** Feed rows stay single-
  line (`whitespace-nowrap` truncates player name if
  needed). Right-edge truncation is the existing behavior.

---

## 70. Bench + Tokens scroll arrows

### Goal

Replace the native horizontal scrollbar on the bench tray
and the token tray with explicit left/right arrow buttons
positioned just outside the scrollable row, sized to match
the tray's vertical center. The scrollbar (a visual styled
by the OS / browser) is hidden but native wheel + touch-
pad scroll continue to work.

### Scope

- New `<HorizontalScroller>` primitive in
  `src/components/ui/horizontal-scroller.tsx` (client
  component) wrapping an `overflow-x-auto` inner div:
  - Exposes `children` slot for the row content.
  - Hides the scrollbar via the Tailwind `scrollbar-
    none`-equivalent utility (or inline CSS: `scrollbar-
    width: none` + `&::-webkit-scrollbar { display: none }`).
  - Renders `<` / `>` buttons on the outer flex container's
    edges.
  - Each click scrolls by the visible width of the inner
    container (page scroll, not per-card step).
  - Buttons auto-disable when the row is at scrollLeft = 0
    or at (scrollWidth - clientWidth).
  - Listens to `scroll` + `resize` to re-derive the
    disabled state.
- `BenchDrawer`: replace the existing
  `<div className="flex gap-3 overflow-x-auto">` wrapper
  with `<HorizontalScroller>`.
- `TokenTray`: same replacement.

### Acceptance

- [ ] No horizontal scrollbar visible on bench or tokens.
- [ ] `<` / `>` arrows appear at the edges when content
      overflows.
- [ ] Arrows disabled when at the ends.
- [ ] Native wheel + touchpad scroll still works.
- [ ] Keyboard-focusable buttons (they're real buttons —
      tab navigation works).
- [ ] No layout shift when the tray has few items (arrows
      hidden when not needed — i.e. `scrollWidth <=
      clientWidth`).

### Trade-offs

- **Shared primitive rather than per-surface
  implementation.** A second consumer (TokenTray) means a
  shared component is the right call from the start.
- **Arrows sit outside the scroll area.** Keeps the arrow
  buttons from overlapping card content. Minor: the tray
  footprint widens by ~48px (24px per arrow). Acceptable.

---

## 71. Box score zero for played players

### Goal

When the contest is in live or final state and a player
has scored 0 FP, show `0.0` (consistent with the `.toFixed
(1)` format of non-zero values) instead of the em-dash
`—`. Pre-game / building state keeps the dash since there
is genuinely no data yet.

### Scope

- `LineupSidebar.tsx` `BoxScoreSection`: the condition
  becomes `hasGameStarted ? fp.toFixed(1) : "—"` where
  `hasGameStarted` is `gameInfo?.status === "live" ||
  gameInfo?.status === "final"`.
- The muted text treatment for `fp === 0` can stay —
  visually it reads as "nothing scored yet" without being
  a data-absent dash.

### Acceptance

- [ ] Live player with 0 FP shows `0.0`, muted.
- [ ] Final player with 0 FP shows `0.0`, muted.
- [ ] Pre-game player shows `—`.
- [ ] Off-day / postponed player shows `—`.

### Trade-offs

- **None meaningful.** The dash-for-zero was a display
  choice; zero-is-a-number-not-absence is more honest
  once the game is live.

---

## 72. Contest header → sidebar

### Goal

Move the "Tonight's Slate" / contest-name / lock-status
block from the top bar into the top of the right sidebar
(above the box score). Drop the top bar entirely. This is
a quick pre-cleanup pass ahead of a larger sidebar
reorganization planned post-v1.14.

### Scope

- Remove the `<header>` prop from `<LineupShell>`. Shell
  renders the grid + sidebar without a top bar.
- New `ContestHeaderCard` component at the top of
  `LineupSidebar` — contest name (bold), date (subtitle),
  status/countdown (muted third line). Same copy as the
  old header; compact card styling so it sits clean above
  the live-score number.
- Detail-sidebar swap continues to work — when the
  detail-card sidebar is active, it replaces the whole
  sidebar (including this header block), matching current
  behavior.
- The grid area gains the vertical space the top bar
  vacated. Three-role-row layout (§68) benefits from this.

### Acceptance

- [ ] Top bar is gone; lineup grid starts at the top of
      the content area.
- [ ] Sidebar's first block shows contest name + date +
      lock status.
- [ ] Detail-card sidebar swap works unchanged.
- [ ] Status copy identical to previous header (same
      countdown fn, same submitted/final branches).

### Trade-offs

- **This is a band-aid.** Deep sidebar reorg in a later
  phase will reshuffle the whole right column; but moving
  this info now reclaims vertical space and the
  reorganization will just incorporate the new block.
- **Less prominence for contest name.** The top bar made
  the contest name the first thing you read. In the
  sidebar it competes with box-score FP numbers. Net:
  trivial — the contest name is always "Daily Slate ·
  YYYY-MM-DD" during v1.14 (no multi-contest picker yet).

---

## 73. Not in scope for v1.14

- Standard parked items.
- Deep sidebar reorganization (larger follow-on).
- Baserunners live tracking.
- Pitcher-on-mound indicator.
- Collection multi-day schedule view.
- Onboarding flow pass.

---

# Phase 24 — Feel Pass v1.15 (Fluid lineup layout)

User feedback after Phase 23 shipped:

> "I don't love the canvas treatment we are giving the lineup
> section. When the screen is huge, there is wasted space,
> when it's smaller you have to scroll to see other players
> in that section."

The three-role-row layout (§68) solved the diamond-metaphor
problem, but cards stayed at a fixed 96×134 small size with
a `max-w-5xl` container cap. On wide viewports, that left
hundreds of px of empty gutter on each side; on narrow/short
viewports, the three rows overflowed vertically and forced
scroll.

User-picked recommendations from the interview:
- **Fit-to-pane:** all 10 cards always visible, no scroll.
- **Keep card aspect ratio:** width and height scale together
  (96:134 ≈ 0.72:1).
- **Cap card width:** scale up with the pane until a sensible
  max, then let extra space become breathing room.

One phase, one slice.

---

## 74. Fluid lineup layout (fit-to-pane)

### Goal

The lineup grid fills its available pane in both dimensions.
Cards scale up to fill wide-screen real estate (capped at a
reasonable max) and scale down to fit narrow/short viewports
without vertical scroll. Card aspect ratio preserved; the
three-role-row structure from §68 preserved; all 10 cards
visible at all reasonable viewport sizes.

### Scope

- **Measurement:** LineupGrid is already a client component;
  add a `ResizeObserver` on its root element. On every resize
  recompute the optimal card width + scale and set two CSS
  custom properties: `--card-w-px` (length) and
  `--card-scale` (unitless number).
- **Sizing math:**
  ```
  card_w = min(
    CAP,                                     // cap at ~200px
    (paneW - paddingX - 4·cardGapX) / 5,      // 5-across infield constraint
    (paneH - paddingY
           - 2·rowGapY
           - 3·rowLabelH
           - 3·slotChromeH) / 3 / (134/96)    // 3-rows-fit vertical constraint
  )
  card_scale = card_w / 96
  ```
  Clamp at a sensible floor (~60px) so extreme micro-
  viewports still render readable-ish shapes.
- **Scaling mechanism:** keep `<Card size="small" />`
  unchanged. Wrap it (and the dashed empty-slot box) in a
  two-div shell:
  - Outer: `width: var(--card-w-px); height: calc(var(--card-w-px) * 134 / 96); position: relative`.
  - Inner: absolute, `width: 96px; height: 134px; transform: scale(var(--card-scale)); transform-origin: top left`.
  - Visual scale follows the CSS var without touching Card's
    internals. At integer-ish scales text stays crisp;
    slight blur at fractional scales is acceptable given the
    alternative is a much larger Card refactor.
- **LineupShell:** the grid pane container switches from
  `overflow-auto + items-start` to `overflow-hidden +
  items-stretch` so the grid fills its parent. The grid
  handles its own overflow (which with the math above,
  shouldn't happen).
- **Slot chrome:** the per-slot position label (SP1, C, 1B,
  …), SlotGameState pill, and "remove" button stay at their
  natural text sizes — they're legibility-critical and
  scaling-them would look strange. Only the card visual
  scales.
- **Retire the max-w-5xl container:** LineupGrid's root uses
  `w-full`. Padding + gaps are consistent constants that
  the sizing math can reference.

### Acceptance

- [ ] At 1920×900 viewport: cards scale up near the cap
      (~180-200px wide); no wasted side gutter beyond
      intentional padding.
- [ ] At 1280×800 viewport: cards fit without internal
      vertical scroll.
- [ ] At 1024×720 viewport (minimum supported): cards
      shrink but all 10 are visible; no vertical scroll.
- [ ] Card aspect ratio preserved at every scale.
- [ ] Drag/drop targets still work (transform: scale
      preserves hit-boxes).
- [ ] Bench + tokens layout unaffected.
- [ ] Sidebar + contest header card unaffected.

### Trade-offs

- **`transform: scale()` over refactoring Card internals.**
  Card.tsx has every inner measurement hardcoded in inline
  pixel styles driven by a 3-tier size enum. Rewriting it to
  accept fluid dimensions is a ~50-line diff with
  cross-tier risk. The scale-wrapper approach is ~20 lines
  isolated to LineupSlot/LineupGrid. If visual quality
  proves insufficient at scale extremes, the proper
  refactor is still available.
- **ResizeObserver adds JS measurement.** One observer on
  the grid root, not per-slot. Cheap.
- **Single CSS-var channel for all 10 slots.** LineupGrid
  sets `--card-w-px` + `--card-scale` once; all slots
  inherit. No per-slot JS.
- **Chrome stays at natural text sizes.** Means the visible
  card can look proportionally bigger than its labels at
  max scale (card 200px wide, label 9px). Looks fine —
  users' eyes expect fixed label chrome.
- **Minimum-viewport floor at ~60px card width.** Below
  that cards are illegible; we'd rather let them clip with
  a min than render unreadable. Realistic viewports won't
  hit this.

---

## 75. Not in scope for v1.15

- Card.tsx internal refactor to truly fluid sizing.
- Deep sidebar reorganization.
- Baserunners live tracking.
- Pitcher-on-mound indicator.
- Collection multi-day schedule view.
- Onboarding flow pass.
- Standard parked items.

---

# Phase 25 — Feel Pass v1.15.1 (Match bench size, revert fluid scaling)

User feedback after Phase 24 shipped:

> "My bad if I misunderstood what you were saying but a lot
> of people are going to use our web app at a smaller
> normal laptop size. Ideally, all the cards in the lineup
> would always remain the same size as the cards in the
> bench. We can do better here as this does not look nice."

Phase 24's fit-to-pane math was over-aggressive about
reserving per-slot chrome; at normal laptop heights (900px,
etc.) it computed card widths *smaller* than the bench's
fixed 96×134, producing the exact inconsistency the user
flagged: lineup cards tiny, bench cards larger, floating in
an otherwise empty pane. Simpler + correct goal: lineup
cards == bench cards.

One slice. Pure revert + polish.

---

## 76. Fixed lineup card size, label alignment

### Goal

Lineup cards always render at the same size as bench cards
(`<Card size="small" />` = 96×134). The diamond/scaling
experiments from Phases 23–24 taught us the row-based
layout is right; now pin the sizing so the drag-from-bench-
to-slot motion has zero size shift, and the lineup reads as
a structured roster instead of tiny cards in a void.

### Scope

- **Revert P24 scaling** in `LineupSlot.tsx`. Drop the
  scaling shell, `shellStyle`, `scaledInnerStyle`, and any
  reliance on `--card-w-px` / `--card-scale` CSS vars. Empty
  slots go back to `h-[134px] w-[96px]`; filled slots render
  `<Card size="small" />` directly inside the drag source
  container.
- **Rewrite `LineupGrid.tsx`** to a fixed-layout shape:
  - Drop the `ResizeObserver` + `useEffect` + `useState`
    for card width.
  - Drop the `LAYOUT` constants block + `computeCardWidth`
    helper.
  - Drop the CSS custom properties on the grid root.
  - Wrap the three RoleRows in a **shared-width inner
    container** (544px — infield row's natural width = 5
    cards × 96 + 4 gaps × 16). Rotation and Outfield rows
    center-justify their cards within that container.
  - Each row's label sits flush-left of the shared
    container (a block-level `<h3>`). All three labels
    align to the same x-coordinate across rows because
    they share the container's left edge. This is the
    user's "labels aligned left to the card group" pick.
  - Outer grid: `flex h-full w-full flex-col items-center
    justify-center gap-6 p-6`. Centers the shared container
    horizontally + vertically in the available pane.
- **Revert `LineupShell.tsx`** grid-pane overflow. Keep
  `flex-1 min-h-0` but drop the P24 `overflow-hidden`.
  Grid content at fixed size (~620px tall) fits in
  realistic laptop pane heights; if an extreme-short
  viewport is used, browser defaults apply (mild overflow
  rather than internal scroll).

### Acceptance

- [ ] At any typical viewport (13" laptop and up), lineup
      cards render at 96×134 — identical to bench cards.
- [ ] No internal scroll on the lineup grid area.
- [ ] Row labels align flush-left to the infield row's
      left edge; all three labels at the same x.
- [ ] Rotation (2 cards) + Outfield (3 cards) rows center-
      justify within the shared 544px container.
- [ ] Drag-from-bench-to-slot has zero visual size shift
      during the drag → drop animation.
- [ ] Bench + token carousel unaffected.
- [ ] Sidebar + contest header unaffected.

### Trade-offs

- **Loses fit-to-pane dream.** On very wide or very short
  viewports, cards don't grow/shrink. That was Phase 24's
  ambition; Phase 25 accepts the trade because consistency
  with the bench beats horizontal-space optimization.
- **Wide-screen extra space returns.** On a 4K monitor,
  the 544px grid sits centered with ample empty gutter.
  Acknowledged; future deep sidebar / matchup-context
  work can fill that space productively.
- **Short-viewport overflow.** Viewports below ~780px tall
  may see the outfield row partially below fold. Either
  the page scrolls (expected behavior for a desktop app
  with a reasonable minimum viewport), or a follow-on
  phase can compress chrome further. Not optimizing for
  this edge case now.

---

## 77. Not in scope for v1.15.1

- Card.tsx internal refactor.
- Deep sidebar reorganization.
- Matchup-context side panels on wide screens.
- Baserunners live tracking.
- Pitcher-on-mound indicator.
- Collection multi-day schedule view.
- Onboarding flow pass.
- Standard parked items.

---

# Phase 29 — v1.16 (Leaderboards polish + profile drawer)

First non-polish-only phase since v1.13. Most infra already
exists (leaderboards page, public profile page, API routes, schema)
so this phase focuses on the remaining gaps that move the game
toward launch-ready:

- Profile drawer in the header (new)
- Cards leaderboard rework (ranks cards, not users)
- Team customization page (new)
- Account settings page (new)

---

## 83. Cards leaderboard — rank cards, not users

### Goal

The existing "Card Prestige" leaderboard ranks users by their
count of Diamond, unvaulted cards. User feedback: no cards
appearing because most users don't have Diamonds yet, and the
metric feels off for a community-wide "best cards" view.

Rework: rank individual cards by career FP across the entire
community. Each row = one card + its owner. Users see the most
valuable cards in the game regardless of who owns them.

### Scope

- Rename `card-prestige` → `cards` in
  `LEADERBOARD_TYPES` / display labels.
- New row shape (discriminated by `kind: "user" | "card"`):
  - `rank`
  - `cardId`
  - `playerName`
  - `tier`
  - `teamAbbreviation` (the MLB team — not owner)
  - `careerFp` (metric)
  - `ownerUserId`
  - `ownerTeamName`
- New query: `SELECT c.*, p.team_name AS owner_team FROM
  public.card c JOIN public.profile p ON p.user_id = c.user_id
  AND p.is_public = true ORDER BY c.career_fp DESC LIMIT 100`.
  No tier filter. No vault filter. Any card from any user with
  a public profile qualifies.
- `getLeaderboard` returns `CardLeaderboardData` (different type
  than user leaderboards) when type is `cards`.
- `/api/leaderboards/cards` returns the card-shaped payload.
- Leaderboard page renders a different row template for `cards`:
  card icon + player name + tier chip + owner team (clickable
  → `/p/{ownerTeamName}`) + FP.
- "Your Rank" for cards = the user's single highest-FP card's
  rank in the global card ranking. Pinned above if outside top.

### Acceptance

- [ ] Clicking "Cards" tab shows card-shaped rows.
- [ ] Rows sorted by career_fp DESC, any tier, vaulted + unvaulted.
- [ ] Owner team name is clickable, links to `/p/{teamName}`.
- [ ] "Your Rank" pins the user's top card if outside top 100.

### Trade-offs

- **Different shape from the other 3 leaderboards** — forces a
  discriminated-union type. Worth it; the metric is clearer
  and users actually appear on it.

---

## 84. Profile drawer in header

### Goal

Header currently has a manager-level badge that's not
clickable. Add a right-side slide-in drawer triggered by
clicking the badge. Shows team identity + career stats +
quick links to team / account settings + sign out.

### Scope

- New `ProfileDrawer` component using shadcn `sheet` primitive.
- Triggered by click on header's manager-level badge.
- Contents:
  - Team identity block (name, colors, logo)
  - Manager Level + XP progress bar to next level
  - Career stats block (lifetime FP, contests won, diamonds
    vaulted, tokens triggered)
  - Links: Team customization (`/settings/team`), Account
    settings (`/settings/account`), Sign out (server action)
- **NOT** "View my public profile" — user explicitly skipped
  that link this phase.

### Acceptance

- [ ] Badge click opens the drawer.
- [ ] Drawer shows current team identity + stats.
- [ ] Links route correctly.
- [ ] Sign out clears session + redirects to `/signin`.

### Trade-offs

- **Uses existing shadcn sheet** — no new primitive needed.

---

## 85. Team customization page

### Goal

Users need a way to edit their team name / colors / logo
after onboarding. Currently only settable during onboarding
flow. Accessed via profile drawer quick link.

### Scope

- New route `src/app/(app)/settings/team/page.tsx`.
- Form: team name (text input + uniqueness check),
  primary color (color picker), secondary color (color
  picker), logo (dropdown or icon picker from a fixed set).
- Server Action `updateTeamProfile` — updates `public.profile`
  row. Uniqueness check on team_name. Validation matches
  onboarding rules.
- Success toast + router refresh on save.

### Acceptance

- [ ] User can land on `/settings/team`, see current values.
- [ ] Edit + save flows through, survives refresh.
- [ ] Team name uniqueness enforced.
- [ ] Header team name updates post-save.

### Trade-offs

- **Minimal logo picker** — use the same fixed set as
  onboarding. Custom uploads are out of scope.

---

## 86. Account settings page

### Goal

Minimal account management surface linked from the profile
drawer. V1 scope: view email, change password.

### Scope

- New route `src/app/(app)/settings/account/page.tsx`.
- Sections:
  - Email (read-only text, no edit)
  - Change password form: current + new + confirm.
- Server Action `changePassword` calls Supabase auth's
  `updateUser({ password })` with current-password
  verification via `signInWithPassword` first.

### Acceptance

- [ ] Email visible.
- [ ] Password change form validates matching passwords.
- [ ] Wrong current password → error toast, form stays.
- [ ] Successful change → success toast, user stays signed in.

### Trade-offs

- **No email change / OAuth link management / account
  deletion** — scoped out for v1. Safety rules prohibit
  account deletion anyway.

---

## 87. Not in scope for v1.16

- Onboarding flow pass.
- Custom team logo uploads.
- Email change / 2FA / OAuth re-linking.
- Empty / error state sweep (follow-on phase).
- Deep sidebar reorganization.
- Matchup-context side panels.
- Baserunners / pitcher-on-mound.
- Standard parked items.

---

# Phase 30 — v1.17 (Unified sidebar + card detail modal)

User feedback after Phase 29: the building-state sidebar feels
cluttered (too many sections competing for attention), and the
Collection page has a different sidebar from Lineup which feels
inconsistent. This phase unifies the sidebar across both pages and
moves the card-detail interaction to a modal overlay instead of a
sidebar swap.

---

## 88. Unified cross-page sidebar

### Goal

One sidebar component that renders on both `/lineup` and
`/collection` with the same content, anchored around the user's
team identity + the active contest state. Users get a stable "you
are here" panel regardless of which page they're on.

### Scope

- New `AppSidebar` component (replacing `LineupSidebar` +
  `CollectionSummaryStats` / `SelectedCardSidebar` swaps).
- Three stacked sections:
  1. **Team summary** (top) — team name, Vault Value Total
     (sum of quick-sell values for all vaulted cards at their
     final tier), Total FP (career FP lifetime), Vaulted Cards
     count. Read from `manager_account` + aggregate query.
  2. **Contest header** — active contest name + lock countdown
     when `building`, status copy when `submitted / live / final`.
     Unchanged from current `ContestHeaderCard` — just relocated.
  3. **Contest state** — Live Score + Box Score + Event Feed
     when `entryStatus !== 'building'`. When building, show
     Readiness counter (x/10 slots filled) + warnings list +
     compact Submit button. When no contest today, show a
     minimal placeholder.
- Card-click interactions on both pages STOP swapping the
  sidebar. Sidebar stays locked to summary content.
- Both `LineupShell` and `CollectionShell` accept this
  `<AppSidebar>` the same way. Shell differences (bench + tokens
  on lineup, grid content on collection) stay.
- Building-state submit area: tighten vertical rhythm. Keep
  Submit (still valuable — entry `building → submitted`
  transition), tighten padding + line-height so it reads as one
  compact block instead of scattered sections.

### Acceptance

- [ ] Navigating between `/lineup` and `/collection` shows the
      same sidebar layout + content.
- [ ] Team summary visible on both pages.
- [ ] Live Score / Box Score / Event Feed render post-submit on
      both pages (collection users see their contest state
      even while browsing their collection).
- [ ] Sidebar does NOT swap when a card is clicked.
- [ ] Building-state sidebar is visibly tighter than before.

### Trade-offs

- **Collection loses its dedicated stats block.** The
  `CollectionSummaryStats` (tier counts, collection-size-vs-cap,
  near-cap warning) gets absorbed into either the team summary
  (Vaulted Cards count covers part of it) OR deferred. Near-cap
  warning stays on the collection page itself as an inline
  banner (polish spec §25 already has this).
- **Event Feed on Collection page** — a bit unusual to see
  event feed while browsing collection, but the trade-off is
  consistency. If users find it distracting we iterate.

---

## 89. Card detail modal

### Goal

Clicking any card (bench, slot, collection grid) opens a modal
overlay with card detail + actions. Replaces the
sidebar-swap behavior. Same interaction from both pages.

### Scope

- New `CardDetailModal` component using shadcn `dialog`
  primitive. Centered overlay with card render + stats + context-
  specific actions.
- Context drives the action buttons:
  - From Lineup slot: "Remove from slot" (drag-out alternative),
    "Apply token" (token picker if no token applied), "Remove
    token" (if one applied).
  - From Lineup bench: "Add to slot" (if an open slot accepts
    this card), "Apply token" / "Remove token."
  - From Collection: "Quick-sell," "Vault (midseason)" if
    eligible.
- Closes on outside click, Escape key, or explicit close button.
- URL param (`?card={id}`) preserves modal state so back/forward
  navigation + shareable links work — same pattern used by the
  previous detail-sidebar swap.
- `SelectedCardSidebar` is removed after the modal fully
  replaces its functionality.

### Acceptance

- [ ] Clicking a card on any page opens modal.
- [ ] Modal shows card detail + context-appropriate actions.
- [ ] Closing via outside click / Escape / X button all work.
- [ ] `?card={id}` URL param reflects modal state.
- [ ] Back/forward browser nav closes/opens the modal.

### Trade-offs

- **Modal has smaller screen-real estate than the full-height
  sidebar** — card info has to be more compact. Acceptable
  since most detail fits in a reasonable modal footprint.
- **Collection's /collection/[cardId]/page.tsx route** stays
  for deep-linkability (SEO + share) but the modal is the
  primary interaction.

---

## 90. Not in scope for v1.17

- Baserunners + pitcher-on-mound (Phase 31).
- Onboarding flow pass.
- Empty / error state sweep.
- Standard parked items.

---

# Phase 31 — v1.18 (Baserunners + pitcher-on-mound)

Final live-game polish item for v1. Full stack: new DB columns,
webhook handler parsing, per-slot UI.

---

## 91. Baserunners live tracking

### Goal

The live slot footer currently shows inning + outs + score when a
game is in progress. Add a mini diamond icon that visualizes which
bases are occupied so users can see at a glance if their player is
batting with runners on.

### Scope

- **Migration 0038:** new columns on `public.game`:
  - `baserunner_first uuid NULL` (player_id on 1B)
  - `baserunner_second uuid NULL` (player_id on 2B)
  - `baserunner_third uuid NULL` (player_id on 3B)
  - All NULL when `status != 'live'`.
- **Webhook handler:** parse `play.runners` (or equivalent) from
  BDL webhook payloads. On each batter event, update all three
  columns idempotently (IS DISTINCT FROM pattern already
  established in P22).
- **SlotGameInfo type:** add `baserunnerFirst / Second / Third`
  as `string | null`.
- **UI:** new `<BaserunnerDiamond>` component — a small inline
  SVG (roughly 16×16) showing 4 corners (home + 3 bases) with
  occupied corners filled. Renders inside the LIVE slot footer
  pill after the outs indicator. Example: `LIVE · T5 2O · 2-1 ◆`
  where the diamond shape highlights occupied bases.
- **game_live_snapshot_on_game_update Realtime:** the existing
  Realtime subscription on `public.game` will automatically
  carry the new columns; no subscription changes needed.

### Acceptance

- [ ] Webhook payload with runners updates all three columns.
- [ ] Live slot footer shows the baserunner diamond when
      occupied; hidden when bases empty.
- [ ] Diamond updates in real-time as play progresses.
- [ ] No extra queries required — all data flows via Realtime
      already.

### Trade-offs

- **Baserunner identity (which player is on 2B) isn't
  displayed** — users just see "somebody on 2B." We store
  `player_id` so future UX (hover tooltip?) could surface names.
- **SVG over text** — a tiny diamond glyph reads faster than
  "R: 2,3" text. Adds visual cost but the slot footer is
  dense; the glyph integrates cleanly.

---

## 92. Pitcher-on-mound indicator

### Goal

Hitters facing a specific pitcher in real-time is interesting —
users want to know "Judge vs. Gerrit Cole coming up." Show the
current pitcher's name on hitter slots whose team is batting.

### Scope

- **Migration 0038 (same one as §91):** new column
  `public.game.pitcher_player_id uuid NULL`.
- **Webhook handler:** on each batter event, update the column
  to the current pitcher's `player_id` (from the play payload).
  Idempotent update pattern.
- **SlotGameInfo type:** add `pitcherPlayerId: string | null` +
  `pitcherName: string | null` (joined from `public.player` at
  fetch time).
- **UI:** live-state slot footer for hitter slots that are
  currently batting (inning_half corresponds to their team)
  shows a subtle second-line `vs [Pitcher Name]`. Only renders
  when: (a) slot is a hitter, (b) game is live, (c) game's
  `inning_half` means the hitter's team is at bat.
- **`fetchSlotGameByCardId`** already joins game info; extend
  to include `pitcher_name` via a LEFT JOIN with `public.player`.

### Acceptance

- [ ] New column populates from webhook.
- [ ] Hitter slot footer shows `vs [Pitcher Name]` when their
      team is batting.
- [ ] No pitcher display when game is scheduled/final or when
      the hitter's team is fielding.
- [ ] Pitcher name updates in real-time as pitching changes
      (bullpen swaps).

### Trade-offs

- **One extra JOIN** in `fetchSlotGameByCardId` — cheap, single
  player lookup per contest-game.
- **Doesn't surface pitcher quality / stats** — just the name.
  Match-up analysis is future work.

---

## 93. Not in scope for v1.18

- Onboarding flow pass.
- Empty / error state sweep.
- Baserunner names (hover tooltip).
- Pitcher stats / matchup analysis.
- Standard parked items.

---

# Phase 32 — v1.19 (Unified lineup + collection on one page)

User-proposed redesign: kill the `/collection` page entirely.
Replace the horizontal bench carousel with a responsive grid of
all cards below the lineup. Tokens move above the cards grid.
Users build lineups + browse their collection on a single
continuous page.

Baserunners + pitcher-on-mound (previously Phase 31) stay
spec'd but unbuilt; will pick up as a later phase.

---

## 94. Unified cards grid (replaces `/collection`)

### Goal

Consolidate lineup-building and collection-browsing into one
page. The bench was a horizontal scroll of unused cards; the
new section is a responsive grid of ALL cards (assigned +
unused), max 8 per row, wrapping down at narrower viewports.
Users see their full collection while they draft their lineup.

### Scope

- Rename / refactor `BenchDrawer` → `CardsPanel`. Replaces the
  horizontal `<HorizontalScroller>` carousel with a responsive
  CSS grid:
  ```
  grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8
  ```
  Gap = 12-16px. Card size stays at `size="small"` (96×134)
  matching lineup slots.
- Shows **all cards**, not just unused. Cards currently in the
  lineup render with a subtle "IN LINEUP" badge overlay +
  muted tint; they're still clickable (opens modal) and
  draggable (for swap) but visually distinguished.
- Default sort: pre-game today → live → final → off/no-game.
  Same priority-by-game-state rank the bench already uses.
- Filter row above the grid:
  - Hitters / Pitchers chips (existing)
  - Game-state chips with counts (existing)
  - Tier chips: All / Bronze / Silver / Gold / Diamond (new)
  - Search input (existing)
  - "X cards · Y in lineup" counter on the right
- No pagination or virtualization. At collection_cap = 100,
  rendering all cards is cheap.

### Acceptance

- [ ] All cards visible in the grid, rows of up to 8.
- [ ] Responsive columns scale from 2 (narrow) to 8 (wide).
- [ ] Tier filter chips work and show counts.
- [ ] Cards in lineup slots render with "IN LINEUP" marker.
- [ ] Clicking a card opens the detail modal.
- [ ] Dragging a card onto a lineup slot still works for
      visible cards.

### Trade-offs

- **One giant scroll per page.** Users scroll the whole
  document to see all their cards. The AppSidebar sticks to
  the right via its own sticky-ish behavior (existing).
- **Rendering 100 cards at once.** No virtualization. Cheap
  now, revisit if collection_cap grows.

---

## 95. Tokens above cards

### Goal

User's layout call: tokens should appear ABOVE the cards grid
(between the lineup and the cards panel), not below. Makes
tokens more discoverable when browsing cards + keeps the
"interactive game state" (lineup + tokens) visually grouped.

### Scope

- Update `LineupShell` section order: `grid` → `tokens` →
  `cards` (was `grid` → `bench` → `tokens`).
- `TokenTray` component unchanged — just moves up in the
  layout.

### Acceptance

- [ ] Tokens render between the lineup grid and the cards
      grid.
- [ ] No layout regressions on the lineup grid itself.

### Trade-offs

- **None meaningful.** Pure reshuffle.

---

## 96. Auto-scroll during drag

### Goal

With the cards grid extending below the fold, users can now
drag a card that's off-screen downward. To drop it on a
lineup slot (which is at the top of the page), the page must
auto-scroll upward while the drag is in progress. HTML5 DnD
doesn't do this natively.

### Scope

- New `useAutoScrollOnDrag` hook in
  `src/components/lineup/use-autoscroll-on-drag.ts`. Works
  purely with pointer events:
  - When any card drag is in progress (tracked via
    `react-dnd`'s monitor or a module-level ref), listen on
    `dragover` (or a custom pointermove) at the document level.
  - If the pointer is within 80px of the top of the viewport,
    scroll the main scroll container upward at ~12px/frame.
  - If within 80px of the bottom, scroll downward.
  - Uses `requestAnimationFrame` for smooth continuous scroll
    while the pointer stays in the edge zone.
- Attach the hook at the `DndProvider` level in LineupView so
  it covers all drag operations (bench card → slot, slot →
  slot, token → slot).

### Acceptance

- [ ] Dragging a card from the bottom of the cards grid
      toward the top of the page auto-scrolls the page up.
- [ ] The auto-scroll stops when the pointer leaves the edge
      zone OR the drop completes.
- [ ] No conflicts with existing DnD behavior.
- [ ] Works across the cards grid, bench, and token tray.

### Trade-offs

- **Custom hook instead of `react-dnd-scrolling`.** The
  library has heavier abstractions; a small hook is cleaner
  for our case. If we need more scroll-during-drag features
  (container-specific scroll, multiple scroll zones), we
  revisit.
- **80px edge zone.** Tuneable. Too large = accidental
  scrolling; too small = hard to trigger.

---

## 97. `/collection` page deletion

### Goal

Hard-delete the collection surface. Nav cleanup. Old deep-
links get 404'd; the modal's `?card={id}` URL pattern already
works under `/lineup` so share-links mostly survive.

### Scope

- Delete:
  - `src/app/(app)/collection/page.tsx`
  - `src/app/(app)/collection/collection-grid.tsx`
  - `src/app/(app)/collection/[cardId]/page.tsx` (legacy
    redirect)
- Remove the "Collection" entry from the sidebar nav
  (`src/components/layout/sidebar.tsx`).
- No redirect: paths return 404. Acceptable since the
  surface hasn't shipped to external users.

### Acceptance

- [ ] `/collection` 404s.
- [ ] Sidebar doesn't list Collection.
- [ ] No TS references to the deleted components.
- [ ] Card deep-links on `/lineup?card={id}` still work.

### Trade-offs

- **No redirect** — a small number of any-existing bookmarks
  break. Acceptable pre-launch.

---

## 98. Not in scope for v1.19

- Baserunners + pitcher-on-mound (stays as Phase 31 spec,
  built later).
- Onboarding flow pass.
- Empty / error state sweep.
- Virtualization of the cards grid (unnecessary at
  collection_cap = 100).
- Mobile / tablet layout for the cards grid.
- Standard parked items.

---

# Phase 33 — v1.19.1 (Card detail sidebar swap + independent scroll)

Two small follow-ups after Phase 32 shipped. User caught that
Phase 30.4 had replaced the sidebar-swap card detail with a
modal overlay — that was the wrong direction. This phase
restores the pre-P30.4 behavior and also gives each column
its own scroll container so the sidebar doesn't drag along
with the main page when it's taller than the viewport.

---

## 99. Card detail sidebar swap restored + independent scroll

### Goal

Revert the P30.4 modal-overlay card detail and bring back the
sidebar-swap pattern. The right sidebar should switch between
the default AppSidebar and CardDetailPanel based on the
`?card={id}` URL param. Also: left column (lineup + cards
grid + tokens) and right column (sidebar) should scroll
independently — hovering the sidebar scrolls the sidebar only,
hovering the main area scrolls the main area only.

### Scope

- Restore sidebar-swap routing: `<aside>` renders either
  `<AppSidebar>` or `<CardDetailPanel>` based on `?card=id`.
- Delete `src/components/card/CardDetailModal.tsx` (no longer
  referenced).
- Drop the modal render from LineupView.
- Keep URL-param routing from P30.4 so back/forward and
  shareable links still work.
- LineupShell: switch root from `min-h-full` → `h-full`; each
  column carries its own `overflow-y-auto`.
- Tag left column `data-scroll="lineup-main"`, aside
  `data-scroll="lineup-sidebar"`.
- `useAutoScrollOnDrag` targets `[data-scroll="lineup-main"]`
  instead of the `<main>` element so drag-to-scroll only
  drives the left column.

### Out of scope

- Sidebar restructure (pushed to Phase 34).
- Scrollbar styling (pushed to Phase 34).

---

# Phase 34 — v1.19.2 (Sidebar redesign + subtle scrollbars)

The right sidebar had accumulated density: contest header +
live score chip + status pill + team summary + box score +
event feed + submit controls, all stacked. Team summary
duplicated info that already lives in the header + profile
drawer. There was no close affordance on the card detail
swap — users had to navigate away by clicking elsewhere.
And scrollbars sat visible the whole time even when nothing
was scrolling, adding visual noise to both columns.

This phase tightens all three: redesign the sidebar, add a
Back button to the card detail shell, and make scrollbars
auto-fade in/out on scroll activity.

---

## 100. Sidebar redesign — cut team summary, reorder, Back button

### Goal

Rebuild the lineup sidebar around what the user actually
needs in each state (building vs. submitted/live/final). Cut
redundant content, tighten the visual hierarchy, and put the
most important signal at the top. Also add a Back button to
the card-detail sidebar swap — previously there was no
obvious dismiss affordance.

### Scope — AppSidebar rewrite

- Cut the team summary block entirely. Team identity lives in
  the header; career stats live in the profile drawer. The
  sidebar shouldn't duplicate either.
- Drop the unused `summary` variant of `<AppSidebar>` that
  rendered on `/collection` before Phase 32 deleted the route.
  Sidebar is lineup-only now; simplify the props type to match.
- Merge Live Score + Status into a single `ScoreHeadline`
  block at the top of the post-submit sidebar:
  - "Live" or "Final" label (depending on entry.status).
  - Secondary line: "Waiting on first pitch" (submitted) /
    live-progress label ("3 games live · 2 final") / "Contest
    final" based on state.
  - Big score number (liveScore or finalScore as appropriate).
- Post-submit order becomes: ScoreHeadline → BoxScoreSection
  → EventFeed. (Was: LiveScore + StatusChip + TeamSummary +
  BoxScore + EventFeed.)
- Building-state order unchanged: Contest header → Readiness
  → Projected → Auto-sub → Submit.

### Scope — Back button on detail sidebar

- Wrap `<CardDetailPanel>` in a local `DetailSidebar`
  component in LineupView that adds a Back button row above
  the panel: `<ArrowLeft /> Back` in a ghost-variant button.
- `onClose` handler strips `?card` from the URL via
  `router.replace`, which causes the sidebar to swap back to
  `<AppSidebar>`.
- No change to `CardDetailPanel` itself — just a wrapper.

### Files

- `src/components/layout/AppSidebar.tsx` — full rewrite.
- `src/lib/lineup/types.ts` — drop `teamSummary` from
  `LineupViewProps`.
- `src/app/(app)/lineup/page.tsx` — drop `getTeamSummary` call
  from the parallel fetch.
- `src/lib/profile/team-summary.ts` — delete.
- `src/app/(app)/lineup/lineup-view.tsx` — add local
  `DetailSidebar` component + `handleCloseDetail` callback.

---

## 101. Subtle auto-fading scrollbars

### Goal

Scrollbars sat visible the whole time on both the left column
and the right sidebar, adding visual noise even when nothing
was moving. Make them hidden by default, fade in briefly when
scrolling, and fade out ~700ms after the last scroll tick. On
macOS Chrome this matches the native overlay-scrollbar
behavior; on Windows/Linux Chrome it brings them in line.

### Scope

- Global CSS in `src/app/globals.css`:
  - `[data-scroll]` hides the scrollbar via
    `scrollbar-width: thin` + transparent colors (Firefox) and
    `::-webkit-scrollbar-thumb { background: transparent }`
    (Webkit).
  - `[data-scroll][data-scrolling="true"]` swaps the thumb to
    `color-mix(in oklab, var(--text-3) 55%, transparent)`.
  - 300ms `color-mix` transition on both layers so the thumb
    glides in / out rather than popping.
- `useScrollFade` hook (`src/components/lineup/use-scroll-fade.ts`):
  - Document-level scroll listener in the capture phase (scroll
    events don't bubble, so capture is required to catch any
    descendant scroller).
  - On scroll of any `[data-scroll]` element, sets
    `data-scrolling="true"` and starts a 700ms timer to clear
    it. Fresh scroll ticks reset the timer.
  - Per-element timers in a WeakMap so multiple scrollers can
    be active simultaneously.
- Wire `useScrollFade()` into LineupView next to
  `useAutoScrollOnDrag()`.

### Files

- `src/app/globals.css` — scrollbar rules.
- `src/components/lineup/use-scroll-fade.ts` — new hook.
- `src/app/(app)/lineup/lineup-view.tsx` — call the hook.

---

## 102. Not in scope for v1.19.2

- Sidebar content in building state (Readiness / Projected /
  Auto-sub / Submit) — unchanged this phase.
- Status chip merger into ScoreHeadline for the *building*
  state — ScoreHeadline only renders post-submit.
- Virtualization of EventFeed or BoxScore.
- Baserunners + pitcher-on-mound (still Phase 31 spec).
- Mobile / tablet sidebar layout.
- Empty / error state sweep.

**Renumbering note:** §99 is reused between Phase 33
(independent scroll containers) and Phase 34 (sidebar
redesign). Phase 34's spec section is §100 to avoid
collision with the P33 code references in `LineupShell.tsx`
and `use-autoscroll-on-drag.ts`. Code tagged `§100 (Phase 34)`
covers the sidebar rewrite + the Back-button detail wrapper;
`§101 (Phase 34)` covers the scrollbar fade behavior.

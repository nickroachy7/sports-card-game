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

---

# Phase 35 — v1.20 (Pre-live sidebar + multi-select + scrollbar + detail cleanup)

Four coordinated changes to the lineup page. Phase 34 gave
the post-submit sidebar a clean three-block layout
(ScoreHeadline / BoxScore / EventFeed); this phase brings
the pre-submit sidebar to structural parity. It also adds
multi-select to the cards grid (bulk quick-sell + vault),
hides scrollbars completely everywhere on the lineup page,
and cleans up duplicate buttons in the card detail panel.

---

## 103. Pre-live sidebar mirrors live layout

### Goal

The current building-state sidebar stacks Readiness +
Projected + Auto-sub + Submit as four roughly-equivalent
chunks. The post-submit sidebar has a clear hierarchy:
headline → detail → feed/actions. Bring building state to
the same structure so the sidebar layout doesn't shift
when you submit, and so you can watch the roster fill in
as you draft.

### Three blocks

Building-state sidebar maps to the same three spatial
roles as post-submit:

- **DraftingHeadline** (top). Parallels `ScoreHeadline`.
  - Label: `DRAFTING` (uppercase, tracked).
  - Status line: `X / 10 slots filled`.
  - Big number: projected FP (sum of career-FP-average across
    filled slots, or just `—` if we don't have projections
    wired yet — v1 can start with slots-filled count as the
    big number and get fancier later).
- **RosterSection** (middle). Parallels `BoxScoreSection`.
  - One row per slot in canonical order (C / 1B / 2B / 3B /
    SS / OF1 / OF2 / OF3 / SP1 / SP2).
  - Filled row: position chip · player name · tier badge ·
    contract plays (e.g. `14/15`).
  - Empty row: position chip · `Drag a {position}` placeholder
    in `text-3` color. Dashed-border feel so empty vs. filled
    is obvious at a glance.
  - Scrollable with hidden scrollbar (§105).
  - Rows are not draggable; they're just a readout.
- **SubmitSection** (bottom). Parallels `EventFeed` spatial
  role but does action work.
  - Auto-sub toggle (`Off` · `Injury only` · `Injury + late
    scratch`).
  - Submit button — primary when `readiness === 'ready'`,
    ghosted when incomplete, with tooltip `X slots remaining`.

### State transitions

- `entry.status === 'building'` → the three blocks above.
- Any other status → unchanged post-submit layout from
  Phase 34 (ScoreHeadline / BoxScore / EventFeed).

### Files

- `src/components/layout/AppSidebar.tsx` — new
  `DraftingHeadline` + `RosterSection` subcomponents;
  building-state render uses them.
- (Existing `BoxScoreSection` / `EventFeed` / `ScoreHeadline`
  untouched.)

---

## 104. Multi-select on cards grid

### Goal

Bulk card actions. Users should be able to select multiple
cards at once and act on the whole batch — primarily for
quick-selling a pile of 0-FP rookies at season start, or
vaulting a batch at season end.

### Entry / exit

- A `Select` chip sits in the cards grid's filter row, next
  to `ALL / HITTERS / PITCHERS`. Click it to toggle select
  mode on.
- While select mode is on, the chip becomes `Done`. Clicking
  exits and clears the selection.
- `Esc` also exits.
- Exiting preserves nothing; next entry starts empty.

### Selection UX

- Click a card to add to selection; click again to remove.
- Selected cards get two signals: checkmark badge in the
  top-right corner + a 2px border in `var(--tier-gold)` or
  `var(--text)` (tier-agnostic; don't conflict with tier
  frame).
- Slotted cards ARE selectable. Their "IN LINEUP" overlay
  stays visible on top of the selection visuals.
- Drag-and-drop is disabled in select mode to avoid
  conflicts with click-to-toggle.

### Sidebar selection panel

When `selectionMode === true`, the sidebar swaps from
`AppSidebar` (or `DetailSidebar`) to a `SelectionPanel`:

- Top: count + action totals. Example:
  `3 selected · 30 coins quick-sell · 2 lineup slots will clear`
- List: compact rows — position chip · player name · tier
  badge · contract plays. Same style as the roster block.
- Bottom: action buttons stacked.
  - **Quick-sell (X coins)** — confirm dialog. If any
    selected cards are slotted, dialog warns: `2 of these
    are in your lineup and will be removed`. Then fires a
    per-card quick-sell in a transaction.
  - **Add to vault (X)** — confirm dialog. Blocks + errors
    if the batch would exceed the 10-slot cap.
  - **Clear** — ghost button; same as `Esc` / `Done`.

### State scope

- Multi-select lives in component state on LineupView;
  doesn't persist across navigation or reloads.
- URL doesn't track it; the `?card=id` detail route still
  wins if present (no conflict since you'd have to
  explicitly enter select mode).

### Files

- `src/components/lineup/CardsPanel.tsx` — add `Select`
  chip + select-mode prop + click-to-select handler.
- `src/components/lineup/BenchCard.tsx` (the per-card
  component inside the grid) — accept `isSelected` /
  `selectMode` props, render checkmark + border.
- `src/components/lineup/SelectionPanel.tsx` (new) —
  sidebar swap contents.
- `src/app/(app)/lineup/lineup-view.tsx` — owns
  `selectionMode` + `selectedIds` state; wires to
  CardsPanel and sidebar swap; routes Quick-sell via a
  new `quickSellCards` server action (batches into a
  single SQL fn call) and Vault via the existing
  `vault_cards` path called per id inside a transaction.
- `src/app/actions/cards.ts` — add `quickSellCards(ids[])`
  batch wrapper around the existing per-card quick-sell
  SQL fn.
- `src/app/actions/vault.ts` — add `addCardsToVault(ids[])`
  batch wrapper.

### Out of scope

- Select-all / select-by-filter shortcuts (v2).
- Bulk tier-up / extend contract (v2).

---

## 105. Invisible scrollbars on lineup page

### Goal

Scrollbars on the lineup page add visual noise without
earning their horizontal real estate. Phase 34 made them
auto-fade; the fade still briefly reserves width during the
fade transition, and the visible state during scroll is
persistent enough to feel heavy. Hide completely.

### Behavior

- On `[data-scroll]` containers inside `<main>` (left column
  `lineup-main`, right column `lineup-sidebar`), hide the
  scrollbar entirely — Webkit via
  `::-webkit-scrollbar { display: none }`, Firefox via
  `scrollbar-width: none`.
- Scroll functionality itself is preserved — wheel, trackpad,
  keyboard arrows, spacebar all still work.
- The P34 `useScrollFade` hook becomes a no-op for these
  containers; either delete the hook entirely or keep it
  available for future surfaces (e.g. long-form modals)
  that might want the auto-fade.
- Global rules from P34 stay; this phase overrides them
  inside the lineup page.

### Files

- `src/app/globals.css` — override `[data-scroll]` styles
  within `main[data-scroll-surface="lineup"]` (or the
  equivalent scoping selector) to hide completely. Keep
  the P34 rules as a general default.
- `src/components/lineup/LineupShell.tsx` — add the scoping
  `data-scroll-surface="lineup"` attribute to the shell
  root so the scoped CSS targets only this page.
- `src/app/(app)/lineup/lineup-view.tsx` — remove the
  `useScrollFade()` call; leave the hook file for now but
  comment out the call with a back-reference.

---

## 106. Card detail cleanup

### Goal

The card detail panel currently shows an **ACTIONS** block
(Extend contract / Quick-sell / Add to vault) AND a
**LINEUP ACTIONS** block with a duplicate `Add to vault`
button. Extend contract is styled as a text row while
Quick-sell and Add-to-vault are buttons. A long vault
explainer paragraph takes up ~5 rows.

### Changes

- Remove the `LINEUP ACTIONS` block entirely. Single
  Actions block.
- Style **Extend Contract** as a button to match Quick-sell
  + Add-to-vault. Stack all three as equally-weighted
  outline buttons.
- Vault explainer text (`Vaulting freezes a card for the
  season — it can't play again. Counts toward the 10-card
  vault cap. Destroying a vaulted card returns ~15% of its
  quick-sell value.`) moves behind a small `(?)` info icon
  next to the Add-to-vault button. Popover reveals the
  paragraph; panel stays tight.
- Action button ordering (top → bottom): Extend Contract →
  Quick-sell → Add to vault.

### Files

- `src/components/card/CardDetailPanel.tsx` (or whichever
  file owns the Actions + Lineup-Actions sections).

---

## 107. Not in scope for v1.20

- Pre-live projected FP — if the projection isn't already
  wired, the DraftingHeadline big number can fall back to
  slots-filled count. Full projection comes later.
- Select-all or filter-driven multi-select shortcuts.
- Bulk tier-up / bulk contract extend.
- Bulk-vault overflow rebalancing (today just errors if
  over cap).
- Building-state sidebar mobile / tablet layout.
- Baserunners + pitcher-on-mound (still Phase 31 spec).

---

# Phase 36 — v1.21 (Cards header + /shop kill + pack reveal redesign)

Three coordinated changes that all touch the lineup page.

1. **Cards section header**. Compact today's three-row
   header (count / filters / chips) into a single row.
2. **Kill `/shop`**. Replace with a floating action button
   on /lineup and a buy-packs modal with Daily + Standard
   × 1 / × 5 / × 10.
3. **Pack reveal redesign**. All purchased cards stacked
   as a deck; tap the top to flip + slide into a revealed
   row; per-card Quick-sell / Add-to-vault + Done button
   when all are revealed.

---

## 108. Cards/Tokens section header — single row

### Goal

Today's layout stacks three rows of chrome above the cards
grid: `CARDS X available · Y in lineup | ALL | HITTERS |
PITCHERS | Search | Select` on row 1, tier chips on row 2,
game-state chips on row 3. A visible screenshot showed the
header eating ~120px before any cards render. Condense to a
single row.

### Layout

```
CARDS 22·6   ALL|HITTERS|PITCHERS   [Tier ▼]   [State ▼]   🔍 Search…   Select
```

- **Count**: `CARDS 22·6` (dot-separator between available
  + in-lineup). Full copy moves to a `title=""` tooltip if
  needed; the dot version is unambiguous in context.
- **Position**: segmented pill trio stays as-is — it's
  already compact and visible at a glance.
- **Tier**: collapse to a dropdown-style pill: `Tier`
  label + current selection + count badge. Click opens a
  small popover with the current chips (ALL / Bronze /
  Silver / Gold / Diamond w/ counts). Same interaction as
  today, just hidden when not in use.
- **State**: same pattern as Tier — collapsed pill +
  popover. Current selection label appears on the pill
  (e.g. `State: Live`) so you always see what's active.
- **Search + Select** end the row, unchanged.

### Wrap behavior

- Row wraps naturally on narrow viewports (< 900px)
  rather than overflowing. Order is left-to-right as
  written above; wrap can push Search + Select to a second
  line, but Tier + State dropdowns stay inline with the
  count + position pills.

### Files

- `src/components/lineup/CardsPanel.tsx` — header refactor;
  the existing `TierChip` + `GameStateChip` components move
  into popover content (a new `FilterPopover` wrapper
  handles the pill + popover pattern).
- (`src/components/ui/popover.tsx` — if the Radix popover
  primitive doesn't exist yet, add a thin shadcn wrapper
  over `@radix-ui/react-popover`.)

### Out of scope

- Icon-only filter pills (we keep labels; icons alone feel
  opaque for new users).
- Hiding the count when the collection is empty — unchanged.

---

## 109. Kill `/shop`; lineup floating action button + buy modal

### Goal

The `/shop` page exists as a standalone route, but the
user's only regular action there is "open a pack." That's
a single CTA per pack type. A full page for it is
over-indexed. Replace with an entry-point on /lineup.

### Changes

- **Delete `/shop`**.
  - Remove `src/app/(app)/shop/page.tsx` +
    `shop-client.tsx`.
  - Remove `/shop` from the nav sidebar
    (`src/components/layout/sidebar.tsx`).
  - Remove the shop link + Package icon (+ its gold-pulse
    daily-ready indicator) from
    `src/components/layout/header.tsx`.
  - Keep the header's coin-balance display.

- **Add `BuyPacksFab`** — bottom-right floating action
  button on /lineup.
  - 56px circle, `var(--tier-gold)` bg, Package icon,
    subtle elevation shadow.
  - Pulses gold when `daily_pack_ready` is true (migrated
    from the header's pulse logic).
  - Hidden while pack reveal is active (no overlap with
    the modal).
  - Stays visible in all other lineup states (building /
    submitted / live / final). Packs aren't contest-
    locked; nothing prevents buying mid-live-contest.
  - Positioned above the cards grid using
    `position: fixed` so scrolling doesn't move it.

- **`BuyPacksModal`** — opens on FAB click. Contents:
  - Header row: coin balance + close (×).
  - **Daily pack** section (top). Visible when
    `daily_pack_ready === true`; otherwise shows
    countdown. Single `Claim daily pack` button.
  - **Standard packs** section (bottom). Three quantity
    pills: `× 1 (N coins)`, `× 5 (N×5 coins)`,
    `× 10 (N×10 coins)`. No bundle discount in v1 — flat
    multiplication. Quantity pills are mutually exclusive
    radios; confirm button beneath reads
    `Buy 5 packs (500 coins)` with live total.
  - Coin-balance-check: confirm button disabled when
    balance < total, with subtitle `Need N more coins`.
  - Confirming closes the modal and drops straight into
    pack reveal (§111).

### Daily-pack eligibility wiring

- Page layout already computes `isDailyPackReady` and
  passes it to the header. Route that prop to
  `LineupView` → `BuyPacksFab` + `BuyPacksModal` instead
  of the header. Header keeps coins; everything else moves.

### Files

- `src/components/pack/BuyPacksFab.tsx` (new).
- `src/components/pack/BuyPacksModal.tsx` (new). Adapts
  the shop-client's pack-card grid into a compact modal.
- `src/app/(app)/layout.tsx` — pass `dailyPackReady` to
  `LineupView` (new prop; plumbing only).
- `src/app/(app)/lineup/lineup-view.tsx` — state for
  modal open/closed + pack-reveal cards; renders the FAB
  + modal + reveal orchestrator.
- `src/components/layout/header.tsx` — remove shop link +
  pulse logic.
- `src/components/layout/sidebar.tsx` — remove /shop nav.
- `src/app/(app)/shop/page.tsx`, `shop-client.tsx` —
  delete.

### Out of scope

- Premium pack type — stays in the DB + the `open_pack`
  SQL fn, but drops out of the buy-modal surface for v1.
  Can reintroduce as a third section later.
- Purchasing UI animation beyond the normal modal fade.

---

## 110. `openPacksBatch` server action

### Goal

Opening 5 or 10 packs in one purchase should hit the
server once, not N times. A batched server action loops
the existing `open_pack` SQL fn and aggregates the card
IDs + dupe metadata, matching the P35 bulk-quick-sell
pattern.

### Signature

```ts
// src/app/actions/packs.ts

export type OpenPacksBatchResult = {
  openings: Array<{
    openingId: string;
    cardIds: string[];
    cardResults: OpenPackCardResult[]; // existing type
    tokenIds: string[];
    coinCost: number;
    duplicateCount: number;
    coinsFromDupes: number;
  }>;
  totalCoinCost: number;
  balanceAfter: number;
  failures: Array<{ index: number; code: string; message: string }>;
};

export async function openPacksBatch(input: {
  packType: "daily" | "standard";
  quantity: 1 | 5 | 10;
}): Promise<ActionResult<OpenPacksBatchResult>>;
```

### Behavior

- Validate input (zod). Max `quantity === 1` for
  `packType === "daily"`.
- Pre-flight coin check: `quantity × pack_prices_coins[packType]`
  against `user_season_state.coins`. Return early with a
  friendly error if short.
- Loop `open_pack` SQL fn serially inside the action. If
  pack K fails (insufficient coins due to drift, collection
  cap, etc.), record the failure and stop the loop — don't
  continue opening after the first failure; the user's
  expectation is "all or part."
- `balanceAfter` is the last successful call's balance; if
  zero successes, pull the current balance.
- Revalidate `/lineup` layout on success (per-card opens
  already revalidate individually; this is a guard).

### Dupe handling

- Per-pack dupes (pre-existing on the card table) still
  go through the dupe-resolution flow in the reveal UI.
  The action returns each opening's dupe metadata intact;
  reveal UI stitches them together.

---

## 111. Pack reveal redesign — stack → peel → row

### Goal

Current reveal is a carousel that shows one face-down
card at a time, centered. User ask: show all N cards as
a stacked deck; tap the top to peel it off; it flips in
place then slides to its target position in a revealed
row below; repeat until the deck is empty; then show
per-card actions + a `Done` button.

### Stages

1. **Deck**. Stack of N face-down `PackCardFlip`s
   z-stacked at center, each offset by 2px down + 1px
   right for depth. Top card is the active tap target.
2. **Peel**. Clicking the top card:
   - Kicks off the existing 3D flip (back → face).
   - Simultaneously translates the card from the stack
     position to its target slot in the revealed row.
   - Next card-back becomes top of stack + active.
3. **Revealed row**. Below the deck, an empty row grows
   as cards slide in. Grid layout with fixed slot
   positions so cards always land in consistent spots.
4. **Actions enabled**. Once the deck is empty:
   - Under each revealed card: two outline buttons —
     `Quick-sell (N coins)` and `Add to vault`.
   - `Done` button centered below everything, primary
     variant, enabled only when stack is empty.
5. **Dupe branch**. If a card is a dupe, after its flip
   lands in the row we show the dupe resolution inline
   under that card (compact — new vs existing, pick one,
   ghost the other). The Done button waits for all dupe
   decisions before enabling.

### Layout rationale

- Stack at center keeps the reveal focused; the row
  below visually fills in as progress.
- Per-card actions avoid forcing the user to bounce back
  to the cards grid to triage a big pull.
- Done button is the only exit — clicking it refreshes
  `/lineup` and dismisses the overlay.

### Celebration integration

- `StarPullBurst` keeps firing on flip-reveal for
  Gold/Diamond (star tier) and Silver (starter tier).
  Trigger point moves from the carousel reveal callback
  to the per-card flip-complete callback; no other
  changes.

### Exit rules

- Done button: only exit. Escape / click-outside are
  disabled while reveal is active.
- If the tab unloads mid-reveal, cards are already in
  the DB — user sees them in `/lineup` on next load.
  Reveal state does NOT survive reload (acceptable).

### Files

- `src/components/pack/PackOpenerModal.tsx` — major
  rewrite around the new stage machine. Reuses
  `PackCardFlip` + `StarPullBurst` + `PackDupePanel`
  (possibly re-styled for inline use).
- `src/components/pack/PackRevealStack.tsx` (new) —
  deck + peel behavior.
- `src/components/pack/PackRevealRow.tsx` (new) —
  revealed-row grid + per-card action rows.
- `src/app/(app)/lineup/lineup-view.tsx` — owns the
  reveal overlay's open state; renders modal when cards
  are queued.

### Out of scope

- Sound effects on flip (no audio pipeline yet).
- Particle trails between stack and row.
- Double-tap "reveal-all" shortcut. User can click
  through in rhythm; shortcut comes later if requested.

---

## 112. Not in scope for v1.21

- Premium pack type in the buy modal (code path stays
  wired; UI hidden).
- Bundle discounts for 5×/10× (flat multiplication in
  v1; economy tuning later).
- Shop archival history / receipts — no persistent buy
  log surface.
- Opening packs outside /lineup (FAB lives only there).
- Baserunners + pitcher-on-mound (still Phase 31 spec).
- Virtualization of pack reveal for very large pulls
  (> 50 cards). Current max is 10 × 5 = 50, which fits
  in a row at reasonable card size.
- Daily pack notification on other surfaces; header
  chime stays owned by the header only.

---

# Phase 37 — v1.22 (Remove-from-slot + token hover tooltips)

Two small lineup-polish asks. Both are discoverability fixes.

1. Add a one-click remove affordance on filled lineup slots
   so users don't have to drag a card off to free the slot.
2. Put hover tooltips on tokens (both in the tray and when
   applied to a lineup card) so users know what each one
   does without memorizing the short labels.

---

## 113. Remove-from-slot button

### Goal

Free a lineup slot with one click. Today's only option is
drag-and-drop the card away, which works but isn't obvious
and requires a decent amount of pointer travel.

### Scope

- Small circular **×** button in the **top-left** corner of
  every filled `<LineupSlot>`. Hidden by default, fades in
  on slot hover.
- Click → instant remove (no confirm). Optimistic update
  flows through the existing `handleCardDropped(position,
  null, null)` path in `LineupView`.
- Only rendered when the slot is unlocked (building state
  OR post-submit but the slot's game hasn't started). Locked
  slots show the lock icon instead — no remove affordance.
- Keyboard accessible (button element, focus ring).

### Files

- `src/components/lineup/LineupSlot.tsx` — add the remove
  button; accept a new `onRemoveStarter?: () => void` prop.
- `src/components/lineup/LineupGrid.tsx` — pass through the
  handler per slot.
- `src/app/(app)/lineup/lineup-view.tsx` — wire to
  `handleCardDropped(pos, null, null)`.

---

## 114. Token hover tooltips (tray + applied)

### Goal

Tokens show as compact pips with short labels (QS, K8, HR,
2H). New users can't tell what they do. Hover should
surface the full name + trigger condition + bonus FP.

### Scope

- New `src/components/ui/tooltip.tsx` — shadcn-style
  Radix Tooltip wrapper using real project tokens (matches
  the P36 dialog/alert-dialog fix pattern).
- New `src/components/token/TokenTooltipContent.tsx` —
  reusable body: token name (bold) · bonus FP chip · one-
  line rule text from the existing `tokenRuleText()` helper.
- Wrap `TrayTokenPip` in `TokenTray` with the tooltip.
- Wrap `AppliedTokenBadge` with the same tooltip so the
  hover UX is identical whether the token is floating in the
  tray or attached to a lineup card.

### Out of scope

- Applied-to-player-name line in the tooltip (user didn't
  ask for it; can add later if useful).
- Tooltip on hover for cards themselves — different scope.

---

## 115. Not in scope for v1.22

- Touch-device tap-to-reveal tooltip pattern (web desktop
  launch; hover-only is fine).
- Bulk remove from multiple slots at once.
- Baserunners + pitcher-on-mound (still Phase 31 spec).

---

# Phase 38 — v1.23 (Drag feel polish + photo framing)

Four drag-feel asks plus one unrelated photo cutoff fix.

1. Tighter cursor follow + snappier motion everywhere.
2. When a card or token is picked up, the source disappears
   entirely (no ghost remains where it was).
3. Invalid drops snap back fast (~150ms), not the current
   0.55s spring-shake.
4. Weighty drop-in — valid drops settle with a subtle
   bounce so landing feels intentional.
5. Player photos cut off oddly at the chin in some Card
   renders; shift the object-position so faces sit fully
   in frame without changing the card size.

---

## 116. Drag ghost tuning — tighter + snappier

### Goal

The drag ghost currently trails the cursor with a noticeable
springy lag (stiffness 400, damping 30, mass 1). User wants
tighter tracking and across-the-board snappier motion.

### Changes

- `CardDragLayer.tsx` + `TokenDragLayer.tsx`:
  - Spring: `stiffness: 700, damping: 34, mass: 0.7` (was
    `400 / 30 / 1`). Tighter follow, less overshoot.
  - Keep the reduced-motion critical spring as-is.
- Velocity-based card rotation: bump the multiplier slightly
  (`vx * 0.004`, cap ±3°) so the tilt reacts faster without
  becoming jittery.

### Files

- `src/components/card/CardDragLayer.tsx`
- `src/components/token/TokenDragLayer.tsx`

---

## 117. Source hides fully on pickup

### Goal

Currently the source card (bench, lineup slot, token tray)
dims to `opacity-40` while being dragged. The user's mental
model is "the card is in my hand" — there shouldn't be a
ghost at the source.

### Changes

- `BenchCard.tsx`: `opacity-40` → `opacity-0 pointer-events-none`.
- `LineupSlot.tsx` (filled-slot drag source div): same.
- `TrayTokenPip.tsx`: currently doesn't fade the source pip
  at all — add `opacity-0 pointer-events-none` when
  `isDragging`.

### Layout note

Because the source is `opacity-0` not `display-none`, the
grid / tray layout doesn't shift during the drag. That's
intentional (matches option A from the interview).

---

## 118. Invalid drop — fast snap-back (~150ms)

### Goal

Current `BounceBack` animates the ghost over 0.55s with a
small side-to-side shake. Feels slow. User wants a fast
bounce back to source (~150ms), no shake.

### Changes

In both `CardDragLayer.tsx` and `TokenDragLayer.tsx`
`BounceBack`:

- `duration: 0.55` → `0.15` on the x transition.
- Drop the shake keyframes; tween straight from
  `lastPointer` → `initialSourceOffset`.
- `ease: "easeOut"` stays (reads as "snapping back to rest").
- After the snap completes, the ghost unmounts instantly
  (no lingering shake window).

---

## 119. Drop-in settle bounce

### Goal

When a valid drop lands, the destination card should briefly
settle rather than appearing statically. Makes a drop feel
like placing a real card.

### Changes

- Add `dropSettleKey` state to the drop-target slot: a
  counter that increments whenever a drop is accepted.
- Wrap the slot's card render in a `motion.div` with
  `animate={{ scale: [0.92, 1.03, 1] }}` keyed by
  `dropSettleKey` so each successful drop retriggers the
  keyframes.
- 180ms total duration. Skip when `useReducedMotion()` is
  true.

### Files

- `src/components/lineup/LineupSlot.tsx` — wrap the filled-
  slot card content.
- `src/components/lineup/LineupGrid.tsx` — no changes
  needed; `onCardDropped` already fires the trigger.

---

## 120. Player photo framing

### Goal

Some player headshots cut off the chin / jaw where the
photo area ends and the name banner begins. Fix without
changing the card's outer dimensions.

### Changes

- `mlbamHeadshotUrl()`: bump the default width. Both `small`
  and `medium` sizes move to a 240px source width (was 120).
  Crisper at all render scales; adequate for Retina.
- `CardPhoto.tsx`: add `object-position: center 25%` so the
  image's visible crop window sits higher (more head visible
  at the top, chin stays in frame). `object-cover` kept for
  consistent fill.
- Test with a handful of tight-framed MLBAM shots (Nolan
  Schanuel, Tyler Heineman) + loose-framed (Michael Busch,
  Trea Turner) to make sure neither extreme loses face
  integrity.

---

## 121. Not in scope for v1.23

- Redesigning the drag ghost itself (size, shadow intensity,
  etc.) — keeping current visual; only physics change.
- Haptics / sound on drop. No audio pipeline yet.
- Changing card dimensions.
- Player photo crop overrides per-card (one global
  `object-position` for now).

---

# Phase 39 — v1.24 (Unified sidebar: no submit, slot-level locks only)

Redesign the right sidebar around the real game dynamic:
there's no single moment when a lineup "submits." Different
games start at different times. A card placed in a slot
commits implicitly when that player's game starts; slots
lock individually thereafter.

The sidebar becomes one consistent layout for the whole
day: persistent top section (contest name, headline,
roster), and a tabbed bottom (Lineup Actions, Live Events).

---

## 122. Unified sidebar structure

### Goal

Kill the building-state vs post-submit split that's driven
sidebar rendering since Phase 30. One layout, used
throughout the day, adapts per-block based on game state.

### Structure (top → bottom)

1. **ContestHeader**. Contest name + date, no lock
   countdown. Static.
2. **SidebarHeadline**. Adaptive status block — see §123.
3. **RosterSection**. Persistent per-slot rows with
   position · player · game-state chip · adaptive FP — see
   §124.
4. **Tabs** pinned below the roster — see §125.
   - **Lineup Actions**: Auto-sub mode + readiness warnings.
   - **Live Events**: existing EventFeed, scoped to your
     lineup.

### State-driven conditional blocks

- `SidebarHeadline` adapts:
  - No slots locked yet → "Drafting · N/10 slots filled"
    + projected FP (muted).
  - Any slot locked → "Live · X.X FP" + status line
    (`live N · final M`).
  - All slots' games final → "Final · X.X FP" + "Contest
    final".
- `RosterSection` always visible — the data in each row
  changes per game state; layout doesn't.
- Tab set is always the same two tabs.

### Files

- `src/components/layout/AppSidebar.tsx` — full rewrite
  around the unified structure; drop the
  `BuildingContent` / `PostSubmitContent` branch.
- `src/components/lineup/LiveEventsProvider.tsx` — no
  change, but gets mounted unconditionally now (see
  LineupView rewire below).
- `src/app/(app)/lineup/lineup-view.tsx` — mount
  `LiveEventsProvider` + `CardContractEventsProvider`
  regardless of `entryStatus` (so the Live Events tab has
  a feed to render even pre-lock).

---

## 123. SidebarHeadline — single adaptive block

### Goal

Replace the building-state `DraftingHeadline` and post-
submit `ScoreHeadline` with one component whose label and
score adapt through the day.

### States

| State          | Label row                    | Big number                  | Status line                              |
|----------------|------------------------------|-----------------------------|------------------------------------------|
| Drafting       | `DRAFTING`                   | `N/10` slots filled         | projected FP (muted) OR `first game 7:10p` |
| Partially live | `LIVE`                       | live FP total (emerald)     | `live N · final M`                       |
| All final      | `FINAL`                      | final FP total              | `contest final`                          |

Derivation:
- Locked-slot count > 0 AND any slot still not final →
  partially-live state.
- All slots final (or all started and now ended) → final.
- Else → drafting.

### Files

- `src/components/layout/AppSidebar.tsx` — new
  `SidebarHeadline` subcomponent replacing the two
  existing headline components.

---

## 124. RosterSection — single row per slot

### Goal

One persistent per-slot row that shows position, player,
game-state chip, and an adaptive FP cell. Replaces the
separate `RosterRow` (building) and `BoxScoreRow` (post-
submit) components.

### Row layout

```
POS   Player Name          [Game Chip]   FP
C     N. Schanuel          vs SF 8:10p   22.4
```

Grid: `[2rem | 1fr | auto | 3rem]`.

### FP cell behavior

- Game not yet started AND no projected FP → `—`.
- Game not yet started AND projected FP available →
  `22.4` in `text-3` (muted).
- Game live → running `live_fp` in `rgb(52,211,153)`
  (emerald).
- Game final → `final_fp` in `var(--text)`.
- Empty slot → `—` (dashed-placeholder row as today).

### Files

- `src/components/layout/AppSidebar.tsx` — new
  `RosterSection` subcomponent; `BoxScoreSection` +
  existing `RosterSection` retired.

---

## 125. Tabs — Lineup Actions + Live Events

### Goal

Two tabs below the roster. No settings, no box-score-
detail tab. Lives inside a shadcn `Tabs` primitive with
two triggers.

### Tabs

- **Lineup Actions**
  - Auto-sub mode (`Smart Auto` / `Manual Priority`)
    radios. Disabled once all slots are locked (no auto-
    sub possible for fully-locked contests).
  - Readiness warnings list: one row per affected slot
    with `!` glyph + reason (`contract expired`, `on IL`,
    `FA/DFA`, `2 plays left`). Empty state: "No warnings."
- **Live Events**
  - The existing `EventFeed` component, scoped to the
    user's `lineupPlayers`. No filter chips (v1).

### Files

- `src/components/layout/AppSidebar.tsx` — new tabs
  container using the existing `Tabs` primitive.
- `src/components/lineup/LiveEventsProvider.tsx` —
  provider always mounts in LineupView regardless of
  entry status (so Live Events tab isn't empty pre-lock).

---

## 126. Remove Submit button + global lock countdown

### Goal

No user-facing submission moment. The lineup commits
implicitly when each slot's game starts.

### Changes

- Drop the Submit button from the sidebar entirely.
- Drop the `lockCountdown` prop + ContestHeaderCard lock
  line.
- Drop `SubmitSection` from `AppSidebar`.
- Existing per-slot lock logic (polish spec §44) already
  enforces the "game started → slot locked" rule —
  nothing to change there.
- Existing server-side `contest.lineup_locks_at` logic
  stays — backend still flips `entry.status` at that
  moment for existing reconcile / auto-sub flows. It's
  just not user-visible anymore.

### Files

- `src/components/layout/AppSidebar.tsx` — drop Submit
  chunk and `SubmitSection` entirely.
- `src/app/(app)/lineup/lineup-view.tsx` — drop
  `handleSubmit` + `canSubmit` + `submitting` state + the
  Submit wiring.
- `src/lib/lineup/types.ts` — drop lock-countdown-
  related props that sidebar no longer needs (if unused
  elsewhere).

### Out of scope — backend follow-up

- Auto-flip `entry.status` on first slot lock (currently
  flips at `contest.lineup_locks_at` which is a contest-
  level timestamp). If slots can lock before the global
  lock time, `entry.status` may stay `building` past
  some slot locks. Trigger / cron adjustment deferred.
- Per-slot auto-sub at slot-lock time. Current auto-sub
  fires at contest-lock; finer-grained logic can land
  later.

---

## 127. Not in scope for v1.24

- Live event filter chips in the Events tab.
- Box-score-detail tab (stats per slot beyond FP).
- Changing contest-lifecycle semantics beyond the UI
  layer (backend `entry.status` transitions stay as-is).
- Manual-priority sub-order UI (third chunk of actions
  tab, deferred).
- Baserunners + pitcher-on-mound (still Phase 31 spec).

---

# Phase 40 — v1.25 (Token trigger indicators: pending / hit / missed)

User audit surfaced two things:

1. The scoring pipeline was gated on `entry.status IN
   ('submitted', 'live')` — and since Phase 39 removed the
   Submit flow, every entry is stuck in 'building'. Neither
   base FP nor token triggers were actually firing.
2. No server-side "missed" marker — `ta.triggered = NULL`
   meant both "not yet resolved" and "never fired."
3. No UI surfaces the triggered / missed state at all.

Migration 0043 already shipped the scoring-gate fix. This
phase adds the missing-state mark + the UI to show all three
states.

---

## 128. Mark un-triggered tokens missed at entry finalize

### Goal

`ta.triggered = true` is set in `_apply_game_event_to_lineups`
the instant a condition fires. The symmetric `triggered =
false` is never set anywhere. When all the entry's slot games
have ended, any application still `NULL` will never fire —
mark it `false` explicitly so the UI can tell pending from
missed.

### Changes

- `_finalize_contest_entry`: after the per-slot loop and the
  token-consumption UPDATE, add:
  ```sql
  UPDATE public.token_application ta
  SET triggered = false
  FROM public.contest_lineup_slot s
  WHERE s.contest_entry_id = p_entry_id
    AND s.token_application_id = ta.id
    AND ta.triggered IS NULL;
  ```
- No other function changes. `_apply_game_event_to_lineups`
  still flips `triggered = true` mid-game.

### Timing

- Hits: real-time (game event fires → slot receives bonus FP
  + `triggered = true` in same transaction).
- Misses: delayed until contest entry finalize. If Brady
  House's game ends at 4pm but Mookie Betts's game runs to
  11pm, Brady's missed tokens don't show "missed" until the
  whole entry wraps up.

### Out of scope — per-game reconciliation

- A per-game-end hook that marks misses the moment each
  individual player's game finalizes would give users
  faster feedback but adds a new SQL path. Phase 31-style
  polish; deferred.

---

## 129. AppliedTokenBadge — pending / hit / missed corner chip

### Goal

The AppliedTokenBadge in the lineup slot's corner adapts its
visual based on the token_application's `triggered` field:

| State    | `triggered` | Visual                                                       |
|----------|-------------|--------------------------------------------------------------|
| Pending  | null        | Current gold-bordered badge, no corner chip                  |
| Hit      | true        | Gold-bordered badge + small green ✓ corner chip (top-right)  |
| Missed   | false       | Dimmed badge (opacity 50%) + small red ✗ corner chip         |

### Scope

- `AppliedTokenBadge` takes a new `triggered?: boolean | null`
  prop.
- `TokenBadge` (the inner pip) accepts a new `state?: "pending"
  | "hit" | "missed"` prop that drives the dim opacity + the
  tier-gold border becoming muted in the missed case.
- Corner chip renders with Lucide `Check` / `X` icons in a
  small circle (14px), positioned absolutely at top-right of
  the badge.
- Data flow: `LineupView.slotFills[pos].appliedToken` already
  has `applicationId`; add `triggered` to the shape so
  LineupSlot can pass it through.

### Files

- `src/components/token/AppliedTokenBadge.tsx`
- `src/components/token/TokenBadge.tsx`
- `src/components/lineup/LineupSlot.tsx` (prop pass-through)
- `src/app/(app)/lineup/lineup-view.tsx` (slotFills shape +
  query already returns `triggered`)

---

## 130. Roster row — triggered glyph next to FP

### Goal

The sidebar roster row (`RosterRow` in AppSidebar) already
renders `pos · name · game chip · FP`. When the slot has an
applied token, append a tiny `✓` / `✗` glyph to the right of
FP so users see trigger state without looking at the lineup
card itself.

### Scope

- `RosterRow` accepts the slot's `appliedToken?.triggered`
  alongside existing fill data.
- Glyph sits after the FP cell at 8-9px tabular, with the
  same color semantics as the badge corner chip (emerald /
  muted red / nothing for pending).
- Desktop tooltip on hover (reuse existing Tooltip primitive):
  `Strikeout Game · hit · +8 FP` or `HR Bonus · missed`.

### Out of scope

- The tooltip (punt to a later phase if we want richer
  hover content; P37's `TokenTooltipContent` can be
  extended). For v1, just the glyph + default `title=""`.

---

## 131. Event feed — trigger rows with hit glyph

### Goal

The Events tab already streams per-event updates. When a
token fires, it should stand out as a distinct event row
with a green ✓ and the bonus FP called out:

```
✓  Brady House — HR Bonus triggered   +8 FP
```

### Scope

- The `game_event` table emits rows; `token_application.triggered`
  flips in the same transaction. The EventFeed client already
  subscribes via `LiveEventsProvider`.
- Check if the provider already captures token-trigger
  events as a feed entry; if not, add a dedicated feed row
  shape and wire it into the same Realtime channel.

### Out of scope (likely)

- Missed events in the feed — noisier than useful since
  players don't "fail" at HR bonus in a feed-friendly way.
- Feed filter chips (punted from Phase 39 spec §125).

---

## 132. Not in scope for v1.25

- Per-game reconciliation that marks misses the moment each
  individual player's game finalizes (vs at entry finalize).
  Punt.
- Retroactive data fix — any token applied to today's
  contest before this migration shipped still has `triggered
  = NULL`; they'll resolve naturally at finalize or stay
  null forever for already-final contests (cosmetic; no
  gameplay effect).
- Token trigger animations (burst / flash / confetti).
  Possibly a later phase.
- Missed tokens in the Events tab (see §131).

---

# Phase 41 — v1.26 (Vault multiplier + tier-based contracts)

Gameplay-mechanic shift. Two linked changes.

1. **Vault multiplier.** When a card is vaulted, its stored
   vault score is `career_fp × multiplier`, where the
   multiplier is a steep function of how many plays the
   card has been used. Rewards single-game gems over volume
   grind. Example: a card played 1 time for 40 FP vaults
   at 40 × 5× = 200; a card played 3 times for 60 FP vaults
   at 60 × 2.5× = 150.
2. **Tier-based contracts.** 15-play contracts + extension
   coin sink retired. Replaced with play budgets set by
   card tier (Bronze 5 / Silver 15 / Gold 40 / Diamond
   unlimited). Tier-up refills the budget. Lower tiers
   rotate naturally; Diamond cards can go season-long.

---

## 133. `card_vault_multiplier(plays_used)` SQL fn

### Goal

Single deterministic source of the multiplier so server
(vault scoring) and client (preview display in card detail)
agree on the number.

### Curve (steep — user confirmed)

| Plays used | Multiplier |
|-----------:|-----------:|
|          0 | 0.0        |
|          1 | 5.0        |
|          2 | 3.5        |
|          3 | 2.5        |
|        4–5 | 1.8        |
|       6–10 | 1.3        |
|      11–20 | 1.1        |
|        21+ | 1.0        |

- `0 plays → 0` means a never-played card has no vault
  value. You have to play it at least once to vault for
  anything.
- `21+ plays → 1×` means season-long loyalty cards vault at
  their raw career FP total (no penalty, no bonus).

### Signature

```sql
public.card_vault_multiplier(p_plays_used integer)
RETURNS numeric  -- rounded to 1 decimal by convention
```

---

## 134. Vault scoring uses the multiplier

### Goal

Both vault paths store a `vault_score` that reflects the
multiplier. This is the number shown in the Vault page,
used for leaderboards, and referenced by destroy-refund
math.

### Changes

- **`vault_card_midseason(user_id, card_id)`**: compute
  `plays_used = contract_max - contract_plays_remaining`,
  multiplier = `card_vault_multiplier(plays_used)`. Store
  `vault_score = ROUND(card.career_fp_total * multiplier)`
  on the new `vault_entry` row. Also snapshot `plays_used`
  and `multiplier` for audit.
- **`commit_vault_selection(user_id, season_id, card_ids[])`**
  (end-of-season ceremony): same multiplier logic per card.
- `vault_entry` table: add columns `plays_used integer NOT NULL
  DEFAULT 0`, `vault_multiplier numeric NOT NULL DEFAULT 1.0`,
  `vault_score integer NOT NULL DEFAULT 0`. Existing rows get
  a one-time backfill: multiplier = `card_vault_multiplier(...)`,
  score = `ROUND(career_fp × multiplier)`.

### Out of scope

- Retroactive reshuffling of past-season vault scores if the
  curve changes later. Card vault scores lock at vault time.

---

## 135. Tier-based play budgets on card creation

### Goal

A card's `contract_plays_remaining` at creation depends on
tier, not a flat 15.

| Tier    | Budget    |
|---------|-----------|
| Bronze  | 5         |
| Silver  | 15        |
| Gold    | 40        |
| Diamond | 999 (effectively unlimited) |

### Scope

- `contract_max` stays as the "max capacity" concept but
  now reflects the tier budget.
- `open_pack` (new card creation path): sets
  `contract_plays_remaining` + `contract_max` based on the
  card's tier at pull time.
- Legacy cards: **unchanged** on ship. They keep whatever
  plays they had. Their `contract_max` stays 15 until tier-
  up refreshes it.

---

## 136. Tier-up refills plays

### Goal

When a card crosses a tier threshold, its plays refresh to
the new tier's budget.

### Scope

- Wherever tier-up happens today (likely
  `_finalize_contest_entry` or a downstream fn), after the
  tier flips, update:
  ```sql
  UPDATE card
  SET contract_plays_remaining = GREATEST(contract_plays_remaining, <new_tier_budget>),
      contract_max = <new_tier_budget>
  WHERE id = <card_id>;
  ```
  `GREATEST` ensures you never lose plays on tier-up. This
  also gracefully handles legacy cards whose remaining is
  already high.

### Out of scope

- Tier-DOWN. Tiers only go up in the current model.

---

## 137. Remove contract extensions

### Goal

No more coin-sink extensions. Contracts wear out, and then
the card is expired until season end. Tier-up is the only
way to refresh plays.

### Changes

- `extend_card` SQL fn: keep on disk but mark deprecated /
  comment-out body (safer than dropping — in case any
  telemetry or migration still references it).
- Server action `extendCardContract` removed.
- Client:
  - `ExtendContractModal` component deleted.
  - CardDetailView's Actions section drops the Extend
    Contract button.
- Coin economy impact: extensions were a minor sink; packs
  + pack-size tuning handle the bulk already. No
  compensating changes needed.

---

## 138. Card detail panel shows vault multiplier preview

### Goal

Before vaulting, users can see exactly what the card will
be worth. "3 plays × 2.5 = 150 FP" or similar.

### Scope

- `CardDetailView` Actions section: add a small line above
  the Add-to-Vault button showing:
  - Plays used + multiplier (e.g. `3 plays \u00b7 2.5\u00d7`)
  - Projected vault score (`150 FP`)
- Reads directly from `card.contract_plays_remaining`,
  `card.contract_max`, `card.career_fp_total`, and the
  local `cardVaultMultiplier()` helper (mirror the SQL
  curve in TypeScript — tiny lookup table).

### Files

- `src/components/card/CardDetailView.tsx`
- New helper `src/lib/card/vault-multiplier.ts` with the
  curve lookup.

---

## 139. Not in scope for v1.26

- Retroactive adjustment of legacy cards' `contract_max` /
  `contract_plays_remaining` (only tier-up refreshes
  touches them).
- Vault page redesign to highlight the multiplier math —
  the detail view covers pre-vault reasoning; vault page
  just shows the stored score.
- Multiplier animation on vault commit (a "3.5× MULTIPLIER"
  burst in the ceremony) — possible Phase 42 polish.
- Changing `quick_sell_values` per tier (those still match
  current schedule).
- Adjusting pack odds / coin economy to compensate for the
  removed extension sink. Packs are the primary sink
  already.

---

# Phase 42 — Right sidebar redesign (v1.27)

The right sidebar currently front-loads ~240px of chrome
before the tabs start: contest-header card, 3xl-font
Drafting/Live/Final score block, then the 10-row roster.
The score block reads big but pushes Actions + Events far
below the fold, and the contest header duplicates
information already visible in the URL / nav.

Phase 42 compresses the top-fixed zone into three tight
rows (slate line · roster · compact score) and expands the
tabs from two to three by promoting Packs from an FAB /
modal combo to a first-class tab. Result: the same three
sections always-visible, with ~30% more vertical room for
the tabs content. Roster sits above the score — the roster
is the primary object on the page, the score summarizes it
(sports-app box-score convention: totals under the roster,
not over it).

**Estimated effort:** ~0.5 day.

---

## 140. Slate line replaces contest header

### Goal

One-line, one-value-per-chunk context anchor at the top of
the sidebar. No secondary subtitle line, no border-bottom
card. Reads as a date stamp rather than a document header.

### Content

```
Fri, Apr 24 · 12 games
```

- Left chunk: abbreviated weekday + short month + day.
  Date comes from `current_slate_date()` (SQL helper from
  Phase 19 that accounts for the 4 AM ET pivot).
- Right chunk: count of games in today's slate. Count
  comes from `contest.included_game_ids.length` on the
  user's lineup — already queried on `/lineup` page load.
- Separator: middle-dot with a muted `--text-3` color.
- Typography: 11 px, mono, uppercase tracking.

### Out of scope

- Showing the count of live games (pulse-chip variant). A
  later follow-up once we have realtime game-status
  subscriptions wired into the slate line.
- Showing the contest name anywhere in the sidebar. Nav
  already says "Lineup"; spec §50 guarantees one active
  contest per user per slate, so naming it is redundant.

---

## 141. Compact two-line score block

### Goal

Shrink the Drafting/Live/Final block from a ~96px outlined
card with a 3xl primary number to a ~48px two-line compact
variant that keeps the outlined-card frame (for affordance)
but halves vertical footprint.

### Shape

```
 ┌────────────────────────────────┐
 │ DRAFTING · 3 / 10 filled       │  ← line 1: label + status
 │ 0.0 projected                  │  ← line 2: number + unit
 └────────────────────────────────┘
```

Live state:

```
 ┌────────────────────────────────┐
 │ LIVE · Top 3 · 2 games active  │
 │ 47.2  (proj 52.1)              │
 └────────────────────────────────┘
```

Final state:

```
 ┌────────────────────────────────┐
 │ FINAL · Contest final          │
 │ 148.6  (proj 144.0)            │
 └────────────────────────────────┘
```

### Scope

- Retain `SidebarHeadline`'s internal state derivation
  (anySlotLocked / allFinal / projectedFp).
- Drop the 3xl primary-number treatment → mono lg
  tabular-nums inline with the unit label.
- Drop the separate secondary-number column → inline
  parenthetical `(proj 52.1)` on the same line.
- Keep the outlined-card background + `var(--surface-2)`
  fill so the block still reads as a distinct element.

### Out of scope

- Color-coding the live number emerald — keep for now
  (current behavior), reconsider later if it conflicts
  with the compressed scale.

---

## 142. Roster section with tighter spacing

### Goal

Same 10-row RosterSection per polish spec §122, but with
reduced vertical padding per row so the section fits more
tightly above the tabs.

### Scope

- Reduce each row's `py` padding by ~25% (8px → 6px).
- Reduce inter-row gap to 2px if currently higher.
- No structural changes: keep the per-row FP, position,
  warning pill, token glyph (§130), live/final dot.
- No collapsible / toggle behavior.

### Out of scope

- Converting roster to a box-score table variant. The
  per-row treatment remains best for live-scoring feel;
  table would be denser but lose the scoreboard affordance.

---

## 143. Packs tab joins Actions + Events

### Goal

Promote pack buying from a floating action button + modal
combo to a first-class sidebar tab. Retires both
`BuyPacksFab` and `BuyPacksModal` — the buy UI lives
inline in the tab.

### Scope

- `<SidebarTabs>` grows from two tabs to three:
  `actions` / `events` / `packs`. Packs ships last in the
  tab list for secondary-action prominence.
- Packs tab content (top → bottom):
  1. Coin balance chip at the top. `250 coins` in mono
     with a coin icon.
  2. Daily pack card (claim or countdown-to-ready).
  3. Standard packs section with `× 1 / × 5 / × 10`
     quantity toggles + single buy button.
- The tab retains the `dailyReady` pulse indicator — a
  small gold dot on the tab trigger when the daily pack
  is claimable. Goes away once claimed.
- Ports the full decision surface from `BuyPacksModal`:
  no loss of clarity, no scrolling needed (sidebar is
  ~320px wide; the buy UI fits).

### Files

- `src/components/layout/AppSidebar.tsx` — add third tab.
- New `src/components/pack/PacksTab.tsx` — owns the tab
  content. Reuses bits from `BuyPacksModal` (quantity
  toggle, daily card) via copy-port rather than import,
  since the modal will delete.

### Out of scope

- Pack history (recent openings, dupe resolution
  history). Possible Phase 44+ surface.
- Unopened pack inventory. Packs open immediately at
  buy time today; no inventory exists to list.

---

## 144. Retire BuyPacksFab and BuyPacksModal

### Goal

Delete the floating action button and the buy-packs modal
entirely. All buy flows go through the Packs tab.

### Changes

- Delete `src/components/pack/BuyPacksFab.tsx`.
- Delete `src/components/pack/BuyPacksModal.tsx`.
- Remove imports + render sites from `lineup-view.tsx`
  (two references + the `/shop` redirect already shipped
  in Phase 36).
- Remove the `dailyPackReady` / `dailyPackSecondsUntilReady`
  / `standardPackCost` props from `LineupView` if they
  were only feeding the FAB+modal combo. Rewire into
  `AppSidebar` so the Packs tab has what it needs.

### Out of scope

- Removing `coins_from_dupes` / `cardResults` plumbing —
  still used by the reveal flow.

---

## 145. Server-side: games-today count on lineup page

### Goal

The slate line needs the count of games in today's slate.
Currently `contest.included_game_ids` is already fetched
but never surfaced; plumb it through.

### Scope

- `src/app/(app)/lineup/page.tsx` already reads the
  contest row; add `included_game_ids.length` to the
  props passed down as `gamesInSlate: number`.
- `LineupView` forwards to `AppSidebar` as a new prop.
- No new SQL, no new migration.

### Out of scope

- Filtering out postponed / canceled games from the count.
  The slate definition (§51) already handles postponed
  sliding into the next date; canceled contests don't
  render here.

---

## 146. Not in scope for v1.27

- Mobile sidebar layout (the current sidebar is
  desktop-only; mobile gets a dedicated phase).
- Redesigning the Actions tab (auto-sub controls +
  warnings). Stays as is.
- Converting Events feed to a more condensed format.
  Stays as is.
- Pack reveal redesign — lands in Phase 43 and is
  deliberately split so Phase 42 can ship standalone.
- Inventory / unopened-packs listing. No data model for it.

---

# Phase 43 — In-place pack reveal (v1.28)

Today's pack flow: buy from the FAB → modal opens with
semi-transparent backdrop → peel-and-reveal sequence →
click Done → modal closes. The modal works but feels
layered-on-top rather than "I'm opening a pack now." Phase
43 swaps the modal for an in-place panel that takes over
the main content area of the lineup page while the sidebar
stays visible. Multi-pack buys now reveal sequentially with
a `Next pack` gate between packs so each pack feels like a
moment, not a deluge.

**Estimated effort:** ~0.8 day.

---

## 147. Reveal takes over main content area

### Goal

When the Packs tab fires a purchase, the lineup page's
main content area (lineup diamond + cards grid) replaces
itself with a full-height `<PackRevealPanel>`. Sidebar
stays visible — coin balance drops in real-time, roster /
score stay in peripheral vision.

### Scope

- `LineupView` gains `revealActive: boolean` state. When
  true, `<LineupMainContent>` renders `<PackRevealPanel>`
  in place of `<LineupDiamond>` + `<CardsPanel>`.
- Sidebar always renders regardless of reveal state.
- The panel receives the same props that `PackOpenerModal`
  does today: `result`, `cards`, `existingByCardId`, plus
  new props for sequential flow (§149).
- Transition: brief 150ms cross-fade between lineup
  content and reveal panel. No sliding; no backdrop.

### Out of scope

- Hiding / modifying the top nav or global header. Same
  chrome as the rest of the app.
- Routing change (e.g. `/lineup/reveal`). Reveal is a
  transient client-side state; URL stays `/lineup`.

---

## 148. PackRevealPanel component

### Goal

A new in-place panel that owns the peel / flip / dupe
resolution logic. Ports the content of `PackOpenerModal`
out of the `<Dialog>` wrapper and into a full-height
section that sits inside the lineup page's main content
area.

### Shape

Top → bottom:

1. **Progress header** (§150): `Pack 2 of 5 · peel pack`
   on the left; placeholder / empty on the right.
2. **Peel stack** — face-down cards stacked in the center,
   tap-to-peel (current behavior).
3. **Revealed row** — the cards that have been flipped,
   arranged in a row below the stack. Per-card quick-sell
   / add-to-vault buttons unlock when the stack empties.
4. **Footer action** — either `Next pack` (mid-batch) or
   `Done · back to lineup` (final pack). Never both.

### Files

- New `src/components/pack/PackRevealPanel.tsx`. Copies
  peel / flip / resolution state from
  `PackOpenerModal.tsx` — the modal deletes once the
  panel is feature-equivalent.
- Prop shape identical to the modal's `Props`, minus the
  `open` / `onOpenChange` pair. Plus new
  `currentPackIndex: number`, `totalPacks: number`,
  `onAdvancePack: () => void` props.

### Out of scope

- Changing the peel animation. Keep the `PackCardFlip`
  component untouched.
- Reworking `PackDupePanel` UX. Same inline dupe panel;
  same keep-new / keep-existing decision.

---

## 149. Sequential multi-pack flow

### Goal

Multi-pack buys (×5, ×10) reveal pack-by-pack with an
explicit `Next pack` advance between packs. No more
10-card stack all at once; each pack gets its own moment.

### Flow

1. User buys ×5 standard packs from Packs tab.
2. `openPacksBatch` returns 5 openings. Payload is
   partitioned in `LineupView` into an array of
   per-pack payloads (cards + results scoped to that
   opening).
3. Reveal panel mounts with `currentPackIndex = 0`.
4. User peels / flips / resolves dupes for pack 1.
5. Once pack 1 is complete (all cards revealed + all
   dupes resolved), the footer `Next pack (2 of 5)`
   button unlocks.
6. Click Next → `currentPackIndex++`; panel resets
   per-pack peel / flip / resolution state; pack 2
   payload loads. Previously revealed cards from packs
   1-4 do NOT persist on screen — each pack starts
   fresh.
7. On the last pack, the footer swaps from `Next pack`
   to `Done · back to lineup`.

### Scope

- Payload partitioning lives in `LineupView`. The panel
  takes `packs: PackRevealPayload[]` + `currentPackIndex`;
  rendering the active pack only.
- Progress derived from `(currentPackIndex + 1) / packs.length`.
- No carousel of completed packs — per §148, each pack is
  its own moment; crossing back to see previously-opened
  packs isn't a v1.28 flow.

### Out of scope

- User choice at buy time between sequential vs batch.
  Sequential is the only mode.
- Skip-ahead / batch-reveal shortcut. A power-user can
  still fire multiple peels quickly — there's no forced
  delay between cards within a pack.

---

## 150. Progress header

### Goal

Visible `Pack N of M` indicator so users always know
where they are in a multi-pack buy. Single-pack buys
degrade to a simpler header with no counter.

### Shape

Multi-pack (e.g. `×5`):

```
PACK 2 OF 5 · DAILY                  [███░░]
Peel the pack to reveal 5 cards.
```

- Left: pack index + pack type label.
- Right: a segmented progress bar. Each segment lights
  when its pack completes. Active segment pulses.
- Subtitle: contextual copy ("Peel the pack" / "Flip to
  reveal" / "Tap a card to add to vault" / "Pack
  complete — next pack?").

Single-pack:

```
DAILY PACK
Peel to reveal 5 cards.
```

### Out of scope

- Clickable segments to skip between packs. Linear flow
  only — no jumping back to an already-opened pack.
- Timer showing how long the user has been revealing. Not
  helpful.

---

## 151. Exit gating: Done at end only

### Goal

No mid-reveal escape hatch. The user commits to finishing
the reveal once they click Buy; the Done button only
appears on the last pack, and only once every card +
every dupe has been resolved.

### Rationale

- Protects against accidental dismissal (clicking
  outside the modal today closes it; the in-place panel
  removes that surface area entirely).
- Cards are already minted at buy time — closing early
  doesn't lose them. But the user is here to enjoy the
  reveal; forcing completion respects the moment.
- If the user really needs to bail, they can navigate
  away (the cards remain in their collection). But
  there's no explicit back button / Escape-key
  shortcut.

### Scope

- `Done · back to lineup` button renders only on final
  pack AND when all cards on that pack are resolved.
- No `X` in the header, no Escape key listener, no
  outside-click handler.
- Navigating away mid-reveal (sidebar link click, browser
  back) works normally — the cards are safe in
  collection; on return, reveal state is gone (one-shot).

### Out of scope

- Resumable reveal state (e.g. user closes browser mid-
  reveal, comes back later, sees the same pulls again).
  Cards persist in collection; the reveal is ephemeral.

---

## 152. Server-side impact

### Goal

Phase 43 is pure client / layout refactor. No new SQL, no
migrations, no action-shape changes.

### Notes

- `openPacksBatch` already returns per-opening payloads
  (`batch.openings[]`). Partitioning for sequential
  reveal happens client-side in `LineupView`.
- Pack_opening audit table is unchanged.
- Card / token inserts still happen at buy time — the
  reveal is purely UI presentation of already-persisted
  rows.

---

## 153. Not in scope for v1.28

- Unopened-pack inventory. Packs still open immediately
  on buy.
- Resumable reveals (pick up where you left off).
- Per-pack shareable summary card (for social sharing).
- "Reveal all" skip button. Sequential only.
- Keyboard shortcuts during reveal (arrow keys for peel,
  etc.). Possible polish phase.
- Mobile-specific reveal layout. Desktop-first; mobile
  inherits the layout but may need tuning in a later
  phase.

---

# Phase 44 — Pack reveal row redesign (v1.29)

Phase 43 landed the in-place panel with sequential multi-pack
flow. The peel stack (face-down cards z-stacked with depth
offsets, top-only click target) carried over from Phase 36's
original reveal shape. That shape worked as a modal moment but
feels oversized inside the in-place panel — the cards are 60%
bigger than anywhere else in the app, and strict top-to-bottom
peel order forces the user through a specific path.

Phase 44 swaps the peel stack for a single horizontal row of
face-down cards at **lineup slot size**, any-order flipping,
and **inline** dupe resolution (no overlay). The cards look like
they belong to the rest of the app; the user picks their own
path through the pack.

**Estimated effort:** ~0.5 day.

---

## 154. Horizontal row replaces peel stack

### Goal

One row of N face-down cards in the center of the panel. Each
card is a self-contained flip target; clicking any face-down
card flips it in place. The StackZone (z-stacked + depth
layers) retires. Cards flip in their existing slot — no sliding
into a separate "revealed" row.

### Layout

- `flex-wrap` centered row. `justify-center`, `gap-3` horizontal,
  `gap-y-4` vertical for wrapping.
- 5-card pack: one row of 5.
- 10-card pack (premium / max bulk): wraps to 5 × 2.
- Each slot is `w-[120px]` (card width) + reserved button area
  below (see §158).

### Out of scope

- Horizontal scroll behavior. If wrapping doesn't work for a
  particular pack size, we'll revisit — for now 5 / 10 are the
  only sizes (daily = 5, standard = 5, no premium path yet).

---

## 155. Lineup-slot card size

### Goal

Reveal cards render at the same size as cards on the lineup
diamond and in the collection grid. Reads as "these will fit
here when I close the reveal" rather than "this is a different
ceremonial moment."

### Scope

- `PackCardFlip` accepts a new `size` prop mapping to the
  existing `CardSize` values. Reveal passes `"lineup"`
  (~120×168).
- `PackDupePanel` accepts matching size; inline dupe UX (§157)
  renders both sides at lineup size too.
- `StarPullBurst` scales its sprite / glow to match the
  shrunken card — currently hardcoded around the 160×224
  medium size; needs a `size` prop or derives from its child.
- Revealed-card action buttons (Sell / Vault) stay compact
  `h-7 text-[11px]` — already matched to lineup-size cards.

### Out of scope

- A separate "big reveal" size for rare pulls (e.g. a Diamond
  pull gets bigger). Possible polish — star-pull burst +
  tier halo is enough signal today.

---

## 156. Any-order flipping

### Goal

Each face-down card in the row is independently clickable. No
peel order, no stack depth, no "top card only" rule.

### Scope

- Click any face-down card → that card's `flipped[i]` flips
  true; the card runs its flip animation and lands face-up in
  its slot.
- No `peelIndex` state — each card tracks its own `flipped`
  bit.
- The "activeDupeIdx" concept stays but is now assigned
  on-flip-complete of a dupe card (whichever one the user
  flipped). Inline dupe swap (§157) renders in that slot.
- Subtitle copy in the progress header adapts:
  - "Tap any card to reveal · N of M left"
  - "Resolve the dupe to continue" (when activeDupeIdx set)
  - "Pack complete · next up?" / "All packs opened — back to
    lineup?"

### Out of scope

- Keyboard navigation. Focus + Enter could flip a focused
  card; not wired today because touch / click is primary.

---

## 157. Inline dupe resolution

### Goal

When a flipped card turns out to be a dupe, its slot swaps
into a side-by-side comparison with Keep New / Keep Existing
buttons — no overlay, no backdrop. The row continues to show
the other slots around it. Other cards remain flippable during
dupe resolution (gate is per-card, see §158).

### Shape

Dupe slot footprint grows from `w-[120px]` to roughly
`w-[252px]` (two cards + a small gap):

```
[ row of face-down / flipped cards ]
 ↓ user flips a dupe
[ ... ] [ NEW vs EXISTING · Keep New · Keep Existing ] [ ... ]
 ↓ user picks
[ ... ] [ kept-card in single slot ]                   [ ... ]
```

The other slots reflow around the expanded slot via flex-wrap.
Fast enough that there's no distracting shuffle.

### Scope

- `PackDupePanel` gets a compact variant: vertical stack of
  [new card / vs label / existing card] OR horizontal
  side-by-side, whichever fits lineup-size cards better.
  Implementation detail; the spec just locks "inline, no
  overlay, stays within the row layout."
- Resolution outcome:
  - Keep new → existing card quick-sold, dupe slot collapses
    to showing the new card (kept_new resolution).
  - Keep existing → new card quick-sold, dupe slot collapses
    to showing the existing card (kept_existing resolution,
    dimmed 40% to signal it was sold).

### Out of scope

- Showing detailed stat comparison between new + existing
  (career FP, etc.). Card footer already shows the essentials.
- Multi-dupe batch resolution ("sell all dupes at once"). Each
  dupe resolves independently.

---

## 158. Per-card action gating

### Goal

Keep the current completion gate: per-card Sell / Vault
buttons stay disabled until the whole pack is flipped AND all
dupes are resolved. Done / Next Pack button obeys the same
gate.

### Rationale

Locked gate preserved because:
- Gives the pack a completion arc — finishing the reveal is
  a deliberate beat, not a trickle.
- Avoids partial-pack states where 3 of 5 cards are resolved
  and the user has to remember to come back and finish the
  rest.
- Matches §151 exit gating — Done button at end only.

### Scope

No change to gate logic. Only the flip order freedom (§156)
and layout (§154) differ from Phase 43.

---

## 159. Files and architecture

### Files touched

- `src/components/pack/PackRevealPanel.tsx` — guts rewritten:
  - Remove `StackZone` component + depth-layer visuals.
  - Remove `peelIndex` state → per-card `flipped[i]` only.
  - Single `RevealedRow`-style layout for all cards (face-
    down + face-up both live in this row).
  - Dupe resolution inline via expanded slot, not overlay.
- `src/components/pack/PackCardFlip.tsx` — accept `size` prop;
  default to previous `medium` for backwards compat (nothing
  else calls it).
- `src/components/pack/PackDupePanel.tsx` — add a compact
  layout variant sized for two lineup-size cards.
- `src/components/pack/StarPullBurst.tsx` — scale burst to
  match card size.
- `src/components/pack/PackRevealPanel.tsx` progress header
  subtitle copy tweaks.

### No change

- `handleBatchOpened` partitioning logic in LineupView (per-pack
  payloads already correct).
- `handleAdvancePack` / `handleRevealDone` handlers.
- Sequential multi-pack flow (§149). Pack-level order is still
  sequential; only card-level order is free.
- Progress header segmented bar. Per-pack moments stay
  distinct.

---

## 160. Not in scope for v1.29

- Mobile reveal layout. Desktop-first; current wrap-to-2-rows
  degrades reasonably on narrow viewports.
- Card size variation per tier (e.g. Diamond pull shows
  bigger). Star-pull burst + border color carry tier weight
  today.
- Keyboard shortcuts during reveal.
- Resumable reveals (browser-close then return). Still
  ephemeral.

---

# Phase 45 — Pack pool quality (v1.30)

The pack-draw pool currently includes every player on a
40-man roster with `status='active'`. That's ~936 players,
but ~30% of them are optioned to AAA affiliates today. Users
are pulling unfamiliar minor-league names — the fantasy
collecting loop falls flat when your daily pack delivers
"Jhonny Ramírez, AAA reliever never been on an MLB mound."

Gameplay spec §6.3 defined the remedy (star / starter / role
/ prospect tiers with per-pack weighting) but it was never
wired. Every player in the DB is tagged `role`; pack weights
in `economy_config.pack_value_weights` exist but are ignored
by `open_pack`.

Phase 45 closes the gap:
- New MLB Stats API integration (statsapi.mlb.com, free
  public) delivers authoritative 26-man active-roster
  state. Industry standard for DFS / fantasy products.
- Daily tier classification cron sorts the 26-man pool by
  rolling-365-day FP; top 80 become `star`, next 200
  `starter`, rest `role`. Matches §6.3 targets.
- `open_pack` filters to 26-man + draws tier-weighted per
  `pack_value_weights`. Premium packs feel meaningfully
  better; daily pack is bench-weighted.

**Estimated effort:** ~0.8 day.

---

## 161. MLB Stats API as authoritative roster source

### Goal

Second data integration alongside BDL. BDL's
`active: boolean` can't distinguish 26-man from
40-man-optioned; MLB's official Stats API does. DraftKings,
FanDuel, Topps Bunt all source from here — industry standard.

### Scope

- New `src/lib/mlb/stats-api.ts` provider:
  - `fetchActiveRosters(): Promise<{team_id, mlbam_ids[]}[]>`
  - Hits `https://statsapi.mlb.com/api/v1/teams/{id}/roster?rosterType=active`
    for each of 30 teams. Response includes the 26-man.
  - No auth, no rate limits for public endpoints.
- Provider exposes `mlbam_id` as its primary key — already
  the join column against `player.mlbam_id`.
- Wraps fetch in a 10s timeout + Sentry breadcrumb on
  failure so partial syncs degrade gracefully.

### Out of scope

- Real-time roster-move detection. Daily cron only — a
  player called up Monday morning enters packs Monday at 4
  AM ET the following day. Acceptable for v1; revisit if
  users notice.
- Using Stats API for anything beyond roster sync (stats,
  games, scores all stay on BDL).
- Webhook-style MLB Stats integration (it doesn't support it).

---

## 162. `player.is_26_man` column

### Goal

New boolean on `player`, separate from `is_active_40_man`.
The 26-man is the subset of the 40-man that's currently on
the active MLB roster. `is_active_40_man` stays as-is (BDL-
sourced); `is_26_man` is new (MLB Stats API-sourced).

### Scope

- Migration adds `is_26_man boolean NOT NULL DEFAULT false`.
- Daily cron `/api/cron/mlb-26man-sync` (new) sweeps:
  1. Fetch all 30 teams' active rosters.
  2. Build the union mlbam_id set across all 30 teams.
  3. Single UPDATE: `SET is_26_man = (mlbam_id = ANY(...))`.
  4. Audit row emitted per player whose flag flipped.
- Cron schedule: `0 9 * * *` (4 AM ET / 9 AM UTC, matching
  existing slate pivot).

### Out of scope

- Back-populating historical 26-man state. Forward-only.
- Handling double-A / triple-A roster distinction. Anything
  not 26-man is lumped as "not drawable" for pack purposes.

---

## 163. Tier classification cron

### Goal

Daily recompute of `player.designated_value_tier` from
rolling-365-day FP performance. Matches §6.3 targets:

- **Star**: top 50 hitters + top 30 pitchers = ~80 players
  (≈10% of 26-man).
- **Starter**: next 200 by FP = ≈25% of pool.
- **Role**: remainder of 26-man pool = ≈65%.
- **Prospect**: unused in v1 (26-man filter already
  excludes fringe players; kept in the enum for future use).

### Scope

- New `/api/cron/player-tier-classify` (runs after
  26-man-sync):
  1. Derive each 26-man player's 365-day rolling FP from
     `game_event` aggregated by `batter_player_id` /
     `pitcher_player_id`.
  2. Rank separately: hitters by FP desc, pitchers by FP
     desc.
  3. Assign tier by rank: top 50 hitters = star, next
     250 = starter, rest = role. Top 30 pitchers = star,
     next 100 = starter, rest = role. (Targets tunable in
     `economy_config.tier_classification_limits` — new
     JSON key; defaults land in seed.)
  4. Non-26-man players → reset to `role` (default; they
     won't be drawn anyway).
- Opening-Day bootstrap: during first 30 days of a new
  season when current-season FP is thin, tier classification
  uses prior-season FP. Rolling-365-day window handles this
  organically (prior season's late-year games are still
  within 365 days).

### Out of scope

- Separate tier tracking per position (e.g. "top 3 SS").
  Simpler flat ranking now; can revisit if the user wants
  positional scarcity.
- Manual overrides for specific players (e.g. "Shohei is
  always a star"). The 365-day window self-corrects.

---

## 164. open_pack filters + weights

### Goal

`open_pack` SQL fn rewrites its draw to:
1. Filter pool: `is_26_man = true AND status = 'active'`
   (replaces `is_active_40_man = true AND status = 'active'`).
2. For each card slot, draw tier per `pack_value_weights`
   for that pack type, then draw a random unowned player
   within that tier.

### Algorithm

```
FOR each card slot in pack_size:
  r := random() * 100
  accumulated := 0
  tier_to_draw := 'role'
  FOR tier IN ('star', 'starter', 'role', 'prospect'):
    accumulated += weights[tier]
    IF r < accumulated: tier_to_draw = tier; BREAK
  END FOR

  SELECT random unowned player WHERE
    is_26_man=true AND status='active'
    AND designated_value_tier = tier_to_draw

  IF no unowned in tier → fall back to next tier down
    (star → starter → role) to avoid empty draws.
END FOR
```

### Premium guaranteed star

Premium packs reserve the **last** card slot for a star-tier
draw (before the general draw loop). If no star is available
(owned all of them), falls back to `starter`. Keeps premium
tangibly better.

### Out of scope

- Pity system for unlucky users. No.
- Drop-rate-displayed-to-user UI. Odds are internal per §6.3.

---

## 165. Updated `pack_value_weights`

### Goal

Adjust the existing `economy_config.pack_value_weights` JSON
to match the Phase 45 gradient. `prospect` weight goes to 0
across the board (tier unused).

### New weights

```json
{
  "daily":    { "star": 0,  "starter": 25, "role": 75, "prospect": 0 },
  "standard": { "star": 8,  "starter": 40, "role": 52, "prospect": 0 },
  "premium":  { "star": 18, "starter": 52, "role": 30, "prospect": 0 }
}
```

Premium also gets `guaranteed_star_slot: true` as a new
config flag (new JSON field).

### Scope

- Migration updates the active `economy_config` row.
- No deprecation of `prospect` enum value (kept for future
  re-use if we ever open up minor-league packs as a theme).

### Out of scope

- Separate weights per card slot within a pack. Uniform per
  slot. Position-based slot weighting is a future polish.

---

## 166. Rollout sequence

### Order-of-operations

1. Add `is_26_man` column (default false). Safe — no
   behavior change yet.
2. Ship cron + run first sync. Column populates.
3. Ship tier classification cron. Tiers populate.
4. Update `pack_value_weights` in economy_config.
5. Ship `open_pack` rewrite. **This is the flip point.**
   Prior steps are no-ops for live behavior.
6. Verify on dev first; apply to prod in same order.

### Fallback

If `is_26_man = true` returns 0 players (e.g. cron never
ran, MLB Stats API was down), `open_pack` falls back to the
prior `is_active_40_man = true` filter so users can still
open packs. Logs a warning.

---

## 167. Cards already minted as `role`

### Goal

Existing cards (e.g. the user's collection pre-P45) carry
`card.current_tier = 'bronze'` and their player's
`designated_value_tier = 'role'`. Nothing to migrate —
`designated_value_tier` is a player-level classification
used only by `open_pack` at draw time. Once classification
runs, existing cards' player tier updates in place; the
player's tier shift doesn't retroactively rewrite card
records.

---

## 168. Monitoring

### Metrics to capture

- `pack_opened` PostHog event gets a new property
  `drawn_tier_distribution` — counts per tier in the pack.
  Lets us see the live distribution vs the configured
  weights.
- Sentry breadcrumb on MLB Stats API 5xx / timeout.
- Cron success rate dashboard for the two new crons.

---

## 169. Files touched

- `src/lib/mlb/stats-api.ts` — NEW (MLB Stats API
  provider).
- `src/lib/mlb/mlb-stats-sdk.md` — provider docs if we want
  a mirror of the methods used; optional.
- `src/app/api/cron/mlb-26man-sync/route.ts` — NEW.
- `src/app/api/cron/player-tier-classify/route.ts` — NEW.
- `supabase/migrations/0051_player_is_26_man.sql` — column
  + index.
- `supabase/migrations/0052_open_pack_tier_weighted.sql` —
  fn rewrite.
- `supabase/migrations/0053_pack_value_weights_p45.sql` —
  economy_config update.
- `src/app/actions/packs.ts` — no change (action-layer
  agnostic to SQL internals).
- `vercel.json` (if present) or cron config — two new
  entries.

---

## 170. Not in scope for v1.30

- Manual tier override admin UI.
- Position-specific tier buckets (top 10 SS, etc.).
- Themed packs (rookie pack, division pack, team pack).
- Player-photo refresh triggered by roster moves (handled
  separately by the existing photo-sync).
- Historical tier tracking (no audit of "when did Player X
  become a star").
- IL-aware filtering (players on IL still have `status=
  'active'` via BDL; the 26-man roster from MLB Stats
  excludes them naturally).

---

# Phase 46 — Sticky lineups (v1.31)

The DFS-style fresh-slate-every-day model fights the rest of
the design. Cards are persistent (career FP, tier progression,
vault); the lineup that uses them is ephemeral. Result: users
have to redraft daily and risk locking themselves out of
already-started games if they sleep in.

User direction:
> "It's not really drafting every day, it's setting your
> lineup every day. Auto setting or manual setting, but also
> giving control over individual players. Some users might
> want to keep a couple guys in there automatically but they
> might also be trying to do one game cards and we shouldn't
> penalize those players for forgetting to check their lineup
> that day."

Phase 46 introduces **sticky lineup slots**: by default each
slot carries forward to the next slate's entry with the same
starter. A per-slot toggle lets users mark a slot as "one-shot"
(today only, then drops). Smart-auto fills empty slots from
the bench when a sticky player isn't playing.

**Estimated effort:** ~0.6 day.

---

## 171. Per-slot sticky flag

### Goal

`contest_lineup_slot.is_sticky` boolean, per-slot, per-entry.
Defaults to `true` on every slot. Toggle persists for the
life of that slot; carries forward to the next day's slot
when the entry rolls over.

### Scope

- Migration adds `is_sticky boolean NOT NULL DEFAULT true`.
- All existing slots get `is_sticky=true` retroactively
  (DEFAULT applies to new rows, but for explicit clarity
  the migration also `UPDATE`s existing rows once).
- No RLS change — slot rows are owned via `contest_entry_id`
  → `contest_entry.user_id`, same chain as before.

### Out of scope

- A separate "preferred starter" column distinct from
  `starter_card_id`. The simple model: today's starter IS
  the preferred starter; whatever's there at slate-rollover
  is what carries forward (assuming sticky=true).
- Per-card sticky default. The decision is per-slot, not
  per-player — matches the user's "this slot for this
  purpose" mental model.

---

## 172. Default = sticky

### Goal

Every new card placement defaults to `is_sticky = true`.
User has to explicitly opt-out for one-shot semantics.

### Rationale

User's "no penalty for forgetting" philosophy. The path of
least resistance (do nothing) preserves the user's lineup;
explicit action is required for the temporary case.

---

## 173. Slate rollover carry-over

### Goal

When a user's new contest entry is created (via
`create_contest_entry()`, called on `/lineup` page load by
`create_daily_contest()` flow), automatically pre-fill its
slots from the user's most recent prior entry, but only
where `is_sticky=true` and the card is still playable today.

### Carry-over rules

For each slot in the prior entry:
1. Skip if `is_sticky = false`.
2. Skip if `starter_card_id IS NULL` (no card to carry).
3. Skip if the card was vaulted, sold, or expired in the
   meantime (validate against current `card` state).
4. If the card's player has a game in today's slate
   (`contest.included_game_ids`) — fill the new slot's
   `starter_card_id` + `is_sticky=true`.
5. If the card's player has NO game today — leave the new
   slot empty (`starter_card_id=NULL`) but set
   `is_sticky=true` so smart-auto can fill from bench.

### "Most recent prior entry"

Defined as: user's contest entry with the latest
`contest.starts_at < today's slate's starts_at`. Skips
entries with no filled slots (e.g. user never engaged that
day). Capped at 7-day lookback so a 30-day-inactive user
doesn't accidentally carry forward a stale lineup.

### Out of scope

- Notifying the user of carry-over results ("Brett Baty
  carried over, but Caleb Kilian had no game today —
  smart-auto subbed in Tyler Rogers"). UI feedback lives
  in the lineup page itself; no toast / email / push.
- Reconciling tokens. Tokens were consumed when yesterday's
  contest finalized; tomorrow's slots start fresh-token,
  user re-applies if desired.

---

## 174. Smart-auto fallback

### Goal

When carry-over leaves a slot empty (sticky player not
playing today) AND the user's `auto_sub_mode = 'smart_auto'`,
the smart-auto pass picks a replacement from the bench.

### Algorithm

For each empty sticky slot:
1. Find unowned-by-other-slot bench cards eligible for the
   slot's position.
2. Filter to those whose player has a game today.
3. Rank by player's recent FP (last 14 days) — best
   available wins.
4. Slot the top pick, leave `is_sticky=true`.

If no eligible card found: slot stays empty. User sees a
"C slot needs a replacement" warning in the sidebar.

### Manual mode

When `auto_sub_mode = 'manual_priority'`, no smart-auto
sub fires. Empty sticky slots stay empty; user fills
manually.

### Out of scope

- Exposing a manual "set sub priority order" per slot.
  `auto_sub_mode = 'manual_priority'` already implies a
  manual flow; no priority sequence needed.

---

## 175. Per-slot sticky toggle UI

### Goal

Small toggle on each filled slot in the lineup diamond.
Indicates the current sticky state and lets the user flip
it. Defaults visible-as-set (sticky pin icon for sticky,
muted for one-shot).

### Shape

- Pin icon (📌) in the slot's top-right corner — small,
  ~12px. Filled gold when sticky, outlined / muted when
  one-shot.
- Click toggles the state. Server action:
  `toggleSlotSticky(slotId, nextState)`.
- Disabled when slot is locked (game started). Tooltip
  explains.

### Out of scope

- A bulk "make all my slots one-shot" button. Per-slot
  click is fine for v1; if every user wants this, we
  revisit.
- Animation on toggle. Static icon swap.

---

## 176. Empty-slot sticky preservation

### Goal

When a slot is emptied (user removes the card, or carry-over
skipped due to ineligibility), the `is_sticky` flag is
PRESERVED on the empty slot. So smart-auto knows whether to
fill it; tomorrow's carry-over knows whether the user wanted
this slot to keep auto-filling.

### Out of scope

- Treating empty slots differently based on prior sticky
  history. Just preserve the flag; UI shows it on empty
  slot cards too.

---

## 177. `toggleSlotSticky` Server Action

### Goal

Single-purpose action: flip `contest_lineup_slot.is_sticky`
for a (user, slot) pair. RLS-guarded via the user's
contest_entry → slot ownership chain.

### Shape

```ts
// src/app/actions/lineup.ts
export const toggleSlotSticky = wrapAction(
  toggleSlotStickyImpl,
  { name: "toggleSlotSticky" }
);

// Input: { slotId: string, sticky: boolean }
// Output: { ok: true, data: { slotId, sticky } } | error
```

Calls a SQL helper `update_slot_sticky(user_id, slot_id, sticky)`
that asserts ownership + per-slot lock state before mutating.

---

## 178. Files touched

- `supabase/migrations/0057_slot_is_sticky.sql` — column +
  retroactive update.
- `supabase/migrations/0058_create_entry_carry_over.sql` —
  rewrite of `create_contest_entry` with carry-over logic
  + `update_slot_sticky` helper.
- `src/app/actions/lineup.ts` — `toggleSlotSticky` action.
- `src/components/lineup/LineupSlot.tsx` (or wherever the
  slot renders) — pin icon + click handler.
- `src/lib/lineup/types.ts` — add `isSticky: boolean` to
  `LineupSlotVM`.
- `src/app/(app)/lineup/page.tsx` — include `is_sticky` in
  the slot select.

---

## 179. Migration of existing entries

### Goal

The day Phase 46 ships, all existing `contest_lineup_slot`
rows get `is_sticky = true` (column default + explicit
backfill). Tomorrow's entries will carry forward today's
lineups for the first time.

If a user wanted yesterday's lineup to NOT carry forward
(because they were experimenting), they'll see it pre-filled
tomorrow and can adjust. One-time migration friction.

---

## 180. Not in scope for v1.31

- Lookback further than 7 days for inactive users. Stale
  rollover risks (player got traded, etc.) outweigh the
  convenience.
- Carry-over of applied tokens. Tokens consume at finalize
  per Phase 41; users re-apply daily.
- Notification / email when carry-over partial-fills due
  to ineligible cards.
- Per-card sticky default (the decision is per-slot only).
- Slot-level "always smart-auto" mode separate from sticky.
  The two concepts compose: sticky = carry over; manual
  vs smart auto handles the empty-slot fallback.

---

# Phase 47 — Future-final game state hygiene (v1.32)

User feedback on Apr 25: "Altuve and Lee are showing games
from yesterday." The pills say `FINAL L 4-12` and `FINAL L 4-9`
on cards whose teams play **tonight at 7:10 PM ET** and **tonight
at 4:05 PM ET**, respectively. At 2:28 PM ET the games can't
have ended yet — but they're flagged `final` in the DB with
fake-looking scores.

Diagnosed: the BDL ingestion path (webhook or prefetch cron)
delivered "ended" events for games before their scheduled_start.
Sandbox / pre-populated test data leaking through. Affects 4
games today; could happen any day. The app correctly displays
whatever the DB says, but the DB is wrong.

**Estimated effort:** ~0.3 day.

---

## 181. Definition of "future-final"

A game row is in an invalid state when:

- `status = 'final'`
- `scheduled_start > now()`

Real MLB games never enter this state — finals only arrive
after the actual game ends, well past `scheduled_start`. Any
row matching the predicate is corrupt and should be treated
as `scheduled` until reality catches up (or BDL re-syncs the
game with a real `final` post-`scheduled_start`).

---

## 182. Defense-in-depth strategy

Three layers, ordered from outermost (hides symptom) to
innermost (prevents recurrence):

1. **Display-side guard** (§183) — render `status='scheduled'`
   when the predicate is hit, regardless of DB state.
2. **Ingestion-side guard** (§184) — webhook handler +
   prefetch cron refuse to set `status='final'` if
   `scheduled_start > now() - 5 minutes`. (5-min grace for
   clock skew between BDL + our DB.)
3. **One-time backfill** (§185) — reset all currently-bad
   rows so the user sees correct data immediately rather
   than waiting for natural data refresh.

Display-side is the most important — it works even when
upstream data is lying. Ingestion + backfill are belt-and-
suspenders.

---

## 183. Display-side guard

### Goal

`fetchSlotGameByCardId` (the source of truth for the lineup
slot footer pill) downgrades any `final` game with
`scheduled_start > now()` to `scheduled` when assembling the
SlotGameInfo it returns. Scores zero out in that case so we
don't accidentally show stale numbers.

### Scope

- Update the SQL inside `fetchSlotGameByCardId` so the
  outer SELECT projects:
  ```
  CASE
    WHEN c.status = 'final' AND c.scheduled_start > now()
    THEN 'scheduled'::game_status
    ELSE c.status
  END AS effective_status
  ```
  Plus zero-out home_runs / away_runs in the same case.
- The DISTINCT ON priority (live > scheduled > final) reads
  from `effective_status`, so future-finals demote properly
  in tie-breaking.

### Out of scope

- Modifying the underlying `game.status` value at read time.
  Display-only correction; the row stays as the ingestion
  layer left it.

---

## 184. Ingestion-side guard

### Goal

Game rows can't enter the future-final state going forward.
Both ingestion paths refuse to write `status='final'` when
`scheduled_start > now() - 5 minutes`.

### Scope

- **Webhook handler** (`/api/webhooks/balldontlie/mlb`):
  - Before persisting a `mlb.game.ended` event, check the
    target game's `scheduled_start`. If still in the future
    (> 5 min grace), log a warning + write to `webhook_failed`
    with reason `'future_final_rejected'`. Don't mutate
    `game.status`.
- **Games prefetch cron** (`/api/cron/bdl-games-prefetch`):
  - When BDL returns a game with `status='final'` and a
    future `scheduled_start`, override to `status='scheduled'`
    + log the override count in the cron response.

### Out of scope

- A separate test/sandbox flag in the BDL provider. We
  always run against real BDL; if their data is wrong, the
  guard catches it.

---

## 185. One-time backfill

### Goal

Existing future-final rows reset to `status='scheduled'`
with cleared scores. Single migration; idempotent (a future
re-run is a no-op once everyone's clean).

### Scope

```sql
UPDATE public.game
SET status = 'scheduled',
    home_runs = NULL,
    away_runs = NULL,
    current_inning = NULL,
    current_inning_half = NULL,
    current_outs = NULL,
    updated_at = now()
WHERE status = 'final'
  AND scheduled_start > now();
```

Applied to dev + prod via MCP. The 4 games surfacing today
get fixed immediately; user reload of `/lineup` shows
"VS NYY · 7:10P" instead of "FINAL L 4-12".

### Out of scope

- Cleaning up downstream effects (e.g. if these "final"
  games triggered `_apply_game_event_to_lineups` runs that
  awarded fake FP). Audit trace deferred — the games never
  had real `game_event` rows since BDL doesn't emit per-event
  data for sandbox-final games. Spot-checked: no orphan
  game_event rows referencing these game_ids.

---

## 186. Files touched

- `src/lib/lineup/fetch-slot-games.ts` — display guard
  (§183)
- `src/app/api/webhooks/balldontlie/mlb/route.ts` —
  ingestion guard for game.ended events (§184)
- `src/app/api/cron/bdl-games-prefetch/route.ts` —
  override on prefetch (§184)
- `supabase/migrations/0059_backfill_future_finals.sql` —
  one-time data reset (§185)

No schema changes — purely behavioral.

---

## 187. Not in scope for v1.32

- Database CHECK constraint preventing future-finals.
  Postgres CHECKs can't reference `now()` (non-IMMUTABLE).
  A trigger would work but adds plumbing for what's already
  defended at the ingestion + display layers.
- Webhook source attribution / sandbox-mode detection. The
  behavior is "BDL said something wrong, ignore it" — we
  don't care which BDL mode emitted it.
- Audit alert on future-final attempts. If it happens
  frequently enough to warrant an alert, revisit.

---

## 188. OFF-day pill universality (Phase 47 v3)

### Problem

User feedback after the 2-hour grace fix:
> "What about players who are on off days? Shouldn't it
> say Off?"

A card whose team has no MLB game in the contest's slate
("off day") was rendering with **no game-state pill** under
the lineup slot and **no chip** in the right-sidebar roster
row. The bench (`/collection` and bench drawer) already
showed a muted `OFF` pill (§58 / §62), but the lineup page
itself was silent — leaving users staring at a card with
no indicator of why no game was attached.

### Fix

`src/components/lineup/SlotGameState.tsx` — extend the
existing OFF-pill rendering from the `bench` variant to
both `footer` (lineup slot) and `chip` (sidebar roster +
box score) variants. When `info` is null:
- `footer` / `bench` → muted `OFF` pill (matches §62 tone).
- `chip` → muted `OFF` word in the same tone class.

The `toneClass` helper now accepts `null` and returns the
muted text-3 color for off-day, matching the visual tone
of `scheduled` (the closest non-actionable state).

### Why this is right

The OFF pill already lived in the design vocabulary (§58)
— bench cards have shown it since Phase 18. The fix is
just propagating the same visual to the two surfaces that
were dropping it. No new states, no new colors; consistent
across every place a slot's day-state is surfaced.

Off-day handling stays "info is null" upstream — see §183
+ `fetch-slot-games.ts`: the SQL only returns rows for
cards whose team has a game in the contest, so off-day
cards naturally fall through to the null branch. No DB
change needed.

---

## 189. TBD-game OFF filter (Phase 47 v3)

### Problem

Same-session user follow-up:
> "Correct me if I'm wrong but everything that says TBD
> means they don't have a game today. Those slots are
> still show matchup and TBD instead of off. Shouldn't
> they say off?"

A game in today's slate with `status='scheduled'` and
`scheduled_start IS NULL` was rendering as `VS WSH · TBD`
on the lineup slot — the SlotGameState footer's PRE branch
substitutes `"TBD"` when the start time is null:

```ts
const time = info.scheduledStart ? formatTime(...) : "TBD";
return `${vs} ${info.opponentAbbr} · ${time}${dhMarker}`;
```

Prod check on 2026-04-25 showed exactly 1 such row in
the slate: `CHW vs WSH` (`bdl_game_id 5058168`) — BDL
had it on today's date but MLB Stats API had no published
start time. Two BDL teams' worth of cards (CHW + WSH
players) all rendered "VS WSH · TBD" / "@ CHW · TBD" on
the lineup, even though the user couldn't confirm a real
game existed.

### Decision

Treat `status IN ('scheduled', 'final') AND scheduled_start
IS NULL` as **off-day**. Same UX as cards whose team has
no entry in `included_game_ids` at all — render the
muted OFF pill from §188.

Postponed / suspended / canceled with NULL start are
**not** filtered — they still render the informational
PPD / SUSP / CXL pill (the user wants to know their
player's game was postponed; that's not the same as no
game at all).

### Fix

`fetchSlotGameByCardId` CTE adds an upstream WHERE filter:

```sql
AND NOT (
  g.status IN ('scheduled', 'final')
  AND g.scheduled_start IS NULL
)
```

The card's team-id lookup misses the filtered rows, so
both home + away teams' cards fall through to the OFF
branch shipped in §188.

### Why filter at the display CTE, not the slate

`create_daily_contest` keeps the game in
`included_game_ids` so that:
- Live event subscriptions stay primed if MLB Stats later
  publishes a start time (the slate refreshes on every
  `/lineup` load).
- Reconcile + scoring logic can still attribute fantasy
  points if a real `game_event` ever lands.

The display layer is the right cut — users see OFF, the
data pipeline stays open to recovery.

### Coverage

This subsumes the previously-shipped "final + NULL start
→ scheduled" demote case in §183: those rows are now
filtered out at the candidates source, so the demote CASE
in the SELECT is dead-code defensive. Left in place as
belt-and-suspenders for unreachable edge cases.

---

## 190. Game-state trust predicate (Phase 48)

### Problem

Same-thread user feedback after seeing 0-0 FINAL pills:
> "What about these Ties? There are no ties in baseball. We
> really need to make sure that the card game statuses are
> correct for all cards. Do we need to do a deeper spec on
> this or should we just continue patching by error?"

By this point we'd shipped 5 separate patches across two
phases (P47 + the v2 + v3 follow-ups), each addressing a
different way BDL emits a "final" we shouldn't trust:

  1. `final` + `scheduled_start > now()`     — §183
  2. `final` + `scheduled_start IS NULL`     — §183
  3. `final` + `now() − scheduled_start < 2h` — P47 v2
  4. `scheduled`/`final` + NULL start (TBD)   — §189
  5. `final` + `home_runs = 0 AND away_runs = 0` — NEW

The same demote logic lived in three places (display CTE,
webhook handler, schedule prefetch) and grew with each
discovery. The next BDL anomaly would mean a 6-place edit.

### Decision

Unify the demote logic behind a single SQL predicate,
`public.is_trustworthy_final(status, scheduled_start,
home_runs, away_runs)`. All three callsites consult it.
The next failure mode is a 1-line predicate change.

### Predicate definition

A `final` row is *trustworthy* iff:

```sql
status = 'final'
AND scheduled_start IS NOT NULL
AND scheduled_start <= now() - INTERVAL '2 hours'
AND home_runs IS NOT NULL
AND away_runs IS NOT NULL
AND NOT (home_runs = 0 AND away_runs = 0)
```

**Why 2 hours.** Real MLB games average 2h 50min; even
rain-shortened games run > 90 min. 2h is the conservative
floor that catches BDL sandbox finals (often delivered
seconds after first pitch) without risking false-positives
on legitimate fast games.

**Why no 0-0 finals.** 2026 MLB enforces the ghost-runner
rule starting in extra innings — every game guarantees a
winner. A 0-0 final is now strictly impossible. A 0-0
result + status `final` is a data error.

### Companion functions

- `public.final_passes_time_check(scheduled_start)` —
  time-only sub-gate. The webhook handler can't run the
  full predicate at the moment of the status flip because
  `reconcileGame()` hasn't populated scores yet; it uses
  this narrower gate. Display CTE + backfill use the full
  predicate.

- `public.final_trust_violation_reason(...)` — returns
  NULL if trustworthy, else a short machine code:
  `missing_start | not_started | too_recent | null_score
  | zero_zero_tie`. Used in webhook rejection notes
  (§193) and audit logs.

All three functions are STABLE (depend on `now()`),
search_path locked.

---

## 191. Five known failure modes

The predicate's reason codes cover every BDL anomaly
discovered to date:

| Reason          | Triggers when                                        |
|-----------------|------------------------------------------------------|
| `missing_start` | `scheduled_start IS NULL`                            |
| `not_started`   | `scheduled_start > now()`                            |
| `too_recent`    | `scheduled_start > now() - INTERVAL '2 hours'`       |
| `null_score`    | `home_runs IS NULL OR away_runs IS NULL`             |
| `zero_zero_tie` | `home_runs = 0 AND away_runs = 0`                    |

Order of evaluation matters — the function returns the
first failing reason. `not_started` wins over `null_score`
even when both fail, etc. This keeps audit logs
predictable for grep / dashboard work.

The next discovered failure mode adds one CASE branch to
both `is_trustworthy_final` and
`final_trust_violation_reason`.

---

## 192. Display + webhook + prefetch refactor

### Display (`fetch-slot-games.ts`)

CTE replaces the previous 3-case CASE expression with a
single predicate call:

```sql
CASE
  WHEN g.status = 'final'
   AND NOT public.is_trustworthy_final(...)
  THEN
    CASE
      WHEN g.scheduled_start IS NULL OR g.scheduled_start > now()
        THEN 'scheduled'::game_status
      ELSE 'live'::game_status
    END
  ELSE g.status
END AS status
```

The score columns are nulled in the demote case so the
W/L renderer in `SlotGameState` never sees bogus values.
The §189 OFF filter (TBD games) stays in place as a
separate concern.

### Webhook (`webhook-handler.ts`)

`mlb.game.ended` UPDATE clause:

```sql
WHERE bdl_game_id = $1
  AND public.final_passes_time_check(scheduled_start)
```

On rejection, the handler now returns
`unhandled: false` so the processor parks the delivery
in `webhook_failed` (§193), with a note keyed on
`final_trust_violation_reason()`. The retry cron's
exponential backoff (5/10/20/40/80m) handles the case
where BDL eventually sends a corrected delivery — the
predicate re-evaluates against current game state on
each retry.

### Prefetch (`schedule-sync.ts`)

The prefetch override now applies the score-sanity portion
of the predicate using BDL's payload directly (since
`scheduled_start` isn't populated until the second pass).
Catches:
- Future-dated finals (existing behavior)
- 0-0 finals (new)
- Final + null scores (new)

Counter renamed `future_finals_overridden` →
`untrustworthy_finals_overridden` in the cron response
to reflect the broader predicate.

---

## 193. Audit trail in `webhook_failed`

Previous behavior: webhook handler returned
`unhandled: true` on premature-final rejection, which
the processor treated as a successful no-op. Rejections
were lost.

New behavior: `unhandled: false` lands the delivery in
`webhook_failed` with `error_message` set to:

```
final_trust_violation:<reason> (game <bdl_game_id>)
```

Two consequences:

1. **Auditable.** A query like `SELECT count(*) FROM
   webhook_failed WHERE error_message LIKE
   'final_trust_violation:%' GROUP BY reason` shows BDL
   data quality over time per reason code.

2. **Self-healing.** The retry cron picks up these rows
   on its 5-minute schedule. Each retry re-evaluates the
   predicate against the current game row — so a
   delivery that was rejected because the game's score
   was 0-0 at the time can succeed once a real reconcile
   populates correct scores. Retries cap at 5 attempts
   with exponential backoff (5/10/20/40/80 min); after
   that the row sits unresolved for manual triage.

"Game not in our DB" rejections still return
`unhandled: true` (BDL fires for every MLB game; we
only model contest games — no retry helps).

---

## 194. Migration 0061 + backfill

Migration `0061_game_trust_predicate.sql` creates the
three SQL functions and runs a one-shot backfill:

```sql
UPDATE public.game
SET status     = 'scheduled',
    home_runs  = NULL,
    away_runs  = NULL,
    ended_at   = NULL,
    updated_at = now()
WHERE status = 'final'
  AND NOT public.is_trustworthy_final(
        status, scheduled_start, home_runs, away_runs);
```

Idempotent (no-op once everyone's clean). Applied to dev
+ prod via MCP. Prod verified: BAL@BOS (the surfacing
0-0 case) demoted, 14 of 15 slate games trustworthy
post-backfill (the 15th is CHW@WSH which has
`scheduled_start IS NULL` — not a final, doesn't trigger
the backfill, falls through to §189 OFF filter).

A residual cleanup also nulled `ended_at` on any rows
still in `status='scheduled'` with a stale `ended_at`
(leftover from earlier P47 backfills that didn't clear
the column).

### Files touched

- `supabase/migrations/0061_game_trust_predicate.sql` —
  new SQL functions + backfill (§190, §194)
- `src/lib/lineup/fetch-slot-games.ts` — display CTE
  refactor (§192)
- `src/lib/mlb/webhook-handler.ts` — webhook handler
  refactor (§192) + rejection audit (§193)
- `src/lib/mlb/schedule-sync.ts` — prefetch override +
  counter rename (§192)
- `src/app/api/cron/bdl-games-prefetch/route.ts` —
  surfaces renamed counter
- `tests/integration/game-trust-predicate.test.ts` —
  unit tests for the predicate (covers all 5 reason
  codes + happy path + reason ordering)
- `docs/adr/ADR-0048_phase-48-trust-predicate.md` —
  retro

### Not in scope

- **`live` and `scheduled` state validation.** All user
  pain points have been final-state. If/when BDL surfaces
  issues with those states, extend the framework with a
  parallel `is_trustworthy_live` / `is_trustworthy_scheduled`.
- **DB-level CHECK or trigger preventing untrusted writes.**
  The predicate is STABLE (uses `now()`), can't be used in
  a CHECK constraint. A trigger could enforce, but the
  ingest-side gate in webhook handler + prefetch already
  defends well.
- **PostHog events for trust violations.** `webhook_failed`
  is sufficient for now; product analytics can pull from
  there if needed.

---

## 195. Token inventory cap (Phase 49 Wave 1)

### Problem

User feedback after a week of play:
> "The user is getting way too many tokens and I think we need
> to limit the amount they can [have]."

The screenshot showed "TOKENS · 60 available" with a long
horizontal-scroll row. The token economy had no inventory
ceiling — every Premium pack rolled at a 60% per-card chance,
so a session of 5–8 Premium packs grew the tray to dozens.

User wants:
- A cap so the tray fits cleanly on one row.
- Click-a-token → sidebar detail (mirroring the card detail
  pattern).
- Quick-sell from the detail panel for coin recovery.
- Pack-reveal slot for tokens (Wave 2 — separate spec).
- Player choice when a pack would push you over cap (Wave 2).

### Decision (Wave 1 scope)

Hard ceiling at **20 unconsumed tokens** per `(user, season)`.
Surfaced as `economy_config.token_cap` so we can tune
without a new migration. When the user is at-or-above cap,
`open_pack` silently skips token rolls (the per-card
`random() < drop_rate` test still fires for metric
consistency, but the INSERT is suppressed and counted in
`tokens_skipped_at_cap` on the result payload).

Wave 2 will replace the silent skip with a player-choice
overflow flow + a token slot in the pack reveal animation
(see §198–§200 once shipped).

### Schema additions

```sql
ALTER TABLE public.economy_config
  ADD COLUMN token_cap integer NOT NULL DEFAULT 20,
  ADD COLUMN token_quicksell_values jsonb NOT NULL DEFAULT '{
    "hr_bonus":            25,
    "multi_hit_bonus":     15,
    "sb_bonus":            20,
    "strikeout_bonus":     25,
    "quality_start_bonus": 30
  }'::jsonb;
```

### Tray cap indicator

`TokenTray` header reads `X / 20 available` (tone-shifts at
≥90% — text-2 → text → tier-gold for at-cap). A second clause
`· at cap, packs won't add more` appears at exactly the cap.
Single-row constraint is naturally satisfied at width × 20
chips on the design width; users at cap see no horizontal
scroll.

---

## 196. Cap enforcement in `open_pack`

The token-roll loop now recounts inside the loop in case
earlier iterations of the same pack granted tokens that
push the user to cap mid-pack:

```sql
FOR i IN 1..v_pack_size LOOP
  IF random() < v_token_rate THEN
    SELECT count(*) INTO v_token_count
    FROM public.token
    WHERE user_id = p_user_id
      AND season_id = v_season_id
      AND consumed_at IS NULL;
    IF v_token_count >= v_token_cap THEN
      v_tokens_skipped := v_tokens_skipped + 1;
    ELSE
      -- (insert as before)
    END IF;
  END IF;
END LOOP;
```

`v_tokens_skipped` lands in the result JSON as
`tokens_skipped_at_cap`. The pack-open UI uses this to toast
"X token rolls suppressed: tokens at cap" so users
understand why their Premium pack didn't grant a token.

The base body for `open_pack` is 0052 (tier-weighted draws)
+ 0055 (mlbam dedupe). Only the token-roll block changes;
everything else stays byte-identical.

---

## 197. Token quick-sell + sidebar detail

### SQL function

`public.quicksell_token(p_user_id, p_token_id) → jsonb`.
Mirrors `quick_sell_card` semantics. Validates ownership,
`consumed_at IS NULL`, `applied_to_card_id IS NULL`. Refunds
coins via `credit_coins`, marks `consumed_at = now()`,
appends `:quicksold` to `acquired_source` for telemetry.

Returns `{coins_earned, balance_after, token_type}`.

### Server action

`quickSellToken({tokenId})` in `src/app/actions/tokens.ts`.
Wraps the SQL fn, revalidates `/lineup` (layout) and
`/collection`, fires PostHog `token_quick_sold`. Maps PG
errors to typed action codes:
- `token already consumed` → `TOKEN_ALREADY_RESOLVED`
- `currently applied to a card` → `TOKEN_APPLIED`
- `not found / not owned` → `NOT_FOUND`

### Sidebar swap

`?token={id}` URL param mirrors `?card={id}` — the sidebar
swap priority is now:

1. `selectMode` → `<SelectionPanel>`
2. `?token=id`  → `<TokenDetailPanel>` *(new)*
3. `?card=id`   → `<DetailSidebar>`
4. default      → `<AppSidebar>`

The two detail params are mutually exclusive (clicking one
strips the other). Back/forward + shareable links survive.

### TokenDetailPanel layout

Mirrors `CardDetailPanel`:
- ArrowLeft "Back" header (closes detail).
- Identity block: TokenBadge + long label + bonus chip +
  rule copy.
- Actions block: a single `Quick-sell · +N coins` button.
  Disabled (with reason copy) when contest is locked or
  the token is currently applied to a card.

Reads from `LineupTokenVM` already on the page (no fetch).
Sell value comes from new prop `tokenSellValueByType` on
`LineupViewProps`, populated server-side from
`economy_config.token_quicksell_values`.

### TrayTokenPip click

The drag-source pip's button now also fires `onClick` to
push `?token=id`. Drag still works (gates on `canDrag` from
react-dnd, not button `disabled`). Locked + applied tokens
remain clickable so the user can read details + (if
unlocked) quick-sell. An outline ring marks the active pip
when its detail panel is open.


---

## 201. Multi-select extends to tokens (Phase 49 Wave 1.1)

### Problem

User feedback after Wave 1 shipped:
> "Can we make the select option for the cards also work for
> tokens so we can quickly sell these?"

Wave 1 gave a single-token quick-sell via the sidebar detail
panel. With 60+ tokens to grind down, clicking each one
individually was too slow.

### Decision

Extend the existing select-mode toggle on the cards filter
row to also accept tokens. One Quick-sell button does both;
vault stays cards-only (tokens can't be vaulted).

### Wiring

- `selectedTokenIds: Set<string>` lives next to `selectedIds`
  on `LineupView`. Same select-mode toggle clears both on
  exit.
- `TokenTray` + `TrayTokenPip` accept `selectMode`,
  `selectedTokenIds`, `onToggleSelect` props. In select mode:
  - Drag is suppressed (`canDrag = !dragSuppressed`) so a
    single click toggles selection cleanly.
  - Click → toggle selection (instead of opening detail).
  - Selected pips render a tier-gold outline ring.
- `SelectionPanel` accepts `selectedTokens` + `tokenQuickSellTotal`
  alongside the cards props. Header reads `N selected`
  (combined). When both card + token sections are non-empty,
  a sub-line appears: `· 12 cards + 5 tokens`. Body renders
  separate `Cards (n)` and `Tokens (n)` SidebarSections.
- The Quick-sell confirm dialog adapts its description copy
  to "X cards + Y tokens for Z coins" / "Y tokens..." /
  "X cards..." based on what's selected.

### Bulk action

`handleBulkQuickSell` now fires `quickSellCards` +
`quickSellTokens` in `Promise.all`. Each returns its own
partial-failure shape. The handler combines results into a
single success toast (`Sold 3 cards + 8 tokens for 245
coins`) and a single failure toast if either reports
failures. Both selection sets clear; select mode exits.

### New server action

`quickSellTokens({tokenIds})` in `src/app/actions/tokens.ts`.
Mirror of `quickSellCards`: max 100 per batch, iterates
`public.quicksell_token` server-side (no new SQL fn — reuses
the per-token fn from §197), captures PostHog
`token_quick_sold` with `batch: true`. Revalidates `/lineup`
+ `/collection`.

### Why same select-mode (not a separate token select)

Single mode + one Quick-sell button is the smallest
mental model: `Select → click anything → Quick-sell`. Two
disjoint select modes would force the user to think about
which inventory they're selecting from. Vault stays
cards-only because it doesn't apply to tokens; the dialog
gates it behind `vaultDisabled = selectedCards.length === 0`.


---

## 198. Pack reveal token slots (Phase 49 Wave 2)

### Problem

Wave 1 silently suppressed token rolls when the user was at cap.
That made packs feel emptier and gave the user no control. The
original Phase 49 interview already specified the player-choice
overflow path — Wave 2 implements it.

Two visible features in Wave 2:
- **Token reveal slot** at the end of the pack reveal flip
  sequence. If a pack rolled a token, the user sees it flip
  alongside the cards.
- **Overflow resolve modal** (§199) appears after the reveal
  completes when any of the rolled tokens were `is_pending=true`.

### Schema change

Migration `0063_token_overflow_resolve.sql` adds:

```sql
ALTER TABLE public.token
  ADD COLUMN is_pending boolean NOT NULL DEFAULT false;
CREATE INDEX token_pending_by_user_idx
  ON public.token (user_id)
  WHERE is_pending = true AND consumed_at IS NULL;
```

Pending semantics:
- `is_pending=true, consumed_at IS NULL` → limbo. Doesn't count
  toward cap. Can't be applied. Doesn't show in tray.
- `is_pending=false, consumed_at IS NULL` → active inventory.
- `is_pending=*, consumed_at IS NOT NULL` → sold/used (audit row).

### `open_pack` overflow path

Replaces Wave 1's silent skip. Token-roll loop now:

```sql
SELECT count(*) INTO v_token_count
FROM public.token
WHERE user_id = p_user_id
  AND season_id = v_season_id
  AND consumed_at IS NULL
  AND is_pending = false;       -- <-- Wave 2: pending rows
                                --     don't gate further rolls
v_chosen_type := pick();
IF v_token_count >= v_token_cap THEN
  INSERT INTO public.token (..., is_pending) VALUES (..., true);
  v_pending_token_ids := append(v_pending_token_ids, id);
ELSE
  INSERT INTO public.token (...) VALUES (...);
  v_token_ids := append(v_token_ids, id);
END IF;
```

Result jsonb gains `pending_token_ids`; the legacy
`tokens_skipped_at_cap` field is retired.

### PackTokenFlip component

Sibling of `PackCardFlip`. Same 3D-Y-rotation spring at chip
dimensions (88×88 round). Face-down: dark "?" disc.
Face-up: `<TokenBadge>` centered. Below the badge, a small
pill: "BONUS TOKEN" (active) or "WILL RESOLVE" (pending).

### PackRevealPanel changes

`PerPackPayload.tokens: RevealedToken[]` (active + pending,
order-preserved). Panel renders a separate "Bonus tokens · N"
sub-row beneath the cards row when the pack rolled any tokens.
Tokens use a parallel `tokenFlipped: boolean[]` state. The
"Reveal all" button bulk-flips both cards and tokens. The
pack-complete gate (footer Next/Done) requires
`allCardsFlipped && allTokensFlipped && allDupesResolved`.

---

## 199. Overflow resolve modal

### Decision points (interview-confirmed Phase 49 Wave 2)

1. **Replace picker** — show all active tokens sorted by
   ascending `bonus_fp` (cheapest-to-replace at top). User
   picks any to swap out.
2. **Modal timing** — appears after **all packs** in the batch
   finish revealing, not after each one. One modal per batch
   handles the entire pending queue.

### SQL function

```sql
CREATE FUNCTION public.resolve_pending_token(
  p_user_id     uuid,
  p_pending_id  uuid,
  p_action      text,    -- 'keep_replace' | 'quicksell_new'
  p_replaced_id uuid DEFAULT NULL
) RETURNS jsonb
```

Two action codes:
- `keep_replace` (requires `p_replaced_id`):
  - Calls `quicksell_token(p_replaced_id)` — credits coins,
    marks consumed.
  - Flips pending row to `is_pending=false`. Net cap delta = 0.
- `quicksell_new`:
  - Flips pending row's `is_pending=false` (so the existing
    quicksell_token validation accepts it), then calls
    `quicksell_token(p_pending_id)` to credit + consume.

Bubbles errors from the underlying quicksell fn (already-applied,
not-owned, etc.) so the action layer's mapDbError handles them
without new branches.

### Server actions

- `fetchRevealTokens({ ids[] })` — generic token-detail fetch
  scoped to current user, returns `{id, tokenType, bonusFp,
  acquiredSource, isPending}`. Used by both the reveal panel
  (active + pending in one call) and the resolve modal
  (pending only, after fetch filters on `isPending=true`).
- `resolvePendingToken({ action, pendingTokenId, replacedTokenId? })`
  — wraps the SQL fn. Captures PostHog `token_overflow_resolved`.

### Modal UX

`<Dialog>` (not `<AlertDialog>` — this is a multi-item
walk-through, not a binary confirm). Header reads
`Token cap reached · N to resolve`. Body shows:
- **The new (pending) token** in a tier-gold-tinted card with
  badge + label + "+N FP per trigger" copy.
- **Replace picker**: scrollable list of active tokens sorted
  by ascending bonus_fp. Each row shows short label, long
  label, +N bonus, sell value. Click selects (gold highlight).
  Cheapest is auto-selected on each new pending; user can
  override.

Footer: two buttons.
- `Sell new (+X)` → `quicksell_new` action.
- `Replace · next` → `keep_replace` (or `Replace & finish`
  on the last pending). Disabled until a replace target is
  picked.

Modal advances to the next pending after each resolution.
Closes when the queue empties or user dismisses (X corner).
Bailing leaves pending rows in DB; `lineup-view` re-stages
them on next mount via `props.initialPendingTokenIds` (page
query surfaces unresolved pending IDs server-side).

### Pending tokens in `LineupTokenVM`

`isPending: boolean` added to the type. Page query selects
`is_pending` and includes pending rows in `props.tokens`.
`effectiveTokens` (the tray + selection-panel input) filters
`!t.isPending` so pending rows never render in the tray.
`initialPendingTokenIds` is a separate prop — array of pending
IDs the page found at load time. lineup-view inits
`pendingTokenQueue` from this so the modal auto-opens for any
unresolved leftover.

---

## 200. End-to-end flow recap

1. User opens 5 Premium packs while at cap (20/20).
2. SQL `open_pack` rolls cards normally. For each token roll:
   - Cap check excludes pending; user's "active" count is 20 ≥ 20.
   - INSERT with `is_pending=true`; id appended to
     `pending_token_ids`.
3. Server returns `OpenPacksBatchResult` with each pack's
   `tokenIds[]` + `pendingTokenIds[]`.
4. lineup-view's `handleBatchOpened` fetches all token details
   in one `fetchRevealTokens` call, partitions per pack.
5. `PackRevealPanel` walks each pack:
   - Card row flips (existing behavior).
   - Token row appears below; flip slots for each rolled
     token (active + pending). Pending shows "WILL RESOLVE".
6. After final `Done` click, `handleRevealDone` collects
   pending IDs across the batch into `pendingTokenQueue`.
7. `<TokenOverflowResolveModal>` opens with the queue.
8. User walks through each pending, picking replace target or
   quick-sell. Each call to `resolve_pending_token` either
   activates (replace path) or consumes (sell path) the
   pending row.
9. Modal closes when queue empties; `router.refresh()` brings
   the new tray + balance into view.


---

## 202. Live FP time-gate (Phase 50)

### Problem

User: "Their game statuses are not changing and they are not
recording FP."

Diagnosis showed two compounding issues:

1. **BDL fires `mlb.batter.*` events for upcoming games hours
   before scheduled_start.** Observed in prod: events for
   tonight's HOU @ NYY (scheduled 23:10 UTC) firing at 00:15
   UTC the same day — 23 hours pre-game. The
   `_apply_game_event_to_lineups` trigger runs on every event
   insert, so those pre-sim events were polluting `live_fp`.

2. **Events fire for games before the user's contest entry
   exists.** User sets a lineup at 1:23 PM ET; events from
   8 PM yesterday don't credit because the slot didn't exist
   at trigger time. There's no automatic recovery path.

### Fix — time-gate the score reducer

```sql
SELECT scheduled_start INTO v_scheduled_start
FROM public.game WHERE id = p_event.game_id;
IF v_scheduled_start IS NULL OR v_scheduled_start > now() THEN
  RETURN;  -- pre-sim event; skip FP application
END IF;
```

Added to the top of `_apply_game_event_to_lineups`. The event
still gets recorded in `game_event` (audit trail intact); only
the FP application is skipped. Real game events fire after
their `scheduled_start` and pass through normally.

This is the live counterpart to the §190 trust predicate — same
pattern (gate on `scheduled_start vs now()`), different event
phase.

---

## 203. Backfill SQL fn

### Decision

`public._backfill_entry_live_fp(p_entry_id)` recomputes `live_fp`
+ `live_score` from scratch over today's events for an entry.
Idempotent. Wired into `create_contest_entry` so every page load
picks up any FP credited between page reloads.

### Why "from scratch" (not incremental)

The trigger applies events incrementally; backfill replaces.
Both write the same field. To avoid double-count:

- Backfill takes a `FOR UPDATE` lock on the entry's slots before
  recomputing.
- The lock blocks the trigger's UPDATE until backfill commits.
- New events that fire during backfill are queued, then add on
  top of the freshly-computed value.

### Time-gate must use `event.created_at`, not `now()`

Initial 0065 used `g.scheduled_start <= now()`. That's correct
at trigger insert time (where `NEW.created_at == now()`) but
broken at backfill time: `now()` is always later than the
recompute moment, so a game whose `scheduled_start` has passed
admits its pre-sim events.

Corrected (0066): `ge.created_at >= g.scheduled_start`. The
event's own timestamp determines admission, regardless of when
the recompute runs.

### Today's-slate scoping (0067)

Backfill must scope to `g.date = current_slate_date()`. Without
it, the recompute sums the player's events from prior games this
season — observed in prod where Aaron Judge's April 22/23
BOS@NYY events were getting credited to today's slate.

---

## 204. Hooked into `create_contest_entry`

Every call to `public.create_contest_entry(p_user_id,
p_contest_id)` now ends with:

```sql
PERFORM public._backfill_entry_live_fp(v_entry_id);
```

`/lineup` calls `create_contest_entry` on every page load (it's
how the daily contest gets created/refreshed). So:

- Fresh user entry: backfill on creation captures any events
  that fired pre-creation.
- Returning user: backfill on every load corrects drift from
  the trigger (e.g. if a pre-sim event slipped through before
  the gate landed, next load self-heals).

Cost: ~10 slots × ~400 events scan, single query. Trivial.

---

## 205. Migrations 0065–0067

| Migration | Purpose |
|-----------|---------|
| 0065      | Time-gate the trigger; new `_backfill_entry_live_fp`; hook into `create_contest_entry`. |
| 0066      | Hotfix: backfill gate uses `ge.created_at >= g.scheduled_start` (not `now()`). |
| 0067      | Hotfix: backfill scopes to `g.date = current_slate_date()`. |

All three applied to dev + prod via MCP. Verified on prod: user
test account's bogus 37 FP (from BDL pre-sim noise) correctly
zeroed out post-backfill. 13 pre-sim events filtered;
0 qualifying events for the user's specific players today
(BDL's sandbox didn't sim them as starters).


---

## 206. Live data realtime — full pipeline (Phase 51)

### Problem

User: "the game statuses are not updating, the players FP is not
updating … This is a fantasy sports game but its core tracking
and information populating is not working."

The audit (P51) traced the live pipeline end-to-end and surfaced
a fundamental architectural gap:

- BDL webhook → `game_event` INSERT, `game` UPDATE ✓
- DB trigger → `contest_lineup_slot.live_fp` + `contest_entry.live_score` UPDATE ✓
- LiveEventsProvider subscribes to `game_event` INSERT, `game` UPDATE,
  `token_application` UPDATE → event feed narration ✓
- **`contest_lineup_slot` + `contest_entry` were NOT in the realtime publication** — when triggers updated `live_fp` / `live_score`, no broadcast signal reached the client
- **`SlotGameState` pill ignored the existing `game` UPDATE realtime channel** — even though inning/outs broadcast was wired, no consumer re-rendered the pill

Net effect: every score/state surface stale on mount, only the event feed updated live.

### Decision — three-pronged fix

**§207 Realtime publication.** Migration 0068 adds
`contest_lineup_slot` and `contest_entry` to
`supabase_realtime`, with `REPLICA IDENTITY FULL` so UPDATE
payloads carry the full row.

**§208 LiveEventsProvider broadens scope.** Now subscribes to
five tables in one channel:

  | Table | Event | Drives |
  |-------|-------|--------|
  | `game_event` | INSERT | event feed narration |
  | `game` | UPDATE | game-state pill + feed transitions |
  | `contest_lineup_slot` | UPDATE | per-card live_fp |
  | `contest_entry` | UPDATE | sidebar big LIVE score |
  | `token_application` | UPDATE | token fire/miss narration |

State stored in three Maps + an entry score record:
`slotFp: Map<slotId, {liveFp, finalFp}>`,
`gameState: Map<gameId, LiveGameState>`,
`entryScore: {liveScore, finalScore}`. Initial values seeded
from server-rendered props; UPDATE handlers merge fresh
values.

New hooks:
- `useLiveSlotFp(slotId)` → live FP for one slot
- `useLiveEntryScore()` → entry-level scores
- `useLiveGameState(gameId)` → per-game inning/outs/score
- `useLiveConnectionStatus()` → channel state

**§209 Components consume hooks.** Wired in this phase:
- `SlotGameState` pill — `useLiveGameState(info.gameId)` overrides
  status/inning/outs/score
- `LineupSlot` (lineup grid card) — `useLiveSlotFp(slotId)` overrides
  `card.contestFp`
- `AppSidebar` — `useLiveEntryScore` for the big LIVE number,
  `useLiveSlotFp` per-position roster row

Each hook returns `null` outside the provider; components fall back
to the server-rendered prop. RLS scopes broadcasts to the user's
own rows.

---

## 210. Event feed time-gate

The §202 P50 `_apply_game_event_to_lineups` time-gate stops
pre-sim BDL events from crediting `live_fp`. The event feed had
no such gate — users saw "+12 FP" lines for events that never
counted.

`LiveEventsProvider` now applies the same predicate
(`event.created_at >= game.scheduled_start`) to:
- Initial fetch — fetches a 60-row window then post-filters to keep
  the feed at 20 displayed entries
- Realtime INSERT path — drops pre-sim events at the channel handler

Games not present in `gameStateInitial` (or with NULL
`scheduled_start`) are also rejected.

Result: feed stays in sync with what's actually credited.

---

## 211. Reconnect UX

`<RealtimeStatusBanner>` mounts inside the provider tree, reads
`useLiveConnectionStatus`, and renders a fixed-position
"Reconnecting…" / "Connecting…" banner when the channel state
isn't `live`. Auto-clears on resubscribe (Supabase channel
handles retries).

Subtle, non-blocking. Matches user choice from interview: visible
status during transient blips without disrupting the lineup view.

---

## 212. Architecture summary

```
BDL webhook
   ↓
[webhook-handler]
   ├── INSERT game_event       ─┐
   └── UPDATE game (inning/etc) ─┤
                                 ↓
                        DB trigger _on_game_event_insert
                                 ↓
            [_apply_game_event_to_lineups (time-gated §202)]
                         ↓                ↓
            UPDATE contest_lineup_slot   UPDATE contest_entry
                         ↓                ↓
                     ┌───┴────────────────┴───┐
                     │  supabase_realtime    │
                     │  publication (§207)   │
                     └───────────┬───────────┘
                                 ↓
                  Realtime broadcast (RLS-scoped)
                                 ↓
            [LiveEventsProvider channel handlers (§208)]
                                 ↓
                  slotFp / gameState / entryScore state
                                 ↓
                  Hooks: useLiveSlotFp / useLiveEntryScore /
                         useLiveGameState (§209)
                                 ↓
            SlotGameState / LineupSlot / AppSidebar render
```

After Phase 51, every step has a consumer. Stale-on-mount is
gone. The event feed time-gate (§210) keeps narration honest.
The reconnect banner (§211) tells the user when broadcasts
pause.


---

## 213. P50 time-gate retraction (Phase 52)

### What broke

P50 (§202) added a time-gate to `_apply_game_event_to_lineups`
+ `_backfill_entry_live_fp` rejecting events whose
`created_at < game.scheduled_start`. The framing was "BDL pre-sim
noise shouldn't credit live_fp."

That was a misdiagnosis. **BDL's sandbox sim IS the game.** It
pre-simulates the entire slate ~24h in advance and fires all
events in one burst the night before — there is no second
"real" event stream during game time. With the gate active,
ALL sandbox events get rejected and zero FP credits.

Direct evidence: prior slates (Apr 23 / Apr 24) finalized with
33 + 38 FP for the same user precisely because the trigger had
no time-gate yet. Adding the gate broke the only working path.

### Decision — revert

Migration 0069 drops the time-gate from both the trigger and
the backfill SQL fn. All events apply FP regardless of
event-vs-scheduled-start ordering. The P51 `passesTimeGate`
filter on the event feed is also removed.

### What stays

- §190 `is_trustworthy_final` predicate (display demote of
  bogus "FINAL T 0-0" pills) — different concern, still correct.
- `_backfill_entry_live_fp` itself + its `create_contest_entry`
  hook — P50 §203 is still a valid path; just without the gate.

### Lessons

- The "pre-sim ghost FP" complaint that motivated P50 was a
  symptom of a different problem (entry created mid-sim, after
  trigger fired for events that lacked a slot to credit). The
  backfill alone solves that — gating doesn't.
- Sandbox semantics ≠ prod semantics. In real prod BDL events
  presumably fire in real time during games. The time-gate
  would be a no-op there. Designing around sandbox quirks risks
  exactly this kind of regression.

---

## 214. Webhook handler updates game scores from event payload

### What broke

`game.home_runs` / `game.away_runs` only got populated by:
1. Schedule prefetch cron (daily snapshot — wrong by mid-game).
2. `reconcileGame` at game-end (BDL box-score API — bogus 0-0
   in sandbox).

The webhook event handler captured `payload.play.home_score` /
`payload.play.away_score` on the `game_event` row but never
propagated to the `game` table. Result: live game pills stuck
on "0-0" for the entire game, even when 15 scoring events
fired.

### Fix

`handleGameEvent` in `src/lib/mlb/webhook-handler.ts` now
runs an idempotent UPDATE after each event INSERT:

```sql
UPDATE public.game
SET home_runs = COALESCE(${homeScore}, home_runs),
    away_runs = COALESCE(${awayScore}, away_runs),
    updated_at = now()
WHERE id = $game_id
  AND status IN ('live', 'final')
  AND (home_runs IS DISTINCT FROM ${homeScore}
       OR away_runs IS DISTINCT FROM ${awayScore})
```

`IS DISTINCT FROM` keeps the broadcast signal-only (only
fires when the score actually changes).

### One-shot backfill

Today's slate had ~14 games with real scores in their
`game_event` rows that never made it to `game.home_runs`.
Backfilled via:

```sql
WITH latest_scores AS (
  SELECT DISTINCT ON (game_id) game_id, home_score_after, away_score_after
  FROM game_event
  WHERE date = current_slate_date()
  ORDER BY game_id, created_at DESC
)
UPDATE game g
SET home_runs = ls.home_score_after, away_runs = ls.away_score_after
FROM latest_scores ls WHERE g.id = ls.game_id;
```

Score pills should now read e.g. "FINAL W 5-3" (TOR @ CLE) and
"LIVE 4-12" (HOU @ NYY) instead of bogus 0-0.


---

## 215. Auto-finalize entries (Phase 53A)

### Problem

Per-user contest entries never auto-finalized when their slate's
games ended. The score reducer (`_apply_game_event_to_lineups`)
credits FP to every entry where `ce.status <> 'final'`, so events
from later days landed on prior "still-open" entries — observable
as the user's April 25 entry sitting at 106 FP from accumulated
April 26/27 events.

### Decision

Auto-finalize an entry when all its contest's games are "done":

```sql
A game is "done for finalize" iff:
  scheduled_start IS NULL                    -- never properly happened
  OR (status='final' AND is_trustworthy_final(...))
  OR scheduled_start < now() - INTERVAL '24 hours'  -- BDL missed game.ended
```

Migration 0070:
- `_check_and_finalize_entry(entry_id)` — runs the predicate, flips
  status='final' + writes `final_score = sum(slot.live_fp)` if all
  games are done.
- `_finalize_entries_for_game(game_id)` — webhook helper. Called
  from `mlb.game.ended` after the game flips to final; iterates
  every non-final entry whose contest includes the game and runs
  the check.
- One-shot backfill at migration time for stale entries.

`final_score` uses `sum(live_fp)` not `sum(final_fp)` so
sandbox runs (where `reconcileGame` returns bogus 0-0 box scores)
still surface the trigger-summed FP. live_fp is the running total
from the score reducer; final_fp is reconcile's writeback. They
should match in normal ops; when they diverge (sandbox), live_fp
is what the user "earned."

### 24h fallback rationale

Real MLB games take 3-4 hours even with delays. After 24h, the
game is definitely done; BDL just didn't tell us. Without this
fallback, sandbox entries get permanently stuck in 'building'
because BDL doesn't reliably emit `mlb.game.ended` for every game.

---

## 216. Results summary screen

### Decision

When `entry.status='final'`, the lineup grid swaps to a
`ContestResultsSummary` component that shows:

- "FINAL" header with a Trophy icon and the final FP total
- "Top performer" callout (highest-scoring slot)
- Per-position breakdown table with player + FP + token-fired flag
- Empty-state copy when finalScore=0 (rare — only if no rostered
  players had qualifying events)
- Info footer: "Tomorrow's slate auto-creates at 4 AM ET. Your
  sticky slots will carry over."

Sidebar continues to render its existing 'Final' headline state +
the per-position roster (each row's FP via `useLiveSlotFp`). Cards
section stays usable. Only the LineupGrid area swaps.

The summary persists from finalize-time until the next 4 AM ET
slate pivot (when `current_slate_date()` rolls and a fresh entry
is created).

---

## 217. Webhook handler hooks finalize check

`handleGameEnded` in `webhook-handler.ts` now ends with:

```ts
await db.execute(sql`
  SELECT public._finalize_entries_for_game(
    (SELECT id FROM public.game WHERE bdl_game_id = ${bdlGameId})
  )
`);
```

Runs after `reconcileGame` and `mark_contest_entries_on_game_end`,
so by the time finalize-check runs, the game is final + slot
final_fps are reconciled. The fn is idempotent (only flips entries
that aren't already final + meet the predicate) so duplicate webhook
deliveries don't double-finalize.

---

## 218. Schedule sync timezone fix (Phase 54)

### Problem

Phase 51 / §215 / §217 chased "live FP not updating" through several
realtime-pipeline rewrites before the real bug surfaced: `scheduled_start`
in `public.game` was wrong by up to a day for evening ET games, and
`date` was wrong by a day for any game whose UTC start crossed
midnight ET → next-day UTC.

Symptom in prod data (April 24/25):

| matchup       | bdl_id   | actual ET start | stored `date` | stored `scheduled_start` |
|---------------|----------|-----------------|---------------|--------------------------|
| NYY @ HOU     | 5058158  | Apr 24 7:10 PM  | 2026-04-25    | 2026-04-25 23:10 UTC     |
| CHC @ LAD     | 5058160  | Apr 24 9:10 PM  | 2026-04-25    | 2026-04-25 23:15 UTC     |
| MIA @ SF      | 5058161  | Apr 24 9:45 PM  | 2026-04-25    | 2026-04-25 20:05 UTC     |

Events fired correctly (BDL emits in real time), but our trust
predicate / time-gates / display logic all keyed off the wrong
`scheduled_start`, so:

- §190 `is_trustworthy_final` rejected legit finals as "0-0 before
  scheduled_start," demoting them to LIVE.
- §215 `_check_and_finalize_entry` saw `scheduled_start > now()` for
  yesterday's games and stayed in 'building'.
- The lineup score sidebar showed yesterday's date next to today's
  rostered players because we displayed `g.date` directly.

Cause: `schedule-sync.ts` was deriving `scheduled_start` from the
MLB Stats API (UTC), and `date` from `now()::date` rather than from
the BDL game's ET-pivoted slate date. BDL's `Game.date` field is
the canonical UTC start timestamp, but we weren't using it.

### Decision

Three changes to `schedule-sync.ts`:

1. **Use BDL's `date` field as `scheduled_start` in the first-pass
   INSERT.** It's a `timestamptz` ISO string (e.g.
   `"2026-04-25T00:10:00.000Z"` for Apr 24 8:10 PM ET).

2. **Convert that UTC timestamp to ET-pivoted slate date when
   storing `game.date`.** Same arithmetic as
   `current_slate_date()`: `(scheduled_start AT TIME ZONE
   'America/New_York' - INTERVAL '4 hours')::date`. The `- 4
   hours` shifts pre-4-AM ET into the prior slate, matching the
   user-facing slate cutover.

3. **Make `ON CONFLICT` overwrite both columns from `EXCLUDED`.**
   Pre-§218, the schedule sync wouldn't fix already-stored rows.
   Now subsequent syncs heal stale data even without a backfill.

The MLB Stats API second pass is **narrowed to game_number only**
(doubleheader disambiguation). It no longer touches
`scheduled_start`, since BDL is now authoritative.

### Why this matters

`scheduled_start` is the spine of every time-based gate in the
system. Trust predicate, finalize check, time-gate-style guards in
`_apply_game_event_to_lineups` (already removed in §214 but still
referenced elsewhere), event feed sequencing, "live ticker" footer
copy. One wrong column poisoned all of them at once.

---

## 219. Drop time-gate from handleGameEnded (Phase 54)

### Problem

§190's `final_passes_time_check(scheduled_start)` predicate
(`scheduled_start <= now() - 2h`) was layered into
`handleGameEnded`'s UPDATE WHERE clause:

```ts
WHERE bdl_game_id = ${bdlGameId}
  AND public.final_passes_time_check(scheduled_start)
```

Combined with the §218 timezone bug, this rejected legitimate
`mlb.game.ended` deliveries for every Group B game — `scheduled_start`
was a day in the future, so `now() - 2h` was always before it. The
status flip never happened, so games stayed stuck on `'scheduled'`
forever, which cascaded into entries never finalizing (the predicate
in §215 keys off `status='final'`).

### Decision

Drop the gate. Trust BDL when it says a game ended.

```ts
// Before
WHERE bdl_game_id = ${bdlGameId}
  AND public.final_passes_time_check(scheduled_start)

// After
WHERE bdl_game_id = ${bdlGameId}
```

Defense-in-depth still works:

- Display-side `is_trustworthy_final` (§190) still demotes bogus
  0-0 finals to LIVE at render time (lineup-view + game-trust.ts
  both apply this).
- `_check_and_finalize_entry` (§215) keys off `is_trustworthy_final`
  before flipping entries — so even a status='final' from BDL with
  bogus scores won't propagate into the user's contest entry.
- The 24h fallback (§215) ensures entries always finalize after a
  day even if BDL never sends `game.ended`.

Net: the only thing the dropped gate was preventing — a status
flip from `'scheduled'` to `'final'` — is recoverable downstream
when the data is bogus, and required when the data is fine. Keeping
it broke the common case.

### Failure-path simplification

With the gate gone, `handleGameEnded`'s "no rows updated" branch
now has only one cause: BDL fired the event for a game we don't
have in our DB. The `note` is now just `game ${id} not in our db`
(no more `final_passes_time_check rejected`).

---

## 220. Backfill stuck game schedule (Phase 54)

### Problem

The fixes in §218 + §219 prevent the bug going forward, but games
already in the DB with wrong `scheduled_start` stayed wrong: §218's
new `ON CONFLICT … = EXCLUDED.scheduled_start` only triggers when
the BDL schedule sync happens to re-pull them, which doesn't
guarantee a near-term fix for in-flight slates.

### Decision

Migration `0073_backfill_stuck_game_schedule.sql` (file
`0071_backfill_stuck_game_schedule.sql` on disk; numbered 0073 in
prod after the §215 hotfixes 0071/0072) heuristically identifies
and corrects mis-scheduled rows.

**Detection:** if the earliest `game_event` for a game is more
than 6 hours before the row's `scheduled_start`, `scheduled_start`
is wrong. Real MLB games can't fire events before they start.

**Correction:**

```sql
new_scheduled_start = MIN(game_event.created_at) - INTERVAL '5 minutes'
new_date            = (new_scheduled_start
                        AT TIME ZONE 'America/New_York'
                        - INTERVAL '4 hours')::date
```

Five-minute pad because BDL events typically fire a few minutes
after first pitch (we don't have a cleaner "game start" event for
games we missed `mlb.game.started` on). Date arithmetic matches
`current_slate_date()` so backfilled rows sort into the right slate.

**Collision handling:** the unique index
`game_matchup_number_uidx (date, home_team_id, away_team_id,
game_number)` blocks shifts where the corrected date already has
a different game row for the same matchup (e.g. our DB has both a
"wrong-day" row and a "real-day" row for the same series). The
`safe_corrections` CTE skips those — they're rare and the regular
schedule sync (§218) will fold them in over time. Skipping is safe
because the duplicate won't cause user-visible issues; the real-day
row already has correct status/scoring.

**Re-finalize sweep:** after the UPDATE, a `DO` block iterates
every non-final entry and re-runs `_check_and_finalize_entry`,
catching entries that became eligible only after the date fix.

### Prod impact (April 25)

10 rows matched the heuristic. 6 corrected (all 5 stuck Group B
games for today's slate + 1 historical LAD@SF). 4 collisions
skipped (older 4/22-4/23 games where a duplicate row already
existed at the correct date). After the migration:
`event_minus_start_minutes = 5.0` for all corrected rows, which is
the expected post-correction baseline.

---

## 221. MLB Stats canonical for date + scheduled_start (Phase 55)

### Problem

§218 made BDL's `g.date` field the authoritative source for
`scheduled_start` (and `date`, via ET-pivot). Investigation on the
April 27 (Monday) slate revealed a second BDL data quality issue:
`g.date` is sometimes **24 hours late** for late-evening ET games.

Concrete example — NYY @ TEX, April 27, 2026, 8:05 PM ET:

| Source           | start time              | local date |
|------------------|-------------------------|------------|
| MLB Stats API    | 2026-04-28T00:05:00Z    | 4/27 ET ✓  |
| BDL `g.date`     | 2026-04-29T00:05:00Z    | 4/28 ET ✗  |

ET-pivot is innocent (it correctly translates whatever timestamp
it gets); BDL's payload itself is wrong. Same bug for CHC@SD
(2026-04-29T01:40Z claimed; truth 2026-04-28T01:40Z) and MIA@LAD
(claimed 2026-04-29T02:10Z; truth 2026-04-28T02:10Z).

The downstream effect: late-evening games get filed under the
*next* slate's `date`, the lineup view filters them out of the
"today's slate" set, and players whose teams ARE playing show as
OFF in the slot footer.

### Decision

Switch to **MLB Stats canonical** for `date` and `scheduled_start`.

**First-pass INSERT** (`schedule-sync.ts`):

- Continue using BDL's `g.date` as the seed value when a row is
  brand-new. It's the only source available before MLB Stats has
  been queried.

**ON CONFLICT**:

- Use `COALESCE(public.game.date, EXCLUDED.date)` and
  `COALESCE(public.game.scheduled_start, EXCLUDED.scheduled_start)`.
  Once a row's columns are populated (whether from a prior BDL
  seed or from a prior MLB Stats correction), BDL never overwrites.

**Second-pass MLB Stats UPDATE** (extended from §218):

```sql
UPDATE public.game AS g
SET scheduled_start = ${startIso}::timestamptz,
    date            = (${startIso}::timestamptz
                         AT TIME ZONE 'America/New_York'
                         - INTERVAL '4 hours')::date,
    game_number     = ${gameNumber}::smallint,
    updated_at      = now()
WHERE g.id = (
  SELECT id FROM public.game
  WHERE home_team_id = …
    AND away_team_id = …
    AND date BETWEEN (${iso}::date - INTERVAL '1 day')::date
                 AND (${iso}::date + INTERVAL '1 day')::date
  ORDER BY
    (game_number = ${gameNumber}::smallint) IS TRUE DESC,
    ABS(EXTRACT(EPOCH FROM (date - ${iso}::date)))::int ASC,
    created_at ASC
  LIMIT 1
)
AND ( … IS DISTINCT FROM … )
```

The match window is widened from `date = ${iso}` (P54) to
`date BETWEEN ${iso} - 1 day AND ${iso} + 1 day` to catch BDL's
24h-late case. The ABS-distance ordering picks the row whose
stored date is closest to MLB Stats' canonical date, so we don't
accidentally cross-match a different game in the same series.

The IS-DISTINCT-FROM clause keeps the UPDATE idempotent — when
MLB Stats and our row already agree, no write fires.

### Why this is the right shape

- Schedule changes (rain delays, suspended → resumed, postponements
  → reschedules) propagate naturally because the second pass fires
  every cron tick (every 2h) against fresh MLB Stats data.
- BDL's `g.date` becomes "best-effort initial seed" — the sync still
  works on day-zero before MLB Stats can be queried, but BDL's
  inconsistency stops poisoning long-term state.
- The status no-regress rule (§14) still holds; we only let MLB
  Stats touch `date`, `scheduled_start`, and `game_number`.

---

## 222. Hotfix: April 27 misdated games (Phase 55)

Three rows on the April 27 prod slate were affected by §221's BDL
bug:

| bdl_game_id | matchup    | wrong start (UTC)        | corrected start (UTC)    |
|-------------|------------|--------------------------|--------------------------|
| 5058197     | NYY @ TEX  | 2026-04-29 00:05:00      | 2026-04-28 00:05:00      |
| 5058198     | CHC @ SD   | 2026-04-29 01:40:00      | 2026-04-28 01:40:00      |
| 5058199     | MIA @ LAD  | 2026-04-29 02:10:00      | 2026-04-28 02:10:00      |

Direct prod UPDATE landed before §223's checked-in migration. After
the fix:

- `public.contest.included_game_ids` for the active 4/27 slate grew
  from 5 → 8 entries (via `create_daily_contest()` re-run, which
  picks up the new `date='2026-04-27'` set).
- The user's lineup slots for NYY (Aaron Judge) and SD (Yuki Matsui)
  flipped from OFF to PRE on next render. Slots whose teams (e.g.
  SF — Jung Hoo Lee) genuinely don't play 4/27 stay OFF (correct;
  Mondays in MLB have ~half the league on travel days).

---

## 223. Backfill migration for §221 (Phase 55)

`0072_backfill_bdl_date_24h_late.sql` (numbered 0074 in prod after
the §220 backfill landed as 0073).

**Detection heuristic:** if a `game_event` fires more than 18 hours
before the row's `scheduled_start`, `scheduled_start` is 24h-late.
The 18-hour threshold is generous enough to catch the 24h offset
without false-firing on intra-game timing wobble.

**Correction:** same approach as §220 —
`new_scheduled_start = MIN(game_event.created_at) - INTERVAL '5 minutes'`,
ET-pivot for `date`. Collision skip via the
`safe_corrections` CTE.

**Re-finalize sweep:** entries that became eligible only after the
date shift are flipped via `_check_and_finalize_entry`.

This migration is idempotent and runs alongside §220's heuristic
(which uses a 6-hour threshold). The 18-hour threshold here only
fires on rows §220 didn't catch — a strictly broader recovery net
for cases where BDL has the date wrong AND events somehow happened
under that wrong scheduled_start (rare; mostly applicable to games
already played whose scheduled_start was retroactively corrected
during a sync).

The April 27 hotfix in §222 already corrected the 3 in-flight rows
via direct SQL; this migration is a no-op against those (all
within 5min of MIN(event)) but ensures any future occurrence is
healed automatically.

---

## 224. Live mirror of career_fp_total (Phase 56)

### Problem

Two FP numbers belong to different audiences but they were entangled
in the UI:

- **Lifetime FP** — the cumulative FP a card has scored across every
  contest it's ever played in. Drives Bronze → Silver → Gold → Diamond
  tier progression. Lives on `card.career_fp_total`.
- **Today's FP** — the per-slot contribution for the current contest.
  Lives on `contest_lineup_slot.live_fp` (running) and
  `final_fp` (post-reconcile).

Pre-§224 wiring:

- The lineup-grid card front used `LineupCardVM.contestFp`, which
  `lineup-view.tsx` set to `liveFp + finalFp` post-submit. So the
  card front showed *today's* FP after the contest started — and the
  user couldn't see their lifetime number tick up while a game was
  live.
- `card.career_fp_total` only updated at entry-finalize time
  (`_finalize_contest_entry`'s `+= live_fp` step), so it was
  effectively frozen during gameplay.
- The right sidebar (`AppSidebar`) already correctly showed today's
  slot FP via `useLiveSlotFp` — same number duplicated on both
  surfaces, no separation.

### Decision

Clean separation:

- **Card front** (lineup grid + bench / Cards panel) always renders
  `card.career_fp_total`. During a live game, that number ticks up
  in real time as today's events score.
- **Right sidebar** continues to render today's `live_fp + final_fp`
  via `useLiveSlotFp` — unchanged.
- Token bonus FP mirrors to both: `live_fp` (sidebar) and
  `career_fp_total` (card lifetime) increment together.

The two numbers are now visibly different: at the start of tonight's
game the card might show "47.3 FP" (lifetime) and the sidebar shows
"0.0 FP" (today). After a HR + RBI, card shows "55.3 FP" and sidebar
shows "8.0 FP".

### SQL changes (`0073_live_career_fp_mirror.sql`, applied to prod
as 0075)

`_apply_game_event_to_lineups` (originally 0012) gains a card-update
inside both batter and pitcher loops:

```sql
UPDATE public.card
SET career_fp_total = career_fp_total + v_fp_delta,
    updated_at = now()
WHERE id = r.starter_card_id;
```

…plus an identical update inside the token-fires branch for bonus FP.

`_finalize_contest_entry` (originally 0013) **drops** its
`UPDATE public.card SET career_fp_total = career_fp_total +
v_slot.live_fp` step. The live trigger has already done that
incrementally. Finalize now only handles `final_fp` copying,
contract-play decrement, milestone counters, manager XP, and
`manager_account.lifetime_fp` — none of which touch
`career_fp_total`.

The `card_tier_on_fp_change` trigger (which fires Bronze → Silver
→ Gold → Diamond promotions on `career_fp_total` increases) now
fires *during* the game instead of at finalize time. That's the
right shape: tier promotions are user-visible "moments" and they
should land at the FP that triggered them, not be batched at
finalize.

### One-shot backfill

For every non-final entry with `live_fp > 0`, add the slot's
`live_fp` to the rostered card's `career_fp_total`. Without this,
the next live event would compound on a stale base
(`career_fp_total` reflected only the pre-§224 finalize-time math,
so any live_fp accumulated mid-game on building entries was
"stuck" not yet credited).

### TypeScript changes

`LiveEventsProvider`:
- Add `cardCareerFp: Map<string, number>` to context state.
- Subscribe to `public.card` UPDATE (already in
  `supabase_realtime` per migration 0028 with `REPLICA IDENTITY
  FULL`).
- Expose `useLiveCardFp(cardId): number | null` — returns the
  realtime-mirrored lifetime FP, or null when no realtime update
  has arrived (caller falls back to the server-rendered prop).

`LineupSlot.tsx`:
- Drop the `useLiveSlotFp` override that set `card.contestFp`.
- Add `useLiveCardFp(card.id)` override on `card.careerFp`.

`BenchCard.tsx`:
- Add `useLiveCardFp(card.id)` override on `card.careerFp` (so
  rostered cards also tick up live; unrostered cards just keep
  the static prop because no realtime update fires for them).

`lineup-view.tsx`:
- Drop the `enhancedCard` block that set `contestFp +
  contestFpLabel` post-submit. Card prop passed to children is
  now the raw `LineupCardVM` with `careerFp` only.

`AppSidebar.tsx`:
- Unchanged. It already used `useLiveSlotFp` for the per-slot FP
  cell and `useLiveEntryScore` for the team headline. Those keep
  showing today's contribution, distinct from the card-front
  lifetime number.

### What lands at the 4 AM ET slate flip

No special handling needed. At 4 AM ET:
- The previous contest's entries are in `final` status (per §215
  auto-finalize).
- A new contest is created with its own slot rows, all with
  `live_fp = 0`. Sidebar resets to zero on those new slots.
- `card.career_fp_total` already reflects the lifetime including
  yesterday's contribution (added incrementally during yesterday's
  games, via the live trigger). Nothing to migrate.

### What lands when reconcile diverges from live_fp

If the reconcile box-score correction makes `final_fp ≠ live_fp`
(e.g., BDL events double-fired and the trigger over-counted by
0.6 FP), `career_fp_total` is now slightly off because it absorbed
the live trigger's reading. We accept this — the divergence in
practice is sub-FP and the simpler "live trigger is authoritative"
contract is worth the small drift. A future phase could add a
reconcile-time delta: `career_fp_total += (final_fp - live_fp)`,
gated behind `is_trustworthy_final` so sandbox/zero-fp reconciles
don't zero out real contributions. Out of scope for §224.

---

## 225. Projected FP — pinned to 0 until Vegas-aware stack lands (Phase 57)

### Problem

The right sidebar's PRE-state per-slot FP cell, the Drafting headline
"Projected" stat, and the Live headline secondary "Projected" stat
all read from a single helper, `computeSingleProjected(fill)`:

```ts
function computeSingleProjected(fill) {
  if (!fill.card) return 0;
  const playsUsed = fill.card.contractMax - fill.card.contractPlays;
  const perCard   = playsUsed > 0
    ? fill.card.careerFp / playsUsed
    : TIER_BASELINE_FP[fill.card.tier];
  return perCard + (fill.appliedToken?.bonusFp ?? 0);
}
```

That's a per-game arithmetic mean (with a tier baseline fallback for
brand-new cards), plus the applied token's bonus baked in. It's the
absolute floor of projection methodologies — and it's labeled
"Projected" in the UI, which sets a higher expectation than the math
delivers.

Two specific issues called out by the user (April 2026):

1. **Token bonus baked in** — implies certainty the token will
   trigger. A user looking at "Aaron Judge — Projected 31.0" has no
   way to tell whether that includes the +5 from a Multi-Hit Bonus
   token or not.
2. **No matchup, no recent form, no park, no Vegas signal** — a
   straight career-mean gets stale fast. A rookie's mean is
   misleading until ~50 games. Ace-vs-scrub matchups score the
   same. Coors Field vs Petco score the same.

### Decision

Until a real Vegas-aware projection stack ships, all "Projected"
numbers in the sidebar are pinned to **0.0** (per-slot cells
included). The label still reads "Projected" but the number is
0.0 across the board — honest, even if not yet useful.

`computeSingleProjected` returns `0` unconditionally. The plumbing
(call sites in `Headline`, `pickFpCell`, etc.) and types stay
intact so the Vegas-aware model only needs to swap this function's
body when it lands. The `TIER_BASELINE_FP` table is kept as dead
code (`_TIER_BASELINE_FP`) — it's the fallback for cards with no
`game_event` history once the real model lands.

### What "Vegas-aware" means

Industry-standard DFS projection systems (DraftKings, FanDuel,
RotoGrinders, Awesemo, Stokastic) blend roughly seven layers, in
order of impact:

| Layer | What | Data source for Draft Deck |
|-------|------|----------------------------|
| 1 | **Recent-form weighted mean** — 70% last 7d + 25% last 30d + 5% season | `public.game_event` history, already in DB |
| 2 | **Matchup adjustment** — opposing pitcher's K-rate, BB-rate, lefty/righty splits | BDL `getStats` season-aggregated player stats |
| 3 | **Park factor** — Coors +12% offense, Petco -8%, etc. | Static lookup table (public data, hand-coded) |
| 4 | **Lineup-spot** — leadoff (~5 PA) vs 9-hole (~3 PA) | BDL confirmed lineups (when available) |
| 5 | **Vegas implied team total** — over/under × moneyline → team runs | New data vendor (BDL doesn't have moneylines) |
| 6 | **Confirmed-active gate** — out of lineup → projection 0 | BDL scratches |
| 7 | **ML / Bayesian blend** of all the above | Historical training corpus, model serving infra |

Layers 1-4 can be built today on data we already have or can
obtain cheaply. Layer 5 is the highest-impact single signal (the
implied team total is the most predictive feature in most public
DFS-projection model writeups) but requires a new vendor
relationship — odds providers like The Odds API, OddsJam,
SportsData.io. Layer 6 is operationally important — projecting a
benched player's normal output is the worst kind of wrong. Layer
7 is a research project.

### Phasing for the future build-out

1. **Phase 57.1 (when prioritized)** — Layers 1 + 3 + 6. Recent-form
   weighted mean + park factor + confirmed-active gate. Uses only
   data we already have (BDL injuries / scratches confirms active
   status, `game_event` history feeds recent-form). Single-week
   build. Replaces `computeSingleProjected`'s body without changing
   any call sites.

2. **Phase 57.2** — Add Layer 2 matchup adjustment. Pulls opposing
   pitcher stats per game from BDL's season-stats endpoint. ~3-5
   days.

3. **Phase 57.3** — Add Layer 4 lineup-spot when BDL exposes
   confirmed lineups. ~2 days.

4. **Phase 57.4** — Add Layer 5 Vegas implied team total. Requires:
   - Vendor selection + contract (typical: $200-500/mo for a free-
     to-play tier).
   - New cron to pull odds at slate-create time + re-poll near
     lock.
   - New table: `public.daily_team_implied_total` keyed on
     `(date, team_id)`.
   - `computeSingleProjected` reads from the new table.

5. **Phase 57.5** — Layer 7 ML blend. Train on the prior season's
   `game_event` + box score history. Out of scope for v1; a "nice
   to have" for v2 once we have multi-season data.

Until those phases ship, "Projected" stays at 0.0 — a placeholder
the user understands as "we're not making a dishonest forecast yet."

### Files touched in §225

- `src/components/layout/AppSidebar.tsx`:
  - `computeSingleProjected` body → `return 0;`
  - `TIER_BASELINE_FP` renamed `_TIER_BASELINE_FP` (dead-code marker).
- Polish spec §225.

---

## 226. Sidebar redesign — Lineup / Events / Packs (Phase 58)

### Problem

Current sidebar layout (post-§143) is:

```
┌─────────────────────────────────┐
│ HEADLINE (score / status)        │ ← always visible
│ ROSTER (10 rows)                 │ ← always visible, scrolls
├─────────────────────────────────┤
│ [Actions] [Events] [Packs]       │ ← tabs
│ Auto-sub mode + Warnings         │ ← Actions tab
│ ...                              │
└─────────────────────────────────┘
```

Three issues with this:

1. **Actions tab is mostly dead weight.** Auto-sub mode is going
   away (sticky pin/unpin from §175 already covers carry-over),
   leaving just the Warnings section. Doesn't need a whole tab.
2. **Lineup roster is always-visible above tabs**, eating vertical
   space that would be better spent on whichever tab the user is
   viewing. When a user is on the Events tab they don't need to
   see the roster too.
3. **Events feed has no visual hierarchy.** Game state transitions
   (first pitch, end of inning, final) render with the same weight
   as batter events that move the user's score. The signal-to-noise
   tilts against the events users actually care about.

### Decision

Three-tab sidebar, headline persistent above tabs, no scroll except
in Events:

```
┌─────────────────────────────────┐
│ HEADLINE (score / status)        │ ← persistent, ~80px
│ WARNINGS (only when present)     │ ← persistent, ~30-60px
├─────────────────────────────────┤
│ [Lineup] [Events] [Packs]        │ ← tabs, default Lineup
├─────────────────────────────────┤
│                                  │
│ Tab body (no scroll except       │
│ Events)                          │
│                                  │
└─────────────────────────────────┘
```

#### Tab inventory

| Tab | Body | Scroll? |
|---|---|---|
| **Lineup** | 10 roster rows (player, status pill, FP cell, sticky pin) | No — fits in viewport |
| **Events** | Hierarchical event feed (see below) | Yes — events stream, user scrolls back/forward |
| **Packs** | Daily pack timer + buy buttons + coin balance | No — fits in viewport |

Default tab on load: **Lineup**.

#### Headline

Stays in current `<Headline>` shape (§141). All three states render
above the tabs:

- **Drafting** — `Drafting · 5/10 slots filled` + Projected 0.0 FP
- **Live** — `Live · T5 · 1 of 4 games` + live FP
- **Final** — `Contest final` + final FP

#### Warnings

Migrate from inside the Actions tab to a row directly below the
headline, above the tabs. Render only when warnings exist (no "No
warnings." copy). Format unchanged from the current Actions-tab
version — position label, player short name, reason chip in
gold.

When 4+ warnings, collapse to "+N more" with click-to-expand.
(This is the only no-scroll tradeoff — header height stays bounded.)

#### Auto-sub mode → REMOVED

- UI: drop entirely from the sidebar. No replacement.
- Server action `setAutoSubMode` → kept on disk but no longer
  invoked from the lineup page. Future cleanup phase removes it +
  the underlying column.
- Sticky pin/unpin (§175) is the canonical carry-over mechanism;
  auto-sub was a competing concept that confused users.

### Events tab — visual hierarchy

Two tiers of feed entries:

#### Tier 1: Player events (high prominence)

Events that moved the user's FP. Layout:

```
┌──────────────────────────────────────┐
│ [photo] Aaron Judge       +10.0 FP   │
│         HR · T5 · vs TEX     7:42p   │
└──────────────────────────────────────┘
```

- **Player photo** on the left (32px). Falls back to team logo if
  `card.photoUrl` is null.
- **Player name** (medium weight) + FP delta (right-aligned, mono,
  emerald for positive, red for negative).
- **Action line** below — the play description, inning, opponent
  abbr, time.
- Rendered as a card with subtle border + tier-colored left edge
  (mirrors the player's card tier color).

Token fires/misses are Tier-1 events too — same card shape with
a 🪙 token glyph instead of the photo + bonus FP delta:

```
┌──────────────────────────────────────┐
│ [🪙]  Token hit · Multi-Hit Bonus     │
│       Aaron Judge        +5.0 FP     │
└──────────────────────────────────────┘
```

#### Tier 2: Game-state events (subtle, divider-style)

Game starting, inning transitions, game ending. Render as a
horizontal divider with centered text — no card, no photo, muted
color, smaller font:

```
─────────  First pitch · NYY @ HOU  ─────────
─────────         T5 · 2-1            ─────────
─────────         Final · 5-3            ─────────
```

End-of-inning entries are **generic** per the user's spec — just
the inning marker + score, no per-player breakdown. Acts purely
as a chapter divider in the feed so the user can scan when each
inning happened without their FP-relevant events being lost in
the noise.

#### Event ordering + scroll

Newest at top (current behavior, unchanged). Scroll surface bound
to the tab body, not the full sidebar. Initial load fetches 50
events; older events fade in as the user scrolls down (lazy with
50-event chunks).

### Implementation plan

#### `AppSidebar.tsx`

- Move the existing `<Headline>` + a new `<HeadlineWarnings>`
  block above the `<Tabs>`.
- Move existing `RosterRow` × 10 into a new `<LineupTab>` body.
- Remove the entire `<LineupActions>` block (auto-sub fieldset).
- Rename `actions` tab to `lineup`.
- Restructure `<EventFeed>` to render Tier-1 player cards + Tier-2
  divider markers based on event type.

#### `EventFeed.tsx` (new file split out from current inline impl)

- Read `events` from `useLiveEvents()` (existing hook).
- Read `gameState` from a new helper `useLiveGameState` calls
  (already exists per §208).
- For each event, project into one of two render shapes:
  - `PlayerEventCard` — Tier-1 high-prominence card.
  - `GameMarker` — Tier-2 divider strip.
- Synthetic markers (game start, end-of-inning, final) injected
  client-side from `gameState` transitions; player events come
  straight from `game_event` realtime.

#### `useFeedEntries` (new hook)

Merges raw events + synthetic game markers into a single
chronologically-ordered list:

```ts
type FeedEntry =
  | { kind: 'player'; …row data… }
  | { kind: 'token';  …row data… }
  | { kind: 'marker'; …game state transition… };
```

Sort by `event_at DESC` (player events) or `inferred_at DESC`
(synthetic markers using game_state UPDATE timestamps).

#### `lineup-view.tsx`

- Remove `autoSubMode` + `setAutoSubMode` call site.
- Remove `mode` state.
- Remove auto-sub-related props passed to `<AppSidebar>`.

### Out of scope

- Toast notifications (the user explicitly chose feed-only).
- Sound effects (separate UX call).
- "Pop up" modal flows for big moments (e.g. tier-up celebrations) —
  those have their own existing flow per §172/§118 and aren't
  changing here.
- Settings panel for per-event-type opt-in (could come later if
  the feed feels noisy in practice).

### Files touched

- `src/components/layout/AppSidebar.tsx` — main restructure.
- `src/components/lineup/EventFeed.tsx` — extracted from inline,
  hierarchy added.
- `src/components/lineup/PlayerEventCard.tsx` — new Tier-1 component.
- `src/components/lineup/GameMarker.tsx` — new Tier-2 divider.
- `src/components/lineup/use-feed-entries.ts` — new hook.
- `src/app/(app)/lineup/lineup-view.tsx` — drop auto-sub wiring.


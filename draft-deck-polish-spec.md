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

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

### Scope — applies to every card-movement surface

1. **Lineup building**
   - Bench → slot drop
   - Slot → slot reorder (swap)
   - Slot → bench (remove from lineup)
2. **Vault selection** — drag-to-vault-dropzone (replaces today's
   tap-to-toggle).
3. **Pack opening reveal** — cards arrive with the same physics
   language rather than a flat flip.
4. **Quick-sell dissolve** and **season-end dissolve** — currently
   opacity fade; upgrade to a coherent motion vocabulary.
5. **Tier-up cut-in** (§6.3, already deferred) — when it lands, it
   uses this vocabulary.

Everything below applies uniformly to every surface above unless the
"where" column notes otherwise.

### Behavior

| Phase | What happens | Where |
|---|---|---|
| Idle | Card sits with a resting elevation (`shadow-sm`). | All |
| Hover | 2px lift + shadow grows (matches UI/UX §4.12 rest state). | Lineup, collection, bench, vault selection |
| Pick-up (`mousedown` / pointer grab) | Card scales 1.03, shadow deepens sharply, slight tilt based on cursor velocity. Spring-based (not linear). | Any draggable card |
| Dragging | Card follows the cursor with a spring-delay (~80ms lag), retaining tilt. Origin slot dims to placeholder outline. Ghost image is **the card**, not the default browser drag preview. | Any draggable card |
| Hover-over-valid-target | Target slot highlights (team accent border pulse). Card shadow lightens to signal "about to commit." | Lineup slots, vault drop zone |
| Hover-over-invalid-target | Target stays inert. Card cursor shows dashed-forbidden border. | Lineup slots where position doesn't match |
| Drop on valid | Card snaps into slot with ease-out over ~180ms. Slot briefly flashes team accent, then settles. | All |
| Drop on invalid | Card bounces back to origin with a shake (small lateral oscillation, ~350ms). | All |
| Release in empty space | Same as invalid — return to origin with shake. | All |

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

## 2. Rich lineup card (richer 96×134 Small card)

### Goal

Today the lineup slot shows a 96×134 Card at Small size (UI/UX
§4.11.1) which was spec'd to show photo + name + position abbr +
FP. With photo sync still stubbed, the face collapses to "two
initials and a tiny label," and managing a lineup feels like reading
cell IDs. The fix: redesign the Small card so every piece of info a
lineup manager needs is legible at 96×134, even without photos.

### Direction (confirmed: Option A)

Keep the 96×134 footprint — **same size, denser layout.** No
hover-expand, no move to Medium. The diamond stays as-is; the card
face gets reworked.

### New Small card layout

```
┌─────────────────────┐ ← tier border (2px, full color, UI/UX §4.5)
│ ┌─────────────────┐ │
│ │ C  NYY          │ │ ← position chip (left) + team abbr (right),
│ │        [STAR]   │ │    status pill (IL / DFA) when applicable
│ │                 │ │
│ │  [photo or      │ │ ← photo takes the middle; fallback silhouette
│ │   initials]     │ │    + jersey number when null
│ │                 │ │
│ │        [TOK]    │ │ ← token slot indicator when a token is
│ │                 │ │    applied (bottom-right corner)
│ │ J. Webb         │ │ ← last-name-only for compactness; hover
│ │ ●●●●●●●●○○○○○○○ │ │   reveals full name. Dot row = contract
│ │ 42 FP  1,247 FP │ │   pips (filled = plays remaining, open =
│ └─────────────────┘ │   consumed). Season FP / career FP stacked.
└─────────────────────┘
```

### Legibility pieces (priority order)

1. **Tier border.** 2px full color so you can scan tier at a glance
   across the whole diamond. Bronze / silver / gold / diamond per
   UI/UX §4.5 palette.
2. **Position chip (top-left).** White-on-color using card-tier or
   team accent. 2 letters max (`C`, `1B`, `SS`, `OF`, `SP`).
3. **Team abbr (top-right).** `NYY` / `BOS` / etc. Monospace, 8pt.
4. **Status pill.** Hidden when `active`. For `il` / `dfa` / expired
   contract, overlays the photo with a dim scrim + pill.
5. **Contract pips.** 15-dot row, one per contract play. Filled =
   remaining, open = consumed. Instant read of "how many games does
   this card have left?" without opening Card Detail.
6. **Dual FP.** Season FP (small, muted) + career FP (bolder). The
   career number is the tier progression marker; the season number is
   the "how hot is this card right now" marker.
7. **Token slot indicator.** Small chip in the bottom-right corner
   when `token_application` exists for the card in the currently-
   viewed contest. Empty when not.
8. **Name.** Last name only. Two initials only if no photo AND the
   name is longer than 10 chars (then we fall back to first initial
   + last name, e.g. `J. Goldschmidt`).

### Acceptance

- [ ] At 96×134 with no photo, a user can tell at a glance: tier,
  position, team, how many contract plays remain, whether a token
  is applied, current season FP.
- [ ] A full legal lineup is readable from 18 inches away on a
  laptop screen without squinting.
- [ ] The card face uses the same component for diamond, bench, and
  vault-selection — same density everywhere.
- [ ] When `photoUrl` is non-null, the photo replaces the initials
  fallback without layout shift.
- [ ] Status pill appears and dims the photo for IL / DFA / expired.
- [ ] No layout regression on the existing Collection page (Medium
  and Large cards are unchanged; only Small is reworked).

### Bench drawer treatment (confirmed: same as diamond)

Same Rich Small card, same size. The bench drawer stays a horizontal
scroller with 96×134 cards. No Medium-in-bench variant.

### Dependencies

- `src/components/card/Card.tsx` — Small variant redesign. The
  component already takes a `size` prop; we extend the Small branch
  of the size-adaptation logic in UI/UX §4.11.1.
- `src/lib/contracts/cards.ts` — probably already has
  `contractPlays` + `contractMax`; extend the `CardViewModel` to
  include `seasonFp` (we currently pass `careerFp` only on some call
  sites).
- Nothing new in the DB — `season_fp` aggregate is already computed
  from `user_season_state` per user, and per-card season FP can be
  derived from the card's `career_fp_total` at season start vs.
  now (needs a small helper).

### Trade-offs

- **Density risk.** At 96×134 we're cramming eight pieces of info.
  If it reads as noise we'll pull back (e.g., drop dual-FP in favor
  of a single "hot vs total" indicator).
- **No hover-expand.** A user who wants truly deep stats still
  clicks into Card Detail. We're not going to leak Medium-card info
  onto the diamond.

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

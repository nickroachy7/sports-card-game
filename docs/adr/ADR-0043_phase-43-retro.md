# ADR-0043 — Phase 43 (In-place pack reveal) Retrospective

**Status:** Accepted · **Date:** 2026-04-24
**Phase:** Phase 43 (v1.28)
**Companion specs:** `draft-deck-polish-spec.md` §147–§153,
`docs/roadmap-phase-43.md`.

---

## Context

Through Phase 42, pack reveal lived in `PackOpenerModal` — a Radix
Dialog that overlaid the lineup with a semi-transparent backdrop.
Worked, but felt layered-on-top rather than "I'm opening a pack
right now." The multi-pack flow flattened all openings into one
synthetic `OpenPackResult` so a ×10 buy revealed 50 cards in one
continuous stack; each pack lost its own moment.

User ask: swap the modal for an in-place panel that replaces the
main content area; add a `Next pack` gate between packs so the ×5
or ×10 flow walks through packs one at a time.

## Decision

### §147 Reveal takes over main content

- `LineupShell` gains an optional `mainOverride: ReactNode` prop.
  When set, the left column renders that node in place of the
  `grid + tokens + cards` stack. Sidebar column stays visible
  unchanged.
- `LineupView` derives `mainOverride = revealActive ? <PackRevealPanel ... /> : null`
  and passes through. No routing change — reveal is a transient
  client-side state, URL stays `/lineup`.
- Cross-fade handled via `animate-in fade-in duration-150` on the
  override wrapper div (§148). Tailwind's animation utilities
  are enough; no extra motion dep.

### §148 PackRevealPanel component

- `src/components/pack/PackRevealPanel.tsx` — new. Owns the peel
  stack, flip animation, dupe resolution overlay, per-card
  quick-sell / vault buttons. Mostly a lift-and-shift of
  `PackOpenerModal`'s body minus the `<Dialog>` wrapper.
- Shared subcomponents reused: `PackCardFlip`, `PackDupePanel`,
  `StarPullBurst`. No change to those.
- Layout: `flex-col` full-height. Header at top (progress),
  peel/revealed rows in the middle (flex-1 with justify-center),
  footer at the bottom (next-pack / done button).

### §149 Sequential multi-pack flow

- `handleBatchOpened` in `LineupView` partitions
  `batch.openings[]` into per-pack `PerPackPayload` objects
  (each with its own `result`, `cards`, and scoped
  `existingByCardId` map). Previously we flattened into a single
  synthetic result; now we carry the structure through.
- `revealState: { packs, currentPackIndex, packType }` tracks
  which pack is active. `handleAdvancePack` bumps the index;
  `handleRevealDone` clears state + `router.refresh()`.
- Per-pack peel state (peelIndex, flipped[], resolution[],
  perCardAction[]) resets via `useEffect` keyed on `[cards,
  result]` — those flip identity exactly when the active pack
  changes, so the effect fires once per advance. Each pack
  starts from scratch; no carryover from previously-opened
  packs.

### §150 Progress header

- `RevealHeader` subcomponent. Two halves:
  - Left: `PACK N OF M · DAILY` label + subtitle
    ("Tap the top card", "Resolve the dupe", "Pack complete
    — next up?", etc.)
  - Right (multi-pack only): segmented progress bar. One pill per
    pack. States: `done` (solid gold), `active` (pulsing gold
    60%), `pending` (muted border color).
- Single-pack reveals degrade gracefully: header shows just
  "DAILY PACK" with no counter, no progress bar.

### §151 Exit gating — Done at end only

- Footer button renders as `Resolve dupe to continue` / `Reveal
  all cards` / `Next pack (N of M) →` / `Done · back to lineup`
  depending on pack completeness + final-pack status.
- No X, no Escape handler, no outside-click dismissal. The user
  commits to finishing the reveal once they click Buy.
- Navigating away mid-reveal works normally (cards persist in
  collection) but on return, reveal state is gone. Ephemeral.

### §153 Deletions

- `src/components/pack/PackOpenerModal.tsx` deleted.
- `src/app/(app)/lineup/lineup-view.tsx` — dropped the modal
  import + render site; `revealPayload` → `revealState` shape
  change.
- `src/app/(app)/shop/` (untracked, dead since Phase 36) —
  deleted. Was blocking typecheck by importing the now-gone
  `PackOpenerModal`. Had already been "killed" per Phase 36
  commit; this phase completed the removal.

## Consequences

**What got better:**

- Reveal feels like *the* moment — no backdrop, no dialog chrome.
  Main content area genuinely becomes the pack.
- Multi-pack buys get breathing room: each pack is its own
  ceremony with its own peel + flip + resolve arc, not a 50-card
  pile to slog through.
- Progress indicator gives users a "how much more" anchor on
  bulk buys. Previously the only signal was "stack of 50 cards,
  peeling one at a time."
- `PackRevealPanel` is a normal component — no modal primitive
  coupling, no `onOpenChange` handshake, no Dialog focus-trap
  quirks. Cleaner to reason about.
- `/shop` dead-route cleanup. Had been unused + untracked since
  Phase 36 killed it; now actually gone.

**What's still open:**

- No resumable reveal state. If the user closes the browser
  mid-peel, the cards are safe (persisted at buy time) but the
  peel ceremony is lost on return. Acceptable — reveal is a UX
  layer, not a data concern.
- No per-pack type variation in the header ("DAILY" vs "STANDARD"
  vs "PREMIUM" all show the same treatment). Could add a badge
  or color accent per type in a polish phase.
- No keyboard shortcuts. Tab + Enter works for the footer
  button, but arrow keys for peel don't.
- No "skip to end" for a 10-pack user who wants to bulk-resolve.
  Sequential only (spec §149 locks this).
- Reveal panel doesn't handle the sidebar's Packs tab being
  interacted with mid-reveal. If the user clicks Packs → Buy
  again during a reveal, the new batch would replace the
  current revealState. Should probably disable the Packs tab
  during an active reveal; follow-up.

## Tricky bits

- `useEffect` dep array: Biome flagged `currentPackIndex` as
  "extra" since the effect body reads `cards` + `result`. Both
  flip identity on index change (they're derived from
  `packs[currentPackIndex]`), so listing the index was
  redundant. Removed — still resets on every advance.
- The peel stack's `depth-layer-N` keys are index-based; the
  array is decorative and never reorders, so index-as-key is
  fine (noted inline).
- Partitioning logic in `handleBatchOpened` does a single
  `fetchRevealedCards(allIds)` for the whole batch, then builds
  per-pack `Map`s from the result. This is faster than one
  fetch per pack (fewer round-trips) and the Map lookups are
  O(1).
- `LineupShell.mainOverride` uses a nullish fallback to the
  original `grid + tokens + cards` render — means existing
  callers don't break if they don't pass the new prop.

## Alternatives considered

- **Keep the modal but make it full-screen.** Rejected — the
  backdrop + focus-trap + outside-click-to-close primitives in
  Radix Dialog aren't what we want for a non-dismissible
  reveal. Rewriting to work against the Dialog primitive felt
  like fighting it.
- **Carousel between packs.** Rejected — adds navigation
  affordance complexity (can you go back? what if you already
  quick-sold a card in pack 3?). Linear forward-only flow is
  cleaner, matches the spec's "each pack is a moment" framing.
- **Skip-all button for bulk buyers.** Deferred to a future
  polish phase. Sequential only for v1.28; if the 10-pack
  friction becomes real feedback we'll revisit with a choice
  at buy time.
- **Preserve `PackOpenerModal` as a fallback for shops /
  future surfaces.** Rejected — one reveal component means
  one place to update. Any future surface (shop, milestones
  reward, etc.) can mount `PackRevealPanel` directly.

## Links

- Commit: (forthcoming) `feat(pack): P43 in-place reveal + sequential multi-pack`
- Polish spec: §147, §148, §149, §150, §151, §152, §153
- Roadmap: `docs/roadmap-phase-43.md`
- Previous: ADR-0042 (Phase 42 sidebar redesign) — the FAB + buy
  modal retirement in Phase 42 made the Packs tab the sole buy
  entry point; this phase finishes the pack-flow overhaul by
  retiring the reveal modal too.

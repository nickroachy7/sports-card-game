# ADR-0011 — Phase 6 (Feel Pass v1.1) Retrospective

**Status:** Accepted · **Date:** 2026-04-21
**Phase:** Phase 6 (Polish — v1.1 feel pass)
**Companion specs:** `draft-deck-polish-spec.md`,
`docs/roadmap-phase-6.md`.

---

## Context

Phase 5 completed the seasonal / lifecycle plumbing; Phase 6's charge
was the first dedicated polish pass. The user locked two features via
a two-round interview (in-session) and we spec'd the rest:

1. **Physical card motion** — every drag / dissolve speaks the same
   iOS-snappy spring language (stiffness 400, damping 30) with a
   subtle 3° velocity tilt and bounce-back-with-shake on invalid drop.
2. **Full-anatomy Small card** — the 96×134 face now renders the same
   anatomy as Medium (position chip, team chip, status pill, stats
   footer with name / FP / contract / token badge) instead of the
   previous initials-only stripped layout.

Pack-opening reveal was pulled out of v1.1 scope — the user wanted a
full redesign of that flow rather than a motion refresh. Parked as a
standalone polish slice.

Estimate: 4–6 days. Shipped in five slices plus a ride-along fix.

## Decision

Do tight, single-purpose slices. Commit + deploy each one. Use
`/palette` as the public, auth-less smoke target for visual states
(card matrix, dissolve demo). Real-flow verification (lineup drag,
vault ceremony, quick-sell) runs on prod against the test account
after each deploy.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| P6.1 | `0245edbe` | Unhide Medium anatomy at Small size in `<Card>`. Three-size ternaries for padding / font / chip offsets. Vault ceremony `CardThumb` swapped to shared `<Card size="small">`. `/palette` card-state matrix. |
| P6.2 | `177014ac` | `CardDragLayer` + `drag-layer-state` — motion spring ghost, 3° tilt, bounce-back shake. Bench → slot drag gets the physics. |
| P6.2.1 | `54010cfb` | Optimistic slot fill via `useOptimistic` — dropped cards snap in instantly, no post-drop gap. |
| P6.3 | `5166f1ff` | `DissolveCard` wrapper + integration on quick-sell + vault ceremony step 4. `/palette` DissolveDemo. |
| P6.3 fix | `cdfec286` | Relax `contest_lineup_slot` + `token.applied_to_card_id` FKs to `ON DELETE SET NULL` (migration 0019) — quick-sell no longer 23503s when the card was ever in a lineup. |
| P6.3 fix | `386b9bcd` | Collection detail page redirects to `/collection` instead of 404-ing during the dissolve window. |
| P6.4 | `0d7f20a6` | Generalized `CardDragLayer` (moved to `src/components/card/`, `accepts` prop, domain-generic `resolveCard`). Vault ceremony drag-to-dropzone. |
| P6.5 | *(this)* | `useReducedMotion` sweep + ADR. |

All seven slices are live on `draft-deck.vercel.app`.

## What went well

1. **Spec-then-build is still the right tempo.** Two interview rounds
   → a locked spec → each slice landed without second-guessing the
   shape. The "sacrifice list" in polish spec §2 never had to be
   invoked — Small cards hit legible density without dropping pieces.
2. **`useOptimistic` on the lineup.** First user feedback after P6.2
   was "there's a pause before the card lands in the slot." One
   reducer + rebasing on `props.slots` fixed it — no server-side work
   needed, no manual optimistic bookkeeping.
3. **DO-block `RAISE 'TEST_OK'` smoke still pays rent.** Two more
   Phase 6 things were caught / verified this way (the FK relaxation,
   the quick-sell SQLSTATE reproduction).
4. **Generalizing the drag layer was one file move + a prop.** P6.4
   proved the P6.2 architecture was already domain-neutral under the
   lineup-namespace varnish. Vault selection was ~1 day of work
   because the motion seam + bounce-back + ghost logic were all
   already done.
5. **`/palette` as a public regression surface.** Every visual change
   to `<Card>` + the dissolve is viewable at
   `draft-deck.vercel.app/palette` without auth. Low-friction to
   share with anyone who wants to eyeball the system.

## What surprised us

1. **Same FK-bug class bit twice.** P4.4 relaxed `token_application.
   card_id` to `SET NULL`; I didn't sweep `contest_lineup_slot`'s four
   card-ref columns at the same time. Quick-sell against a card that
   had ever been in a lineup crashed with 23503. Migration 0019 swept
   them all at once — future card-delete paths are now universally
   safe. ADR lesson: when relaxing one FK to unblock a delete, do the
   full card-references sweep.
2. **Next.js RSC → CSC function props don't serialize.** The first
   `/palette` dissolve demo passed `makeCard={() => mockCard(...)}`
   and crashed at runtime (nice error message, at least). Fix was
   passing the card object directly instead of a factory. Noting so
   future palette demos default to "data in, effects out."
3. **The revalidate-during-dissolve 404 race.** Server action calls
   `revalidatePath("/collection")` → Next re-renders the current
   detail segment → card is gone → `notFound()` → 404 flashes before
   the dissolve's `router.push` fires. Swapped to `redirect()` which
   also improves UX for genuine "unknown card" URLs.
4. **Reduced-motion for a spring system is two axes.** Setting
   `duration: 0` is easy for keyframe-style animations (DissolveCard).
   For the always-on drag spring, you want it to still *follow the
   cursor* but without trailing lag or tilt — solved with a
   near-critical-damping spring (stiffness 10000, damping 200).

## What we deliberately simplified

1. **Slot → slot swap and slot → bench drag** deferred. The
   `update_lineup_slot` SQL fn rejects a "card already in another
   slot" assignment, so swap support needs a paired SQL fn. Users use
   the existing "remove" button for slot → bench. Flagged in the spec
   + roadmap and in the P6.2 commit message.
2. **Pack opening reveal** — intentionally out of v1.1 per the user's
   call ("needs its own full redesign, not a motion refresh"). Gets
   its own future mini-spec.
3. **E2E tests for drag-drop animations.** The roadmap (T6.5.2)
   listed Playwright scenarios for drag-settle + invalid-bounce +
   reduced-motion. Practically, Playwright's HTML5 drag-drop support
   is fragile and timing-sensitive; the visual surface is well-
   covered by `/palette` + a sharp-eyed user on prod. Deferred as a
   stretch goal; re-evaluate once real-user cohort exists.
4. **Velocity-based tilt math** intentionally simple. Linear
   coefficient clamped to ±3°. If we ever want a more theatrical
   tilt we can swap in a damped velocity smoother; today's feel
   tests as "subtle speed cue."

## What's ready for the next polish pass

- `CardDragLayer` is domain-generic — a future "drag card from
  Collection to trade partner" or similar surface gets the motion
  language for free.
- `DissolveCard` is equally generic — it's the dissolve pattern,
  wrap any card-shaped child.
- Three-size `<Card>` tuning is done; future size-specific tweaks
  stay in a single ternary per property.
- `/palette` is set up as the visual-regression target for component
  changes — adding new sections is a lean pattern (e.g., any future
  motion vocabulary gets its own client demo).

## Open items

1. **Pack-opening reveal redesign** — carousel + reveal flash + dupe
   stamp + star-pull celebration. Own mini-spec when we reach it.
2. **Slot ↔ slot / slot ↔ bench drag** — needs a `swap_lineup_slots`
   SQL fn.
3. **E2E for drag-drop** — revisit once user cohort / bug-rate
   motivates it.
4. **Tier foil motion** (silver shine, gold bloom, diamond shimmer)
   — still deferred per UI/UX §4.5.
5. **Onboarding flow / tutorial contest / empty + error state pass**
   — each its own future slice.

## Estimate vs reality

Estimate: 4–6 days. Shipped: seven commits in the session. Held.

## Consequences

- The app is noticeably more tactile. The drag-drop, dissolve, and
  ceremony flows stop feeling like "clicks on a spreadsheet" and
  start feeling like handling collectibles — user feedback after
  P6.2 was "feels great," after P6.3 was "perfect."
- Motion seams (`<CardDragLayer>`, `<DissolveCard>`) are now shared
  plumbing. Future polish slices extend them rather than reinvent.
- The card-delete cascade is finally uniform — no code path blocks
  on a card being referenced by slot / token / token_application.
- Three `/palette` sections (colors, tiers, card matrix, dissolve
  demo, typography) make `/palette` the de-facto visual-QA page.

## Related ADRs

- ADR-0008 — Phase 1 Retrospective.
- ADR-0009 — Phase 4 Retrospective (Vault + Milestones + Leaderboards).
- ADR-0010 — Phase 5 Retrospective (Seasonal crons + rank finalize).

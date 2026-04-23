# Draft Deck — Phase 21 Roadmap (Feel Pass v1.12.1 — Bench Legibility)

**Goal:** Bring the lineup slot's game-state line down to
the bench so users can make informed start-order decisions
at a glance.

**Estimated effort:** ~0.5 day.

**Prerequisites:**

- Phase 18's `<SlotGameState>` component + `SlotGameInfo` type.
- Phase 18's `slotGameByCardId` prop already exists on
  `LineupViewProps` and is computed by the lineup server page.
- Phase 19 ET-aware `scheduled_start` populated.
- Phase 20 live inning columns populating on webhook events.

---

## Milestones

| ID    | Milestone                                    | Target    | Outcome |
|-------|----------------------------------------------|-----------|---------|
| P21.1 | Thread `slotGameByCardId` to BenchDrawer/BenchCard | 0.1 day | Prop added; BenchCard receives `gameInfo` per card. |
| P21.2 | Off-day variant + BenchCard footer           | 0.2 day   | `<SlotGameState variant="bench">` adds the OFF branch; BenchCard renders the footer. |
| P21.3 | BenchDrawer priority-sort                    | 0.1 day   | `filtered` memo sort: pre → live → final → off; alpha within buckets. |
| P21.4 | Deploy + verify                              | 0.05 day  | `vercel --prod`. Smoke on the lineup page bench. |
| P21.5 | ADR-0026                                     | 0.05 day  | Standard retro. |

---

## P21.1 — Thread `slotGameByCardId`

### T21.1.1 BenchDrawer prop

- **What:** `src/components/lineup/BenchDrawer.tsx` gains
  a `slotGameByCardId: Record<string, SlotGameInfo>` prop.
  Already passed via `LineupViewProps` to `LineupView`;
  just forward it.
- **Acceptance:** BenchDrawer receives the map; type-safe.

### T21.1.2 BenchCard prop

- **What:** `src/components/lineup/BenchCard.tsx` gains an
  optional `gameInfo?: SlotGameInfo | null`. BenchDrawer
  passes `slotGameByCardId[card.id] ?? null` per render.
- **Acceptance:** Compiles clean.

### T21.1.3 LineupView pass-through

- **What:** `src/app/(app)/lineup/lineup-view.tsx` already
  threads `slotFills` etc. to `<BenchDrawer>`. Add
  `slotGameByCardId={props.slotGameByCardId}`.

---

## P21.2 — SlotGameState off-day + bench footer

### T21.2.1 SlotGameState off-day branch

- **What:** `src/components/lineup/SlotGameState.tsx` gets
  a new `variant="bench"` (or a new prop `showOffDay`).
  When `info === null` AND the variant is "bench", render
  a muted `OFF` span. Default behavior (no variant, or
  variant="footer") continues to render `null` when info
  is null.
- **Acceptance:**
  - `<SlotGameState info={null} variant="bench" />` →
    renders `OFF` muted.
  - `<SlotGameState info={null} />` → renders nothing
    (existing LineupSlot behavior preserved).

### T21.2.2 BenchCard renders footer

- **What:** After the existing card body in
  `BenchCard.tsx`, add:
  ```tsx
  <SlotGameState info={gameInfo} variant="bench" />
  ```
  Sits in the same vertical stack as the player-name /
  stats. Card grows ~14px vertically.
- **Acceptance:**
  - Pre/live/final/off variants render correctly on the
    bench.
  - Drag handle still works.
  - Click-to-open-detail unchanged.

---

## P21.3 — Priority sort

### T21.3.1 BenchDrawer sort comparator

- **What:** `src/components/lineup/BenchDrawer.tsx` sort
  becomes:
  ```ts
  function stateRank(info: SlotGameInfo | null): number {
    if (!info) return 3; // off-day
    if (info.status === "scheduled") return 0;
    if (info.status === "live") return 1;
    if (info.status === "final") return 2;
    return 3; // postponed/suspended/canceled → treat as off
  }

  filtered.sort((a, b) => {
    const rA = stateRank(gameInfoByCard[a.id] ?? null);
    const rB = stateRank(gameInfoByCard[b.id] ?? null);
    if (rA !== rB) return rA - rB;
    // Within "scheduled" (pre-game), earliest start first.
    if (rA === 0) {
      const tA = gameInfoByCard[a.id]?.scheduledStart ?? null;
      const tB = gameInfoByCard[b.id]?.scheduledStart ?? null;
      if (tA && tB && tA !== tB) return tA < tB ? -1 : 1;
    }
    // Same-bucket fallback: alpha by name.
    return a.playerName.localeCompare(b.playerName);
  });
  ```
- **Acceptance:**
  - Pre-game cards cluster left, by earliest start.
  - Live next, Final after, Off-day last.
  - Alpha within each bucket.
  - Existing filter (Hitters / Pitchers / search) runs
    first; sort runs on the filtered set.

---

## P21.4 — Deploy + verify

### T21.4.1 `vercel --prod --yes`

### T21.4.2 Smoke

- Verify bench card footer renders for each state class
  currently present in today's slate.
- Verify sort puts pre-game (CHC 7:40p) at the front
  (actually — CHC just went live, so that's now in the
  "live" bucket).

---

## P21.5 — ADR-0026

Standard template.

---

## Dependencies

```
P21.1 (thread) ──► P21.2 (render) ──► P21.3 (sort)
                                           │
                                           ▼
                                      P21.4 (deploy)
                                           │
                                           ▼
                                      P21.5 (ADR)
```

---

## What's NOT in Phase 21

Per spec §61:

- Standard parked items.
- Bench filter chips for game state.
- Collection page scheduling info.
- Full doubleheader.
- Outs / baserunners.
- contest_status enum cleanup.

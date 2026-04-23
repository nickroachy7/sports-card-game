# Draft Deck — Phase 24 Roadmap (Feel Pass v1.15 — Fluid lineup layout)

**Goal:** Make the lineup grid fill its pane. Scale cards up
on wide screens (capped at ~200px); scale cards down on
narrow/short screens so all 10 always fit without scroll.

**Estimated effort:** ~0.25 day. One measurement hook, one
wrapper, two small CSS adjustments.

**Prerequisites:**

- Phase 23's `LineupGrid` three-role-row structure (§68).
- Phase 23's `LineupShell` post-header-drop shape (§72).

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P24.1 | LineupGrid: measure + emit CSS vars        | 0.10 day | ResizeObserver on grid root; `--card-w-px` + `--card-scale` set on each resize. |
| P24.2 | LineupSlot: scaling shell                  | 0.10 day | Both filled + empty variants wrap content in a two-div shell that scales via CSS vars. |
| P24.3 | LineupShell: stretch + overflow-hidden     | 0.02 day | Grid fills its parent; no ancestor scroll. |
| P24.4 | Typecheck + lint + local build + deploy    | 0.03 day | Verify rendering at 3 viewport sizes; commit + ADR-0029. |

---

## P24.1 — Measurement + CSS vars

### T24.1.1 Layout constants

Define a single `const LAYOUT = { ... }` block at module top:
```ts
const LAYOUT = {
  GRID_PADDING_Y: 48, // py-6 top + bottom
  GRID_PADDING_X: 48, // px-6 left + right
  ROW_GAP_Y: 16, // gap-4 between rows
  ROW_LABEL_H: 22, // text-[10px] font + gap-1 between label and cards
  SLOT_CHROME_H: 70, // slot position label + pill + remove button + gaps
  CARD_GAP_X: 16, // gap-4 between cards in a row
  CARD_BASE_W: 96,
  CARD_ASPECT: 134 / 96, // h/w
  CARD_MAX_W: 200,
  CARD_MIN_W: 60,
};
```

### T24.1.2 Compute helper

```ts
function computeCardWidth(paneW: number, paneH: number): number {
  const usableH = paneH
    - LAYOUT.GRID_PADDING_Y
    - 2 * LAYOUT.ROW_GAP_Y
    - 3 * LAYOUT.ROW_LABEL_H
    - 3 * LAYOUT.SLOT_CHROME_H;
  const rowCardH = usableH / 3;
  const widthFromHeight = rowCardH / LAYOUT.CARD_ASPECT;
  const widthFromWidth =
    (paneW - LAYOUT.GRID_PADDING_X - 4 * LAYOUT.CARD_GAP_X) / 5;
  return Math.max(
    LAYOUT.CARD_MIN_W,
    Math.min(LAYOUT.CARD_MAX_W, widthFromHeight, widthFromWidth),
  );
}
```

### T24.1.3 ResizeObserver hook

In `LineupGrid.tsx`:
```tsx
const rootRef = useRef<HTMLDivElement>(null);
const [cardW, setCardW] = useState(LAYOUT.CARD_BASE_W);

useEffect(() => {
  const el = rootRef.current;
  if (!el) return;
  const recompute = () => {
    const rect = el.getBoundingClientRect();
    setCardW(computeCardWidth(rect.width, rect.height));
  };
  recompute();
  const ro = new ResizeObserver(recompute);
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

### T24.1.4 Apply CSS vars

Set inline style on the grid root:
```tsx
<div
  ref={rootRef}
  style={{
    "--card-w-px": `${cardW}px`,
    "--card-scale": cardW / LAYOUT.CARD_BASE_W,
  } as React.CSSProperties}
  className="flex h-full w-full flex-col gap-4 p-6"
>
```

All descendants read those vars.

---

## P24.2 — Scaling shell on LineupSlot

### T24.2.1 Shell primitives

Replace both the filled-slot `<Card>` wrapper and the empty-
slot dashed box with a shared scaling shell:

```tsx
// Inside the slot's column, wrap the card visual (or empty box) in:
<div
  className="relative"
  style={{
    width: "var(--card-w-px, 96px)",
    height: "calc(var(--card-w-px, 96px) * 134 / 96)",
  }}
>
  <div
    className="absolute left-0 top-0 origin-top-left"
    style={{
      width: "96px",
      height: "134px",
      transform: "scale(var(--card-scale, 1))",
    }}
  >
    {/* either <Card size="small" .../> + badges/glow  OR  the dashed empty UI */}
  </div>
</div>
```

### T24.2.2 Empty-slot drop target

The empty-slot's drop-target ref (`cardDropRef`) needs to
attach to the outer (non-scaled) shell so it's the correct
hit-box for drag events (scaled children still receive
events, but the outer layout-box is what the parent flex
layout cares about). Keep the `section` element as the drop
target; put the scaling shell inside.

### T24.2.3 Filled-slot preserved chrome

Position label (SP1/C/1B/…), SlotGameState pill, and remove
button stay outside the scaling shell — they render at their
natural text sizes in the flex-column. Only the card visual
(+ applied-token badge + lock glyph overlaying the card)
lives inside the scaling shell.

---

## P24.3 — LineupShell stretch

### T24.3.1 Grid pane flex behavior

`src/components/lineup/LineupShell.tsx`:
```tsx
- <div className="flex flex-1 items-start justify-center overflow-auto">{grid}</div>
+ <div className="flex min-h-0 flex-1 overflow-hidden">{grid}</div>
```

Drop `items-start + justify-center + overflow-auto`;
replace with `min-h-0 + overflow-hidden`. The grid's
`h-full w-full` fills the parent; its own sizing math
handles overflow by shrinking cards.

---

## P24.4 — Verify

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm build` clean.
- Visual check at ~1920×900, ~1280×800, ~1024×720 — all 10
  cards visible, card widths approximate the math, no
  internal scroll.
- Drag-and-drop works at scale (drag from bench to slot,
  swap two slots).
- Bench + token carousels unaffected.
- Sidebar + contest header card unaffected.

---

## Dependencies

```
P24.1 (measure) ──► P24.2 (shell reads vars)
P24.3 (shell stretch) ──► independent but required for math to fit
                              │
                              ▼
                        P24.4 (verify + deploy + ADR-0029)
```

All three slices land in one commit.

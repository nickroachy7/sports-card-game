# Draft Deck — Phase 25 Roadmap (Feel Pass v1.15.1 — Match bench size)

**Goal:** Pin lineup cards at the same fixed size as bench
cards (96×134). Revert Phase 24's fit-to-pane scaling.
Align row labels flush-left with the infield row's left
edge so they read as a structured roster.

**Estimated effort:** ~0.15 day. Pure revert + minor layout
tweak.

**Prerequisites:**

- Phase 23's three-role-row structure (§68).
- Phase 24's scaling implementation (§74) — Phase 25
  reverts this.

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P25.1 | Revert LineupSlot scaling shell            | 0.03 day | Filled + empty slots back to fixed 96×134. |
| P25.2 | Rewrite LineupGrid: shared container       | 0.08 day | 544px shared-width container; labels flush-left; rows center-justify within. |
| P25.3 | Revert LineupShell overflow                | 0.02 day | Drop `overflow-hidden` on grid pane; default overflow. |
| P25.4 | Verify + deploy + ADR-0030                 | 0.02 day | Typecheck + lint + build + prod deploy + retro. |

---

## P25.1 — Revert LineupSlot

### T25.1.1 Drop scaling shell

Remove from `LineupSlot.tsx`:
- `shellStyle` constant
- `scaledInnerStyle` constant
- Scaling-wrapper `<div>` pair around filled content
- Scaling-wrapper `<div>` pair around empty dashed box

Restore:
- Empty slot: `ringClass` with `h-[134px] w-[96px]`
  dimensions on the `<section>`.
- Filled slot: `<div>` wrapping `<Card size="small" />`
  + badges/glow at their natural positioning (no transform).

### T25.1.2 Verify drag/drop refs

Refs (`cardDropRef`, `tokenDropRef`, `slotDragRef`) reattach
to the natural-sized containers. Same as pre-P24.

---

## P25.2 — LineupGrid rewrite

### T25.2.1 Drop fluid machinery

Remove from `LineupGrid.tsx`:
- `useRef` / `useEffect` / `useState` for `cardW`
- `ResizeObserver` subscription
- `LAYOUT` constants block
- `computeCardWidth` helper
- `styleVars` object + inline `style={styleVars}` on root
- `"use client"` directive can stay (still a client tree via
  LineupSlot's react-dnd) but no hook usage required here —
  becomes a presentational component.

### T25.2.2 Shared-width container

The inner layout:
```tsx
<div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
  <div className="flex flex-col gap-5" style={{ width: 544 }}>
    <RoleRow label="Rotation" positions={["SP1", "SP2"]} ... />
    <RoleRow label="Infield"  positions={["C","1B","2B","3B","SS"]} ... />
    <RoleRow label="Outfield" positions={["OF1","OF2","OF3"]} ... />
  </div>
</div>
```

`544` = infield's natural width (5 × 96 + 4 × 16). Inline
style because Tailwind arbitrary-value classes work but
the number's derivation is worth making obvious next to
the RoleRow that anchors it.

### T25.2.3 RoleRow with flush-left label

```tsx
<div className="flex flex-col gap-2">
  <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
    {label}
  </h3>
  <div className="flex justify-center gap-4">
    {positions.map((pos) => <LineupSlot ... />)}
  </div>
</div>
```

Label is a block element → fills container width → its
text flushes to the left edge by default. Cards inside the
inner flex div center-justify within the same 544px width.
For Infield (5 cards × 96 + 4 × 16 = 544), cards fill the
row so justify-center is a no-op. For Rotation and
Outfield, cards sit centered with natural gaps either
side.

---

## P25.3 — LineupShell revert

### T25.3.1 Drop overflow-hidden

`src/components/lineup/LineupShell.tsx`:
```tsx
- <div className="flex min-h-0 flex-1 overflow-hidden">{grid}</div>
+ <div className="flex min-h-0 flex-1">{grid}</div>
```

Grid content at fixed 96×134 × 3 rows fits comfortably in
laptop-class pane heights; no overflow container needed.
On extreme-short viewports browser defaults apply.

---

## P25.4 — Verify + deploy + ADR

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm build` clean.
- Visual check: at 1440×900 and 1280×800 viewports,
  lineup cards match bench cards; labels left-align;
  rows center horizontally; no internal grid scroll.
- Drag-from-bench-to-slot: zero size transition.
- `vercel --prod --yes` deploy.
- ADR-0030 retro.

---

## Dependencies

```
P25.1 (LineupSlot revert) ──► P25.3 (shell revert)
P25.2 (LineupGrid rewrite) ──┘
                              │
                              ▼
                         P25.4 (verify + deploy + ADR)
```

One commit covers P25.1 + P25.2 + P25.3 since they reshape
the same lineup surface. Separate commit for the ADR.

# Draft Deck — Phase 36 Roadmap (v1.21 — Cards header + /shop kill + pack reveal redesign)

**Goal:** Three coordinated changes to the lineup page + pack flow.

1. Compact the Cards/Tokens section header into one row.
2. Delete `/shop`; replace with a floating action button on
   `/lineup` that opens a buy-packs modal.
3. Redesign the pack reveal: stacked deck → tap-to-peel →
   revealed row with per-card Quick-sell / Add-to-vault
   actions + Done button.

**Estimated effort:** ~2 days.

**Prerequisites:**

- Phase 35 `SelectionPanel` + sidebar-swap pattern — the FAB
  + modal play in the same visual language.
- Phase 35 `quickSellCards` + `vaultCardsMidseason` bulk
  actions — per-card reveal actions reuse the single-card
  variants.
- Existing `PackCardFlip` + `StarPullBurst` — carried over
  into the new reveal layout unchanged.

---

## Milestones

| ID    | Milestone                                          | Target    | Outcome |
|-------|----------------------------------------------------|-----------|---------|
| P36.1 | Cards header single-row compaction                 | 0.30 day  | Count + position + tier dropdown + state dropdown + search + Select in one row. |
| P36.2 | Shadcn popover primitive (if needed)               | 0.10 day  | `src/components/ui/popover.tsx` wrapper. |
| P36.3 | `BuyPacksFab` + `BuyPacksModal`                    | 0.50 day  | FAB bottom-right, modal with Daily + Standard ×1/×5/×10. |
| P36.4 | `openPacksBatch` server action                     | 0.15 day  | Batch wrapper around `open_pack` SQL fn. |
| P36.5 | Pack reveal redesign (stack → peel → row)          | 0.70 day  | `PackRevealStack` + `PackRevealRow`, per-card actions, Done button. |
| P36.6 | Kill `/shop` page + nav + header link              | 0.10 day  | Three files deleted, two updated. |
| P36.7 | Verify / lint / build / deploy                     | 0.10 day  | Green checks, prod deploy. |
| P36.8 | ADR-0036 retro                                     | 0.05 day  | Standard retrospective. |

---

## P36.1 — Cards header single-row compaction

### T36.1.1 Extract tier/state chips into a FilterPopover

`CardsPanel.tsx` currently renders `TierChip` + `GameStateChip` inline in two dedicated rows. Refactor:

- Keep the chip components (they're good for the popover content).
- Add a new `FilterPopover` helper:

```tsx
function FilterPopover({
  label,
  currentLabel,
  count,
  children,
}: {
  label: string;            // "Tier"
  currentLabel: string | null; // null when "All"; else selected label
  count: number;
  children: ReactNode;      // chip list
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="...pill styling...">
          <span>{label}{currentLabel ? `: ${currentLabel}` : ""}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>{children}</PopoverContent>
    </Popover>
  );
}
```

### T36.1.2 Condense header markup

```tsx
<header className="flex flex-wrap items-center gap-3">
  <span>CARDS {availableCount}·{assignedCardIds.size}</span>
  <FilterButton label="All" ... />
  <FilterButton label="Hitters" ... />
  <FilterButton label="Pitchers" ... />
  <FilterPopover label="Tier" ...>{tier chips}</FilterPopover>
  <FilterPopover label="State" ...>{state chips}</FilterPopover>
  <Input search />
  {selectToggle}
</header>
```

Drops two dedicated chip rows.

**Acceptance:**

- At viewport ≥ 1100px: everything fits on one row.
- Selected tier/state shows inline on the pill (e.g. `Tier: Gold`).
- Counts on each pill match the filtered-count logic already in `counts`.
- Clicking the pill opens a popover with the existing chip set.

---

## P36.2 — Shadcn popover primitive

Check if `@radix-ui/react-popover` is installed. If not:

```
pnpm add @radix-ui/react-popover
```

Add `src/components/ui/popover.tsx` with the standard shadcn wrapper (Popover, PopoverTrigger, PopoverContent). Copy from the shadcn docs; apply the project's neutral outline styling.

Skip this milestone if the dep + component already exist.

---

## P36.3 — BuyPacksFab + BuyPacksModal

### T36.3.1 `BuyPacksFab.tsx`

```tsx
export function BuyPacksFab({
  coins,
  dailyReady,
  disabled,
  onClick,
}: {
  coins: number;
  dailyReady: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "fixed bottom-5 right-5 z-30 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform",
        "bg-[var(--tier-gold)] text-[var(--bg)] hover:scale-105",
        dailyReady && "animate-pulse",
      )}
      aria-label="Buy packs"
    >
      <Package className="size-6" />
    </button>
  );
}
```

Hidden while pack reveal is open — easy via `disabled` + CSS.

### T36.3.2 `BuyPacksModal.tsx`

Uses `Dialog` primitive. Layout:

- Header: coin balance + close.
- Daily section: when `dailyReady` → `Claim daily pack`
  button (free). Else shows `Ready in X h Y m` countdown
  text (reuse `isDailyPackReady` logic).
- Standard section: three quantity pills (×1, ×5, ×10);
  selection updates the confirm button's label with live
  total.
- Confirm button: `Buy N pack(s) (C coins)`. Disabled
  when `coins < total`; subtitle `Need M more coins` when
  short.
- `onOpened(cardIds: string[])` callback fires after
  `openPacksBatch` returns success — LineupView stores
  the card IDs to feed the reveal overlay.

Pricing helper derives from economy config; spec already
pulls it server-side for shop. Push it to the client via a
prop (`packPrices: { daily: 0, standard: 100 }` etc.).

### T36.3.3 LineupView wiring

- New state: `buyModalOpen: boolean`, `revealQueue: string[] | null`.
- FAB click → `setBuyModalOpen(true)`.
- Modal `onOpened(cardIds)` → `setRevealQueue(cardIds); setBuyModalOpen(false)`.
- `revealQueue` drives the PackOpenerModal render (§P36.5).
- Pass `dailyPackReady` + `packPrices` through `LineupViewProps`.

### T36.3.4 Layout / Page plumbing

`src/app/(app)/layout.tsx` already computes `dailyPackReady` for the header. Plumb it to `LineupPage` → `LineupView` via props. Same for `packPrices` + coin balance.

**Acceptance:**

- FAB renders in bottom-right of /lineup, not on other pages.
- Clicking it opens the modal; modal shows correct daily + standard options.
- Clicking `Buy 5 packs` charges 5× standard cost, fires batch action, closes modal, triggers reveal.

---

## P36.4 — `openPacksBatch` server action

### T36.4.1 Implementation

In `src/app/actions/packs.ts`:

```ts
async function openPacksBatchImpl(input: {
  packType: "daily" | "standard";
  quantity: 1 | 5 | 10;
}): Promise<ActionResult<OpenPacksBatchResult>> {
  // zod validate (daily must be qty 1)
  // session check
  // pre-flight coin balance check
  // loop open_pack SQL fn; aggregate results + balance
  // revalidatePath("/lineup", "layout")
  // return aggregated payload
}

export const openPacksBatch = wrapAction(openPacksBatchImpl, { name: "openPacksBatch" });
```

Use the existing `open_pack` single-call path; do NOT add new SQL.

### T36.4.2 Daily quantity guard

When `packType === "daily"`, force `quantity` to 1. Reject
any other quantity with a `VALIDATION` error.

**Acceptance:**

- `openPacksBatch({ packType: "standard", quantity: 5 })` opens 5 packs, returns aggregated card IDs, handles partial failures gracefully.
- `openPacksBatch({ packType: "daily", quantity: 5 })` returns a validation error immediately.

---

## P36.5 — Pack reveal redesign

### T36.5.1 Extract `PackRevealStack`

```tsx
// src/components/pack/PackRevealStack.tsx
function PackRevealStack({
  count,
  onPeel,
}: {
  count: number;
  onPeel: () => void;
}) { ... }
```

Renders `count` `PackCardFlip` (back-facing) components
absolutely positioned in a stack. Each offset by `(i * 2)px`
down + `(i * 1)px` right for depth cue. Only the top card
has a click handler.

### T36.5.2 Extract `PackRevealRow`

```tsx
// src/components/pack/PackRevealRow.tsx
function PackRevealRow({
  slots,
  onAction,
  actionsEnabled,
}: {
  slots: Array<{
    card: RevealedCard | null;   // null = not revealed yet
    action: "quickSold" | "vaulted" | null; // post-action state
  }>;
  onAction: (index: number, kind: "quickSell" | "vault") => Promise<void>;
  actionsEnabled: boolean;
}) { ... }
```

CSS grid with `count` columns. Each slot renders:
- If `card === null`: invisible placeholder (spacer).
- Else: the revealed `Card` at medium size + action buttons below.

### T36.5.3 Rewrite `PackOpenerModal`

Replace the current carousel with a state machine:

```ts
type Stage =
  | { kind: "stack"; remaining: string[]; revealed: RevealedCard[] }
  | { kind: "dupeResolve"; cardId: string; /* ... */ }
  | { kind: "done" };
```

Render tree:
```tsx
<Dialog>
  <DialogContent>
    <PackRevealStack count={remaining.length} onPeel={peelNext} />
    <PackRevealRow slots={slots} onAction={...} actionsEnabled={stage === "done"} />
    <Button disabled={stage !== "done"} onClick={close}>Done</Button>
  </DialogContent>
</Dialog>
```

Peel handler:
1. Pop the top `cardId` from `remaining`.
2. Fetch the `RevealedCard` via `fetchRevealedCards` (already in place; can be prefetched in parallel before reveal starts).
3. Animate flip + slide via Framer Motion: `initial = {stack position}`, `animate = {row position}` with `rotateY 180`.
4. On animation complete, fire `StarPullBurst` for star/starter tiers.
5. Push to `revealed`; advance.

Dupe handling: after a card reveals, check `cardResults[i].isDupe`. If true, enter `dupeResolve` stage; user picks keep-or-sell via inline `PackDupePanel` (compact). Resolution advances.

### T36.5.4 Per-card actions

When `stage === "done"` (stack empty and all dupes resolved):
- Quick-sell button under each card fires the single-card `quickSellCard` action; on success the card dissolves / fades in place.
- Add-to-vault button fires `vaultCardMidseason`; on success the card shows a vaulted badge.
- Each slot's local state (`"quickSold" | "vaulted" | null`) persists; user can still click Done at any point.

### T36.5.5 Done → refresh + close

- Done button: closes the modal, calls `router.refresh()` so /lineup picks up the new cards + coin balance.
- Cards that were quick-sold or vaulted are naturally absent from the refreshed `cards` prop.

**Acceptance:**

- Buying 5 packs reveals 25 cards (5 × 5) in a single modal session.
- Deck shrinks as cards are peeled; row fills out progressively.
- Star/Starter tier celebrations still fire on their respective tier reveals.
- Dupe resolutions still work (inline, per-card).
- Quick-sell + vault buttons work per-card post-reveal.
- Done button enabled only when the stack is empty + all dupes resolved.

---

## P36.6 — Kill `/shop` page + nav + header

### T36.6.1 Delete files

```
git rm -r src/app/(app)/shop
```

### T36.6.2 Nav sidebar

`src/components/layout/sidebar.tsx`: remove the `/shop` nav item.

### T36.6.3 Header

`src/components/layout/header.tsx`:
- Remove the `/shop` Link + Package icon.
- Remove `dailyPackReady` prop (migrated to LineupView).
- Keep coin balance display.

### T36.6.4 Layout prop plumbing

`src/app/(app)/layout.tsx`: stop passing `dailyPackReady` to the header. Drop the import if unused.

**Acceptance:**

- `/shop` is 404 / 404-handler.
- Nav sidebar has no shop link.
- Header has no shop icon.
- Buying packs still works via the FAB.

---

## P36.7 — Verify / lint / build / deploy

Standard:

```
pnpm format && pnpm typecheck && pnpm lint && pnpm build
```

Deploy to prod. Smoke test the /lineup page: FAB renders,
modal opens, pack reveal completes.

---

## P36.8 — ADR-0036 retro

Standard retrospective covering §108–§111.

# Draft Deck — Phase 35 Roadmap (v1.20 — Pre-live sidebar + multi-select + scrollbar + detail cleanup)

**Goal:** Four coordinated cleanups to the lineup page.

1. Bring the pre-submit sidebar to structural parity with
   post-submit (three-block layout: headline / roster /
   action).
2. Add multi-select to the cards grid with bulk Quick-sell +
   Add-to-vault actions in the sidebar.
3. Hide scrollbars entirely on the lineup page (wheel/
   trackpad still scrolls).
4. De-duplicate card detail buttons; style Extend as a real
   button; collapse vault explainer into a popover.

**Estimated effort:** ~1.5 days.

**Prerequisites:**

- Phase 34 three-block sidebar layout (ScoreHeadline /
  BoxScore / EventFeed) — P35.1 mirrors this into the
  building state.
- Phase 33 independent scroll containers + `[data-scroll]`
  attributes — P35.3 reuses the hooks.
- Phase 32 CardsPanel — P35.2 layers select mode on top.

---

## Milestones

| ID    | Milestone                                           | Target    | Outcome |
|-------|-----------------------------------------------------|-----------|---------|
| P35.1 | Pre-live sidebar three-block layout                 | 0.30 day  | `DraftingHeadline` + `RosterSection` + Submit block. |
| P35.2 | Multi-select on cards grid + SelectionPanel sidebar | 0.60 day  | Select chip, checkmark+border, count/list/actions sidebar, bulk server actions. |
| P35.3 | Invisible scrollbars scoped to lineup               | 0.10 day  | `data-scroll-surface="lineup"` CSS scope; hook disabled. |
| P35.4 | Card detail cleanup                                 | 0.25 day  | Kill Lineup Actions block; Extend as button; vault `(?)` popover. |
| P35.5 | Verify / lint / build / deploy                      | 0.10 day  | Green checks, prod deploy. |
| P35.6 | ADR-0035 retro                                      | 0.05 day  | Standard retrospective. |

---

## P35.1 — Pre-live sidebar three-block layout

### T35.1.1 `DraftingHeadline` component

Add alongside the existing `ScoreHeadline` in
`src/components/layout/AppSidebar.tsx`:

```tsx
function DraftingHeadline({ slotsFilled, projectedFp }: {
  slotsFilled: number;
  projectedFp: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--text-3)]">
        <span>Drafting</span>
        <span>{slotsFilled} / 10 slots filled</span>
      </div>
      <div className="font-sans text-3xl font-bold tabular-nums text-[var(--text)]">
        {projectedFp === null ? slotsFilled : projectedFp.toFixed(1)}
      </div>
    </div>
  );
}
```

`projectedFp` starts as `null` (not wired yet); component
falls back to rendering slots-filled as the big number.
Caller computes whichever is available.

### T35.1.2 `RosterSection` component

```tsx
function RosterSection({ slotFills }: { slotFills: Record<LineupPosition, SlotFill> }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-wider text-[var(--text-3)]">Roster</h3>
      <ul data-scroll="lineup-sidebar-roster" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {LINEUP_POSITIONS.map((pos) => {
          const card = slotFills[pos]?.card ?? null;
          return <RosterRow key={pos} position={pos} card={card} />;
        })}
      </ul>
    </section>
  );
}
```

`RosterRow` renders either a filled row (position chip ·
name · tier badge · plays) or an empty placeholder row
(`Drag a {formatPosition(position)}` in `text-3`).

### T35.1.3 Rewire building-state sidebar

In the same file, swap building state's render tree from
the current `Readiness / Projected / Auto-sub / Submit`
four-chunk layout to:

```tsx
<DraftingHeadline slotsFilled={...} projectedFp={null} />
<RosterSection slotFills={slotFills} />
<SubmitSection mode={...} onModeChange={...} canSubmit={...} onSubmit={...} />
```

Where `SubmitSection` is the existing Auto-sub + Submit
chunk, extracted into its own component.

**Acceptance:**

- `entry.status === 'building'` renders: Drafting headline
  on top · Roster middle · Submit at bottom.
- Dragging a card into a slot updates the Roster row
  instantly (same optimistic update that drives the slot
  itself).
- `entry.status !== 'building'` layout unchanged from P34.

---

## P35.2 — Multi-select on cards grid

### T35.2.1 Select chip + select-mode state

In LineupView, add:
```ts
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Add a `Select` / `Done` toggle chip in the CardsPanel
filter row (owned by CardsPanel; `selectMode` + setter passed
as props).

Entering select mode clears the `?card` URL param (so the
detail panel doesn't stay open on top of the selection
panel). Exiting select mode clears selection.

### T35.2.2 BenchCard click-to-select

`BenchCard` already takes a click handler for opening card
detail. Add branching:

```tsx
onClick={() => {
  if (selectMode) toggleSelected(card.id);
  else onOpenDetail(card.id);
}}
```

Add visual states:
- `isSelected === true` → checkmark badge in top-right
  (`<Check />` in a `bg-[var(--tier-gold)] rounded-full p-0.5`)
  and a 2px border (`ring-2 ring-[var(--tier-gold)]`).
- `selectMode && !isSelected` → slightly desaturated
  (opacity 0.85) so selected cards pop.

Drag is disabled (`useDrag`'s `canDrag`) when `selectMode`.

### T35.2.3 SelectionPanel component

New file `src/components/lineup/SelectionPanel.tsx`:

```tsx
export function SelectionPanel({
  selectedCards,
  onQuickSell,
  onAddToVault,
  onClear,
  quickSellTotal,
  lineupCount,
  vaultCount,
}: SelectionPanelProps) {
  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)]">Selection</div>
        <div className="font-sans text-2xl font-bold tabular-nums text-[var(--text)]">{selectedCards.length} selected</div>
        <div className="text-xs text-[var(--text-2)]">
          {quickSellTotal} coins quick-sell
          {lineupCount > 0 && ` · ${lineupCount} in lineup`}
        </div>
      </header>
      <ul data-scroll="selection-list" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {selectedCards.map((c) => <SelectionRow key={c.id} card={c} />)}
      </ul>
      <footer className="flex flex-col gap-2">
        <Button onClick={onQuickSell} disabled={!selectedCards.length}>
          Quick-sell ({quickSellTotal} coins)
        </Button>
        <Button variant="outline" onClick={onAddToVault} disabled={!selectedCards.length}>
          Add to vault ({selectedCards.length})
        </Button>
        <Button variant="ghost" onClick={onClear}>Clear</Button>
      </footer>
    </aside>
  );
}
```

### T35.2.4 Sidebar swap wiring in LineupView

Sidebar render priority:
1. `selectMode` → `<SelectionPanel />`.
2. `detailCardId` → `<DetailSidebar />` (Phase 34 wrapper).
3. otherwise → `<AppSidebar />`.

Entering `selectMode` clears `?card`; entering the detail
route exits `selectMode` (visits to the card detail from a
SelectionRow link go through the standard detail flow and
drop out of select mode — small detail, fine for v1).

### T35.2.5 Bulk server actions

`src/app/actions/cards.ts`:

```ts
export async function quickSellCards(cardIds: string[]): Promise<ActionResult<{coinsEarned: number}>> {
  // zod validate (1..100 ids), session check, rate-limit,
  // Sentry wrap. Drizzle: SELECT public.quick_sell_cards_batch(${userId}, ${ids}::uuid[]).
  // SQL fn loops the existing per-card quick_sell fn inside a
  // transaction; if any fails, the whole batch rolls back.
}
```

Similar `addCardsToVault(cardIds)` in
`src/app/actions/vault.ts`. The SQL batch functions go in
a new migration.

### T35.2.6 Confirm dialogs

Use the existing `<AlertDialog>` primitive. Quick-sell
dialog body includes the slot-clear warning when
`lineupCount > 0`. Vault dialog warns when vault would
overflow.

**Acceptance:**

- Click Select chip → select mode on, Done chip appears.
- Click cards to add/remove; checkmark + border visible.
- Sidebar shows count + list + action buttons.
- Quick-sell confirms, fires batch action, refreshes grid,
  clears selection, exits mode.
- Vault add respects cap; overflows error with message.
- Esc exits select mode.

---

## P35.3 — Invisible scrollbars

### T35.3.1 Scope attribute

In `src/components/lineup/LineupShell.tsx`, add
`data-scroll-surface="lineup"` to the shell root
(`<div className="...">` that wraps main + aside).

### T35.3.2 CSS override

In `src/app/globals.css`, after the P34 rules, add:

```css
[data-scroll-surface="lineup"] [data-scroll] {
  scrollbar-width: none;
  scrollbar-color: transparent transparent;
}
[data-scroll-surface="lineup"] [data-scroll]::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
```

### T35.3.3 Disable the fade hook for lineup

In LineupView, remove the `useScrollFade()` call. Leave
the hook file for other surfaces.

**Acceptance:**

- No visible scrollbar on either column at any time.
- Wheel, trackpad, keyboard arrows still scroll both
  columns.
- Other pages (if any) that still tag `[data-scroll]`
  keep the P34 auto-fade.

---

## P35.4 — Card detail cleanup

### T35.4.1 Kill Lineup Actions block

In `src/components/card/CardDetailPanel.tsx`, delete the
entire `LINEUP ACTIONS` section and its duplicate Add-to-
vault button.

### T35.4.2 Extend as button

Style the Extend Contract row using the same `<Button
variant="outline">` pattern as Quick-sell + Add-to-vault.
Order top-to-bottom: Extend Contract → Quick-sell → Add
to vault.

### T35.4.3 Vault explainer popover

Replace the inline paragraph with a `(?)` icon button
inline with the Add-to-vault button label. Use the shadcn
`<Popover>` primitive:

```tsx
<div className="flex items-center gap-2">
  <Button variant="outline" onClick={onAddToVault}>Add to vault</Button>
  <Popover>
    <PopoverTrigger><HelpCircle className="size-4 text-[var(--text-3)]" /></PopoverTrigger>
    <PopoverContent>{vaultExplainer}</PopoverContent>
  </Popover>
</div>
```

**Acceptance:**

- Only one Actions block in the detail panel.
- Extend button matches Quick-sell and Add-to-vault in
  weight.
- Clicking `(?)` reveals the vault explainer; it's hidden
  by default.

---

## P35.5 — Verify / lint / build / deploy

Standard: `pnpm format && pnpm typecheck && pnpm lint && pnpm build`.
Apply migration for the batch SQL fns via Supabase MCP in
staging first (if batch actions are included), then deploy.

---

## P35.6 — ADR-0035 retro

Standard retrospective covering §103–§106.

# Draft Deck — Phase 23 Roadmap (Feel Pass v1.14 — Lineup layout + surface cleanup)

**Goal:** Replace the diamond layout with three role rows,
plus four narrower surface fixes (event matchup, tray
arrows, box-score zeros, header relocation).

**Estimated effort:** ~0.5 day. No migrations; pure UI +
type extensions.

**Prerequisites:**

- Phase 22's pill tone helpers (§62) reused for the event
  matchup chip.
- Phase 18's `slotGameByCardId` + `<LineupSidebar>` — the
  surface getting the relocated contest header.
- Phase 22's bench chip pattern — `<HorizontalScroller>`
  is adjacent; tray contents unchanged.

---

## Milestones

| ID    | Milestone                                  | Target   | Outcome |
|-------|--------------------------------------------|----------|---------|
| P23.1 | Three-role-row layout                      | 0.15 day | `DiamondGrid` → `LineupGrid`. Rotation / Infield / Outfield rows with labels. |
| P23.2 | Event feed matchup chip                    | 0.10 day | `FeedEvent.gameMatchup`; provider builds it from game ↔ team map; feed row renders pill. |
| P23.3 | Bench + Tokens scroll arrows               | 0.10 day | New `<HorizontalScroller>` primitive; used by BenchDrawer + TokenTray. Native scrollbar hidden. |
| P23.4 | Box score 0-for-played                     | 0.02 day | Show `0.0` when game is live/final; keep `—` otherwise. |
| P23.5 | Contest header → sidebar                   | 0.10 day | Top bar removed; new `ContestHeaderCard` at top of sidebar. |
| P23.6 | Typecheck + lint + local build             | —        | All clean. |
| P23.7 | Commit, deploy, ADR-0028                   | 0.05 day | Logical commit chunks; vercel --prod; retro. |

---

## P23.1 — Three-role-row layout

### T23.1.1 Rename + restructure DiamondGrid

- **What:** Rename `src/components/lineup/DiamondGrid.tsx`
  to `LineupGrid.tsx`. Restructure the inner JSX:
  ```tsx
  <div className="flex flex-col gap-4 py-6">
    <RoleRow label="Rotation" positions={["SP1", "SP2"]} slotFills={...} />
    <RoleRow label="Infield"  positions={["C","1B","2B","3B","SS"]} ... />
    <RoleRow label="Outfield" positions={["OF1","OF2","OF3"]} ... />
  </div>
  ```
  Each `<RoleRow>` is a `<div className="flex flex-col gap-1">` containing:
  - `<h3>` label: `"font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]"`
  - Content row: `<div className="flex justify-center gap-3">` with the positions mapped to `<LineupSlot>`s.
- Drop `LineupSlot`'s implicit width / size prop if any
  (see Diamond CSS): the new layout just lets the cards
  render at their natural width, gap spacing + flex-
  centering does the alignment.

### T23.1.2 Update shell prop name + lineup-view wire-up

- **What:** Rename `LineupShell` prop `diamond` → `grid`.
  Update `lineup-view.tsx` to pass the new `LineupGrid`
  component through that prop. No behavioral change.

### T23.1.3 Acceptance smoke

- Pre-submit: 10 empty slots visible; drag from bench to
  each row works.
- Post-submit: cards render in role rows, per-slot lock
  + token badge visible.
- Visual: pitcher row centers; outfield row centers;
  infield fills the width.

---

## P23.2 — Event feed matchup chip

### T23.2.1 Type + provider extension

- **What:** `FeedEvent` type in
  `src/components/lineup/LiveEventsProvider.tsx` gains:
  ```ts
  gameMatchup: string | null;
  ```
- Provider adds a new prop `gameMatchupById: Record<string, string>`
  passed from `lineup-view.tsx`. The lineup page's server-
  side query already has game+team data (fetchSlotGameByCardId);
  expose the matchup string per game id as a separate map.
- When events arrive, the reducer / mapper sets
  `gameMatchup = map[event.game_id] ?? null`.

### T23.2.2 Build gameMatchupById on the server

- **What:** `src/lib/lineup/fetch-slot-games.ts` already
  pulls per-game info. Extend the return shape to include
  a `gameMatchupById: Record<string, string>` side output
  keyed by `game.id`, preformatted as `"{home}@{away}"` for
  anyone (no home/away perspective needed on a feed chip —
  feed events are global across the lineup, not per-card).
- `lineup/page.tsx` destructures the new output and threads
  it to `<LineupView>` → `<LiveEventsProvider>`.
- `LineupViewProps` adds `gameMatchupById: Record<string, string>`.

### T23.2.3 Feed row render

- **What:** `src/components/lineup/EventFeed.tsx`:
  ```tsx
  <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <span className={...inningToneClass}>{timeLabel}</span>
    {gameMatchup && (
      <span className="... border px-1.5 py-0 bg-[var(--surface-2)] text-[var(--text-3)]">
        {gameMatchup}
      </span>
    )}
  </span>
  ```
  Sits where the inning label currently renders.

### T23.2.4 Acceptance smoke

- Event row shows `T5 · NYY@BOS` style chip inline.
- Rows without matchup data (data race / unknown game)
  render just the inning, no blank chip.

---

## P23.3 — Bench + Tokens scroll arrows

### T23.3.1 HorizontalScroller primitive

- **What:** New file
  `src/components/ui/horizontal-scroller.tsx`. Client
  component:
  ```tsx
  export function HorizontalScroller({ children, className }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(false);

    const recompute = () => {
      const el = ref.current;
      if (!el) return;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    useEffect(() => {
      recompute();
      const el = ref.current;
      if (!el) return;
      el.addEventListener("scroll", recompute, { passive: true });
      const obs = new ResizeObserver(recompute);
      obs.observe(el);
      return () => {
        el.removeEventListener("scroll", recompute);
        obs.disconnect();
      };
    }, [children]);

    const scrollBy = (dir: 1 | -1) => {
      const el = ref.current; if (!el) return;
      el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
    };

    return (
      <div className={cn("relative flex items-stretch gap-1", className)}>
        <ScrollButton dir="left" disabled={!canLeft} onClick={() => scrollBy(-1)} />
        <div
          ref={ref}
          className="flex min-w-0 flex-1 gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
        <ScrollButton dir="right" disabled={!canRight} onClick={() => scrollBy(1)} />
      </div>
    );
  }
  ```
- `<ScrollButton>` internal helper — 24px wide, transparent
  bg, hover elevates, disabled-muted. Uses `ChevronLeft`/
  `ChevronRight` from lucide-react.

### T23.3.2 Wire into BenchDrawer

- **What:** `src/components/lineup/BenchDrawer.tsx` —
  replace
  ```tsx
  <div className="flex gap-3 overflow-x-auto pb-1">
    {filtered.map(...)}
  </div>
  ```
  with
  ```tsx
  <HorizontalScroller className="pb-1">
    {filtered.map(...)}
  </HorizontalScroller>
  ```

### T23.3.3 Wire into TokenTray

- **What:** `src/components/lineup/TokenTray.tsx` — same
  pattern. Read current token row shape; replace the
  `overflow-x-auto` outer div with `<HorizontalScroller>`.

### T23.3.4 Acceptance smoke

- With many bench cards: arrows both active; clicking
  right scrolls by ~5 cards (visible width); hitting the
  end greys the right arrow.
- With 0-3 bench cards (no overflow): both arrows
  disabled / invisible.
- No horizontal scrollbar visible anywhere.

---

## P23.4 — Box score 0-for-played

### T23.4.1 Conditional update

- **What:** `src/components/lineup/LineupSidebar.tsx`
  `BoxScoreSection` — find the render around:
  ```tsx
  {hasScored ? fp.toFixed(1) : "—"}
  ```
  Replace with:
  ```tsx
  {hasGameStarted(fill.gameInfo) ? fp.toFixed(1) : "—"}
  ```
  New helper: `hasGameStarted(info): info?.status === "live" || info?.status === "final"`.
- Keep the muted text treatment when fp === 0.

### T23.4.2 Acceptance smoke

- Pre-game slot: `—`.
- Live slot with 0 FP: `0.0`, muted.
- Final slot with 0 FP: `0.0`, muted.

---

## P23.5 — Contest header → sidebar

### T23.5.1 Remove top bar from LineupShell

- **What:** `src/components/lineup/LineupShell.tsx` —
  drop the `header` prop; render grid + sidebar directly.

### T23.5.2 Update lineup-view

- **What:** `src/app/(app)/lineup/lineup-view.tsx` —
  remove the `header={...}` argument from `<LineupShell>`.
  Thread `contestName` + `lockCountdown` + `entryStatus` +
  `submitted` into `<LineupSidebar>` via new props.

### T23.5.3 ContestHeaderCard in sidebar

- **What:** `src/components/lineup/LineupSidebar.tsx` —
  new `<ContestHeaderCard>` at the top of the sidebar:
  ```tsx
  <div className="border-b border-[var(--border)] pb-3">
    <h1 className="text-base font-bold">{contestName}</h1>
    <p className="text-xs text-[var(--text-3)]">{statusLine}</p>
  </div>
  ```
  `statusLine` = same copy as the old header (submitted /
  final / countdown branches).

### T23.5.4 Acceptance smoke

- Top bar gone; lineup grid sits at the top of the main
  column.
- Sidebar's first element is the contest name + date +
  lock status.
- Detail-card sidebar swap works unchanged.

---

## P23.6 — Verify

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm build` clean (catches any client/server leak).

---

## P23.7 — Commit, deploy, ADR-0028

- Logical commits in the order P23.1 → P23.5.
- `vercel --prod --yes`.
- ADR-0028 retro.

---

## Dependencies

```
P23.1 (layout) ──► independent
P23.2 (feed chip) ──► touches fetch-slot-games.ts + LineupViewProps + LiveEventsProvider + EventFeed
P23.3 (arrows) ──► independent primitive + two wire-ups
P23.4 (zeros) ──► independent one-line change
P23.5 (header) ──► touches LineupShell + lineup-view + LineupSidebar
                                       │
                                       ▼
                                  P23.6 (verify)
                                       │
                                       ▼
                                  P23.7 (deploy + ADR)
```

No ordering constraints between slices beyond the file
touches.

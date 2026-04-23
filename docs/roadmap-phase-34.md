# Draft Deck — Phase 34 Roadmap (v1.19.2 — Sidebar redesign + subtle scrollbars)

**Goal:** Tighten the right sidebar (cut team summary,
reorder live state, add a Back button to card detail) and
make scrollbars auto-fade in / out based on scroll activity.

**Estimated effort:** ~0.5 day.

**Prerequisites:**

- Phase 33 (sidebar swap restored + independent scrolls). The
  `[data-scroll]` attributes on each column already exist;
  this phase just styles them + hooks up the fade.

---

## Milestones

| ID    | Milestone                                          | Target    | Outcome |
|-------|----------------------------------------------------|-----------|---------|
| P34.1 | AppSidebar rewrite (cut team summary, reorder)    | 0.15 day  | Post-submit: ScoreHeadline → BoxScore → EventFeed. |
| P34.2 | Back button on card detail sidebar                | 0.05 day  | `DetailSidebar` wrapper with Back button. |
| P34.3 | Drop `teamSummary` from types + page + helper     | 0.05 day  | `team-summary.ts` deleted; prop removed. |
| P34.4 | Global subtle scrollbar CSS                       | 0.05 day  | `[data-scroll]` + `[data-scrolling="true"]` rules. |
| P34.5 | `useScrollFade` hook + wire in LineupView         | 0.10 day  | Capture-phase scroll listener; 700ms fade timer. |
| P34.6 | Typecheck / lint / build / deploy                 | 0.05 day  | Green checks, production deploy. |
| P34.7 | ADR-0034 retro                                    | 0.05 day  | Standard retrospective. |

---

## P34.1 — AppSidebar rewrite

### T34.1.1 Cut team summary block

Delete the entire team summary section from
`src/components/layout/AppSidebar.tsx`. It rendered team
name, vault value total, total FP, and vaulted cards count —
all of which are surfaced elsewhere (header title bar +
profile drawer). Free ~30 lines of stacked stats from the
sidebar.

### T34.1.2 Drop unused `summary` variant

Before Phase 32 deleted `/collection`, the sidebar rendered
two variants: `lineup` and `summary`. `summary` is dead code
after /collection's removal. Drop the discriminated-union
branch and simplify the props to lineup-only fields.

### T34.1.3 `ScoreHeadline` component

Replace the separate Live Score block + Status chip with a
single `ScoreHeadline` component at the top of the post-
submit sidebar:

```tsx
function ScoreHeadline({
  entryStatus,
  liveScore,
  finalScore,
  statusText,
}: {
  entryStatus: "submitted" | "live" | "final";
  liveScore: number;
  finalScore: number;
  statusText: string;
}) {
  const label = entryStatus === "final" ? "Final" : "Live";
  const score = entryStatus === "final" ? finalScore : liveScore;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--text-3)]">
        <span>{label}</span>
        <span>{statusText}</span>
      </div>
      <div className="font-sans text-3xl font-bold tabular-nums text-[var(--text)]">
        {score.toFixed(1)}
      </div>
    </div>
  );
}
```

`statusText` derivation lives in the sidebar:
- submitted → "Waiting on first pitch"
- live → "{gamesLive} live · {gamesFinal} final"
- final → "Contest final"

### T34.1.4 Section reorder

Post-submit order: `ScoreHeadline` → `BoxScoreSection` →
`EventFeed`. (Was: `LiveScore` + `StatusChip` + `TeamSummary`
+ `BoxScoreSection` + `EventFeed`.) Building state is
unchanged.

**Acceptance:**

- Team name + vault value NOT rendered in sidebar.
- Post-submit sidebar shows exactly three sections in the
  order above.
- No dangling references to the `summary` variant or the
  `teamSummary` prop.

---

## P34.2 — Back button on card detail sidebar

### T34.2.1 `DetailSidebar` wrapper

In `src/app/(app)/lineup/lineup-view.tsx`, add a local
`DetailSidebar` component at the bottom of the file that
wraps `<CardDetailPanel>` with a Back button row above:

```tsx
function DetailSidebar({ cardId, slotted, onRemoveFromSlot, onVaulted, onClose }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="-ml-2 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 gap-1 px-2 text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
      </div>
      <CardDetailPanel
        cardId={cardId}
        lineupContext={{ slotted, onRemoveFromSlot, onVaulted }}
        onClose={onClose}
      />
    </div>
  );
}
```

### T34.2.2 `handleCloseDetail` callback

`useCallback` that strips `?card` from the URL using
`router.replace(window.location.pathname)`. Passed as `onClose`
to `DetailSidebar`. Swaps the sidebar back to `<AppSidebar>`
via the URL-param effect.

**Acceptance:**

- Clicking a card opens detail in the sidebar with a "← Back"
  button visible at the top.
- Clicking Back returns the sidebar to default state and clears
  `?card` from the URL.

---

## P34.3 — Drop `teamSummary` from types + page + helper

### T34.3.1 Remove prop

- `src/lib/lineup/types.ts` — drop `teamSummary: TeamSummary`
  from `LineupViewProps` and the `TeamSummary` type import.
- `src/app/(app)/lineup/page.tsx` — drop `getTeamSummary()`
  from the parallel `Promise.all` and the
  `teamSummary={teamSummary}` prop pass.

### T34.3.2 Delete helper

`git rm src/lib/profile/team-summary.ts`. Verify no other
callers with `grep`.

**Acceptance:**

- `pnpm typecheck` is clean.
- Grep for `team-summary` finds zero references outside the
  ADR + commit history.

---

## P34.4 — Global subtle scrollbar CSS

In `src/app/globals.css`, add rules under the existing
`@layer base` block (or at the bottom):

```css
[data-scroll] {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 300ms ease-out;
}
[data-scroll][data-scrolling="true"] {
  scrollbar-color: color-mix(in oklab, var(--text-3) 55%, transparent) transparent;
}
[data-scroll]::-webkit-scrollbar { width: 8px; height: 8px; }
[data-scroll]::-webkit-scrollbar-track { background: transparent; }
[data-scroll]::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 4px;
  transition: background-color 300ms ease-out;
}
[data-scroll][data-scrolling="true"]::-webkit-scrollbar-thumb {
  background-color: color-mix(in oklab, var(--text-3) 55%, transparent);
}
```

**Acceptance:**

- On a fresh page load, neither column shows a scrollbar.
- Starting to scroll a column reveals a thin translucent
  thumb that fades in via the transition.

---

## P34.5 — `useScrollFade` hook + wire in LineupView

### T34.5.1 New hook file

Create `src/components/lineup/use-scroll-fade.ts`:

```ts
"use client";
import { useEffect } from "react";

export function useScrollFade() {
  useEffect(() => {
    const HIDE_MS = 700;
    const timers = new WeakMap<Element, number>();
    function onScroll(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.hasAttribute("data-scroll")) return;
      el.setAttribute("data-scrolling", "true");
      const existing = timers.get(el);
      if (existing !== undefined) clearTimeout(existing);
      const t = window.setTimeout(() => {
        el.removeAttribute("data-scrolling");
        timers.delete(el);
      }, HIDE_MS);
      timers.set(el, t);
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
}
```

### T34.5.2 Wire in LineupView

In `src/app/(app)/lineup/lineup-view.tsx`, import + call the
hook next to the existing `useAutoScrollOnDrag()` call at the
top of the component function.

**Acceptance:**

- Scrolling the left column fades in the thumb, stops
  scrolling → thumb fades out 700ms later.
- Scrolling the sidebar behaves the same, independently.
- No console warnings; hook is a no-op server-side.

---

## P34.6 — Typecheck / lint / build / deploy

Standard verify loop:

```
pnpm format && pnpm typecheck && pnpm lint && pnpm build
```

Deploy to production once green.

---

## P34.7 — ADR-0034 retro

Write `docs/adr/ADR-0034_phase-34-retro.md`. Standard
retrospective covering:

- What shipped (sections §99, §100, §101).
- What went smoothly (scoped work, no new data flows).
- What was tricky (scroll events don't bubble — capture phase
  is the right answer; per-element WeakMap avoids timer
  collisions between columns).
- What's deferred (building-state status chip still separate;
  EventFeed virtualization; mobile sidebar layout).

import type { ReactNode } from "react";

type Props = {
  grid: ReactNode;
  sidebar: ReactNode;
  /** Polish spec §95 (Phase 32). Tokens now render ABOVE the cards
   *  panel — previously they sat below the bench carousel. */
  tokens: ReactNode;
  /** Polish spec §94 (Phase 32). Renamed from `bench` — the cards
   *  panel shows the user's entire collection in a responsive grid
   *  below the tokens. `/collection` page was killed in this phase. */
  cards: ReactNode;
};

/**
 * Polish spec §99 (Phase 33) — independent scroll containers.
 *
 * User ask: "the right side bar section and the lineup / collection
 * section should be different scrolls. When you hover over a section,
 * it should only scroll on that section."
 *
 * Previously (through P32) the shell was `min-h-full` — it grew past
 * its parent `<main>` when content (grid + tokens + cards) exceeded
 * the viewport, and `<main>`'s own `overflow-auto` scrolled the
 * whole thing (both columns at once). Now the shell is `h-full` —
 * exactly its parent's height — and each column scrolls internally:
 *
 *   - Left column (grid + tokens + cards) has `overflow-y-auto`
 *     marked with `data-scroll="lineup-main"`. The autoscroll-on-
 *     drag hook scrolls this container when the user drags near the
 *     viewport edge.
 *   - Aside (AppSidebar / CardDetailPanel swap) keeps its own
 *     `overflow-auto`.
 *
 * The parent `<main overflow-auto>` in `(app)/layout.tsx` stays as-
 * is for other pages; the lineup shell just fills it exactly so it
 * never triggers.
 */
export function LineupShell({ grid, sidebar, tokens, cards }: Props) {
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto" data-scroll="lineup-main">
          {grid}
          {tokens}
          {cards}
        </div>
        <aside
          className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-[var(--border)] border-l bg-[var(--surface)] p-4 md:flex"
          data-scroll="lineup-sidebar"
        >
          {sidebar}
        </aside>
      </div>
    </div>
  );
}

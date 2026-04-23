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
 * Polish spec §82 (Phase 28) — flow-based layout.
 *
 * Earlier phases (23–27) kept the lineup grid in a fixed-height pane
 * inside the shell. The pane was `flex-1 overflow-hidden` which
 * forced grid content to fit OR clip, and made the lineup feel like
 * a contained "canvas" separate from the rest of the page. User
 * feedback: "it seems like these cards are fit into a section
 * separate from the rest of the page. It looks like a canvas in the
 * back of everything. What if we didn't do that and just kinda made
 * it like a whole section."
 *
 * The new shell lets grid + bench + tokens flow as a single natural-
 * height column. When the sum exceeds the available height, the
 * parent `<main>` element in app/(app)/layout.tsx — which already
 * has `overflow-auto` — scrolls. No internal grid constraint; no
 * clipping. Cards are rendered at bench size (96×134) and the
 * layout is a document-like flow (role labels → cards → role
 * labels → cards → bench → tokens).
 */
export function LineupShell({ grid, sidebar, tokens, cards }: Props) {
  return (
    <div className="flex min-h-full flex-col bg-[var(--bg)]">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {grid}
          {/* Polish spec §95 (Phase 32). Token tray docks above the
              cards panel; cards extend down below the fold and the
              parent <main> scrolls. */}
          {tokens}
          {cards}
        </div>
        <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-auto border-[var(--border)] border-l bg-[var(--surface)] p-4 md:flex">
          {sidebar}
        </aside>
      </div>
    </div>
  );
}

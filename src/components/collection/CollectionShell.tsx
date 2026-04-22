import type { ReactNode } from "react";

type Props = {
  main: ReactNode;
  sidebar: ReactNode;
};

/**
 * Polish spec §25 (Phase 13) — collection page layout.
 *
 * Mirrors <LineupShell>'s main+sidebar shape so the two pages read
 * as the same surface. Sidebar is fixed 288px (w-72) with the same
 * border / background / spacing as the lineup sidebar. Hidden below
 * md breakpoint; the main pane scrolls independently.
 */
export function CollectionShell({ main, sidebar }: Props) {
  return (
    <div className="flex h-full min-h-0 bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</div>
      <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-auto border-[var(--border)] border-l bg-[var(--surface)] p-4 md:flex">
        {sidebar}
      </aside>
    </div>
  );
}

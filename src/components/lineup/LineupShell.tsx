import type { ReactNode } from "react";

type Props = {
  grid: ReactNode;
  sidebar: ReactNode;
  bench: ReactNode;
  tokens: ReactNode;
};

/**
 * Fixed-viewport lineup layout.
 *   - Main row: left column (lineup grid + bench + tokens stacked)
 *     beside right sidebar (w-72, full height).
 *
 * Polish spec §72 (Phase 23): the top bar was removed. The contest
 * name + status/countdown moved into the sidebar's first block
 * (`<ContestHeaderCard>` inside `<LineupSidebar>`). That reclaims
 * vertical space for the three-role-row lineup layout (§68).
 *
 * Polish spec §38 (Phase 16): sidebar extends top-to-bottom.
 * Bench + tokens live inside the left column (narrower than the
 * sidebar-inclusive variant). The sidebar's own `overflow-auto`
 * lets its contents scroll independently.
 *
 * Polish spec §78 (Phase 26): LineupGrid uses size="lineup"
 * (120×168) cards + inline role labels to fit three rows into
 * typical laptop pane heights (roughly 520px grid content). The
 * grid pane gets `overflow-hidden` back so a very short viewport
 * clips the bottom of the outfield row rather than letting it
 * overlap the bench (which is what happened in the P25 build at
 * narrow viewports — the outfield cards were spilling through the
 * bench visually).
 */
export function LineupShell({ grid, sidebar, bench, tokens }: Props) {
  return (
    <div className="flex h-full min-h-[720px] flex-col bg-[var(--bg)]">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">{grid}</div>
          <div className="shrink-0">
            {bench}
            {tokens}
          </div>
        </div>
        <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-auto border-[var(--border)] border-l bg-[var(--surface)] p-4 md:flex">
          {sidebar}
        </aside>
      </div>
    </div>
  );
}

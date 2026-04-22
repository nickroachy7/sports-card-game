import type { ReactNode } from "react";

type Props = {
  header: ReactNode;
  diamond: ReactNode;
  sidebar: ReactNode;
  bench: ReactNode;
  tokens: ReactNode;
};

/**
 * Fixed-viewport lineup layout.
 *   - Header row (shrink-0)
 *   - Main row: left column (diamond + bench + tokens stacked)
 *     beside right sidebar (w-72, full height).
 *
 * Polish spec §38 (Phase 16): sidebar now extends from the header's
 * bottom edge to the viewport bottom, matching `<CollectionShell>`.
 * Bench + tokens live inside the left column (narrower than before
 * — they no longer span under the sidebar) but keep their existing
 * vertical position. The sidebar's own `overflow-auto` lets its
 * contents scroll independently when the selected-card detail
 * exceeds available height.
 *
 * Polish spec §24 (Phase 13): the diamond lives directly in a flex
 * pane with native horizontal scroll when the viewport is narrower
 * than the minimum compressed diamond (~900px). No pan/zoom layer.
 */
export function LineupShell({ header, diamond, sidebar, bench, tokens }: Props) {
  return (
    <div className="flex h-full min-h-[720px] flex-col bg-[var(--bg)]">
      {header}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center overflow-auto">{diamond}</div>
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

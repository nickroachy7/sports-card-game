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
 *   - Main row: diamond (flex-1, scrollable if needed) + right sidebar (w-72, fixed)
 *   - Bottom strip: bench row + tokens row, both shrink-0
 *
 * Designed to fit ≥800px viewport height without page scroll. Below that
 * the parent <main> (in (app)/layout.tsx) already has overflow-auto, so
 * the whole shell scrolls gracefully.
 */
export function LineupShell({ header, diamond, sidebar, bench, tokens }: Props) {
  return (
    <div className="flex h-full min-h-[720px] flex-col bg-[var(--bg)]">
      {header}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 overflow-auto">{diamond}</div>
        <aside className="hidden w-72 shrink-0 flex-col gap-5 border-l border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
          {sidebar}
        </aside>
      </div>
      <div className="shrink-0">
        {bench}
        {tokens}
      </div>
    </div>
  );
}

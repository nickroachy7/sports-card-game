import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SidebarSection({
  title,
  children,
  className,
}: {
  /** Plain string for simple sections; pass a ReactNode to decorate
   *  the title (e.g. a connection indicator next to "Event Feed"). */
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1", className)}>
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-3)]">{title}</h2>
      {children}
    </section>
  );
}

export function SidebarStat({
  value,
  accent,
  className,
}: {
  value: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-1 font-mono text-2xl font-bold",
        accent ? "text-[#D4A647]" : "text-[var(--text)]",
        className,
      )}
    >
      {value}
    </p>
  );
}

export function SidebarRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm text-[var(--text-2)]">
      <span>{label}</span>
      <span className="font-mono text-[var(--text)]">{value}</span>
    </div>
  );
}

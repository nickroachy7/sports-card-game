"use client";

import { BarChart3, Gem, Medal, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Polish spec §97 (Phase 32). Collection was absorbed into the
// Lineup page — all cards now render below the lineup grid in one
// scrollable view. `/collection` is a 404.
const NAV = [
  { href: "/lineup", label: "Lineup", Icon: Users },
  { href: "/shop", label: "Shop", Icon: ShoppingBag },
  { href: "/vault", label: "Vault", Icon: Gem },
  { href: "/milestones", label: "Milestones", Icon: Medal },
  { href: "/leaderboards", label: "Leaderboards", Icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface)] px-3 py-4"
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--text)]"
              />
            )}
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

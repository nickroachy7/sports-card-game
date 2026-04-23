"use client";

import { Palette, Settings, User } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { computeLevelProgress } from "@/lib/profile/manager-level";

type Props = {
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  managerLevel: number;
  managerXp: number;
  careerFp: number;
  lifetimeContestsWon: number;
  lifetimeDiamondCardsVaulted: number;
  lifetimeTokensTriggered: number;
};

export function ProfileDrawer(props: Props) {
  const [pending, startTransition] = useTransition();
  // Controlled open state so we can close the drawer from within
  // (e.g., when a quick link is clicked so the user doesn't see the
  // previous page state with the drawer still mounted as they
  // navigate).
  const [open, setOpen] = useState(false);

  const initial = props.teamName.trim().charAt(0).toUpperCase() || "?";
  const progress = computeLevelProgress(props.managerXp, props.managerLevel);

  function handleSignOut() {
    startTransition(async () => {
      try {
        await signOut();
      } catch {
        toast.error("Couldn't sign out. Try again.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open profile"
          className="flex size-8 items-center justify-center rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--text-2)]"
          style={{ backgroundColor: props.primaryColor, color: props.secondaryColor }}
        >
          {initial}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="border-l border-[var(--border)] bg-[var(--surface)] text-[var(--text)] sm:max-w-sm"
      >
        <SheetHeader>
          <SheetTitle className="font-sans text-xl">{props.teamName}</SheetTitle>
          <SheetDescription className="text-[var(--text-2)]">
            Manager Level {props.managerLevel}
            {progress.maxed ? " · MAX" : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {/* Polish spec §84 (Phase 29). XP progress bar — visualises
              earned XP within the current level. When maxed, fills
              the bar and labels "MAX LEVEL". */}
          <section aria-label="Level progress">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                {progress.maxed
                  ? "Max level"
                  : `Level ${props.managerLevel} → ${props.managerLevel + 1}`}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-3)]">
                {progress.maxed
                  ? `${props.managerXp.toLocaleString()} XP`
                  : `${progress.earned.toLocaleString()} / ${progress.span.toLocaleString()} XP`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full bg-[var(--tier-gold,#D4A647)] transition-[width]"
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[var(--text-3)]">Career</h3>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Career FP" value={props.careerFp.toLocaleString()} />
              <Stat label="Manager XP" value={props.managerXp.toLocaleString()} />
              <Stat label="Contests won" value={props.lifetimeContestsWon.toLocaleString()} />
              <Stat
                label="Diamond vaulted"
                value={props.lifetimeDiamondCardsVaulted.toLocaleString()}
              />
              <Stat
                label="Tokens triggered"
                value={props.lifetimeTokensTriggered.toLocaleString()}
              />
            </dl>
          </section>

          {/* Polish spec §84 — quick links to the two settings pages
              created in Phase 29 (§85 team + §86 account). Close the
              drawer on click so navigation reads as a clean transition. */}
          <section aria-label="Account">
            <nav className="flex flex-col gap-1">
              <DrawerLink
                href="/settings/team"
                icon={<Palette className="size-4" aria-hidden />}
                onClick={() => setOpen(false)}
              >
                Team customization
              </DrawerLink>
              <DrawerLink
                href="/settings/account"
                icon={<Settings className="size-4" aria-hidden />}
                onClick={() => setOpen(false)}
              >
                Account settings
              </DrawerLink>
            </nav>
          </section>

          <Button variant="outline" onClick={handleSignOut} disabled={pending} className="w-full">
            <User className="mr-2 size-4" aria-hidden />
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold text-[var(--text)]">{value}</dd>
    </div>
  );
}

function DrawerLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:border-[var(--text-2)]"
    >
      <span className="text-[var(--text-3)]">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

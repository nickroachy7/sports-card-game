"use client";

import { useTransition } from "react";
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

  const initial = props.teamName.trim().charAt(0).toUpperCase() || "?";

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
    <Sheet>
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
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
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

          <Button variant="outline" onClick={handleSignOut} disabled={pending} className="w-full">
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

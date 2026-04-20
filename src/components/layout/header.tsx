import { Coins, Package } from "lucide-react";
import Link from "next/link";

import { ProfileDrawer } from "@/components/layout/profile-drawer";

type HeaderProps = {
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  coins: number;
  dailyPackReady: boolean;
  managerLevel: number;
  managerXp: number;
  careerFp: number;
  lifetimeContestsWon: number;
  lifetimeDiamondCardsVaulted: number;
  lifetimeTokensTriggered: number;
};

export function Header(props: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <Link href="/lineup" className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full text-xs font-bold"
          style={{ backgroundColor: props.primaryColor, color: props.secondaryColor }}
        >
          {props.teamName.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="font-sans text-sm font-semibold text-[var(--text)]">{props.teamName}</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
          <Coins className="size-3.5 text-[var(--tier-gold)]" aria-hidden="true" />
          <span className="font-mono text-xs font-bold text-[var(--text)]">
            {props.coins.toLocaleString()}
          </span>
        </div>

        <Link
          href="/shop"
          aria-label={props.dailyPackReady ? "Daily Pack ready" : "Daily Pack claimed"}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 transition-colors hover:border-[var(--text-2)]"
        >
          <Package
            className={`size-3.5 ${props.dailyPackReady ? "text-[var(--tier-gold)]" : "text-[var(--muted)]"}`}
            aria-hidden="true"
          />
          <span className="font-mono text-xs font-medium text-[var(--text-2)]">DP</span>
          {props.dailyPackReady && (
            <span
              aria-hidden="true"
              className="ml-0.5 size-1.5 rounded-full bg-[var(--tier-gold)] animate-pulse"
            />
          )}
        </Link>

        <Link
          href="/leaderboards"
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 transition-colors hover:border-[var(--text-2)]"
        >
          <span className="font-mono text-xs font-bold text-[var(--text)]">
            LVL {props.managerLevel}
          </span>
        </Link>

        <ProfileDrawer
          teamName={props.teamName}
          primaryColor={props.primaryColor}
          secondaryColor={props.secondaryColor}
          managerLevel={props.managerLevel}
          managerXp={props.managerXp}
          careerFp={props.careerFp}
          lifetimeContestsWon={props.lifetimeContestsWon}
          lifetimeDiamondCardsVaulted={props.lifetimeDiamondCardsVaulted}
          lifetimeTokensTriggered={props.lifetimeTokensTriggered}
        />
      </div>
    </header>
  );
}

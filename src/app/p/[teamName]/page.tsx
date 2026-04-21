import Link from "next/link";
import { notFound } from "next/navigation";

import type { CardTier } from "@/lib/contracts/cards";
import { getPublicProfileByTeamName, getPublicVaultByTeamName } from "@/lib/profile/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ teamName: string }>;
};

const TIER_COLOR: Record<CardTier, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  diamond: "var(--tier-diamond)",
};

const TIER_LABEL: Record<CardTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("");
}

export default async function PublicProfilePage({ params }: Props) {
  const { teamName: raw } = await params;
  const teamName = decodeURIComponent(raw);

  const [profile, vault] = await Promise.all([
    getPublicProfileByTeamName(teamName),
    getPublicVaultByTeamName(teamName),
  ]);

  if (!profile) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <nav className="flex items-center justify-between text-xs text-[var(--text-3)]">
        <Link href="/leaderboards" className="uppercase tracking-wider hover:text-[var(--text-2)]">
          ← Leaderboards
        </Link>
        <span className="uppercase tracking-wider">Public profile</span>
      </nav>

      <header className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-4">
          <div
            className="flex size-16 items-center justify-center rounded-full text-lg font-bold"
            style={{
              backgroundColor: profile.teamColorPrimary,
              color: profile.teamColorSecondary,
            }}
          >
            {profile.teamName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <h1 className="font-sans text-3xl font-bold tracking-tight">{profile.teamName}</h1>
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-3)]">
              Level {profile.managerLevel} · {profile.managerXp.toLocaleString()} XP
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">Lifetime FP</dt>
            <dd className="font-mono tabular-nums text-[var(--text)]">
              {profile.lifetimeFp.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">Contests won</dt>
            <dd className="font-mono tabular-nums text-[var(--text)]">
              {profile.lifetimeContestsWon.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">
              Diamonds vaulted
            </dt>
            <dd className="font-mono tabular-nums text-[var(--text)]">
              {profile.lifetimeDiamondCardsVaulted.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">
              Seasons played
            </dt>
            <dd className="font-mono tabular-nums text-[var(--text)]">
              {profile.seasonsPlayed.toLocaleString()}
            </dd>
          </div>
          {profile.currentSeason && (
            <>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                  {profile.currentSeason.year} FP
                </dt>
                <dd className="font-mono tabular-nums text-[var(--text)]">
                  {profile.currentSeason.seasonFp.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">
                  {profile.currentSeason.year} wins
                </dt>
                <dd className="font-mono tabular-nums text-[var(--text)]">
                  {profile.currentSeason.seasonContestsWon.toLocaleString()}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--text-3)]">Vault size</dt>
            <dd className="font-mono tabular-nums text-[var(--text)]">
              {profile.vault.total.toLocaleString()}
              {profile.vault.diamondCount > 0 && (
                <span className="ml-2 text-[10px] uppercase text-[var(--tier-diamond)]">
                  {profile.vault.diamondCount} diamond
                </span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-2)]">
          Vault
        </h2>
        {!vault || vault.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-3)]">
            No vaulted cards yet.
          </div>
        ) : (
          vault.map((group) => (
            <article
              key={group.seasonId}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <header className="flex items-baseline justify-between border-b border-[var(--border)] pb-2">
                <h3 className="font-sans text-xl font-bold">{group.year}</h3>
                <span className="font-mono text-xs text-[var(--text-3)]">
                  {group.cards.length}/10 preserved
                </span>
              </header>
              <div className="flex flex-wrap gap-3">
                {group.cards.map((card) => (
                  <div key={card.id} className="flex flex-col items-center gap-1">
                    <div
                      className="flex flex-col overflow-hidden rounded-md border-2 bg-[var(--surface-2)]"
                      style={{
                        borderColor: TIER_COLOR[card.finalTier],
                        width: 96,
                        height: 134,
                      }}
                    >
                      <div className="flex flex-1 items-center justify-center text-[var(--text-3)]">
                        <span className="font-mono text-[10px] uppercase tracking-wider">
                          {initials(card.playerName)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 bg-[var(--surface)] px-1.5 py-1">
                        <span className="truncate text-[10px] font-semibold leading-tight text-[var(--text)]">
                          {card.playerName}
                        </span>
                        <div className="flex items-center justify-between text-[9px] text-[var(--text-3)]">
                          <span className="font-mono">
                            {(card.positions?.[0] ?? "").slice(0, 3).toUpperCase()}
                          </span>
                          <span className="font-mono">{card.finalFp.toFixed(0)} FP</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className="font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: TIER_COLOR[card.finalTier] }}
                    >
                      {TIER_LABEL[card.finalTier]}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

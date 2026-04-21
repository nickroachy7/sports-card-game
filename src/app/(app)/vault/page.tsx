import { redirect } from "next/navigation";

import type { CardTier } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type VaultRow = {
  id: string;
  season_id: string;
  final_tier: CardTier;
  final_fp: string | number;
  tokens_applied_count: number;
  tokens_triggered_count: number;
  created_at: string;
  season: { year: number } | { year: number }[] | null;
  player:
    | { full_name: string; positions: string[] | null }
    | { full_name: string; positions: string[] | null }[]
    | null;
};

function pickPlayer(
  p: VaultRow["player"],
): { full_name: string; positions: string[] | null } | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

type SeasonState = {
  season_id: string;
  season_fp: string | number;
  season_contests_won: number;
};

type EntryCountRow = { season_id: string };

const TIER_LABEL: Record<CardTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

const TIER_COLOR: Record<CardTier, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  diamond: "var(--tier-diamond)",
};

function pickYear(season: VaultRow["season"]): number {
  if (!season) return 0;
  if (Array.isArray(season)) return season[0]?.year ?? 0;
  return season.year;
}

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("");
}

function VaultThumb({ row }: { row: VaultRow }) {
  const color = TIER_COLOR[row.final_tier];
  const player = pickPlayer(row.player);
  const position = player?.positions?.[0] ?? "";
  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border-2 bg-[var(--surface-2)]"
      style={{ borderColor: color, width: 96, height: 134 }}
    >
      <div className="flex flex-1 items-center justify-center text-[var(--text-3)]">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {player ? initials(player.full_name) : "?"}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 bg-[var(--surface)] px-1.5 py-1">
        <span className="truncate text-[10px] font-semibold leading-tight text-[var(--text)]">
          {player?.full_name ?? "Unknown"}
        </span>
        <div className="flex items-center justify-between text-[9px] text-[var(--text-3)]">
          <span className="font-mono">{position.slice(0, 3).toUpperCase()}</span>
          <span className="font-mono">{Number(row.final_fp).toFixed(0)} FP</span>
        </div>
      </div>
    </div>
  );
}

export default async function VaultPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: vaultRows }, { data: seasonStates }, { data: finalEntries }] = await Promise.all([
    supabase
      .from("vault_entry")
      .select(
        `id, season_id, final_tier, final_fp, tokens_applied_count, tokens_triggered_count, created_at,
         season:season_id (year),
         player:player_id (full_name, positions)`,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_season_state")
      .select("season_id, season_fp, season_contests_won")
      .eq("user_id", user.id),
    supabase.from("contest_entry").select("season_id").eq("user_id", user.id).eq("status", "final"),
  ]);

  const rows = (vaultRows ?? []) as VaultRow[];
  const states = (seasonStates ?? []) as SeasonState[];
  const finals = (finalEntries ?? []) as EntryCountRow[];

  type Group = {
    year: number;
    seasonId: string;
    rows: VaultRow[];
    seasonFp: number;
    contestsWon: number;
    contestsPlayed: number;
  };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    const existing = groups.get(r.season_id);
    if (existing) {
      existing.rows.push(r);
      continue;
    }
    const state = states.find((s) => s.season_id === r.season_id);
    const played = finals.filter((e) => e.season_id === r.season_id).length;
    groups.set(r.season_id, {
      year: pickYear(r.season),
      seasonId: r.season_id,
      rows: [r],
      seasonFp: Number(state?.season_fp ?? 0),
      contestsWon: Number(state?.season_contests_won ?? 0),
      contestsPlayed: played,
    });
  }

  const sortedGroups = [...groups.values()].sort((a, b) => b.year - a.year);
  const totalCards = rows.length;
  const diamondCount = rows.filter((r) => r.final_tier === "diamond").length;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
          Keepsake showcase
        </span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Vault</h1>
        <p className="text-sm text-[var(--text-2)]">
          {totalCards === 0
            ? "Your first vault moment arrives at the end of the MLB season. Play to fill it."
            : `${totalCards} card${totalCards === 1 ? "" : "s"} across ${sortedGroups.length} season${sortedGroups.length === 1 ? "" : "s"}${
                diamondCount > 0 ? ` · ${diamondCount} diamond${diamondCount === 1 ? "" : "s"}` : ""
              }.`}
        </p>
      </header>

      {sortedGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-3)]">
          No vaulted cards yet. Preserve up to 10 cards each season in the end-of-season vault
          ceremony.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {sortedGroups.map((group) => (
            <article
              key={group.seasonId}
              className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-3">
                <h2 className="font-sans text-2xl font-bold tracking-tight">{group.year}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-3)]">
                  <span className="font-mono">{group.rows.length}/10 preserved</span>
                  <span className="font-mono">{group.seasonFp.toLocaleString()} FP</span>
                  <span className="font-mono">{group.contestsPlayed} contests</span>
                  {group.contestsWon > 0 && (
                    <span className="font-mono">{group.contestsWon} wins</span>
                  )}
                </div>
              </header>

              <div className="flex flex-wrap gap-3">
                {group.rows.map((row) => (
                  <div key={row.id} className="flex flex-col items-center gap-1">
                    <VaultThumb row={row} />
                    <span
                      className="font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: TIER_COLOR[row.final_tier] }}
                    >
                      {TIER_LABEL[row.final_tier]}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

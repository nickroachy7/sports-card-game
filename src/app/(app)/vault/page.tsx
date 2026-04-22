import Link from "next/link";
import { redirect } from "next/navigation";

import type { CardViewModel } from "@/components/card/Card";
import { PreVaultedList } from "@/components/vault/PreVaultedList";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { createServerClient } from "@/lib/db/supabase";
import { mlbamHeadshotUrl } from "@/lib/mlb/mlbam-headshot";

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

  const [
    { data: vaultRows },
    { data: seasonStates },
    { data: finalEntries },
    { data: offseason },
    { data: preVaulted },
    cfgRes,
  ] = await Promise.all([
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
    supabase
      .from("season")
      .select("id, year, status")
      .eq("status", "offseason")
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("card")
      .select(
        `id, current_tier, career_fp_total, contract_plays_remaining, is_expired, applied_token_id,
         vault_source,
         player:player_id (full_name, positions, status, mlbam_id, team:team_id (abbreviation))`,
      )
      .eq("user_id", user.id)
      .eq("is_vaulted", true)
      .eq("vault_source", "midseason")
      .order("vaulted_at", { ascending: false }),
    supabase.rpc("get_active_economy_config").single(),
  ]);

  type EconCfg = { quick_sell_values: Record<CardTier, number> };
  const cfg = (cfgRes.data ?? null) as EconCfg | null;
  const qsValues = (cfg?.quick_sell_values ?? {}) as Record<CardTier, number>;

  type PreVaultedRow = {
    id: string;
    current_tier: CardTier;
    career_fp_total: string | number;
    contract_plays_remaining: number;
    is_expired: boolean;
    applied_token_id: string | null;
    player: {
      full_name: string;
      positions: string[] | null;
      status: PlayerStatus;
      mlbam_id: number | null;
      team: { abbreviation: string | null } | { abbreviation: string | null }[] | null;
    } | null;
  };
  const preVaultedEntries = ((preVaulted ?? []) as unknown as PreVaultedRow[]).map((r) => {
    const p = Array.isArray(r.player) ? r.player[0] : r.player;
    const t = p && Array.isArray(p.team) ? p.team[0] : p?.team;
    const tier = r.current_tier;
    const card: CardViewModel = {
      id: r.id,
      playerName: p?.full_name ?? "Unknown",
      position: p?.positions?.[0] ?? null,
      teamAbbreviation: t?.abbreviation ?? null,
      tier,
      careerFp: Number(r.career_fp_total ?? 0),
      contractPlays: r.contract_plays_remaining,
      contractMax: 15,
      playerStatus: (p?.status ?? "active") as PlayerStatus,
      isExpired: r.is_expired,
      hasAppliedToken: r.applied_token_id !== null,
      isVaulted: true,
      photoUrl: p?.mlbam_id ? mlbamHeadshotUrl(p.mlbam_id, "medium") : null,
    };
    return { card, refundCoins: Math.floor((qsValues[tier] ?? 0) * 0.15) };
  });

  const rows = (vaultRows ?? []) as VaultRow[];
  const states = (seasonStates ?? []) as SeasonState[];
  const finals = (finalEntries ?? []) as EntryCountRow[];
  const ceremonyOpen =
    offseason && !rows.some((r) => r.season_id === (offseason as { id: string }).id);

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
      {ceremonyOpen && (
        <Link
          href="/vault/ceremony"
          className="flex items-center justify-between rounded-lg border border-[var(--tier-gold)] bg-[var(--surface)] px-5 py-4 hover:bg-[var(--surface-2)]"
        >
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-[var(--tier-gold)]">
              End of season
            </span>
            <span className="text-base font-semibold text-[var(--text)]">
              Your vault ceremony is ready
            </span>
            <span className="text-xs text-[var(--text-2)]">
              Preserve up to 10 cards before the new season begins.
            </span>
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-2)]">
            Enter →
          </span>
        </Link>
      )}

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

      <PreVaultedList entries={preVaultedEntries} />

      {sortedGroups.length === 0 && preVaultedEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-3)]">
          No vaulted cards yet. Preserve up to 10 cards each season — vault any time mid-season from
          a card's detail drawer, or wait for the end-of-season ceremony.
        </div>
      ) : sortedGroups.length === 0 ? null : (
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

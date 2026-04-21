import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type MilestoneKey = "hits" | "home_runs" | "stolen_bases" | "pitching_wins";

const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  hits: "Team Hits",
  home_runs: "Team Home Runs",
  stolen_bases: "Team Stolen Bases",
  pitching_wins: "Team Pitching Wins",
};

type MilestoneState = {
  hits: string | number;
  home_runs: string | number;
  stolen_bases: string | number;
  pitching_wins: string | number;
  hits_tiers_hit: number[] | null;
  home_runs_tiers_hit: number[] | null;
  stolen_bases_tiers_hit: number[] | null;
  pitching_wins_tiers_hit: number[] | null;
};

type AwardRow = {
  milestone_key: string;
  tier: number;
  coin_reward: string | number;
  xp_reward: string | number;
  awarded_at: string;
};

type EconCfg = {
  milestone_tiers: Record<MilestoneKey, number[]>;
  milestone_rewards: Record<MilestoneKey, Array<{ coins: number; xp: number }>>;
};

type Row = {
  key: MilestoneKey;
  label: string;
  count: number;
  thresholds: number[];
  tiersHit: number[];
  nextTarget: number | null;
};

function buildRow(key: MilestoneKey, state: MilestoneState | null, cfg: EconCfg | null): Row {
  const thresholds = cfg?.milestone_tiers?.[key] ?? [0, 0, 0, 0];
  const count = Number(state?.[key] ?? 0);
  const tiersKey = `${key}_tiers_hit` as
    | "hits_tiers_hit"
    | "home_runs_tiers_hit"
    | "stolen_bases_tiers_hit"
    | "pitching_wins_tiers_hit";
  const tiersHit = state?.[tiersKey] ?? [];
  const nextTarget = thresholds.find((t) => t > count) ?? null;
  return {
    key,
    label: MILESTONE_LABELS[key],
    count,
    thresholds,
    tiersHit: tiersHit ?? [],
    nextTarget,
  };
}

function Progress({ row }: { row: Row }) {
  const max = row.nextTarget ?? row.thresholds[row.thresholds.length - 1] ?? 1;
  const pct = Math.min(100, Math.round((row.count / max) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-2)]">
          {row.label}
        </span>
        <span className="font-mono text-sm text-[var(--text)]">
          {row.count.toLocaleString()}
          {row.nextTarget && (
            <span className="text-[var(--text-3)]"> / {row.nextTarget.toLocaleString()}</span>
          )}
          {!row.nextTarget && <span className="text-[var(--text-3)]"> · maxed</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full bg-[var(--text)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-3)]">
        {row.thresholds.map((target, idx) => {
          const tier = idx + 1;
          const hit = row.tiersHit.includes(tier);
          return (
            <span key={tier} className={hit ? "text-[var(--text)]" : undefined}>
              Tier {tier} {hit ? "✓" : ""} {target.toLocaleString()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function MilestonesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: season }, cfgRes] = await Promise.all([
    supabase
      .from("season")
      .select("id, year, status")
      .in("status", ["active", "offseason"])
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_active_economy_config").single(),
  ]);

  if (!season) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="font-sans text-3xl font-bold tracking-tight">Milestones</h1>
        <p className="text-[var(--text-2)]">No active season yet. Check back after Opening Day.</p>
      </section>
    );
  }

  const [{ data: stateRow }, { data: awards }] = await Promise.all([
    supabase
      .from("team_milestone_state")
      .select(
        "hits, home_runs, stolen_bases, pitching_wins, hits_tiers_hit, home_runs_tiers_hit, stolen_bases_tiers_hit, pitching_wins_tiers_hit",
      )
      .eq("user_id", user.id)
      .eq("season_id", season.id)
      .maybeSingle(),
    supabase
      .from("team_milestone_award")
      .select("milestone_key, tier, coin_reward, xp_reward, awarded_at")
      .eq("user_id", user.id)
      .eq("season_id", season.id)
      .order("awarded_at", { ascending: false })
      .limit(50),
  ]);

  const cfg = (cfgRes.data ?? null) as EconCfg | null;
  const rows: Row[] = (
    ["hits", "home_runs", "stolen_bases", "pitching_wins"] as MilestoneKey[]
  ).map((k) => buildRow(k, stateRow as MilestoneState | null, cfg));

  const awardsList = (awards ?? []) as AwardRow[];

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
          {season.year} Season
        </span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Milestones</h1>
        <p className="text-sm text-[var(--text-2)]">
          Season-long team counters. Every started card contributes. Resets at Opening Day.
        </p>
      </header>

      <div className="flex flex-col gap-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        {rows.map((row) => (
          <Progress key={row.key} row={row} />
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-2)]">
          Milestone history (this season)
        </h2>
        {awardsList.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-3)]">
            No milestones hit yet. Play a contest to start racking up counters.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {awardsList.map((a) => (
              <li
                key={`${a.milestone_key}-${a.tier}`}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[var(--text-3)]">{formatDate(a.awarded_at)}</span>
                  <span className="text-[var(--text)]">
                    {MILESTONE_LABELS[a.milestone_key as MilestoneKey] ?? a.milestone_key} Tier{" "}
                    {a.tier}
                  </span>
                </div>
                <span className="font-mono text-xs text-[var(--text-2)]">
                  +{Number(a.coin_reward).toLocaleString()} coins · +
                  {Number(a.xp_reward).toLocaleString()} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/db/supabase";
import {
  getLeaderboard,
  LEADERBOARD_LABEL,
  LEADERBOARD_METRIC_LABEL,
  LEADERBOARD_TYPES,
  type LeaderboardRow,
  type LeaderboardType,
} from "@/lib/leaderboards/queries";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ type?: string }>;
};

function toType(raw: string | undefined): LeaderboardType {
  if (raw && (LEADERBOARD_TYPES as readonly string[]).includes(raw)) {
    return raw as LeaderboardType;
  }
  return "manager-level";
}

function formatMetric(type: LeaderboardType, value: number): string {
  if (type === "card-prestige" || type === "vault-prestige") {
    return value.toLocaleString();
  }
  return value.toLocaleString();
}

function Row({
  row,
  type,
  pinned,
  isSelf,
}: {
  row: LeaderboardRow;
  type: LeaderboardType;
  pinned?: boolean;
  isSelf?: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
        pinned ? "bg-[var(--surface-2)]" : ""
      } ${isSelf ? "font-semibold text-[var(--text)]" : "text-[var(--text-2)]"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-10 shrink-0 font-mono text-xs text-[var(--text-3)]">#{row.rank}</span>
        <Link
          href={`/p/${encodeURIComponent(row.teamName)}`}
          className="truncate hover:text-[var(--text)]"
        >
          {row.teamName}
        </Link>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          LVL {row.managerLevel}
        </span>
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text)]">
        {formatMetric(type, row.metricValue)} {LEADERBOARD_METRIC_LABEL[type]}
      </span>
    </li>
  );
}

export default async function LeaderboardsPage({ searchParams }: Props) {
  const params = await searchParams;
  const type = toType(params.type);

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { top, you } = await getLeaderboard(type, { userId: user.id, limit: 100 });
  const youInTop = top.some((r) => r.userId === user.id);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Public</span>
        <h1 className="font-sans text-3xl font-bold tracking-tight">Leaderboards</h1>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1">
        {LEADERBOARD_TYPES.map((t) => {
          const active = t === type;
          return (
            <Link
              key={t}
              href={`/leaderboards?type=${t}`}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition ${
                active
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)]"
              }`}
            >
              {LEADERBOARD_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      {you && !youInTop && (
        <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">Your rank</span>
          <ul className="-mx-2">
            <Row row={you} type={type} pinned isSelf />
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Top {top.length}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            {LEADERBOARD_LABEL[type]}
          </span>
        </div>
        {top.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-3)]">
            No rankings yet for this board.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {top.map((row) => (
              <Row key={row.userId} row={row} type={type} isSelf={row.userId === user.id} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

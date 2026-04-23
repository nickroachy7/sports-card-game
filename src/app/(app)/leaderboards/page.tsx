import Link from "next/link";
import { redirect } from "next/navigation";

import { TIER_FRAME } from "@/lib/card/tiers";
import { createServerClient } from "@/lib/db/supabase";
import {
  type CardLeaderboardRow,
  getLeaderboard,
  LEADERBOARD_LABEL,
  LEADERBOARD_METRIC_LABEL,
  LEADERBOARD_TYPES,
  type LeaderboardType,
  type UserLeaderboardRow,
} from "@/lib/leaderboards/queries";
import { cn } from "@/lib/utils";

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

function UserRow({
  row,
  type,
  pinned,
  isSelf,
}: {
  row: UserLeaderboardRow;
  type: LeaderboardType;
  pinned?: boolean;
  isSelf?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 text-sm",
        pinned && "bg-[var(--surface-2)]",
        isSelf ? "font-semibold text-[var(--text)]" : "text-[var(--text-2)]",
      )}
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
        {row.metricValue.toLocaleString()} {LEADERBOARD_METRIC_LABEL[type]}
      </span>
    </li>
  );
}

/**
 * Polish spec §83 (Phase 29). Card-leaderboard row — renders a card
 * instead of a user. Format:
 *   #RANK  [PLAYER NAME · TIER]   @OWNER-TEAM   FP
 * Owner team is clickable → public profile.
 */
function CardRow({
  row,
  pinned,
  isSelf,
}: {
  row: CardLeaderboardRow;
  pinned?: boolean;
  isSelf?: boolean;
}) {
  const frame = TIER_FRAME[row.tier];
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 text-sm",
        pinned && "bg-[var(--surface-2)]",
        isSelf ? "font-semibold text-[var(--text)]" : "text-[var(--text-2)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-10 shrink-0 font-mono text-xs text-[var(--text-3)]">#{row.rank}</span>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
            style={{ borderColor: frame.fill, color: frame.fill }}
          >
            {frame.label}
          </span>
          <span className="truncate text-[var(--text)]">{row.playerName}</span>
          {row.teamAbbreviation && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              {row.teamAbbreviation}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[var(--text-3)]">·</span>
        <Link
          href={`/p/${encodeURIComponent(row.ownerTeamName)}`}
          className="shrink-0 truncate text-xs hover:text-[var(--text)]"
        >
          @{row.ownerTeamName}
        </Link>
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text)]">
        {Math.round(row.careerFp).toLocaleString()} FP
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

  const result = await getLeaderboard(type, { userId: user.id, limit: 100 });

  // Discriminate render path on `kind`. User rows link through team
  // name; card rows show tier + player + owner.
  const isCardBoard = result.kind === "card";
  const youInTop = isCardBoard
    ? result.top.some((r) => r.ownerUserId === user.id)
    : result.top.some((r) => r.userId === user.id);

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
              className={cn(
                "rounded-sm px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition",
                active
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)]",
              )}
            >
              {LEADERBOARD_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      {result.you && !youInTop && (
        <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            {isCardBoard ? "Your top card" : "Your rank"}
          </span>
          <ul className="-mx-2">
            {result.kind === "card" ? (
              <CardRow row={result.you as CardLeaderboardRow} pinned isSelf />
            ) : (
              <UserRow row={result.you as UserLeaderboardRow} type={type} pinned isSelf />
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Top {result.top.length}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            {LEADERBOARD_LABEL[type]}
          </span>
        </div>
        {result.top.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-3)]">
            No rankings yet for this board.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {result.kind === "card"
              ? result.top.map((row) => (
                  <CardRow key={row.cardId} row={row} isSelf={row.ownerUserId === user.id} />
                ))
              : result.top.map((row) => (
                  <UserRow key={row.userId} row={row} type={type} isSelf={row.userId === user.id} />
                ))}
          </ul>
        )}
      </div>
    </section>
  );
}

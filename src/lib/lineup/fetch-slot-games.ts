import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import type { SlotGameInfo } from "@/lib/lineup/types";

/**
 * Polish spec §45 (Phase 18) + §65 (Phase 22) — contest-scoped today's-
 * game lookup, shared between the Lineup page and the Collection page
 * (so the Collection page filter chips in §63 use the same source of
 * truth as the bench).
 *
 * Returns `{ cardId → SlotGameInfo }` for every card whose team has a
 * game in the provided `contestGameIds` set. Cards with no game today
 * are omitted — callers treat missing as "off-day / OFF".
 *
 * The DISTINCT ON collapses DH + BDL-duplicate rows down to one per
 * matchup, priority-sorted by status (live > scheduled > final), then
 * earliest start. `has_double_header` is a window-function derived
 * boolean (true when the matchup-date has both DH1 and DH2 in our DB);
 * the lineup-slot footer only renders "(DH1)" / "(DH2)" when true so
 * single-game matchups don't misleadingly suffix a DH marker.
 */
export async function fetchSlotGameByCardId(
  contestGameIds: string[],
  cards: Array<{ id: string; teamId: string | null }>,
): Promise<Record<string, SlotGameInfo>> {
  const out: Record<string, SlotGameInfo> = {};
  const cardTeamIds = new Set(cards.map((c) => c.teamId).filter((id): id is string => !!id));
  if (cardTeamIds.size === 0 || contestGameIds.length === 0) return out;

  type GameRow = {
    id: string;
    home_team_id: string;
    away_team_id: string;
    home_abbr: string | null;
    away_abbr: string | null;
    scheduled_start: string | null;
    status: SlotGameInfo["status"];
    home_runs: number | null;
    away_runs: number | null;
    current_inning: number | null;
    current_inning_half: "top" | "bottom" | null;
    current_outs: number | null;
    game_number: number | null;
    has_double_header: boolean;
  };

  const db = getDb();
  const gamesRes = await db.execute<GameRow>(sql`
    WITH candidates AS (
      SELECT
        g.id,
        g.home_team_id, g.away_team_id,
        g.scheduled_start, g.status, g.home_runs, g.away_runs,
        g.current_inning, g.current_inning_half, g.current_outs,
        g.game_number, g.created_at,
        (COUNT(*) OVER (PARTITION BY g.date, g.home_team_id, g.away_team_id)) > 1
          AS has_double_header
      FROM public.game g
      WHERE g.id = ANY(${sql`ARRAY[${sql.join(
        contestGameIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`})
    )
    SELECT DISTINCT ON (c.home_team_id, c.away_team_id)
      c.id,
      c.home_team_id, c.away_team_id,
      ht.abbreviation AS home_abbr,
      at.abbreviation AS away_abbr,
      c.scheduled_start, c.status, c.home_runs, c.away_runs,
      c.current_inning, c.current_inning_half, c.current_outs,
      c.game_number, c.has_double_header
    FROM candidates c
    LEFT JOIN public.team ht ON ht.id = c.home_team_id
    LEFT JOIN public.team at ON at.id = c.away_team_id
    ORDER BY
      c.home_team_id, c.away_team_id,
      CASE c.status
        WHEN 'live' THEN 0
        WHEN 'scheduled' THEN 1
        WHEN 'final' THEN 2
        ELSE 3
      END,
      c.scheduled_start NULLS LAST,
      c.game_number NULLS LAST,
      c.created_at
  `);

  const gameByTeamId = new Map<string, GameRow>();
  for (const g of gamesRes.rows) {
    gameByTeamId.set(g.home_team_id, g);
    gameByTeamId.set(g.away_team_id, g);
  }
  for (const card of cards) {
    if (!card.teamId) continue;
    const game = gameByTeamId.get(card.teamId);
    if (!game) continue;
    const isHome = game.home_team_id === card.teamId;
    out[card.id] = {
      gameId: game.id,
      playerTeamId: card.teamId,
      opponentAbbr: (isHome ? game.away_abbr : game.home_abbr) ?? "???",
      isHome,
      scheduledStart: game.scheduled_start,
      status: game.status,
      homeRuns: game.home_runs,
      awayRuns: game.away_runs,
      currentInning: game.current_inning,
      currentInningHalf: game.current_inning_half,
      currentOuts: game.current_outs,
      gameNumber: game.game_number,
      hasDoubleHeader: game.has_double_header,
    };
  }
  return out;
}

/**
 * Polish spec §69 (Phase 23). Build a `game.id → "{away}@{home}"`
 * matchup map for the Event Feed chip.
 *
 * Separate from `fetchSlotGameByCardId` because:
 *   - Event feed receives events for any contest game (including DH
 *     siblings that the DISTINCT ON collapses in the slot query).
 *   - No card join needed — this is global for the contest.
 *
 * Lives in the same module so callers that already pull slot games
 * can do both in one import. Returns `{}` if the contest has no
 * games (e.g. seed rendering, empty slate).
 */
export async function fetchGameMatchupsById(
  contestGameIds: string[],
): Promise<Record<string, string>> {
  if (contestGameIds.length === 0) return {};
  type MatchupRow = {
    id: string;
    home_abbr: string | null;
    away_abbr: string | null;
  };
  const db = getDb();
  const res = await db.execute<MatchupRow>(sql`
    SELECT
      g.id,
      ht.abbreviation AS home_abbr,
      at.abbreviation AS away_abbr
    FROM public.game g
    LEFT JOIN public.team ht ON ht.id = g.home_team_id
    LEFT JOIN public.team at ON at.id = g.away_team_id
    WHERE g.id = ANY(${sql`ARRAY[${sql.join(
      contestGameIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]::uuid[]`})
  `);
  const out: Record<string, string> = {};
  for (const row of res.rows) {
    const away = row.away_abbr ?? "???";
    const home = row.home_abbr ?? "???";
    out[row.id] = `${away}@${home}`;
  }
  return out;
}

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { createBrowserClient } from "@/lib/db/supabase-browser";

/**
 * Polish spec §22 — count of user's contest games currently in
 * `status = 'live'`. Drives the status chip's "· N games active"
 * narration.
 *
 * - Initial fetch on mount.
 * - Realtime subscription on `public.game` UPDATEs (added to the
 *   publication in migration 0027). Client-side filter to ids in
 *   `contestGameIds` — Supabase's postgres_changes subscriptions
 *   don't support SQL `IN` filters, so we subscribe broadly and
 *   match in-process.
 * - Returns { count, ready } so the consumer can distinguish "0
 *   games" from "still loading".
 */

type GameRow = {
  id: string;
  status: string;
};

export function useGamesActive(contestGameIds: string[]): { count: number; ready: boolean } {
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  // Maintain a per-game status map so UPDATE events can diff. Avoids
  // re-fetching the count on every flip.
  const statusByIdRef = useRef<Map<string, string>>(new Map());
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    if (contestGameIds.length === 0) {
      setCount(0);
      setReady(true);
      return;
    }

    const supabase = supabaseRef.current ?? createBrowserClient();
    supabaseRef.current = supabase;
    let cancelled = false;
    const idSet = new Set(contestGameIds);

    // 1) Initial fetch — one SELECT of id + status for all contest games.
    (async () => {
      const { data, error } = await supabase
        .from("game")
        .select("id, status")
        .in("id", contestGameIds);
      if (cancelled) return;
      if (error) {
        // Fail soft: don't block the chip. Leave count=0, mark ready so the
        // chip falls through to the "gamesActive=0" copy.
        setReady(true);
        return;
      }
      const map = new Map<string, string>();
      let live = 0;
      for (const row of (data ?? []) as GameRow[]) {
        map.set(row.id, row.status);
        if (row.status === "live") live += 1;
      }
      statusByIdRef.current = map;
      setCount(live);
      setReady(true);
    })();

    // 2) Realtime — UPDATE events on game. Filter client-side to contest ids.
    const channel = supabase
      .channel(`games-active-${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game" }, (payload) => {
        const next = payload.new as Partial<GameRow>;
        const id = next.id;
        const status = next.status;
        if (typeof id !== "string" || typeof status !== "string") return;
        if (!idSet.has(id)) return;
        const prev = statusByIdRef.current.get(id);
        if (prev === status) return;
        statusByIdRef.current.set(id, status);
        // Recompute count from the map — cheap (contest sizes are small).
        let live = 0;
        for (const s of statusByIdRef.current.values()) {
          if (s === "live") live += 1;
        }
        setCount(live);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [contestGameIds]);

  return { count, ready };
}

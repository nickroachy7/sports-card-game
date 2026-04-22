"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import { createBrowserClient } from "@/lib/db/supabase-browser";

/**
 * Polish spec §30 — Realtime subscription on `public.card` UPDATEs.
 *
 * Fires only on contract_plays_remaining decrements (i.e., a play
 * was used). Other UPDATE paths (token application, tier bump,
 * vault flag) are ignored — this hook's semantic is strictly "a
 * rostered card just burned a play."
 *
 * Separate from <LiveEventsProvider>'s event stream because the
 * table + event type + key are all different. Pattern matches
 * useGamesActive from Phase 12.
 *
 * Return shape: `latestDepleteByCardId: Map<cardId, { at: number;
 * newPlays: number }>`. Keyed on the update's receive timestamp so
 * back-to-back decrements trigger fresh glow animations via the
 * consumer's keyed `<AnimatePresence>`.
 */

type CardRow = {
  id: string;
  contract_plays_remaining?: number;
};

export type ContractDeplete = {
  /** Client-local timestamp (Date.now()). Keys the animation. */
  at: number;
  /** New contract_plays_remaining after the decrement. */
  newPlays: number;
};

const ContractEventsContext = createContext<Map<string, ContractDeplete> | null>(null);

type ProviderProps = {
  rosteredCardIds: string[];
  children: ReactNode;
};

/**
 * Mount once at the LineupView level post-submit. Owns the single
 * Realtime channel on `public.card` UPDATEs and exposes the
 * per-card latest-deplete map via `useCardDepleteEvent(cardId)`.
 * Mirrors the <LiveEventsProvider> pattern from Phase 12.
 */
export function CardContractEventsProvider({ rosteredCardIds, children }: ProviderProps) {
  const [latestDepleteByCardId, setLatest] = useState<Map<string, ContractDeplete>>(
    () => new Map(),
  );
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    if (rosteredCardIds.length === 0) return;

    const supabase = supabaseRef.current ?? createBrowserClient();
    supabaseRef.current = supabase;
    const idSet = new Set(rosteredCardIds);

    const channel = supabase
      .channel(`card-contract-${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "card" }, (payload) => {
        const next = payload.new as CardRow;
        const prev = payload.old as CardRow;
        const id = next.id;
        if (typeof id !== "string" || !idSet.has(id)) return;

        const newPlays = next.contract_plays_remaining;
        const oldPlays = prev.contract_plays_remaining;
        if (typeof newPlays !== "number" || typeof oldPlays !== "number") return;
        // Only fire on decrements. Ignore no-ops + other-column
        // UPDATEs that happen to touch this row (token apply,
        // tier bump, vault, etc.).
        if (newPlays >= oldPlays) return;

        setLatest((prev) => {
          const copy = new Map(prev);
          copy.set(id, { at: Date.now(), newPlays });
          return copy;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rosteredCardIds]);

  return (
    <ContractEventsContext.Provider value={latestDepleteByCardId}>
      {children}
    </ContractEventsContext.Provider>
  );
}

/**
 * Latest contract-deplete event for a card, or null. Safely returns
 * null outside the provider (LineupSlot renders in every state, but
 * the provider only mounts post-submit — same posture as
 * useLatestPlayerEvent).
 */
export function useCardDepleteEvent(cardId: string | null | undefined): ContractDeplete | null {
  const ctx = useContext(ContractEventsContext);
  if (!ctx || !cardId) return null;
  return ctx.get(cardId) ?? null;
}

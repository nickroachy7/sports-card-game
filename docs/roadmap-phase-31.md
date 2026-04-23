# Draft Deck — Phase 31 Roadmap (v1.18 — Baserunners + pitcher-on-mound)

**Goal:** Close the final live-game polish gap for v1: visualize
baserunners in the live slot footer + surface the current pitcher's
name on hitter slots whose team is batting.

**Estimated effort:** ~2–3 days.

**Prerequisites:**

- Phase 20's `current_inning` + `inning_half` tracking.
- Phase 22's `current_outs` tracking + idempotent webhook UPDATEs.
- Realtime subscription on `public.game` already wired in
  `LiveEventsProvider`.

---

## Milestones

| ID    | Milestone                                     | Target    | Outcome |
|-------|-----------------------------------------------|-----------|---------|
| P31.1 | Migration 0038 (baserunner + pitcher columns) | 0.15 day  | New columns on `public.game`. |
| P31.2 | Webhook handler: parse runners + pitcher      | 0.50 day  | `handleGameEvent` updates new columns idempotently. |
| P31.3 | SlotGameInfo + lineup page query              | 0.30 day  | Types extended; `fetchSlotGameByCardId` LEFT-JOINs pitcher name. |
| P31.4 | BaserunnerDiamond SVG component               | 0.30 day  | Mini diamond icon renders in LIVE slot footer. |
| P31.5 | Pitcher-on-mound UI                           | 0.30 day  | `vs [Pitcher]` label on hitter slots whose team is batting. |
| P31.6 | Verify + deploy + ADR-0033                    | 0.20 day  | Typecheck/lint/build, deploy, retro. |

---

## P31.1 — Migration 0038

```sql
-- 0038_baserunners_and_pitcher.sql
-- Polish spec §91 + §92 (Phase 31). Live tracking columns for
-- the three bases + current pitcher. All NULL when status != 'live'.

ALTER TABLE public.game
  ADD COLUMN baserunner_first uuid REFERENCES public.player(id) ON DELETE SET NULL,
  ADD COLUMN baserunner_second uuid REFERENCES public.player(id) ON DELETE SET NULL,
  ADD COLUMN baserunner_third uuid REFERENCES public.player(id) ON DELETE SET NULL,
  ADD COLUMN pitcher_player_id uuid REFERENCES public.player(id) ON DELETE SET NULL;
```

No backfill needed — all live-state columns populate as games
progress.

---

## P31.2 — Webhook handler

### T31.2.1 Extract runner state from payload

BDL webhook payloads include a `play.runners` array (or similar — verify via `src/lib/mlb/webhook-handler.ts` + BDL SDK types). Each runner element has a `base` ("first" / "second" / "third") and a `player_id`.

```ts
type RunnerState = {
  first: string | null;   // player_id
  second: string | null;
  third: string | null;
};

function extractRunners(payload: WebhookPayload): RunnerState {
  const runners = payload.play?.runners ?? [];
  return {
    first: runners.find(r => r.base === "first")?.player_id ?? null,
    second: runners.find(r => r.base === "second")?.player_id ?? null,
    third: runners.find(r => r.base === "third")?.player_id ?? null,
  };
}
```

### T31.2.2 Extract pitcher from payload

Pitcher identity comes from `payload.play?.pitcher?.id` (verify BDL naming). If the play event has no pitcher (rare), leave column unchanged.

### T31.2.3 Idempotent UPDATE

Extend `handleGameEvent`'s existing UPDATE statement (polish spec §64's idempotent pattern) to include the four new columns. Use `IS DISTINCT FROM` on each so no-op updates don't fire.

```sql
UPDATE public.game
SET
  current_inning = ...,
  current_inning_half = ...,
  current_outs = ...,
  baserunner_first = ${runners.first},
  baserunner_second = ${runners.second},
  baserunner_third = ${runners.third},
  pitcher_player_id = ${pitcherPlayerId},
  updated_at = now()
WHERE id = ...
  AND (...IS DISTINCT FROM... chain...)
```

### T31.2.4 Clear on game end

`handleGameEnded` NULLs the four new columns (same pattern as `current_outs`).

---

## P31.3 — Types + query

### T31.3.1 SlotGameInfo extension

```ts
type SlotGameInfo = {
  // existing fields...
  baserunnerFirst: string | null;   // player_id
  baserunnerSecond: string | null;
  baserunnerThird: string | null;
  pitcherPlayerId: string | null;
  pitcherName: string | null;       // joined from public.player
};
```

### T31.3.2 fetchSlotGameByCardId LEFT JOIN

Extend the existing query with a join on `public.player` keyed on `pitcher_player_id` to pull `pitcher_name`. Other three (baserunners) stay as raw player_ids — identity isn't shown to the user; the UI only cares whether the base is occupied.

---

## P31.4 — BaserunnerDiamond SVG

New component `src/components/lineup/BaserunnerDiamond.tsx`:

```tsx
type Props = { first: boolean; second: boolean; third: boolean };

export function BaserunnerDiamond({ first, second, third }: Props) {
  return (
    <svg viewBox="0 0 16 16" className="inline-block size-3.5">
      {/* Home plate */}
      <rect x="6" y="12" width="4" height="4" fill="currentColor" opacity="0.3" />
      {/* Diamond diagonals */}
      <path d="M8 0 L16 8 L8 16 L0 8 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      {/* Base squares */}
      <rect x="13" y="6" width="3" height="3" fill={first ? "currentColor" : "none"} stroke="currentColor" strokeWidth="0.5" />
      <rect x="6.5" y="-0.5" width="3" height="3" fill={second ? "currentColor" : "none"} stroke="currentColor" strokeWidth="0.5" />
      <rect x="0" y="6" width="3" height="3" fill={third ? "currentColor" : "none"} stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}
```

Render inside `<SlotGameState>` LIVE branch when any base is occupied. Position: after the outs indicator, before the score.

---

## P31.5 — Pitcher-on-mound UI

Inside `<SlotGameState>` LIVE variant:

```tsx
{info.pitcherName && isHitter && isBattingHalf && (
  <span className="text-[9px] font-mono text-[var(--text-3)] whitespace-nowrap">
    vs {info.pitcherName}
  </span>
)}
```

`isHitter` = slot position is not SP1/SP2.

`isBattingHalf` = `(isHome && inning_half === "bottom") || (!isHome && inning_half === "top")`

The line renders as a small secondary row under the main LIVE pill, or inline if space permits.

---

## P31.6 — Verify + deploy + ADR

- `pnpm typecheck / lint / build` clean.
- Manual QA with a live game: baserunners diamond updates as runners advance, pitcher-on-mound shows for batting team.
- Migration 0038 applies clean to prod.
- `vercel --prod --yes`.
- ADR-0033 retro.

---

## Dependencies

```
P31.1 (migration 0038)  ──► P31.2 (webhook handler)
P31.2 (webhook handler) ──► P31.3 (query join)
P31.3 (types + query)   ──► P31.4 (BaserunnerDiamond)
                        ──► P31.5 (pitcher-on-mound)
                                   │
                                   ▼
                             P31.6 (verify + deploy + ADR)
```

Single-commit phase is feasible since all slices are tightly coupled.

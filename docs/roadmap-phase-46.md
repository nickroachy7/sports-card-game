# Draft Deck — Phase 46 Roadmap (v1.31 — Sticky lineups)

**Goal:** Each slate's lineup carries forward to the next slate
by default. Per-slot pin toggle lets users mark "one-shot"
slots that drop after today. Smart-auto fills empty slots
from the bench when a sticky player isn't playing.

Core intent (user):
> "It's not really drafting every day, it's setting your
> lineup every day. Auto setting or manual setting, but also
> giving control over individual players."

**Estimated effort:** ~0.6 day.

---

## Milestones

| ID    | Milestone                                              | Target    |
|-------|--------------------------------------------------------|-----------|
| P46.1 | Migration 0057 — `contest_lineup_slot.is_sticky`       | 0.03 day  |
| P46.2 | Migration 0058 — `create_contest_entry` carry-over     | 0.20 day  |
| P46.3 | Smart-auto fallback hook for empty sticky slots        | 0.10 day  |
| P46.4 | `toggleSlotSticky` Server Action + SQL helper          | 0.05 day  |
| P46.5 | Pin icon on `LineupSlot` + click handler               | 0.10 day  |
| P46.6 | Plumb `isSticky` through `LineupSlotVM` + page query   | 0.04 day  |
| P46.7 | Verify / lint / build / push + ADR-0046                | 0.08 day  |

---

## Notes

- **P46.1** — column adds with `DEFAULT true` so all existing
  rows are sticky retroactively. New rows inherit. No backfill
  query needed beyond DEFAULT.
- **P46.2** — rewrite of `public.create_contest_entry()`:
  1. After upserting today's entry + slots (existing behavior),
     find the user's most recent prior entry whose
     `contest.starts_at < today's contest's starts_at` AND
     has at least one slot with `starter_card_id IS NOT NULL`,
     within a 7-day lookback window.
  2. For each prior slot, attempt carry-over per §173:
     skip if not sticky; skip if card no longer playable;
     fill if player has a game today; leave empty if player
     has no game (sticky preserved).
  3. Idempotent: only writes if today's slot is NULL — won't
     stomp a slot the user has already filled today.
- **P46.3** — smart-auto already exists for the existing
  `auto_sub_mode = 'smart_auto'` case. Hook into the same
  path but keyed on "sticky empty slot" instead of "ineligible
  starter at game time."
- **P46.5** — pin icon location TBD during implementation
  (top-right corner of slot, ~12px). Lucide-react `Pin` /
  `PinOff`. Sticky = filled gold; one-shot = outlined muted.

---

## Files touched

- `supabase/migrations/0057_slot_is_sticky.sql` — NEW
- `supabase/migrations/0058_create_entry_carry_over.sql` — NEW
- `src/app/actions/lineup.ts` — `toggleSlotSticky` action
- `src/components/lineup/LineupSlot.tsx` — pin icon
- `src/lib/lineup/types.ts` — `LineupSlotVM.isSticky`
- `src/app/(app)/lineup/page.tsx` — select `is_sticky` in slot query

---

## Carry-over flow diagram

```
4 AM ET — slate rolls over
   ↓
User loads /lineup at 9 AM
   ↓
create_daily_contest()  — gets today's contest_id (existing)
   ↓
create_contest_entry(user, contest_id)
   ├─ Upsert today's entry + 10 empty slots (existing)
   └─ NEW: carry-over from yesterday's entry
       FOR each yesterday-slot with is_sticky = true:
         IF card still owned + unvaulted + not expired:
           IF player has game today:
             today's-slot.starter_card_id = yesterday-slot.starter_card_id
             today's-slot.is_sticky = true
           ELSE:
             today's-slot.starter_card_id = NULL
             today's-slot.is_sticky = true
             (smart-auto may fill via existing flow)
         ELSE:
           today's-slot stays empty (default)
   ↓
release_stale_contest_holds(user, today's contest_id)  — existing
   ↓
Render lineup — user sees yesterday's lineup pre-filled
```

---

## Edge cases handled

- **Sticky card was vaulted overnight** — slot empties; sticky
  preserved on empty slot for next-day's carry-over attempt
  (which will also skip since no card).
- **Sticky card was sold (quick-sell)** — same as vault.
- **Sticky card has 0 plays remaining (expired)** — skipped.
- **User skipped a day** — carry from the most recent prior
  entry with filled slots, up to 7 days back.
- **Slot is already filled today** (user loaded /lineup mid-day
  yesterday and filled today's slot manually) — carry-over
  skips that slot to avoid stomp.
- **Prior entry doesn't exist** (brand-new user) — no
  carry-over; today's entry stays empty as before.

---

## Out of scope

- Notification / banner about carry-over results.
- Per-card sticky default.
- Lookback > 7 days.
- Token carry-over (tokens consume daily per Phase 41).
- Animated pin toggle.

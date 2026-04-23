# Draft Deck — Phase 29 Roadmap (v1.16 — Leaderboards + profile drawer)

**Goal:** Close the remaining launch-path gaps on leaderboards
+ profile. Cards leaderboard reworked to rank cards. Profile
drawer wired up with quick links to team + account settings
(both new pages).

**Estimated effort:** ~1 day.

**Prerequisites:**

- Existing `/leaderboards` page + 3 user leaderboards.
- `manager_account` schema + writes from game events.
- `profile` table with team_name, colors, logo_id, is_public.

---

## Milestones

| ID    | Milestone                                 | Target   | Outcome |
|-------|-------------------------------------------|----------|---------|
| P29.1 | Cards leaderboard rework                  | 0.25 day | Ranks individual cards by career_fp, new row shape, owner link. |
| P29.2 | ProfileDrawer component                   | 0.15 day | Slide-in from right, shows team + stats + links. |
| P29.3 | Header wiring (badge → drawer)            | 0.05 day | Manager badge click opens drawer. |
| P29.4 | Team customization page                   | 0.20 day | `/settings/team` with name + colors + logo edit. |
| P29.5 | Account settings page                     | 0.15 day | `/settings/account` with email read + password change. |
| P29.6 | Verify + deploy + ADR-0031                | 0.10 day | Typecheck/lint/build, deploy, retro. |

---

## P29.1 — Cards leaderboard rework

### T29.1.1 Types + enum rename

`src/lib/leaderboards/queries.ts`:
- Rename `"card-prestige"` → `"cards"` in `LEADERBOARD_TYPES`.
- Update display label: `"Card Prestige"` → `"Cards"`.
- Update unit label: `"Diamonds"` → `"FP"`.
- Add discriminated-union row types:
  ```ts
  type UserLeaderboardRow = {
    kind: "user";
    rank; userId; teamName; managerLevel; metricValue;
  };
  type CardLeaderboardRow = {
    kind: "card";
    rank;
    cardId;
    playerName;
    tier;
    teamAbbreviation: string | null; // MLB team
    careerFp: number;
    ownerUserId;
    ownerTeamName;
  };
  type LeaderboardRow = UserLeaderboardRow | CardLeaderboardRow;
  ```

### T29.1.2 Card-shaped query

Replace the card-prestige case in `getLeaderboard`:
```sql
SELECT
  c.id AS card_id,
  p.full_name AS player_name,
  c.current_tier AS tier,
  t.abbreviation AS team_abbreviation,
  c.career_fp_total AS metric_value,
  c.user_id AS owner_user_id,
  prof.team_name AS owner_team_name,
  RANK() OVER (ORDER BY c.career_fp_total DESC) AS rank
FROM public.card c
JOIN public.player p ON p.id = c.player_id
LEFT JOIN public.team t ON t.id = p.team_id
JOIN public.profile prof ON prof.user_id = c.user_id AND prof.is_public = true
WHERE c.career_fp_total > 0
ORDER BY c.career_fp_total DESC
LIMIT 100;
```

- No tier filter (any tier).
- No vault filter (vaulted + unvaulted; both count — vaulted cards
  preserve their career_fp in the `card` table before ceremony,
  and vaulted-mid-season cards stay in `card` with `is_vaulted =
  true`). Ceremony-committed cards that moved to `vault_entry`
  aren't in `card` anymore — Phase 29 doesn't cover them (deferred
  until we have a clear UX for displaying them here).
- `career_fp_total > 0` filters out un-played cards so the board
  starts populated once anyone plays a card.

### T29.1.3 "Your Rank" for cards

For a user's "your rank," pick their highest-FP card and compute
its rank in the global card list. If outside top 100, return it as
`you` alongside `top`.

### T29.1.4 API route update

`src/app/api/leaderboards/[type]/route.ts`: update type validation
to accept the new `"cards"` string. Ensure the response shape
handles both unions.

### T29.1.5 Leaderboard page render

`src/app/(app)/leaderboards/page.tsx`: detect row `kind` and
switch render template:
- `kind: "user"` → existing Row component.
- `kind: "card"` → new CardRow: `[rank] [player name · tier chip
  · MLB team] — @[owner team clickable] — [fp] FP`

---

## P29.2 — ProfileDrawer component

### T29.2.1 Component scaffolding

New file `src/components/layout/ProfileDrawer.tsx`:
```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" className="w-80">
    <SheetHeader>
      <SheetTitle>{teamName}</SheetTitle>
    </SheetHeader>
    <TeamIdentityBlock ... />
    <ManagerLevelBlock level={...} xp={...} />
    <CareerStatsBlock ... />
    <QuickLinks>
      <Link href="/settings/team">Team customization</Link>
      <Link href="/settings/account">Account settings</Link>
      <SignOutButton />
    </QuickLinks>
  </SheetContent>
</Sheet>
```

### T29.2.2 Data source

The drawer receives props from header (which already fetches
manager_account + profile data in `(app)/layout.tsx`). Pass
through:
- teamName, primaryColor, secondaryColor, teamLogoId
- managerLevel, managerXp
- lifetimeFp, lifetimeContestsWon, lifetimeDiamondCardsVaulted,
  lifetimeTokensTriggered

### T29.2.3 Sign-out

Server action `src/app/actions/auth.ts` `signOut()` — calls
`supabase.auth.signOut()` + `redirect("/signin")`.

---

## P29.3 — Header wiring

Update `src/components/layout/header.tsx`:
- Manager badge becomes a button.
- Click opens `<ProfileDrawer>` (state lifted into a client
  wrapper if header is server).

If header is a server component, add a small client wrapper
`<ProfileDrawerTrigger>` that holds the drawer state + trigger
button, rendered inside the header.

---

## P29.4 — Team customization page

### T29.4.1 Route scaffold

`src/app/(app)/settings/team/page.tsx`:
- Server component fetches current profile.
- Renders `<TeamSettingsForm>` (client component) with current
  values as defaults.

### T29.4.2 Form fields

- Team name (input, max 20 chars, uniqueness via server action
  on blur or submit)
- Primary color (color picker — hex input or preset swatches)
- Secondary color (same)
- Logo (radio/grid picker from `TEAM_LOGOS` constant — reuse
  whatever onboarding uses)

### T29.4.3 Server Action

`updateTeamProfile({ teamName, primaryColor, secondaryColor,
teamLogoId })`:
- Zod validation
- Uniqueness check on team_name (if changed)
- Update `public.profile` for current user
- Return ok/error
- Client triggers `router.refresh()` on success

---

## P29.5 — Account settings page

### T29.5.1 Route scaffold

`src/app/(app)/settings/account/page.tsx`:
- Server component reads user email from Supabase.
- Renders:
  - Email block (read-only display)
  - `<ChangePasswordForm>` (client component)

### T29.5.2 Change password server action

`changePassword({ currentPassword, newPassword })`:
- Re-authenticate via `supabase.auth.signInWithPassword({ email,
  password: currentPassword })` to verify current.
- If OK, call `supabase.auth.updateUser({ password: newPassword })`.
- Return ok or error.

### T29.5.3 Form UX

- Fields: current password, new password, confirm new password
- Client-side match check on confirm
- Server-side error displayed via toast
- Reset form + success toast on completion

---

## P29.6 — Verify + deploy + ADR

- `pnpm typecheck / lint / build` clean
- Manual QA: open drawer, click each link, edit team, change
  password, click Cards tab on leaderboards, see card rows,
  click an owner to navigate to their public profile.
- `vercel --prod --yes`
- Commit in logical chunks: P29.1 (card leaderboard) + P29.2+3
  (drawer + header) + P29.4 (team page) + P29.5 (account page)
- ADR-0031 retro

---

## Dependencies

```
P29.1 (cards leaderboard) ──► independent
P29.2 (ProfileDrawer)     ──► P29.3 (header wiring)
P29.4 (team page)         ──► P29.2 (drawer link target)
P29.5 (account page)      ──► P29.2 (drawer link target)
                                   │
                                   ▼
                              P29.6 (verify + deploy + ADR)
```

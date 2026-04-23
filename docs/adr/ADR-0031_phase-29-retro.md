# ADR-0031 — Phase 29 (Leaderboards + Profile drawer) Retrospective

**Status:** Accepted · **Date:** 2026-04-23
**Phase:** Phase 29 (v1.16)
**Companion specs:** `draft-deck-polish-spec.md` §83–§87,
`docs/roadmap-phase-29.md`.

---

## Context

User asked to return to launch-path work after 6 phases of
lineup polish (P23–P28). A survey of the specs + codebase
showed most of the leaderboards + public profile surface
was already built — the real gaps were:

- Cards leaderboard metric felt off (user feedback: "no
  cards appearing even though one of my cards has FP,"
  + rename to "Cards", include vaulted + unvaulted).
- Profile drawer in the header had a shell but was
  missing the XP progress bar + quick links to team /
  account settings.
- Team customization + account settings pages didn't
  exist at all.

## Decision

Five coordinated changes. No new tables / migrations —
all existing schema supported the work.

- **§83 Cards leaderboard rework.** Rename
  `card-prestige → cards`. Rework the data shape: rows
  are now individual cards (not users). Discriminated-
  union row types (`kind: "user" | "card"`) so the one
  API + page handle both shapes. Rank by `career_fp DESC`
  across any tier + any vault status, filtered to
  `career_fp > 0`. "Your rank" on this board surfaces the
  user's highest-FP card's global rank.
- **§84 ProfileDrawer polish.** Added the XP progress bar
  (thresholds mirrored from the economy_config seed into
  a TS constant) + quick links to the two settings pages.
  Controlled open state so nav links close the drawer
  cleanly before navigation fires.
- **§85 Team customization page** (`/settings/team`) —
  server page + client form reusing the onboarding zod
  schema (`updateTeamProfileSchema` is an alias). Preset
  color swatches + custom hex input + logo picker. Live
  identity preview at the top. Team name uniqueness
  enforced by the DB's unique constraint with 23505
  caught and surfaced as `CONFLICT`.
- **§86 Account settings page** (`/settings/account`) —
  minimal v1: email display (read-only) + change-password
  form. Re-authentication guard: we call
  `signInWithPassword({ email, currentPassword })` before
  `updateUser({ password: newPassword })` so a stolen
  session token can't pivot to a password reset.

## What shipped

| Slice | Commit | Delivers |
|---|---|---|
| Plan | `061a4321` | Polish spec §83–§87 + roadmap. |
| P29.1–P29.5 | *(one commit, ~8 files)* | All five code changes — Cards leaderboard rework + ProfileDrawer polish + two new settings pages + level-threshold helper. |
| P29.7 | *(this)* | ADR-0031. |

Deploy: `draft-deck-l21apbye6-nickroachy7s-projects.vercel.app` → READY.

Prod verification:
- `/leaderboards?type=cards` renders card rows with tier
  chip + player + owner team.
- ProfileDrawer shows XP progress bar + two settings links.
- `/settings/team` edits persist, team name uniqueness
  enforced.
- `/settings/account` change-password flow rejects wrong
  current password and accepts correct.

## What went well

1. **Survey before build.** Spent ~400 words sketching
   what exists vs what's missing before writing any code.
   Found 85% of the leaderboard surface already built; the
   phase scope collapsed from "build feature from scratch"
   to "close targeted gaps." Survey saved ~half a day of
   duplicate work.
2. **Discriminated-union row types.** Instead of an
   optional-everything row shape or two parallel APIs, a
   `kind: "user" | "card"` discriminator kept the types
   clean + the API + page each handle both naturally.
3. **Reusing `updateTeamProfileSchema = onboardingSchema`.**
   Same validation as onboarding; zero drift between the
   two surfaces. If we add a new field to team identity
   later, both surfaces inherit.
4. **XP thresholds mirrored to TS, not fetched.** Using a
   `MANAGER_XP_LEVEL_THRESHOLDS` constant alongside
   `computeLevelProgress()` avoids a DB round-trip for
   every drawer render. Clear comment notes the source-
   of-truth obligation.
5. **Re-auth guard on password change.** The standard
   Supabase `updateUser({ password })` doesn't require
   the current password, which would be exploitable from
   a stolen session. Re-sign-in with the current password
   first closes that gap.

## What surprised us

1. **Card Prestige wasn't just renamed — it was the wrong
   shape entirely.** User feedback said "rename + include
   vaulted + unvaulted." Initial read: tweak the WHERE
   clause. After interview follow-up: the user actually
   wanted a community-wide card ranking ("the best owned
   cards are"). That's a completely different leaderboard
   shape (cards, not users). The rename hinted at the
   shift; the real intent required one more question.
2. **ProfileDrawer already existed with more than I
   thought.** Initial survey report said "no profile
   drawer implemented"; actually the drawer component
   existed with sign-out + basic career stats. I built on
   it rather than from scratch. Saved an hour.
3. **economy_config thresholds stored as JSONB.** The
   level curve is `manager_xp_sources.level_thresholds`
   — an array inside a JSONB column. Easy to read server-
   side but clunky for a client-side progress bar.
   Mirrored to TS was the pragmatic answer.

## What we deliberately simplified

1. **Account page = email + password only.** No email
   change, OAuth link management, or account deletion.
   The last is prohibited by safety rules anyway; the
   other two are post-launch.
2. **Card leaderboard excludes ceremony-committed cards
   in `vault_entry`.** They don't have a `card_id` after
   `commit_vault_selection` runs, so joining them would
   need a different row shape. Commented note; virtually
   all career FP this early in v1 lives on in-table
   cards anyway.
3. **Logo picker shows the logo ID as text.** No actual
   artwork. Consistent with onboarding; both can iterate
   when logo assets ship.
4. **Threshold array duplicated between SQL seed + TS.**
   If the thresholds ever change, both sides need
   updating. Small operational cost; avoids a DB fetch
   on every drawer render.
5. **No "View my public profile" link in the drawer.**
   User explicitly skipped it. Public profile page at
   `/p/[teamName]` still exists and is linkable from
   leaderboard rows.

## What's ready for the next polish pass

- **Discriminated-union leaderboard types** — any future
  non-user board (e.g. top teams, top tokens-triggered
  cards) composes in by adding a new `kind` branch.
- **Level threshold mirror pattern** — the approach works
  for any economy_config constant that a client surface
  needs. Next candidates: coin prices, quick-sell values.
- **Settings page shape** — `/settings/team` and
  `/settings/account` establish the layout pattern
  (header + description + sectioned forms). Future
  settings (notifications, etc.) slot in next to them.

## Open items

1. **Onboarding flow pass** — still the largest parked
   item. User's "email/password + team setup" flow works
   but hasn't had polish since Phase 3.
2. **Empty / error state sweep** — recurring parked item.
   `/leaderboards?type=cards` with zero cards, no public
   profiles, a contest with no games, etc.
3. **Ceremony vault-entry inclusion** in cards
   leaderboard — the vault_entry table preserves
   historical cards but schema forces a different shape.
4. **Logo artwork** — picker currently shows IDs as text.
5. **Profile drawer: public-profile link** — user
   skipped this phase but may want it later.
6. **Baserunners + pitcher-on-mound** — lineup polish
   parked.
7. **Deep sidebar reorganization** — parked.
8. **Standard parked items.**

## Estimate vs reality

Estimate: ~1 day. Shipped in ~45 minutes of code + one
~2-minute deploy. Survey-before-build saved the bulk of
the time since most infrastructure already existed. Zero
hotfixes, zero rollbacks.

## Consequences

- Cards leaderboard now populates as soon as any user
  plays any card. Users can see which cards are
  performing best across the community, regardless of
  who owns them. Owner links route to the public profile.
- ProfileDrawer is feature-complete for v1: team
  identity, XP progress, career stats, settings links,
  sign out.
- Users can edit their team identity + password from the
  app without dev intervention. Previously onboarding
  was the only surface that touched these values.
- The launch-path is one step shorter. Onboarding + empty
  states are now the remaining big rocks.

## Related ADRs

- ADR-0030 — Phase 28 Retrospective. Shipped the
  flow-based lineup layout; P29 does the same "let the
  app flow, no canvas" shape for settings pages.
- ADR-0023 — Phase 18. First contest-lifecycle work that
  populated `manager_account` stats; P29's drawer
  surfaces those stats to the user for the first time.

# Draft Deck — Phase 37 Roadmap (v1.22 — Remove-from-slot + token tooltips)

**Goal:** Two small lineup-polish asks.

1. One-click × button to remove a starter from a lineup slot.
2. Hover tooltips on tokens (tray + applied) showing name,
   bonus FP, and trigger rule.

**Estimated effort:** ~0.3 day.

---

## Milestones

| ID    | Milestone                                       | Target    |
|-------|-------------------------------------------------|-----------|
| P37.1 | Tooltip UI primitive                            | 0.05 day  |
| P37.2 | `TokenTooltipContent` shared block              | 0.05 day  |
| P37.3 | Wrap TrayTokenPip + AppliedTokenBadge           | 0.05 day  |
| P37.4 | Remove-from-slot × button in LineupSlot         | 0.10 day  |
| P37.5 | Verify / lint / build / deploy + ADR-0037       | 0.05 day  |

---

## Notes

- P37.1: copy the shadcn Tooltip structure using `radix-ui`'s
  `Tooltip` module (umbrella already installed). Use real
  project tokens (`var(--surface-2)`, `var(--text)`) so the
  P36 `bg-background` regression doesn't repeat.
- P37.2: reuse `TOKEN_LONG_LABEL` + `tokenRuleText()` from
  `src/lib/token/display.ts`.
- P37.4: remove handler wires to existing
  `handleCardDropped(position, null, null)` in LineupView —
  nothing new server-side.
- Gate the × button on `!slot.locked` so post-started slots
  keep their lock icon and stay read-only.

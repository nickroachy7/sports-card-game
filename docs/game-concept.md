# Sports Card Game — Concept

A fantasy sports collection and management game where users pull packs, play cards in lineups, level them up through real-world fantasy performance, and curate a personal vault of their best cards.

## Core Loop

1. **Pull packs** → get player cards.
2. **Play cards in a lineup** → the card earns points equal to the fantasy points that player scores in their real game.
3. **Level up** the card as it accumulates points.
4. **Quick sell** for coins (higher tier = higher sell price) **or vault** the card to keep it permanently.
5. **Spend coins** on more packs. Repeat.

## Cards

### Tiers
- Each card has ~4–5 tiers it can progress through based on total fantasy points recorded on that card.
- For now, leveling up a tier only changes the **border** of the card visually.
- The card displays both its **current tier** and its **total points accumulated** — both are visible flex stats.

### Contracts
- Every card has a limited number of **contracts**.
- Playing a card in a game **uses one contract**.
- When contracts run out, the card can no longer be played — the user must decide: **quick sell** or **vault**.
- This forces strategic decisions about *which* games to play each card in (don't burn contracts on bad matchups).

### Quick Sell
- Quick sell price is determined by the card's **tier**.
- Selling returns **coins** to the user's team balance.

## Coins
- Team-level currency.
- Earned from quick-selling cards.
- Spent on packs.

## Collection
- The **Collection page** shows every card the user owns.
- (Name may change later.)

## Vault
- The user can **vault up to 10 cards per season** (e.g., one full NFL season = 10 vault slots).
- Vaulted cards are kept permanently as collectibles — the user is opting to *not* quick sell them.
- These are the cards the user wants to **show off** on their vault/profile page.
- Example flex: "highest-tier, highest-points Joel Embiid in the world" — a friend visits the vault and sees a card the user played perfectly for 10 games, maxed out in tier and points, then vaulted when contracts ran out.

## Strategic Tension

The game revolves around three intertwined decisions the user must balance:

- **When to play a card** — contracts are finite, so every start has opportunity cost.
- **When to quick sell** — more coins now vs. waiting for a higher tier.
- **When to vault** — only 10 slots per season, so vaulting is the ultimate commitment.

## Not in Scope Yet
- Profile page design (vault display lives there eventually, but skip for now).
- Anything beyond the basic vault-10-per-season mechanic.

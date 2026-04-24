import type { Metadata } from "next";

import { Card, type CardSize, type CardViewModel } from "@/components/card/Card";
import { TIER_PLAY_BUDGET } from "@/lib/card/tiers";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";

import { DissolveDemo } from "./dissolve-demo";
import { PackRevealDemo } from "./pack-reveal-demo";
import { TokenPaletteDemo } from "./token-demo";

export const metadata: Metadata = {
  title: "Palette · Draft Deck",
  description: "Design-token smoke test for the Draft Deck theme.",
};

type Swatch = {
  token: string;
  hex: string;
  role: string;
};

const baseSwatches: Swatch[] = [
  { token: "--bg", hex: "#1A1816", role: "Page background" },
  { token: "--surface", hex: "#24211E", role: "Panels, sidebar" },
  { token: "--surface-2", hex: "#2E2B27", role: "Elevated surfaces, hover" },
  { token: "--border", hex: "#3A3631", role: "Dividers, card outlines" },
  { token: "--text", hex: "#F5F1E8", role: "Primary text (cream)" },
  { token: "--text-2", hex: "#C9C3B5", role: "Secondary text" },
  { token: "--text-3", hex: "#8A8478", role: "Tertiary / helper" },
  { token: "--muted", hex: "#5E584F", role: "Disabled, placeholder" },
];

const tierSwatches: Swatch[] = [
  { token: "--tier-bronze", hex: "#A57248", role: "Bronze frame" },
  { token: "--tier-silver", hex: "#C5C0B8", role: "Silver frame" },
  { token: "--tier-gold", hex: "#D4A647", role: "Gold frame" },
  { token: "--tier-diamond", hex: "#A8DDE2", role: "Diamond frame" },
];

const TIERS: CardTier[] = ["bronze", "silver", "gold", "diamond"];
const SIZES: CardSize[] = ["small", "medium", "large"];

function mockCard(
  tier: CardTier,
  overrides: Partial<CardViewModel> & { longName?: boolean } = {},
): CardViewModel {
  const { longName, ...rest } = overrides;
  return {
    id: `mock-${tier}-${longName ? "long" : "short"}`,
    playerName: longName ? "Paul Goldschmidt Jr." : "Jose Caballero",
    position: "Shortstop",
    teamAbbreviation: "NYY",
    tier,
    careerFp: 1247,
    contractPlays: 12,
    contractMax: TIER_PLAY_BUDGET[tier],
    playerStatus: "active" as PlayerStatus,
    isExpired: false,
    hasAppliedToken: false,
    photoUrl: null,
    ...rest,
  };
}

function SwatchCard({ swatch }: { swatch: Swatch }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div
        className="h-16 w-full rounded-md border border-[var(--border)]"
        style={{ backgroundColor: `var(${swatch.token})` }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-0.5">
        <code className="font-mono text-sm text-[var(--text)]">{swatch.token}</code>
        <code className="font-mono text-xs text-[var(--text-3)]">{swatch.hex}</code>
        <span className="text-xs text-[var(--text-2)]">{swatch.role}</span>
      </div>
    </div>
  );
}

export default function PalettePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-sans text-3xl font-bold tracking-tight">Draft Deck · Palette</h1>
        <p className="mt-2 text-[var(--text-2)]">
          Smoke test for the charcoal + cream tokens (UI/UX spec §2.1) and the Inter / JetBrains
          Mono font pairing loaded via{" "}
          <code className="font-mono text-[var(--text)]">next/font</code>.
        </p>
      </header>

      <section aria-labelledby="base-heading" className="mb-10">
        <h2 id="base-heading" className="mb-4 text-xl font-semibold">
          Base (charcoal + cream)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {baseSwatches.map((s) => (
            <SwatchCard key={s.token} swatch={s} />
          ))}
        </div>
      </section>

      <section aria-labelledby="tier-heading" className="mb-10">
        <h2 id="tier-heading" className="mb-4 text-xl font-semibold">
          Tier accents (cards &amp; tier-up moments only)
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tierSwatches.map((s) => (
            <SwatchCard key={s.token} swatch={s} />
          ))}
        </div>
      </section>

      <section aria-labelledby="cards-heading" className="mb-10">
        <h2 id="cards-heading" className="mb-1 text-xl font-semibold">
          Card state matrix (polish spec §2)
        </h2>
        <p className="mb-4 text-sm text-[var(--text-2)]">
          All three sizes × every tier × status + token permutations. Small should show the same
          anatomy as Medium (position chip, team chip, name, FP, contract count, token badge) — just
          scaled.
        </p>

        {SIZES.map((size) => (
          <div key={size} className="mb-8">
            <h3 className="mb-3 text-sm uppercase tracking-wider text-[var(--text-3)]">{size}</h3>
            <div className="flex flex-wrap items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
              {TIERS.map((tier) => (
                <Card key={`${size}-${tier}`} size={size} card={mockCard(tier)} />
              ))}
              <Card size={size} card={mockCard("gold", { hasAppliedToken: true })} />
              <Card size={size} card={mockCard("silver", { playerStatus: "il", longName: true })} />
              <Card size={size} card={mockCard("bronze", { isExpired: true })} />
              <Card size={size} card={mockCard("diamond", { isVaulted: true })} />
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="tokens-heading" className="mb-10">
        <h2 id="tokens-heading" className="mb-1 text-xl font-semibold">
          Applied tokens (polish spec §5)
        </h2>
        <p className="mb-4 text-sm text-[var(--text-2)]">
          Circular pips with hover tooltip. Tray variant is 44px (draggable in the lineup); applied
          variant is 32px and sits on the card's bottom-right corner, overlaid outside the tier
          frame. Click the applied pip to enter the two-step remove confirm.
        </p>

        <TokenPaletteDemo
          tierCards={(["bronze", "silver", "gold", "diamond"] as CardTier[]).map((tier) => ({
            tier,
            card: mockCard(tier),
          }))}
        />
      </section>

      <section aria-labelledby="pack-reveal-heading" className="mb-10">
        <h2 id="pack-reveal-heading" className="mb-1 text-xl font-semibold">
          Pack reveal (polish spec §10)
        </h2>
        <p className="mb-4 text-sm text-[var(--text-2)]">
          Tap a face-down card to flip it. Role / Prospect pulls play a plain flip; Starter triggers
          a gold glow pulse; Star fires the full celebration (hero scale + radial particles +
          screen-darken backdrop). Below, the dupe panel — user picks which instance to sell when
          they pull a player they already own.
        </p>
        <PackRevealDemo />
      </section>

      <section aria-labelledby="dissolve-heading" className="mb-10">
        <h2 id="dissolve-heading" className="mb-1 text-xl font-semibold">
          Dissolve physics (polish spec §1 scope #3)
        </h2>
        <p className="mb-4 text-sm text-[var(--text-2)]">
          Shared animation vocabulary used by quick-sell and the vault- ceremony season-end
          dissolve. ~600ms downward drift + desaturate + fade.
        </p>
        <DissolveDemo card={mockCard("gold")} />
      </section>

      <section aria-labelledby="type-heading">
        <h2 id="type-heading" className="mb-4 text-xl font-semibold">
          Typography
        </h2>
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
              Sans · Inter
            </span>
            <p className="font-sans text-3xl font-bold text-[var(--text)]">
              Opening Day 2026 · Draft your deck.
            </p>
            <p className="font-sans text-sm text-[var(--text-2)]">
              Inter 400 / 500 / 600 / 700 — body, labels, buttons, headings.
            </p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
              Mono · JetBrains Mono
            </span>
            <p className="font-mono text-2xl font-bold text-[var(--text)]">
              123.4 FP · 15 plays · 1,250 coins
            </p>
            <p className="font-mono text-sm text-[var(--text-2)]">
              JetBrains Mono 500 / 700 — career FP, contract counts, contest scores, coins.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";

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

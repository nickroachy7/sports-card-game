import { contractColor, TIER_FRAME } from "@/lib/card/tiers";
import type { CardTier, PlayerStatus } from "@/lib/contracts/cards";
import { cn } from "@/lib/utils";

export type CardSize = "small" | "medium" | "large";

export type CardViewModel = {
  id: string;
  playerName: string;
  position: string | null;
  teamAbbreviation: string | null;
  tier: CardTier;
  careerFp: number;
  contractPlays: number;
  contractMax: number;
  playerStatus: PlayerStatus;
  isExpired: boolean;
  hasAppliedToken: boolean;
  photoUrl?: string | null;
};

const SIZE_STYLES: Record<
  CardSize,
  { width: number; height: number; radius: number; border: number }
> = {
  small: { width: 96, height: 134, radius: 6, border: 3 },
  medium: { width: 160, height: 224, radius: 10, border: 4 },
  large: { width: 320, height: 448, radius: 16, border: 7 },
};

/**
 * Draft Deck Card — UI/UX spec §4 anatomy.
 *
 * Shipped at static quality: photo-hero, tier border + gradient inner
 * bevel, position + team tag, status pill, stats footer. Motion layers
 * (silver shine, gold corner bloom, diamond shimmer) land in Phase 6.
 */
export function Card({
  card,
  size = "medium",
  className,
  onClick,
}: {
  card: CardViewModel;
  size?: CardSize;
  className?: string;
  onClick?: () => void;
}) {
  const sz = SIZE_STYLES[size];
  const frame = TIER_FRAME[card.tier];
  const contract = contractColor(card.contractPlays);
  const pill = resolveStatusPill(card);

  const initials = card.playerName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  const isSmall = size === "small";
  const isLarge = size === "large";

  // Card is presentational by default (renders a <div>). Upgrade to a
  // <button> only when `onClick` is supplied. When wrapped in a <Link>,
  // the <div> branch stays — nested interactive elements block the
  // outer link's click handler.
  const rootClass = cn(
    "group relative block shrink-0 overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-xl",
    contract.haloClass,
    onClick &&
      "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]",
    className,
  );
  const rootStyle: React.CSSProperties = {
    width: sz.width,
    height: sz.height,
    borderRadius: sz.radius,
  };
  const ariaLabel = `${card.playerName}, ${frame.label} tier, ${card.contractPlays}/${card.contractMax} plays`;

  const body = (
    <>
      {/* Outer frame material. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: frame.fill,
          borderRadius: sz.radius,
        }}
      />
      {/* Inner panel — charcoal surface photo canvas. */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: sz.border,
          bottom: sz.border,
          left: sz.border,
          right: sz.border,
          borderRadius: Math.max(sz.radius - sz.border, 2),
          backgroundColor: "var(--surface)",
        }}
      >
        {/* Photo area. Polish spec §2 — matches Medium proportions at
            every size so Small reads as "Medium anatomy, scaled." */}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center text-[var(--text-3)]"
          style={{ height: isSmall ? "58%" : isLarge ? "62%" : "60%" }}
        >
          {card.photoUrl ? (
            // biome-ignore lint/performance/noImgElement: BDL CDN off-domain, no next/image loader
            <img src={card.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span
              className="font-sans font-bold"
              style={{ fontSize: isSmall ? 20 : isLarge ? 72 : 36 }}
            >
              {initials || "?"}
            </span>
          )}
        </div>

        {/* Position tag — top-left. */}
        {card.position && (
          <span
            className="absolute rounded bg-[var(--surface-2)] font-sans font-semibold uppercase tracking-wider text-[var(--text)]"
            style={{
              left: isSmall ? 4 : 8,
              top: isSmall ? 4 : 8,
              padding: isSmall ? "1px 3px" : "2px 6px",
              fontSize: isSmall ? 8 : isLarge ? 12 : 10,
              border: "1px solid var(--border)",
            }}
          >
            {positionShortLabel(card.position)}
          </span>
        )}

        {/* Team chip — top-right. */}
        {card.teamAbbreviation && (
          <span
            className="absolute rounded bg-[var(--surface-2)] font-mono font-semibold uppercase tracking-wider text-[var(--text)]"
            style={{
              right: isSmall ? 4 : 8,
              top: isSmall ? 4 : 8,
              padding: isSmall ? "1px 3px" : "2px 6px",
              fontSize: isSmall ? 8 : isLarge ? 11 : 9,
              border: "1px solid var(--border)",
            }}
          >
            {card.teamAbbreviation}
          </span>
        )}

        {/* Status pill — top-center (sits over photo area). */}
        {pill && (
          <span
            className={cn(
              "absolute left-1/2 flex -translate-x-1/2 items-center rounded font-sans font-semibold uppercase tracking-wider",
              isSmall
                ? "top-4 h-3.5 px-1 text-[8px]"
                : isLarge
                  ? "top-3 h-5 px-2 text-[12px]"
                  : "top-2.5 h-4 px-2 text-[10px]",
            )}
            style={{ backgroundColor: pill.bg, color: pill.text }}
          >
            {pill.label}
          </span>
        )}

        {/* Stats footer. Polish spec §2 — now rendered at every size. */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col border-t border-[var(--border)] bg-[var(--surface-2)]"
          style={{
            padding: isSmall ? "3px 5px" : isLarge ? "8px 12px" : "4px 8px",
            gap: isSmall ? 0 : 2,
          }}
        >
          <div
            className="truncate font-sans font-bold uppercase tracking-wide text-[var(--text)]"
            style={{
              fontSize: isSmall ? 9 : isLarge ? 18 : 12,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
            }}
          >
            {card.playerName}
          </div>
          <div className="flex items-center justify-between" style={{ lineHeight: 1.1 }}>
            <span
              className="font-mono font-bold"
              style={{
                fontSize: isSmall ? 9 : isLarge ? 16 : 12,
                color: "var(--text)",
              }}
            >
              {Math.round(card.careerFp).toLocaleString()} FP
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: isSmall ? 8 : isLarge ? 13 : 11,
                color: contract.textColor,
              }}
            >
              {card.contractPlays}/{card.contractMax}
            </span>
          </div>
          {card.hasAppliedToken && (
            <span
              className="inline-block rounded border border-[var(--border)] bg-[var(--surface)] font-semibold uppercase tracking-wide text-[var(--text-2)]"
              style={{
                marginTop: isSmall ? 1 : 2,
                padding: isSmall ? "0 3px" : "1px 6px",
                fontSize: isSmall ? 7 : 9,
                alignSelf: "flex-start",
              }}
            >
              + TOKEN
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={rootClass}
        style={rootStyle}
      >
        {body}
      </button>
    );
  }
  return (
    <div role="img" aria-label={ariaLabel} className={rootClass} style={rootStyle}>
      {body}
    </div>
  );
}

function resolveStatusPill(
  card: CardViewModel,
): { label: string; bg: string; text: string } | null {
  if (card.isExpired) return { label: "EXPIRED", bg: "#5E584F", text: "var(--text)" };
  if (card.playerStatus === "il") return { label: "IL", bg: "#C47262", text: "var(--text)" };
  if (card.playerStatus === "dfa") return { label: "FA", bg: "#D4A647", text: "var(--bg)" };
  if (card.playerStatus === "retired") return { label: "LEGACY", bg: "#F5F1E8", text: "var(--bg)" };
  return null;
}

function positionShortLabel(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("catcher")) return "C";
  if (s.includes("first")) return "1B";
  if (s.includes("second")) return "2B";
  if (s.includes("third")) return "3B";
  if (s.includes("short")) return "SS";
  if (s.includes("outfield") || s.includes("fielder")) return "OF";
  if (s.includes("designated")) return "DH";
  if (s.includes("starting pitcher")) return "SP";
  if (s.includes("relief pitcher")) return "RP";
  if (s.includes("pitcher")) return "P";
  return raw.slice(0, 3).toUpperCase();
}

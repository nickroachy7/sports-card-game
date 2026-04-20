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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${card.playerName}, ${frame.label} tier, ${card.contractPlays}/${card.contractMax} plays`}
      className={cn(
        "group relative shrink-0 overflow-hidden text-left transition-all",
        contract.haloClass,
        onClick &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]",
        className,
      )}
      style={{
        width: sz.width,
        height: sz.height,
        borderRadius: sz.radius,
      }}
    >
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
        {/* Photo area (top ~60%). Fallback silhouette + number. */}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center text-[var(--text-3)]"
          style={{ height: isSmall ? "75%" : isLarge ? "62%" : "65%" }}
        >
          {card.photoUrl ? (
            // biome-ignore lint/performance/noImgElement: BDL CDN off-domain, no next/image loader
            <img src={card.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span
              className="font-sans font-bold"
              style={{ fontSize: isSmall ? 22 : isLarge ? 72 : 36 }}
            >
              {initials || "?"}
            </span>
          )}
        </div>

        {/* Position tag — top-left. */}
        {card.position && !isSmall && (
          <span
            className="absolute left-2 top-2 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-sans font-semibold uppercase tracking-wider text-[var(--text)]"
            style={{
              fontSize: isLarge ? 12 : 10,
              border: "1px solid var(--border)",
            }}
          >
            {positionShortLabel(card.position)}
          </span>
        )}

        {/* Team chip — top-right. */}
        {card.teamAbbreviation && !isSmall && (
          <span
            className="absolute right-2 top-2 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono font-semibold uppercase tracking-wider text-[var(--text)]"
            style={{
              fontSize: isLarge ? 11 : 9,
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
              "absolute left-1/2 flex -translate-x-1/2 items-center rounded px-2 font-sans font-semibold uppercase tracking-wider",
              isSmall
                ? "top-1.5 h-3.5 text-[9px]"
                : isLarge
                  ? "top-3 h-5 text-[12px]"
                  : "top-2.5 h-4 text-[10px]",
            )}
            style={{ backgroundColor: pill.bg, color: pill.text }}
          >
            {pill.label}
          </span>
        )}

        {/* Stats footer (hidden at Small). */}
        {!isSmall && (
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 border-t border-[var(--border)] bg-[var(--surface-2)]"
            style={{
              padding: isLarge ? "8px 12px" : "4px 8px",
            }}
          >
            <div
              className="truncate font-sans font-bold uppercase tracking-wide text-[var(--text)]"
              style={{ fontSize: isLarge ? 18 : 12, letterSpacing: "0.02em" }}
            >
              {card.playerName}
            </div>
            <div className="flex items-center justify-between">
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: isLarge ? 16 : 12,
                  color: "var(--text)",
                }}
              >
                {Math.round(card.careerFp).toLocaleString()} FP
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: isLarge ? 13 : 11,
                  color: contract.textColor,
                }}
              >
                {card.contractPlays}/{card.contractMax}
              </span>
            </div>
            {card.hasAppliedToken && (
              <span className="mt-0.5 inline-block rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-2)]">
                + Token
              </span>
            )}
          </div>
        )}
      </div>
    </button>
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

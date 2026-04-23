import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TEAM_NAME = /^[A-Za-z0-9][A-Za-z0-9 '_.-]{1,22}[A-Za-z0-9]$/;

export const teamNameSchema = z
  .string()
  .min(3, "Team name must be at least 3 characters.")
  .max(24, "Team name must be at most 24 characters.")
  .regex(TEAM_NAME, "Letters, numbers, spaces, and . ' _ - only.");

export const hexColorSchema = z.string().regex(HEX_COLOR, "Use a 6-digit hex color like #2A5CAA.");

/** Preset logo ids from the launch library. Expanded alongside asset drop. */
export const LOGO_LIBRARY = [
  "baseball-classic",
  "bat-cross",
  "diamond",
  "glove",
  "helmet",
  "home-plate",
  "pitcher",
  "slugger",
  "stadium",
  "star",
] as const;

export const logoIdSchema = z.enum(LOGO_LIBRARY);

export const onboardingSchema = z.object({
  teamName: teamNameSchema,
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  logoId: logoIdSchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/**
 * Polish spec §85 (Phase 29). Team customization uses the same shape
 * as onboarding — name + two colors + logo id. Shared schema avoids
 * drift between the onboarding flow and the post-onboarding edit
 * surface.
 */
export const updateTeamProfileSchema = onboardingSchema;
export type UpdateTeamProfileInput = z.infer<typeof updateTeamProfileSchema>;

/**
 * Preset color swatches surfaced in both onboarding and the team
 * customization page. Users can also enter custom hex; presets are a
 * fast path to visually-coherent choices.
 */
export const PRESET_PRIMARY_COLORS: readonly string[] = [
  "#2A5CAA",
  "#C5322B",
  "#1F7A3D",
  "#D4A647",
  "#6E3BC4",
  "#E07A2B",
];

export const PRESET_SECONDARY_COLORS: readonly string[] = [
  "#F5F1E8",
  "#1A1816",
  "#C9C3B5",
  "#8A8478",
  "#A57248",
  "#A8DDE2",
];

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

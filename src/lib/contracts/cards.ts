import { z } from "zod";

export const quickSellInputSchema = z.object({
  cardId: z.string().uuid(),
  idempotencyKey: z.string().uuid().optional(),
});

export const packTypeSchema = z.enum(["daily", "standard", "premium"]);

export const openPackInputSchema = z.object({
  packType: packTypeSchema,
  idempotencyKey: z.string().uuid().optional(),
});

export type PackType = z.infer<typeof packTypeSchema>;
export type QuickSellInput = z.infer<typeof quickSellInputSchema>;
export type OpenPackInput = z.infer<typeof openPackInputSchema>;

export type CardTier = "bronze" | "silver" | "gold" | "diamond";
export type PlayerStatus = "active" | "il" | "dfa" | "retired";
export type TokenType =
  | "hr_bonus"
  | "multi_hit_bonus"
  | "sb_bonus"
  | "strikeout_bonus"
  | "quality_start_bonus";

export const TIER_LABEL: Record<CardTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

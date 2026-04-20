import { z } from "zod";

/** Canonical 10-slot lineup positions. Matches public._lineup_positions(). */
export const LINEUP_POSITIONS = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF1",
  "OF2",
  "OF3",
  "SP1",
  "SP2",
] as const;

export type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export const lineupPositionSchema = z.enum(LINEUP_POSITIONS);

export const createEntryInputSchema = z.object({
  contestId: z.string().uuid(),
});

export const updateSlotInputSchema = z.object({
  entryId: z.string().uuid(),
  position: lineupPositionSchema,
  starterCardId: z.string().uuid().nullable(),
});

export const applyTokenInputSchema = z.object({
  tokenId: z.string().uuid(),
  cardId: z.string().uuid(),
  contestId: z.string().uuid(),
});

export const removeTokenInputSchema = z.object({
  tokenApplicationId: z.string().uuid(),
});

export const autoSubModeSchema = z.enum(["smart_auto", "manual_priority"]);

export const setAutoSubModeInputSchema = z.object({
  entryId: z.string().uuid(),
  mode: autoSubModeSchema,
});

export const submitLineupInputSchema = z.object({
  entryId: z.string().uuid(),
});

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;
export type UpdateSlotInput = z.infer<typeof updateSlotInputSchema>;
export type ApplyTokenInput = z.infer<typeof applyTokenInputSchema>;
export type RemoveTokenInput = z.infer<typeof removeTokenInputSchema>;
export type SetAutoSubModeInput = z.infer<typeof setAutoSubModeInputSchema>;
export type SubmitLineupInput = z.infer<typeof submitLineupInputSchema>;
export type AutoSubMode = z.infer<typeof autoSubModeSchema>;

/** True iff position is a pitcher slot (SP1 / SP2). */
export function isPitcherSlot(position: LineupPosition): boolean {
  return position.startsWith("SP");
}

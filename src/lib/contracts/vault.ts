import { z } from "zod";

export const commitVaultSelectionInputSchema = z.object({
  seasonId: z.string().uuid(),
  cardIds: z.array(z.string().uuid()).max(10, "Select at most 10 cards."),
  idempotencyKey: z.string().uuid().optional(),
});

export type CommitVaultSelectionInput = z.infer<typeof commitVaultSelectionInputSchema>;

export const getVaultCeremonyPreviewInputSchema = z.object({
  seasonId: z.string().uuid(),
});

export type GetVaultCeremonyPreviewInput = z.infer<typeof getVaultCeremonyPreviewInputSchema>;

export type VaultRecap = {
  season_fp: number;
  season_contests_won: number;
  contests_played: number;
  manager_level: number;
  manager_xp: number;
  milestones_hit: Array<{
    milestone_key: string;
    tier: number;
    coin_reward: number;
    xp_reward: number;
    awarded_at: string;
  }>;
  best_card: {
    card_id: string;
    player: string;
    tier: "bronze" | "silver" | "gold" | "diamond";
    fp: number;
  } | null;
  top_token_trigger: {
    token_type: string;
    bonus_fp: number;
  } | null;
};

export type VaultEligibleCard = {
  card_id: string;
  player_id: string;
  full_name: string;
  positions: string[] | null;
  team_abbreviation: string | null;
  current_tier: "bronze" | "silver" | "gold" | "diamond";
  career_fp_total: string | number;
  contract_plays_remaining: number;
  is_expired: boolean;
  tokens_triggered_count: number;
  acquired_at: string;
};

export type VaultCeremonyPreview = {
  recap: VaultRecap;
  eligibleCards: VaultEligibleCard[];
};

export type CommitVaultSelectionResult = {
  vaultedCount: number;
  dissolvedCount: number;
  diamondCount: number;
};

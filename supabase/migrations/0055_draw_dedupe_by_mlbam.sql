-- ─────────────────────────────────────────────────────────────────────────
-- 0055_draw_dedupe_by_mlbam.sql — de-dupe pack draws by mlbam_id.
--
-- User pulled two "Will Wilson" cards + two "Richard Fitts" cards via
-- separate pack opens. Turns out our `player` table has multiple rows
-- for the same MLB player (same `mlbam_id`) under different
-- `bdl_player_id` values — BDL assigned the same physical human two
-- BDL ids (trade, re-signing, their own data mess). Our roster
-- upsert keys on bdl_player_id so the dupe rows slipped in.
--
-- Short-term fix in this migration: pack-draw exclusion checks
-- against the user's owned players' `mlbam_id`, not `player.id`.
-- So if the user already owns Will Wilson (mlbam_id 669717), BOTH
-- `player` rows sharing that mlbam_id are excluded from future
-- draws. Same-pack iteration 2 also sees iteration 1's insert via
-- mlbam join.
--
-- Long-term fix (follow-up phase): merge duplicate `player` rows
-- into one canonical row per mlbam_id + add UNIQUE constraint.
-- Deferred because re-pointing existing cards / tokens /
-- contract_extensions / vault_entries is a larger surgical pass.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._draw_player_in_tier(
  p_user_id   uuid,
  p_tier      text,
  p_pool_rule text
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tiers_to_try text[];
  v_current_tier text;
  v_found_id     uuid;
BEGIN
  v_tiers_to_try := CASE p_tier
    WHEN 'star'    THEN ARRAY['star', 'starter', 'role']
    WHEN 'starter' THEN ARRAY['starter', 'role']
    WHEN 'role'    THEN ARRAY['role']
    WHEN 'prospect' THEN ARRAY['prospect', 'role']
    ELSE ARRAY['role']
  END;

  FOREACH v_current_tier IN ARRAY v_tiers_to_try LOOP
    SELECT p.id INTO v_found_id
    FROM public.player p
    WHERE
      ((p_pool_rule = '26_man' AND p.is_26_man = true AND p.status = 'active')
       OR (p_pool_rule = '40_man' AND p.is_active_40_man = true AND p.status = 'active'))
      AND p.designated_value_tier = v_current_tier::player_value_tier
      AND p.mlbam_id IS NOT NULL
      -- De-dupe by mlbam_id rather than player.id (see migration
      -- header comment): BDL's data assigns the same physical MLB
      -- player multiple bdl_player_ids, so we can have >1 player.id
      -- per mlbam_id. The user should see at most one card per
      -- mlbam_id in their collection.
      AND NOT EXISTS (
        SELECT 1
        FROM public.card c
        JOIN public.player p2 ON p2.id = c.player_id
        WHERE c.user_id = p_user_id
          AND c.is_vaulted = false
          AND p2.mlbam_id = p.mlbam_id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_found_id IS NOT NULL THEN
      id := v_found_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

ALTER FUNCTION public._draw_player_in_tier(uuid, text, text)
  SET search_path = public, pg_catalog;

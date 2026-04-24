-- ─────────────────────────────────────────────────────────────────────────
-- 0048_commit_vault_uses_multiplier.sql — Phase 41 P41.3.
--
-- commit_vault_selection now snapshots plays_used + multiplier +
-- vault_score into vault_entry alongside final_tier / final_fp.
-- Base revision is 0025 (ceremony-accepts-pre-vaulted); only the INSERT
-- into vault_entry changes.
--
-- vault_card_midseason — the mid-season freeze — does NOT write a
-- vault_entry row. Frozen cards stay in `card` with is_vaulted=true
-- until ceremony time, at which point commit_vault_selection snapshots
-- them. So the multiplier math lives in one place.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commit_vault_selection(
  p_user_id   uuid,
  p_season_id uuid,
  p_card_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_season          public.season;
  v_already         boolean;
  v_selected_count  integer;
  v_owned_count     integer;
  v_diamonds        integer := 0;
  v_dissolved       integer := 0;
  v_xp_diamond      bigint  := 0;
  v_xp_sources      jsonb;
  v_cfg             public.economy_config;
  v_card            record;
  v_multiplier      numeric;
BEGIN
  v_selected_count := COALESCE(array_length(p_card_ids, 1), 0);

  IF v_selected_count > 10 THEN
    RAISE EXCEPTION 'commit_vault_selection: cannot vault more than 10 cards (got %)',
      v_selected_count
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_season FROM public.season WHERE id = p_season_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commit_vault_selection: season not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_season.status <> 'offseason' THEN
    RAISE EXCEPTION 'commit_vault_selection: season not in offseason (status=%)',
      v_season.status
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vault_entry
    WHERE user_id = p_user_id AND season_id = p_season_id
  ) INTO v_already;

  IF v_already THEN
    RAISE EXCEPTION 'commit_vault_selection: user already committed vault for this season'
      USING ERRCODE = '23514';
  END IF;

  IF v_selected_count > 0 THEN
    SELECT COUNT(*) INTO v_owned_count
    FROM public.card
    WHERE id = ANY(p_card_ids)
      AND user_id = p_user_id
      AND (
        is_vaulted = false
        OR (is_vaulted = true AND vault_source = 'midseason')
      );

    IF v_owned_count <> v_selected_count THEN
      RAISE EXCEPTION 'commit_vault_selection: one or more cards not owned or ineligible (owned=% selected=%)',
        v_owned_count, v_selected_count
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3) Snapshot selected cards into vault_entry. Compute multiplier +
  -- vault_score from plays_used × final_fp at ceremony time. Both
  -- new-vault and pre-vaulted (midseason) selections get the same
  -- snapshot treatment.
  FOR v_card IN
    SELECT c.id, c.player_id, c.current_tier, c.career_fp_total,
           c.plays_used,
           c.tokens_applied_count, c.tokens_triggered_count
    FROM public.card c
    WHERE c.id = ANY(p_card_ids)
  LOOP
    v_multiplier := public.card_vault_multiplier(v_card.plays_used);

    INSERT INTO public.vault_entry
      (user_id, season_id, card_id, player_id,
       final_tier, final_fp, plays_used, multiplier, vault_score,
       tokens_applied_count, tokens_triggered_count)
    VALUES
      (p_user_id, p_season_id, v_card.id, v_card.player_id,
       v_card.current_tier, v_card.career_fp_total,
       v_card.plays_used, v_multiplier,
       v_card.career_fp_total * v_multiplier,
       v_card.tokens_applied_count, v_card.tokens_triggered_count);

    IF v_card.current_tier = 'diamond' THEN
      v_diamonds := v_diamonds + 1;
    END IF;
  END LOOP;

  IF v_selected_count > 0 THEN
    UPDATE public.card
    SET is_vaulted   = true,
        vaulted_at   = now(),
        vault_source = 'ceremony'
    WHERE id = ANY(p_card_ids) AND is_vaulted = false;
  END IF;

  UPDATE public.contest_lineup_slot
  SET starter_card_id = CASE WHEN starter_card_id IS NOT NULL
                              AND starter_card_id IN (
                                SELECT id FROM public.card
                                WHERE user_id = p_user_id AND is_vaulted = false
                              )
                         THEN NULL ELSE starter_card_id END,
      final_card_id   = CASE WHEN final_card_id IS NOT NULL
                              AND final_card_id IN (
                                SELECT id FROM public.card
                                WHERE user_id = p_user_id AND is_vaulted = false
                              )
                         THEN NULL ELSE final_card_id END,
      backup_1_card_id = CASE WHEN backup_1_card_id IS NOT NULL
                              AND backup_1_card_id IN (
                                SELECT id FROM public.card
                                WHERE user_id = p_user_id AND is_vaulted = false
                              )
                         THEN NULL ELSE backup_1_card_id END,
      backup_2_card_id = CASE WHEN backup_2_card_id IS NOT NULL
                              AND backup_2_card_id IN (
                                SELECT id FROM public.card
                                WHERE user_id = p_user_id AND is_vaulted = false
                              )
                         THEN NULL ELSE backup_2_card_id END
  WHERE contest_entry_id IN (
    SELECT id FROM public.contest_entry WHERE user_id = p_user_id
  );

  UPDATE public.token
  SET applied_to_card_id = NULL,
      applied_to_contest_id = NULL
  WHERE applied_to_card_id IN (
    SELECT id FROM public.card
    WHERE user_id = p_user_id AND is_vaulted = false
  );

  DELETE FROM public.card
  WHERE user_id = p_user_id AND is_vaulted = false;
  GET DIAGNOSTICS v_dissolved = ROW_COUNT;

  DELETE FROM public.token
  WHERE user_id = p_user_id AND consumed_at IS NULL;

  UPDATE public.user_season_state
  SET coins = 0,
      updated_at = now()
  WHERE user_id = p_user_id AND season_id = p_season_id;

  UPDATE public.manager_account
  SET seasons_played                = seasons_played + 1,
      lifetime_diamond_cards_vaulted = lifetime_diamond_cards_vaulted + v_diamonds,
      updated_at                    = now()
  WHERE user_id = p_user_id;

  IF v_diamonds > 0 THEN
    v_cfg := public.get_active_economy_config();
    v_xp_sources := (v_cfg.manager_xp_sources)->'per_event';
    v_xp_diamond := COALESCE((v_xp_sources->>'diamond_vaulted')::bigint, 0);
    IF v_xp_diamond > 0 THEN
      PERFORM public.grant_manager_xp(
        p_user_id,
        v_xp_diamond * v_diamonds,
        'diamond_vaulted'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'vaulted_count',    v_selected_count,
    'dissolved_count',  v_dissolved,
    'diamond_count',    v_diamonds
  );
END;
$$;

ALTER FUNCTION public.commit_vault_selection(uuid, uuid, uuid[])
  SET search_path = public, pg_catalog;

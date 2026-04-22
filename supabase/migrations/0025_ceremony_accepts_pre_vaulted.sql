-- ─────────────────────────────────────────────────────────────────────────
-- 0025_ceremony_accepts_pre_vaulted.sql — ceremony fn accepts pre-vaulted.
--
-- Polish spec §17 / P7.4.7 carry-over.
--
-- Before: commit_vault_selection rejected any selected card where
-- is_vaulted = true — a blocker for any user who used mid-season vault
-- (P7.4). Their pre-vaulted cards counted against the 10 cap but
-- couldn't be included in the end-of-season ceremony commit.
--
-- After: a selected card is valid if it's either
--   (a) owned + is_vaulted=false (new vault at ceremony), OR
--   (b) owned + is_vaulted=true + vault_source='midseason' (already in
--       the vault via the mid-season path — gets its vault_entry
--       snapshot at ceremony time to memorialize its final tier/FP).
--
-- `is_vaulted=true + vault_source='ceremony'` still fails ownership:
-- that card was committed in a previous ceremony and isn't re-eligible.
-- The existing vault_entry existence check (the `v_already` gate near
-- the top of the fn) still prevents running the same season's ceremony
-- twice — that's the "double commit" backstop.
--
-- The UPDATE that marks newly-selected cards as vaulted now filters on
-- `is_vaulted=false` so we don't overwrite the mid-season `vaulted_at`
-- timestamp. Pre-vaulted cards keep their original timestamp +
-- vault_source='midseason' for audit traceability. Newly-ceremony-
-- vaulted cards get vault_source='ceremony'.
--
-- No schema change — just the fn body.
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

  -- Idempotency: reject if already committed this season.
  SELECT EXISTS (
    SELECT 1 FROM public.vault_entry
    WHERE user_id = p_user_id AND season_id = p_season_id
  ) INTO v_already;

  IF v_already THEN
    RAISE EXCEPTION 'commit_vault_selection: user already committed vault for this season'
      USING ERRCODE = '23514';
  END IF;

  -- Ownership check: every selected card must belong to the user and
  -- be either (a) not yet vaulted, or (b) already vaulted via the
  -- mid-season path (polish spec §17). Cards vaulted via a previous
  -- ceremony are rejected.
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

  -- 3) Snapshot selected cards into vault_entry. Both new + pre-vaulted
  --    selections get a row so the ceremony memorializes each one's
  --    final tier/FP for this season.
  FOR v_card IN
    SELECT c.id, c.player_id, c.current_tier, c.career_fp_total,
           c.tokens_applied_count, c.tokens_triggered_count
    FROM public.card c
    WHERE c.id = ANY(p_card_ids)
  LOOP
    INSERT INTO public.vault_entry
      (user_id, season_id, card_id, player_id,
       final_tier, final_fp, tokens_applied_count, tokens_triggered_count)
    VALUES
      (p_user_id, p_season_id, v_card.id, v_card.player_id,
       v_card.current_tier, v_card.career_fp_total,
       v_card.tokens_applied_count, v_card.tokens_triggered_count);

    IF v_card.current_tier = 'diamond' THEN
      v_diamonds := v_diamonds + 1;
    END IF;
  END LOOP;

  -- Mark newly-selected (is_vaulted=false at time of select) cards as
  -- vaulted with vault_source='ceremony'. Pre-vaulted midseason cards
  -- are left alone — their vaulted_at + vault_source='midseason' are
  -- preserved for audit.
  IF v_selected_count > 0 THEN
    UPDATE public.card
    SET is_vaulted   = true,
        vaulted_at   = now(),
        vault_source = 'ceremony'
    WHERE id = ANY(p_card_ids) AND is_vaulted = false;
  END IF;

  -- 4) Dissolve non-vaulted cards. Null card-refs on lineup slots +
  --    tokens first so residual references survive.
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

  -- Clear both applied_to_card_id and applied_to_contest_id together —
  -- the `token_applied_both_or_neither` check constraint requires both
  -- fields to be NULL together or both set together. Setting just
  -- applied_to_card_id=NULL was a latent bug in the original ceremony
  -- fn; surfaced by the P10.5 DO-block smoke.
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

  -- 5) Dissolve unused tokens.
  DELETE FROM public.token
  WHERE user_id = p_user_id AND consumed_at IS NULL;

  -- 6) Zero coins for this season.
  UPDATE public.user_season_state
  SET coins = 0,
      updated_at = now()
  WHERE user_id = p_user_id AND season_id = p_season_id;

  -- 7) Manager rollover.
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

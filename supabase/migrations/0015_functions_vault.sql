-- ─────────────────────────────────────────────────────────────────────────
-- 0015_functions_vault.sql — end-of-season vault commit.
--
-- Schema tweak:
--   - token_application.card_id: drop NOT NULL + change FK to ON DELETE
--     SET NULL, so an audit row can outlive the card it referenced when
--     that card is dissolved at season end. The audit row's bonus_fp /
--     triggered / timestamps still tell the season story; the card link
--     is legitimately gone.
--
-- Function:
--   commit_vault_selection(user_id, season_id, card_ids[]) is the single
--   write path for the vault ceremony (API spec §3.6). It:
--     1. Validates season.status = 'offseason' and that no prior vault
--        commit exists for this (user, season).
--     2. Validates that every card in card_ids belongs to the user and
--        has not already been vaulted.
--     3. For each chosen card: inserts vault_entry (snapshot: final tier,
--        final FP, token stats), sets is_vaulted = true + vaulted_at.
--     4. Nullifies every card-ref in contest_lineup_slot / token /
--        token_application for the unchosen cards, then deletes them.
--     5. Hard-deletes unused tokens (user_id = p_user, consumed_at IS
--        NULL) — dissolves the token inventory per gameplay spec §11.3.
--     6. user_season_state.coins = 0 for this season.
--     7. manager_account: increments seasons_played and
--        lifetime_diamond_cards_vaulted by the number of diamonds
--        vaulted. Grants XP per economy_config.per_event.diamond_vaulted
--        for each diamond preserved.
--   Returns json with summary (vaulted_count, dissolved_count,
--   diamond_count).
--
-- Errors raised (SQLSTATEs that the action maps to API codes):
--   22023 VALIDATION     — card_ids length > 10
--   42501 UNAUTHENTICATED— (unused here; belt + suspenders in caller)
--   P0002 NOT_FOUND      — one or more cards not owned by user
--   23514 CONFLICT       — already committed OR season not in offseason
-- ─────────────────────────────────────────────────────────────────────────


-- ── schema tweak: relax token_application.card_id ───────────────────────
ALTER TABLE public.token_application
  ALTER COLUMN card_id DROP NOT NULL;

ALTER TABLE public.token_application
  DROP CONSTRAINT IF EXISTS token_application_card_id_card_id_fk;

ALTER TABLE public.token_application
  ADD CONSTRAINT token_application_card_id_card_id_fk
  FOREIGN KEY (card_id) REFERENCES public.card(id) ON DELETE SET NULL;


-- ── commit_vault_selection ──────────────────────────────────────────────
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

  -- Season must exist and be in offseason.
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

  -- Idempotency: reject if already committed.
  SELECT EXISTS (
    SELECT 1 FROM public.vault_entry
    WHERE user_id = p_user_id AND season_id = p_season_id
  ) INTO v_already;

  IF v_already THEN
    RAISE EXCEPTION 'commit_vault_selection: user already committed vault for this season'
      USING ERRCODE = '23514';
  END IF;

  -- Ownership check: every selected card must belong to the user and
  -- not already be vaulted.
  IF v_selected_count > 0 THEN
    SELECT COUNT(*) INTO v_owned_count
    FROM public.card
    WHERE id = ANY(p_card_ids)
      AND user_id = p_user_id
      AND is_vaulted = false;

    IF v_owned_count <> v_selected_count THEN
      RAISE EXCEPTION 'commit_vault_selection: one or more cards not owned or already vaulted (owned=% selected=%)',
        v_owned_count, v_selected_count
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3) Preserve chosen cards.
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

  IF v_selected_count > 0 THEN
    UPDATE public.card
    SET is_vaulted = true,
        vaulted_at = now()
    WHERE id = ANY(p_card_ids);
  END IF;

  -- 4) Dissolve the rest. Null card-refs on slot + token first so
  --    we don't trip the remaining FKs (contest_lineup_slot.* and
  --    token.applied_to_card_id still have ON DELETE NO ACTION).
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
  SET applied_to_card_id = NULL
  WHERE applied_to_card_id IN (
    SELECT id FROM public.card
    WHERE user_id = p_user_id AND is_vaulted = false
  );

  -- token_application.card_id now ON DELETE SET NULL, handled by FK.

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

  -- 7) Manager rollover: seasons_played + diamond vault count + XP.
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


-- ── get_vault_ceremony_preview ─────────────────────────────────────────
-- Returns the data the vault ceremony screen needs: season recap stats
-- + vault-eligible cards (active + expired, not already vaulted).
-- Read-only; safe to call from a Server Component.
CREATE OR REPLACE FUNCTION public.get_vault_ceremony_preview(
  p_user_id   uuid,
  p_season_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_state        public.user_season_state;
  v_mgr          public.manager_account;
  v_mile         public.team_milestone_state;
  v_top_card     jsonb;
  v_top_token    jsonb;
  v_milestones   jsonb;
  v_eligible     jsonb;
  v_total_slots  integer;
BEGIN
  SELECT * INTO v_state FROM public.user_season_state
    WHERE user_id = p_user_id AND season_id = p_season_id;

  SELECT * INTO v_mgr FROM public.manager_account
    WHERE user_id = p_user_id;

  SELECT * INTO v_mile FROM public.team_milestone_state
    WHERE user_id = p_user_id AND season_id = p_season_id;

  -- Best card this season (highest career_fp_total, not vaulted).
  SELECT jsonb_build_object(
    'card_id',   c.id,
    'player',   p.full_name,
    'tier',     c.current_tier,
    'fp',       c.career_fp_total
  )
  INTO v_top_card
  FROM public.card c
  JOIN public.player p ON p.id = c.player_id
  WHERE c.user_id = p_user_id
    AND c.season_id = p_season_id
    AND c.is_vaulted = false
  ORDER BY c.career_fp_total DESC
  LIMIT 1;

  -- Best single token trigger (highest bonus_fp_awarded, triggered=true).
  SELECT jsonb_build_object(
    'token_type',  t.token_type,
    'bonus_fp',    ta.bonus_fp_awarded
  )
  INTO v_top_token
  FROM public.token_application ta
  JOIN public.token t ON t.id = ta.token_id
  WHERE ta.user_id = p_user_id
    AND ta.triggered = true
  ORDER BY ta.bonus_fp_awarded DESC
  LIMIT 1;

  -- Milestone awards earned this season, grouped.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'milestone_key', a.milestone_key,
    'tier',          a.tier,
    'coin_reward',   a.coin_reward,
    'xp_reward',     a.xp_reward,
    'awarded_at',    a.awarded_at
  ) ORDER BY a.awarded_at DESC), '[]'::jsonb)
  INTO v_milestones
  FROM public.team_milestone_award a
  WHERE a.user_id = p_user_id AND a.season_id = p_season_id;

  -- Eligible (non-vaulted) cards, with enough display info for a grid.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'card_id',                c.id,
    'player_id',              p.id,
    'full_name',              p.full_name,
    'positions',              p.positions,
    'team_abbreviation',      t.abbreviation,
    'current_tier',           c.current_tier,
    'career_fp_total',        c.career_fp_total,
    'contract_plays_remaining', c.contract_plays_remaining,
    'is_expired',             c.is_expired,
    'tokens_triggered_count', c.tokens_triggered_count,
    'acquired_at',            c.acquired_at
  ) ORDER BY c.career_fp_total DESC), '[]'::jsonb)
  INTO v_eligible
  FROM public.card c
  JOIN public.player p ON p.id = c.player_id
  LEFT JOIN public.team t ON t.id = p.team_id
  WHERE c.user_id = p_user_id
    AND c.is_vaulted = false;

  -- Count of contest slots the user filled this season (proxy for
  -- "contests played" until we have a dedicated column).
  SELECT COUNT(*) INTO v_total_slots
  FROM public.contest_entry
  WHERE user_id = p_user_id
    AND season_id = p_season_id
    AND status = 'final';

  RETURN jsonb_build_object(
    'recap', jsonb_build_object(
      'season_fp',             COALESCE(v_state.season_fp, 0),
      'season_contests_won',   COALESCE(v_state.season_contests_won, 0),
      'contests_played',       v_total_slots,
      'manager_level',         COALESCE(v_mgr.manager_level, 1),
      'manager_xp',            COALESCE(v_mgr.manager_xp, 0),
      'milestones_hit',        v_milestones,
      'best_card',             v_top_card,
      'top_token_trigger',     v_top_token
    ),
    'eligibleCards', v_eligible
  );
END;
$$;

ALTER FUNCTION public.get_vault_ceremony_preview(uuid, uuid)
  SET search_path = public, pg_catalog;

-- ─────────────────────────────────────────────────────────────────────────
-- 0003_triggers.sql — triggers per DB schema spec §15.
-- Bound to the helper functions in 0001_functions_util.sql.
-- ─────────────────────────────────────────────────────────────────────────

-- -------------------------------------------------------------------------
-- touch_updated_at triggers — every mutable table with an updated_at column.
-- -------------------------------------------------------------------------
CREATE TRIGGER t_touch_updated_at_season
  BEFORE UPDATE ON public.season
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_profile
  BEFORE UPDATE ON public.profile
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_manager_account
  BEFORE UPDATE ON public.manager_account
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_user_season_state
  BEFORE UPDATE ON public.user_season_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_team
  BEFORE UPDATE ON public.team
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_player
  BEFORE UPDATE ON public.player
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_game
  BEFORE UPDATE ON public.game
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_card
  BEFORE UPDATE ON public.card
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_token
  BEFORE UPDATE ON public.token
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_contest
  BEFORE UPDATE ON public.contest
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_contest_entry
  BEFORE UPDATE ON public.contest_entry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_touch_updated_at_team_milestone_state
  BEFORE UPDATE ON public.team_milestone_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -------------------------------------------------------------------------
-- card_tier_on_fp_change — recompute current_tier when career_fp_total
-- changes.
-- -------------------------------------------------------------------------
CREATE TRIGGER card_tier_on_fp_change
  BEFORE UPDATE OF career_fp_total ON public.card
  FOR EACH ROW
  WHEN (OLD.career_fp_total IS DISTINCT FROM NEW.career_fp_total)
  EXECUTE FUNCTION public.recompute_card_tier();

-- Also fire on INSERT so hand-crafted inserts land on the right tier.
CREATE TRIGGER card_tier_on_insert
  BEFORE INSERT ON public.card
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_card_tier();

-- -------------------------------------------------------------------------
-- card_expiry_on_plays_change — set is_expired when plays_remaining hits 0
-- or back to false when it rises above 0 (e.g. after an extension).
-- -------------------------------------------------------------------------
CREATE TRIGGER card_expiry_on_plays_change
  BEFORE UPDATE OF contract_plays_remaining ON public.card
  FOR EACH ROW
  WHEN (OLD.contract_plays_remaining IS DISTINCT FROM NEW.contract_plays_remaining)
  EXECUTE FUNCTION public.recompute_card_expiry();

-- -------------------------------------------------------------------------
-- card_tokens_applied_count — increment card.tokens_applied_count every
-- time a token_application row lands referencing that card.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bump_card_tokens_applied()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.card
  SET tokens_applied_count = tokens_applied_count + 1
  WHERE id = NEW.card_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER card_tokens_applied_on_insert
  AFTER INSERT ON public.token_application
  FOR EACH ROW EXECUTE FUNCTION public._bump_card_tokens_applied();

-- -------------------------------------------------------------------------
-- card_tokens_triggered_count — when token_application.triggered flips
-- to true, increment card.tokens_triggered_count.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bump_card_tokens_triggered()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.triggered IS TRUE AND (OLD.triggered IS DISTINCT FROM NEW.triggered) THEN
    UPDATE public.card
    SET tokens_triggered_count = tokens_triggered_count + 1
    WHERE id = NEW.card_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER card_tokens_triggered_on_update
  AFTER UPDATE OF triggered ON public.token_application
  FOR EACH ROW EXECUTE FUNCTION public._bump_card_tokens_triggered();

-- -------------------------------------------------------------------------
-- season_fp_denorm — when contest_entry.final_score changes, add the delta
-- to user_season_state.season_fp for the (user_id, season_id) pair.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bump_season_fp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  delta numeric;
BEGIN
  delta := NEW.final_score - COALESCE(OLD.final_score, 0);
  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_season_state
  SET season_fp  = season_fp + delta::bigint,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND season_id = NEW.season_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contest_entry_season_fp_denorm
  AFTER UPDATE OF final_score ON public.contest_entry
  FOR EACH ROW
  WHEN (OLD.final_score IS DISTINCT FROM NEW.final_score)
  EXECUTE FUNCTION public._bump_season_fp();

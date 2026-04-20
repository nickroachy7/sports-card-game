-- ─────────────────────────────────────────────────────────────────────────
-- 0005_rls.sql — enable RLS on every table and apply the policy families
-- defined in DB schema spec §14.
--
-- Families:
--   owner_only              — user_id = auth.uid() for all ops
--   public_read_owner_write — public SELECT, owner INSERT/UPDATE/DELETE
--   public_read_service_write — public SELECT, writes service-role only
--   service_only            — no anon/authenticated access
--   admin_only              — app_metadata.role = 'admin' JWT claim
-- ─────────────────────────────────────────────────────────────────────────

-- -------------------------------------------------------------------------
-- Enable RLS everywhere — never leave a table open.
-- -------------------------------------------------------------------------
ALTER TABLE public.season ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_season_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_extension ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_lineup_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_opening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_milestone_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_milestone_award ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_failed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_log ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- Reference data — public read, service-only write.
-- -------------------------------------------------------------------------
CREATE POLICY season_public_read   ON public.season   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY team_public_read     ON public.team     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY player_public_read   ON public.player   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY game_public_read     ON public.game     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY game_event_public_read ON public.game_event FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY contest_public_read  ON public.contest  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY economy_config_public_read ON public.economy_config FOR SELECT TO anon, authenticated USING (true);

-- -------------------------------------------------------------------------
-- profile — public read, owner write.
-- -------------------------------------------------------------------------
CREATE POLICY profile_public_read  ON public.profile FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY profile_owner_insert ON public.profile FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profile_owner_update ON public.profile FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profile_owner_delete ON public.profile FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- manager_account — public read (leaderboard), writes via service functions.
-- -------------------------------------------------------------------------
CREATE POLICY manager_account_public_read ON public.manager_account FOR SELECT TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- user_season_state — owner read. All writes go through SQL functions
-- (spend_coins / credit_coins / season cron).
-- -------------------------------------------------------------------------
CREATE POLICY user_season_state_owner_read ON public.user_season_state FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- card — owner full access for active (is_vaulted = false); public read for
-- is_vaulted = true (public vault).
-- -------------------------------------------------------------------------
CREATE POLICY card_read ON public.card FOR SELECT TO anon, authenticated
  USING (is_vaulted = true OR user_id = auth.uid());

CREATE POLICY card_owner_insert ON public.card FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY card_owner_update ON public.card FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY card_owner_delete ON public.card FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- contract_extension — owner read (write via extend Server Action + service).
-- -------------------------------------------------------------------------
CREATE POLICY contract_extension_owner_read ON public.contract_extension FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- vault_entry — public read, service-only write.
-- -------------------------------------------------------------------------
CREATE POLICY vault_entry_public_read ON public.vault_entry FOR SELECT TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- token — owner full access.
-- -------------------------------------------------------------------------
CREATE POLICY token_owner_read   ON public.token FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY token_owner_insert ON public.token FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY token_owner_update ON public.token FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY token_owner_delete ON public.token FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- token_application — owner read, service-only write.
-- -------------------------------------------------------------------------
CREATE POLICY token_application_owner_read ON public.token_application FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- contest_entry — owner read; writes gated. Public read of finals via a
-- view / explicit additional policy in the leaderboard flow.
-- -------------------------------------------------------------------------
CREATE POLICY contest_entry_owner_read ON public.contest_entry FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY contest_entry_owner_insert ON public.contest_entry FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY contest_entry_owner_update ON public.contest_entry FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('building', 'submitted'))
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- contest_lineup_slot — inherits RLS through contest_entry. A user can
-- read a slot if they own the parent entry.
-- -------------------------------------------------------------------------
CREATE POLICY contest_lineup_slot_owner_read ON public.contest_lineup_slot FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contest_entry ce
    WHERE ce.id = contest_entry_id AND ce.user_id = auth.uid()
  ));

CREATE POLICY contest_lineup_slot_owner_write ON public.contest_lineup_slot FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contest_entry ce
    WHERE ce.id = contest_entry_id
      AND ce.user_id = auth.uid()
      AND ce.status IN ('building', 'submitted')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contest_entry ce
    WHERE ce.id = contest_entry_id AND ce.user_id = auth.uid()
  ));

-- -------------------------------------------------------------------------
-- coin_transaction — owner read, writes via spend_coins / credit_coins.
-- -------------------------------------------------------------------------
CREATE POLICY coin_transaction_owner_read ON public.coin_transaction FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- pack_opening — owner read, writes via open_pack (M5).
-- -------------------------------------------------------------------------
CREATE POLICY pack_opening_owner_read ON public.pack_opening FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- Milestones — owner read, service-only write.
-- -------------------------------------------------------------------------
CREATE POLICY team_milestone_state_owner_read ON public.team_milestone_state FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY team_milestone_award_owner_read ON public.team_milestone_award FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- Operational — service-only. No anon/authenticated access (no policies).
-- Supabase denies-by-default once RLS is enabled with no policy for a role.
-- -------------------------------------------------------------------------
-- (webhook_delivery, webhook_failed, moderation_flag: no policies = no access
-- from anon or authenticated roles; service_role always bypasses RLS.)

-- -------------------------------------------------------------------------
-- manual_grant — user can read their own grants; writes admin-only.
-- -------------------------------------------------------------------------
CREATE POLICY manual_grant_owner_read ON public.manual_grant FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- idempotency_log — owner read/write (action replay must match same user).
-- -------------------------------------------------------------------------
CREATE POLICY idempotency_log_owner ON public.idempotency_log FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

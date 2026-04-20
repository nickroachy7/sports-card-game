-- ─────────────────────────────────────────────────────────────────────────
-- 0004_cross_domain_fks.sql — foreign keys that span circular module deps
-- or reference the Supabase auth schema. Added after base tables exist.
-- ─────────────────────────────────────────────────────────────────────────

-- -------------------------------------------------------------------------
-- auth.users FKs — every user_id column. ON DELETE CASCADE per the data
-- retention policy in DB schema spec §19.1.
-- -------------------------------------------------------------------------
ALTER TABLE public.profile
  ADD CONSTRAINT profile_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.manager_account
  ADD CONSTRAINT manager_account_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_season_state
  ADD CONSTRAINT user_season_state_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.card
  ADD CONSTRAINT card_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.contract_extension
  ADD CONSTRAINT contract_extension_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.vault_entry
  ADD CONSTRAINT vault_entry_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.token
  ADD CONSTRAINT token_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.token_application
  ADD CONSTRAINT token_application_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.contest_entry
  ADD CONSTRAINT contest_entry_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.coin_transaction
  ADD CONSTRAINT coin_transaction_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pack_opening
  ADD CONSTRAINT pack_opening_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.team_milestone_state
  ADD CONSTRAINT team_milestone_state_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.team_milestone_award
  ADD CONSTRAINT team_milestone_award_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.manual_grant
  ADD CONSTRAINT manual_grant_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.manual_grant
  ADD CONSTRAINT manual_grant_granted_by_auth_users_fk
    FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.moderation_flag
  ADD CONSTRAINT moderation_flag_flagged_by_auth_users_fk
    FOREIGN KEY (flagged_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.moderation_flag
  ADD CONSTRAINT moderation_flag_resolved_by_auth_users_fk
    FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.idempotency_log
  ADD CONSTRAINT idempotency_log_user_id_auth_users_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- -------------------------------------------------------------------------
-- Circular refs — FKs that would have created import cycles in Drizzle.
-- -------------------------------------------------------------------------
ALTER TABLE public.card
  ADD CONSTRAINT card_applied_token_id_token_id_fk
    FOREIGN KEY (applied_token_id) REFERENCES public.token(id) ON DELETE SET NULL;

ALTER TABLE public.card
  ADD CONSTRAINT card_acquired_pack_opening_id_pack_opening_id_fk
    FOREIGN KEY (acquired_pack_opening_id) REFERENCES public.pack_opening(id) ON DELETE SET NULL;

ALTER TABLE public.token
  ADD CONSTRAINT token_applied_to_contest_id_contest_id_fk
    FOREIGN KEY (applied_to_contest_id) REFERENCES public.contest(id) ON DELETE SET NULL;

ALTER TABLE public.token_application
  ADD CONSTRAINT token_application_contest_id_contest_id_fk
    FOREIGN KEY (contest_id) REFERENCES public.contest(id);

ALTER TABLE public.webhook_failed
  ADD CONSTRAINT webhook_failed_delivery_id_webhook_delivery_delivery_id_fk
    FOREIGN KEY (delivery_id) REFERENCES public.webhook_delivery(delivery_id) ON DELETE CASCADE;

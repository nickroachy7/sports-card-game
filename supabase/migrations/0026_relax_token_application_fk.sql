-- ─────────────────────────────────────────────────────────────────────────
-- 0026_relax_token_application_fk.sql — token_application.token_id
-- becomes nullable ON DELETE SET NULL.
--
-- Same class of issue as ADR-0011 migration 0019 (card FKs). The
-- ceremony fn commit_vault_selection dissolves all unused tokens
-- (consumed_at IS NULL) at season end; the DELETE failed with 23503
-- because token_application.token_id referenced token.id with NO
-- ACTION. Audit rows still recorded "token X was applied to card Y in
-- contest Z and triggered Y/N" — we want to preserve that history
-- even when the underlying token is gone.
--
-- Mirrors token_application_card_id_card_id_fk which is already
-- ON DELETE SET NULL. After this migration, token_application rows
-- survive token deletes with a null token_id — the narrative (did it
-- trigger? bonus_fp_awarded?) stays intact.
--
-- Surfaced by the P10.5 DO-block smoke of the patched ceremony fn.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.token_application
  ALTER COLUMN token_id DROP NOT NULL;

ALTER TABLE public.token_application
  DROP CONSTRAINT IF EXISTS token_application_token_id_token_id_fk;

ALTER TABLE public.token_application
  ADD CONSTRAINT token_application_token_id_token_id_fk
  FOREIGN KEY (token_id) REFERENCES public.token(id) ON DELETE SET NULL;

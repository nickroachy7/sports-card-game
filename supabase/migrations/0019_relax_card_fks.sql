-- ─────────────────────────────────────────────────────────────────────────
-- 0019_relax_card_fks.sql — allow card hard-deletes from any path.
--
-- P4.4 relaxed token_application.card_id to ON DELETE SET NULL when the
-- vault commit needed to dissolve cards that audit rows still pointed
-- at. The rest of the card-referencing FKs were left alone because
-- vault dissolve null'd them explicitly before the DELETE.
--
-- quick_sell_card and extend_card's cascade path never got that
-- treatment, so any card referenced by contest_lineup_slot (i.e. any
-- card ever rostered into a lineup) can't be deleted. Reported bug:
-- user attempts quick-sell on a card that had been placed in a slot →
-- 23503 violates contest_lineup_slot_starter_card_id_card_id_fk.
--
-- Fix: flip all four card-ref columns on contest_lineup_slot and the
-- token.applied_to_card_id column to ON DELETE SET NULL. Columns were
-- already nullable; the slot / token rows survive a card delete as
-- historical records with a null link.
--
-- No data mutation — pure constraint reshuffle.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contest_lineup_slot
  DROP CONSTRAINT IF EXISTS contest_lineup_slot_starter_card_id_card_id_fk;
ALTER TABLE public.contest_lineup_slot
  ADD  CONSTRAINT contest_lineup_slot_starter_card_id_card_id_fk
  FOREIGN KEY (starter_card_id) REFERENCES public.card(id) ON DELETE SET NULL;

ALTER TABLE public.contest_lineup_slot
  DROP CONSTRAINT IF EXISTS contest_lineup_slot_final_card_id_card_id_fk;
ALTER TABLE public.contest_lineup_slot
  ADD  CONSTRAINT contest_lineup_slot_final_card_id_card_id_fk
  FOREIGN KEY (final_card_id) REFERENCES public.card(id) ON DELETE SET NULL;

ALTER TABLE public.contest_lineup_slot
  DROP CONSTRAINT IF EXISTS contest_lineup_slot_backup_1_card_id_card_id_fk;
ALTER TABLE public.contest_lineup_slot
  ADD  CONSTRAINT contest_lineup_slot_backup_1_card_id_card_id_fk
  FOREIGN KEY (backup_1_card_id) REFERENCES public.card(id) ON DELETE SET NULL;

ALTER TABLE public.contest_lineup_slot
  DROP CONSTRAINT IF EXISTS contest_lineup_slot_backup_2_card_id_card_id_fk;
ALTER TABLE public.contest_lineup_slot
  ADD  CONSTRAINT contest_lineup_slot_backup_2_card_id_card_id_fk
  FOREIGN KEY (backup_2_card_id) REFERENCES public.card(id) ON DELETE SET NULL;

ALTER TABLE public.token
  DROP CONSTRAINT IF EXISTS token_applied_to_card_id_card_id_fk;
ALTER TABLE public.token
  ADD  CONSTRAINT token_applied_to_card_id_card_id_fk
  FOREIGN KEY (applied_to_card_id) REFERENCES public.card(id) ON DELETE SET NULL;

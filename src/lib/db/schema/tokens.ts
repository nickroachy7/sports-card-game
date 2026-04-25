import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { card } from "./cards";
import { tokenType } from "./enums";
import { season } from "./identity";

/** DB schema spec §7.1 — conditional bonus token that can be applied before a contest. */
export const token = pgTable(
  "token",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    tokenType: tokenType("token_type").notNull(),
    bonusFp: numeric("bonus_fp", { precision: 10, scale: 2 }).notNull(),
    appliedToCardId: uuid("applied_to_card_id").references(() => card.id),
    // FK → contest(id). Added in a post-migration (circular module dep).
    appliedToContestId: uuid("applied_to_contest_id"),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    acquiredSource: text("acquired_source").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().default(sql`now()`),
    /**
     * Polish spec §198 (Phase 49 Wave 2). True = granted by a pack
     * while user was at token cap; awaits resolution via the
     * TokenOverflowResolveModal. Pending rows don't count toward cap
     * and can't be applied. Resolved by `resolve_pending_token` SQL fn:
     * either flipped to false (kept) or quicksold (consumed).
     */
    isPending: boolean("is_pending").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("token_user_consumed_idx").on(t.userId, t.consumedAt),
    index("token_applied_to_card_idx").on(t.appliedToCardId),
    index("token_contest_consumed_idx").on(t.appliedToContestId, t.consumedAt),
    index("token_season_user_idx").on(t.seasonId, t.userId),
    check(
      "token_applied_both_or_neither",
      sql`(${t.appliedToCardId} IS NULL) = (${t.appliedToContestId} IS NULL)`,
    ),
  ],
);

/** DB schema spec §7.2 — audit log of every token application. */
export const tokenApplication = pgTable(
  "token_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => token.id),
    cardId: uuid("card_id")
      .notNull()
      .references(() => card.id),
    // FK → contest(id). Added in a post-migration.
    contestId: uuid("contest_id").notNull(),
    userId: uuid("user_id").notNull(),
    triggered: boolean("triggered"),
    bonusFpAwarded: numeric("bonus_fp_awarded", { precision: 10, scale: 2 }).notNull().default("0"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("token_application_token_id_uidx").on(t.tokenId),
    index("token_application_card_id_idx").on(t.cardId),
    index("token_application_contest_id_idx").on(t.contestId),
    index("token_application_user_id_idx").on(t.userId),
    index("token_application_card_triggered_idx").on(t.cardId, t.triggered),
  ],
);

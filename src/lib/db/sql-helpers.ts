import { type SQL, sql } from "drizzle-orm";

/**
 * Build a Postgres array literal fragment from a JS array.
 *
 * Drizzle's default `${array}` expansion generates a flattened
 * `($1, $2, ...)` tuple which is a record, not an array. This helper
 * emits `ARRAY[$1, $2, ...]::TYPE[]` (or `'{}'::TYPE[]` for empties),
 * which is what Postgres array columns and `ANY(...)` expect.
 *
 *   asPgArray([1, 2, 3], "int")                 → ARRAY[1, 2, 3]::int[]
 *   asPgArray(["SP", "RP"], "text")             → ARRAY['SP', 'RP']::text[]
 *   asPgArray([], "text")                       → '{}'::text[]
 */
export function asPgArray<T>(items: readonly T[] | null | undefined, pgType: string): SQL {
  if (!items || items.length === 0) {
    return sql.raw(`'{}'::${pgType}[]`);
  }
  const elements = items.map((v) => sql`${v}`);
  return sql`ARRAY[${sql.join(elements, sql`, `)}]::${sql.raw(pgType)}[]`;
}

/** Same as asPgArray but returns NULL when items is null/undefined. */
export function asPgArrayOrNull<T>(items: readonly T[] | null | undefined, pgType: string): SQL {
  if (items === null || items === undefined) {
    return sql.raw(`NULL::${pgType}[]`);
  }
  return asPgArray(items, pgType);
}

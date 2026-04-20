import type { ApiResponse } from "@balldontlie/sdk";

import { withBdlRetry } from "./retry";

/**
 * Cursor-pagination async generator for BDL list endpoints.
 *
 * Yields every row across every page. Each page is fetched through
 * `withBdlRetry` so transient 429/5xx errors don't break the iteration.
 *
 * Usage:
 *   for await (const player of paginate((cursor) =>
 *     bdl.mlb.getActivePlayers({ cursor, per_page: 100 })
 *   )) {
 *     await upsertPlayer(player);
 *   }
 */
export async function* paginate<T>(
  call: (cursor?: number) => Promise<ApiResponse<T[]>>,
): AsyncGenerator<T, void, void> {
  let cursor: number | undefined;
  do {
    const page = await withBdlRetry(() => call(cursor));
    for (const row of page.data) yield row;
    cursor = page.meta?.next_cursor ?? undefined;
  } while (cursor !== undefined);
}

/** Collect an async iterable into an array. Convenience wrapper. */
export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

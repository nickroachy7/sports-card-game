/**
 * Name-matching helpers for MLBAM id backfill — polish spec §28.
 *
 * Extracted from the backfill endpoint so the tricky cases (accent
 * normalization, suffix stripping, Levenshtein edge cases) are
 * unit-testable without HTTP in the loop.
 */

/**
 * Strip accents + trailing suffixes (Jr./Sr./II/III/IV/V) + lower-
 * case. BDL/our DB and MLB Stats API disagree on both conventions;
 * normalize before comparing first/last names.
 */
export function normalizeName(s: string): string {
  // NFD decomposes "ñ" into "n" + combining tilde; strip the
  // combining marks (Unicode category Mn) to collapse back to ASCII.
  const withoutAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Strip common suffixes from the tail.
  const withoutSuffix = withoutAccents.replace(/\s+(jr\.?|sr\.?|ii+|iv|v)$/i, "");
  return withoutSuffix.trim().toLowerCase();
}

/**
 * Standard iterative Levenshtein distance. Used for the fuzzy-match
 * fallback — we require sum-of-distances-on-first-and-last ≤ 2 AND
 * a single candidate, so the bar for accidental matches is
 * effectively "one typo in a name with no near neighbors."
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array(b.length + 1).fill(0);
  const curr: number[] = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j] ?? 0) + 1, // deletion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

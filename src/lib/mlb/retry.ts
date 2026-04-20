import { APIError } from "@balldontlie/sdk";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type BdlRetryOptions = {
  /** Max attempts including the first. Default 3. */
  attempts?: number;
  /** Called before each retry with the error and the upcoming delay. */
  onRetry?: (err: unknown, delayMs: number, attempt: number) => void;
};

/**
 * Run a BDL SDK call with bounded retry for transient failures.
 *
 * Retries:
 *   - 429 rate-limit: exponential 1s / 2s / 4s
 *   - 5xx server:     exponential 0.5s / 1s / 2s
 *
 * Never retried:
 *   - 401 auth / tier errors (config / billing issue — throw immediately)
 *   - 400 validation (our request is wrong — throw)
 *   - 404 not found
 *   - non-APIError exceptions (network errors bubble)
 *
 * Installed @balldontlie/sdk v1.2.2 only exports APIError (not the
 * per-status subclasses the integration spec references), so we branch
 * on `err.status` rather than `instanceof`.
 */
export async function withBdlRetry<T>(
  fn: () => Promise<T>,
  options: BdlRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!(err instanceof APIError)) {
        throw err;
      }

      const status = err.status;
      if (status === 401 || status === 403 || status === 400 || status === 404) {
        throw err;
      }

      if (attempt === attempts - 1) {
        throw err;
      }

      let delay: number;
      if (status === 429) {
        delay = 1000 * 2 ** attempt;
      } else if (status >= 500) {
        delay = 500 * 2 ** attempt;
      } else {
        throw err;
      }

      options.onRetry?.(err, delay, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

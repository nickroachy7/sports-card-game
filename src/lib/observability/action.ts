import * as Sentry from "@sentry/nextjs";

import { getPostHogServer } from "@/lib/observability/posthog-server";

type ActionEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type WrapOptions = {
  /** Stable name, e.g. "quickSellCard" — Sentry transaction name. */
  name: string;
  /** Optional tags for the Sentry span. */
  tags?: Record<string, string>;
};

/**
 * wrapAction — Sentry seam for Server Actions.
 *
 * - Wraps the action body in a Sentry span tagged with its name.
 * - Captures any unhandled exception and converts it to an INTERNAL
 *   envelope so the UI layer never has to handle throws.
 * - Does NOT fire PostHog events; callers use captureServerEvent() at
 *   the right moment (typically after they know the user id + payload).
 */
export function wrapAction<TInput, TData>(
  fn: (input: TInput) => Promise<ActionEnvelope<TData>>,
  options: WrapOptions,
): (input: TInput) => Promise<ActionEnvelope<TData>> {
  return async (input: TInput) => {
    return Sentry.startSpan(
      {
        name: `action.${options.name}`,
        op: "function.server_action",
        attributes: options.tags ?? {},
      },
      async (span) => {
        try {
          const result = await fn(input);
          if (result.ok) {
            span?.setStatus({ code: 1 });
          } else {
            span?.setStatus({ code: 2, message: result.error.code });
          }
          return result;
        } catch (err) {
          Sentry.captureException(err, { tags: { action: options.name } });
          const message = err instanceof Error ? err.message : "Internal error.";
          return {
            ok: false,
            error: { code: "INTERNAL", message },
          } as ActionEnvelope<TData>;
        }
      },
    );
  };
}

/**
 * Fire a PostHog event from a server-side context (Server Action or
 * Server Component). No-ops when NEXT_PUBLIC_POSTHOG_KEY is missing so
 * dev doesn't break. Flushes immediately since Vercel serverless
 * functions don't keep the process alive after the response.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const posthog = getPostHogServer();
  if (!posthog) return;
  try {
    posthog.capture({ distinctId, event, properties: properties ?? {} });
    await posthog.flush().catch(() => undefined);
  } catch (err) {
    Sentry.captureException(err, { tags: { event } });
  }
}

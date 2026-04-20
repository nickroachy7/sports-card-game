import { assertCronAuth } from "@/lib/auth/cron";
import { cronError, cronOk } from "@/lib/auth/cron-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Login-streak evaluation cron — API spec §5.9.
 *
 * Stubbed in Phase 1. When activated (Phase 2 coin-economy work),
 * this iterates `manager_account` rows, reads the session-store login
 * log, increments / resets `current_login_streak_days`, and credits
 * coins from `economy_config.login_streak_rewards` via credit_coins.
 * Scheduled daily 04:30 ET (08:30 UTC).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
    return cronOk(
      { evaluated: 0, credited: 0 },
      {
        stubbed: true,
        message: "Login-streak eval not yet activated — deferred to Phase 2.",
      },
    );
  } catch (err) {
    return cronError(err);
  }
}

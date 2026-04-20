import { expect, test } from "@playwright/test";

/**
 * Phase 1 critical path — roadmap T6.1.
 *
 * Walks a fresh user through:
 *   1. Sign up → /onboarding
 *   2. Fill 3-step onboarding → /lineup
 *   3. Visit /collection (starter bundle visible — depends on M4 roster
 *      sync having run; if player pool is empty the grid shows the
 *      empty state, which is also a valid assertion).
 *   4. Visit /shop → Standard Pack → reveal modal shows ≥ 1 card.
 *   5. Close reveal → back to /collection with at least the new cards.
 *   6. Click first card → /collection/[cardId] with Extend + Quick-sell.
 *
 * Each run creates a unique user so the test is idempotent against local
 * Supabase. Designed to pass against local `supabase start` + `pnpm dev`.
 *
 * We DON'T actually quick-sell or extend in the E2E path — those are
 * covered by vitest + direct psql smoke tests. This spec guards the
 * browser-facing flow end-to-end.
 */

function uniqueEmail(): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${nonce}@test.local`;
}

const PASSWORD = "drafting-secret-123";

test.describe("critical path", () => {
  test("signup → onboarding → shop → pack → collection → detail", async ({ page }) => {
    const email = uniqueEmail();

    // 1. Sign up.
    await page.goto("/signup");
    await expect(page).toHaveTitle(/create account/i);
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /^create account$/i }).click();

    // 2. Onboarding form lands.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /name your team/i })).toBeVisible();

    const teamName = `E2E Squad ${Date.now().toString(36).slice(-6)}`;
    await page.fill("#teamName", teamName);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2: colors (defaults work).
    await expect(page.getByRole("heading", { name: /pick your colors/i })).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3: logo → submit.
    await expect(page.getByRole("heading", { name: /choose a logo/i })).toBeVisible();
    await page.getByRole("button", { name: /^create team$/i }).click();

    // 3. Land on /lineup (app shell).
    await expect(page).toHaveURL(/\/lineup/, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: /collection/i })).toBeVisible();

    // 4. Collection renders (either starter bundle or empty state).
    await page.getByRole("link", { name: /collection/i }).click();
    await expect(page).toHaveURL(/\/collection$/);
    await expect(page.getByRole("heading", { level: 1, name: /collection/i })).toBeVisible();

    // 5. Shop → Daily Pack (free, always-available for a new user).
    await page.getByRole("link", { name: /shop/i }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.getByRole("button", { name: /^claim$/i }).click();

    // Reveal modal opens.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/pack opened/i)).toBeVisible({ timeout: 15_000 });
    // Wait for reveal sequence to finish (≤ 3 cards × 550ms + buffer).
    await page
      .getByRole("button", { name: /reveal all/i })
      .click()
      .catch(() => undefined);
    await page.getByRole("button", { name: /^done$/i }).click({ timeout: 10_000 });

    // 6. Back in Shop or Collection — navigate to collection and find a card.
    await page.getByRole("link", { name: /collection/i }).click();
    await expect(page).toHaveURL(/\/collection$/);

    // Starter bundle OR Daily Pack should have landed at least one card.
    const cardLinks = page.locator('a[href^="/collection/"]');
    const count = await cardLinks.count();
    expect(count).toBeGreaterThan(0);

    // Click the first card → detail page.
    await cardLinks.first().click();
    await expect(page).toHaveURL(/\/collection\/[0-9a-f-]+$/);
    await expect(page.getByRole("tab", { name: /overview/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /extend contract/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /quick-sell/i })).toBeVisible();
  });
});

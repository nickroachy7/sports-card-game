import { expect, test } from "@playwright/test";

/**
 * Polish spec §11.1 — Collection drawer migration E2E.
 *
 * Verifies the non-drag collection drawer paths that P8.1 shipped:
 *   1. Sign up → onboarding → /lineup
 *   2. Claim a daily pack to put at least one card in the collection
 *   3. Visit /collection — URL is /collection with no ?card param
 *   4. Click the first card — URL updates to /collection?card=<uuid>
 *      and the drawer renders with the card-detail content
 *   5. Click the drawer close affordance (ESC) — URL clears back to
 *      /collection
 *   6. Re-visit /collection?card=<id> directly — drawer opens on mount
 *
 * Drag paths (bench → slot, slot swap) remain deferred per ADR-0011.
 */

function uniqueEmail(): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-drawer-${nonce}@test.local`;
}

const PASSWORD = "drafting-secret-123";

test.describe("collection drawer", () => {
  test("click card → drawer opens with ?card URL → close clears", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/signup");
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /^create account$/i }).click();

    // Onboarding.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await page.fill("#teamName", `Drawer Crew ${Date.now().toString(36).slice(-5)}`);
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /^create team$/i }).click();

    await expect(page).toHaveURL(/\/lineup/, { timeout: 15_000 });

    // Claim daily pack for collection fill.
    await page.getByRole("link", { name: /shop/i }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.getByRole("button", { name: /^claim$/i }).click();
    const revealDialog = page.getByRole("dialog");
    await expect(revealDialog.getByText(/pack opened/i)).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("button", { name: /skip all/i })
      .click()
      .catch(() => undefined);
    await page.getByRole("button", { name: /^done$/i }).click({ timeout: 15_000 });

    // Land on collection — no ?card yet.
    await page.getByRole("link", { name: /collection/i }).click();
    await expect(page).toHaveURL(/\/collection$/);

    // Grab the first card — its aria-label is "PlayerName, tier, 15/15 plays".
    const firstCard = page.getByRole("button", { name: /tier,\s*15\/15 plays$/i }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // URL should update with ?card=<uuid>.
    await expect(page).toHaveURL(/\/collection\?card=[0-9a-f-]+/, { timeout: 10_000 });

    // Drawer content should be visible — Card detail heading + action
    // buttons exist inside the drawer.
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: /quick-sell/i })).toBeVisible();
    await expect(drawer.getByRole("button", { name: /extend contract/i })).toBeVisible();

    // Capture the ?card value so we can use it for the direct-link test.
    const url = new URL(page.url());
    const cardId = url.searchParams.get("card");
    expect(cardId).toMatch(/^[0-9a-f-]{36}$/);

    // Close drawer via Escape. URL clears.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/collection$/, { timeout: 5_000 });

    // Direct link re-opens the drawer on mount.
    await page.goto(`/collection?card=${cardId}`);
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByRole("dialog")
        .first()
        .getByRole("button", { name: /quick-sell/i }),
    ).toBeVisible();
  });
});

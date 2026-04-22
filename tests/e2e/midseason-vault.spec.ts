import { expect, test } from "@playwright/test";

/**
 * Polish spec §7 — mid-season vault E2E.
 *
 * Walks a fresh user through the non-drag paths that P7.4 shipped:
 *   1. Sign up → onboarding → /lineup
 *   2. Claim a daily pack to acquire ≥ 1 card
 *   3. Open Collection → pick a card → detail page
 *   4. Click "Add to vault" → navigation to /vault
 *   5. On /vault, confirm the pre-vaulted section lists that card
 *   6. Click "Destroy" → AlertDialog "Destroy" → card dissolves
 *
 * Drag-drop paths (token apply, bench → slot physics) are deliberately
 * skipped per ADR-0011 — Playwright's HTML5 DnD support is fragile
 * and the visual surface is already covered by /palette.
 */

function uniqueEmail(): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-vault-${nonce}@test.local`;
}

const PASSWORD = "drafting-secret-123";

test.describe("mid-season vault", () => {
  test("add to vault → destroy + refund", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/signup");
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /^create account$/i }).click();

    // Onboarding.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await page.fill("#teamName", `Vault Crew ${Date.now().toString(36).slice(-5)}`);
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /^create team$/i }).click();

    await expect(page).toHaveURL(/\/lineup/, { timeout: 15_000 });

    // Claim the daily pack so we have at least one card.
    await page.getByRole("link", { name: /shop/i }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.getByRole("button", { name: /^claim$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/pack opened/i)).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("button", { name: /reveal all/i })
      .click()
      .catch(() => undefined);
    await page.getByRole("button", { name: /^done$/i }).click({ timeout: 10_000 });

    // Open Collection + pick the first card.
    await page.getByRole("link", { name: /collection/i }).click();
    await expect(page).toHaveURL(/\/collection$/);
    const cardLinks = page.locator('a[href^="/collection/"]');
    await expect(cardLinks.first()).toBeVisible();
    const cardHref = await cardLinks.first().getAttribute("href");
    await cardLinks.first().click();
    await expect(page).toHaveURL(/\/collection\/[0-9a-f-]+$/);

    // Capture the player name so we can find the pre-vaulted card afterward.
    const playerName = await page.locator("h1").first().textContent();
    expect(playerName?.trim()).toBeTruthy();

    // Add to vault.
    const vaultBtn = page.getByRole("button", { name: /add to vault/i });
    await expect(vaultBtn).toBeEnabled();
    await vaultBtn.click();

    // Land on /vault with the pre-vaulted section populated.
    await expect(page).toHaveURL(/\/vault/, { timeout: 10_000 });
    await expect(page.getByText(/pre-vaulted cards/i)).toBeVisible();
    // The destroy button carries the refund value. Any digit before "c".
    const destroyBtn = page.getByRole("button", { name: /destroy · \d+c/i }).first();
    await expect(destroyBtn).toBeVisible();

    // Destroy → AlertDialog → Destroy (confirm).
    await destroyBtn.click();
    const confirm = page.getByRole("alertdialog");
    await expect(
      confirm.getByText(new RegExp(`destroy ${escapeRegex(playerName ?? "")}\\?`, "i")),
    ).toBeVisible();
    await confirm.getByRole("button", { name: /^destroy$/i }).click();

    // Post-destroy: either no pre-vaulted cards OR the destroyed card is
    // gone. We assert the card href from collection is no longer present.
    // The dissolve takes ~600ms; wait for the DOM to settle.
    await expect(async () => {
      const hrefs = await page.locator(`a[href="${cardHref}"]`).count();
      expect(hrefs).toBe(0);
    }).toPass({ timeout: 10_000 });
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

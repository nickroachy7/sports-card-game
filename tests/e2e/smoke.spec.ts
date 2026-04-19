import { expect, test } from "@playwright/test";

test("home page serves a 200", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/.+/);
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { email: "sara.khan@demo.openeyes.local", password: process.env.DEMO_ACCOUNT_PASSWORD },
  });
  expect(response.status()).toBe(200);
});

test("production navigation removes standalone anatomy practice and separates queue worklists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Anatomy practice", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await expect(page.locator(".stage-waiting")).toBeVisible();
  await expect(page.locator(".stage-workup")).toBeVisible();
  await expect(page.locator(".stage-dilation")).toBeVisible();
  await expect(page.locator(".stage-consultation")).toBeVisible();

  await page.getByRole("button", { name: "Ophthalmic workup", exact: true }).click();
  await expect(page.locator(".stage-waiting")).toBeVisible();
  await expect(page.locator(".stage-workup")).toBeVisible();
  await expect(page.locator(".stage-dilation")).toBeVisible();
  await expect(page.locator(".stage-consultation")).toHaveCount(0);
});

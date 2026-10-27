import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { email: "sana.qureshi@demo.openeyes.local", password: process.env.DEMO_ACCOUNT_PASSWORD },
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

test("each role's sidebar lists only that role's pages", async ({ browser, baseURL }) => {
  const expected: Record<string, string[]> = {
    "sara.khan": ["Home", "Doctor Event", "Patients", "Prescriptions", "Surgery lifecycle"],
    "aisha.malik": ["Home", "Live queue", "Patients", "Appointments"],
    "sana.qureshi": ["Home", "Live queue", "Ophthalmic workup", "Patients"],
    "omar.siddiqui": ["Home", "Patients", "Appointments", "Management", "Administration"],
    "faisal.noor": ["Home", "Administration", "Audit trail"],
  };
  for (const [account, pages] of Object.entries(expected)) {
    const context = await browser.newContext({ baseURL });
    const response = await context.request.post("/api/auth/login", { headers: { Origin: baseURL! }, data: { email: `${account}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
    expect(response.status()).toBe(200);
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".sidebar nav .nav-item")).toHaveText(pages);
    await context.close();
  }
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { email: "sana.qureshi@demo.openeyes.local", password: process.env.DEMO_ACCOUNT_PASSWORD },
  });
  expect(response.status()).toBe(200);
});

test("one live queue board: pathway stages, and the ready-for-doctor column opens on request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Anatomy practice", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await expect(page.locator(".stage-waiting")).toBeVisible();
  await expect(page.locator(".stage-workup")).toBeVisible();
  await expect(page.locator(".stage-dilation")).toBeVisible();
  // The old Ophthalmic workup page was the same board without this column; it is now one page.
  await expect(page.getByRole("button", { name: "Ophthalmic workup", exact: true })).toHaveCount(0);
  const ready = page.locator(".stage-consultation");
  await expect(ready).toHaveClass(/is-collapsed/);
  await expect(ready.locator(".queue-card")).toHaveCount(0);
  await ready.getByRole("button", { name: "Show", exact: true }).click();
  await expect(ready.locator(".queue-card").first()).toBeVisible();
  // The choice is remembered for the next visit.
  await page.reload();
  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await expect(page.locator(".stage-consultation .queue-card").first()).toBeVisible();
  await page.locator(".stage-consultation").getByRole("button", { name: "Hide", exact: true }).click();
});

test("each role's sidebar lists only that role's pages", async ({ browser, baseURL }) => {
  const expected: Record<string, string[]> = {
    "sara.khan": ["Home", "Doctor Event", "Patients", "Prescriptions", "Surgery lifecycle"],
    "aisha.malik": ["Home", "Live queue", "Patients", "Appointments"],
    "sana.qureshi": ["Home", "Live queue", "Patients"],
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

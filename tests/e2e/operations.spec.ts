import { test, expect, type APIRequestContext } from "@playwright/test";
const emails = { auditor: "maryam.saeed", reception: "aisha.malik" };
async function login(request: APIRequestContext, origin: string, role: keyof typeof emails) {
  const response = await request.post("/api/auth/login", { headers: { Origin: origin }, data: { email: `${emails[role]}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
}

test("active operations screens enforce authentication and retired endpoints are unavailable", async ({ page, baseURL }) => {
  expect((await page.request.get("/api/operations/management")).status()).toBe(401);
  await login(page.request, baseURL!, "reception");
  for (const resource of ["surgery", "management"]) expect((await page.request.get(`/api/operations/${resource}`)).status()).toBe(403);
  for (const resource of ["inventory", "billing", "dispensing"]) expect((await page.request.get(`/api/operations/${resource}`)).status()).toBe(404);
  expect((await page.request.get("/api/previews/inventory")).status()).toBe(404);
  await login(page.request, baseURL!, "auditor");
  expect((await page.request.get("/api/operations/management")).status()).toBe(200);
  expect((await page.request.get("/api/operations/surgery")).status()).toBe(200);
});

test("audit exposes only active groups and rejects the retired preview filter", async ({ page, baseURL }) => {
  await login(page.request, baseURL!, "auditor");
  await page.goto("/");
  await page.getByRole("button", { name: "Audit trail", exact: true }).click();
  await page.getByLabel("Audit action group").selectOption("examples");
  await expect(page.getByLabel("Audit action group").locator("option")).toHaveCount(3);
  expect((await page.request.get("/api/audit?group=previews")).status()).toBe(400);
});

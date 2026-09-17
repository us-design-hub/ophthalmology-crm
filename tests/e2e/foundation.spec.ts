import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { privateHash } from "../../src/server/crypto";
import { encryptIdentifier, identifierIndex } from "../../src/server/crypto";

const emails = { reception: "aisha.malik@demo.openeyes.local", doctor: "sara.khan@demo.openeyes.local", auditor: "maryam.saeed@demo.openeyes.local" };
async function signIn(request: APIRequestContext, baseURL: string, role: keyof typeof emails = "reception") {
  const response = await request.post("/api/auth/login", { headers: { Origin: baseURL }, data: { email: emails[role], password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
}
function patientInput() {
  const suffix = String(Date.now()).slice(-7);
  return { givenName: "Amina", familyName: `Verification${suffix}`, gender: "female", dob: "1965-04-12", dobEstimated: false, phone: `0300${suffix}`, identifierType: "cnic", identifier: `00000${suffix}0`, city: "Karachi", allergy: "Synthetic test flag" };
}

test("named reception login registers a patient and the masked record survives reload", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/login-desktop.png", fullPage: true });
  await page.getByTestId("demo-account-aisha.malik").click();
  await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The right record. The first time.", exact: true })).toBeVisible();
  await expect(page.getByTestId("patient-total")).toBeVisible();
  await page.screenshot({ path: "test-results/patient-registry-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Register patient", exact: true }).click();
  const input = patientInput();
  const dialog = page.getByRole("dialog", { name: "Register a new patient", exact: true });
  for (const key of ["givenName", "familyName", "dob", "phone", "identifier", "city", "allergy"] as const) await dialog.locator(`[name="${key}"]`).fill(input[key]);
  await dialog.locator('[name="gender"]').selectOption("female");
  await dialog.getByRole("button", { name: "Check & review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review before creating", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create patient record", exact: true }).click();
  const fullName = `${input.givenName} ${input.familyName}`;
  const record = page.getByRole("dialog", { name: fullName, exact: true });
  await expect(record).toBeVisible();
  await expect(record).toContainText("Saved to the patient registry");
  await expect(record).toContainText(input.allergy);
  await expect(record).toContainText(`+92${input.phone.slice(1)}`);
  await expect(record).not.toContainText(input.identifier);
  await page.screenshot({ path: "test-results/patient-record.png", fullPage: true });
  await record.getByRole("button", { name: "Close patient record", exact: true }).click();
  await page.reload();
  await page.getByRole("textbox", { name: "Search patients", exact: true }).fill(input.identifier);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("patient-total")).toHaveText("1");
  await expect(page.getByRole("button", { name: fullName, exact: false }).first()).toBeVisible();
  expect(page.url()).not.toContain(input.identifier);
});

test("unauthenticated, forged role, auditor, and doctor requests enforce server permissions", async ({ page, baseURL }) => {
  expect((await page.request.get("/api/patients")).status()).toBe(401);
  await signIn(page.request, baseURL!, "doctor");
  expect((await page.request.get("/api/patients")).status()).toBe(200);
  const forbidden = await page.request.post("/api/patients", { headers: { Origin: baseURL!, "X-Role": "hospital_admin" }, data: patientInput() });
  expect(forbidden.status()).toBe(403);
  await page.goto("/");
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await expect(page.getByRole("button", { name: "Register patient", exact: true })).toHaveCount(0);
  await page.request.post("/api/auth/logout", { headers: { Origin: baseURL! } });
  await signIn(page.request, baseURL!, "auditor");
  expect((await page.request.get("/api/patients")).status()).toBe(403);
  expect((await page.request.get("/api/audit")).status()).toBe(200);
});

test("CSRF checks, validation, and duplicate preflight cannot be bypassed", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!);
  const input = patientInput();
  expect((await page.request.post("/api/patients", { data: input })).status()).toBe(403);
  expect((await page.request.post("/api/patients", { headers: { Origin: "https://untrusted.invalid" }, data: input })).status()).toBe(403);
  const noReview = await page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: input });
  expect(noReview.status()).toBe(409); expect((await noReview.json()).error).toBe("reviewRequired");
  expect((await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: { ...input, dob: "2026-02-30" } })).status()).toBe(400);
  expect((await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: { ...input, tenantId: randomUUID() } })).status()).toBe(400);
  const review = await (await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: input })).json();
  const changed = await page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: { ...input, givenName: "Changed", duplicateReviewToken: review.reviewToken } });
  expect(changed.status()).toBe(409); expect((await changed.json()).error).toBe("reviewRequired");
});

test("exact identifier duplicates are blocked; shared-phone registrations require an audited reason", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!);
  const input = { ...patientInput(), phone: "03001000000", identifier: "0000000000010" };
  const exact = await (await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: input })).json();
  expect(exact.exactMatch).toBe(true);
  const blocked = await page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: { ...input, duplicateReviewToken: exact.reviewToken, duplicateReason: "Cannot override personal identifier" } });
  expect(blocked.status()).toBe(409); expect((await blocked.json()).error).toBe("duplicateIdentifier");
  const shared = { ...patientInput(), phone: "03001000000" };
  const review = await (await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: shared })).json();
  expect(review.exactMatch).toBe(false); expect(review.candidates.length).toBeGreaterThan(0);
  const missingReason = await page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: { ...shared, duplicateReviewToken: review.reviewToken } });
  expect(missingReason.status()).toBe(400);
  const reason = "Different family member sharing the same household phone";
  const created = await page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: { ...shared, duplicateReviewToken: review.reviewToken, duplicateReason: reason } });
  expect(created.status()).toBe(201);
  const patient = (await created.json()).patient;
  await signIn(page.request, baseURL!, "auditor");
  const audit = await (await page.request.get("/api/audit")).json();
  expect(audit.events.some((event: { action: string; entityId: string; metadata: { duplicateReason?: string } }) => event.action === "patient.created" && event.entityId === patient.id && event.metadata.duplicateReason === reason)).toBe(true);
  expect(JSON.stringify(audit)).not.toContain(shared.identifier);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every action has an author.", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({ path: "test-results/audit-desktop.png", fullPage: true });
});

test("logout revokes the bearer session and idle expiry is enforced in the database", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!, "doctor");
  const oldCookie = (await page.context().cookies()).find(cookie => cookie.name === "openeyes_session")!;
  expect(oldCookie.httpOnly).toBe(true); expect(oldCookie.sameSite).toBe("Lax");
  await page.request.post("/api/auth/logout", { headers: { Origin: baseURL! } });
  expect((await page.request.get("/api/auth/session", { headers: { Cookie: `openeyes_session=${oldCookie.value}` } })).status()).toBe(401);
  await signIn(page.request, baseURL!, "doctor");
  const current = (await page.context().cookies()).find(cookie => cookie.name === "openeyes_session")!;
  const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL }); await db.connect();
  try { await db.query("UPDATE app.session SET last_seen_at=now()-interval '16 minutes' WHERE token_hash=$1", [privateHash(current.value)]); }
  finally { await db.end(); }
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  expect((await page.request.get("/api/patients")).status()).toBe(401);
});

test("repeated invalid credentials are throttled without revealing account existence", async ({ page, baseURL }) => {
  const email = `unassigned-${randomUUID()}@demo.openeyes.local`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await page.request.post("/api/auth/login", { headers: { Origin: baseURL! }, data: { email, password: "Incorrect-password-example" } });
    expect(response.status()).toBe(401); expect((await response.json()).error).toBe("invalidCredentials");
  }
  expect((await page.request.post("/api/auth/login", { headers: { Origin: baseURL! }, data: { email, password: "Incorrect-password-example" } })).status()).toBe(429);
});

test("registration form, registry, and login remain usable at tablet size", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await signIn(page.request, baseURL!);
  await page.goto("/");
  await expect(page.getByTestId("patient-total")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Register patient", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/registration-tablet.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog!.width).toBeLessThanOrEqual(390);
});

test("concurrent submissions create one record with a unique MRN", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!);
  const input = patientInput();
  const review = await (await page.request.post("/api/patients/duplicates", { headers: { Origin: baseURL! }, data: input })).json();
  const submit = () => page.request.post("/api/patients", { headers: { Origin: baseURL! }, data: { ...input, duplicateReviewToken: review.reviewToken } });
  const results = await Promise.all([submit(), submit()]);
  expect(results.map(response => response.status()).sort()).toEqual([201, 409]);
  const search = await (await page.request.post("/api/patients/search", { headers: { Origin: baseURL! }, data: { query: input.identifier } })).json();
  expect(search.total).toBe(1);
  expect(search.patients[0].mrn).toMatch(/^DEH-\d{2}-\d{6}$/);
});

test("an existing patient from another hospital returns 404 without exposing data", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!);
  if (!process.env.DATABASE_ADMIN_URL?.includes("/openeyes_demo_test")) throw new Error("Fixture requires the dedicated test database");
  const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL }); await db.connect();
  const tenantId = randomUUID(), patientId = randomUUID(), userId = randomUUID(), facilityId = randomUUID();
  try {
    await db.query("BEGIN");
    await db.query("INSERT INTO app.tenant(id,code,name,mrn_prefix,is_demo) VALUES($1,$2,'API isolation fixture','ISO',true)", [tenantId, `TEST-${tenantId}`]);
    await db.query("INSERT INTO app.facility(id,tenant_id,name,type) VALUES($1,$2,'Fixture','clinic')", [facilityId, tenantId]);
    await db.query("INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash) VALUES($1,$2,'fixture@test.invalid','Fixture','Fixture','not-a-login-hash')", [userId, tenantId]);
    await db.query(`INSERT INTO app.patient(id,tenant_id,mrn,given_name,dob,gender,phone_e164,identifier_type,identifier_encrypted,identifier_blind_index,identifier_last4,created_by,created_facility_id)
      VALUES($1,$2,'ISO-API','Isolated API Patient','1970-01-01','unknown','+923009999999','cnic',$3,$4,'0000',$5,$6)`, [patientId, tenantId, encryptIdentifier(tenantId, "cnic", "0000000000000"), identifierIndex(tenantId, "cnic", "0000000000000"), userId, facilityId]);
    await db.query("COMMIT");
    const response = await page.request.get(`/api/patients/${patientId}`);
    expect(response.status()).toBe(404); expect(await response.json()).toEqual({ error: "patientNotFound" });
    const search = await (await page.request.post("/api/patients/search", { headers: { Origin: baseURL! }, data: { query: "ISO-API" } })).json();
    expect(search.total).toBe(0);
  } finally {
    await db.query("ROLLBACK");
    // Remove only the exact synthetic fixture IDs from the isolated test database.
    await db.query("DELETE FROM app.patient WHERE id=$1 AND tenant_id=$2", [patientId, tenantId]);
    await db.query("DELETE FROM app.user_account WHERE id=$1 AND tenant_id=$2", [userId, tenantId]);
    await db.query("DELETE FROM app.facility WHERE id=$1 AND tenant_id=$2", [facilityId, tenantId]);
    await db.query("DELETE FROM app.tenant WHERE id=$1 AND code=$2", [tenantId, `TEST-${tenantId}`]);
    await db.end();
  }
});

test("disabled accounts immediately lose access to existing sessions", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!, "doctor");
  const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL }); await db.connect();
  try {
    await db.query("UPDATE app.user_account SET status='disabled' WHERE email=$1 AND tenant_id=(SELECT id FROM app.tenant WHERE code='DEMO')", [emails.doctor]);
    expect((await page.request.get("/api/auth/session")).status()).toBe(401);
    expect((await page.request.get("/api/patients")).status()).toBe(401);
  } finally {
    await db.query("UPDATE app.user_account SET status='active' WHERE email=$1 AND tenant_id=(SELECT id FROM app.tenant WHERE code='DEMO')", [emails.doctor]);
    await db.end();
  }
});

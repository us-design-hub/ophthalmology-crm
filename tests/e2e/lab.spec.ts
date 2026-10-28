import { test, expect, type APIRequestContext } from "@playwright/test";

// BP and blood sugar run alongside the queue: ordered automatically at check-in,
// recorded by the lab assistant, and shown to the doctor.
const people = { aisha: "aisha.malik", hira: "hira.saleem", nadia: "nadia.raza", sara: "sara.khan" } as const;
async function signIn(request: APIRequestContext, baseURL: string, who: keyof typeof people) {
  const response = await request.post("/api/auth/login", { headers: { Origin: baseURL }, data: { email: `${people[who]}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
}
const post = (request: APIRequestContext, baseURL: string, path: string, data: unknown) => request.post(path, { headers: { Origin: baseURL }, data });
type Lab = { test: string; status: string; abnormal: boolean | null };
/** Registers a patient and sends them to today's General Ophthalmology queue. */
async function walkIn(request: APIRequestContext, baseURL: string, patient: Record<string, unknown>) {
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const input = { givenName: "Lab", familyName: `Check${suffix}`, gender: "female", phone: `0302${suffix.slice(-7)}`, ...patient };
  const review = await (await post(request, baseURL, "/api/patients/duplicates", input)).json();
  const created = await post(request, baseURL, "/api/patients", { ...input, duplicateReviewToken: review.reviewToken, ...(review.candidates.length ? { duplicateReason: "Synthetic lab test record" } : {}) });
  expect(created.status(), await created.text()).toBe(201);
  const { patient: saved } = await created.json() as { patient: { id: string; mrn: string } };
  const clinic = ((await (await request.get("/api/intake/clinics")).json()).clinics as { id: string; name: string }[]).find(value => value.name === "General Ophthalmology")!;
  const queued = await post(request, baseURL, "/api/intake/walkin", { patientId: saved.id, facilityId: clinic.id, doctorId: null });
  expect(queued.status(), await queued.text()).toBe(201);
  const encounter = ((await (await request.get("/api/intake/queue")).json()).encounters as { id: string; mrn: string; labs: Lab[] }[]).find(item => item.mrn === saved.mrn)!;
  return { ...saved, encounterId: encounter.id, labs: encounter.labs };
}

test("check-in orders sugar for diabetics and BP from age 40; others get no tests", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!, "aisha");
  const diabetic = await walkIn(page.request, baseURL!, { dob: "1975-01-15", medicalConditions: ["diabetes"] });
  expect(diabetic.labs.map(lab => [lab.test, lab.status])).toEqual([["bp", "pending"], ["sugar", "pending"]]);
  const young = await walkIn(page.request, baseURL!, { dob: "2000-06-01" });
  expect(young.labs).toEqual([]);
});

test("the lab assistant records BP and sugar, out-of-range values are flagged, and the doctor sees them", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const desk = await browser.newContext(), lab = await browser.newContext(), doctor = await browser.newContext();
  try {
    await signIn(desk.request, baseURL!, "aisha");
    const visit = await walkIn(desk.request, baseURL!, { dob: "1970-03-10", medicalConditions: ["diabetes", "hypertension"] });
    await signIn(lab.request, baseURL!, "hira");
    const page = await lab.newPage(); await page.goto("/");
    await expect(page.locator(".sidebar nav .nav-item")).toHaveText(["Home", "Laboratory"]);
    await page.getByRole("button", { name: "Laboratory", exact: true }).click();
    const row = page.getByTestId(`lab-${visit.encounterId}`);
    await expect(row).toContainText("Hypertension");
    await row.getByLabel("Systolic (upper number)", { exact: true }).fill("150");
    await row.getByLabel("Diastolic (lower number)", { exact: true }).fill("95");
    await expect(row.locator(".lab-flag")).toHaveText("Out of range");
    await row.locator("form").filter({ hasText: "Blood pressure" }).getByRole("button", { name: "Save", exact: true }).click();
    await expect(row).toContainText("150/95 mmHg");
    await row.getByLabel("Blood sugar in mg/dL", { exact: true }).fill("110");
    await row.locator("form").filter({ hasText: "Blood sugar" }).getByRole("button", { name: "Save", exact: true }).click();
    // Both tests done: the visit leaves the to-do list and appears under Done today.
    await expect(row).toHaveCount(0);
    await page.getByRole("tab", { name: /Done today/ }).click();
    await expect(page.getByTestId(`lab-${visit.encounterId}`)).toContainText("110 mg/dL");

    await signIn(doctor.request, baseURL!, "sara");
    const detail = await (await doctor.request.get(`/api/clinical/detail?encounterId=${visit.encounterId}`)).json();
    expect(detail.encounter.labs).toMatchObject([{ test: "bp", status: "done", abnormal: true, result: { systolic: 150, diastolic: 95 } }, { test: "sugar", status: "done", abnormal: false }]);
  } finally { await desk.close(); await lab.close(); await doctor.close(); }
});

test("only the lab records results, clinical staff add tests, and a skipped test keeps its reason", async ({ browser, baseURL }) => {
  const desk = await browser.newContext(), nurse = await browser.newContext(), lab = await browser.newContext();
  try {
    await signIn(desk.request, baseURL!, "aisha");
    const visit = await walkIn(desk.request, baseURL!, { dob: "1998-09-09" });
    await signIn(nurse.request, baseURL!, "nadia");
    expect((await post(nurse.request, baseURL!, "/api/lab/order", { encounterId: visit.encounterId, test: "sugar" })).status()).toBe(201);
    expect(await (await post(nurse.request, baseURL!, "/api/lab/order", { encounterId: visit.encounterId, test: "sugar" })).json()).toEqual({ ordered: false });
    await signIn(lab.request, baseURL!, "hira");
    const order = ((await (await lab.request.get("/api/lab/worklist")).json()).orders as { id: string; version: number; encounterId: string; reasons: string[] }[]).find(item => item.encounterId === visit.encounterId)!;
    expect(order.reasons).toEqual(["manual"]);
    expect((await post(nurse.request, baseURL!, "/api/lab/result", { id: order.id, version: order.version, result: { value: 120, kind: "random" } })).status()).toBe(403);
    expect((await post(lab.request, baseURL!, "/api/lab/order", { encounterId: visit.encounterId, test: "bp" })).status()).toBe(403);
    expect((await post(lab.request, baseURL!, "/api/lab/result", { id: order.id, version: order.version, result: { value: 5, kind: "random" } })).status()).toBe(400);
    expect((await post(lab.request, baseURL!, "/api/lab/not-done", { id: order.id, version: order.version, note: "Patient refused the finger prick" })).status()).toBe(200);
    const queue = (await (await desk.request.get("/api/intake/queue")).json()).encounters as { id: string; labs: (Lab & { note: string })[] }[];
    expect(queue.find(item => item.id === visit.encounterId)!.labs).toMatchObject([{ test: "sugar", status: "not_done", note: "Patient refused the finger prick" }]);
  } finally { await desk.close(); await nurse.close(); await lab.close(); }
});

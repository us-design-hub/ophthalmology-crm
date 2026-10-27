import { test, expect, type APIRequestContext } from "@playwright/test";

// Every arrival is registered at reception: booked, walk-in or emergency.
const people = { aisha: "aisha.malik", bilal: "bilal.ahmed", sara: "sara.khan" } as const;
async function signIn(request: APIRequestContext, baseURL: string, who: keyof typeof people) {
  const response = await request.post("/api/auth/login", { headers: { Origin: baseURL }, data: { email: `${people[who]}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
}
const post = (request: APIRequestContext, baseURL: string, path: string, data: unknown) => request.post(path, { headers: { Origin: baseURL }, data });
const hold = async (request: APIRequestContext, baseURL: string) => (await (await post(request, baseURL, "/api/patients/mrn-hold", {})).json()).mrn as string;
const release = (request: APIRequestContext, baseURL: string) => request.delete("/api/patients/mrn-hold", { headers: { Origin: baseURL } });
function minimalPatient(given: string) {
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  return { givenName: given, familyName: `Desk${suffix}`, gender: "female", dob: "1990-03-02", phone: `0301${suffix.slice(-7)}` };
}
async function register(request: APIRequestContext, baseURL: string, input: Record<string, unknown>) {
  const review = await (await post(request, baseURL, "/api/patients/duplicates", input)).json();
  const created = await post(request, baseURL, "/api/patients", { ...input, duplicateReviewToken: review.reviewToken, ...(review.candidates.length ? { duplicateReason: "Synthetic reception test record" } : {}) });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()).patient as { id: string; mrn: string; identifierMasked: string };
}
async function clinic(request: APIRequestContext, name: string) {
  return ((await (await request.get("/api/intake/clinics")).json()).clinics as { id: string; name: string; doctors: { id: string; name: string }[] }[]).find(value => value.name === name)!;
}

test("held MR numbers are unique per receptionist and a cancelled number is reissued, leaving no gaps", async ({ browser, baseURL }) => {
  const aisha = await browser.newContext(), bilal = await browser.newContext();
  try {
    await signIn(aisha.request, baseURL!, "aisha"); await signIn(bilal.request, baseURL!, "bilal");
    const first = await hold(aisha.request, baseURL!);
    expect(await hold(aisha.request, baseURL!)).toBe(first); // renewing keeps the same number
    const second = await hold(bilal.request, baseURL!);
    expect(second).not.toBe(first);
    // Aisha cancels; Bilal cancels too, then opens a new form and is given the lowest free number.
    await release(aisha.request, baseURL!); await release(bilal.request, baseURL!);
    expect(await hold(bilal.request, baseURL!)).toBe([first, second].sort()[0]);
    // The number on the form is the one the record is saved with, and needs no national ID.
    const shown = await hold(bilal.request, baseURL!);
    const patient = await register(bilal.request, baseURL!, minimalPatient("NoId"));
    expect(patient.mrn).toBe(shown);
    expect(patient.identifierMasked).toBe("");
    // The other cancelled number is next in line for anyone.
    const remaining = [first, second].sort()[1];
    expect(await hold(aisha.request, baseURL!)).toBe(remaining);
    await release(aisha.request, baseURL!);
  } finally { await aisha.close(); await bilal.close(); }
});

test("a walk-in can wait without a doctor and is assigned one from the queue", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!, "aisha");
  const patient = await register(page.request, baseURL!, minimalPatient("Unassigned"));
  const cornea = await clinic(page.request, "Cornea");
  const queued = await post(page.request, baseURL!, "/api/intake/walkin", { patientId: patient.id, facilityId: cornea.id, doctorId: null });
  expect(queued.status(), await queued.text()).toBe(201);
  const find = async () => ((await (await page.request.get("/api/intake/queue")).json()).encounters as { id: string; mrn: string; doctorId: string | null; version: number; stage: string }[]).find(item => item.mrn === patient.mrn)!;
  const waiting = await find();
  expect(waiting).toMatchObject({ doctorId: null, stage: "waiting" });
  await page.goto("/");
  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  const card = page.getByTestId(`queue-${waiting.id}`);
  await expect(card).toBeVisible();
  await card.getByLabel("Assign doctor", { exact: true }).selectOption({ label: cornea.doctors[0].name });
  await expect.poll(async () => (await find()).doctorId).toBe(cornea.doctors[0].id);
});

test("an emergency is registered with the essentials only and a doctor takes it from the top of the list", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const desk = await browser.newContext(), doctor = await browser.newContext();
  try {
    await signIn(desk.request, baseURL!, "aisha");
    const page = await desk.newPage(); await page.goto("/");
    await page.getByRole("button", { name: "Register patient", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Register a new patient", exact: true });
    await expect(dialog.getByTestId("held-mrn")).toContainText(/-\d{2}-\d{6}$/);
    await dialog.getByRole("radio", { name: "Emergency", exact: true }).click();
    await dialog.getByLabel("Chemical injury", { exact: true }).check();
    await expect(dialog.getByText(/Start rinsing the eye/)).toBeVisible();
    const name = `Unknown${String(Date.now()).slice(-6)}`;
    await dialog.locator('[name="givenName"]').fill(name);
    await dialog.locator('[name="gender"]').selectOption("male");
    await dialog.locator('[name="age"]').fill("35");
    await dialog.locator('[name="queueClinic"]').selectOption({ label: "Cornea" });
    await dialog.getByRole("button", { name: "Check & review", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Chemical injury");
    await page.getByRole("button", { name: "Register emergency", exact: true }).click();
    const banner = page.locator(".registration-success");
    await expect(banner).toContainText("Emergency registered");
    const mrn = (await banner.locator("strong").innerText()).split(" · ").at(-1)!;
    const queue = (await (await desk.request.get("/api/intake/queue")).json()).encounters as { mrn: string; visitType: string; stage: string; priority: string; doctorId: string | null; emergencyReason: string }[];
    expect(queue.find(item => item.mrn === mrn)).toMatchObject({ visitType: "emergency", stage: "consultation", priority: "urgent", doctorId: null, emergencyReason: "chemical_injury" });

    await signIn(doctor.request, baseURL!, "sara");
    const list = await doctor.newPage(); await list.goto("/");
    const card = list.locator(".clinical-encounter").filter({ hasText: mrn });
    await expect(card).toContainText("Emergency · Chemical injury");
    await expect(list.locator(".clinical-encounter").first()).toHaveClass(/is-emergency/);
    await card.getByRole("button", { name: "Take this patient", exact: true }).click();
    await expect(list.getByRole("dialog")).toContainText(mrn);
  } finally { await desk.close(); await doctor.close(); }
});

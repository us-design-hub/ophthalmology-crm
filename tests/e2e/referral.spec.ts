import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";

// Patients sent by an outside doctor for machine tests only: reception records
// the referral, a senior technician confirms, the operator runs the tests, the
// visit closes itself and reception prints the report.
// Bilal registers here: other files register many patients as Aisha, and registration is rate-limited per person.
const people = { reception: "bilal.ahmed", nurse: "nadia.raza", senior: "sana.qureshi", operator: "imran.shah" } as const;
type Who = keyof typeof people;
const post = (request: APIRequestContext, baseURL: string, path: string, data: unknown) => request.post(path, { headers: { Origin: baseURL }, data });
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("synthetic referral letter")]);
async function contexts(browser: Browser, baseURL: string, who: Who[]) {
  const map = {} as Record<Who, APIRequestContext>; const opened: import("@playwright/test").BrowserContext[] = [];
  for (const person of who) {
    const context = await browser.newContext(); opened.push(context);
    const response = await context.request.post("/api/auth/login", { headers: { Origin: baseURL }, data: { email: `${people[person]}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
    expect(response.status()).toBe(200); map[person] = context.request;
  }
  return { map, opened, close: () => Promise.all(opened.map(context => context.close())) };
}
async function newPatient(request: APIRequestContext, baseURL: string) {
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const input = { givenName: "Referral", familyName: `Check${suffix}`, gender: "female", dob: "1979-07-07", phone: `0304${suffix.slice(-7)}` };
  const review = await (await post(request, baseURL, "/api/patients/duplicates", input)).json();
  const created = await post(request, baseURL, "/api/patients", { ...input, duplicateReviewToken: review.reviewToken, ...(review.candidates.length ? { duplicateReason: "Synthetic referral record" } : {}) });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()).patient as { id: string; mrn: string; givenName: string; familyName: string };
}
const machineId = async (request: APIRequestContext, name: string) => ((await (await request.get("/api/machines/list")).json()).machines as { id: string; name: string }[]).find(item => item.name === name)!.id;
const clinicId = async (request: APIRequestContext, name: string) => ((await (await request.get("/api/intake/clinics")).json()).clinics as { id: string; name: string }[]).find(item => item.name === name)!.id;
type Visit = { id: string; version: number; stage: string; visitType: string; referralDoctor: string; machines: { id: string; version: number; machine: string; machineId: string; status: string }[] };
const queued = async (request: APIRequestContext, id: string) => ((await (await request.get("/api/intake/queue")).json()).encounters as Visit[]).find(item => item.id === id);

test("a referral waits for confirmation, runs only the confirmed tests and closes itself when they are done", async ({ browser, baseURL }) => {
  const { map, close } = await contexts(browser, baseURL!, ["reception", "nurse", "senior", "operator"]);
  try {
    const patient = await newPatient(map.reception, baseURL!);
    const [oct, fundus, field] = [await machineId(map.reception, "OCT"), await machineId(map.reception, "Fundus camera"), await machineId(map.reception, "Visual field analyser")];
    const registered = await post(map.reception, baseURL!, "/api/machines/referral", { patientId: patient.id, facilityId: await clinicId(map.reception, "Retina"), referralDoctor: "Dr. Outside Referrer", referralSource: "City Eye Clinic", tests: [{ machineId: oct, eye: "OU" }, { machineId: fundus, eye: "OD" }] });
    expect(registered.status(), await registered.text()).toBe(201);
    const { id } = await registered.json();
    const letter = await map.reception.post("/api/referrals/letter", { headers: { Origin: baseURL! }, multipart: { encounterId: id, file: { name: "letter.png", mimeType: "image/png", buffer: PNG } } });
    expect(letter.status(), await letter.text()).toBe(201);

    let visit = (await queued(map.senior, id))!;
    expect(visit).toMatchObject({ visitType: "test_only", stage: "waiting", referralDoctor: "Dr. Outside Referrer" });
    expect(visit.machines.map(order => order.status)).toEqual(["requested", "requested"]);
    // Nothing runs before a senior technician confirms.
    expect((await post(map.operator, baseURL!, "/api/machines/result", { id: visit.machines[0].id, version: visit.machines[0].version, findings: "Too early" })).status()).toBe(409);
    expect((await post(map.nurse, baseURL!, "/api/machines/confirm-referral", { encounterId: id, version: visit.version, tests: [{ machineId: oct, eye: "OU" }] })).status()).toBe(403);
    // The senior keeps OCT, drops the fundus photo (so no dilation) and adds a visual field.
    const confirmed = await post(map.senior, baseURL!, "/api/machines/confirm-referral", { encounterId: id, version: visit.version, tests: [{ machineId: oct, eye: "OU" }, { machineId: field, eye: "OU" }] });
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    expect(await confirmed.json()).toEqual({ stage: "testing" });
    visit = (await queued(map.senior, id))!;
    expect(Object.fromEntries(visit.machines.map(order => [order.machine, order.status]))).toEqual({ "OCT": "ordered", "Visual field analyser": "ordered", "Fundus camera": "declined" });

    for (const order of visit.machines.filter(item => item.status === "ordered")) {
      expect((await post(map.operator, baseURL!, "/api/machines/result", { id: order.id, version: order.version, findings: `${order.machine} within normal limits` })).status()).toBe(200);
    }
    // No hospital doctor: the visit has ended and is ready for its printed report.
    expect(await queued(map.senior, id)).toBeUndefined();
    const report = ((await (await map.reception.get("/api/machines/referrals")).json()).visits as { id: string; closedAt: string | null; letters: unknown[] }[]).find(item => item.id === id)!;
    expect(report.closedAt).toBeTruthy();
    expect(report.letters).toHaveLength(1);
  } finally { await close(); }
});

test("reception registers a new patient for machine tests only, then prints the report once the tests are done", async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const { map, opened, close } = await contexts(browser, baseURL!, ["reception", "senior", "operator"]);
  try {
    const page = await opened[0].newPage(); await page.goto("/");
    await page.getByRole("button", { name: "Register patient", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Register a new patient", exact: true });
    await dialog.getByRole("radio", { name: "Machine test only", exact: true }).click();
    const suffix = String(Date.now()).slice(-7);
    await dialog.locator('[name="givenName"]').fill("Printed"); await dialog.locator('[name="familyName"]').fill(`Referral${suffix}`);
    await dialog.locator('[name="gender"]').selectOption("male"); await dialog.locator('[name="dob"]').fill("1966-01-20");
    await dialog.locator('[name="phone"]').fill(`0305${suffix}`);
    await dialog.locator('[name="referralDoctor"]').fill("Dr. Family Physician");
    await dialog.locator('[name="referralClinic"]').selectOption({ label: "Glaucoma" });
    await dialog.getByRole("checkbox", { name: /^OCT/ }).check();
    await dialog.locator(".referral-file input[type=file]").setInputFiles({ name: "referral.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Check & review", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Dr. Family Physician");
    await page.getByRole("button", { name: "Register for tests", exact: true }).click();
    await expect(page.locator(".registration-success")).toContainText("Registered for machine tests");
    const mrn = (await page.locator(".registration-success strong").innerText()).split(" · ").at(-1)!;

    const visit = ((await (await map.senior.get("/api/intake/queue")).json()).encounters as (Visit & { mrn: string })[]).find(item => item.mrn === mrn)!;
    expect(visit.visitType).toBe("test_only");
    await page.getByRole("button", { name: "Live queue", exact: true }).click();
    const row = page.getByTestId(`referral-${visit.id}`);
    await expect(row).toContainText("Tests in progress");
    await expect(row.getByRole("button", { name: "Print report", exact: true })).toBeDisabled();

    expect((await post(map.senior, baseURL!, "/api/machines/confirm-referral", { encounterId: visit.id, version: visit.version, tests: [{ machineId: visit.machines[0].machineId, eye: "OU" }] })).status()).toBe(200);
    const order = (await queued(map.senior, visit.id))!.machines[0];
    expect((await post(map.operator, baseURL!, "/api/machines/result", { id: order.id, version: order.version, findings: "Healthy optic nerve fibre layer" })).status()).toBe(200);

    await expect(row).toContainText("Ready to print", { timeout: 15_000 });
    await page.evaluate(() => { window.print = () => undefined; });
    await row.getByRole("button", { name: "Print report", exact: true }).click();
    await expect(page.locator(".print-report")).toContainText("Healthy optic nerve fibre layer");
    await expect(page.locator(".print-report")).toContainText("Dr. Family Physician");
  } finally { await close(); }
});

test("a returning patient can be sent for machine tests from their record", async ({ browser, baseURL }) => {
  const { map, opened, close } = await contexts(browser, baseURL!, ["reception"]);
  try {
    const patient = await newPatient(map.reception, baseURL!);
    const page = await opened[0].newPage(); await page.goto("/");
    await page.getByRole("textbox", { name: "Search patients", exact: true }).fill(patient.mrn);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`View record .*${patient.familyName}`) }).click();
    await page.getByRole("button", { name: "Referral for machine tests", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Referral for machine tests", exact: true });
    await dialog.getByRole("button", { name: "Register for tests", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Choose the clinic");
    await dialog.locator('[name="referralClinic"]').selectOption({ label: "Retina" });
    await dialog.locator('[name="referralDoctor"]').fill("Dr. Visiting Consultant");
    await dialog.getByLabel("Fundus camera", { exact: false }).first().check();
    await dialog.getByRole("button", { name: "Register for tests", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Registered for machine tests" })).toBeVisible();
  } finally { await close(); }
});

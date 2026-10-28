import { test, expect, type APIRequestContext } from "@playwright/test";

// Machine tests: ordered at senior review or by the doctor, dilation first when
// needed, recorded by the operator, and the patient moves on when all are done.
const people = { reception: "aisha.malik", nurse: "nadia.raza", senior: "sana.qureshi", doctor: "sara.khan", operator: "imran.shah", admin: "omar.siddiqui" } as const;
type Who = keyof typeof people;
async function signIn(request: APIRequestContext, baseURL: string, who: Who) {
  const response = await request.post("/api/auth/login", { headers: { Origin: baseURL }, data: { email: `${people[who]}@demo.openeyes.local`, password: process.env.DEMO_ACCOUNT_PASSWORD } });
  expect(response.status()).toBe(200);
}
const post = (request: APIRequestContext, baseURL: string, path: string, data: unknown) => request.post(path, { headers: { Origin: baseURL }, data });
type Visit = { id: string; version: number; stage: string; pathwaySteps: string[]; machines: { id: string; version: number; machine: string; status: string; findings: string; reports: unknown[] }[] };
const visit = async (request: APIRequestContext, id: string) => ((await (await request.get("/api/intake/queue")).json()).encounters as Visit[]).find(item => item.id === id)!;
const machineId = async (request: APIRequestContext, name: string) => ((await (await request.get("/api/machines/list")).json()).machines as { id: string; name: string }[]).find(item => item.name === name)!.id;
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("synthetic report")]);

/** A General Ophthalmology walk-in for Dr. Sara Khan, worked up by the nurse; returns the visit id. */
async function workedUp(contexts: Record<Who, APIRequestContext>, baseURL: string) {
  const { reception, nurse } = contexts;
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const input = { givenName: "Machine", familyName: `Check${suffix}`, gender: "male", dob: "1985-02-02", phone: `0303${suffix.slice(-7)}` };
  const review = await (await post(reception, baseURL, "/api/patients/duplicates", input)).json();
  const created = await post(reception, baseURL, "/api/patients", { ...input, duplicateReviewToken: review.reviewToken, ...(review.candidates.length ? { duplicateReason: "Synthetic machine test record" } : {}) });
  expect(created.status(), await created.text()).toBe(201);
  const patient = (await created.json()).patient as { id: string };
  const clinic = ((await (await reception.get("/api/intake/clinics")).json()).clinics as { id: string; name: string; doctors: { id: string; name: string }[] }[]).find(value => value.name === "General Ophthalmology")!;
  const doctor = clinic.doctors.find(value => value.name === "Dr. Sara Khan")!;
  const walkIn = await post(reception, baseURL, "/api/intake/walkin", { patientId: patient.id, facilityId: clinic.id, doctorId: doctor.id });
  expect(walkIn.status(), await walkIn.text()).toBe(201);
  const id = (await walkIn.json()).id as string;
  expect((await post(nurse, baseURL, "/api/intake/transition", { encounterId: id, version: 1, to: "workup" })).status()).toBe(200);
  const eye = { uncorrected: "6/12", pinhole: "6/9", corrected: "6/9", iop: 17, method: "NCT", measuredAt: new Date().toISOString() };
  const saved = await post(nurse, baseURL, "/api/intake/workup", { encounterId: id, version: 0, OD: eye, OS: eye, notes: "Synthetic machine workup" });
  expect(saved.status(), await saved.text()).toBe(201);
  return id;
}
async function approve(senior: APIRequestContext, baseURL: string, id: string, machineOrders: { machineId: string; eye: string }[]) {
  const workup = (await (await senior.get(`/api/intake/workup?encounterId=${id}`)).json()).workup as { id: string };
  const response = await post(senior, baseURL, "/api/intake/workup-review", { encounterId: id, revisionId: workup.id, decision: "approved", notes: "", machineOrders });
  expect(response.status(), await response.text()).toBe(200);
}
async function contextsFor(browser: import("@playwright/test").Browser, baseURL: string, who: Who[]) {
  const contexts = {} as Record<Who, APIRequestContext>; const opened: import("@playwright/test").BrowserContext[] = [];
  for (const person of who) { const context = await browser.newContext(); opened.push(context); await signIn(context.request, baseURL, person); contexts[person] = context.request; }
  return { contexts, opened, close: () => Promise.all(opened.map(context => context.close())) };
}

test("senior review orders tests, dilation comes first, the operator records them and the patient moves to the doctor", async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const { contexts, opened, close } = await contextsFor(browser, baseURL!, ["reception", "nurse", "senior", "doctor", "operator"]);
  try {
    const id = await workedUp(contexts, baseURL!);
    await approve(contexts.senior, baseURL!, id, [{ machineId: await machineId(contexts.senior, "OCT"), eye: "OU" }, { machineId: await machineId(contexts.senior, "Fundus camera"), eye: "OD" }]);
    let state = await visit(contexts.senior, id);
    expect(state.pathwaySteps).toEqual(["workup", "dilation", "testing"]);
    // Still in workup or dilation: the operator sees the tests as coming, and cannot record them yet.
    const early = state.machines.find(order => order.machine === "OCT")!;
    expect((await post(contexts.operator, baseURL!, "/api/machines/result", { id: early.id, version: early.version, findings: "Too early" })).status()).toBe(409);
    expect((await post(contexts.senior, baseURL!, "/api/intake/transition", { encounterId: id, version: state.version, to: "dilation" })).status()).toBe(200);
    state = await visit(contexts.senior, id);
    expect((await post(contexts.senior, baseURL!, "/api/intake/transition", { encounterId: id, version: state.version, to: "testing", reason: "Synthetic early dilation release" })).status()).toBe(200);

    const page = await opened[4].newPage(); await page.goto("/");
    await page.getByRole("button", { name: "Machine diagnostics", exact: true }).click();
    const oct = page.getByTestId(`machine-${early.id}`);
    await expect(oct).toContainText("Both eyes");
    await oct.getByLabel("Findings", { exact: true }).fill("Normal retinal nerve fibre layer in both eyes");
    await oct.getByLabel("Key values (optional)", { exact: true }).fill("Average RNFL 94 µm");
    await oct.locator("input[type=file]").setInputFiles({ name: "oct-report.png", mimeType: "image/png", buffer: PNG });
    await oct.getByRole("button", { name: "Save result", exact: true }).click();
    await expect(oct).toHaveCount(0);
    // Fundus photo could not be done; with nothing left open the patient goes to the doctor.
    const fundus = (await visit(contexts.senior, id)).machines.find(order => order.machine === "Fundus camera")!;
    expect((await post(contexts.operator, baseURL!, "/api/machines/not-done", { id: fundus.id, version: fundus.version, note: "Patient could not tolerate the flash" })).status()).toBe(200);
    expect((await visit(contexts.senior, id)).stage).toBe("consultation");

    const detail = await (await contexts.doctor.get(`/api/clinical/detail?encounterId=${id}`)).json();
    expect(detail.encounter.machines).toMatchObject([{ machine: "OCT", status: "done", keyValues: "Average RNFL 94 µm", reports: [{ filename: "oct-report.png" }] }, { machine: "Fundus camera", status: "not_done" }]);
    const report = await contexts.doctor.get(`/api/machines/report?id=${detail.encounter.machines[0].reports[0].id}`);
    expect(report.headers()["content-type"]).toBe("image/png");
  } finally { await close(); }
});

test("dye tests wait for a doctor, and a doctor can send their own patient for tests and get them back", async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const { contexts, close } = await contextsFor(browser, baseURL!, ["reception", "nurse", "senior", "doctor", "operator"]);
  try {
    const ffaVisit = await workedUp(contexts, baseURL!);
    await approve(contexts.senior, baseURL!, ffaVisit, [{ machineId: await machineId(contexts.senior, "Fluorescein angiography (FFA)"), eye: "OU" }]);
    const waiting = ((await (await contexts.doctor.get("/api/machines/approvals")).json()).orders as { id: string; version: number; encounterId: string }[]).find(order => order.encounterId === ffaVisit)!;
    expect(waiting).toBeTruthy();
    expect((await post(contexts.doctor, baseURL!, "/api/machines/decide", { id: waiting.id, version: waiting.version, decision: "decline", note: "Not needed today" })).status()).toBe(200);
    // Nothing left to run: no machine step, and no dilation since only the dye test needed it.
    expect((await visit(contexts.senior, ffaVisit)).pathwaySteps).toEqual(["workup"]);

    const ownVisit = await workedUp(contexts, baseURL!);
    await approve(contexts.senior, baseURL!, ownVisit, []);
    let state = await visit(contexts.senior, ownVisit);
    expect(state.pathwaySteps).toEqual(["workup"]);
    expect((await post(contexts.senior, baseURL!, "/api/intake/transition", { encounterId: ownVisit, version: state.version, to: "consultation" })).status()).toBe(200);
    state = await visit(contexts.senior, ownVisit);
    const oct = await machineId(contexts.doctor, "OCT");
    expect((await post(contexts.nurse, baseURL!, "/api/machines/doctor-order", { encounterId: ownVisit, version: state.version, orders: [{ machineId: oct, eye: "OS" }] })).status()).toBe(403);
    const sent = await post(contexts.doctor, baseURL!, "/api/machines/doctor-order", { encounterId: ownVisit, version: state.version, orders: [{ machineId: oct, eye: "OS" }] });
    expect(sent.status(), await sent.text()).toBe(200);
    expect(await sent.json()).toEqual({ stage: "testing" });
    const order = (await visit(contexts.senior, ownVisit)).machines[0];
    expect((await post(contexts.operator, baseURL!, "/api/machines/result", { id: order.id, version: order.version, findings: "Left macula normal thickness" })).status()).toBe(200);
    expect((await visit(contexts.senior, ownVisit)).stage).toBe("consultation");
  } finally { await close(); }
});

test("administrators keep the machine list, and clinic suggestions come pre-ticked", async ({ page, baseURL }) => {
  await signIn(page.request, baseURL!, "admin");
  const name = `Synthetic scanner ${String(Date.now()).slice(-6)}`;
  const clinics = ((await (await page.request.get("/api/intake/clinics")).json()).clinics as { id: string; name: string }[]);
  const general = clinics.find(clinic => clinic.name === "General Ophthalmology")!;
  const saved = await post(page.request, baseURL!, "/api/machines/save", { name, purpose: "Testing the list", needsDilation: false, needsDoctorApproval: false, suggestedFacilityIds: [general.id] });
  expect(saved.status(), await saved.text()).toBe(200);
  expect((await post(page.request, baseURL!, "/api/machines/save", { name, needsDilation: false, needsDoctorApproval: false })).status()).toBe(409);
  await page.goto("/");
  await page.getByRole("button", { name: "Administration", exact: true }).click();
  await page.getByRole("button", { name: "Machines", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("General Ophthalmology");
  const machine = ((await (await page.request.get("/api/machines/list")).json()).machines as { id: string; name: string; revision: number }[]).find(item => item.name === name)!;
  expect((await post(page.request, baseURL!, "/api/machines/save", { id: machine.id, revision: machine.revision, name, needsDilation: false, needsDoctorApproval: false, active: false })).status()).toBe(200);
});

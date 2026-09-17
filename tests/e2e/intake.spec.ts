import { test, expect, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { todayKarachi } from '../../src/lib/patients';
const emails = { reception:'aisha.malik', nurse:'nadia.raza', doctor:'sara.khan', optometrist:'usman.farooq', auditor:'maryam.saeed' };
async function login(request: APIRequestContext, origin: string, role: keyof typeof emails = 'reception') { const response = await request.post('/api/auth/login',{headers:{Origin:origin},data:{email:`${emails[role]}@demo.openeyes.local`,password:process.env.DEMO_ACCOUNT_PASSWORD}}); expect(response.status()).toBe(200); }
async function post(request: APIRequestContext, origin: string, resource: string, data: unknown) { return request.post(`/api/intake/${resource}`,{headers:{Origin:origin},data}); }
async function patient(request: APIRequestContext, origin: string) {
 const suffix = String(Date.now()).slice(-7); const input = { givenName:'Intake',familyName:`Journey${suffix}`,gender:'female',dob:'1970-03-12',dobEstimated:false,phone:`0300${suffix}`,identifierType:'cnic',identifier:`00000${suffix}0`,city:'Karachi',allergy:'Synthetic intake risk flag' };
 const review = await (await request.post('/api/patients/duplicates',{headers:{Origin:origin},data:input})).json();
 const response = await request.post('/api/patients',{headers:{Origin:origin},data:{...input,duplicateReviewToken:review.reviewToken}}); expect(response.status()).toBe(201); return (await response.json()).patient;
}
async function bookingInput(request: APIRequestContext, origin: string) { const person = await patient(request,origin); const clinic = (await (await request.get('/api/intake/clinics')).json()).clinics.find((value: {name:string})=>value.name==='Glaucoma'); const doctorId=clinic.doctors[0].id; const date=todayKarachi(); const slots=await(await request.get(`/api/intake/slots?facilityId=${clinic.id}&doctorId=${doctorId}&date=${date}`)).json(); return {patientId:person.id,facilityId:clinic.id,doctorId,date,time:slots.slots.at(-1)}; }
async function encounter(request: APIRequestContext, origin: string) { const data=await bookingInput(request,origin); const booked=await post(request,origin,'appointments',data); expect(booked.status()).toBe(201); const appointmentId=(await booked.json()).id; const checked=await post(request,origin,'checkin',{appointmentId}); expect(checked.status()).toBe(201); return {id:(await checked.json()).id,appointmentId,data}; }
function measurements(id:string,version=0) { const eye={uncorrected:'CF',pinhole:'HM',corrected:'6/12',iop:24,method:'NCT',measuredAt:new Date().toISOString()}; return {encounterId:id,version,OD:eye,OS:{...eye,uncorrected:'6/9',iop:16},notes:'Synthetic saved workup'}; }

test('booked-patient journey persists through check-in, live polling, nursing workup, and doctor review',async({page,browser,baseURL})=>{
 test.setTimeout(120_000);
 await login(page.request,baseURL!); const person=await patient(page.request,baseURL!);
 await page.goto('/'); await page.getByRole('textbox',{name:'Search patients'}).fill(person.mrn); await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('button',{name:`View record Intake ${person.familyName}`,exact:true}).click(); await page.getByRole('button',{name:'Book appointment',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Book a clinic appointment'}); await expect(dialog).toBeVisible(); await dialog.getByLabel('Clinic',{exact:true}).selectOption({label:'Glaucoma'});
 await expect(dialog.getByLabel('Available slot')).toBeEnabled(); await expect.poll(async()=>dialog.getByLabel('Available slot').locator('option').count()).toBeGreaterThan(1);
 await dialog.getByLabel('Available slot').selectOption({index:1}); await page.screenshot({path:'test-results/intake-booking.png',fullPage:true}); await dialog.getByRole('button',{name:'Book appointment',exact:true}).click(); await expect(dialog).not.toBeVisible();
 const row=page.getByRole('row').filter({hasText:person.mrn}); await expect(row).toBeVisible();
 const board=await page.context().newPage(); await board.goto('/'); await board.getByRole('button',{name:'Live queue',exact:true}).click();
 await row.getByRole('button',{name:'Check in',exact:true}).click(); await expect(row).toContainText('Checked in');
 const card=board.locator('.queue-card').filter({hasText:person.mrn}); await expect(card).toBeVisible({timeout:10000}); await card.getByRole('button',{name:'Start workup',exact:true}).click(); await expect(card.getByRole('button',{name:'Start workup',exact:true})).not.toBeVisible();
 const records=await(await page.request.get('/api/intake/queue')).json(); const id=records.encounters.find((value:{patientId:string})=>value.patientId===person.id).id;
 await login(page.request,baseURL!,'nurse'); await page.goto('/'); await page.getByRole('button',{name:'Ophthalmic workup',exact:true}).click(); await page.getByTestId(`queue-${id}`).getByRole('button',{name:'Open workup',exact:true}).click();
 const workup=page.getByRole('dialog'); await workup.getByLabel('OD Uncorrected VA',{exact:true}).selectOption('CF'); await workup.getByLabel('OS Uncorrected VA',{exact:true}).selectOption('HM'); await workup.getByLabel('OD IOP (mmHg)',{exact:true}).fill('24'); await workup.getByLabel('OS IOP (mmHg)',{exact:true}).fill('16'); await expect(workup.getByText('Above 21 mmHg · review')).toBeVisible(); await workup.getByRole('button',{name:'Save bilateral workup',exact:true}).click(); await expect(workup.getByText('Workup saved',{exact:true})).toBeVisible();
 await workup.locator('.intake-dialog-body').evaluate(element => element.scrollTo(0,0)); await page.screenshot({path:'test-results/intake-workup.png',fullPage:true}); await workup.getByRole('button',{name:'Ready for consultation',exact:true}).click(); await expect(workup.locator('.workup-context')).toContainText('Ready for consultation');
 await page.reload(); await page.getByRole('button',{name:'Ophthalmic workup',exact:true}).click(); await page.getByTestId(`queue-${id}`).getByRole('button',{name:'View saved workup'}).click(); await expect(page.getByLabel('OD IOP (mmHg)',{exact:true})).toHaveValue('24'); await expect(page.getByLabel('OS Uncorrected VA',{exact:true})).toHaveValue('HM');
 const doctor=await browser.newContext({baseURL}); await login(doctor.request,baseURL!,'doctor'); const review=await doctor.newPage(); await review.goto(baseURL!); await review.getByRole('button',{name:'Ophthalmic workup',exact:true}).click(); await review.getByTestId(`queue-${id}`).getByRole('button',{name:'View saved workup'}).click(); await expect(review.getByLabel('OD IOP (mmHg)',{exact:true})).toHaveValue('24'); await expect(review.getByLabel('OD IOP (mmHg)',{exact:true})).toBeDisabled(); await expect(review.getByText('Nadia Raza',{exact:true}).first()).toBeVisible(); await doctor.close(); await board.close();
});

test('slot races, repeat check-in, invalid slots and duplicate patient bookings are rejected',async({page,baseURL})=>{
 await login(page.request,baseURL!); const input=await bookingInput(page.request,baseURL!);
 expect((await post(page.request,baseURL!,'appointments',{...input,time:'17:00'})).status()).toBe(409);
 expect((await post(page.request,baseURL!,'appointments',{...input,date:'2026-02-30'})).status()).toBe(400);
 expect((await post(page.request,baseURL!,'appointments',{...input,tenantId:randomUUID()})).status()).toBe(400);
 const results=await Promise.all([post(page.request,baseURL!,'appointments',input),post(page.request,baseURL!,'appointments',input)]); expect(results.map(value=>value.status()).sort()).toEqual([201,409]); const appointmentId=(await results.find(value=>value.status()===201)!.json()).id;
 const arrivals=await Promise.all([post(page.request,baseURL!,'checkin',{appointmentId}),post(page.request,baseURL!,'checkin',{appointmentId})]); expect(arrivals.map(value=>value.status()).sort()).toEqual([201,409]);
 const unavailable=await(await page.request.get(`/api/intake/slots?facilityId=${input.facilityId}&doctorId=${input.doctorId}&date=${input.date}`)).json(); expect(unavailable.slots).not.toContain(input.time);
 expect((await post(page.request,baseURL!,'appointments',{...input,time:unavailable.slots[0]})).status()).toBe(409);
});

test('workup versions, authorship, role permissions, handoff locking and audited dilation overrides',async({page,baseURL})=>{
 await login(page.request,baseURL!); const {id}=await encounter(page.request,baseURL!);
 expect((await page.request.get(`/api/intake/workup?encounterId=${id}`)).status()).toBe(403);
 expect((await post(page.request,baseURL!,'workup',measurements(id))).status()).toBe(403);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:1,to:'consultation'})).status()).toBe(403);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:1,to:'workup'})).status()).toBe(200);
 await login(page.request,baseURL!,'nurse');
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:2,to:'dilation'})).status()).toBe(409);
 const input=measurements(id); expect((await post(page.request,baseURL!,'workup',{...input,OD:{...input.OD,measuredAt:'2099-01-01T00:00:00Z'}})).status()).toBe(400);
 const results=await Promise.all([post(page.request,baseURL!,'workup',input),post(page.request,baseURL!,'workup',input)]); expect(results.map(value=>value.status()).sort()).toEqual([201,409]);
 await login(page.request,baseURL!,'optometrist'); expect((await post(page.request,baseURL!,'workup',measurements(id,1))).status()).toBe(403);
 await login(page.request,baseURL!,'nurse'); expect((await post(page.request,baseURL!,'workup',measurements(id,1))).status()).toBe(201);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:2,to:'dilation'})).status()).toBe(200);
 expect((await post(page.request,baseURL!,'workup',measurements(id,2))).status()).toBe(409);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:2,to:'consultation',reason:'Reviewed demo override'})).status()).toBe(409);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:3,to:'consultation'})).status()).toBe(409);
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:3,to:'consultation',reason:'Reviewed demo override'})).status()).toBe(200);
 const detail=await(await page.request.get(`/api/intake/workup?encounterId=${id}`)).json(); expect(detail.workup.version).toBe(2); expect(detail.history.at(-1).reason).toBe('Reviewed demo override'); expect(detail.history).toHaveLength(4);
 const db=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL}); await db.connect(); try { expect((await db.query('SELECT count(*)::int AS count FROM app.workup_revision WHERE encounter_id=$1',[id])).rows[0].count).toBe(2); const event=(await db.query("SELECT metadata FROM app.audit_log WHERE entity_id=$1 AND action='queue.transitioned' ORDER BY at DESC LIMIT 1",[id])).rows[0]; expect(event.metadata.reason).toBe('Reviewed demo override'); } finally { await db.end(); }
});

test('facility restrictions, absent authentication, and CSRF hold on intake endpoints',async({page,browser,baseURL})=>{
 const anonymous=await browser.newContext(); expect((await anonymous.request.get(`${baseURL}/api/intake/queue`)).status()).toBe(401); await anonymous.close();
 await login(page.request,baseURL!); const {id,appointmentId,data}=await encounter(page.request,baseURL!);
 expect((await page.request.post('/api/intake/checkin',{headers:{Origin:'https://other.invalid'},data:{appointmentId}})).status()).toBe(403);
 const db=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL}); await db.connect();
 const user=(await db.query("SELECT id,tenant_id FROM app.user_account WHERE email='aisha.malik@demo.openeyes.local'")).rows[0];
 try {
  await db.query('DELETE FROM app.user_facility WHERE tenant_id=$1 AND user_id=$2 AND facility_id=$3',[user.tenant_id,user.id,data.facilityId]);
  const queue=await(await page.request.get('/api/intake/queue')).json(); expect(queue.encounters.some((value:{id:string})=>value.id===id)).toBe(false);
  expect((await post(page.request,baseURL!,'checkin',{appointmentId})).status()).toBe(404);
  expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:1,to:'workup'})).status()).toBe(404);
  expect((await post(page.request,baseURL!,'appointments',data)).status()).toBe(403);
 } finally { await db.query('INSERT INTO app.user_facility(tenant_id,user_id,facility_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.tenant_id,user.id,data.facilityId]); await db.end(); }
 await login(page.request,baseURL!,'auditor'); expect((await page.request.get('/api/intake/queue')).status()).toBe(403); expect((await page.request.get('/api/intake/appointments')).status()).toBe(403);
});

test('future check-in is blocked and a second appointment cannot duplicate an active patient encounter',async({page,baseURL})=>{
 await login(page.request,baseURL!); const current=await encounter(page.request,baseURL!);
 const tomorrow=new Date(new Date(`${todayKarachi()}T12:00:00Z`).getTime()+86400000).toISOString().slice(0,10);
 const next=await post(page.request,baseURL!,'appointments',{...current.data,date:tomorrow}); expect(next.status()).toBe(201); const nextId=(await next.json()).id;
 expect((await post(page.request,baseURL!,'checkin',{appointmentId:nextId})).status()).toBe(409);
 const db=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL}); await db.connect();
 try {
  // Age this test-created appointment while preserving its unfinished encounter.
  await db.query("UPDATE app.appointment SET appointment_date=appointment_date-1 WHERE id=$1",[current.appointmentId]);
  await db.query('UPDATE app.appointment SET appointment_date=$2 WHERE id=$1',[nextId,todayKarachi()]);
  const denied=await post(page.request,baseURL!,'checkin',{appointmentId:nextId}); expect(denied.status()).toBe(409); expect((await denied.json()).error).toBe('activeEncounterExists');
  expect((await db.query('SELECT count(*)::int AS count FROM app.encounter WHERE patient_id=$1 AND closed_at IS NULL',[current.data.patientId])).rows[0].count).toBe(1);
 } finally {await db.end();}
});

test('an elapsed dilation timer permits normal handoff without an override reason',async({page,baseURL})=>{
 await login(page.request,baseURL!); const {id}=await encounter(page.request,baseURL!); await post(page.request,baseURL!,'transition',{encounterId:id,version:1,to:'workup'}); await login(page.request,baseURL!,'nurse'); expect((await post(page.request,baseURL!,'workup',measurements(id))).status()).toBe(201); expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:2,to:'dilation'})).status()).toBe(200);
 const db=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL}); await db.connect(); try {await db.query("UPDATE app.encounter SET dilation_ready_at=now()-interval '1 minute' WHERE id=$1",[id]);} finally {await db.end();}
 expect((await post(page.request,baseURL!,'transition',{encounterId:id,version:3,to:'consultation'})).status()).toBe(200);
});

test('live dashboard and queue fit desktop and tablet; bilateral workup keeps OD before OS',async({page,baseURL})=>{
 await login(page.request,baseURL!,'nurse'); await page.goto('/'); await page.getByRole('button',{name:'Overview',exact:true}).click(); await expect(page.locator('.ov-kpi').first()).not.toContainText('—'); await page.screenshot({path:'test-results/intake-overview.png',fullPage:true});
 await page.getByRole('button',{name:'Live queue',exact:true}).click(); await expect(page.locator('.queue-card').first()).toBeVisible(); await page.screenshot({path:'test-results/intake-queue.png',fullPage:true});
 await page.setViewportSize({width:820,height:1180}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.locator('.stage-consultation').getByRole('button',{name:'View saved workup',exact:true}).first().click(); const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible(); await expect(dialog.locator('.eye-od')).toBeVisible(); await page.screenshot({path:'test-results/intake-tablet.png',fullPage:true});
 const od=await dialog.locator('.eye-od').boundingBox(), os=await dialog.locator('.eye-os').boundingBox(); if(od&&os) expect(od.x).toBeLessThan(os.x); expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(820);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingDateAllowed, dateSchema, slotTimes, canTransition, nextPathwayStage, pathwayEvidenceRequired, workupSchema, isElevatedIop } from '../src/lib/intake';
import { ROLE_PERMISSIONS } from '../src/lib/access';
test('clinic slots include the opening slot and exclude the closing boundary', () => { const slots = slotTimes(540, 1020, 15); assert.equal(slots.length, 32); assert.equal(slots[0], '09:00'); assert.equal(slots.at(-1), '16:45'); assert.equal(slots.includes('17:00'), false); });
test('booking dates reject invalid calendar dates and constrain the demo horizon', () => { assert.equal(dateSchema.safeParse('2026-02-30').success, false); assert.equal(bookingDateAllowed('2026-09-13','2026-09-14'), false); assert.equal(bookingDateAllowed('2026-09-14','2026-09-14'), true); assert.equal(bookingDateAllowed('2027-01-01','2026-09-14'), false); });
test('queue stages follow the configured clinic pathway without skipping checkpoints', () => {
 const general=['workup'] as const, glaucoma=['workup','testing'] as const, retina=['workup','imaging','dilation'] as const;
 assert.equal(canTransition('waiting','workup',general),true);assert.equal(canTransition('workup','consultation',general),true);
 assert.equal(canTransition('workup','testing',glaucoma),true);assert.equal(canTransition('testing','consultation',glaucoma),true);assert.equal(canTransition('workup','consultation',glaucoma),false);
 assert.equal(canTransition('workup','imaging',retina),true);assert.equal(canTransition('imaging','dilation',retina),true);assert.equal(canTransition('dilation','consultation',retina),true);assert.equal(canTransition('workup','dilation',retina),false);
 assert.equal(nextPathwayStage('waiting',retina),'workup');assert.equal(nextPathwayStage('consultation',retina),null);assert.equal(pathwayEvidenceRequired('testing'),true);assert.equal(pathwayEvidenceRequired('dilation'),false);
});
test('bilateral measurements retain nonnumeric acuity and validate IOP without blocking elevated values', () => {
 const eye = { uncorrected:'CF', pinhole:'HM', corrected:'not_tested', iop:24, method:'NCT', measuredAt:new Date().toISOString() };
 const data = { encounterId:crypto.randomUUID(),version:0,OD:eye,OS:{...eye,iop:16},notes:'' };
 assert.equal(workupSchema.safeParse(data).success,true); assert.equal(workupSchema.safeParse({...data,OS:undefined}).success,false); assert.equal(workupSchema.safeParse({...data,OD:{...eye,iop:81}}).success,false); assert.equal(workupSchema.safeParse({...data,tenantId:crypto.randomUUID()}).success,false);
 assert.equal(isElevatedIop(21),false); assert.equal(isElevatedIop(21.1),true);
});
test('reception, clinical workup, and doctor review permissions stay separate', () => { assert.ok(ROLE_PERMISSIONS.receptionist.includes('queue:workup')); assert.equal(ROLE_PERMISSIONS.receptionist.includes('workup:read'),false); assert.equal(ROLE_PERMISSIONS.hospital_admin.includes('workup:write'),false); assert.ok(ROLE_PERMISSIONS.nurse.includes('workup:write')); assert.equal(ROLE_PERMISSIONS.doctor.includes('workup:write'),false); assert.ok(ROLE_PERMISSIONS.doctor.includes('workup:read')); });

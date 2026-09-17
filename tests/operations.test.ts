import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationsFixture, financialSummary, invoiceStatus, invoiceTotal, stockSummary, SURGERY_STAGES, dayOffset, type Stock } from '../src/lib/operations';
import { ROLE_PERMISSIONS } from '../src/lib/access';
const date = '2026-09-15';
const drugs = Array.from({ length: 8 }, (_, index) => ({ id: `drug-${index}`, name: `Example ${index}`, strength: 'Sample strength' }));
test('sample ledger reconciles every payment, 90 daily collections, and outstanding balances', () => {
  const fixture = createOperationsFixture(date, drugs); assert.equal(fixture.daily.length, 90); assert.equal(fixture.invoices.length, 450); assert.equal(fixture.daily[0].date, dayOffset(date, -89));
  const ids = new Set<string>(); for (const invoice of fixture.invoices) { assert.ok(!ids.has(invoice.id)); ids.add(invoice.id); const total = invoiceTotal(invoice); assert.ok(total > 0); assert.ok((invoice.payment?.amount ?? 0) <= total); if (invoice.payment) assert.equal(invoice.payment.date, invoice.date); }
  const totals = financialSummary(fixture.invoices); assert.equal(totals.billed, totals.collected + totals.outstanding);
  assert.equal(fixture.daily.reduce((sum, day) => sum + financialSummary(fixture.invoices.filter(item => item.date === day.date)).collected, 0), totals.collected);
  assert.deepEqual(new Set(fixture.invoices.map(invoiceStatus)), new Set(['paid','partial','unpaid']));
});
test('first-expiry selection excludes quarantined, expired and empty batches and handles no eligible stock', () => {
  const stock = createOperationsFixture(date, drugs).stock[0]; const state = stockSummary(stock, date); assert.equal(state.suggested?.code, 'SMP-1-A'); assert.equal(state.available, 125); assert.equal(state.nearExpiry.length, 1);
  const empty: Stock = { ...stock, batches: stock.batches.filter(batch => !['SMP-1-A','SMP-1-B'].includes(batch.code)) };
  assert.equal(stockSummary(empty, date).suggested, null); assert.equal(stockSummary(empty, date).available, 0);
  assert.equal(stockSummary(stock, dayOffset(date, 241)).suggested, null);
});
test('fixtures are deterministic, have two near-expiry and two low-stock medicines, and chronological eye-specific surgeries', () => {
  const fixture = createOperationsFixture(date, drugs); assert.deepEqual(fixture, createOperationsFixture(date, drugs));
  assert.equal(fixture.stock.filter(stock => stockSummary(stock, date).lowStock).length, 2); assert.equal(fixture.stock.filter(stock => stockSummary(stock, date).nearExpiry.length).length, 2);
  assert.deepEqual(fixture.surgeries.map(item => item.stage), [...SURGERY_STAGES]); for (const item of fixture.surgeries) { assert.ok(['OD','OS'].includes(item.eye)); assert.equal(item.history.at(-1)?.stage, item.stage); const dates = item.history.map(entry => Date.parse(entry.at)); assert.deepEqual(dates, [...dates].sort((a,b) => a-b)); }
});
test('preview permissions do not grant clinical signing, payment, or stock writes to operational roles', () => {
  assert.ok(ROLE_PERMISSIONS.cashier.includes('preview:billing')); assert.ok(!ROLE_PERMISSIONS.cashier.includes('clinical:sign')); assert.ok(!ROLE_PERMISSIONS.cashier.includes('preview:admin'));
  assert.ok(ROLE_PERMISSIONS.inventory_officer.includes('preview:inventory')); assert.ok(!ROLE_PERMISSIONS.inventory_officer.includes('prescription:read')); assert.ok(!ROLE_PERMISSIONS.receptionist.includes('preview:billing'));
});

export type PreviewDrug = { id: string; name: string; strength: string };
export type Batch = { code: string; expiry: string; quantity: number; quarantined: boolean };
export type Stock = PreviewDrug & { reorderLevel: number; batches: Batch[] };
export type InvoiceItem = { description: string; quantity: number; unitPrice: number };
export type SampleInvoice = { id: string; date: string; patient: string; mrn: string; clinic: string; items: InvoiceItem[]; payment: { id: string; date: string; amount: number; method: 'cash' | 'card' } | null };
export const SURGERY_STAGES = ['assessment', 'scheduled', 'preop', 'theatre', 'recovery', 'discharged'] as const;
export type SurgeryStage = typeof SURGERY_STAGES[number];
export type SampleSurgery = { id: string; patient: string; mrn: string; eye: 'OD' | 'OS'; procedure: string; surgeon: string; stage: SurgeryStage; scheduledDate: string; history: { stage: SurgeryStage; at: string }[] };
export type OperationsFixture = { version: 1; asOf: string; stock: Stock[]; invoices: SampleInvoice[]; surgeries: SampleSurgery[]; daily: { date: string; visits: number; averageWaitMinutes: number }[] };
export function dayOffset(date: string, offset: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); }
export function invoiceTotal(invoice: SampleInvoice) { return invoice.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0); }
export function invoiceStatus(invoice: SampleInvoice): 'paid' | 'partial' | 'unpaid' { return !invoice.payment ? 'unpaid' : invoice.payment.amount === invoiceTotal(invoice) ? 'paid' : 'partial'; }
export function stockSummary(stock: Stock, today: string) {
  const eligible = stock.batches.filter(batch => !batch.quarantined && batch.quantity > 0 && batch.expiry >= today).sort((a, b) => a.expiry.localeCompare(b.expiry) || a.code.localeCompare(b.code));
  const available = eligible.reduce((sum, batch) => sum + batch.quantity, 0);
  return { eligible, available, suggested: eligible[0] ?? null, lowStock: available < stock.reorderLevel, nearExpiry: eligible.filter(batch => batch.expiry <= dayOffset(today, 30)) };
}
export function financialSummary(invoices: SampleInvoice[]) { return invoices.reduce((result, invoice) => { result.billed += invoiceTotal(invoice); result.collected += invoice.payment?.amount ?? 0; result.outstanding = result.billed - result.collected; return result; }, { billed: 0, collected: 0, outstanding: 0 }); }

// Deterministic presentation fixtures, deliberately independent of clinical encounter/payment state.
export function createOperationsFixture(asOf: string, drugs: PreviewDrug[]): OperationsFixture {
  const people = ['Fatima Ahmed', 'Nasreen Ahmed', 'Javed Ahmed', 'Abdul Khan', 'Salma Siddiqui', 'Tariq Khan'];
  const stock = drugs.map((drug, index): Stock => ({ ...drug, reorderLevel: 20, batches: [
    { code: `SMP-${index + 1}-A`, expiry: dayOffset(asOf, index < 2 ? 7 + index * 14 : 120 + index * 7), quantity: index === 2 || index === 3 ? 4 : 45, quarantined: false },
    { code: `SMP-${index + 1}-B`, expiry: dayOffset(asOf, 240 + index * 10), quantity: index === 2 || index === 3 ? 6 : 80, quarantined: false },
    ...(index === 0 ? [{ code: 'SMP-1-EXPIRED', expiry: dayOffset(asOf, -3), quantity: 12, quarantined: false }, { code: 'SMP-1-HOLD', expiry: dayOffset(asOf, 2), quantity: 18, quarantined: true }, { code: 'SMP-1-EMPTY', expiry: dayOffset(asOf, 1), quantity: 0, quarantined: false }] : []),
  ] }));
  const invoices: SampleInvoice[] = [], daily: OperationsFixture['daily'] = [];
  for (let offset = -89; offset <= 0; offset++) {
    const date = dayOffset(asOf, offset), n = offset + 89;
    daily.push({ date, visits: 24 + n % 13, averageWaitMinutes: 12 + (n * 7) % 24 });
    for (let j = 0; j < 4 + n % 3; j++) {
      const patientIndex = (n + j) % people.length, surgery = j === 3 && n % 4 === 0;
      const items: InvoiceItem[] = surgery ? [{ description: 'Sample cataract surgery package', quantity: 1, unitPrice: 55000 }] : [{ description: 'Sample ophthalmology consultation', quantity: 1, unitPrice: 2500 }, ...(j === 2 ? [{ description: 'Sample diagnostic imaging', quantity: 1, unitPrice: 4500 }] : [])];
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), status = (n + j) % 7;
      const id = `SMP-INV-${date.replaceAll('-', '')}-${j + 1}`;
      invoices.push({ id, date, patient: people[patientIndex], mrn: `SAMPLE-${String(patientIndex + 1).padStart(4, '0')}`, clinic: ['General Ophthalmology', 'Retina', 'Glaucoma'][j % 3], items, payment: status === 0 ? null : { id: id.replace('INV', 'RCT'), date, amount: status === 1 ? Math.floor(total / 2) : total, method: j % 2 ? 'card' : 'cash' } });
    }
  }
  const surgeries = SURGERY_STAGES.map((stage, index): SampleSurgery => ({ id: `SMP-SURG-${index + 1}`, patient: people[index], mrn: `SAMPLE-${String(index + 1).padStart(4, '0')}`, eye: index % 2 ? 'OS' : 'OD', procedure: index === 2 ? 'Sample pterygium excision' : 'Sample cataract surgery', surgeon: index % 2 ? 'Dr. Hamza Ali' : 'Dr. Sara Khan', stage, scheduledDate: dayOffset(asOf, index < 2 ? 2 : 0), history: SURGERY_STAGES.slice(0, index + 1).map((value, step) => ({ stage: value, at: `${dayOffset(asOf, step < 2 ? -7 + step * 3 : 0)}T${String(8 + step).padStart(2, '0')}:00:00+05:00` })) }));
  return { version: 1, asOf, stock, invoices, surgeries, daily };
}

import assert from "node:assert/strict";
import test from "node:test";
import { ANATOMY_SITES, appendSelection, isAnatomySite, selectSite, type AnatomySite, type Eye, type Selection } from "../src/lib/anatomy";

test("selecting a structure preserves the other eye and does not mutate the input", () => {
  const original: Selection = { OD: "optic_nerve", OS: "lens" };
  assert.deepEqual(selectSite(original, "OS", "retina"), { OD: "optic_nerve", OS: "retina" });
  assert.deepEqual(original, { OD: "optic_nerve", OS: "lens" });
});

test("bilateral selection creates distinct rows even when both sites match", () => {
  let sequence = 0;
  const rows = appendSelection([], { OD: "optic_nerve", OS: "optic_nerve" }, () => String(++sequence));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ eye, anatomySite }) => ({ eye, anatomySite })), [
    { eye: "OD", anatomySite: "optic_nerve" }, { eye: "OS", anatomySite: "optic_nerve" },
  ]);
  assert.notEqual(rows[0].id, rows[1].id);
});

test("repeated addition is idempotent and preserves existing notes", () => {
  const selection: Selection = { OD: "optic_nerve", OS: null };
  const initial = appendSelection([], selection, () => "first");
  initial[0].notes = "Practice note";
  assert.deepEqual(appendSelection(initial, selection, () => "duplicate"), initial);
  const different = appendSelection(initial, { ...selection, OS: "lens" }, () => "second");
  assert.equal(different.length, 2);
  assert.equal(different[0].notes, "Practice note");
  assert.equal(initial.length, 1);
});

test("empty selection cannot create an incomplete treatment row", () => {
  assert.deepEqual(appendSelection([], { OD: null, OS: null }, () => { throw new Error("Must not generate ID"); }), []);
});

test("selection rejects invalid laterality and anatomy sites", () => {
  assert.throws(() => selectSite({ OD: null, OS: null }, "OU" as Eye, "lens"));
  assert.throws(() => selectSite({ OD: null, OS: null }, "OD", "unknown" as AnatomySite));
  assert.throws(() => appendSelection([], { OD: "unknown" as AnatomySite, OS: null }, () => "id"));
  assert.equal(isAnatomySite(undefined), false);
  assert.equal(isAnatomySite("retina"), true);
  assert.equal(new Set(ANATOMY_SITES).size, 11);
});

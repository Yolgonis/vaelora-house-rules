import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePenalty,
  D100_TABLE,
  getViolationRollCount,
  resolveD100,
  validateD100Table
} from "../../scripts/features/consequences/rule-engine.mjs";

test("d100 boundaries resolve to the required ranges", () => {
  assert.deepEqual([resolveD100(1).min, resolveD100(1).max], [1, 5]);
  assert.deepEqual([resolveD100(5).min, resolveD100(5).max], [1, 5]);
  assert.deepEqual([resolveD100(6).min, resolveD100(6).max], [6, 10]);
  assert.deepEqual([resolveD100(10).min, resolveD100(10).max], [6, 10]);
  assert.deepEqual([resolveD100(11).min, resolveD100(11).max], [11, 15]);
  assert.deepEqual([resolveD100(99).min, resolveD100(99).max], [96, 99]);
  assert.deepEqual([resolveD100(100).min, resolveD100(100).max], [100, 100]);
});

test("every d100 value matches exactly one row with no gaps or overlaps", () => {
  assert.deepEqual(validateD100Table(), []);
  for ( let value = 1; value <= 100; value += 1 ) {
    assert.equal(D100_TABLE.filter(row => value >= row.min && value <= row.max).length, 1);
  }
});

test("d4 charge counts match every required table band", () => {
  const expected = [0, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 3, 0, 3, 0, 2, 4, 4, 6, 20];
  assert.deepEqual(D100_TABLE.map(row => row.d4Charges), expected);
});

test("repeated violations use 1, 2, 3 dice and then automatic 100", () => {
  assert.equal(getViolationRollCount(1), 1);
  assert.equal(getViolationRollCount(2), 2);
  assert.equal(getViolationRollCount(3), 3);
  assert.equal(getViolationRollCount(4), 0);
  assert.equal(getViolationRollCount(5), 0);
  assert.equal(getViolationRollCount(999), 0);
});

test("new-actor totals preserve the base-three invariant", () => {
  assert.equal(calculatePenalty(resolveD100(1)).incidentTotal, 4);
  const maximum = calculatePenalty(resolveD100(100));
  assert.equal(maximum.incidentTotal, 23);
  assert.equal(maximum.d4Charges, 20);
  for ( const row of D100_TABLE ) {
    assert.equal(calculatePenalty(row).incidentTotal, row.expectedTotal);
  }
});

test("the required d100 43 walkthrough produces 8 disadvantage and 2 d4", () => {
  const actor = { disadvantageCharges: 3, d4Charges: 0, violationsThisSession: 1 };
  const penalty = calculatePenalty(resolveD100(43));
  actor.disadvantageCharges += penalty.extraDisadvantage;
  actor.d4Charges += penalty.d4Charges;
  assert.deepEqual(actor, { disadvantageCharges: 8, d4Charges: 2, violationsThisSession: 1 });
});

test("invalid d100 and violation inputs are rejected", () => {
  assert.throws(() => resolveD100(0), RangeError);
  assert.throws(() => resolveD100(101), RangeError);
  assert.throws(() => resolveD100(1.5), RangeError);
  assert.throws(() => getViolationRollCount(0), RangeError);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ROLL_TYPES } from "../../scripts/features/consequences/constants.mjs";
import {
  buildPenaltyRollConfig,
  classifyDnd5eRoll,
  consumeReservedPenalty,
  forcePenaltyD20Options,
  getReservationDecision
} from "../../scripts/features/consequences/roll-policy.mjs";

const baseState = Object.freeze({
  disadvantageCharges: 3,
  d4Charges: 1
});

test("death save is eligible and classified as a saving throw", () => {
  const result = classifyDnd5eRoll(["deathSave", "savingThrow", "d20Test", ""]);
  assert.equal(result.eligible, true);
  assert.equal(result.rollType, ROLL_TYPES.SAVING_THROW);
});

test("skill and tool hooks are classified before shared ability hooks", () => {
  assert.equal(classifyDnd5eRoll(["skill", "abilityCheck", "d20Test", ""]).rollType, ROLL_TYPES.SKILL);
  assert.equal(classifyDnd5eRoll(["tool", "abilityCheck", "d20Test", ""]).rollType, ROLL_TYPES.TOOL);
});

test("charges are always active and the fourth roll is normal after three consumptions", () => {
  let state = { ...baseState, d4Charges: 0 };
  for ( let expected = 2; expected >= 0; expected -= 1 ) {
    const decision = getReservationDecision({
      state,
      rollType: ROLL_TYPES.ABILITY_CHECK
    });
    assert.equal(decision.allowed, true);
    state = consumeReservedPenalty(state);
    assert.equal(state.disadvantageCharges, expected);
  }
  assert.equal(getReservationDecision({
    state,
    rollType: ROLL_TYPES.ABILITY_CHECK
  }).allowed, false);
});

test("an eligible roll is allowed without an armed flag", () => {
  const decision = getReservationDecision({
    state: baseState,
    rollType: ROLL_TYPES.SKILL
  });
  assert.equal(decision.allowed, true);
  const consumed = consumeReservedPenalty(baseState, { useD4: decision.useD4 });
  assert.deepEqual(
    [consumed.disadvantageCharges, consumed.d4Charges],
    [2, 0]
  );
});

test("reservation counts prevent two concurrent rolls from claiming one charge", () => {
  const state = { disadvantageCharges: 1, d4Charges: 0 };
  assert.equal(getReservationDecision({
    state,
    rollType: ROLL_TYPES.ATTACK
  }).allowed, true);
  assert.equal(getReservationDecision({
    state,
    rollType: ROLL_TYPES.ATTACK,
    reservedDisadvantage: 1
  }).allowed, false);
});

test("initiative is always eligible while charges remain", () => {
  assert.equal(getReservationDecision({
    state: baseState,
    rollType: ROLL_TYPES.INITIATIVE
  }).allowed, true);
});

test("penalty disadvantage overrides an existing advantage source", () => {
  const options = forcePenaltyD20Options({ advantage: true, disadvantage: false, advantageMode: 1 });
  assert.equal(options.advantage, false);
  assert.equal(options.disadvantage, true);
  assert.equal(options.advantageMode, -1);
});

test("one d4 charge changes real-state counters independently", () => {
  const state = consumeReservedPenalty(baseState, { useD4: true });
  assert.equal(state.disadvantageCharges, 2);
  assert.equal(state.d4Charges, 0);
});

test("attack config receives a real negative d4 term without losing system parts", () => {
  const config = buildPenaltyRollConfig({
    parts: ["@attackBonus"],
    data: { attackBonus: 7 },
    options: { advantage: true }
  }, { useD4: true });
  assert.deepEqual(config.parts, ["@attackBonus", "@sabkcPenaltyD4"]);
  assert.equal(config.data.sabkcPenaltyD4, "-1d4[SABKC]");
  assert.equal(config.options.advantage, false);
  assert.equal(config.options.disadvantage, true);
  assert.equal(config.options.advantageMode, -1);
});

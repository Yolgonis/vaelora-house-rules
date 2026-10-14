import { ROLL_TYPES, SUPPORTED_ROLL_TYPES } from "./constants.mjs";

/** Infer the specific d20 test represented by D&D5e 5.x hookNames. */
export function classifyDnd5eRoll(hookNames=[]) {
  const names = new Set(Array.isArray(hookNames) ? hookNames : []);
  if ( names.has("deathSave") ) {
    return { eligible: true, reason: null, rollType: ROLL_TYPES.SAVING_THROW };
  }
  if ( names.has("initiativeDialog") ) return { eligible: true, reason: null, rollType: ROLL_TYPES.INITIATIVE };
  if ( names.has("attack") ) return { eligible: true, reason: null, rollType: ROLL_TYPES.ATTACK };
  if ( names.has("skill") ) return { eligible: true, reason: null, rollType: ROLL_TYPES.SKILL };
  if ( names.has("toolCheck") || names.has("tool") ) {
    return { eligible: true, reason: null, rollType: ROLL_TYPES.TOOL };
  }
  if ( names.has("abilityCheck") ) return { eligible: true, reason: null, rollType: ROLL_TYPES.ABILITY_CHECK };
  if ( names.has("savingThrow") ) return { eligible: true, reason: null, rollType: ROLL_TYPES.SAVING_THROW };
  return { eligible: false, reason: "unsupported", rollType: null };
}

/** Decide whether a charge can be reserved without mutating state. */
export function getReservationDecision({
  state,
  rollType,
  reservedDisadvantage=0,
  reservedD4=0
}) {
  if ( !SUPPORTED_ROLL_TYPES.has(rollType) ) return { allowed: false, reason: "unsupported" };
  const available = Math.max(0, Number(state?.disadvantageCharges ?? 0) - reservedDisadvantage);
  if ( available < 1 ) return { allowed: false, reason: "noCharges" };
  const availableD4 = Math.max(0, Number(state?.d4Charges ?? 0) - reservedD4);
  return { allowed: true, reason: null, useD4: availableD4 > 0 };
}

/** Return state after one successfully completed penalty transaction. */
export function consumeReservedPenalty(state, { useD4=false }={}) {
  return {
    ...state,
    disadvantageCharges: Math.max(0, Number(state?.disadvantageCharges ?? 0) - 1),
    d4Charges: Math.max(0, Number(state?.d4Charges ?? 0) - (useD4 ? 1 : 0))
  };
}

/** Force the final d20 options used by the D&D5e post-configuration hook. */
export function forcePenaltyD20Options(options={}, disadvantageMode=-1) {
  return {
    ...options,
    advantage: false,
    disadvantage: true,
    advantageMode: disadvantageMode
  };
}

/** Add the real negative d4 formula term while preserving all system-provided config data. */
export function buildPenaltyRollConfig(rollConfig={}, {
  useD4=false,
  disadvantageMode=-1,
  d4DataKey="sabkcPenaltyD4",
  d4Formula="-1d4[SABKC]"
}={}) {
  const parts = [...(rollConfig.parts ?? [])];
  const data = { ...(rollConfig.data ?? {}) };
  if ( useD4 && !parts.includes(`@${d4DataKey}`) ) parts.push(`@${d4DataKey}`);
  if ( useD4 ) data[d4DataKey] = d4Formula;
  return {
    ...rollConfig,
    parts,
    data,
    options: forcePenaltyD20Options(rollConfig.options, disadvantageMode)
  };
}

import { BASE_VIOLATION_PENALTY } from "./constants.mjs";

/**
 * The table is the single source of truth for d100 range and mechanical data.
 * roleResult stores a localization key so the pure rules module has no Foundry dependency.
 */
export const D100_TABLE = Object.freeze([
  { min: 1, max: 5, roleResult: "SABKC.D100.R01_05", extraDisadvantage: 1, d4Charges: 0, expectedTotal: 4 },
  { min: 6, max: 10, roleResult: "SABKC.D100.R06_10", extraDisadvantage: 2, d4Charges: 0, expectedTotal: 5 },
  { min: 11, max: 15, roleResult: "SABKC.D100.R11_15", extraDisadvantage: 2, d4Charges: 1, expectedTotal: 5 },
  { min: 16, max: 20, roleResult: "SABKC.D100.R16_20", extraDisadvantage: 3, d4Charges: 0, expectedTotal: 6 },
  { min: 21, max: 25, roleResult: "SABKC.D100.R21_25", extraDisadvantage: 3, d4Charges: 1, expectedTotal: 6 },
  { min: 26, max: 30, roleResult: "SABKC.D100.R26_30", extraDisadvantage: 4, d4Charges: 0, expectedTotal: 7 },
  { min: 31, max: 35, roleResult: "SABKC.D100.R31_35", extraDisadvantage: 4, d4Charges: 1, expectedTotal: 7 },
  { min: 36, max: 40, roleResult: "SABKC.D100.R36_40", extraDisadvantage: 5, d4Charges: 0, expectedTotal: 8 },
  { min: 41, max: 45, roleResult: "SABKC.D100.R41_45", extraDisadvantage: 5, d4Charges: 2, expectedTotal: 8 },
  { min: 46, max: 50, roleResult: "SABKC.D100.R46_50", extraDisadvantage: 6, d4Charges: 0, expectedTotal: 9 },
  { min: 51, max: 55, roleResult: "SABKC.D100.R51_55", extraDisadvantage: 6, d4Charges: 2, expectedTotal: 9 },
  { min: 56, max: 60, roleResult: "SABKC.D100.R56_60", extraDisadvantage: 7, d4Charges: 0, expectedTotal: 10 },
  { min: 61, max: 65, roleResult: "SABKC.D100.R61_65", extraDisadvantage: 7, d4Charges: 3, expectedTotal: 10 },
  { min: 66, max: 70, roleResult: "SABKC.D100.R66_70", extraDisadvantage: 8, d4Charges: 0, expectedTotal: 11 },
  { min: 71, max: 75, roleResult: "SABKC.D100.R71_75", extraDisadvantage: 8, d4Charges: 3, expectedTotal: 11 },
  { min: 76, max: 80, roleResult: "SABKC.D100.R76_80", extraDisadvantage: 9, d4Charges: 0, expectedTotal: 12 },
  { min: 81, max: 85, roleResult: "SABKC.D100.R81_85", extraDisadvantage: 10, d4Charges: 2, expectedTotal: 13 },
  { min: 86, max: 90, roleResult: "SABKC.D100.R86_90", extraDisadvantage: 10, d4Charges: 4, expectedTotal: 13 },
  { min: 91, max: 95, roleResult: "SABKC.D100.R91_95", extraDisadvantage: 12, d4Charges: 4, expectedTotal: 15 },
  { min: 96, max: 99, roleResult: "SABKC.D100.R96_99", extraDisadvantage: 15, d4Charges: 6, expectedTotal: 18 },
  { min: 100, max: 100, roleResult: "SABKC.D100.R100", extraDisadvantage: 20, d4Charges: 20, expectedTotal: 23 }
]);

/** Resolve exactly one table row for an integer from 1 through 100. */
export function resolveD100(value) {
  if ( !Number.isInteger(value) || (value < 1) || (value > 100) ) {
    throw new RangeError(`d100 value must be an integer from 1 through 100; received ${value}.`);
  }
  const matches = D100_TABLE.filter(row => (value >= row.min) && (value <= row.max));
  if ( matches.length !== 1 ) throw new Error(`d100 table integrity failure for value ${value}.`);
  return matches[0];
}

/** Return the number of d100 dice for an incident; zero means automatic 100. */
export function getViolationRollCount(violationNumber) {
  if ( !Number.isInteger(violationNumber) || (violationNumber < 1) ) {
    throw new RangeError("violationNumber must be a positive integer.");
  }
  return violationNumber >= 4 ? 0 : violationNumber;
}

/** Build the immutable mechanical result for a selected table row. */
export function calculatePenalty(result) {
  if ( !result || !D100_TABLE.includes(result) ) throw new TypeError("A D100_TABLE row is required.");
  return Object.freeze({
    baseDisadvantage: BASE_VIOLATION_PENALTY,
    extraDisadvantage: result.extraDisadvantage,
    d4Charges: result.d4Charges,
    incidentTotal: BASE_VIOLATION_PENALTY + result.extraDisadvantage,
    expectedTotal: result.expectedTotal
  });
}

/** Validate that every integer in the d100 domain belongs to exactly one row. */
export function validateD100Table() {
  const errors = [];
  for ( let value = 1; value <= 100; value += 1 ) {
    const count = D100_TABLE.filter(row => (value >= row.min) && (value <= row.max)).length;
    if ( count !== 1 ) errors.push({ value, count });
  }
  for ( const row of D100_TABLE ) {
    if ( row.expectedTotal !== BASE_VIOLATION_PENALTY + row.extraDisadvantage ) {
      errors.push({ range: `${row.min}-${row.max}`, expectedTotal: row.expectedTotal });
    }
  }
  return errors;
}

export const MODULE_ID = "soz-agizdan-bir-kere-cikar";
export const MODULE_TITLE = "Consequences";
export const LOG_PREFIX = "[SABKC]";
export const STATE_FLAG = "state";
export const SCHEMA_VERSION = 2;
export const BASE_VIOLATION_PENALTY = 3;
export const DEFAULT_HISTORY_LIMIT = 100;
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const SOCKET_TIMEOUT_MS = 8000;
export const TRANSACTION_FIELD = `${MODULE_ID}TransactionId`;
export const D4_DATA_KEY = "sabkcPenaltyD4";
export const D4_FORMULA = "-1d4[SABKC]";

export const SETTINGS = Object.freeze({
  CONSUMPTION_CHAT: "penaltyConsumptionChat",
  VIOLATION_CHAT: "violationResultChat",
  HISTORY_LIMIT: "historyLimit",
  DEBUG: "debugMode"
});

export const CHAT_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  GM_ONLY: "gmOnly",
  DISABLED: "disabled"
});

export const ROLL_TYPES = Object.freeze({
  ATTACK: "attack",
  ABILITY_CHECK: "abilityCheck",
  SKILL: "skill",
  TOOL: "toolCheck",
  SAVING_THROW: "savingThrow",
  INITIATIVE: "initiative"
});

export const SUPPORTED_ROLL_TYPES = new Set(Object.values(ROLL_TYPES));

export const TEMPLATE_PATHS = Object.freeze({
  DASHBOARD: `modules/${MODULE_ID}/templates/dashboard.hbs`,
  INCIDENT_DIALOG: `modules/${MODULE_ID}/templates/incident-dialog.hbs`,
  EDIT_STATE_DIALOG: `modules/${MODULE_ID}/templates/edit-state-dialog.hbs`,
  HISTORY: `modules/${MODULE_ID}/templates/history-dialog.hbs`,
  CHAT_VIOLATION: `modules/${MODULE_ID}/templates/chat-violation.hbs`,
  CHAT_D100: `modules/${MODULE_ID}/templates/chat-d100.hbs`,
  CHAT_CONSUMPTION: `modules/${MODULE_ID}/templates/chat-consumption.hbs`
});

export const INTERPRETATION_HELP_KEY = "SABKC.Incident.InterpretationDefault";

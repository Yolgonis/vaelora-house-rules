import {
  DEFAULT_HISTORY_LIMIT,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS,
  STATE_FLAG
} from "./constants.mjs";
import { logger } from "./logger.mjs";

const actorQueues = new Map();

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  revision: 0,
  disadvantageCharges: 0,
  d4Charges: 0,
  violationsThisSession: 0,
  pendingIncident: null,
  incidentHistory: [],
  auditLog: []
});

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function nonNegativeInteger(value, fallback=0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function historyLimit() {
  try {
    return nonNegativeInteger(game.settings.get(MODULE_ID, SETTINGS.HISTORY_LIMIT), DEFAULT_HISTORY_LIMIT)
      || DEFAULT_HISTORY_LIMIT;
  } catch {
    return DEFAULT_HISTORY_LIMIT;
  }
}

function normalizeIncident(value) {
  if ( !value || (typeof value !== "object") || !value.id ) return null;
  return {
    id: String(value.id),
    actorId: String(value.actorId ?? ""),
    createdAt: nonNegativeInteger(value.createdAt, Date.now()),
    createdBy: String(value.createdBy ?? ""),
    statement: String(value.statement ?? ""),
    target: String(value.target ?? ""),
    scene: String(value.scene ?? ""),
    notes: String(value.notes ?? ""),
    roleInterpretation: String(value.roleInterpretation ?? ""),
    violationNumber: Math.max(1, nonNegativeInteger(value.violationNumber, 1)),
    basePenalty: nonNegativeInteger(value.basePenalty, 3),
    requestedRetraction: value.requestedRetraction === null || value.requestedRetraction === undefined
      ? null : Boolean(value.requestedRetraction),
    d100Resolved: Boolean(value.d100Resolved),
    diceResults: Array.isArray(value.diceResults)
      ? value.diceResults.map(result => nonNegativeInteger(result)).filter(result => result >= 1 && result <= 100)
      : [],
    finalD100: value.finalD100 === null || value.finalD100 === undefined
      ? null : nonNegativeInteger(value.finalD100),
    automatic100: Boolean(value.automatic100),
    roleResult: String(value.roleResult ?? ""),
    roleResultKey: String(value.roleResultKey ?? ""),
    addedDisadvantage: nonNegativeInteger(value.addedDisadvantage),
    addedD4: nonNegativeInteger(value.addedD4),
    appliedPenalty: value.appliedPenalty && (typeof value.appliedPenalty === "object")
      ? clone(value.appliedPenalty) : null,
    resolved: Boolean(value.resolved),
    resolvedAt: value.resolvedAt === null || value.resolvedAt === undefined
      ? null : nonNegativeInteger(value.resolvedAt),
    resolvedBy: String(value.resolvedBy ?? "")
  };
}

function normalizeAuditEntry(value) {
  if ( !value || (typeof value !== "object") ) return null;
  return {
    id: String(value.id ?? ""),
    at: nonNegativeInteger(value.at, Date.now()),
    by: String(value.by ?? ""),
    type: String(value.type ?? "unknown"),
    message: String(value.message ?? ""),
    details: value.details && (typeof value.details === "object") ? clone(value.details) : {}
  };
}

/** Return a safe state object from any legacy or malformed value. */
export function normalizeState(raw) {
  const source = raw && (typeof raw === "object") ? raw : {};
  const limit = historyLimit();
  const incidents = Array.isArray(source.incidentHistory)
    ? source.incidentHistory.map(normalizeIncident).filter(Boolean).slice(0, limit)
    : [];
  const incidentIds = new Set(incidents.map(incident => incident.id));
  const pending = source.pendingIncident && incidentIds.has(String(source.pendingIncident))
    ? String(source.pendingIncident) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: nonNegativeInteger(source.revision),
    disadvantageCharges: nonNegativeInteger(source.disadvantageCharges),
    d4Charges: nonNegativeInteger(source.d4Charges),
    violationsThisSession: nonNegativeInteger(source.violationsThisSession),
    pendingIncident: pending,
    incidentHistory: incidents,
    auditLog: Array.isArray(source.auditLog)
      ? source.auditLog.map(normalizeAuditEntry).filter(Boolean).slice(0, limit)
      : []
  };
}

export function getPenaltyState(actor) {
  if ( !actor ) return normalizeState(null);
  return normalizeState(actor.getFlag(MODULE_ID, STATE_FLAG));
}

export function createAuditEntry(type, message, details={}) {
  return {
    id: globalThis.foundry?.utils?.randomID?.(16) ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    at: Date.now(),
    by: globalThis.game?.user?.id ?? "",
    type,
    message,
    details: clone(details)
  };
}

/** Serialize all state mutations performed by this client for a given Actor. */
export async function withActorLock(actor, operation) {
  if ( !actor?.id ) throw new Error("A valid Actor is required.");
  const key = actor.uuid ?? actor.id;
  const previous = actorQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  actorQueues.set(key, current);
  try {
    return await current;
  } finally {
    if ( actorQueues.get(key) === current ) actorQueues.delete(key);
  }
}

/** Update the single Actor flag document and return normalized committed state. */
export async function updatePenaltyState(actor, transform, { audit=null }={}) {
  return withActorLock(actor, async () => {
    const current = getPenaltyState(actor);
    const draft = clone(current);
    const transformed = await transform(draft, current);
    const next = normalizeState(transformed ?? draft);
    next.revision = current.revision + 1;
    if ( audit ) next.auditLog.unshift(createAuditEntry(audit.type, audit.message, audit.details));
    next.auditLog = next.auditLog.slice(0, historyLimit());
    await actor.update({ [`flags.${MODULE_ID}.${STATE_FLAG}`]: next });
    logger.debug("actor state updated", { actorId: actor.id, revision: next.revision });
    return next;
  });
}

export async function migrateActorState(actor) {
  const raw = actor?.getFlag(MODULE_ID, STATE_FLAG);
  if ( raw === undefined ) return false;
  const normalized = normalizeState(raw);
  if ( JSON.stringify(raw) === JSON.stringify(normalized) ) return false;
  await actor.update({ [`flags.${MODULE_ID}.${STATE_FLAG}`]: normalized });
  logger.debug("actor state migrated", { actorId: actor.id, schemaVersion: SCHEMA_VERSION });
  return true;
}

export async function migrateAllActorStates() {
  if ( !globalThis.game?.user?.isGM ) return 0;
  let migrated = 0;
  for ( const actor of game.actors.filter(candidate => candidate.type === "character") ) {
    try {
      if ( await migrateActorState(actor) ) migrated += 1;
    } catch ( error ) {
      logger.error(`actor migration failed: ${actor.id}`, error);
    }
  }
  return migrated;
}

export function resolveActor(actorOrId) {
  if ( actorOrId?.documentName === "Actor" ) return game.actors.get(actorOrId.id) ?? actorOrId;
  if ( actorOrId?.actor?.documentName === "Actor" ) return game.actors.get(actorOrId.actor.id) ?? actorOrId.actor;
  if ( typeof actorOrId === "string" ) return game.actors.get(actorOrId) ?? null;
  return null;
}

export function getPlayerCharacters() {
  return game.actors.filter(actor => (actor.type === "character") && actor.hasPlayerOwner);
}

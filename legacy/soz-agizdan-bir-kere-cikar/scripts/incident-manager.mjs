import { BASE_VIOLATION_PENALTY } from "./constants.mjs";
import { createD100Card, createViolationCard } from "./chat-manager.mjs";
import { logger } from "./logger.mjs";
import { requireGm } from "./permissions.mjs";
import { calculatePenalty, getViolationRollCount, resolveD100 } from "./rule-engine.mjs";
import { getActiveGm, requestActiveGm } from "./socket-manager.mjs";
import { getPenaltyState, updatePenaltyState } from "./state-manager.mjs";

const incidentQueues = new Map();

function incidentId() {
  return foundry.utils.randomID(20);
}

async function withIncidentLock(actor, id, operation) {
  const key = `${actor.id}.${id}`;
  const previous = incidentQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  incidentQueues.set(key, current);
  try {
    return await current;
  } finally {
    if ( incidentQueues.get(key) === current ) incidentQueues.delete(key);
  }
}

function findIncident(state, id) {
  return state.incidentHistory.find(incident => incident.id === id) ?? null;
}

function nextPendingIncident(state, excludingId=null) {
  return state.incidentHistory.find(incident => !incident.resolved && (incident.id !== excludingId))?.id ?? null;
}

async function safeChat(operation) {
  try {
    return await operation();
  } catch ( error ) {
    logger.error("chat card creation failed after state commit", error);
    ui.notifications.error("SABKC.Errors.ChatCard", { localize: true });
    return null;
  }
}

export async function addViolation(actor, data={}) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  if ( !actor || (actor.type !== "character") ) throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  let createdIncident;
  const state = await updatePenaltyState(actor, draft => {
    const violationNumber = draft.violationsThisSession + 1;
    createdIncident = {
      id: incidentId(),
      actorId: actor.id,
      createdAt: Date.now(),
      createdBy: game.user.id,
      statement: String(data.statement ?? "").trim(),
      target: String(data.target ?? "").trim(),
      scene: String(data.scene ?? "").trim(),
      notes: String(data.notes ?? "").trim(),
      roleInterpretation: String(data.roleInterpretation ?? "").trim(),
      violationNumber,
      basePenalty: BASE_VIOLATION_PENALTY,
      requestedRetraction: null,
      d100Resolved: false,
      diceResults: [],
      finalD100: null,
      automatic100: false,
      roleResult: "",
      roleResultKey: "",
      addedDisadvantage: 0,
      addedD4: 0,
      appliedPenalty: null,
      resolved: false,
      resolvedAt: null,
      resolvedBy: ""
    };
    draft.violationsThisSession = violationNumber;
    draft.disadvantageCharges += BASE_VIOLATION_PENALTY;
    draft.pendingIncident = createdIncident.id;
    draft.incidentHistory.unshift(createdIncident);
    return draft;
  }, {
    audit: {
      type: "violationCreated",
      message: game.i18n.localize("SABKC.Audit.ViolationCreated"),
      details: { basePenalty: BASE_VIOLATION_PENALTY }
    }
  });
  await safeChat(() => createViolationCard(actor, createdIncident, state));
  return { incident: createdIncident, state };
}

function validateD100Requester(actor, requesterId) {
  const requester = game.users.get(requesterId);
  if ( !requester || requester.isGM || !actor.testUserPermission(requester, "OWNER") ) {
    throw new Error(game.i18n.localize("SABKC.Errors.PlayerRollOnly"));
  }
}

function validateDiceResults(results, expectedCount) {
  if ( !Array.isArray(results) || (results.length !== expectedCount) ) {
    throw new Error(game.i18n.localize("SABKC.Errors.InvalidD100Roll"));
  }
  const parsed = results.map(Number);
  if ( parsed.some(value => !Number.isInteger(value) || (value < 1) || (value > 100)) ) {
    throw new Error(game.i18n.localize("SABKC.Errors.InvalidD100Roll"));
  }
  return parsed;
}

async function authoritativeResolveIncidentD100(payload, { requesterId }) {
  if ( !game.user.isGM ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  const actor = game.actors.get(payload.actorId);
  if ( !actor || (actor.type !== "character") ) {
    throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  }
  validateD100Requester(actor, requesterId);
  const id = String(payload.incidentId ?? "");
  return withIncidentLock(actor, id, async () => {
    const before = getPenaltyState(actor);
    const incident = findIncident(before, id);
    if ( !incident ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
    if ( incident.resolved ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentResolved"));
    if ( incident.d100Resolved ) throw new Error(game.i18n.localize("SABKC.Errors.D100AlreadyResolved"));

    const rollCount = getViolationRollCount(incident.violationNumber);
    const diceResults = validateDiceResults(payload.diceResults, rollCount);
    const finalD100 = rollCount === 0 ? 100 : Math.max(...diceResults);
    const tableResult = resolveD100(finalD100);
    const penalty = calculatePenalty(tableResult);
    const localizedRoleResult = game.i18n.localize(tableResult.roleResult);
    let committedIncident;
    const state = await updatePenaltyState(actor, draft => {
      const target = findIncident(draft, id);
      if ( !target ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
      if ( target.resolved ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentResolved"));
      if ( target.d100Resolved ) throw new Error(game.i18n.localize("SABKC.Errors.D100AlreadyResolved"));
      target.requestedRetraction = true;
      target.d100Resolved = true;
      target.diceResults = diceResults;
      target.finalD100 = finalD100;
      target.automatic100 = rollCount === 0;
      target.roleResult = localizedRoleResult;
      target.roleResultKey = tableResult.roleResult;
      target.addedDisadvantage = penalty.extraDisadvantage;
      target.addedD4 = penalty.d4Charges;
      target.appliedPenalty = { ...penalty };
      draft.disadvantageCharges += penalty.extraDisadvantage;
      draft.d4Charges += penalty.d4Charges;
      draft.pendingIncident = target.id;
      committedIncident = { ...target };
      return draft;
    }, {
      audit: {
        type: "d100Resolved",
        message: game.i18n.localize("SABKC.Audit.D100Resolved"),
        details: { incidentId: id, diceResults, finalD100, rolledBy: requesterId }
      }
    });
    return { incident: committedIncident, state };
  });
}

export function getIncidentSocketHandlers() {
  return { resolveIncidentD100: authoritativeResolveIncidentD100 };
}

export async function requestIncidentD100(actor, id) {
  if ( !actor || (actor.type !== "character") ) {
    throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  }
  if ( game.user.isGM || !actor.testUserPermission(game.user, "OWNER") ) {
    throw new Error(game.i18n.localize("SABKC.Errors.PlayerRollOnly"));
  }
  if ( !getActiveGm() ) throw new Error(game.i18n.localize("SABKC.Errors.NoActiveGm"));

  const incident = findIncident(getPenaltyState(actor), id);
  if ( !incident ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
  if ( incident.resolved ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentResolved"));
  if ( incident.d100Resolved ) throw new Error(game.i18n.localize("SABKC.Errors.D100AlreadyResolved"));

  const rollCount = getViolationRollCount(incident.violationNumber);
  const roll = rollCount > 0 ? await new Roll(`${rollCount}d100`).evaluate() : null;
  const diceResults = roll
    ? roll.dice.flatMap(die => die.results.map(result => Number(result.result)))
    : [];
  const result = await requestActiveGm("resolveIncidentD100", {
    actorId: actor.id,
    incidentId: id,
    diceResults
  });
  await safeChat(() => createD100Card(actor, result.incident, result.state, roll));
  return { ...result, roll };
}

export const resolveIncidentD100 = requestIncidentD100;

export async function closeIncidentWithoutRetraction(actor, id) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  return updatePenaltyState(actor, draft => {
    const incident = findIncident(draft, id);
    if ( !incident ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
    incident.requestedRetraction ??= false;
    incident.resolved = true;
    incident.resolvedAt = Date.now();
    incident.resolvedBy = game.user.id;
    if ( draft.pendingIncident === id ) draft.pendingIncident = nextPendingIncident(draft, id);
    return draft;
  }, {
    audit: {
      type: "incidentClosed",
      message: game.i18n.localize("SABKC.Audit.IncidentClosed"),
      details: { incidentId: id }
    }
  });
}

export async function markIncidentResolved(actor, id) {
  return closeIncidentWithoutRetraction(actor, id);
}

export async function editIncident(actor, id, data) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  return updatePenaltyState(actor, draft => {
    const incident = findIncident(draft, id);
    if ( !incident ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
    for ( const key of ["statement", "target", "scene", "roleInterpretation"] ) {
      incident[key] = String(data[key] ?? "").trim();
    }
    return draft;
  }, {
    audit: {
      type: "incidentEdited",
      message: game.i18n.localize("SABKC.Audit.IncidentEdited"),
      details: { incidentId: id }
    }
  });
}

export async function deleteIncident(actor, id) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  return updatePenaltyState(actor, draft => {
    if ( !findIncident(draft, id) ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
    draft.incidentHistory = draft.incidentHistory.filter(incident => incident.id !== id);
    if ( draft.pendingIncident === id ) draft.pendingIncident = nextPendingIncident(draft, id);
    return draft;
  }, {
    audit: {
      type: "incidentDeleted",
      message: game.i18n.localize("SABKC.Audit.IncidentDeleted"),
      details: { incidentId: id }
    }
  });
}

export async function setManualPenaltyState(actor, values) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  const parsed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  if ( Object.values(parsed).some(value => !Number.isInteger(value) || (value < 0)) ) {
    throw new Error(game.i18n.localize("SABKC.Errors.NonNegativeInteger"));
  }
  return updatePenaltyState(actor, draft => {
    draft.disadvantageCharges = parsed.disadvantageCharges;
    draft.d4Charges = parsed.d4Charges;
    draft.violationsThisSession = parsed.violationsThisSession;
    return draft;
  }, {
    audit: {
      type: "manualEdit",
      message: game.i18n.localize("SABKC.Audit.ManualEdit"),
      details: parsed
    }
  });
}

export async function resetActorPenalties(actor) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  return updatePenaltyState(actor, draft => {
    draft.disadvantageCharges = 0;
    draft.d4Charges = 0;
    draft.violationsThisSession = 0;
    return draft;
  }, {
    audit: { type: "actorReset", message: game.i18n.localize("SABKC.Audit.ActorReset") }
  });
}

export async function resetSessionCounters(actors) {
  if ( !requireGm() ) throw new Error(game.i18n.localize("SABKC.Errors.GmOnly"));
  const results = [];
  for ( const actor of actors ) {
    results.push(await updatePenaltyState(actor, draft => {
      draft.violationsThisSession = 0;
      return draft;
    }, {
      audit: { type: "newSession", message: game.i18n.localize("SABKC.Audit.NewSession") }
    }));
  }
  return results;
}

import {
  D4_DATA_KEY,
  D4_FORMULA,
  MODULE_ID,
  ROLL_TYPES,
  SETTINGS,
  TRANSACTION_FIELD
} from "./constants.mjs";
import { createConsumptionCard } from "./chat-manager.mjs";
import { logger } from "./logger.mjs";
import {
  buildPenaltyRollConfig,
  classifyDnd5eRoll,
  consumeReservedPenalty,
  forcePenaltyD20Options,
  getReservationDecision
} from "./roll-policy.mjs";
import { getActiveGm, requestActiveGm } from "./socket-manager.mjs";
import { getPenaltyState, updatePenaltyState } from "./state-manager.mjs";

const RESERVATION_MAX_AGE_MS = 120000;
const authoritativeReservations = new Map();
const localTransactions = new Map();
const activeActorTransactions = new Map();
const patchedMethods = [];
const libWrapperTargets = [];
let initialized = false;

function actorFromSubject(subject) {
  const actor = subject?.documentName === "Actor" ? subject : subject?.actor;
  return actor ? (game.actors.get(actor.id) ?? actor) : null;
}

function transactionId() {
  return foundry.utils.randomID(24);
}

function validateRequester(actor, requesterId) {
  const requester = game.users.get(requesterId);
  if ( !requester || (!requester.isGM && !actor.testUserPermission(requester, "OWNER")) ) {
    throw new Error(game.i18n.localize("SABKC.Errors.ActorPermission"));
  }
}

function cleanExpiredReservations() {
  const cutoff = Date.now() - RESERVATION_MAX_AGE_MS;
  for ( const [id, reservation] of authoritativeReservations ) {
    if ( reservation.createdAt < cutoff ) authoritativeReservations.delete(id);
  }
}

async function authoritativeReserve(payload, { requesterId }) {
  cleanExpiredReservations();
  const actor = game.actors.get(payload.actorId);
  if ( !actor || (actor.type !== "character") ) throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  validateRequester(actor, requesterId);
  const state = getPenaltyState(actor);
  const existing = [...authoritativeReservations.values()].filter(reservation => reservation.actorId === actor.id);
  const decision = getReservationDecision({
    state,
    rollType: payload.rollType,
    reservedDisadvantage: existing.length,
    reservedD4: existing.filter(reservation => reservation.useD4).length
  });
  if ( !decision.allowed ) return decision;
  const id = transactionId();
  const reservation = {
    id,
    actorId: actor.id,
    requesterId,
    rollType: payload.rollType,
    useD4: decision.useD4,
    createdAt: Date.now()
  };
  authoritativeReservations.set(id, reservation);
  logger.debug("penalty transaction reserved", reservation);
  return { allowed: true, ...reservation };
}

async function authoritativeRelease(payload, { requesterId }) {
  const reservation = authoritativeReservations.get(payload.transactionId);
  if ( !reservation ) return { released: false };
  if ( reservation.requesterId !== requesterId && !game.users.get(requesterId)?.isGM ) {
    throw new Error(game.i18n.localize("SABKC.Errors.ActorPermission"));
  }
  authoritativeReservations.delete(reservation.id);
  logger.debug("penalty transaction released", { transactionId: reservation.id });
  return { released: true };
}

async function authoritativeCommit(payload, { requesterId }) {
  const reservation = authoritativeReservations.get(payload.transactionId);
  if ( !reservation ) throw new Error(game.i18n.localize("SABKC.Errors.TransactionMissing"));
  if ( reservation.requesterId !== requesterId && !game.users.get(requesterId)?.isGM ) {
    throw new Error(game.i18n.localize("SABKC.Errors.ActorPermission"));
  }
  const actor = game.actors.get(reservation.actorId);
  if ( !actor ) {
    authoritativeReservations.delete(reservation.id);
    throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  }
  try {
    const state = await updatePenaltyState(actor, draft => consumeReservedPenalty(draft, {
      useD4: reservation.useD4
    }), {
      audit: {
        type: "penaltyConsumed",
        message: game.i18n.localize("SABKC.Audit.PenaltyConsumed"),
        details: {
          rollType: reservation.rollType,
          usedD4: reservation.useD4,
          d4Result: payload.d4Result ?? null
        }
      }
    });
    authoritativeReservations.delete(reservation.id);
    const transaction = { ...reservation, d4Result: payload.d4Result ?? null };
    try {
      await createConsumptionCard(actor, transaction, state);
    } catch ( error ) {
      logger.error("consumption chat card failed after state commit", error);
    }
    logger.debug("penalty transaction finalized", {
      transactionId: reservation.id,
      actorId: actor.id,
      remaining: state.disadvantageCharges
    });
    return { committed: true, state };
  } catch ( error ) {
    logger.error("penalty transaction commit failed", error);
    throw error;
  }
}

export function getRollSocketHandlers() {
  return {
    reserveRollPenalty: authoritativeReserve,
    releaseRollPenalty: authoritativeRelease,
    commitRollPenalty: authoritativeCommit
  };
}

async function runAuthorityAction(action, payload) {
  const gm = getActiveGm();
  if ( gm ) return requestActiveGm(action, payload);
  const actor = game.actors.get(payload.actorId)
    ?? (payload.transactionId && game.actors.get(authoritativeReservations.get(payload.transactionId)?.actorId));
  if ( actor && !actor.isOwner ) throw new Error(game.i18n.localize("SABKC.Errors.NoActiveGm"));
  const handlers = getRollSocketHandlers();
  return handlers[action](payload, { requesterId: game.user.id });
}

async function reserveForRoll(actor, rollType) {
  return runAuthorityAction("reserveRollPenalty", { actorId: actor.id, rollType });
}

async function releaseTransaction(transaction) {
  try {
    await runAuthorityAction("releaseRollPenalty", {
      actorId: transaction.actorId,
      transactionId: transaction.id
    });
  } catch ( error ) {
    logger.warn("transaction release request failed", error);
  } finally {
    localTransactions.delete(transaction.id);
  }
}

function findPenaltyD4Result(rolls=[]) {
  for ( const roll of rolls ) {
    for ( const die of roll?.dice ?? [] ) {
      if ( (die.faces === 4) && String(die.options?.flavor ?? "").includes("SABKC") ) {
        return die.results.reduce((sum, result) => sum + Number(result.result ?? 0), 0);
      }
    }
  }
  return null;
}

async function commitTransaction(transaction) {
  const d4Result = transaction.useD4 ? findPenaltyD4Result(transaction.rolls) : null;
  try {
    await runAuthorityAction("commitRollPenalty", {
      actorId: transaction.actorId,
      transactionId: transaction.id,
      d4Result
    });
  } finally {
    localTransactions.delete(transaction.id);
  }
}

function forceDisadvantage(roll) {
  if ( !roll?.d20?.applyAdvantage ) return;
  const disadvantage = CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
  Object.assign(roll.options, forcePenaltyD20Options(roll.options, disadvantage));
  roll.d20.applyAdvantage(disadvantage);
  roll.resetFormula();
}

function prepareRollConfig(config, transaction) {
  if ( transaction.prepared ) return;
  config.advantage = false;
  config.disadvantage = true;
  for ( const rollConfig of config.rolls ?? [] ) {
    const prepared = buildPenaltyRollConfig(rollConfig, {
      useD4: transaction.useD4,
      disadvantageMode: CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE,
      d4DataKey: D4_DATA_KEY,
      d4Formula: D4_FORMULA
    });
    Object.assign(rollConfig, prepared);
  }
  transaction.prepared = true;
  logger.debug("penalty applied to roll config", {
    transactionId: transaction.id,
    useD4: transaction.useD4
  });
}

function onPreRoll(config) {
  try {
    const classification = classifyDnd5eRoll(config?.hookNames);
    if ( !classification.eligible ) return;
    let id = config?.[TRANSACTION_FIELD];
    if ( !id && (classification.rollType === ROLL_TYPES.INITIATIVE) ) {
      const actor = actorFromSubject(config.subject);
      id = activeActorTransactions.get(actor?.id)?.id;
      if ( id ) config[TRANSACTION_FIELD] = id;
    }
    const transaction = localTransactions.get(id);
    if ( !transaction ) return;
    if ( transaction.rollType !== classification.rollType ) {
      logger.debug("nested roll hook reused transaction", {
        transactionId: id,
        reservedType: transaction.rollType,
        hookType: classification.rollType
      });
    }
    prepareRollConfig(config, transaction);
  } catch ( error ) {
    logger.error("pre-roll preparation failed", error);
  }
}

function onPostRollConfiguration(rolls, config) {
  try {
    const transaction = localTransactions.get(config?.[TRANSACTION_FIELD]);
    if ( !transaction ) return;
    if ( !Array.isArray(rolls) || !rolls.length ) {
      transaction.rollConfigured = false;
      return;
    }
    for ( const roll of rolls ) forceDisadvantage(roll);
    transaction.rolls = rolls;
    transaction.rollConfigured = true;
    logger.debug("configured roll forced to disadvantage", { transactionId: transaction.id });
  } catch ( error ) {
    logger.error("post-roll configuration failed", error);
  }
}

function onPreRollInitiative(actor, roll) {
  try {
    const transaction = activeActorTransactions.get(actor?.id);
    if ( transaction?.rollType === ROLL_TYPES.INITIATIVE ) forceDisadvantage(roll);
  } catch ( error ) {
    logger.error("initiative disadvantage enforcement failed", error);
  }
}

function hasCompletedD20Roll(result) {
  const rolls = Array.isArray(result) ? result : result ? [result] : [];
  return rolls.length > 0 && rolls.some(roll => roll?.d20 && (roll.total !== undefined));
}

function transactionHasEvaluatedRoll(transaction) {
  return transaction.rolls.some(roll => roll?.d20 && (roll.total !== undefined));
}

function prepareDirectInitiative(actor, args, transaction) {
  let roll = actor._cachedInitiativeRoll;
  if ( !roll ) roll = actor.getInitiativeRoll(args[1] ?? {});
  if ( !roll?.d20 ) return false;
  if ( transaction.useD4 && !String(roll.formula).includes("SABKC") ) {
    const data = { ...roll.data, [D4_DATA_KEY]: D4_FORMULA };
    const options = forcePenaltyD20Options(roll.options, CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE);
    roll = new CONFIG.Dice.D20Roll(`${roll.formula} + @${D4_DATA_KEY}`, data, options);
  } else forceDisadvantage(roll);
  actor._cachedInitiativeRoll = roll;
  transaction.rolls = [roll];
  transaction.rollConfigured = true;
  return true;
}

async function runWrappedRoll(subject, rollType, original, args) {
  const actor = actorFromSubject(subject);
  if ( !actor || (actor.type !== "character") ) return original.apply(subject, args);

  const existing = activeActorTransactions.get(actor.id);
  if ( existing ) {
    logger.debug("duplicate or nested roll entry ignored", {
      actorId: actor.id,
      transactionId: existing.id,
      rollType
    });
    const result = await original.apply(subject, args);
    if ( rollType === ROLL_TYPES.INITIATIVE ) {
      existing.initiativeInvoked = true;
      existing.initiativeResult = result;
    }
    return result;
  }

  let reservation;
  logger.debug("eligible roll detected", { actorId: actor.id, rollType });
  try {
    const reservationType = rollType === "initiativeDialog" ? ROLL_TYPES.INITIATIVE : rollType;
    reservation = await reserveForRoll(actor, reservationType);
  } catch ( error ) {
    logger.error("penalty reservation failed; roll continues without consuming a charge", error);
    ui.notifications.error(error?.message ?? game.i18n.localize("SABKC.Errors.Transaction"));
    return original.apply(subject, args);
  }
  if ( !reservation?.allowed ) return original.apply(subject, args);

  const transaction = {
    ...reservation,
    rolls: [],
    prepared: false,
    rollConfigured: false,
    initiativeInvoked: false,
    initiativeResult: null
  };
  localTransactions.set(transaction.id, transaction);
  activeActorTransactions.set(actor.id, transaction);

  const config = args[0] ?? {};
  args[0] = config;
  if ( rollType !== ROLL_TYPES.INITIATIVE && rollType !== "initiativeDialog" ) {
    config[TRANSACTION_FIELD] = transaction.id;
  }

  try {
    if ( (rollType === ROLL_TYPES.INITIATIVE) && !prepareDirectInitiative(actor, args, transaction) ) {
      await releaseTransaction(transaction);
      return original.apply(subject, args);
    }
    const result = await original.apply(subject, args);
    const completed = rollType === "initiativeDialog"
      ? transaction.rollConfigured && transaction.initiativeInvoked && (transaction.initiativeResult !== null)
      : rollType === ROLL_TYPES.INITIATIVE
        ? result !== null
        : hasCompletedD20Roll(result);
    if ( completed ) {
      try {
        await commitTransaction(transaction);
      } catch ( error ) {
        logger.error("completed roll could not finalize its transaction", error);
        ui.notifications.error("SABKC.Errors.CommitFailed", { localize: true });
      }
    } else await releaseTransaction(transaction);
    return result;
  } catch ( error ) {
    if ( transactionHasEvaluatedRoll(transaction) ) {
      try {
        await commitTransaction(transaction);
      } catch ( commitError ) {
        logger.error("evaluated roll failed and its transaction could not be finalized", commitError);
        ui.notifications.error("SABKC.Errors.CommitFailed", { localize: true });
      }
    } else await releaseTransaction(transaction);
    throw error;
  } finally {
    if ( activeActorTransactions.get(actor.id)?.id === transaction.id ) activeActorTransactions.delete(actor.id);
  }
}

function patchMethod(prototype, methodName, rollType, targetPath) {
  const original = prototype?.[methodName];
  if ( typeof original !== "function" ) {
    logger.warn(`roll method unavailable: ${methodName}`);
    return;
  }
  if ( targetPath && (typeof globalThis.libWrapper?.register === "function") ) {
    try {
      const wrapper = async function(wrapped, ...args) {
        return runWrappedRoll(this, rollType, wrapped, args);
      };
      globalThis.libWrapper.register(MODULE_ID, targetPath, wrapper, "WRAPPER");
      libWrapperTargets.push(targetPath);
      logger.debug("roll method registered through libWrapper", { targetPath });
      return;
    } catch ( error ) {
      logger.warn(`libWrapper registration failed; using direct fallback: ${targetPath}`, error);
    }
  }
  if ( original.__sabkcWrapped ) return;
  const wrapped = async function(...args) {
    return runWrappedRoll(this, rollType, original, args);
  };
  Object.defineProperty(wrapped, "__sabkcWrapped", { value: true });
  prototype[methodName] = wrapped;
  patchedMethods.push({ prototype, methodName, original, wrapped });
}

export function initializeRollManager() {
  if ( initialized ) return;
  Hooks.on("dnd5e.preRoll", onPreRoll);
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  Hooks.on("dnd5e.preRollInitiative", onPreRollInitiative);

  const actorPrototype = CONFIG.Actor.documentClass?.prototype;
  patchMethod(actorPrototype, "rollSkill", ROLL_TYPES.SKILL,
    "CONFIG.Actor.documentClass.prototype.rollSkill");
  patchMethod(actorPrototype, "rollToolCheck", ROLL_TYPES.TOOL,
    "CONFIG.Actor.documentClass.prototype.rollToolCheck");
  patchMethod(actorPrototype, "rollAbilityCheck", ROLL_TYPES.ABILITY_CHECK,
    "CONFIG.Actor.documentClass.prototype.rollAbilityCheck");
  patchMethod(actorPrototype, "rollSavingThrow", ROLL_TYPES.SAVING_THROW,
    "CONFIG.Actor.documentClass.prototype.rollSavingThrow");
  patchMethod(actorPrototype, "rollInitiative", ROLL_TYPES.INITIATIVE,
    "CONFIG.Actor.documentClass.prototype.rollInitiative");
  patchMethod(actorPrototype, "rollInitiativeDialog", "initiativeDialog",
    "CONFIG.Actor.documentClass.prototype.rollInitiativeDialog");
  patchMethod(CONFIG.DND5E.activityTypes?.attack?.documentClass?.prototype, "rollAttack", ROLL_TYPES.ATTACK,
    "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack");
  initialized = true;
  logger.debug("roll hooks and guarded public roll-method wrappers registered");
}

export function restoreRollMethods() {
  for ( const targetPath of libWrapperTargets.splice(0) ) {
    try {
      globalThis.libWrapper?.unregister?.(MODULE_ID, targetPath, false);
    } catch ( error ) {
      logger.warn(`libWrapper unregister failed: ${targetPath}`, error);
    }
  }
  for ( const patch of patchedMethods.splice(0) ) {
    if ( patch.prototype[patch.methodName] === patch.wrapped ) patch.prototype[patch.methodName] = patch.original;
  }
  initialized = false;
}

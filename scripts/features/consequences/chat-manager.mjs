import {
  CHAT_VISIBILITY,
  MODULE_ID,
  SETTINGS,
  TEMPLATE_PATHS
} from "./constants.mjs";
import { logger } from "./logger.mjs";

let chatActionHandler = null;
let initialized = false;

function visibilityData(settingName) {
  const visibility = game.settings.get(MODULE_ID, settingName);
  if ( visibility === CHAT_VISIBILITY.GM_ONLY ) {
    return { whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id) };
  }
  return {};
}

async function renderCard(template, context) {
  try {
    return await foundry.applications.handlebars.renderTemplate(template, context);
  } catch ( error ) {
    logger.error(`chat template failed: ${template}`, error);
    ui.notifications.error("SABKC.Errors.Template", { localize: true });
    throw error;
  }
}

async function createCard({ template, context, actor, cardType, incidentId=null, roll=null, settingName }) {
  const content = await renderCard(template, context);
  const data = {
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [MODULE_ID]: { cardType, actorId: actor.id, incidentId }
    },
    ...visibilityData(settingName)
  };
  if ( roll ) {
    data.rolls = [roll];
    data.sound = CONFIG.sounds.dice;
  }
  return ChatMessage.create(data);
}

export async function createViolationCard(actor, incident, state) {
  return createCard({
    template: TEMPLATE_PATHS.CHAT_VIOLATION,
    context: {
      actorName: actor.name,
      statement: incident.statement,
      target: incident.target,
      scene: incident.scene,
      basePenalty: incident.basePenalty,
      currentTotal: state.disadvantageCharges,
      violationNumber: incident.violationNumber,
      actorId: actor.id,
      incidentId: incident.id
    },
    actor,
    cardType: "violation",
    incidentId: incident.id,
    settingName: SETTINGS.VIOLATION_CHAT
  });
}

export async function createD100Card(actor, incident, state, roll) {
  return createCard({
    template: TEMPLATE_PATHS.CHAT_D100,
    context: {
      actorName: actor.name,
      rollCount: incident.diceResults.length,
      diceText: incident.diceResults.join(", "),
      finalD100: incident.finalD100,
      automatic100: incident.automatic100,
      roleResult: incident.roleResult,
      extraDisadvantage: incident.addedDisadvantage,
      d4Charges: incident.addedD4,
      incidentTotal: incident.appliedPenalty?.incidentTotal ?? incident.basePenalty + incident.addedDisadvantage,
      currentTotal: state.disadvantageCharges,
      actorId: actor.id,
      incidentId: incident.id
    },
    actor,
    cardType: "d100",
    incidentId: incident.id,
    roll,
    settingName: SETTINGS.VIOLATION_CHAT
  });
}

export async function createConsumptionCard(actor, transaction, state) {
  const visibility = game.settings.get(MODULE_ID, SETTINGS.CONSUMPTION_CHAT);
  if ( visibility === CHAT_VISIBILITY.DISABLED ) return null;
  return createCard({
    template: TEMPLATE_PATHS.CHAT_CONSUMPTION,
    context: {
      actorName: actor.name,
      usedD4: transaction.useD4,
      d4Result: transaction.d4Result ?? null,
      remainingDisadvantage: state.disadvantageCharges,
      remainingD4: state.d4Charges
    },
    actor,
    cardType: "consumption",
    settingName: SETTINGS.CONSUMPTION_CHAT
  });
}

async function onRenderChatMessage(message, html) {
  const cardType = message.getFlag(MODULE_ID, "cardType");
  if ( !cardType ) return;
  const root = html.querySelector?.(".sabkc-chat-card");
  if ( !root ) return;
  const gmActions = root.querySelector(".sabkc-gm-actions");
  if ( !game.user.isGM ) gmActions?.remove();
  const actor = game.actors.get(message.getFlag(MODULE_ID, "actorId"));
  const playerActions = root.querySelector(".sabkc-player-actions");
  const playerCanRoll = !game.user.isGM && actor?.testUserPermission(game.user, "OWNER");
  if ( !playerCanRoll ) playerActions?.remove();
  if ( root.dataset.sabkcBound === "true" ) return;
  root.dataset.sabkcBound = "true";
  root.querySelectorAll("[data-sabkc-action]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      if ( typeof chatActionHandler !== "function" ) return;
      try {
        await chatActionHandler(button.dataset.sabkcAction, {
          actorId: button.dataset.actorId,
          incidentId: button.dataset.incidentId,
          message
        });
      } catch ( error ) {
        logger.error("chat action failed", error);
        ui.notifications.error(error?.message ?? "SABKC.Errors.Unexpected", { localize: false });
      }
    });
  });
}

export function initializeChatManager(actionHandler) {
  chatActionHandler = actionHandler;
  if ( initialized ) return;
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  initialized = true;
  logger.debug("dnd5e chat-card hook registered");
}

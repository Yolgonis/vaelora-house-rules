import { createPublicApi } from "./api.mjs";
import { openDashboard, PenaltyDashboard, rerenderDashboard } from "./applications/dashboard.mjs";
import { IncidentDialog } from "./applications/incident-dialog.mjs";
import {
  closeIncidentWithoutRetraction,
  editIncident,
  getIncidentSocketHandlers,
  markIncidentResolved,
  requestIncidentD100
} from "./incident-manager.mjs";
import { initializeChatManager } from "./chat-manager.mjs";
import { MODULE_ID, TEMPLATE_PATHS } from "./constants.mjs";
import { logger } from "./logger.mjs";
import { getRollSocketHandlers, initializeRollManager, restoreRollMethods } from "./roll-manager.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeSocketManager } from "./socket-manager.mjs";
import { getPenaltyState, migrateAllActorStates } from "./state-manager.mjs";

function isDnd5e5() {
  return game.system.id === "dnd5e" && Number.parseInt(String(game.system.version).split(".")[0], 10) === 5;
}

function registerSceneControl() {
  Hooks.on("getSceneControlButtons", controls => {
    if ( !game.user?.isGM || (game.system?.id !== "dnd5e") ) return;
    const tokenControl = controls.tokens;
    if ( !tokenControl?.tools ) return;
    tokenControl.tools.sabkcDashboard = {
      name: "sabkcDashboard",
      title: "SABKC.Dashboard.Title",
      icon: "fa-solid fa-scale-balanced",
      order: Object.keys(tokenControl.tools).length,
      button: true,
      visible: true,
      onChange: () => openDashboard()
    };
  });
}

async function onChatAction(action, { actorId, incidentId }) {
  const actor = game.actors.get(actorId);
  if ( !actor ) throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  switch ( action ) {
    case "requestD100":
      await requestIncidentD100(actor, incidentId);
      break;
    case "closeIncident":
      await closeIncidentWithoutRetraction(actor, incidentId);
      break;
    case "markResolved":
      await markIncidentResolved(actor, incidentId);
      break;
    case "editIncident": {
      const incident = getPenaltyState(actor).incidentHistory.find(entry => entry.id === incidentId);
      if ( !incident ) throw new Error(game.i18n.localize("SABKC.Errors.IncidentMissing"));
      const data = await IncidentDialog.prompt(actor, incident);
      if ( data ) await editIncident(actor, incidentId, data);
      break;
    }
    default:
      throw new Error(`Unknown SABKC chat action: ${action}`);
  }
  rerenderDashboard();
}

Hooks.once("init", () => {
  registerSettings(PenaltyDashboard);
  registerSceneControl();
  const module = game.modules.get(MODULE_ID);
  if ( module ) module.api = createPublicApi();
  logger.debug("module initialized");
});

Hooks.once("ready", async () => {
  if ( game.system.id !== "dnd5e" ) {
    ui.notifications.warn("SABKC.Errors.WrongSystem", { localize: true, permanent: true });
    logger.warn(`unsupported game system: ${game.system.id}`);
    return;
  }
  if ( !isDnd5e5() ) {
    ui.notifications.warn("SABKC.Errors.WrongDndVersion", { localize: true, permanent: true });
    logger.warn(`unsupported dnd5e version: ${game.system.version}`);
    return;
  }

  try {
    await foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATE_PATHS));
  } catch ( error ) {
    logger.error("template preload failed", error);
    ui.notifications.error("SABKC.Errors.Template", { localize: true });
  }

  initializeSocketManager({ ...getRollSocketHandlers(), ...getIncidentSocketHandlers() });
  initializeRollManager();
  initializeChatManager(onChatAction);

  Hooks.on("updateActor", (actor, changes) => {
    const flattened = Object.keys(foundry.utils.flattenObject(changes));
    if ( flattened.some(key => key.startsWith(`flags.${MODULE_ID}.`)) ) rerenderDashboard();
  });

  if ( game.user.isGM ) {
    try {
      const migrated = await migrateAllActorStates();
      if ( migrated ) logger.info(`${migrated} Actor state record(s) migrated`);
    } catch ( error ) {
      logger.error("world state migration failed", error);
    }
  }
  logger.info(`ready for Foundry ${game.release.version}, dnd5e ${game.system.version}`);
});

Hooks.once("shutdown", restoreRollMethods);

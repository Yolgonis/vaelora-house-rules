import { openDashboard } from "./applications/dashboard.mjs";
import { HistoryDialog } from "./applications/history-dialog.mjs";
import {
  addViolation,
  requestIncidentD100,
  resetSessionCounters,
  setManualPenaltyState
} from "./incident-manager.mjs";
import { requireGm } from "./permissions.mjs";
import { getPenaltyState, getPlayerCharacters, resolveActor } from "./state-manager.mjs";

function requiredActor(actorOrId) {
  const actor = resolveActor(actorOrId);
  if ( !actor ) throw new Error(game.i18n.localize("SABKC.Errors.InvalidActor"));
  return actor;
}

function ensureSupportedSystem() {
  const supported = game.system.id === "dnd5e"
    && Number.parseInt(String(game.system.version).split(".")[0], 10) === 5;
  if ( supported ) return true;
  ui.notifications.warn(game.system.id === "dnd5e"
    ? "SABKC.Errors.WrongDndVersion" : "SABKC.Errors.WrongSystem", { localize: true });
  return false;
}

export function createPublicApi() {
  return Object.freeze({
    async addViolation(actorOrId, data={}) {
      if ( !ensureSupportedSystem() ) return null;
      return addViolation(requiredActor(actorOrId), data);
    },
    getPenaltyState(actorOrId) {
      return getPenaltyState(requiredActor(actorOrId));
    },
    async setPenaltyState(actorOrId, values={}) {
      if ( !ensureSupportedSystem() ) return null;
      if ( !requireGm() ) return null;
      const actor = requiredActor(actorOrId);
      const current = getPenaltyState(actor);
      return setManualPenaltyState(actor, {
        disadvantageCharges: values.disadvantageCharges ?? current.disadvantageCharges,
        d4Charges: values.d4Charges ?? current.d4Charges,
        violationsThisSession: values.violationsThisSession ?? current.violationsThisSession
      });
    },
    async resetSessionCounters() {
      if ( !ensureSupportedSystem() ) return null;
      return resetSessionCounters(getPlayerCharacters());
    },
    openDashboard() {
      return ensureSupportedSystem() ? openDashboard() : null;
    },
    async openIncident(actorOrId) {
      if ( !ensureSupportedSystem() ) return null;
      if ( !requireGm() ) return null;
      return addViolation(requiredActor(actorOrId));
    },
    openHistory(actorOrId) {
      return HistoryDialog.open(requiredActor(actorOrId));
    },
    async resolveD100(actorOrId, incidentId) {
      if ( !ensureSupportedSystem() ) return null;
      return requestIncidentD100(requiredActor(actorOrId), incidentId);
    }
  });
}

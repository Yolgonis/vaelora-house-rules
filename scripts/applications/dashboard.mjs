import { TEMPLATE_PATHS } from "../constants.mjs";
import {
  addViolation,
  resetActorPenalties,
  resetSessionCounters,
  setManualPenaltyState
} from "../incident-manager.mjs";
import { logger } from "../logger.mjs";
import { getActorOwners, requireGm } from "../permissions.mjs";
import { D100_TABLE } from "../rule-engine.mjs";
import { getPenaltyState, getPlayerCharacters } from "../state-manager.mjs";
import { confirmDialog, promptPenaltyEdit } from "./incident-dialog.mjs";
import { HistoryDialog } from "./history-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PenaltyDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sabkc-dashboard",
    classes: ["sabkc", "sabkc-dashboard"],
    window: {
      title: "SABKC.Dashboard.Title",
      icon: "fa-solid fa-scale-balanced",
      resizable: true
    },
    position: { width: 1040, height: 720 },
    actions: {
      showManagement: PenaltyDashboard.onShowManagement,
      showRules: PenaltyDashboard.onShowRules,
      addViolation: PenaltyDashboard.onAddViolation,
      editState: PenaltyDashboard.onEditState,
      openHistory: PenaltyDashboard.onOpenHistory,
      resetActor: PenaltyDashboard.onResetActor,
      newSession: PenaltyDashboard.onNewSession
    }
  };

  static PARTS = {
    main: { template: TEMPLATE_PATHS.DASHBOARD }
  };

  activeTab = "management";

  _canRender(options) {
    if ( !requireGm() ) return false;
    if ( (game.system.id !== "dnd5e") || (Number.parseInt(String(game.system.version).split(".")[0], 10) !== 5) ) {
      ui.notifications.warn(game.system.id === "dnd5e"
        ? "SABKC.Errors.WrongDndVersion" : "SABKC.Errors.WrongSystem", { localize: true });
      return false;
    }
    return super._canRender(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actors = getPlayerCharacters().map(actor => {
      const state = getPenaltyState(actor);
      const pending = state.pendingIncident
        ? state.incidentHistory.find(incident => incident.id === state.pendingIncident) : null;
      return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        owner: getActorOwners(actor).join(", ") || game.i18n.localize("SABKC.Common.NoOwner"),
        state,
        hasPenalty: state.disadvantageCharges > 0,
        pendingLabel: pending
          ? (pending.roleResult || game.i18n.localize("SABKC.Dashboard.PendingIncident"))
          : game.i18n.localize("SABKC.Common.None")
      };
    }).sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
    return {
      ...context,
      isManagement: this.activeTab === "management",
      isRules: this.activeTab === "rules",
      actors,
      empty: actors.length === 0,
      d100Rows: D100_TABLE.map(row => ({ ...row, roleResult: game.i18n.localize(row.roleResult) }))
    };
  }

  actorFromTarget(target) {
    return game.actors.get(target.dataset.actorId) ?? null;
  }

  async runAction(operation) {
    try {
      await operation();
      await this.render();
    } catch ( error ) {
      logger.error("dashboard action failed", error);
      ui.notifications.error(error?.message ?? game.i18n.localize("SABKC.Errors.Unexpected"));
    }
  }

  static async onShowManagement() {
    this.activeTab = "management";
    await this.render();
  }

  static async onShowRules() {
    this.activeTab = "rules";
    await this.render();
  }

  static async onAddViolation(event, target) {
    const actor = this.actorFromTarget(target);
    if ( !actor ) return ui.notifications.error("SABKC.Errors.InvalidActor", { localize: true });
    await this.runAction(() => addViolation(actor));
  }

  static async onEditState(event, target) {
    const actor = this.actorFromTarget(target);
    if ( !actor ) return;
    const values = await promptPenaltyEdit(actor, getPenaltyState(actor));
    if ( values ) await this.runAction(() => setManualPenaltyState(actor, values));
  }

  static async onOpenHistory(event, target) {
    const actor = this.actorFromTarget(target);
    if ( actor ) HistoryDialog.open(actor);
  }

  static async onResetActor(event, target) {
    const actor = this.actorFromTarget(target);
    if ( !actor ) return;
    const confirmed = await confirmDialog(
      "SABKC.Dashboard.ResetTitle",
      `<p>${game.i18n.format("SABKC.Dashboard.ResetConfirm", { actor: actor.name })}</p>`
    );
    if ( confirmed ) await this.runAction(() => resetActorPenalties(actor));
  }

  static async onNewSession() {
    const confirmed = await confirmDialog(
      "SABKC.Dashboard.NewSession",
      `<p>${game.i18n.localize("SABKC.Dashboard.NewSessionConfirm")}</p>`
    );
    if ( confirmed ) await this.runAction(() => resetSessionCounters(getPlayerCharacters()));
  }
}

export function openDashboard() {
  if ( !requireGm() ) return null;
  const existing = foundry.applications.instances.get("sabkc-dashboard");
  if ( existing ) {
    existing.bringToFront();
    return existing;
  }
  const app = new PenaltyDashboard();
  app.render({ force: true });
  return app;
}

export function rerenderDashboard() {
  const app = foundry.applications.instances.get("sabkc-dashboard");
  if ( app?.rendered ) app.render();
}

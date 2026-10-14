import {
  deleteIncident,
  editIncident,
  markIncidentResolved,
  requestIncidentD100
} from "../incident-manager.mjs";
import { logger } from "../logger.mjs";
import { canViewActor } from "../permissions.mjs";
import { getPenaltyState } from "../state-manager.mjs";
import { TEMPLATE_PATHS } from "../constants.mjs";
import { confirmDialog, IncidentDialog } from "./incident-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HistoryDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sabkc-history-{id}",
    classes: ["sabkc", "sabkc-history"],
    window: {
      title: "SABKC.History.Title",
      icon: "fa-solid fa-clock-rotate-left",
      resizable: true
    },
    position: { width: 720, height: 620 },
    actions: {
      editIncident: HistoryDialog.onEditIncident,
      requestD100: HistoryDialog.onRequestD100,
      markResolved: HistoryDialog.onMarkResolved,
      deleteIncident: HistoryDialog.onDeleteIncident
    }
  };

  static PARTS = {
    main: { template: TEMPLATE_PATHS.HISTORY }
  };

  constructor(actor, options={}) {
    super({ ...options, id: `sabkc-history-${actor.id}` });
    this.actor = actor;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getPenaltyState(this.actor);
    const formatter = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "short", timeStyle: "short" });
    return {
      ...context,
      actorName: this.actor.name,
      canManage: game.user.isGM,
      empty: state.incidentHistory.length === 0,
      incidents: state.incidentHistory.map(incident => ({
        ...incident,
        createdAtLabel: formatter.format(incident.createdAt),
        resolvedAtLabel: incident.resolvedAt ? formatter.format(incident.resolvedAt) : "",
        statusLabel: game.i18n.localize(incident.resolved
          ? "SABKC.History.Resolved" : incident.d100Resolved
            ? "SABKC.History.ActiveResult" : "SABKC.History.Pending"),
        statusClass: incident.resolved ? "resolved" : incident.d100Resolved ? "active" : "pending",
        diceText: incident.automatic100
          ? game.i18n.localize("SABKC.Chat.Automatic100")
          : incident.diceResults.join(", "),
        canRequestD100: !game.user.isGM && this.actor.isOwner
          && !incident.d100Resolved && !incident.resolved,
        canMarkResolved: !incident.resolved
      }))
    };
  }

  _canRender(options) {
    if ( !canViewActor(this.actor) ) {
      ui.notifications.error("SABKC.Errors.ActorPermission", { localize: true });
      return false;
    }
    return super._canRender(options);
  }

  async runAction(operation) {
    try {
      await operation();
      await this.render();
    } catch ( error ) {
      logger.error("history action failed", error);
      ui.notifications.error(error?.message ?? game.i18n.localize("SABKC.Errors.Unexpected"));
    }
  }

  static async onEditIncident(event, target) {
    const id = target.dataset.incidentId;
    const incident = getPenaltyState(this.actor).incidentHistory.find(entry => entry.id === id);
    if ( !incident ) return ui.notifications.error("SABKC.Errors.IncidentMissing", { localize: true });
    const data = await IncidentDialog.prompt(this.actor, incident);
    if ( data ) await this.runAction(() => editIncident(this.actor, id, data));
  }

  static async onRequestD100(event, target) {
    await this.runAction(() => requestIncidentD100(this.actor, target.dataset.incidentId));
  }

  static async onMarkResolved(event, target) {
    await this.runAction(() => markIncidentResolved(this.actor, target.dataset.incidentId));
  }

  static async onDeleteIncident(event, target) {
    const confirmed = await confirmDialog(
      "SABKC.History.DeleteTitle",
      `<p>${game.i18n.localize("SABKC.History.DeleteConfirm")}</p>`
    );
    if ( confirmed ) await this.runAction(() => deleteIncident(this.actor, target.dataset.incidentId));
  }

  static open(actor) {
    const existing = foundry.applications.instances.get(`sabkc-history-${actor.id}`);
    if ( existing ) {
      existing.bringToFront();
      return existing;
    }
    const app = new HistoryDialog(actor);
    app.render({ force: true });
    return app;
  }
}

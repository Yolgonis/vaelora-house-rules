import { INTERPRETATION_HELP_KEY, TEMPLATE_PATHS } from "../constants.mjs";
import { getActorOwners } from "../permissions.mjs";

function formValue(form, name) {
  return String(form.elements.namedItem(name)?.value ?? "").trim();
}

export class IncidentDialog {
  static async prompt(actor, incident=null) {
    const isEdit = Boolean(incident);
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATHS.INCIDENT_DIALOG, {
      actorName: actor.name,
      owner: getActorOwners(actor).join(", ") || game.i18n.localize("SABKC.Common.NoOwner"),
      statement: incident?.statement ?? "",
      target: incident?.target ?? "",
      scene: incident?.scene ?? canvas?.scene?.name ?? "",
      roleInterpretation: incident?.roleInterpretation || game.i18n.localize(INTERPRETATION_HELP_KEY),
      timestamp: new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "medium", timeStyle: "short" })
        .format(incident?.createdAt ?? Date.now()),
      isEdit
    });
    return foundry.applications.api.DialogV2.prompt({
      window: {
        title: isEdit ? "SABKC.Incident.EditTitle" : "SABKC.Incident.CreateTitle",
        icon: "fa-solid fa-comment-slash"
      },
      position: { width: 560 },
      content,
      rejectClose: false,
      ok: {
        label: isEdit ? "SABKC.Common.Save" : "SABKC.Incident.AddViolation",
        icon: "fa-solid fa-check",
        callback: (event, button) => ({
          statement: formValue(button.form, "statement"),
          target: formValue(button.form, "target"),
          scene: formValue(button.form, "scene"),
          roleInterpretation: formValue(button.form, "roleInterpretation")
        })
      }
    });
  }
}

export async function promptPenaltyEdit(actor, state) {
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATHS.EDIT_STATE_DIALOG, {
    actorName: actor.name,
    disadvantageCharges: state.disadvantageCharges,
    d4Charges: state.d4Charges,
    violationsThisSession: state.violationsThisSession
  });
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "SABKC.EditState.Title", icon: "fa-solid fa-pen-to-square" },
    position: { width: 430 },
    content,
    rejectClose: false,
    ok: {
      label: "SABKC.Common.Save",
      icon: "fa-solid fa-floppy-disk",
      callback: (event, button) => ({
        disadvantageCharges: button.form.elements.namedItem("disadvantageCharges")?.valueAsNumber,
        d4Charges: button.form.elements.namedItem("d4Charges")?.valueAsNumber,
        violationsThisSession: button.form.elements.namedItem("violationsThisSession")?.valueAsNumber
      })
    }
  });
}

export async function confirmDialog(title, content) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title, icon: "fa-solid fa-triangle-exclamation" },
    content,
    modal: true,
    rejectClose: false
  });
}

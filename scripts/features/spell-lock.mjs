// Mühürlü Boğaz Kelepçesi: while a flagged collar is equipped, the wearer can't cast spells or use
// magic-required activities, loses every attunement and ongoing concentration; players can't remove it.
import { MODULE_ID, t, isPrimaryGM } from "../constants.mjs";

export const ID = "spellLock";
const FLAG_KEY = "spellLock";
const SETTING_BLOCK_MAGIC_ITEMS = "spellLock.blockMagicItems";

function isLockingCollar(item) {
  return item?.getFlag?.(MODULE_ID, FLAG_KEY) === true;
}

function isEquipped(item) {
  return item?.system?.equipped === true;
}

function findEquippedCollar(actor) {
  return actor?.items?.find(item => isLockingCollar(item) && isEquipped(item)) ?? null;
}

function isMagicItem(item) {
  return item?.system?.properties?.has?.("mgc") === true;
}

function activityIsBlocked(activity) {
  const item = activity?.item;
  if (!item || isLockingCollar(item)) return false;

  if (item.type === "spell"
    || activity.isSpell === true
    || activity.type === "cast"
    || activity.visibility?.requireMagic === true) return true;

  return game.settings.get(MODULE_ID, SETTING_BLOCK_MAGIC_ITEMS) && isMagicItem(item);
}

// Kelepçe takılınca: attunement'lar kalkar, devam eden concentration biter.
async function applyCollarEffects(actor) {
  if (!actor || !isPrimaryGM()) return;

  const updates = actor.items
    .filter(item => !isLockingCollar(item) && item.system?.attuned === true)
    .map(item => ({ _id: item.id, "system.attuned": false }));

  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (actor.concentration?.effects?.size) await actor.endConcentration();
}

function notifyBlocked(actor, collar) {
  ui.notifications.warn(t("SpellLock.Blocked", { actor: actor.name, collar: collar.name }));
}

export function register() {
  game.settings.register(MODULE_ID, SETTING_BLOCK_MAGIC_ITEMS, {
    name: `${MODULE_ID}.SpellLock.Settings.BlockMagicItems.Name`,
    hint: `${MODULE_ID}.SpellLock.Settings.BlockMagicItems.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  Hooks.on("dnd5e.preUseActivity", activity => {
    const actor = activity?.item?.actor;
    const collar = findEquippedCollar(actor);
    if (!collar || !activityIsBlocked(activity)) return true;

    notifyBlocked(actor, collar);
    return false;
  });

  Hooks.on("dnd5e.preUseLinkedSpell", activity => {
    const actor = activity?.item?.actor;
    const collar = findEquippedCollar(actor);
    if (!collar) return true;

    notifyBlocked(actor, collar);
    return false;
  });

  Hooks.on("preUpdateItem", (item, changes, options, userId) => {
    if (!item.actor) return true;

    const collar = findEquippedCollar(item.actor);
    const attemptsAttunement = foundry.utils.getProperty(changes, "system.attuned") === true;
    if (collar && !isLockingCollar(item) && attemptsAttunement) {
      if (game.user.id === userId) {
        ui.notifications.warn(t("SpellLock.NoAttune", { actor: item.actor.name, collar: collar.name }));
      }
      return false;
    }

    if (!isLockingCollar(item) || !isEquipped(item)) return true;

    const requestingUser = game.users.get(userId);
    if (requestingUser?.isGM) return true;

    if (game.user.id === userId) {
      ui.notifications.warn(t("SpellLock.LockedModify", { collar: item.name }));
    }
    return false;
  });

  Hooks.on("createItem", async item => {
    if (item.actor && isLockingCollar(item) && isEquipped(item)) {
      await applyCollarEffects(item.actor);
    }
  });

  Hooks.on("updateItem", async (item, changes) => {
    if (!item.actor || !isPrimaryGM()) return;

    const collar = findEquippedCollar(item.actor);
    if (!collar) return;

    if (isLockingCollar(item)) {
      const becameActive = foundry.utils.hasProperty(changes, "system.equipped")
        || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`);
      if (becameActive) await applyCollarEffects(item.actor);
    } else if (item.system?.attuned === true) {
      await item.update({ "system.attuned": false });
    }
  });

  Hooks.on("preDeleteItem", (item, options, userId) => {
    if (!item.actor || !isLockingCollar(item)) return true;

    const requestingUser = game.users.get(userId);
    if (requestingUser?.isGM) return true;

    if (game.user.id === userId) {
      ui.notifications.warn(t("SpellLock.LockedDelete", { collar: item.name }));
    }
    return false;
  });

  // GM, ekipman eşyalarının Details sekmesinden bir eşyayı kelepçe olarak işaretler.
  Hooks.on("renderItemSheet5e", (sheet, html) => {
    const item = sheet.document;
    if (!game.user.isGM || item?.type !== "equipment") return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    const details = root?.querySelector('[data-application-part="details"]');
    if (!details || details.querySelector(`.${MODULE_ID}-spell-lock`)) return;

    const fieldset = document.createElement("fieldset");
    fieldset.classList.add(`${MODULE_ID}-spell-lock`);
    fieldset.innerHTML = `
      <legend>${t("SpellLock.Sheet.Legend")}</legend>
      <div class="form-group">
        <label>${t("SpellLock.Sheet.Label")}</label>
        <div class="form-fields">
          <input type="checkbox" ${isLockingCollar(item) ? "checked" : ""}>
        </div>
        <p class="hint">${t("SpellLock.Sheet.Hint")}</p>
      </div>
    `;
    fieldset.querySelector("input").addEventListener("change", async event => {
      event.stopPropagation();
      await item.setFlag(MODULE_ID, FLAG_KEY, event.currentTarget.checked);
    });
    details.prepend(fieldset);
  });
}

/** Called on ready after legacy data has been migrated. */
export async function ready() {
  if (!isPrimaryGM()) return;

  for (const actor of game.actors) {
    if (findEquippedCollar(actor)) await applyCollarEffects(actor);
  }
}

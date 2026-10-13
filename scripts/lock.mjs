const MODULE_ID = "muhurlu-bogaz-kelepcesi";
const FLAG_KEY = "spellLock";

function isLockingCollar(item) {
  return item?.getFlag?.(MODULE_ID, FLAG_KEY) === true;
}

function isEquipped(item) {
  return item?.system?.equipped === true;
}

function findEquippedCollar(actor) {
  return actor?.items?.find(item => isLockingCollar(item) && isEquipped(item)) ?? null;
}

function activityIsBlocked(activity) {
  const item = activity?.item;
  if (!item || isLockingCollar(item)) return false;

  return item.type === "spell"
    || activity.isSpell === true
    || activity.type === "cast"
    || activity.visibility?.requireMagic === true;
}

function isPrimaryGM() {
  return game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
}

async function clearAttunements(actor) {
  if (!actor || !isPrimaryGM()) return;

  const updates = actor.items
    .filter(item => !isLockingCollar(item) && item.system?.attuned === true)
    .map(item => ({ _id: item.id, "system.attuned": false }));

  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

function notifyBlocked(actor, collar) {
  ui.notifications.warn(
    `${actor.name} cannot cast spells or use magic-required activities while wearing ${collar.name}.`
  );
}

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
      ui.notifications.warn(`${item.actor.name} cannot attune to an item while wearing ${collar.name}.`);
    }
    return false;
  }

  if (!isLockingCollar(item) || !isEquipped(item)) return true;

  const requestingUser = game.users.get(userId);
  if (requestingUser?.isGM) return true;

  if (game.user.id === userId) {
    ui.notifications.warn(`${item.name} is locked; only the Game Master can remove or modify it.`);
  }
  return false;
});

Hooks.on("createItem", async item => {
  if (item.actor && isLockingCollar(item) && isEquipped(item)) {
    await clearAttunements(item.actor);
  }
});

Hooks.on("updateItem", async item => {
  if (!item.actor || !isPrimaryGM()) return;

  const collar = findEquippedCollar(item.actor);
  if (!collar) return;

  if (isLockingCollar(item)) await clearAttunements(item.actor);
  else if (item.system?.attuned === true) await item.update({ "system.attuned": false });
});

Hooks.on("preDeleteItem", (item, options, userId) => {
  if (!item.actor || !isLockingCollar(item)) return true;

  const requestingUser = game.users.get(userId);
  if (requestingUser?.isGM) return true;

  if (game.user.id === userId) {
    ui.notifications.warn(`${item.name} is locked; only the Game Master can delete it.`);
  }
  return false;
});

Hooks.once("ready", async () => {
  if (!isPrimaryGM()) return;

  for (const actor of game.actors) {
    if (findEquippedCollar(actor)) await clearAttunements(actor);
  }
});

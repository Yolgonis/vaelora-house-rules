// Moves data saved by the three modules this one replaces into this module's flag scope.
// Runs on every load for the primary GM; documents are only touched while old flags remain,
// so later loads do nothing.
import { MODULE_ID, isPrimaryGM } from "./constants.mjs";

/** Legacy module id -> flag keys that moved here unchanged. */
const LEGACY_FLAGS = {
  "muhurlu-bogaz-kelepcesi": ["spellLock"],
  "enhanced-recovery": ["config", "lastRecovery", "suppressedDamageTypes"]
};

function legacyUpdate(doc) {
  const flags = doc._source?.flags ?? {};
  const update = {};
  for (const [legacyId, keys] of Object.entries(LEGACY_FLAGS)) {
    const legacy = flags[legacyId];
    if (!legacy || typeof legacy !== "object") continue;
    for (const key of keys) {
      // Never overwrite data already saved by this module.
      if (key in legacy && flags[MODULE_ID]?.[key] === undefined) update[`flags.${MODULE_ID}.${key}`] = legacy[key];
    }
    update[`flags.-=${legacyId}`] = null;
  }
  return Object.keys(update).length ? update : null;
}

export async function migrateLegacyData() {
  if (!isPrimaryGM()) return 0;
  const documents = [...game.items, ...game.actors, ...game.actors.contents.flatMap(actor => actor.items.contents)];
  let migrated = 0;
  for (const doc of documents) {
    const update = legacyUpdate(doc);
    if (!update) continue;
    try {
      await doc.update(update);
      migrated += 1;
    } catch (error) {
      console.error(`Vaelora House Rules | Could not migrate ${doc.uuid}.`, error);
    }
  }
  if (migrated) console.log(`Vaelora House Rules | Migrated data from the old modules on ${migrated} document(s).`);
  return migrated;
}

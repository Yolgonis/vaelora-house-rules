// Vaelora Ev Kuralları: the table's house rules in one module. Each rule can be switched off in
// the module settings (takes effect after a reload).
import { MODULE_ID } from "./constants.mjs";
import { migrateLegacyData } from "./migration.mjs";
import * as electrum from "./features/electrum.mjs";
import * as spellLock from "./features/spell-lock.mjs";
import * as recovery from "./features/recovery.mjs";
import * as consequences from "./features/consequences/main.mjs";

const FEATURES = [
  { module: electrum, label: "Electrum" },
  { module: spellLock, label: "SpellLock" },
  { module: recovery, label: "Recovery" },
  { module: consequences, label: "Consequences" }
];

const enabledKey = feature => `feature.${feature.module.ID}`;
const enabled = [];

Hooks.once("init", () => {
  for (const feature of FEATURES) {
    game.settings.register(MODULE_ID, enabledKey(feature), {
      name: `${MODULE_ID}.Feature.${feature.label}.Name`,
      hint: `${MODULE_ID}.Feature.${feature.label}.Hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true
    });
  }
  for (const feature of FEATURES) {
    if (!game.settings.get(MODULE_ID, enabledKey(feature))) continue;
    feature.module.register();
    enabled.push(feature.module);
  }
});

Hooks.once("ready", async () => {
  await migrateLegacyData();
  for (const feature of enabled) await feature.ready?.();
});

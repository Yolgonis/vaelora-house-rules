import assert from "node:assert/strict";
import test from "node:test";

/** Minimal Foundry globals; `disabled` lists feature ids whose toggle setting is off. */
function stubFoundry(disabled = []) {
  const once = new Map();
  const on = new Map();
  const settings = new Map();
  const moduleRecord = {};
  globalThis.Hooks = {
    once: (name, callback) => once.set(name, callback),
    on: (name, callback) => on.set(name, [...(on.get(name) ?? []), callback])
  };
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {} },
      instances: new Map()
    }
  };
  globalThis.CONFIG = { DND5E: { currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} } } };
  globalThis.game = {
    system: { id: "dnd5e", version: "5.3.3" },
    user: { id: "test", isGM: true },
    modules: { get: () => moduleRecord },
    settings: {
      register: (namespace, key, data) => settings.set(`${namespace}.${key}`, data),
      registerMenu: () => undefined,
      get: (namespace, key) => key.startsWith("feature.") ? !disabled.includes(key.slice(8)) : false
    }
  };
  delete globalThis.EnhancedRecovery;
  return { once, on, settings, moduleRecord };
}

test("every house rule registers a toggle and runs when enabled", async () => {
  const { once, on, settings, moduleRecord } = stubFoundry();
  await import(`../scripts/main.mjs?all=${Date.now()}`);
  await once.get("init")();

  for (const id of ["electrum", "spellLock", "recovery", "consequences"]) {
    const toggle = settings.get(`vaelora-house-rules.feature.${id}`);
    assert.ok(toggle, `toggle for ${id}`);
    assert.equal(toggle.default, true);
    assert.equal(toggle.requiresReload, true);
  }
  assert.equal("ep" in CONFIG.DND5E.currencies, false, "Electrum removed");
  assert.ok(settings.has("vaelora-house-rules.spellLock.blockMagicItems"), "collar setting");
  assert.ok(on.has("dnd5e.preUseActivity"), "collar hooks");
  assert.equal(typeof globalThis.EnhancedRecovery?.list, "function", "recovery macro API");
  assert.ok(on.has("combatTurnChange"), "recovery hooks");
  assert.ok(settings.has("vaelora-house-rules.historyLimit"), "consequences settings");
  assert.equal(typeof moduleRecord.api?.openDashboard, "function", "consequences API");
  assert.ok(once.has("ready"));
});

test("a disabled house rule is not registered", async () => {
  const { once, on, settings } = stubFoundry(["electrum", "recovery"]);
  await import(`../scripts/main.mjs?some=${Date.now()}`);
  await once.get("init")();

  assert.ok("ep" in CONFIG.DND5E.currencies, "Electrum kept");
  assert.equal(globalThis.EnhancedRecovery, undefined);
  assert.equal(on.has("combatTurnChange"), false);
  assert.ok(settings.has("vaelora-house-rules.feature.recovery"), "toggle still registered");
  assert.ok(on.has("dnd5e.preUseActivity"), "collar still active");
});

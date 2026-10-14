import assert from "node:assert/strict";
import test from "node:test";

test("module imports, registers settings, and safely disables itself on another system", async () => {
  const once = new Map();
  const on = new Map();
  const settings = [];
  const menus = [];
  const notifications = [];
  const moduleRecord = {};

  globalThis.Hooks = {
    once: (name, callback) => once.set(name, callback),
    on: (name, callback) => on.set(name, callback)
  };
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {}
      },
      instances: new Map()
    }
  };
  globalThis.game = {
    system: { id: "not-dnd5e", version: "1.0.0" },
    user: { id: "test", isGM: true },
    release: { version: "13.350" },
    modules: { get: () => moduleRecord },
    settings: {
      register: (namespace, key, data) => settings.push({ namespace, key, data }),
      registerMenu: (namespace, key, data) => menus.push({ namespace, key, data }),
      get: () => false
    }
  };
  globalThis.ui = { notifications: { warn: (...args) => notifications.push(args), error: () => undefined } };

  const feature = await import(`../../scripts/features/consequences/main.mjs?smoke=${Date.now()}`);
  assert.equal(typeof feature.register, "function");
  assert.equal(typeof feature.ready, "function");
  await feature.register();
  assert.equal(settings.length, 4);
  assert.equal(menus.length, 1);
  assert.equal(typeof moduleRecord.api.openDashboard, "function");
  assert.equal("armNextRoll" in moduleRecord.api, false);
  await feature.ready();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], "SABKC.Errors.WrongSystem");
});

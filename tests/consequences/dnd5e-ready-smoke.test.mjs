import assert from "node:assert/strict";
import test from "node:test";

test("supported D&D5e 5.x ready lifecycle registers roll hooks, socket, templates, and wrappers", async () => {
  const once = new Map();
  const on = new Map();
  const socketChannels = [];
  const loadedTemplates = [];
  const moduleRecord = {};
  let liveActor = null;

  class MockActor {
    constructor() {
      this.id = "actor-1";
      this.uuid = "Actor.actor-1";
      this.type = "character";
      this.documentName = "Actor";
      this.isOwner = true;
      this.flag = {
        schemaVersion: 2,
        revision: 0,
        disadvantageCharges: 3,
        d4Charges: 1,
        violationsThisSession: 0,
        pendingIncident: null,
        incidentHistory: [],
        auditLog: []
      };
    }
    getFlag() { return this.flag; }
    testUserPermission() { return true; }
    async update(data) {
      this.flag = data["flags.vaelora-house-rules.state"];
      return this;
    }
    async rollSkill(config={}) {
      const process = {
        ...config,
        hookNames: ["skill", "abilityCheck", "d20Test", ""],
        rolls: [{ parts: ["@mod"], data: { mod: 5 }, options: { advantage: true } }],
        subject: this
      };
      for ( const callback of on.get("dnd5e.preRoll") ?? [] ) callback(process, {}, {});
      const penaltyAdded = process.rolls[0].parts.includes("@sabkcPenaltyD4");
      const d20 = {
        mode: null,
        applyAdvantage(mode) { this.mode = mode; }
      };
      const roll = {
        d20,
        options: { ...process.rolls[0].options },
        total: 11,
        dice: penaltyAdded ? [{
          faces: 4,
          options: { flavor: "SABKC" },
          results: [{ result: 3 }]
        }] : [],
        resetFormula() { this.formulaWasReset = true; }
      };
      for ( const callback of on.get("dnd5e.postRollConfiguration") ?? [] ) callback([roll], process, {}, {});
      return [roll];
    }
    async rollToolCheck() { return []; }
    async rollAbilityCheck() { return []; }
    async rollSavingThrow(config={}) {
      const process = {
        ...config,
        hookNames: [...new Set([...(config.hookNames ?? []), "savingThrow", "d20Test", ""])],
        rolls: [{ parts: ["@save"], data: { save: 2 }, options: {} }],
        subject: this
      };
      for ( const callback of on.get("dnd5e.preRoll") ?? [] ) callback(process, {}, {});
      const penaltyAdded = process.rolls[0].parts.includes("@sabkcPenaltyD4");
      const d20 = { mode: null, applyAdvantage(mode) { this.mode = mode; } };
      const roll = {
        d20,
        options: { ...process.rolls[0].options },
        total: 8,
        dice: penaltyAdded ? [{
          faces: 4,
          options: { flavor: "SABKC" },
          results: [{ result: 2 }]
        }] : [],
        resetFormula() { this.formulaWasReset = true; }
      };
      for ( const callback of on.get("dnd5e.postRollConfiguration") ?? [] ) callback([roll], process, {}, {});
      return [roll];
    }
    getInitiativeRoll() {
      return {
        formula: "1d20 + 2",
        data: {},
        options: {},
        d20: { mode: null, applyAdvantage(mode) { this.mode = mode; } },
        resetFormula() { this.formulaWasReset = true; }
      };
    }
    async rollInitiative() { return 12; }
    async rollInitiativeDialog() { return undefined; }
  }
  class MockAttackActivity {
    constructor(actor) { this.actor = actor; }
    async rollAttack(config={}) {
      const process = {
        ...config,
        hookNames: ["attack", "d20Test", ""],
        rolls: [{ parts: ["@attack"], data: { attack: 7 }, options: { advantage: true } }],
        subject: this
      };
      for ( const callback of on.get("dnd5e.preRoll") ?? [] ) callback(process, {}, {});
      const penaltyAdded = process.rolls[0].parts.includes("@sabkcPenaltyD4");
      const d20 = { mode: null, applyAdvantage(mode) { this.mode = mode; } };
      const roll = {
        d20,
        options: { ...process.rolls[0].options },
        total: 15,
        dice: penaltyAdded ? [{
          faces: 4,
          options: { flavor: "SABKC" },
          results: [{ result: 4 }]
        }] : [],
        resetFormula() { this.formulaWasReset = true; }
      };
      for ( const callback of on.get("dnd5e.postRollConfiguration") ?? [] ) callback([roll], process, {}, {});
      return [roll];
    }
  }
  class MockD20Roll {}
  MockD20Roll.ADV_MODE = { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 };

  globalThis.Hooks = {
    once(name, callback) { once.set(name, callback); },
    on(name, callback) {
      if ( !on.has(name) ) on.set(name, []);
      on.get(name).push(callback);
    }
  };
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {}
      },
      instances: new Map(),
      handlebars: {
        async loadTemplates(paths) { loadedTemplates.push(...paths); }
      }
    },
    utils: {
      flattenObject: value => value,
      getProperty: () => undefined,
      randomID: () => "mock-id"
    }
  };
  globalThis.CONFIG = {
    Actor: { documentClass: MockActor },
    Dice: { D20Roll: MockD20Roll },
    DND5E: { activityTypes: { attack: { documentClass: MockAttackActivity } } }
  };
  const users = Object.assign([{ id: "gm", active: true, isGM: true }], { get: id => users.find(user => user.id === id) });
  const actors = Object.assign([], {
    filter: callback => Array.prototype.filter.call(actors, callback),
    get: id => liveActor?.id === id ? liveActor : null
  });
  const settingValues = {
    historyLimit: 100,
    penaltyConsumptionChat: "disabled",
    debugMode: false
  };
  globalThis.game = {
    system: { id: "dnd5e", version: "5.3.3" },
    release: { version: "13.350" },
    user: users[0],
    users,
    actors,
    i18n: { localize: key => key },
    modules: { get: () => moduleRecord },
    settings: {
      register: () => undefined,
      registerMenu: () => undefined,
      get: (namespace, key) => settingValues[key] ?? false
    },
    socket: { on: channel => socketChannels.push(channel) }
  };
  globalThis.ui = { notifications: { warn: () => undefined, error: () => undefined } };

  const feature = await import(`../../scripts/features/consequences/main.mjs?dnd-smoke=${Date.now()}`);
  await feature.register();
  await feature.ready();

  assert.equal(loadedTemplates.length, 7);
  assert.deepEqual(socketChannels, ["module.vaelora-house-rules"]);
  assert.ok(on.has("dnd5e.preRoll"));
  assert.ok(on.has("dnd5e.postRollConfiguration"));
  assert.ok(on.has("dnd5e.preRollInitiative"));
  assert.equal(on.has("renderApplicationV2"), false);
  assert.ok(MockActor.prototype.rollSkill.__sabkcWrapped);
  assert.ok(MockAttackActivity.prototype.rollAttack.__sabkcWrapped);

  liveActor = new MockActor();
  const [roll] = await liveActor.rollSkill({});
  assert.equal(roll.d20.mode, -1);
  assert.equal(roll.options.advantage, false);
  assert.equal(roll.options.disadvantage, true);
  assert.equal(liveActor.flag.disadvantageCharges, 2);
  assert.equal(liveActor.flag.d4Charges, 0);

  liveActor.flag.disadvantageCharges = 3;
  liveActor.flag.d4Charges = 1;
  const [attackRoll] = await new MockAttackActivity(liveActor).rollAttack({});
  assert.equal(attackRoll.d20.mode, -1);
  assert.equal(attackRoll.dice[0].results[0].result, 4);
  assert.equal(liveActor.flag.disadvantageCharges, 2);
  assert.equal(liveActor.flag.d4Charges, 0);

  liveActor.flag.disadvantageCharges = 5;
  liveActor.flag.d4Charges = 3;
  const [deathSaveRoll] = await liveActor.rollSavingThrow({ hookNames: ["deathSave"] }, {}, {
    data: { flags: { dnd5e: { roll: { type: "death" } } } }
  });
  assert.equal(deathSaveRoll.d20.mode, -1);
  assert.equal(deathSaveRoll.dice[0].results[0].result, 2);
  assert.equal(liveActor.flag.disadvantageCharges, 4);
  assert.equal(liveActor.flag.d4Charges, 2);

  liveActor.flag.disadvantageCharges = 2;
  liveActor.flag.d4Charges = 0;
  await liveActor.rollInitiative({}, {});
  assert.equal(liveActor._cachedInitiativeRoll.d20.mode, -1);
  assert.equal(liveActor.flag.disadvantageCharges, 1);
});

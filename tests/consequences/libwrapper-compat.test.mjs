import assert from "node:assert/strict";
import test from "node:test";

test("libWrapper is preferred and public roll methods are not directly replaced", async () => {
  class MockActor {
    rollSkill() {}
    rollToolCheck() {}
    rollAbilityCheck() {}
    rollSavingThrow() {}
    rollInitiative() {}
    rollInitiativeDialog() {}
  }
  class MockAttackActivity {
    rollAttack() {}
  }

  const originals = {
    rollSkill: MockActor.prototype.rollSkill,
    rollToolCheck: MockActor.prototype.rollToolCheck,
    rollAbilityCheck: MockActor.prototype.rollAbilityCheck,
    rollSavingThrow: MockActor.prototype.rollSavingThrow,
    rollInitiative: MockActor.prototype.rollInitiative,
    rollInitiativeDialog: MockActor.prototype.rollInitiativeDialog,
    rollAttack: MockAttackActivity.prototype.rollAttack
  };
  const registrations = [];
  const unregistrations = [];

  globalThis.Hooks = { on: () => undefined };
  globalThis.CONFIG = {
    Actor: { documentClass: MockActor },
    DND5E: { activityTypes: { attack: { documentClass: MockAttackActivity } } }
  };
  globalThis.libWrapper = {
    register(moduleId, targetPath, wrapper, type) {
      registrations.push({ moduleId, targetPath, wrapper, type });
    },
    unregister(moduleId, targetPath, fail) {
      unregistrations.push({ moduleId, targetPath, fail });
    }
  };

  const { initializeRollManager, restoreRollMethods } = await import(
    `../../scripts/features/consequences/roll-manager.mjs?libwrapper=${Date.now()}`
  );
  initializeRollManager();

  assert.equal(registrations.length, 7);
  assert.ok(registrations.every(entry => entry.moduleId === "vaelora-house-rules"));
  assert.ok(registrations.every(entry => entry.type === "WRAPPER"));
  assert.equal(MockActor.prototype.rollSkill, originals.rollSkill);
  assert.equal(MockActor.prototype.rollToolCheck, originals.rollToolCheck);
  assert.equal(MockActor.prototype.rollAbilityCheck, originals.rollAbilityCheck);
  assert.equal(MockActor.prototype.rollSavingThrow, originals.rollSavingThrow);
  assert.equal(MockActor.prototype.rollInitiative, originals.rollInitiative);
  assert.equal(MockActor.prototype.rollInitiativeDialog, originals.rollInitiativeDialog);
  assert.equal(MockAttackActivity.prototype.rollAttack, originals.rollAttack);

  restoreRollMethods();
  assert.equal(unregistrations.length, 7);
  assert.ok(unregistrations.every(entry => entry.fail === false));
  delete globalThis.libWrapper;
});

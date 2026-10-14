import assert from "node:assert/strict";
import test from "node:test";
import {
  addViolation,
  getIncidentSocketHandlers,
  requestIncidentD100
} from "../scripts/incident-manager.mjs";
import { initializeSocketManager } from "../scripts/socket-manager.mjs";

test("the owning player rolls d100 while the active GM commits the result", async () => {
  const gm = { id: "gm", name: "GM", active: true, isGM: true };
  const player = { id: "player", name: "Player", active: true, isGM: false };
  const users = Object.assign([gm, player], {
    get: id => users.find(user => user.id === id)
  });
  const messages = [];
  let randomId = 0;
  let socketListener;

  const actor = {
    id: "actor-1",
    uuid: "Actor.actor-1",
    name: "Vaelora",
    type: "character",
    documentName: "Actor",
    flag: undefined,
    getFlag() { return this.flag; },
    testUserPermission(user) { return user?.id === player.id; },
    async update(data) {
      this.flag = data["flags.soz-agizdan-bir-kere-cikar.state"];
      return this;
    }
  };

  globalThis.foundry = {
    applications: {
      handlebars: {
        async renderTemplate(path) { return `<article data-template="${path}"></article>`; }
      }
    },
    utils: { randomID: () => `id-${++randomId}` }
  };
  globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor: speakerActor }) => ({ actor: speakerActor.id }),
    getWhisperRecipients: () => [gm],
    async create(data) {
      messages.push({ ...data, createdBy: game.user.id });
      return data;
    }
  };
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.dice = [{ results: [{ result: 43 }] }];
    }
    async evaluate() { return this; }
  };
  globalThis.ui = { notifications: { error: () => undefined } };
  globalThis.game = {
    user: gm,
    users,
    actors: { get: id => id === actor.id ? actor : null },
    i18n: { localize: key => key },
    settings: {
      get(namespace, key) {
        if ( key === "historyLimit" ) return 100;
        if ( key === "violationResultChat" ) return "public";
        return false;
      }
    },
    socket: {
      on(channel, listener) { socketListener = listener; },
      emit(channel, message) {
        queueMicrotask(async () => {
          game.user = message.kind === "request" ? gm : player;
          await socketListener(message);
        });
      }
    }
  };

  initializeSocketManager(getIncidentSocketHandlers());
  const { incident } = await addViolation(actor);
  assert.equal(actor.flag.disadvantageCharges, 3);
  game.user = player;

  const result = await requestIncidentD100(actor, incident.id);

  assert.equal(result.roll.formula, "1d100");
  assert.deepEqual(result.incident.diceResults, [43]);
  assert.equal(result.incident.finalD100, 43);
  assert.equal(actor.flag.disadvantageCharges, 8);
  assert.equal(actor.flag.d4Charges, 2);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].createdBy, player.id);
  assert.equal(messages[1].rolls[0], result.roll);
});

import {
  CHAT_VISIBILITY,
  DEFAULT_HISTORY_LIMIT,
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";

export function registerSettings(DashboardClass) {
  game.settings.register(MODULE_ID, SETTINGS.CONSUMPTION_CHAT, {
    name: "SABKC.Settings.ConsumptionChat.Name",
    hint: "SABKC.Settings.ConsumptionChat.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CHAT_VISIBILITY.PUBLIC]: "SABKC.Settings.Chat.Public",
      [CHAT_VISIBILITY.GM_ONLY]: "SABKC.Settings.Chat.GmOnly",
      [CHAT_VISIBILITY.DISABLED]: "SABKC.Settings.Chat.Disabled"
    },
    default: CHAT_VISIBILITY.PUBLIC
  });

  game.settings.register(MODULE_ID, SETTINGS.VIOLATION_CHAT, {
    name: "SABKC.Settings.ViolationChat.Name",
    hint: "SABKC.Settings.ViolationChat.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CHAT_VISIBILITY.PUBLIC]: "SABKC.Settings.Chat.Public",
      [CHAT_VISIBILITY.GM_ONLY]: "SABKC.Settings.Chat.GmOnly"
    },
    default: CHAT_VISIBILITY.PUBLIC
  });

  game.settings.register(MODULE_ID, SETTINGS.HISTORY_LIMIT, {
    name: "SABKC.Settings.HistoryLimit.Name",
    hint: "SABKC.Settings.HistoryLimit.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 10, max: 500, step: 10 },
    default: DEFAULT_HISTORY_LIMIT
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: "SABKC.Settings.Debug.Name",
    hint: "SABKC.Settings.Debug.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.registerMenu(MODULE_ID, "dashboard", {
    name: "SABKC.Settings.Dashboard.Name",
    label: "SABKC.Settings.Dashboard.Label",
    hint: "SABKC.Settings.Dashboard.Hint",
    icon: "fa-solid fa-scale-balanced",
    type: DashboardClass,
    restricted: true
  });
}

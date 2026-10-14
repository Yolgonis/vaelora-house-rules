export const MODULE_ID = "vaelora-house-rules";

/** Localize a key under this module's namespace, formatting {placeholders} when data is given. */
export const t = (key, data) => data
  ? game.i18n.format(`${MODULE_ID}.${key}`, data)
  : game.i18n.localize(`${MODULE_ID}.${key}`);

/** True on the one GM client that should perform world updates. */
export function isPrimaryGM() {
  return game.user.isActiveGM || (game.user.isGM && !game.users.activeGM);
}

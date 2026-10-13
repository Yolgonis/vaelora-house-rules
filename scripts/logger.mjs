import { LOG_PREFIX, MODULE_ID, SETTINGS } from "./constants.mjs";

function debugEnabled() {
  try {
    return Boolean(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.DEBUG));
  } catch {
    return false;
  }
}

export const logger = Object.freeze({
  debug(message, data) {
    if ( !debugEnabled() ) return;
    if ( data === undefined ) console.debug(`${LOG_PREFIX} ${message}`);
    else console.debug(`${LOG_PREFIX} ${message}`, data);
  },
  info(message, data) {
    if ( data === undefined ) console.info(`${LOG_PREFIX} ${message}`);
    else console.info(`${LOG_PREFIX} ${message}`, data);
  },
  warn(message, data) {
    if ( data === undefined ) console.warn(`${LOG_PREFIX} ${message}`);
    else console.warn(`${LOG_PREFIX} ${message}`, data);
  },
  error(message, error) {
    console.error(`${LOG_PREFIX} ${message}`, error ?? "");
  }
});

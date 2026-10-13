import { SOCKET_CHANNEL, SOCKET_TIMEOUT_MS } from "./constants.mjs";
import { logger } from "./logger.mjs";

const pendingRequests = new Map();
let actionHandlers = {};
let initialized = false;

export function getActiveGm() {
  return game.users
    .filter(user => user.active && user.isGM)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

async function onSocketMessage(message) {
  if ( !message || (typeof message !== "object") ) return;
  if ( (message.kind === "response") && (message.to === game.user.id) ) {
    const pending = pendingRequests.get(message.requestId);
    if ( !pending ) return;
    pendingRequests.delete(message.requestId);
    clearTimeout(pending.timeoutId);
    if ( message.ok ) pending.resolve(message.result);
    else pending.reject(new Error(message.error || "Socket request failed."));
    return;
  }
  if ( (message.kind !== "request") || !game.user.isGM || (message.to !== game.user.id) ) return;
  const handler = actionHandlers[message.action];
  if ( typeof handler !== "function" ) return;
  try {
    const result = await handler(message.payload ?? {}, { requesterId: message.from });
    game.socket.emit(SOCKET_CHANNEL, {
      kind: "response",
      requestId: message.requestId,
      to: message.from,
      from: game.user.id,
      ok: true,
      result
    });
  } catch ( error ) {
    logger.error(`socket action failed: ${message.action}`, error);
    game.socket.emit(SOCKET_CHANNEL, {
      kind: "response",
      requestId: message.requestId,
      to: message.from,
      from: game.user.id,
      ok: false,
      error: error?.message ?? String(error)
    });
  }
}

export function initializeSocketManager(handlers) {
  actionHandlers = { ...handlers };
  if ( initialized ) return;
  game.socket.on(SOCKET_CHANNEL, onSocketMessage);
  initialized = true;
  logger.debug("native module socket registered", { channel: SOCKET_CHANNEL });
}

export async function requestActiveGm(action, payload, { timeout=SOCKET_TIMEOUT_MS }={}) {
  const gm = getActiveGm();
  if ( !gm ) throw new Error(game.i18n.localize("SABKC.Errors.NoActiveGm"));
  if ( gm.id === game.user.id ) {
    const handler = actionHandlers[action];
    if ( typeof handler !== "function" ) throw new Error(`Unknown socket action: ${action}`);
    return handler(payload, { requesterId: game.user.id });
  }
  const requestId = foundry.utils.randomID(20);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(game.i18n.localize("SABKC.Errors.SocketTimeout")));
    }, timeout);
    pendingRequests.set(requestId, { resolve, reject, timeoutId });
    game.socket.emit(SOCKET_CHANNEL, {
      kind: "request",
      requestId,
      action,
      payload,
      from: game.user.id,
      to: gm.id
    });
  });
}

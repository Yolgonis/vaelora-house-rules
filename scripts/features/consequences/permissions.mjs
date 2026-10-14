export function requireGm({ notify=true }={}) {
  if ( globalThis.game?.user?.isGM ) return true;
  if ( notify ) globalThis.ui?.notifications?.error("SABKC.Errors.GmOnly", { localize: true });
  return false;
}

export function canViewActor(actor) {
  return Boolean(actor && (globalThis.game?.user?.isGM || actor.isOwner));
}

export function getActorOwners(actor) {
  if ( !actor || !globalThis.game?.users ) return [];
  return game.users
    .filter(user => !user.isGM && actor.testUserPermission(user, "OWNER"))
    .map(user => user.name);
}

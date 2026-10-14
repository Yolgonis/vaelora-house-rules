// Removes Electrum pieces from the D&D 5e currency list.
export const ID = "electrum";

export function register() {
  if (CONFIG.DND5E?.currencies?.ep) {
    delete CONFIG.DND5E.currencies.ep;
    console.log("Vaelora House Rules | Electrum currency removed.");
  }
}

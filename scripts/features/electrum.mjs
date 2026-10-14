(() => {

    Hooks.once("init", () => {
        if (CONFIG.DND5E?.currencies?.ep) {
            delete CONFIG.DND5E.currencies.ep;
            console.log("Remove Electrum | Electrum currency removed.");
        }
    });

})();
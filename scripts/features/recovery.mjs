// Enhanced Recovery: GM-controlled regeneration (start/end of turn healing, suppressed by chosen
// damage types). Configured per actor in a GM-only Recovery tab on the character/NPC sheet.
import { MODULE_ID } from "../constants.mjs";

export const ID = "recovery";
const TAB_ID = "enhanced-recovery";
const ACTIVE_TABS = globalThis.EnhancedRecoveryActiveTabs ??= new Map();

function getActorKey(actor) {
  return actor?.uuid ?? actor?.id ?? actor?.name;
}

function rememberRecoveryTab(actor, active) {
  const key = getActorKey(actor);
  if (!key) return;
  if (active) ACTIVE_TABS.set(key, true);
  else ACTIVE_TABS.delete(key);
}

function shouldRestoreRecoveryTab(actor) {
  const key = getActorKey(actor);
  return key ? ACTIVE_TABS.get(key) === true : false;
}
const FEATURE_NAME = "Enhanced Recovery";

const DAMAGE_TYPES = [
  "radiant", "fire", "acid", "necrotic", "force",
  "psychic", "cold", "lightning", "thunder"
];

const MODES = {
  fixed: "Fixed",
  "cr+con": "CR + CON",
  "level+con": "Level + CON",
  "base+con": "Base + CON",
  "percent-max": "Max HP %",
  "percent-missing": "Missing HP %",
  formula: "Formula"
};

// dnd5e hasarı uygulamadan önce dirençleri hesaplar; sonra uygular. Önizleme
// yalnızca hesaplar, bu yüzden türler yalnızca gerçek uygulamada baskılar.
// Midi-QOL da hasarı Actor#applyDamage ile uyguladığı için aynı yoldan geçer.
const PENDING_DAMAGE_TYPES = new WeakMap();

export function register() {
  for (const hook of [
    "renderActorSheet",
    "renderActorSheet5eCharacter",
    "renderActorSheet5eNPC",
    "renderCharacterActorSheet",
    "renderNPCActorSheet"
  ]) {
    Hooks.on(hook, async (sheet, html) => {
      if (!game.user.isGM) return;
      await injectRecoveryTab(sheet, html);
    });
  }

  // Yalnızca aktif GM işler ve yalnızca tur ileri gittiğinde; geri alma veya
  // birden fazla GM aynı iyileşmeyi tekrar uygulamaz.
  Hooks.on("combatTurnChange", async (combat, previous, current) => {
    if (!game.user.isActiveGM) return;

    const forward = current.round > previous.round
      || (current.round === previous.round && current.turn > previous.turn);
    if (!forward) return;

    const ended = combat.combatants.get(previous.combatantId)?.actor;
    if (ended) await processRecovery(ended, "end");

    const started = combat.combatants.get(current.combatantId)?.actor;
    if (started) await processRecovery(started, "start");
  });

  Hooks.on("dnd5e.calculateDamage", (actor, damages, options) => {
    const types = damages
      .filter(d => d.value > 0 && d.type in CONFIG.DND5E.damageTypes)
      .map(d => normalize(d.type));
    if (types.length) PENDING_DAMAGE_TYPES.set(options, types);
  });

  Hooks.on("dnd5e.applyDamage", async (actor, amount, options) => {
    const types = PENDING_DAMAGE_TYPES.get(options);
    PENDING_DAMAGE_TYPES.delete(options);
    if (!types?.length || amount <= 0 || !actor.isOwner) return;

    const config = getConfig(actor);
    if (!config.enabled) return;

    const matched = types.filter(type => getBlockedTypes(config).includes(type));
    if (matched.length) await suppressRecovery(actor, matched);
  });

  // Makro API'si; eski Enhanced Recovery modülüyle aynı ad.
  globalThis.EnhancedRecovery = RECOVERY_API;
}

async function injectRecoveryTab(sheet, html) {
  const actor = sheet.actor;
  if (!actor || !["character", "npc"].includes(actor.type)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  const tabInfo = findSheetTabs(root);
  if (!tabInfo) return;

  const { nav, group, contentParent } = tabInfo;

  let button = nav.querySelector(`[data-tab="${TAB_ID}"]`);

  if (!button) {
    button = document.createElement("a");
    button.classList.add("item", "enhanced-recovery-tab-button");
    button.dataset.tab = TAB_ID;
    button.dataset.group = group;
    button.title = "Recovery";
    button.innerHTML = `<i class="fas fa-heart-pulse"></i>`;
    nav.appendChild(button);
  }

  let tab = contentParent.querySelector(`:scope > .enhanced-recovery-tab[data-tab="${TAB_ID}"]`);

  if (!tab) {
    tab = document.createElement("section");
    tab.classList.add("tab", "enhanced-recovery-tab");
    tab.dataset.tab = TAB_ID;
    tab.dataset.group = group;
    tab.style.display = "none";
    contentParent.appendChild(tab);
  }

  const activateRecoveryTab = async () => {
    nav.querySelectorAll("[data-tab]").forEach(btn => {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    });

    contentParent.querySelectorAll(":scope > .tab").forEach(otherTab => {
      if (otherTab === tab) return;
      otherTab.classList.remove("active");
      otherTab.style.display = "none";
    });

    button.classList.add("active");
    button.setAttribute("aria-selected", "true");

    tab.classList.add("active");
    tab.style.display = "block";

    rememberRecoveryTab(actor, true);
    await renderRecoveryTab(sheet, actor, tab);
  };

  button.onclick = async event => {
    event.preventDefault();
    event.stopPropagation();
    await activateRecoveryTab();
  };

  nav.querySelectorAll(`[data-tab]:not([data-tab="${TAB_ID}"])`).forEach(otherButton => {
    if (otherButton.dataset.enhancedRecoveryCloseBound === "true") return;
    otherButton.dataset.enhancedRecoveryCloseBound = "true";

    otherButton.addEventListener("click", () => {
      rememberRecoveryTab(actor, false);

      button.classList.remove("active");
      button.setAttribute("aria-selected", "false");
      tab.classList.remove("active");
      tab.style.display = "none";

      setTimeout(() => {
        const activeTabId = otherButton.dataset.tab;
        const activeTab =
          contentParent.querySelector(`:scope > .tab[data-tab="${activeTabId}"]`) ||
          contentParent.querySelector(`.tab[data-tab="${activeTabId}"]`);
        if (activeTab) activeTab.style.display = "";
      }, 0);
    });
  });

  await renderRecoveryTab(sheet, actor, tab);

  if (shouldRestoreRecoveryTab(actor)) {
    setTimeout(() => activateRecoveryTab(), 0);
  }
}

function findSheetTabs(root) {
  const knownTabs = [
    "attributes",
    "inventory",
    "features",
    "spells",
    "effects",
    "biography",
    "description",
    "details",
    "stats",
    "activities"
  ];

  const referenceButton = [...root.querySelectorAll("[data-tab]")].find(el =>
    knownTabs.includes(el.dataset.tab) &&
    (el.matches("a, button") || el.closest("nav, .tabs, .sheet-tabs, .tabs-right, .sheet-navigation"))
  );

  if (!referenceButton) return null;

  const nav = referenceButton.closest("nav, .tabs, .sheet-tabs, .tabs-right, .sheet-navigation");
  if (!nav) return null;

  const group = referenceButton.dataset.group || nav.dataset.group || "primary";
  const refTabId = referenceButton.dataset.tab;

  const referenceTab =
    root.querySelector(`.tab[data-tab="${refTabId}"][data-group="${group}"]`) ||
    root.querySelector(`.tab[data-tab="${refTabId}"]`);

  if (!referenceTab?.parentElement) return null;

  // Critical: use the actual parent of a real sheet tab.
  // This makes Recovery a sibling tab, not content inside Inventory/Features.
  const contentParent = referenceTab.parentElement;

  return { nav, group, contentParent };
}

function getDefaultConfig() {
  return {
    enabled: false,
    amount: 10,
    mode: "fixed",
    blockedBy: ["radiant"],
    customBlockedBy: "",
    minHp: 1,
    worksAtZero: false,
    doubleBelow: "",
    multiplier: 2,
    trigger: "start",
    chatMessage: false,
    createVisibleFeature: false,
    formula: "1d6"
  };
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getConfig(actor) {
  return normalizeConfig(actor.getFlag(MODULE_ID, "config") ?? getDefaultConfig());
}

function normalizeConfig(input = {}) {
  if (typeof input === "number") {
    return {
      ...getDefaultConfig(),
      enabled: true,
      amount: Math.max(0, Math.floor(input)),
      mode: "fixed"
    };
  }

  const defaults = getDefaultConfig();
  const config = { ...defaults, ...(input ?? {}) };

  config.enabled = Boolean(config.enabled);
  config.amount = Math.max(0, Math.floor(Number(config.amount ?? defaults.amount)));

  config.mode = normalize(config.mode || defaults.mode);
  if (!Object.keys(MODES).includes(config.mode)) config.mode = "fixed";

  if (!Array.isArray(config.blockedBy)) config.blockedBy = defaults.blockedBy;
  config.blockedBy = config.blockedBy.map(normalize).filter(Boolean);

  config.customBlockedBy = String(config.customBlockedBy ?? "").trim();

  config.minHp = Math.floor(Number(config.minHp ?? defaults.minHp));
  if (!Number.isFinite(config.minHp)) config.minHp = defaults.minHp;

  config.worksAtZero = Boolean(config.worksAtZero);

  if (config.doubleBelow === null || config.doubleBelow === undefined) config.doubleBelow = "";
  if (config.doubleBelow !== "") {
    const value = Number(config.doubleBelow);
    config.doubleBelow = Number.isFinite(value) && value > 0 ? value : "";
  }

  config.multiplier = Number(config.multiplier ?? defaults.multiplier);
  if (!Number.isFinite(config.multiplier) || config.multiplier < 1) config.multiplier = defaults.multiplier;

  config.trigger = normalize(config.trigger || defaults.trigger);
  if (!["start", "end"].includes(config.trigger)) config.trigger = "start";

  config.chatMessage = Boolean(config.chatMessage);
  config.createVisibleFeature = Boolean(config.createVisibleFeature);
  config.formula = String(config.formula ?? defaults.formula ?? "1d6").trim() || "1d6";

  return config;
}

async function setConfig(actor, config) {
  await actor.setFlag(MODULE_ID, "config", normalizeConfig(config));
}

function getBlockedTypes(config) {
  const custom = String(config.customBlockedBy ?? "")
    .split(",")
    .map(normalize)
    .filter(Boolean);

  return Array.from(new Set([...(config.blockedBy ?? []), ...custom]));
}

function getSuppressedTypes(actor) {
  return (actor.getFlag(MODULE_ID, "suppressedDamageTypes") ?? []).map(normalize);
}

async function suppressRecovery(actor, damageTypes) {
  const current = new Set(getSuppressedTypes(actor));
  for (const type of damageTypes) current.add(normalize(type));
  await actor.setFlag(MODULE_ID, "suppressedDamageTypes", Array.from(current).filter(Boolean));
}

async function clearSuppression(actor) {
  await actor.unsetFlag(MODULE_ID, "suppressedDamageTypes");
}

async function calculateAmount(actor, config) {
  const hp = actor.system?.attributes?.hp;
  const cr = Number(actor.system?.details?.cr ?? 0);
  const level = Number(actor.system?.details?.level ?? 0);
  const con = Number(actor.system?.abilities?.con?.mod ?? 0);
  const base = cr || level || 1;

  let amount = 0;

  switch (config.mode) {
    case "fixed":
      amount = config.amount;
      break;
    case "cr+con":
      amount = (cr || 1) + con;
      break;
    case "level+con":
      amount = (level || 1) + con;
      break;
    case "base+con":
      amount = base + con;
      break;
    case "percent-max":
      amount = Math.floor(Number(hp?.max ?? 0) * (config.amount / 100));
      break;
    case "percent-missing":
      amount = Math.floor((Number(hp?.max ?? 0) - Number(hp?.value ?? 0)) * (config.amount / 100));
      break;
    case "formula": {
      const formula = String(config.formula || "1d6")
        .replaceAll("@cr", String(cr || 0))
        .replaceAll("@level", String(level || 0))
        .replaceAll("@base", String(base))
        .replaceAll("@con", String(con));
      try {
        const roll = await new Roll(formula).evaluate();
        amount = roll.total;
      } catch (err) {
        console.warn(`${MODULE_ID} | Formula roll failed`, err);
        amount = 0;
      }
      break;
    }
  }

  amount = Math.max(1, Math.floor(Number(amount) || 0));

  if (config.doubleBelow !== "") {
    const current = Number(hp?.value ?? 0);
    const max = Number(hp?.max ?? 0);
    if (max > 0 && current <= max * (Number(config.doubleBelow) / 100)) {
      amount = Math.floor(amount * config.multiplier);
    }
  }

  return Math.max(1, amount);
}

async function processRecovery(actor, trigger = "start") {
  const config = getConfig(actor);

  if (!config.enabled) return;
  if (config.trigger !== trigger) return;

  const hp = actor.system?.attributes?.hp;
  if (!hp) return;

  const current = Number(hp.value ?? 0);
  const max = Number(hp.max ?? 0);

  if (!config.worksAtZero && current <= 0) {
    await clearSuppression(actor);
    return;
  }

  if (current < config.minHp || current >= max) {
    await clearSuppression(actor);
    return;
  }

  const blocked = getBlockedTypes(config).some(type => getSuppressedTypes(actor).includes(type));

  if (blocked) {
    await clearSuppression(actor);
    return;
  }

  const amount = await calculateAmount(actor, config);
  const newHp = Math.min(max, current + amount);
  const actual = newHp - current;

  if (actual <= 0) {
    await clearSuppression(actor);
    return;
  }

  await actor.update({ "system.attributes.hp.value": newHp });

  await actor.setFlag(MODULE_ID, "lastRecovery", {
    amount: actual,
    before: current,
    after: newHp,
    round: game.combat?.round ?? null,
    turn: game.combat?.turn ?? null,
    timestamp: Date.now()
  });

  if (config.chatMessage) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<b>${escapeHtml(actor.name)}</b> Enhanced Recovery ile <b>${actual}</b> HP yeniledi.`
    });
  }

  await clearSuppression(actor);
}

function hasVisibleFeature(actor) {
  return actor.items.some(item => normalize(item.name) === normalize(FEATURE_NAME));
}

function buildFeatureDescription(config) {
  const timing = config.trigger === "end" ? "end" : "start";
  const types = getBlockedTypes(config);
  const suppression = types.length
    ? ` This trait doesn't function on the creature's next turn if it takes ${types.join(", ")} damage.`
    : "";
  return `<p>This creature regains hit points at the ${timing} of its turn.${suppression}</p>`;
}

async function ensureVisibleFeature(actor, config) {
  const description = buildFeatureDescription(config);
  const existing = actor.items.find(item => normalize(item.name) === normalize(FEATURE_NAME));
  if (existing) {
    if (existing.system.description?.value !== description) {
      await existing.update({ "system.description.value": description });
    }
    return;
  }

  await actor.createEmbeddedDocuments("Item", [{
    name: FEATURE_NAME,
    type: "feat",
    img: "icons/magic/life/heart-cross-strong-flame-green.webp",
    system: {
      description: {
        value: description
      },
      activation: { type: "", cost: null, condition: "" },
      uses: { spent: 0, max: "", recovery: [] },
      target: { value: null, width: null, units: "", type: "" },
      range: { value: null, long: null, units: "" },
      duration: { value: null, units: "" },
      cover: null,
      crewed: false
    }
  }]);
}

async function removeVisibleFeature(actor) {
  const items = actor.items.filter(item => normalize(item.name) === normalize(FEATURE_NAME));
  if (!items.length) return;
  await actor.deleteEmbeddedDocuments("Item", items.map(item => item.id));
}

async function renderRecoveryTab(sheet, actor, tab) {
  const config = getConfig(actor);
  const suppressed = getSuppressedTypes(actor);
  const lastRecovery = actor.getFlag(MODULE_ID, "lastRecovery") ?? null;
  const lastRecoveryText = lastRecovery
    ? `${lastRecovery.amount} HP (${lastRecovery.before} → ${lastRecovery.after})`
    : "Yok";
  const blockedTypes = config.blockedBy ?? [];

  const modeOptions = Object.entries(MODES).map(([value, label]) => `
    <option value="${value}" ${config.mode === value ? "selected" : ""}>${label}</option>
  `).join("");

  const damageChecks = DAMAGE_TYPES.map(type => `
    <label class="form-check">
      <input type="checkbox" name="blockedBy" value="${type}" ${blockedTypes.includes(type) ? "checked" : ""}>
      <span>${type}</span>
    </label>
  `).join("");

  tab.innerHTML = `
    <div class="enhanced-recovery-content">
      <section class="er-section">
        <header class="er-section-header">
          <h3>Enhanced Recovery</h3>
          <span class="er-status ${config.enabled ? "active" : ""}">${config.enabled ? "Active" : "Inactive"}</span>
        </header>

        <div class="er-summary-row">
          <label class="form-check er-main-toggle">
            <input type="checkbox" name="enabled" ${config.enabled ? "checked" : ""}>
            <span>Bu karaktere Enhanced Recovery ver</span>
          </label>

          <span><strong>Görünür Feature:</strong> ${hasVisibleFeature(actor) ? "Var" : "Yok"}</span>
          <span><strong>Baskılanma:</strong> ${suppressed.length ? suppressed.join(", ") : "Yok"}</span>
          <span><strong>Son Recovery:</strong> ${lastRecoveryText}</span>
        </div>
      </section>

      <section class="er-section">
        <header class="er-section-header"><h3>General</h3></header>

        <div class="er-form-grid">
          <label class="form-group">
            <span>Heal Mode</span>
            <select name="mode">${modeOptions}</select>
          </label>

          <label class="form-group">
            <span>Amount</span>
            <input type="number" name="amount" value="${config.amount}" min="0" step="1">
          </label>

          <label class="form-group">
            <span>Formula</span>
            <input type="text" name="formula" value="${escapeHtml(config.formula)}" placeholder="1d6 + @con">
          </label>

          <label class="form-group">
            <span>Trigger</span>
            <select name="trigger">
              <option value="start" ${config.trigger === "start" ? "selected" : ""}>Start of Turn</option>
              <option value="end" ${config.trigger === "end" ? "selected" : ""}>End of Turn</option>
            </select>
          </label>
        </div>
      </section>

      <section class="er-section">
        <header class="er-section-header"><h3>Conditions</h3></header>

        <div class="er-form-grid">
          <label class="form-group">
            <span>Minimum HP</span>
            <input type="number" name="minHp" value="${config.minHp}" step="1">
          </label>

          <label class="form-group">
            <span>Double Below %</span>
            <input type="number" name="doubleBelow" value="${config.doubleBelow}" placeholder="boş bırak" step="1">
          </label>

          <label class="form-group">
            <span>Multiplier</span>
            <input type="number" name="multiplier" value="${config.multiplier}" min="1" step="0.5">
          </label>

          <label class="form-check">
            <input type="checkbox" name="worksAtZero" ${config.worksAtZero ? "checked" : ""}>
            <span>Works at 0 HP</span>
          </label>
        </div>
      </section>

      <section class="er-section">
        <header class="er-section-header"><h3>Suppression</h3></header>

        <div class="er-check-grid">
          ${damageChecks}
        </div>

        <label class="form-group">
          <span>Custom Damage Types</span>
          <input type="text" name="customBlockedBy" value="${escapeHtml(config.customBlockedBy)}" placeholder="ör: poison, slashing">
        </label>
      </section>

      <section class="er-section">
        <header class="er-section-header"><h3>Visibility & Tools</h3></header>

        <div class="er-form-grid">
          <label class="form-check">
            <input type="checkbox" name="createVisibleFeature" ${config.createVisibleFeature ? "checked" : ""}>
            <span>Create visible Feature</span>
          </label>

          <label class="form-check">
            <input type="checkbox" name="chatMessage" ${config.chatMessage ? "checked" : ""}>
            <span>Show Chat Message</span>
          </label>
        </div>

        <div class="er-actions">
          <button type="button" class="enhanced-recovery-save">
            <i class="fas fa-save"></i> Kaydet
          </button>

          <button type="button" class="enhanced-recovery-test">
            <i class="fas fa-vial"></i> Test
          </button>

          <button type="button" class="enhanced-recovery-clear">
            <i class="fas fa-broom"></i> Baskıyı Temizle
          </button>

          <button type="button" class="enhanced-recovery-remove-visible">
            <i class="fas fa-eye-slash"></i> Görünür Feature'ı Kaldır
          </button>
        </div>
      </section>
    </div>
  `;

  tab.querySelector(".enhanced-recovery-save")?.addEventListener("click", async () => {
    await saveConfigFromTab(actor, tab);
    sheet.render(false);
  });

  tab.querySelector(".enhanced-recovery-test")?.addEventListener("click", async () => {
    await saveConfigFromTab(actor, tab);
    await processRecovery(actor, getConfig(actor).trigger);
    sheet.render(false);
  });

  tab.querySelector(".enhanced-recovery-clear")?.addEventListener("click", async () => {
    await clearSuppression(actor);
    ui.notifications.info(`${actor.name} için Enhanced Recovery baskısı temizlendi.`);
    sheet.render(false);
  });

  tab.querySelector(".enhanced-recovery-remove-visible")?.addEventListener("click", async () => {
    await removeVisibleFeature(actor);
    ui.notifications.info(`${actor.name} üzerindeki görünür Enhanced Recovery feature kaldırıldı.`);
    sheet.render(false);
  });

  tab.querySelector('[name="enabled"]')?.addEventListener("change", async () => {
    await saveConfigFromTab(actor, tab);
    sheet.render(false);
  });
}

async function saveConfigFromTab(actor, tab) {
  const blockedBy = [...tab.querySelectorAll('[name="blockedBy"]:checked')].map(input => input.value);

  const config = normalizeConfig({
    enabled: tab.querySelector('[name="enabled"]')?.checked ?? false,
    amount: tab.querySelector('[name="amount"]')?.value ?? 10,
    formula: tab.querySelector('[name="formula"]')?.value ?? "1d6",
    mode: tab.querySelector('[name="mode"]')?.value ?? "fixed",
    trigger: tab.querySelector('[name="trigger"]')?.value ?? "start",
    blockedBy,
    customBlockedBy: tab.querySelector('[name="customBlockedBy"]')?.value ?? "",
    minHp: tab.querySelector('[name="minHp"]')?.value ?? 1,
    worksAtZero: tab.querySelector('[name="worksAtZero"]')?.checked ?? false,
    doubleBelow: tab.querySelector('[name="doubleBelow"]')?.value ?? "",
    multiplier: tab.querySelector('[name="multiplier"]')?.value ?? 2,
    createVisibleFeature: tab.querySelector('[name="createVisibleFeature"]')?.checked ?? false,
    chatMessage: tab.querySelector('[name="chatMessage"]')?.checked ?? false
  });

  await setConfig(actor, config);

  if (config.enabled && config.createVisibleFeature) await ensureVisibleFeature(actor, config);
  if (!config.enabled) await clearSuppression(actor);

  ui.notifications.info(`${actor.name} için Enhanced Recovery kaydedildi.`);
}

const RECOVERY_API = {
  get(actorName) {
    const actor = game.actors.getName(actorName);
    if (!actor) return ui.notifications.error(`Actor bulunamadı: ${actorName}`);
    const config = getConfig(actor);
    console.log(actor.name, config);
    return config;
  },

  async set(actorName, config) {
    if (!game.user.isGM) return ui.notifications.error("Sadece GM kullanabilir.");
    const actor = game.actors.getName(actorName);
    if (!actor) return ui.notifications.error(`Actor bulunamadı: ${actorName}`);

    await setConfig(actor, config);
    ui.notifications.info(`${actor.name} için Enhanced Recovery ayarlandı.`);
    return getConfig(actor);
  },

  list() {
    const rows = game.actors
      .filter(actor => getConfig(actor).enabled)
      .map(actor => ({
        name: actor.name,
        config: getConfig(actor),
        suppressed: getSuppressedTypes(actor).join(", "),
        visibleFeature: hasVisibleFeature(actor),
        lastRecovery: actor.getFlag(MODULE_ID, "lastRecovery") ?? null
      }));

    console.table(rows);
    return rows;
  },

  async test(actorName) {
    if (!game.user.isGM) return ui.notifications.error("Sadece GM kullanabilir.");
    const actor = game.actors.getName(actorName);
    if (!actor) return ui.notifications.error(`Actor bulunamadı: ${actorName}`);
    await processRecovery(actor, getConfig(actor).trigger);
  },

  async clear(actorName) {
    if (!game.user.isGM) return ui.notifications.error("Sadece GM kullanabilir.");
    const actor = game.actors.getName(actorName);
    if (!actor) return ui.notifications.error(`Actor bulunamadı: ${actorName}`);
    await clearSuppression(actor);
    ui.notifications.info(`${actor.name} için Enhanced Recovery baskısı temizlendi.`);
  }
};

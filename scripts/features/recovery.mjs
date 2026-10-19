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

// Formül dışındaki modlarda bir sonraki iyileşmenin tahmini (çarpan hariç).
function previewAmount(actor, config) {
  const hp = actor.system?.attributes?.hp;
  const cr = Number(actor.system?.details?.cr ?? 0);
  const level = Number(actor.system?.details?.level ?? 0);
  const con = Number(actor.system?.abilities?.con?.mod ?? 0);
  switch (config.mode) {
    case "fixed": return config.amount;
    case "cr+con": return (cr || 1) + con;
    case "level+con": return (level || 1) + con;
    case "base+con": return (cr || level || 1) + con;
    case "percent-max": return Math.floor(Number(hp?.max ?? 0) * (config.amount / 100));
    case "percent-missing": return Math.floor((Number(hp?.max ?? 0) - Number(hp?.value ?? 0)) * (config.amount / 100));
    default: return null;
  }
}

function damageTypeLabel(type) {
  const label = CONFIG.DND5E?.damageTypes?.[type]?.label;
  return label ? game.i18n.localize(label) : type;
}

const MODE_LABELS_TR = {
  fixed: "Sabit miktar",
  "cr+con": "CR + CON",
  "level+con": "Seviye + CON",
  "base+con": "Taban (CR ya da seviye) + CON",
  "percent-max": "Azami canın yüzdesi",
  "percent-missing": "Eksik canın yüzdesi",
  formula: "Zar formülü"
};

const RECOVERY_ADVANCED_OPEN = new Set();

async function renderRecoveryTab(sheet, actor, tab) {
  const config = getConfig(actor);
  const suppressed = getSuppressedTypes(actor);
  const lastRecovery = actor.getFlag(MODULE_ID, "lastRecovery") ?? null;
  const blockedTypes = config.blockedBy ?? [];
  const allBlocked = getBlockedTypes(config);
  const visibleFeature = hasVisibleFeature(actor);
  const usesAmount = ["fixed", "percent-max", "percent-missing"].includes(config.mode);
  const isPercent = config.mode.startsWith("percent");
  const preview = previewAmount(actor, config);
  const timing = config.trigger === "end" ? "sonunda" : "başında";

  const headline = !config.enabled ? "Kapalı"
    : config.mode === "formula" ? `${escapeHtml(config.formula || "1d6")} HP / tur`
    : `+${preview ?? 0} HP / tur`;
  const sentence = `Her turun ${timing} can yeniler.`
    + (allBlocked.length ? ` ${allBlocked.map(damageTypeLabel).join(", ")} hasarı bir sonraki yenilenmeyi durdurur.` : "");

  const modeOptions = Object.keys(MODES).map(value =>
    `<option value="${value}" ${config.mode === value ? "selected" : ""}>${MODE_LABELS_TR[value] ?? MODES[value]}</option>`
  ).join("");

  const damagePills = DAMAGE_TYPES.map(type => `
    <label class="er-pill">
      <input type="checkbox" name="blockedBy" value="${type}" ${blockedTypes.includes(type) ? "checked" : ""}>
      <span>${damageTypeLabel(type)}</span>
    </label>`).join("");

  const chips = [
    suppressed.length
      ? `<span class="er-chip er-chip-warn"><i class="fas fa-ban"></i> Baskılandı: ${suppressed.map(damageTypeLabel).join(", ")}
          <button type="button" class="enhanced-recovery-clear" data-tooltip="Baskıyı temizle"><i class="fas fa-xmark"></i></button></span>`
      : "",
    lastRecovery
      ? `<span class="er-chip"><i class="fas fa-heart-pulse"></i> Son: +${lastRecovery.amount} HP (${lastRecovery.before} → ${lastRecovery.after})</span>`
      : `<span class="er-chip er-chip-muted"><i class="fas fa-heart-pulse"></i> Henüz yenilenmedi</span>`,
    `<span class="er-chip ${visibleFeature ? "" : "er-chip-muted"}"><i class="fas fa-${visibleFeature ? "eye" : "eye-slash"}"></i> ${visibleFeature ? "Görünür özellik var" : "Görünür özellik yok"}</span>`
  ].join("");

  tab.innerHTML = `
    <div class="enhanced-recovery-content er">
      <header class="er-header">
        <div class="er-title">
          <span class="er-eyebrow">Enhanced Recovery</span>
          <h2>${headline}</h2>
          <p class="er-sentence">${config.enabled ? sentence : "Açınca bu yaratık savaşta her tur can yeniler."}</p>
        </div>
        <label class="er-switch" data-tooltip="Enhanced Recovery">
          <input type="checkbox" name="enabled" ${config.enabled ? "checked" : ""}>
          <span class="er-switch-track"><span class="er-switch-thumb"></span></span>
        </label>
      </header>

      <div class="er-body" ${config.enabled ? "" : "hidden"}>
        <div class="er-chips">${chips}</div>

        <section class="er-section">
          <h3>İyileşme</h3>
          <div class="er-grid">
            <label class="er-field er-field-wide">
              <span>Yöntem</span>
              <select name="mode">${modeOptions}</select>
            </label>
            <label class="er-field" ${usesAmount ? "" : "hidden"}>
              <span>${isPercent ? "Yüzde" : "Miktar (HP)"}</span>
              <input type="number" name="amount" value="${config.amount}" min="0" step="1">
            </label>
            <label class="er-field" ${config.mode === "formula" ? "" : "hidden"}>
              <span>Formül <em>@cr @level @base @con</em></span>
              <input type="text" name="formula" value="${escapeHtml(config.formula)}" placeholder="1d6 + @con">
            </label>
            <div class="er-field">
              <span>Ne zaman</span>
              <div class="er-segment">
                <label><input type="radio" name="trigger" value="start" ${config.trigger === "end" ? "" : "checked"}><span>Tur başında</span></label>
                <label><input type="radio" name="trigger" value="end" ${config.trigger === "end" ? "checked" : ""}><span>Tur sonunda</span></label>
              </div>
            </div>
          </div>
        </section>

        <section class="er-section">
          <h3>Baskılayan hasar</h3>
          <div class="er-pills">${damagePills}</div>
          <label class="er-field">
            <span>Diğer türler <em>virgülle</em></span>
            <input type="text" name="customBlockedBy" value="${escapeHtml(config.customBlockedBy)}" placeholder="ör. poison, slashing">
          </label>
        </section>

        <details class="er-section er-advanced">
          <summary>Gelişmiş</summary>
          <div class="er-grid">
            <label class="er-field">
              <span>En düşük can</span>
              <input type="number" name="minHp" value="${config.minHp}" step="1">
            </label>
            <label class="er-field">
              <span>Şu yüzdenin altında</span>
              <input type="number" name="doubleBelow" value="${config.doubleBelow}" placeholder="boş" step="1">
            </label>
            <label class="er-field">
              <span>Çarpan</span>
              <input type="number" name="multiplier" value="${config.multiplier}" min="1" step="0.5">
            </label>
          </div>
          <div class="er-toggles">
            <label class="er-check"><input type="checkbox" name="worksAtZero" ${config.worksAtZero ? "checked" : ""}><span>0 canda da çalışır</span></label>
            <label class="er-check"><input type="checkbox" name="createVisibleFeature" ${config.createVisibleFeature ? "checked" : ""}><span>Sayfada görünür özellik oluştur</span></label>
            <label class="er-check"><input type="checkbox" name="chatMessage" ${config.chatMessage ? "checked" : ""}><span>Sohbete yenilenme mesajı yaz</span></label>
          </div>
          ${visibleFeature ? `<button type="button" class="enhanced-recovery-remove-visible er-link"><i class="fas fa-eye-slash"></i> Görünür özelliği kaldır</button>` : ""}
        </details>

        <footer class="er-footer">
          <span class="er-hint"><i class="fas fa-check"></i> Değişiklikler kendiliğinden kaydedilir</span>
          <button type="button" class="enhanced-recovery-test"><i class="fas fa-vial"></i> Şimdi dene</button>
        </footer>
      </div>
    </div>
  `;

  // Gelişmiş bölümünün açık/kapalı durumu yeniden çizimde korunur.
  const advanced = tab.querySelector(".er-advanced");
  if (advanced) {
    advanced.open = RECOVERY_ADVANCED_OPEN.has(actor.uuid);
    advanced.addEventListener("toggle", () => {
      if (advanced.open) RECOVERY_ADVANCED_OPEN.add(actor.uuid);
      else RECOVERY_ADVANCED_OPEN.delete(actor.uuid);
    });
  }

  // Otomatik kaydetme: bir alan değişince kaydedilir ve sekme yeniden çizilir.
  tab.querySelector(".er")?.addEventListener("change", async event => {
    if (!event.target.matches("input, select")) return;
    await saveConfigFromTab(actor, tab, { notify: false });
    sheet.render(false);
  });

  tab.querySelector(".enhanced-recovery-test")?.addEventListener("click", async () => {
    await saveConfigFromTab(actor, tab, { notify: false });
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
    ui.notifications.info(`${actor.name} üzerindeki görünür Enhanced Recovery özelliği kaldırıldı.`);
    sheet.render(false);
  });
}

async function saveConfigFromTab(actor, tab, { notify = true } = {}) {
  const blockedBy = [...tab.querySelectorAll('[name="blockedBy"]:checked')].map(input => input.value);

  const config = normalizeConfig({
    enabled: tab.querySelector('[name="enabled"]')?.checked ?? false,
    amount: tab.querySelector('[name="amount"]')?.value ?? 10,
    formula: tab.querySelector('[name="formula"]')?.value ?? "1d6",
    mode: tab.querySelector('[name="mode"]')?.value ?? "fixed",
    trigger: tab.querySelector('[name="trigger"]:checked')?.value ?? "start",
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

  if (notify) ui.notifications.info(`${actor.name} için Enhanced Recovery kaydedildi.`);
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

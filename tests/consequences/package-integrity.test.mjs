import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("module manifest and localization files are valid JSON", async () => {
  const manifest = JSON.parse(await readFile(new URL("module.json", root), "utf8"));
  const tr = JSON.parse(await readFile(new URL("lang/tr.json", root), "utf8"));
  const en = JSON.parse(await readFile(new URL("lang/en.json", root), "utf8"));
  assert.equal(manifest.id, "vaelora-house-rules");
  assert.equal(manifest.title, "Vaelora Ev Kuralları");
  assert.equal(manifest.socket, true);
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.relationships.systems[0].id, "dnd5e");
  assert.ok(tr.SABKC.D100.R100);
  assert.ok(en.SABKC.D100.R100);

  const flatten = (value, prefix="") => Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && (typeof child === "object") ? flatten(child, path) : [path];
  });
  assert.deepEqual(flatten(tr).sort(), flatten(en).sort());

  const requiredFiles = [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(language => language.path),
    manifest.readme,
    manifest.changelog,
    "scripts/features/consequences/LICENSE",
    "templates/dashboard.hbs",
    "templates/incident-dialog.hbs",
    "templates/edit-state-dialog.hbs",
    "templates/history-dialog.hbs",
    "templates/chat-violation.hbs",
    "templates/chat-d100.hbs",
    "templates/chat-consumption.hbs"
  ];
  await Promise.all(requiredFiles.map(file => access(new URL(file, root))));
});

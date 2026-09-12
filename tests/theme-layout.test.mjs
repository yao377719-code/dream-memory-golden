import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { sanitizeStoredData } from "../cloudflare/lib/http.mjs";

async function loadThemeUtils() {
  const source = await readFile(new URL("../public/theme-utils.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.DreamTheme;
}

test("custom theme normalizes supported Hex formats and rejects CSS input", async () => {
  const theme = await loadThemeUtils();
  assert.equal(theme.normalizeHex("9aff9a"), "#9AFF9A");
  assert.equal(theme.normalizeHex("#9AFF9A"), "#9AFF9A");
  assert.equal(theme.normalizeHex("red"), "");
  assert.equal(theme.normalizeHex("#fff; background:url(x)"), "");
});

test("derived light custom color selects readable dark button text", async () => {
  const theme = await loadThemeUtils();
  const derived = theme.deriveTheme("#9AFF9A");
  assert.equal(derived.accent, "#9AFF9A");
  assert.equal(derived.buttonText, "#27222A");
  assert.ok(theme.contrast(derived.accent, derived.buttonText) >= 4.5);
  assert.ok(theme.contrast(derived.paper, derived.ink) >= 4.5);
});

test("new stored preferences are normalized at the tenant API boundary", () => {
  const safe = sanitizeStoredData({
    profile: { customThemeColor: "9aff9a", layoutPreset: "none" },
  }, "ui-test-001");
  assert.equal(safe.profile.customThemeColor, "#9AFF9A");
  assert.equal(safe.profile.layoutPreset, "none");
  assert.equal(safe.customerId, "ui-test-001");

  const fallback = sanitizeStoredData({
    profile: { themeColor: "gold", customThemeColor: "expression(alert(1))", layoutPreset: "stretch" },
  }, "legacy-site");
  assert.equal(fallback.profile.themeColor, "gold");
  assert.equal(fallback.profile.customThemeColor, "");
  assert.equal(fallback.profile.layoutPreset, "full");
});

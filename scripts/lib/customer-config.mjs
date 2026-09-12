import { readFile } from "node:fs/promises";
import path from "node:path";

export function validateCustomerConfig(config) {
  const projectName = String(config?.name || "").trim();
  const customerId = String(config?.vars?.CUSTOMER_ID || "").trim();
  const runtimeProject = String(config?.vars?.PAGES_PROJECT_NAME || "").trim();
  const match = projectName.match(/^dream-memory-([a-z0-9]+-[a-z0-9]{5,8})$/);
  if (!match) throw new Error("Pages project must use dream-memory-<word>-<5-8 lowercase letters/digits>");
  if (customerId !== `customer-${match[1]}`) throw new Error("CUSTOMER_ID does not match the Pages project slug");
  if (runtimeProject !== projectName) throw new Error("PAGES_PROJECT_NAME must match the Pages project name");
  if (!new Set(["./dist", "../../dist"]).has(config.pages_build_output_dir)) {
    throw new Error("pages_build_output_dir must point to the golden repository dist directory");
  }
  const bindings = Array.isArray(config.kv_namespaces) ? config.kv_namespaces : [];
  if (bindings.length !== 1 || bindings[0]?.binding !== "DREAM_MEMORY_STORE") {
    throw new Error("Exactly one DREAM_MEMORY_STORE KV binding is required");
  }
  const kvId = String(bindings[0]?.id || "").trim();
  if (!/^[0-9a-f]{32}$/.test(kvId)) throw new Error("DREAM_MEMORY_STORE must use a 32-character KV namespace ID");
  return {
    projectName,
    customerId,
    productionBranch: customerId,
    kvId,
    siteUrl: `https://${projectName}.pages.dev`,
  };
}

export async function loadCustomerConfig(file) {
  const absolute = path.resolve(file);
  const config = JSON.parse(await readFile(absolute, "utf8"));
  return { absolute, config, identity: validateCustomerConfig(config) };
}

export function createCustomerConfig({ projectName, customerId, kvId, nested = false }) {
  return {
    $schema: nested ? "../../node_modules/wrangler/config-schema.json" : "node_modules/wrangler/config-schema.json",
    name: projectName,
    compatibility_date: "2026-07-10",
    pages_build_output_dir: nested ? "../../dist" : "./dist",
    vars: { CUSTOMER_ID: customerId, PAGES_PROJECT_NAME: projectName },
    kv_namespaces: [{ binding: "DREAM_MEMORY_STORE", id: kvId }],
  };
}

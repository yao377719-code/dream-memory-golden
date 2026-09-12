import { spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { loadCustomerConfig } from "./lib/customer-config.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ""; };
const configFile = arg("--config");
if (!configFile) throw new Error("--config is required");
const { identity } = await loadCustomerConfig(configFile);
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("ADMIN_PASSWORD must be supplied through the environment");
const front = await fetch(`${identity.siteUrl}/`, { headers: { "cache-control": "no-cache" } });
const admin = await fetch(`${identity.siteUrl}/admin/`, { headers: { "cache-control": "no-cache" } });
const api = await fetch(`${identity.siteUrl}/api/site-data`, { headers: { "cache-control": "no-cache" } });
if (!front.ok || !admin.ok || !api.ok) throw new Error("front, admin, or public API is unavailable");
const html = await admin.text();
const publicData = await api.json();
if (!html.includes(identity.customerId) || !html.includes(identity.projectName) || publicData.customerId !== identity.customerId) {
  throw new Error("frontend and Functions identity mismatch");
}
const own = await fetch(`${identity.siteUrl}/api/admin-data`, { headers: { "x-admin-password": password } });
const wrong = await fetch(`${identity.siteUrl}/api/admin-data`, { headers: { "x-admin-password": `${password}-wrong` } });
if (own.status !== 200 || wrong.status !== 401) throw new Error("password isolation failed");
const wranglerCli = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
const keys = spawnSync(process.execPath, [wranglerCli, "kv", "key", "list", "--namespace-id", identity.kvId, "--remote"], { encoding: "utf8" });
if (keys.status !== 0) throw new Error("unable to list the new KV namespace");
if (JSON.parse(keys.stdout).length !== 0) throw new Error("new customer KV is not empty");
console.log("Live blank-customer acceptance passed");

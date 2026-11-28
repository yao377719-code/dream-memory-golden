import { loadCustomerConfig } from "./lib/customer-config.mjs";
import { acceptBlankHttp } from "./lib/artifact-preflight.mjs";
import { acceptBlankBrowser } from "./lib/browser-acceptance.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/template-release.mjs";

const index = process.argv.indexOf("--config");
if (index < 0 || !process.argv[index + 1]) throw new Error("--config is required");
const { identity } = await loadCustomerConfig(process.argv[index + 1]);
const password = process.env.ADMIN_PASSWORD;
if (!/^\d{6}$/.test(password ?? "")) throw new Error("Supply ADMIN_PASSWORD securely");
const cwd = process.cwd();
run(process.execPath, [fileURLToPath(new URL("./verify-remote-config.mjs", import.meta.url)), "--config", process.argv[index + 1]], {
  cwd, step: "verify remote identity and KV binding",
});
await acceptBlankHttp(identity.siteUrl, identity, password);
const cli = path.join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
const keys = JSON.parse(run(process.execPath, [cli, "kv", "key", "list", "--namespace-id", identity.kvId, "--remote"],
  { cwd, step: "verify new blank namespace" }));
if (keys.length) throw new Error("New customer namespace is not empty");
await acceptBlankBrowser({ url: identity.siteUrl, password });
console.log("Fixed-domain HTTP, KV and desktop/mobile browser checks passed");

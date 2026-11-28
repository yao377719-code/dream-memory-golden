import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadCustomerConfig } from "./lib/customer-config.mjs";

const i = process.argv.indexOf("--config");
if (i < 0 || !process.argv[i + 1]) throw new Error("--config is required");
const { identity } = await loadCustomerConfig(process.argv[i + 1]);
const temporary = await mkdtemp(path.join(os.tmpdir(), "dream-memory-remote-audit-"));
try {
  const wranglerCli = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [wranglerCli, "pages", "download", "config", identity.projectName, "--force"], {
    cwd: temporary,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "unable to download Pages configuration");
  const toml = await readFile(path.join(temporary, "wrangler.toml"), "utf8");
  const config = parse(toml);
  const selected = config.env?.production ?? config;
  const store = selected.kv_namespaces?.filter((entry) => entry.binding === "DREAM_MEMORY_STORE");
  if (config.name !== identity.projectName || selected.vars?.CUSTOMER_ID !== identity.customerId ||
      selected.vars?.PAGES_PROJECT_NAME !== identity.projectName || store?.length !== 1 || store[0].id !== identity.kvId) {
    throw new Error("remote Pages production configuration has an identity or KV binding mismatch");
  }
  console.log("Remote Pages project, CUSTOMER_ID, and KV binding match the local instance config");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

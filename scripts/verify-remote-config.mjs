import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadCustomerConfig } from "./lib/customer-config.mjs";

const i = process.argv.indexOf("--config");
if (i < 0 || !process.argv[i + 1]) throw new Error("--config is required");
const { identity } = await loadCustomerConfig(process.argv[i + 1]);
const temporary = await mkdtemp(path.join(os.tmpdir(), "dream-memory-remote-audit-"));
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["--prefix", process.cwd(), "wrangler", "pages", "download", "config", identity.projectName, "--force"], {
    cwd: temporary,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(result.stderr || "unable to download Pages configuration");
  const toml = await readFile(path.join(temporary, "wrangler.toml"), "utf8");
  for (const expected of [identity.projectName, identity.customerId, identity.kvId, "DREAM_MEMORY_STORE", "PAGES_PROJECT_NAME"]) {
    if (!toml.includes(expected)) throw new Error(`remote Pages config is missing expected value: ${expected}`);
  }
  console.log("Remote Pages project, CUSTOMER_ID, and KV binding match the local instance config");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

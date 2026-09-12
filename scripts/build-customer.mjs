import { spawnSync } from "node:child_process";
import process from "node:process";
import { loadCustomerConfig } from "./lib/customer-config.mjs";

const index = process.argv.indexOf("--config");
if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: npm run customer:build -- --config <wrangler.jsonc>");
const { identity } = await loadCustomerConfig(process.argv[index + 1]);
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  PUBLIC_CUSTOMER_MODE: "blank",
  PUBLIC_CUSTOMER_ID: identity.customerId,
  PUBLIC_PAGES_PROJECT_NAME: identity.projectName,
  PUBLIC_SITE_URL: identity.siteUrl,
};
delete env.ALLOW_DEMO_BUILD;
const build = spawnSync(command, ["run", "build:astro"], { env, stdio: "inherit", shell: process.platform === "win32" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const audit = spawnSync(process.execPath, ["scripts/audit-golden.mjs", "--dist", "dist", "--customer-id", identity.customerId, "--project", identity.projectName], { stdio: "inherit" });
if (audit.error) throw audit.error;
process.exit(audit.status ?? 1);

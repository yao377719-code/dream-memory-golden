import { mkdir, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { generateCustomerIdentities } from "./generate-customer-identities.mjs";
import { createCustomerConfig, validateCustomerConfig } from "./lib/customer-config.mjs";

const has = (name) => process.argv.includes(name);
const option = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ""; };
const execute = has("--execute");
const requestedSlug = option("--slug");
const generated = generateCustomerIdentities({ count: 1, suffixLength: 6 })[0];
const projectName = requestedSlug ? `dream-memory-${requestedSlug}` : generated.projectName;
const customerId = requestedSlug ? `customer-${requestedSlug}` : generated.customerId;
validateCustomerConfig(createCustomerConfig({ projectName, customerId, kvId: "0".repeat(32) }));
const root = process.cwd();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || root, encoding: "utf8", stdio: "pipe", input: options.input, shell: process.platform === "win32" && /\.cmd$/i.test(command) });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}

const plan = [
  `verify no Pages/KV collision for ${projectName}`,
  `create KV namespace ${projectName}`,
  `create Pages project ${projectName} with production branch ${customerId}`,
  "set ADMIN_PASSWORD from the process environment as a Pages Secret",
  "generate and validate one local wrangler.jsonc as the identity source of truth",
  "build blank output, audit it, deploy it, verify remote config, and run live acceptance",
];
if (!execute) {
  console.log(JSON.stringify({ mode: "plan-only", projectName, customerId, actions: plan }, null, 2));
  process.exit(0);
}
if (!process.env.ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD must be supplied through the environment");
if (run("git", ["status", "--porcelain"]).trim()) throw new Error("Refusing to provision from a dirty Git worktree");
const wrangler = ["--prefix", root, "wrangler"];
const projectList = JSON.parse(run(npx, [...wrangler, "pages", "project", "list", "--json"]));
if (projectList.some((item) => item["Project Name"] === projectName)) throw new Error("Pages project name already exists");
const namespaceList = JSON.parse(run(npx, [...wrangler, "kv", "namespace", "list"]));
if (namespaceList.some((item) => item.title === projectName)) throw new Error("KV namespace name already exists");
const kvOutput = run(npx, [...wrangler, "kv", "namespace", "create", projectName]);
const kvId = kvOutput.match(/"id"\s*:\s*"([0-9a-f]{32})"/)?.[1];
if (!kvId) throw new Error("KV was created but its namespace ID could not be parsed; stop and inspect before retrying");
run(npx, [...wrangler, "pages", "project", "create", projectName, "--production-branch", customerId]);
const config = createCustomerConfig({ projectName, customerId, kvId, nested: true });
validateCustomerConfig(config);
const configDir = path.join(root, ".customer", projectName);
await mkdir(path.dirname(configDir), { recursive: true });
await mkdir(configDir, { recursive: false });
await symlink(path.join(root, "functions"), path.join(configDir, "functions"), "junction");
await symlink(path.join(root, "cloudflare"), path.join(configDir, "cloudflare"), "junction");
const configPath = path.join(configDir, "wrangler.jsonc");
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
run(npx, [...wrangler, "pages", "secret", "put", "ADMIN_PASSWORD", "--project-name", projectName], { input: `${process.env.ADMIN_PASSWORD}\n`, cwd: configDir });
run(npm, ["run", "customer:build", "--", "--config", configPath]);
const commit = run("git", ["rev-parse", "HEAD"]).trim();
run(npx, [...wrangler, "pages", "deploy", path.join(root, "dist"), "--project-name", projectName, "--branch", customerId, "--commit-hash", commit, "--commit-message", "Provision blank customer from golden template"], { cwd: configDir });
run(process.execPath, ["scripts/verify-remote-config.mjs", "--config", configPath]);
run(process.execPath, ["scripts/accept-customer.mjs", "--config", configPath]);
console.log(JSON.stringify({ projectName, customerId, kvId, siteUrl: `https://${projectName}.pages.dev`, adminUrl: `https://${projectName}.pages.dev/admin/` }, null, 2));

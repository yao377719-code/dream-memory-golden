import { writeFile } from "node:fs/promises";
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
const wranglerCli = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required to run the golden provisioning workflow");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || root, encoding: "utf8", stdio: "pipe", input: options.input });
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
const wrangler = [wranglerCli];
const projectList = JSON.parse(run(process.execPath, [...wrangler, "pages", "project", "list", "--json"]));
if (projectList.some((item) => item["Project Name"] === projectName)) throw new Error("Pages project name already exists");
const namespaceList = JSON.parse(run(process.execPath, [...wrangler, "kv", "namespace", "list"]));
if (namespaceList.some((item) => item.title === projectName)) throw new Error("KV namespace name already exists");
const kvOutput = run(process.execPath, [...wrangler, "kv", "namespace", "create", projectName]);
const kvId = kvOutput.match(/"id"\s*:\s*"([0-9a-f]{32})"/)?.[1];
if (!kvId) throw new Error("KV was created but its namespace ID could not be parsed; stop and inspect before retrying");
run(process.execPath, [...wrangler, "pages", "project", "create", projectName, "--production-branch", customerId]);
const config = createCustomerConfig({ projectName, customerId, kvId });
validateCustomerConfig(config);
const configPath = path.join(root, "wrangler.jsonc");
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
run(process.execPath, [wranglerCli, "pages", "secret", "put", "ADMIN_PASSWORD", "--project-name", projectName], { input: `${process.env.ADMIN_PASSWORD}\n` });
run(process.execPath, [npmCli, "run", "customer:build", "--", "--config", configPath]);
const commit = run("git", ["rev-parse", "HEAD"]).trim();
run(process.execPath, [...wrangler, "pages", "deploy", path.join(root, "dist"), "--project-name", projectName, "--branch", customerId, "--commit-hash", commit, "--commit-message", "Provision blank customer from golden template"]);
run(process.execPath, ["scripts/verify-remote-config.mjs", "--config", configPath]);
run(process.execPath, ["scripts/accept-customer.mjs", "--config", configPath]);
console.log(JSON.stringify({ projectName, customerId, kvId, siteUrl: `https://${projectName}.pages.dev`, adminUrl: `https://${projectName}.pages.dev/admin/` }, null, 2));

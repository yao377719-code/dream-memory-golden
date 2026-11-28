import { randomInt } from "node:crypto";
import { access, mkdir, open, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCustomerConfig, validateCustomerConfig } from "./customer-config.mjs";
import { appendDeliveryRecord, readCredential, readDeliveryRecords, saveCredential } from "./delivery-ledger.mjs";
import { verifyBrowserAvailable } from "./browser-acceptance.mjs";
import { gateArtifact, preflightArtifact } from "./artifact-preflight.mjs";
import { run, verifyTemplateCheckout } from "./template-release.mjs";

// Record intent before each resource mutation. On resume, inspect the exact
// resource from that intent rather than issuing a new create blindly.
export async function provisionSite({ directory, record, password, steps }) {
  const persist = async (changes) => {
    record = { ...record, ...changes, updatedAt: new Date().toISOString() };
    await appendDeliveryRecord(directory, record);
  };
  const step = async (name, callback) => {
    if (record.completed?.includes(name)) return;
    const recovery = record.activeStep === name;
    await persist({ activeStep: name, failure: "" });
    try {
      const changes = await callback(recovery);
      await persist({ ...changes, activeStep: "", completed: [...(record.completed ?? []), name] });
    } catch (error) {
      await persist({ failure: name });
      throw new Error(record.customerNumber + " stopped at " + name + "; resume the recorded project", { cause: error });
    }
  };
  await step("collision-check", () => steps.checkNames(record));
  await step("kv-create", async (recovery) => ({ kvId: await steps.ensureKv(record, recovery) }));
  await step("pages-create", (recovery) => steps.ensureProject(record, recovery));
  await step("secret", () => steps.setSecret(record, password));
  // The artifact always comes from a fresh build and its own verification.
  // An interrupted deployment is safe to retry with this same pinned commit.
  await step("deploy", async () => {
    await steps.deploy(record);
    return { deployedCommit: record.templateCommit };
  });
  await step("fixed-domain-acceptance", () => steps.accept(record, password));
  await persist({ status: "待售", acceptance: "通过", acceptedAt: new Date().toISOString(), failure: "" });
  return record;
}

async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export async function withLedgerLock(directory, operation) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "provision.lock");
  let handle;
  try { handle = await open(lock, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Private ledger has an existing provisioning lock");
    throw error;
  }
  try {
    await handle.writeFile(String(process.pid) + "\n");
    return await operation();
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

export async function startSite(directory, identity, template, password) {
  const existing = await readDeliveryRecords(directory);
  if (existing.some((item) => item.projectName === identity.projectName)) throw new Error("Project already recorded; use --resume");
  const next = 1 + Math.max(0, ...existing.map((item) => Number(item.customerNumber.replace(/^G-/, "")) || 0));
  const record = {
    customerNumber: "G-" + String(next).padStart(4, "0"),
    frontUrl: new URL("/", identity.siteUrl).href,
    adminUrl: new URL("/admin/", identity.siteUrl).href,
    projectName: identity.projectName,
    customerId: identity.customerId,
    credentialRef: "credentials/" + identity.projectName + ".secret",
    templateVersion: template.tag,
    templateCommit: template.commit,
    status: "待验收",
    acceptance: "待核",
  };
  const used = new Set(await Promise.all(existing.filter((item) => item.credentialRef?.startsWith("credentials/"))
    .map((item) => readCredential(directory, item.projectName))));
  if (!password) {
    do { password = String(randomInt(0, 1000000)).padStart(6, "0"); } while (used.has(password));
  } else if (used.has(password)) {
    throw new Error("Use a different per-site password");
  }
  await appendDeliveryRecord(directory, record);
  await saveCredential(directory, record.projectName, password);
  return { record, password };
}

export async function cloudDriver({ repositoryRoot, template, npmCli, projectName }) {
  const freshRoot = path.join(repositoryRoot, ".customer", "provision-clones");
  await mkdir(freshRoot, { recursive: true, mode: 0o700 });
  const cwd = path.join(freshRoot, projectName);
  const cli = path.join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!await exists(cwd)) {
    run("git", ["clone", "--branch", template.tag, "--single-branch", template.origin, cwd], { cwd: freshRoot, step: "pinned clone" });
  }
  verifyTemplateCheckout(cwd, template);
  run(process.execPath, [npmCli, "ci"], { cwd, step: "locked dependency installation" });
  await verifyBrowserAvailable();

  const cf = (args, options = {}) => run(process.execPath, [cli, ...args], { cwd, ...options });
  const kvs = () => JSON.parse(cf(["kv", "namespace", "list"], { step: "verify namespace names" }));
  const projects = () => JSON.parse(cf(["pages", "project", "list", "--json"], { step: "verify Pages names" }));
  const byName = (project) => projects().find((item) => item["Project Name"] === project);
  const configPath = path.join(cwd, "wrangler.jsonc");

  return {
    checkNames(record) {
      if (kvs().some((item) => item.title === record.projectName) || byName(record.projectName)) throw new Error("Cloud name already occupied");
    },
    ensureKv(record, recovery) {
      const prior = kvs().filter((item) => item.title === record.projectName);
      if (prior.length > 1 || (prior.length && !recovery)) throw new Error("Ambiguous namespace");
      if (!prior.length) cf(["kv", "namespace", "create", record.projectName], { step: "create namespace" });
      const current = kvs().filter((item) => item.title === record.projectName);
      if (current.length !== 1 || !/^[a-f0-9]{32}$/.test(current[0].id)) throw new Error("Namespace creation could not be verified");
      return current[0].id;
    },
    ensureProject(record, recovery) {
      const prior = byName(record.projectName);
      if (prior) {
        if (!recovery) throw new Error("Existing Pages project was not part of a recorded create");
        const deployments = JSON.parse(cf(["pages", "deployment", "list", "--project-name", record.projectName, "--json"], { step: "verify empty resumed Pages project" }));
        if (deployments.length !== 0) throw new Error("A project with deployments cannot be adopted during project creation");
        return;
      }
      cf(["pages", "project", "create", record.projectName, "--production-branch", record.customerId], { step: "create Pages project" });
    },
    setSecret(record, password) {
      cf(["pages", "secret", "put", "ADMIN_PASSWORD", "--project-name", record.projectName], {
        input: password + "\n", step: "set Pages Secret",
      });
    },
    async deploy(record) {
      verifyTemplateCheckout(cwd, template);
      const config = createCustomerConfig(record);
      config.vars.DREAM_MEMORY_VERSION = template.commit;
      const identity = validateCustomerConfig(config);
      if (identity.kvId === "0".repeat(32)) throw new Error("Cannot deploy a fixture namespace");
      const configSource = JSON.stringify(config, null, 2) + "\n";
      try { await writeFile(configPath, configSource, { flag: "wx" }); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        const { readFile } = await import("node:fs/promises");
        if (await readFile(configPath, "utf8") !== configSource) throw new Error("Refusing to overwrite existing wrangler configuration");
      }
      run(process.execPath, [npmCli, "run", "customer:build", "--", "--config", configPath], {
        cwd, step: "blank build and static audit",
      });
      await gateArtifact({
        artifactDirectory: path.join(cwd, "dist"),
        preflight: () => preflightArtifact({ cwd, configPath, identity, storageParent: repositoryRoot }),
        deploy: () => cf(["pages", "deploy", "dist", "--project-name", identity.projectName,
          "--branch", identity.productionBranch, "--commit-hash", template.commit, "--commit-message", "Approved Golden blank template"],
        { step: "deploy the verified artifact" }),
      });
    },
    async accept(_record, password) {
      run(process.execPath, [fileURLToPath(new URL("../accept-customer.mjs", import.meta.url)), "--config", configPath], {
        cwd, step: "verify fixed domain in API, KV and browser",
        env: { ...process.env, ADMIN_PASSWORD: password },
      });
    },
  };
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCustomerConfig, validateCustomerConfig } from "./lib/customer-config.mjs";
import { acceptBlankHttp, gateArtifact, preflightArtifact, withLocalPages } from "./lib/artifact-preflight.mjs";
import { run } from "./lib/template-release.mjs";

const repository = process.cwd();
const scratch = path.join(repository, ".customer");
await mkdir(scratch, { recursive: true });
const output = await mkdtemp(path.join(scratch, "local-accept-"));
const first = await fixture("test-a1b2c3", "010019", "a".repeat(32));
const second = await fixture("test-d4e5f6", "020019", "b".repeat(32));

async function fixture(slug, password, kvId) {
  const cwd = path.join(output, slug);
  await mkdir(cwd);
  for (const name of ["astro.config.mjs", "package.json", "tsconfig.json", "src", "public", "scripts", "cloudflare", "functions", "tests"]) {
    await cp(path.join(repository, name), path.join(cwd, name), { recursive: true });
  }
  await symlink(path.join(repository, "node_modules"), path.join(cwd, "node_modules"), "junction");
  const config = createCustomerConfig({ projectName: "dream-memory-" + slug, customerId: "customer-" + slug, kvId });
  const configPath = path.join(cwd, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify(config));
  run(process.execPath, ["scripts/build-customer.mjs", "--config", configPath], { cwd, step: "build isolated blank artifact" });
  const storagePath = await mkdtemp(path.join(scratch, "kv-"));
  return { cwd, config, configPath, identity: validateCustomerConfig(config), password, storageParent: repository, storagePath };
}

await preflightArtifact(first);
await preflightArtifact(second);

const target = path.join(first.cwd, "dist", "index.html");
const original = await readFile(target, "utf8");
await writeFile(target, original.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, ""));
let fakeDeployments = 0;
const nextStep = async () => { fakeDeployments += 1; };
try {
  await assert.rejects(gateArtifact({ preflight: () => preflightArtifact(first), deploy: nextStep }), /CSS|stylesheet|dimensions/);
} finally {
  await writeFile(target, original);
}
try {
  const wrong = { ...first.config, vars: { ...first.config.vars, CUSTOMER_ID: second.identity.customerId } };
  await writeFile(first.configPath, JSON.stringify(wrong));
  await assert.rejects(gateArtifact({ preflight: () => preflightArtifact(first), deploy: nextStep }), /identity mismatch/);
} finally {
  await writeFile(first.configPath, JSON.stringify(first.config));
}
assert.equal(fakeDeployments, 0);
console.log("Both broken local candidates stopped before deployment");

await withLocalPages(first, async (url) => {
  await acceptBlankHttp(url, first.identity, first.password);
  await withLocalPages(second, async (isolationUrl) => {
    await acceptBlankHttp(isolationUrl, second.identity, second.password);
    const child = spawn(process.execPath, ["scripts/accept-golden-release.mjs"], {
      cwd: repository, stdio: "inherit", env: {
        ...process.env, GOLDEN_TEST_URL: url, GOLDEN_ADMIN_PASSWORD: first.password,
        GOLDEN_ISOLATION_URL: isolationUrl, GOLDEN_ACCEPTANCE_OUTPUT: output,
        GOLDEN_TEST_CUSTOMER_ID: first.identity.customerId, GOLDEN_ISOLATION_CUSTOMER_ID: second.identity.customerId,
      },
    });
    const [code] = await once(child, "exit");
    if (code !== 0) throw new Error("Local golden acceptance failed; evidence directory: " + output);
  });
});
console.log("Local evidence: " + output);

import { randomInt } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

import { generateCustomerIdentities } from "./generate-customer-identities.mjs";
import { appendDeliveryRecord, createPrivateCompletionPage, privateDeliveryDirectory, readDeliveryRecords } from "./lib/delivery-ledger.mjs";

const option = (name, fallback = "") => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1] || ""; };
const count = Number(option("--count", "1"));
const templateVersion = option("--template-version");
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("--count must be an integer from 1 to 100");
if (!/^v\d+\.\d+\.\d+-rc\.\d+$/.test(templateVersion)) throw new Error("--template-version must name an existing rc tag");
const root = process.cwd();
const directory = privateDeliveryDirectory(root, option("--delivery-dir"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script through npm run customer:batch");

function run(command, args, cwd = root, environment = process.env) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout.trim();
}

if (run("git", ["status", "--porcelain"])) throw new Error("Batch creation requires a clean golden repository");
if (run("git", ["branch", "--show-current"]) !== "main") throw new Error("Batch creation must run from main");
const commit = run("git", ["rev-parse", "HEAD"]);
if (run("git", ["rev-list", "-n", "1", templateVersion]) !== commit) throw new Error("Template tag must point to the checked-out commit");
const origin = run("git", ["remote", "get-url", "origin"]);
if (!/github\.com[:/]yao377719-code\/dream-memory-golden(?:\.git)?$/.test(origin)) throw new Error("Unexpected golden repository origin");
const remoteMain = run("git", ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0];
if (remoteMain !== commit) throw new Error("Local main is not the pushed GitHub main");

// Browser availability is checked before any Pages or KV resources are created.
const browser = await chromium.launch({ headless: true });
await browser.close();

const existing = await readDeliveryRecords(directory);
const reservedNames = existing.flatMap((item) => [item.projectName, item.customerId]);
const identities = generateCustomerIdentities({ count, reservedNames });
const nextNumber = existing.reduce((max, item) => Math.max(max, Number(item.customerNumber.replace(/^G-/, "")) || 0), 0) + 1;
const usedPasswords = new Set(existing.map((item) => item.password));
const workRoot = path.join(directory, "fresh-clones");
await mkdir(workRoot, { recursive: true, mode: 0o700 });

for (const [index, identity] of identities.entries()) {
  const number = `G-${String(nextNumber + index).padStart(4, "0")}`;
  const clone = path.join(workRoot, identity.projectName);
  let password;
  do { password = String(randomInt(0, 1000000)).padStart(6, "0"); } while (usedPasswords.has(password));
  usedPasswords.add(password);
  run("git", ["clone", "--branch", "main", "--single-branch", origin, clone]);
  if (run("git", ["rev-parse", "HEAD"], clone) !== commit) throw new Error("Fresh clone is not at the expected golden commit");
  run(process.execPath, [npmCli, "ci"], clone);
  const environment = { ...process.env, ADMIN_PASSWORD: password };
  run(process.execPath, [npmCli, "run", "customer:provision", "--", "--slug", identity.projectName.slice("dream-memory-".length)], clone, environment);

  const record = {
    customerNumber: number,
    frontUrl: `${identity.siteUrl}/`,
    adminUrl: identity.adminUrl,
    password,
    customerId: identity.customerId,
    projectName: identity.projectName,
    templateVersion,
    status: "待验收",
  };
  // Persist the credential outside Git immediately after the Secret and live API check.
  // If UI login fails, the pending record remains recoverable; it is never marked ready for sale.
  await appendDeliveryRecord(directory, record);

  const liveBrowser = await chromium.launch({ headless: true });
  try {
    const page = await liveBrowser.newPage();
    await page.goto(identity.adminUrl, { waitUntil: "networkidle" });
    await page.getByLabel("后台密码").fill(password);
    await page.getByRole("button", { name: "进入", exact: true }).click();
    await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("[data-logout]").click();
    await page.locator("[data-login]").waitFor({ state: "visible", timeout: 30000 });
    await page.getByLabel("后台密码").fill(password);
    await page.getByRole("button", { name: "进入", exact: true }).click();
    await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
  } finally {
    await liveBrowser.close();
  }
  await appendDeliveryRecord(directory, { ...record, status: "待售" });
  console.log(`${number}: ${identity.siteUrl} — browser login verified; private ledger updated`);
}

const page = await createPrivateCompletionPage(directory, await readDeliveryRecords(directory));
if (process.platform === "win32") {
  const child = spawn("explorer.exe", [page], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}
console.log(`Private completion page opened from outside Git: ${page}`);

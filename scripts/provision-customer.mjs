import { generateCustomerIdentities } from "./generate-customer-identities.mjs";
import { createCustomerConfig, validateCustomerConfig } from "./lib/customer-config.mjs";
import {
  appendDeliveryRecord, createPrivateCompletionPage, privateDeliveryDirectory, readCredential, readDeliveryRecords, saveCredential,
} from "./lib/delivery-ledger.mjs";
import { cloudDriver, provisionSite, startSite, withLedgerLock } from "./lib/site-provisioning.mjs";
import { selectTemplate } from "./lib/template-release.mjs";
import { verifyBrowserAvailable } from "./lib/browser-acceptance.mjs";

const suppliedPassword = process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_PASSWORD;
const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] || "" : "";
const cwd = process.cwd();
const batch = args.includes("--batch");
const resume = option("--resume");
const slug = option("--slug");
const count = batch ? Number(option("--count") || "1") : 1;
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("--count must be 1 to 100");
if (batch && slug) throw new Error("Batch mode generates project names automatically");
if (resume && (slug || args.includes("--count"))) throw new Error("Resume accepts one exact recorded Pages project");
const singleton = slug && {
  projectName: "dream-memory-" + slug,
  customerId: "customer-" + slug,
  siteUrl: "https://dream-memory-" + slug + ".pages.dev",
};
if (singleton) validateCustomerConfig(createCustomerConfig({ ...singleton, kvId: "0".repeat(32) }));
if (!args.includes("--execute")) {
  console.log(JSON.stringify({ mode: "plan-only", count, resume, projectName: singleton?.projectName,
    steps: ["approve exact template release", "verify browser", "reserve in private ledger", "provision isolated identity",
      "build and verify artifact locally", "deploy", "accept fixed domain", "mark ready for sale"] }, null, 2));
  process.exit(0);
}

const template = await selectTemplate({ cwd, tag: option("--template-version"), approval: option("--approval") });
const directory = privateDeliveryDirectory(cwd, option("--delivery-dir"));
if (!process.env.npm_execpath) throw new Error("Run through the npm provisioning entry point");
await verifyBrowserAvailable();
await withLedgerLock(directory, async () => {
  const existing = await readDeliveryRecords(directory);
  let record = resume ? existing.find((row) => row.projectName === resume) : undefined;
  if (resume && (!record || record.status !== "待验收" || record.templateCommit !== template.commit || record.templateVersion !== template.tag)) {
    throw new Error("Resume requires a pending record for the same approved release");
  }
  const identities = resume ? [record] : singleton ? [singleton] : generateCustomerIdentities({
    count, reservedNames: existing.flatMap((item) => [item.projectName, item.customerId]),
  });
  for (const identity of identities) {
    let password;
    if (resume) {
      password = await readCredential(directory, record.projectName);
      if (!password && !record.activeStep && !record.completed?.length && !batch && suppliedPassword) {
        password = suppliedPassword;
        await saveCredential(directory, record.projectName, password);
      }
      if (!password && !record.activeStep && !record.completed?.length && batch) {
        const { randomInt } = await import("node:crypto");
        password = String(randomInt(0, 1000000)).padStart(6, "0");
        await saveCredential(directory, record.projectName, password);
      }
      if (!password) throw new Error("Saved credential unavailable; review the pending record locally");
    } else {
      if (!batch && !/^\d{6}$/.test(suppliedPassword || "")) throw new Error("Supply ADMIN_PASSWORD securely");
      ({ record, password } = await startSite(directory, identity, template, batch ? "" : suppliedPassword));
    }
    let steps;
    try {
      steps = await cloudDriver({ repositoryRoot: cwd, template, npmCli: process.env.npm_execpath, projectName: identity.projectName });
    } catch (error) {
      await appendDeliveryRecord(directory, { ...record, failure: "checkout-and-dependencies", updatedAt: new Date().toISOString() });
      throw new Error(record.customerNumber + " stopped preparing the clean checkout", { cause: error });
    }
    const result = await provisionSite({ directory, record, password, steps });
    console.log(result.customerNumber + " verified and recorded");
  }
  const page = await createPrivateCompletionPage(directory, await readDeliveryRecords(directory));
  console.log("Private view: " + page);
});

import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendDeliveryRecord, createPrivateCompletionPage, privateDeliveryDirectory, readCredential, readDeliveryRecords, saveCredential } from "../scripts/lib/delivery-ledger.mjs";

const legacy = {
  customerNumber: "G-0001", frontUrl: "https://dream-memory-star-a1b2c3.pages.dev/",
  adminUrl: "https://dream-memory-star-a1b2c3.pages.dev/admin/", password: "012345",
  customerId: "customer-star-a1b2c3", projectName: "dream-memory-star-a1b2c3",
  templateVersion: "v1.0.0-rc.3", status: "待验收",
};

test("private delivery directory cannot be inside the repository", () => {
  const root = process.cwd();
  assert.throws(() => privateDeliveryDirectory(root, path.join(root, "delivery")), /outside/);
  const sibling = path.resolve(root, "..", "golden-delivery");
  assert.equal(privateDeliveryDirectory(root, sibling), sibling);
});

test("legacy records remain readable and new credentials never enter the rendered view", async () => {
  await mkdir(".customer", { recursive: true });
  const directory = await mkdtemp(path.resolve(".customer", "delivery-test-"));
  await appendFile(path.join(directory, "delivery-ledger.jsonl"), JSON.stringify(legacy) + "\n");
  const [previous] = await readDeliveryRecords(directory);
  assert.equal(previous.password, undefined);
  await appendDeliveryRecord(directory, { ...previous, status: "待售" });
  await assert.rejects(appendDeliveryRecord(directory, legacy), /separately/);
  await saveCredential(directory, legacy.projectName, "654321");
  await assert.rejects(saveCredential(directory, legacy.projectName, "246801"), /EEXIST/);
  assert.equal(await readCredential(directory, legacy.projectName), "654321");
  const page = await createPrivateCompletionPage(directory, await readDeliveryRecords(directory));
  const html = await readFile(page, "utf8");
  assert.doesNotMatch(html, /012345|654321/);
  assert.match(html, /data-copy="https:\/\/dream-memory-star-a1b2c3\.pages\.dev\/admin\//);
  assert.match(html, /待核/);
});

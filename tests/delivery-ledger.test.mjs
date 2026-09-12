import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendDeliveryRecord, createPrivateCompletionPage, privateDeliveryDirectory, readDeliveryRecords } from "../scripts/lib/delivery-ledger.mjs";

const record = {
  customerNumber: "G-0001",
  frontUrl: "https://dream-memory-star-a1b2c3.pages.dev/",
  adminUrl: "https://dream-memory-star-a1b2c3.pages.dev/admin/",
  password: "012345",
  customerId: "customer-star-a1b2c3",
  projectName: "dream-memory-star-a1b2c3",
  templateVersion: "v1.0.0-rc.3",
  status: "待验收",
};

test("private delivery directory cannot be inside the repository", () => {
  const root = process.cwd();
  assert.throws(() => privateDeliveryDirectory(root, path.join(root, "delivery")), /outside/);
  assert.equal(privateDeliveryDirectory(root, path.join(os.tmpdir(), "golden-delivery")), path.resolve(os.tmpdir(), "golden-delivery"));
});

test("ledger appends without overwriting credentials and renders a local completion page", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "golden-ledger-test-"));
  try {
    await appendDeliveryRecord(directory, record);
    await appendDeliveryRecord(directory, { ...record, status: "待售" });
    assert.equal((await readDeliveryRecords(directory))[0].status, "待售");
    await assert.rejects(appendDeliveryRecord(directory, { ...record, password: "654321" }), /overwrite/);
    const lines = (await readFile(path.join(directory, "delivery-ledger.jsonl"), "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    const page = await createPrivateCompletionPage(directory, await readDeliveryRecords(directory));
    const html = await readFile(page, "utf8");
    assert.match(html, /012345/);
    assert.match(html, /dream-memory-star-a1b2c3\.pages\.dev/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

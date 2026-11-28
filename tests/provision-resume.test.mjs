import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gateArtifact } from "../scripts/lib/artifact-preflight.mjs";
import { readDeliveryRecords, readCredential } from "../scripts/lib/delivery-ledger.mjs";
import { provisionSite, startSite } from "../scripts/lib/site-provisioning.mjs";
import { releaseChecks, verifyReleaseEvidence } from "../scripts/lib/template-release.mjs";

const template = { tag: "v1.0.0-rc.7", commit: "a".repeat(40) };

test("approval is pinned to the exact tag and verified commit", () => {
  const approval = { ...template, approved: true, acceptedAt: "2026-11-27T12:00:00Z",
    checks: Object.fromEntries(releaseChecks.map((check) => [check, { passed: true, reference: "isolated report" }])) };
  verifyReleaseEvidence(approval, template.tag, template.commit);
  assert.throws(() => verifyReleaseEvidence(approval, template.tag, "b".repeat(40)), /approved/);
  delete approval.checks.badBuildBlocked;
  assert.throws(() => verifyReleaseEvidence(approval, template.tag, template.commit), /approved/);
});

test("a failed artifact prevents the deployment callback from running", async () => {
  let deployed = false;
  await assert.rejects(gateArtifact({
    preflight: async () => { throw new Error("stylesheet has wrong MIME"); },
    deploy: async () => { deployed = true; },
  }), /stylesheet/);
  assert.equal(deployed, false);
});

test("single and batch use the same provision journal and resume without duplicating resources", async () => {
  await mkdir(".customer", { recursive: true });
  const directory = await mkdtemp(path.resolve(".customer", "provision-test-"));
  const calls = { kv: 0, projects: 0, deploy: 0 };
  const stages = {
    accountId: "a".repeat(32),
    checkNames: () => {},
    ensureKv: () => { calls.kv += 1; return "f".repeat(32); },
    ensureProject: () => { calls.projects += 1; },
    setSecret: () => {},
    deploy: () => { calls.deploy += 1; },
    accept: () => { throw new Error("browser login failed"); },
  };
  const first = await startSite(directory, {
    projectName: "dream-memory-test-abc123", customerId: "customer-test-abc123", siteUrl: "https://dream-memory-test-abc123.pages.dev",
  }, template, "040404");
  await assert.rejects(provisionSite({ directory, ...first, steps: stages }), /fixed-domain-acceptance/);
  const [pending] = await readDeliveryRecords(directory);
  assert.equal(pending.status, "待验收");
  assert.equal(pending.failure, "fixed-domain-acceptance");
  assert.equal(pending.kvId, "f".repeat(32));
  assert.equal(await readCredential(directory, pending.projectName), "040404");
  await assert.rejects(provisionSite({ directory, record: pending, password: first.password,
    steps: { ...stages, accountId: "b".repeat(32) } }), /different Cloudflare account/);
  const done = await provisionSite({ directory, record: pending, password: first.password, steps: { ...stages, accept: () => {} } });
  assert.equal(done.status, "待售");
  assert.equal(done.deployedCommit, template.commit);
  assert.deepEqual(calls, { kv: 1, projects: 1, deploy: 1 });
  const second = await startSite(directory, {
    projectName: "dream-memory-test-abc456", customerId: "customer-test-abc456", siteUrl: "https://dream-memory-test-abc456.pages.dev",
  }, template);
  assert.equal(second.record.customerNumber, "G-0002");
  assert.notEqual(second.password, first.password);
});

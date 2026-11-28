import assert from "node:assert/strict";
import { once } from "node:events";
import { appendFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { onRequest } from "../functions/api/_middleware.mjs";
import { measure } from "../cloudflare/lib/telemetry.mjs";

test("a failed KV stage can be queried from the collector after it stops", async () => {
  await mkdir(".customer", { recursive: true });
  const dir = await mkdtemp(path.resolve(".customer", "log-test-"));
  const ledger = path.join(dir, "requests.jsonl");
  const expectedAuth = "Bearer synthetic-collector-credential";
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== expectedAuth) { res.writeHead(401).end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await appendFile(ledger, Buffer.concat(chunks).toString("utf8") + "\n");
    res.writeHead(204).end();
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const inflight = [];
  const data = {};
  let response;
  try {
    response = await onRequest({
      request: new Request("https://dream-memory-test-abc123.pages.dev/api/admin-data?signature=synthetic-query", {
        method: "POST", headers: { "x-admin-password": "synthetic-password", cookie: "synthetic-cookie" },
        body: "synthetic-customer-content",
      }),
      env: {
        DREAM_MEMORY_VERSION: "a".repeat(40),
        DREAM_MEMORY_LOG_ENDPOINT: "http://127.0.0.1:" + server.address().port,
        DREAM_MEMORY_LOG_TOKEN: "synthetic-collector-credential",
        DREAM_MEMORY_LOG_LOCAL: "1",
      },
      data,
      waitUntil: (pending) => inflight.push(pending),
      next: () => measure(data, "kv-write", async () => { throw new Error("synthetic-private-error"); }),
    });
    await Promise.all(inflight);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(response.status, 500);
  const requestId = response.headers.get("x-request-id");
  const saved = await readFile(ledger, "utf8");
  const event = saved.trim().split("\n").map(JSON.parse).find((row) => row.requestId === requestId);
  assert.ok(event);
  assert.equal(event.phases[0].stage, "kv-write");
  assert.equal(event.phases[0].result, "failed");
  assert.equal(event.status, 500);
  assert.doesNotMatch(saved, /synthetic-(?:query|password|cookie|customer-content|private-error|collector-credential)/);
  console.log("Durable test log request ID " + requestId);
});


test("an isolated Pages Functions runtime forwards the request ID to durable storage", async () => {
  const { build } = await import("esbuild");
  const { Miniflare } = await import("miniflare");
  const { setTimeout: delay } = await import("node:timers/promises");
  await mkdir(".customer", { recursive: true });
  const directory = await mkdtemp(path.resolve(".customer", "runtime-receipt-"));
  const receipt = path.join(directory, "events.jsonl");
  const entry = [
    'import { onRequest } from "./functions/api/_middleware.mjs";',
    'import { onRequestPost } from "./functions/api/admin-data.mjs";',
    'export default { fetch(request,env,ctx) {',
    '  const scoped = { ...env, DREAM_MEMORY_STORE: { put() { throw Error("simulated private failure"); } } };',
    '  const context = { request, env: scoped, data: {}, waitUntil: (task) => ctx.waitUntil(task) };',
    '  context.next = () => onRequestPost(context);',
    '  return onRequest(context);',
    '} };',
  ].join("\n");
  const bundled = await build({ stdin: { contents: entry, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm" });
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-10",
    modules: [{ type: "ESModule", path: "functions-worker.mjs", contents: bundled.outputFiles[0].text }],
    bindings: {
      CUSTOMER_ID: "customer-test-a1b2c3", PAGES_PROJECT_NAME: "dream-memory-test-a1b2c3", ADMIN_PASSWORD: "000015",
      DREAM_MEMORY_VERSION: "b".repeat(40), DREAM_MEMORY_LOG_ENDPOINT: "https://log-fixture.invalid/ingest",
      DREAM_MEMORY_LOG_TOKEN: "synthetic-access",
    },
    outboundService: async (request) => {
      assert.equal(request.url, "https://log-fixture.invalid/ingest");
      assert.equal(request.headers.get("authorization"), "Bearer synthetic-access");
      await appendFile(receipt, await request.text() + "\n");
      return new Response(null, { status: 204 });
    },
  });
  let id;
  try {
    const response = await miniflare.dispatchFetch("https://dream-memory-test-a1b2c3.pages.dev/api/admin-data?private=synthetic-url", {
      method: "POST",
      headers: { "x-admin-password": "000015", cookie: "synthetic-cookie" },
      body: JSON.stringify({ profile: { nickname: "synthetic-customer-content" } }),
    });
    assert.equal(response.status, 500);
    id = response.headers.get("x-request-id");
    assert.ok(id);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const saved = await readFile(receipt, "utf8").catch(() => "");
      if (saved.includes(id)) break;
      await delay(50);
    }
  } finally {
    await miniflare.dispose();
  }
  const saved = await readFile(receipt, "utf8");
  const record = saved.trim().split("\n").map(JSON.parse).find((item) => item.requestId === id);
  assert.equal(record?.status, 500);
  assert.equal(record?.phases[0].stage, "kv-write");
  assert.equal(record?.phases[0].result, "failed");
  assert.doesNotMatch(saved, /synthetic-(?:url|cookie|customer-content|access)|000015|simulated private failure/);
  console.log("Exited isolated runtime with retrievable log ID " + id);
});

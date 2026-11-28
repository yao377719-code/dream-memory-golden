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

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { acceptBlankBrowser } from "./browser-acceptance.mjs";

export async function acceptBlankHttp(url, identity, password) {
  const options = { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15000) };
  for (const route of ["/", "/admin/"]) {
    const response = await fetch(new URL(route, url), options);
    const html = await response.text();
    assert.equal(response.status, 200, route + " is unavailable");
    assert.ok(html.includes('data-customer-id="' + identity.customerId + '"') &&
      html.includes('data-pages-project="' + identity.projectName + '"'), route + " frontend identity mismatch");
  }
  const api = await fetch(new URL("/api/site-data", url), options);
  assert.equal(api.status, 200, "public API is unavailable");
  const publicData = await api.json();
  assert.equal(publicData.customerId, identity.customerId, "Functions identity mismatch");
  assert.equal(publicData.data, null, "blank site contains persisted data");
  const adminUrl = new URL("/api/admin-data", url);
  const own = await fetch(adminUrl, { ...options, headers: { "x-admin-password": password } });
  const wrong = await fetch(adminUrl, { ...options, headers: { "x-admin-password": password + "-wrong" } });
  assert.equal(own.status, 200);
  assert.equal(wrong.status, 401);
  const adminData = await own.json();
  assert.equal(adminData.customerId, identity.customerId);
  assert.equal(adminData.data, null);
}

async function reservePort() {
  const server = net.createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export async function withLocalPages({ cwd, configPath, password, storagePath }, callback) {
  if (path.resolve(configPath) !== path.join(cwd, "wrangler.jsonc")) {
    throw new Error("Local Pages preflight requires the root wrangler.jsonc");
  }
  const port = await reservePort();
  const url = "http://127.0.0.1:" + port;
  const wrangler = path.join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
  const scratch = path.join(cwd, ".customer");
  await mkdir(scratch, { recursive: true });
  const local = spawn(process.execPath, [wrangler, "pages", "dev", "dist",
    "--ip", "127.0.0.1", "--port", String(port), "--binding", "ADMIN_PASSWORD=" + password,
    "--persist-to", storagePath ?? path.join(scratch, "preflight-kv")], {
    cwd, stdio: "pipe", windowsHide: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: path.join(scratch, "preflight-wrangler.log"),
      CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_API_KEY: "", ADMIN_PASSWORD: "" },
  });
  let started = false;
  let startupError;
  local.on("error", (error) => { startupError = error.code; });
  local.stdout.resume();
  local.stderr.resume();
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (startupError || local.exitCode !== null) throw new Error("Local Wrangler failed to start; check the private preflight log");
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(500) });
        await response.body?.cancel();
        started = true;
        break;
      } catch { await delay(300); }
    }
    if (!started) throw new Error("Timed out starting local Wrangler");
    return await callback(url);
  } finally {
    if (local.exitCode === null && local.pid) {
      if (process.platform === "win32") {
        const cleanup = spawn("taskkill.exe", ["/PID", String(local.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        await once(cleanup, "exit");
      } else {
        local.kill();
      }
    }
  }
}

export async function preflightArtifact({ cwd, configPath, identity }) {
  const password = "011019"; // Synthetic local-only credential.
  return withLocalPages({ cwd, configPath, password }, async (url) => {
    await acceptBlankHttp(url, identity, password);
    await acceptBlankBrowser({ url, password });
  });
}

export async function hashArtifact(directory) {
  const hash = createHash("sha256");
  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
  for (const file of files) {
    const buffer = await readFile(path.join(directory, file));
    hash.update(JSON.stringify([file.replaceAll(path.sep, "/"), buffer.length]));
    hash.update(buffer);
  }
  return hash.digest("hex");
}

export async function gateArtifact({ preflight, deploy, artifactDirectory }) {
  const before = artifactDirectory && await hashArtifact(artifactDirectory);
  await preflight();
  if (before && before !== await hashArtifact(artifactDirectory)) throw new Error("Artifact changed during preflight");
  return deploy();
}

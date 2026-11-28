import { imageReferences, ownsImageKey } from "./lib/image-lifecycle.mjs";
import { json } from "./lib/http.mjs";
import { elapsed, publishEvent, versionLabel } from "./lib/telemetry.mjs";

const DRAFT_LIFETIME = 24 * 60 * 60 * 1000;
const RETRY_DELAY = 60 * 1000;

export class ImageLifecycle {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    this.queue = Promise.resolve();
  }

  serial(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async timed(phases, stage, operation) {
    const start = performance.now();
    try {
      const value = await operation();
      phases.push({ stage, ms: Math.round(performance.now() - start), result: "ok" });
      return value;
    } catch (error) {
      phases.push({ stage, ms: Math.round(performance.now() - start), result: "failed" });
      throw error;
    }
  }

  fetch(request) {
    return this.serial(async () => {
      const phases = [];
      let response;
      try { response = await this.handle(request, phases); }
      catch { response = json({ ok: false, message: "图片存储暂不可用，请稍后重试" }, 503); }
      const headers = new Headers(response.headers);
      headers.set("x-image-phases", JSON.stringify(phases.slice(0, 16)));
      return new Response(response.body, { status: response.status, headers });
    });
  }

  async getSnapshot(phases) {
    const local = await this.storage.get("snapshot");
    if (local !== undefined) return local;
    const { CUSTOMER_ID: id, DREAM_MEMORY_STORE: kv } = this.env;
    const existing = await this.timed(phases, "kv-read", () => kv.get(id + "/site.json", { type: "json" }));
    const stable = existing ?? null;
    await this.storage.put("snapshot", stable);
    return stable;
  }

  async handle(request, phases) {
    const { CUSTOMER_ID: id, PAGES_PROJECT_NAME: projectName, DREAM_MEMORY_STORE: kv } = this.env;
    if (!id || !projectName || request.headers.get("x-site-id") !== id) return json({ ok: false }, 403);
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const key = url.searchParams.get("id");
    const entry = key && ownsImageKey(key, id) ? "image/" + key : null;
    if (url.pathname === "/read" && request.method === "GET") return json({ data: await this.getSnapshot(phases) });
    if (url.pathname === "/visible" && request.method === "GET" && entry) {
      const item = await this.storage.get(entry);
      const hidden = item && (["collect", "deleted"].includes(item.status) || (item.status === "draft" && item.due <= Date.now()));
      return new Response(null, { status: hidden ? 404 : 204, headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/upload" && request.method === "POST" && entry) {
      const bytes = await request.arrayBuffer();
      const due = Date.now() + DRAFT_LIFETIME;
      await this.schedule(due);
      // Journal before the KV write, including possible success without a response.
      await this.storage.put(entry, { status: "draft", due, requestId });
      await this.timed(phases, "kv-write", () => kv.put(key, bytes, { metadata: { contentType: request.headers.get("content-type") } }));
      return json({ ok: true });
    }
    if (url.pathname !== "/save" || request.method !== "POST") return json({ ok: false }, 404);
    await this.finishSave(phases);
    const prior = await this.getSnapshot(phases);
    const next = await request.json();
    const expected = request.headers.get("if-match");
    if (expected !== null && expected !== (prior?.updatedAt ?? "")) {
      return json({ ok: false, message: "站点已在别处更新，请刷新读取最新内容后再保存" }, 409);
    }
    const previousKeys = imageReferences(prior, id, projectName);
    const nextKeys = imageReferences(next, id, projectName);
    for (const image of nextKeys) {
      if (previousKeys.has(image)) continue;
      const item = await this.storage.get("image/" + image);
      const eligible = !item || (item.status === "draft" && item.due > Date.now());
      const photo = eligible && await this.timed(phases, "kv-read", () => kv.getWithMetadata(image, { type: "arrayBuffer" }));
      if (!photo?.value) {
        return json({ ok: false, message: "保存中包含已失效的图片，请重新上传" }, 409);
      }
    }
    await this.schedule(Date.now() + RETRY_DELAY);
    await this.storage.put("pending", { next, requestId, added: [...nextKeys], removed: [...previousKeys].filter((image) => !nextKeys.has(image)) });
    await this.finishSave(phases);
    await this.collect(phases);
    return json({ ok: true, revision: next.updatedAt });
  }

  async schedule(at) {
    const current = await this.storage.getAlarm();
    if (!current || current > at) await this.storage.setAlarm(at);
  }

  async finishSave(phases) {
    const pending = await this.storage.get("pending");
    if (!pending) return;
    const { CUSTOMER_ID: id, DREAM_MEMORY_STORE: kv } = this.env;
    const previousWrite = await this.storage.get("lastWrite") ?? 0;
    const wait = previousWrite + 1050 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    await this.timed(phases, "kv-write", () => kv.put(id + "/site.json", JSON.stringify(pending.next), {
      metadata: { contentType: "application/json; charset=utf-8" },
    }));
    await this.storage.transaction(async (transaction) => {
      for (const image of pending.added) await transaction.put("image/" + image, { status: "live" });
      for (const image of pending.removed) await transaction.put("image/" + image, { status: "collect", due: Date.now(), requestId: pending.requestId });
      await transaction.put("snapshot", pending.next);
      await transaction.put("lastWrite", Date.now());
      await transaction.delete("pending");
    });
  }

  async collect(phases, scheduled = false) {
    const { CUSTOMER_ID: id, PAGES_PROJECT_NAME: projectName, DREAM_MEMORY_STORE: kv } = this.env;
    const used = imageReferences(await this.getSnapshot(phases), id, projectName);
    const candidates = await this.storage.list({ prefix: "image/" });
    let attempted = 0;
    for (const [entry, item] of candidates) {
      if (!["draft", "collect"].includes(item.status)) continue;
      if (item.due > Date.now()) { await this.schedule(item.due); continue; }
      const key = entry.slice("image/".length);
      if (!ownsImageKey(key, id) || used.has(key)) continue;
      if (attempted >= 10) { await this.schedule(Date.now() + RETRY_DELAY); break; }
      attempted += 1;
      await this.storage.put(entry, { status: "collect", due: item.due, requestId: item.requestId });
      const start = performance.now();
      const phaseIndex = phases.length;
      let status = 204;
      try {
        await this.timed(phases, "kv-delete", () => kv.delete(key));
        await this.storage.put(entry, { status: "deleted" });
      } catch {
        status = 503;
        await this.schedule(Date.now() + RETRY_DELAY);
      }
      if (scheduled) await this.logRetry(item.requestId, status, start, phases.slice(phaseIndex));
    }
  }

  async logRetry(id, status, start, phases) {
    if (!this.env.DREAM_MEMORY_LOG_ENDPOINT && status < 400) return;
    const requestId = /^[0-9a-f-]{36}$/i.test(id ?? "") ? id : crypto.randomUUID();
    await publishEvent(this.env, { at: new Date().toISOString(), requestId, route: "image-reclaim", method: "ALARM",
      version: versionLabel(this.env), status, durationMs: elapsed(start), phases });
  }

  alarm() {
    return this.serial(async () => {
      const phases = [];
      const pending = await this.storage.get("pending");
      const start = performance.now();
      try {
        await this.finishSave(phases);
        if (pending) await this.logRetry(pending.requestId, 200, start, phases);
        await this.collect([], true);
      } catch {
        if (pending) await this.logRetry(pending.requestId, 503, start, phases);
        await this.schedule(Date.now() + RETRY_DELAY);
      }
    });
  }
}

export default { fetch: () => new Response(null, { status: 404 }) };

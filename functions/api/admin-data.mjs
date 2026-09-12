import { assertRuntimeIdentity, isAuthorized, json, sanitizeStoredData, toCloudflareImageUrls } from "../../cloudflare/lib/http.mjs";

const MAX_DATA_BYTES = 2 * 1024 * 1024;

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return json({ ok: false, message: "密码不对" }, 401);
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  const stored = await env.DREAM_MEMORY_STORE.get(`${customerId}/site.json`, { type: "json" });
  if (!stored) return json({ ok: true, customerId, data: null });
  return json({ ok: true, customerId, data: toCloudflareImageUrls(sanitizeStoredData(stored, customerId)) });
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return json({ ok: false, message: "密码不对" }, 401);
  if (Number(request.headers.get("content-length") || 0) > MAX_DATA_BYTES) {
    return json({ ok: false, message: "保存内容过大" }, 413);
  }
  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_DATA_BYTES) return json({ ok: false, message: "保存内容过大" }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, message: "保存内容格式不正确" }, 400);
  }
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  const stored = { ...sanitizeStoredData(payload, customerId), updatedAt: new Date().toISOString() };
  await env.DREAM_MEMORY_STORE.put(`${customerId}/site.json`, JSON.stringify(stored), {
    metadata: { contentType: "application/json; charset=utf-8" },
  });
  return json({ ok: true });
}

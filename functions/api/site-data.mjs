import { assertRuntimeIdentity, json, sanitizeStoredData, toCloudflareImageUrls } from "../../cloudflare/lib/http.mjs";

export async function onRequestGet({ request, env }) {
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  const stored = await env.DREAM_MEMORY_STORE.get(`${customerId}/site.json`, { type: "json" });
  if (!stored) return json({ ok: true, customerId, data: null });
  return json({ ok: true, customerId, data: toCloudflareImageUrls(sanitizeStoredData(stored, customerId)) });
}

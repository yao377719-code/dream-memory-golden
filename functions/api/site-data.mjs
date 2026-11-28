import { readSiteSnapshot } from "../../cloudflare/lib/site-snapshot.mjs";
import { assertRuntimeIdentity, json, sanitizeStoredData, toCloudflareImageUrls } from "../../cloudflare/lib/http.mjs";

export async function onRequestGet({ request, env, data }) {
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  const stored = await readSiteSnapshot(env, data, customerId);
  if (!stored) return json({ ok: true, customerId, data: null });
  return json({ ok: true, customerId, data: toCloudflareImageUrls(sanitizeStoredData(stored, customerId)) });
}

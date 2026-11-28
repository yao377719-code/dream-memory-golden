import { json } from "./http.mjs";
import { lifecycleRequest, lifecycleStub } from "./image-lifecycle.mjs";
import { measure } from "./telemetry.mjs";

export async function imageLifecycleCall(env, data, customerId, endpoint, options) {
  const stub = lifecycleStub(env, customerId);
  if (!stub) return null;
  const headersForWorker = { ...options?.headers };
  if (data?.trace?.requestId) headersForWorker["x-request-id"] = data.trace.requestId;
  const result = await measure(data, "image-lifecycle", () => lifecycleRequest(stub, endpoint, customerId, { ...options, headers: headersForWorker }));
  const phases = result.headers.get("x-image-phases");
  if (data?.trace && phases) data.trace.phases.push(...JSON.parse(phases));
  const headers = new Headers(result.headers);
  headers.delete("x-image-phases");
  return new Response(result.body, { status: result.status, headers });
}

export async function readSiteSnapshot(env, data, customerId) {
  const result = await imageLifecycleCall(env, data, customerId, "/read");
  if (result) {
    if (!result.ok) throw new Error("Unable to read managed site data");
    return (await result.json()).data;
  }
  return measure(data, "kv-read", () => env.DREAM_MEMORY_STORE.get(customerId + "/site.json", { type: "json" }));
}

export async function saveSiteSnapshot(env, data, customerId, stored, revision) {
  const body = JSON.stringify(stored);
  const result = await imageLifecycleCall(env, data, customerId, "/save", {
    method: "POST", body, headers: revision === null ? {} : { "if-match": revision },
  });
  if (result) return result;
  await measure(data, "kv-write", () => env.DREAM_MEMORY_STORE.put(customerId + "/site.json", body, {
    metadata: { contentType: "application/json; charset=utf-8" },
  }));
  return json({ ok: true, revision: stored.updatedAt });
}

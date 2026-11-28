import { measure } from "../../cloudflare/lib/telemetry.mjs";
import { imageLifecycleCall } from "../../cloudflare/lib/site-snapshot.mjs";
import { assertRuntimeIdentity } from "../../cloudflare/lib/http.mjs";

export async function onRequestGet({ request, env, data }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  if (!id.startsWith(`${customerId}/`)) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const visible = await imageLifecycleCall(env, data, customerId, "/visible?id=" + encodeURIComponent(id));
  if (visible && !visible.ok) return visible;
  const result = await measure(data, "kv-read", () => env.DREAM_MEMORY_STORE.getWithMetadata(id, { type: "arrayBuffer" }));
  if (!result?.value) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const fallbackContentType = id.toLowerCase().endsWith(".png")
    ? "image/png"
    : id.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const headers = new Headers({
    "content-type": result.metadata?.contentType || fallbackContentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  return new Response(result.value, { headers });
}

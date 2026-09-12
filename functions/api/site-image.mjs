import { assertRuntimeIdentity } from "../../cloudflare/lib/http.mjs";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  if (!id.startsWith(`${customerId}/`)) return new Response("Not found", { status: 404 });
  const result = await env.DREAM_MEMORY_STORE.getWithMetadata(id, { type: "arrayBuffer" });
  if (!result?.value) return new Response("Not found", { status: 404 });
  const fallbackContentType = id.toLowerCase().endsWith(".png")
    ? "image/png"
    : id.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const headers = new Headers({
    "content-type": result.metadata?.contentType || fallbackContentType,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  return new Response(result.value, { headers });
}

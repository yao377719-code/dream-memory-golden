import { elapsed, publishEvent, versionLabel } from "../../cloudflare/lib/telemetry.mjs";
const ROUTES = new Map([
  ["/api/site-data", "public-data"], ["/api/admin-data", "admin-data"],
  ["/api/admin-image", "image-upload"], ["/api/site-image", "image-read"],
  ["/api/music-resolve", "music-resolve"],
]);

export async function onRequest(context) {
  const route = ROUTES.get(new URL(context.request.url).pathname.replace(/\/$/, ""));
  if (!route) return context.next();
  const start = performance.now();
  const requestId = crypto.randomUUID();
  const trace = { requestId, phases: [] };
  context.data.trace = trace;
  let response;
  try {
    response = await context.next();
  } catch {
    response = Response.json({ ok: false, message: "请求失败，请稍后重试", requestId }, {
      status: 500, headers: { "cache-control": "no-store" },
    });
  }
  const durationMs = elapsed(start);
  const event = {
    at: new Date().toISOString(), requestId, route,
    method: ["GET", "POST"].includes(context.request.method) ? context.request.method : "OTHER",
    version: versionLabel(context.env),
    status: response.status, durationMs, phases: trace.phases,
  };
  if (response.status >= 400 || durationMs >= 800 || trace.phases.some((item) => item.result === "failed") || Math.random() < 0.05) {
    context.waitUntil(publishEvent(context.env, event));
  }
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

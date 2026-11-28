export function elapsed(start) {
  return Math.round((performance.now() - start) * 10) / 10;
}

export async function measure(data, stage, action) {
  if (!data?.trace) return action();
  const start = performance.now();
  try {
    const value = await action();
    data.trace.phases.push({ stage, ms: elapsed(start), result: value instanceof Response ? value.status : "ok" });
    return value;
  } catch (error) {
    data.trace.phases.push({ stage, ms: elapsed(start), result: error?.name === "AbortError" ? "timeout" : "failed" });
    throw error;
  }
}

export function versionLabel(env) {
  const version = String(env.DREAM_MEMORY_VERSION || "");
  return /^[0-9a-f]{7,40}$/i.test(version) ? version : "unknown";
}

export async function publishEvent(env, event) {
  const sink = env.DREAM_MEMORY_LOG_ENDPOINT;
  const token = env.DREAM_MEMORY_LOG_TOKEN;
  let endpoint;
  try { endpoint = sink && new URL(sink); } catch { endpoint = undefined; }
  const secure = endpoint?.protocol === "https:";
  const isolated = env.DREAM_MEMORY_LOG_LOCAL === "1" && endpoint?.protocol === "http:" && endpoint.hostname === "127.0.0.1";
  if (!(secure || isolated) || !token || endpoint.username || endpoint.password) {
    console.log(JSON.stringify(event));
    return;
  }
  try {
    const delivery = await fetch(endpoint, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(4000),
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(event),
    });
    if (delivery.ok) return;
  } catch { /* The request still completes if the collector is unavailable. */ }
  console.warn(JSON.stringify({ requestId: event.requestId, logDelivery: "failed" }));
}

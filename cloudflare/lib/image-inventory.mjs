import { imageReferences, ownsImageKey } from "./image-lifecycle.mjs";
import { readSiteSnapshot } from "./site-snapshot.mjs";
import { measure } from "./telemetry.mjs";

export async function listImageCandidates(env, data, identity, cursor) {
  const { customerId, projectName } = identity;
  const snapshot = await readSiteSnapshot(env, data, customerId);
  const used = imageReferences(snapshot, customerId, projectName);
  const kv = env.DREAM_MEMORY_STORE;
  const page = await measure(data, "kv-list", () => kv.list({ prefix: customerId + "/", limit: 20, ...(cursor ? { cursor } : {}) }));
  const candidates = [];
  for (const key of page.keys) {
    if (!ownsImageKey(key.name, customerId) || used.has(key.name)) continue;
    const result = await measure(data, "kv-read", () => kv.getWithMetadata(key.name, { type: "arrayBuffer" }));
    const storedBytes = result?.value?.byteLength ?? null;
    candidates.push({ key: key.name, storedBytes, createdAt: new Date(Number(key.name.slice(customerId.length + 1, customerId.length + 14))).toISOString() });
  }
  return { candidates, estimatedBytes: candidates.reduce((bytes, item) => bytes + (item.storedBytes ?? 0), 0),
    unknownSizes: candidates.filter((item) => item.storedBytes === null).length,
    nextCursor: page.list_complete ? null : page.cursor };
}

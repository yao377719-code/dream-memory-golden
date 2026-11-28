import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import test from "node:test";
import { ImageLifecycle } from "../cloudflare/image-lifecycle-worker.mjs";
import { imageReferences } from "../cloudflare/lib/image-lifecycle.mjs";

const customerId = "customer-test-a1b2c3";
const project = "dream-memory-test-a1b2c3";
const base = "https://" + project + ".pages.dev";
const imageKey = customerId + "/1795795200000-213a4f34-edd4-4ebe-9ef5-e3dfe64aa710.png";
const imagePath = "/api/site-image?id=" + encodeURIComponent(imageKey);
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

const worker = [
  'import { onRequestGet as getPublic } from "./functions/api/site-data.mjs";',
  'import { onRequestGet as getImage } from "./functions/api/site-image.mjs";',
  'import { onRequestPost as upload } from "./functions/api/admin-image.mjs";',
  'import { onRequestPost as save } from "./functions/api/admin-data.mjs";',
  'const routes = {"/api/site-data":getPublic,"/api/site-image":getImage,"/api/admin-image":upload,"/api/admin-data":save};',
  'export default {fetch(request,env){return routes[new URL(request.url).pathname]({request,env,data:{}});}};',
].join("\n");
const modules = async (options) => [{ type: "ESModule", path: options.entryPoints ? "lifecycle.mjs" : "pages.mjs",
  contents: (await build({ ...options, bundle: true, write: false, format: "esm" })).outputFiles[0].text }];

test("real isolated KV and Durable Object retain shared images, remove the last reference and reject stale saves", async () => {
  const common = { compatibilityDate: "2026-07-10", kvNamespaces: { DREAM_MEMORY_STORE: "synthetic-image-store" },
    bindings: { CUSTOMER_ID: customerId, PAGES_PROJECT_NAME: project } };
  const miniflare = new Miniflare({
    workers: [
      { ...common, name: "pages", bindings: { ...common.bindings, ADMIN_PASSWORD: "010011" },
        durableObjects: { DREAM_MEMORY_IMAGE_LIFECYCLE: { className: "ImageLifecycle", scriptName: "image-worker" } },
        modules: await modules({ stdin: { contents: worker, resolveDir: process.cwd() } }) },
      { ...common, name: "image-worker", durableObjects: { INSTANCE: { className: "ImageLifecycle", useSQLite: true } },
        modules: await modules({ entryPoints: ["cloudflare/image-lifecycle-worker.mjs"] }) },
    ],
  });
  const post = (pathname, payload) => miniflare.dispatchFetch(base + pathname,
    { method: "POST", headers: { "x-admin-password": "010011" }, body: JSON.stringify(payload) });
  try {
    const uploaded = await post("/api/admin-image", { imageData: "data:image/png;base64," + png });
    assert.equal(uploaded.status, 200);
    const { image } = await uploaded.json();
    assert.equal((await post("/api/admin-data", { galleryDraft: { image }, profile: { cover: base + image } })).status, 200);
    assert.equal((await post("/api/admin-data", { galleryDraft: { images: [{ image, categoryKey: "uncategorized" }] } })).status, 200);
    const shared = await miniflare.dispatchFetch(base + image);
    assert.equal(shared.status, 200);
    assert.equal(shared.headers.get("cache-control"), "no-store");
    await shared.arrayBuffer();
    assert.equal((await post("/api/admin-data", { galleryDraft: { images: [] } })).status, 200);
    const removed = await miniflare.dispatchFetch(base + image);
    assert.equal(removed.status, 404);
    assert.equal(removed.headers.get("cache-control"), "no-store");
    const kv = await miniflare.getKVNamespace("DREAM_MEMORY_STORE", "pages");
    assert.equal(await kv.get(new URL(image, base).searchParams.get("id"), "arrayBuffer"), null);
    assert.equal((await post("/api/admin-data", { profile: { cover: image } })).status, 409);
    const publicData = await (await miniflare.dispatchFetch(base + "/api/site-data")).json();
    assert.equal(publicData.data.galleryDraft.images.length, 0);
  } finally {
    await miniflare.dispose();
  }
});

test("failed site writes retain prior images; expired drafts and failed deletes are retried", async () => {
  const data = new Map();
  let alarm = null;
  const storage = {
    get: async (key) => data.get(key), put: async (key, value) => data.set(key, value),
    delete: async (key) => data.delete(key),
    getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; },
    list: async ({ prefix }) => new Map([...data].filter(([key]) => key.startsWith(prefix))),
    transaction: async (callback) => callback(storage),
  };
  let failPut = true;
  let failDelete = true;
  const deletes = [];
  const orphan = imageKey.replace("213a", "913a");
  await storage.put("image/" + orphan, { status: "draft", due: Date.now() - 5 });
  const lifecycle = new ImageLifecycle({ storage }, {
    CUSTOMER_ID: customerId, PAGES_PROJECT_NAME: project,
    DREAM_MEMORY_STORE: {
      get: async () => ({ galleryDraft: { items: [{ image: imagePath }] } }),
      put: async () => { if (failPut) throw new Error("test write failed"); },
      delete: async (key) => { if (failDelete) throw new Error("test delete failed"); deletes.push(key); },
    },
  });
  const save = (payload) => lifecycle.fetch(new Request("https://images.internal/save",
    { method: "POST", body: JSON.stringify(payload), headers: { "x-site-id": customerId } }));
  const visible = () => lifecycle.fetch(new Request("https://images.internal/visible?id=" + encodeURIComponent(imageKey),
    { headers: { "x-site-id": customerId } }));
  assert.equal((await save({ galleryDraft: { images: [] } })).status, 503);
  assert.equal((await visible()).status, 204);
  assert.deepEqual(deletes, []);
  failPut = false;
  await lifecycle.alarm();
  assert.equal((await visible()).status, 404);
  assert.deepEqual(deletes, []);
  failDelete = false;
  await lifecycle.alarm();
  assert.deepEqual(new Set(deletes), new Set([imageKey, orphan]));
  await lifecycle.alarm();
  assert.equal(deletes.length, 2);
  assert.deepEqual([...imageReferences({ text: "See (" + base + imagePath + ")", foreign: "https://elsewhere.invalid" + imagePath }, customerId, project)], [imageKey]);
});

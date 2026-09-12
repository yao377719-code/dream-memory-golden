import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGalleryDraft, sanitizeStoredData } from "../cloudflare/lib/http.mjs";
import { onRequestPost as uploadImage } from "../functions/api/admin-image.mjs";

test("normalizes legacy single-image gallery data without losing the image", () => {
  assert.deepEqual(normalizeGalleryDraft("/uploads/direct-string.jpg").images, [
    { image: "/uploads/direct-string.jpg" },
  ]);
  assert.deepEqual(normalizeGalleryDraft({ image: "/uploads/legacy.jpg" }).images, [
    { image: "/uploads/legacy.jpg" },
  ]);
  assert.deepEqual(normalizeGalleryDraft({ images: "/uploads/legacy-string.jpg" }).images, [
    { image: "/uploads/legacy-string.jpg" },
  ]);
});

test("keeps ordered gallery arrays and supports old string entries", () => {
  const normalized = normalizeGalleryDraft({
    images: [
      "/uploads/first.jpg",
      { image: "/uploads/second.jpg", title: "第二张" },
      { image: "" },
      null,
    ],
  });
  assert.deepEqual(normalized.images, [
    { image: "/uploads/first.jpg" },
    { image: "/uploads/second.jpg", title: "第二张" },
  ]);
});

test("API boundary always returns an image array and preserves existing metadata", () => {
  const safe = sanitizeStoredData({
    galleryDraft: {
      image: "/uploads/old.jpg",
      caption: "旧格式仍保留",
    },
  }, "customer-test");
  assert.equal(safe.galleryDraft.caption, "旧格式仍保留");
  assert.deepEqual(safe.galleryDraft.images, [{ image: "/uploads/old.jpg" }]);
  assert.equal(safe.customerId, "customer-test");
});

test("same-name image uploads receive unique object paths", async () => {
  const storedIds = [];
  const env = {
    ADMIN_PASSWORD: "secret",
    CUSTOMER_ID: "customer-test",
    PAGES_PROJECT_NAME: "dream-memory-test-a1b2c3",
    DREAM_MEMORY_STORE: {
      async put(id) {
        storedIds.push(id);
      },
    },
  };
  const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const makeRequest = () => new Request("https://example.test/api/admin-image", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-password": "secret" },
    body: JSON.stringify({ imageData, fileName: "same-name.png" }),
  });

  const first = await uploadImage({ request: makeRequest(), env });
  const second = await uploadImage({ request: makeRequest(), env });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(storedIds.length, 2);
  assert.notEqual(storedIds[0], storedIds[1]);
  assert.match(storedIds[0], /^customer-test\/\d+-[0-9a-f-]+\.png$/);
});

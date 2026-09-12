import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blank customers start with the four required empty album sections", async () => {
  const source = await readFile(new URL("../src/data/siteDefaults.ts", import.meta.url), "utf8");
  const expected = [
    ["daily", "日常", 1],
    ["together", "合照", 2],
    ["goods", "谷子", 3],
    ["artwork", "稿件", 4],
  ];
  for (const [key, title, order] of expected) {
    assert.match(source, new RegExp(`key: "${key}", title: "${title}", order: ${order}, cover: ""`));
  }
});

test("gallery renders category sections directly without cover-entry cards", async () => {
  const source = await readFile(new URL("../src/components/GalleryCategories.astro", import.meta.url), "utf8");
  assert.match(source, /class="category-detail-panel"/);
  assert.match(source, /class="goods-grid"/);
  assert.doesNotMatch(source, /category-entry-card/);
  assert.doesNotMatch(source, /还没有分类/);
});

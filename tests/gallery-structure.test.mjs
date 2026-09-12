import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blank customers start with four editable empty gallery categories", async () => {
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

test("gallery retains the bfab755 compact-entry DOM and click interaction", async () => {
  const source = await readFile(new URL("../src/components/GalleryCategories.astro", import.meta.url), "utf8");
  assert.match(source, /class="category-entry-grid" data-category-entry-grid/);
  assert.match(source, /class="category-entry-card"/);
  assert.match(source, /data-open-category=\{category\.key\}/);
  assert.match(source, /function openCategory\(key\)/);
  assert.match(source, /class="category-detail-panel"/);
  assert.match(source, /class="goods-grid"/);
  assert.match(source, /root\?\.querySelectorAll\("\[data-category-panel\]"\)/);
});

function gitBlobHash(source) {
  return createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest("hex");
}

test("gallery frontend source matches bfab755 except blank-category integration and TS annotations", async () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  const css = await read("styles/global.css");
  const album = await read("pages/album.astro");
  const index = (await read("pages/index.astro")).replace(/^    \/\/ @ts-nocheck\r?\n/gm, "");
  let component = await read("components/GalleryCategories.astro");
  component = component.replace('import { defaultGalleryCategories, isBlankCustomerMode } from "../data/siteDefaults";', 'import { isBlankCustomerMode } from "../data/siteDefaults";');
  component = component.replace('const categories = isBlankCustomerMode\n  ? defaultGalleryCategories.map((data) => ({ id: data.key, data }))\n  : (await getCollection("galleryCategories")).sort((a, b) => a.data.order - b.data.order);', 'const categories = (await getCollection("galleryCategories")).sort((a, b) => a.data.order - b.data.order);');
  component = component.replace('      <>\n        <p class="empty">还没有分类，可以先在后台新增相册分类。</p>\n        <div class="category-entry-grid" data-category-entry-grid></div>\n        <div class="category-detail-wrap"></div>\n      </>', '      <p class="empty">还没有分类，可以先在后台新增相册分类。</p>');
  assert.equal(gitBlobHash(css), "c56474f7c1222a0c0283105a5c4dc57fa5da01e1");
  assert.equal(gitBlobHash(album), "74ab87d8fec177debfbff3ace0eef7135f3560a3");
  assert.equal(gitBlobHash(index), "373d882353c5d8af0da69323afeae38f55d9a91e");
  assert.equal(gitBlobHash(component), "eb3c95ec20d287b8797f2ece6d7e81cce094c35a");
});

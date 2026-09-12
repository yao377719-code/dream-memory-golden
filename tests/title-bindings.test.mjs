import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { editableTitlePathList, editableTitlePaths } from "../src/data/editableTitles.mjs";

const expectedPaths = {
  site: "profile.nickname",
  about: "modules.aboutTitle",
  music: "profile.musicModuleTitle",
  story: "modules.storyTitle",
  gallery: "modules.galleryTitle",
  admin: "modules.adminTitle",
  albumPage: "modules.albumPageTitle",
  quote: "modules.quoteTitle",
  anniversary: "modules.anniversaryTitle",
  calendar: "modules.calendarTitle",
};

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("editable title paths are unique and stable", () => {
  assert.deepEqual(editableTitlePaths, expectedPaths);
  assert.equal(new Set(editableTitlePathList).size, editableTitlePathList.length);
});

test("every editable title uses the shared admin field mapping", async () => {
  const admin = await source("src/pages/admin.astro");
  for (const key of Object.keys(expectedPaths)) {
    assert.match(admin, new RegExp(`name=\\{editableTitlePaths\\.${key}\\}`));
  }
});

test("all front-end title positions opt into cloud text binding", async () => {
  const files = await Promise.all([
    source("src/layouts/BaseLayout.astro"),
    source("src/pages/index.astro"),
    source("src/pages/album.astro"),
    source("src/pages/story/[id].astro"),
    source("src/components/AboutUs.astro"),
    source("src/components/GlobalMusicPlayer.astro"),
    source("src/components/RandomQuote.astro"),
  ]);
  const allFrontEndSources = files.join("\n");
  for (const key of ["site", "about", "music", "story", "admin", "quote", "anniversary", "calendar"]) {
    assert.match(allFrontEndSources, new RegExp(`data-cloud-text=\\{editableTitlePaths\\.${key}\\}`));
  }
  assert.match(allFrontEndSources, /titlePath=\{editableTitlePaths\.gallery\}/);
  assert.match(allFrontEndSources, /titlePath=\{editableTitlePaths\.albumPage\}/);
  assert.match(allFrontEndSources, /cloudTitlePath=\{editableTitlePaths\.site\}/);
  assert.match(allFrontEndSources, /cloudTitlePath=\{editableTitlePaths\.albumPage\}/);
  assert.match(files[0], /function applyCloudTextBindings\(data\)/);
  assert.doesNotMatch(files[1], /data-mini-title data-cloud-text/);
});

test("front-end module headings do not repeat default-title fallbacks", async () => {
  const frontEndSources = (
    await Promise.all([
      source("src/pages/index.astro"),
      source("src/pages/album.astro"),
      source("src/pages/story/[id].astro"),
      source("src/components/AboutUs.astro"),
      source("src/components/GlobalMusicPlayer.astro"),
      source("src/components/RandomQuote.astro"),
    ])
  ).join("\n");
  for (const fallback of ["我们的故事", "周边与相册", "关于我们", "管理入口", "想对你说：", "纪念日", "小日历"]) {
    assert.doesNotMatch(frontEndSources, new RegExp(`\\|\\|\\s*[\"']${fallback}`));
  }
});

test("story and gallery images keep readable resolution and original-image access", async () => {
  const [admin, styles] = await Promise.all([
    source("src/pages/admin.astro"),
    source("src/styles/global.css"),
  ]);
  const gallery = await source("src/components/GalleryCategories.astro");
  assert.equal((admin.match(/maxSize: 6000,/g) || []).length, 3);
  assert.equal((admin.match(/quality: 0\.9,/g) || []).length, 3);
  assert.equal((admin.match(/preserveOriginal: true,/g) || []).length, 3);
  assert.match(admin, /source\.size <= maxUploadImageBytes/);
  assert.match(admin, /targetCompressedImageBytes/);
  assert.match(admin, /context\.imageSmoothingQuality = "high"/);
  assert.match(styles, /\.image-grid\.story-detail-images\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.image-grid\.story-detail-images img\s*\{[^}]*aspect-ratio:\s*auto[^}]*object-fit:\s*contain/s);
  assert.match(gallery, /data-gallery-original/);
  assert.match(gallery, /originalLink\.href = photo\.image/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("public pages stay behind a neutral initialization gate until customer data is applied", async () => {
  const [layout, home, album] = await Promise.all([
    read("src/layouts/BaseLayout.astro"),
    read("src/pages/index.astro"),
    read("src/pages/album.astro"),
  ]);

  assert.match(layout, /data-site-init="loading"/);
  assert.match(layout, /html\[data-site-init="loading"\] \.site-shell[\s\S]*?visibility:\s*hidden/);
  assert.match(layout, /background:\s*#f3f4f6/);
  assert.match(layout, /__dreamSiteDataPromise/);
  assert.match(layout, /__dreamRegisterSiteInitializer/);
  assert.match(layout, /data-site-bootstrap-retry/);
  assert.match(layout, /setSiteInitState\("error"/);
  assert.equal((layout.match(/fetch\("\/api\/site-data"/g) || []).length, 1);
  assert.doesNotMatch(home, /fetch\("\/api\/site-data"/);
  assert.doesNotMatch(album, /fetch\("\/api\/site-data"/);
  assert.match(home, /__dreamRegisterSiteInitializer/);
  assert.match(album, /__dreamRegisterSiteInitializer/);
});

test("admin login and authenticated UI use the same loading and failure gate", async () => {
  const admin = await read("src/pages/admin.astro");

  assert.match(admin, /data-admin-init="loading"/);
  assert.match(admin, /<style is:inline>[\s\S]*?html\[data-admin-init="loading"\] \[data-login\]/);
  assert.match(admin, /html\[data-admin-init="loading"\] \[data-login\]/);
  assert.match(admin, /html\[data-admin-init="loading"\] \[data-admin\]/);
  assert.match(admin, /data-admin-bootstrap-retry/);
  assert.match(admin, /AbortController/);
  assert.match(admin, /cloudLoadFailure = "network"/);
  assert.match(admin, /setAdminInitState\(\s*"error"/);
  assert.match(admin, /revealInitializedAdmin/);
});

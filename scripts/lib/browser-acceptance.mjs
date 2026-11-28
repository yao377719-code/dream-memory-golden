import assert from "node:assert/strict";
import { chromium } from "playwright";

export async function verifyBrowserAvailable() {
  const browser = await chromium.launch({ headless: true, channel: process.env.GOLDEN_BROWSER_CHANNEL || undefined });
  await browser.close();
}

export async function assertBrowserLayout(page, { front, label }) {
  const actual = await page.evaluate(({ front }) => {
    const anchor = document.querySelector(front ? ".hero" : "[data-admin]");
    const style = anchor && getComputedStyle(anchor);
    const urls = [...document.querySelectorAll('link[rel="stylesheet"][href*="/_astro/"]')].map((node) => node.href);
    return {
      urls,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      styled: !!style && (front ? style.position === "relative" : parseFloat(style.maxWidth) > 0),
    };
  }, { front });
  assert.ok(actual.urls.length, `${label}: no bundled stylesheet linked`);
  for (const url of actual.urls) {
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, `${label}: stylesheet request failed`);
    assert.match(response.headers()["content-type"] ?? "", /^text\/css\b/i, `${label}: stylesheet response is not CSS`);
    assert.ok((await response.body()).length > 100, `${label}: stylesheet is empty`);
  }
  assert.ok(actual.styled, `${label}: expected CSS was not applied`);
  assert.ok(actual.documentWidth <= actual.viewportWidth + 1, `${label}: horizontal overflow (${actual.documentWidth} > ${actual.viewportWidth})`);
  assert.ok(Math.abs(actual.viewportWidth - page.viewportSize().width) <= 1, `${label}: document does not use the expected viewport`);
}

export async function acceptBlankBrowser({ url, password }) {
  const browser = await chromium.launch({ headless: true, channel: process.env.GOLDEN_BROWSER_CHANNEL || undefined });
  try {
    for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
      const mobile = viewport.width < 600;
      const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
      const label = String(viewport.width);
      try {
        await page.goto(new URL("/", url).href, { waitUntil: "domcontentloaded" });
        await page.locator('html[data-site-init="ready"]').waitFor({ timeout: 30000 });
        const cards = page.locator('[data-gallery-module="home-gallery"] .category-entry-card');
        assert.equal(await cards.count(), 4, `${label}: blank gallery must have four cards`);
        assert.deepEqual((await cards.locator("strong").allTextContents()).map((item) => item.replace(/\s+/g, "")), ["日常", "合照", "谷子", "稿件"]);
        assert.deepEqual((await cards.locator("small").allTextContents()).map((item) => item.trim().slice(-2)), ["0张", "0张", "0张", "0张"]);
        await assertDecodedImages(page, '[data-gallery-module="home-gallery"] .category-entry-card img');
        const hero = page.locator(".hero");
        const bounds = await hero.boundingBox();
        assert.ok(bounds && bounds.width > viewport.width * 0.6 && bounds.width <= viewport.width + 1 && bounds.height >= 100,
          `${label}: hero dimensions invalid: ${JSON.stringify(bounds)}`);
        await assertBrowserLayout(page, { front: true, label: `${label} front` });
        await page.goto(new URL("/admin/", url).href, { waitUntil: "domcontentloaded" });
        const login = async () => {
          await page.getByLabel("后台密码").fill(password);
          await page.getByRole("button", { name: "进入", exact: true }).click();
          await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
        };
        await login();
        await assertBrowserLayout(page, { front: false, label: `${label} admin` });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
        await page.locator("[data-logout]").click();
        await page.locator("[data-login]").waitFor({ state: "visible", timeout: 30000 });
        await login();
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}


export async function assertDecodedImages(page, selector) {
  const images = await page.locator(selector).all();
  assert.ok(images.length, "key images are missing");
  for (const image of images) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => node.decode());
    const size = await image.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(size && size.width >= 32 && size.height >= 32 && size.width <= viewport.width, "invalid key image size");
  }
}

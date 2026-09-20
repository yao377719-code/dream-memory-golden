import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium, request as playwrightRequest } from "playwright";

const siteUrl = String(process.env.GOLDEN_TEST_URL || "").replace(/\/$/, "");
const password = String(process.env.GOLDEN_ADMIN_PASSWORD || "");
const isolationUrl = String(process.env.GOLDEN_ISOLATION_URL || "").replace(/\/$/, "");
const outputDir = path.resolve(process.env.GOLDEN_ACCEPTANCE_OUTPUT || path.join(os.tmpdir(), "dream-memory-golden-acceptance"));

if (!siteUrl || !/^https?:\/\//.test(siteUrl)) throw new Error("GOLDEN_TEST_URL is required");
if (!/^\d{6}$/.test(password)) throw new Error("GOLDEN_ADMIN_PASSWORD must be a six-digit value");
if (!isolationUrl || !/^https?:\/\//.test(isolationUrl)) throw new Error("GOLDEN_ISOLATION_URL is required");
if (new URL(siteUrl).host === new URL(isolationUrl).host) throw new Error("GOLDEN_ISOLATION_URL must use a different test instance");

await mkdir(outputDir, { recursive: true });

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8DAwMDAxMDAwMAAAAwAAf8B9pUAAAAASUVORK5CYII=", "base64");
const marker = `GOLDEN-RC-${Date.now()}`;
const values = {
  nickname: `星海测试站 ${marker}`,
  role: `虚构角色甲 ❤ 虚构角色乙`,
  intro: `这是用于黄金框架验收的纯虚构介绍 ${marker}`,
  about: `两位虚构角色在星海车站相遇。${marker}`,
  story: `虚构故事 ${marker}`,
  quote: `愿每一颗虚构星星都被温柔看见。${marker}`,
  anniversary: `虚构纪念日 ${marker}`,
  gallery: `星海相册 ${marker}`,
};

const results = {
  fictionalData: false,
  profile: false,
  story: false,
  quote: false,
  anniversaryCalendar: false,
  music: false,
  theme: false,
  galleryRenameAddDeleteSort: false,
  singleUpload: false,
  batchUpload: false,
  refresh: false,
  logoutRelogin: false,
  wrongPassword: false,
  crossSiteIsolation: false,
  desktopScreenshots: false,
  mobileScreenshots: false,
  publicColdStartGate: false,
  adminColdStartGate: false,
  apiFailureRetry: false,
  consoleErrors: [],
};

function watchErrors(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") results.consoleErrors.push(`${label}:console:${message.text()}`);
  });
  page.on("pageerror", (error) => results.consoleErrors.push(`${label}:page:${error.message}`));
}

async function installFrameProbe(page) {
  await page.addInitScript(() => {
    window.__dreamAcceptanceFrames = [];
    const sample = () => {
      const shell = document.querySelector(".site-shell");
      const admin = document.querySelector("[data-admin]");
      const login = document.querySelector("[data-login]");
      window.__dreamAcceptanceFrames.push({
        siteInit: document.documentElement.dataset.siteInit || "",
        adminInit: document.documentElement.dataset.adminInit || "",
        shellVisible: Boolean(shell) && getComputedStyle(shell).visibility !== "hidden",
        adminVisible: Boolean(admin) && !admin.hidden && getComputedStyle(admin).visibility !== "hidden",
        loginVisible: Boolean(login) && !login.hidden && getComputedStyle(login).visibility !== "hidden",
      });
      if (window.__dreamAcceptanceFrames.length < 240) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function login(page) {
  await page.goto(`${siteUrl}/admin/`, { waitUntil: "networkidle" });
  if (await page.locator("[data-login]").isVisible()) {
    await page.getByLabel("后台密码").fill(password);
    await page.getByRole("button", { name: "进入", exact: true }).click();
  }
  await page.locator("[data-admin]").waitFor({ state: "visible", timeout: 30000 });
}

async function openTab(page, name) {
  await page.locator(`[data-tab="${name}"]`).click();
}

async function save(page) {
  const response = page.waitForResponse((item) => item.url().endsWith("/api/admin-data") && item.request().method() === "POST");
  await page.getByRole("button", { name: "保存到云端", exact: true }).click();
  assert.equal((await response).status(), 200);
}

async function assertNoPrematureVisibleFrame(page, type) {
  const frames = await page.evaluate(() => window.__dreamAcceptanceFrames || []);
  if (type === "site") {
    assert.equal(frames.some((frame) => frame.siteInit !== "ready" && frame.shellVisible), false, frames);
  } else {
    assert.equal(frames.some((frame) => frame.adminInit !== "ready" && (frame.adminVisible || frame.loginVisible)), false, frames);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await desktop.newPage();
  watchErrors(admin, "desktop-admin");
  await login(admin);

  await admin.locator('[name="profile.nickname"]').fill(values.nickname);
  await admin.locator('[name="profile.roleName"]').fill(values.role);
  await admin.locator('[name="profile.intro"]').fill(values.intro);
  await admin.locator('[name="profile.themeColor"]').selectOption("lavender");
  await admin.locator("[data-custom-theme-hex]").fill("#62A8C5");
  await admin.locator("[data-custom-theme-hex]").press("Enter");
  results.profile = true;
  results.theme = true;

  await openTab(admin, "about");
  await admin.locator('[name="about.storyIntro"]').fill(values.about);
  await admin.locator('[name="about.personAName"]').fill("虚构人物甲");
  await admin.locator('[name="about.personBName"]').fill("虚构人物乙");
  await admin.locator('[name="about.personABio"]').fill("虚构人物甲的介绍");
  await admin.locator('[name="about.personBBio"]').fill("虚构人物乙的介绍");

  await openTab(admin, "modules");
  await admin.locator('[name="modules.storyTitle"]').fill(`故事标题 ${marker}`);
  await admin.locator('[name="modules.galleryTitle"]').fill(values.gallery);
  await admin.locator('[name="modules.quoteTitle"]').fill(`星语 ${marker}`);
  await admin.locator('[name="modules.anniversaryTitle"]').fill(`星海纪念 ${marker}`);
  await admin.locator('[name="modules.calendarTitle"]').fill(`星历 ${marker}`);

  await openTab(admin, "music");
  await admin.locator('[name="profile.musicModuleTitle"]').fill(`虚构音乐 ${marker}`);
  await admin.locator('[name="profile.musicTitle"]').fill("虚构歌曲");
  await admin.locator('[name="profile.musicArtist"]').fill("虚构歌手");
  await admin.locator('[name="profile.musicUrl"]').fill("");
  results.music = true;

  await openTab(admin, "stories");
  await admin.locator("[data-story-date]").fill("2026-09-20");
  await admin.locator("[data-story-title]").fill(values.story);
  await admin.locator("[data-story-summary]").fill("虚构故事摘要");
  await admin.locator("[data-story-body]").fill("虚构故事正文，用于验证保存与刷新。");
  await admin.locator("[data-add-story]").click();
  assert.equal(await admin.locator('[data-story-manager] [data-story-edit="title"]').count(), 1);
  results.story = true;

  await openTab(admin, "quotes");
  await admin.locator("[data-quote-content]").fill(values.quote);
  await admin.locator("[data-quote-mood]").fill("虚构心情");
  await admin.locator("[data-add-quote]").click();
  assert.equal(await admin.locator('[data-quote-manager] [data-quote-edit="content"]').count(), 1);
  results.quote = true;

  await openTab(admin, "anniversaries");
  await admin.locator("[data-anniversary-title]").fill(values.anniversary);
  await admin.locator("[data-anniversary-date]").fill("2026-09-20");
  await admin.locator("[data-anniversary-calendar-text]").fill("星");
  await admin.locator("[data-anniversary-note]").fill("纯虚构纪念日备注");
  await admin.locator("[data-add-anniversary]").click();
  assert.equal(await admin.locator('[data-anniversary-manager] [data-anniversary-edit="title"]').count(), 1);
  results.anniversaryCalendar = true;

  await openTab(admin, "gallery");
  assert.ok(await admin.locator("[data-category-title]").count() >= 4);
  await admin.locator('[data-category-title="0"]').fill(`星海日常 ${marker}`);
  await admin.locator("[data-add-category]").click();
  const addedIndex = (await admin.locator("[data-category-title]").count()) - 1;
  await admin.locator(`[data-category-title="${addedIndex}"]`).fill("临时虚构分类");
  await admin.locator(`[data-move-category="up"][data-index="${addedIndex}"]`).click();
  const movedIndex = addedIndex - 1;
  assert.equal(await admin.locator(`[data-category-title="${movedIndex}"]`).inputValue(), "临时虚构分类");
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.locator(`[data-remove-category="${movedIndex}"]`).click();
  results.galleryRenameAddDeleteSort = true;

  await openTab(admin, "profile");
  await admin.locator('[data-image-input="profile.avatar"]').setInputFiles({ name: "fictional-avatar.png", mimeType: "image/png", buffer: png });
  await admin.waitForFunction(() => document.querySelector('[data-preview="profile.avatar"]')?.src.includes("/api/site-image"), null, { timeout: 60000 });
  results.singleUpload = true;

  await openTab(admin, "gallery");
  await admin.locator("[data-batch-category]").selectOption({ index: 0 });
  await admin.locator("[data-batch-input]").setInputFiles([
    { name: "fictional-gallery-a.png", mimeType: "image/png", buffer: png },
    { name: "fictional-gallery-b.png", mimeType: "image/png", buffer: png },
  ]);
  await admin.waitForFunction(() => document.querySelector("[data-batch-upload-status]")?.textContent.includes("已上传并保存 2 张图片"), null, { timeout: 60000 });
  results.batchUpload = true;
  await save(admin);
  results.fictionalData = true;

  await admin.screenshot({ path: path.join(outputDir, "desktop-admin.png"), fullPage: true });
  await admin.reload({ waitUntil: "networkidle" });
  await admin.locator("[data-admin]").waitFor({ state: "visible" });
  assert.equal(await admin.locator('[name="profile.nickname"]').inputValue(), values.nickname);
  results.refresh = true;

  const front = await desktop.newPage();
  watchErrors(front, "desktop-front");
  await front.goto(`${siteUrl}/`, { waitUntil: "networkidle" });
  await front.locator(".site-shell").waitFor({ state: "visible" });
  const frontText = await front.locator("body").innerText();
  for (const value of [values.nickname, values.role, values.intro, values.about, values.story, values.quote, values.anniversary, values.gallery]) {
    assert.ok(frontText.includes(value), value);
  }
  assert.equal(await front.locator('[data-gallery-module="home-gallery"] .goods-card').count(), 2);
  await front.screenshot({ path: path.join(outputDir, "desktop-front.png"), fullPage: true });
  results.desktopScreenshots = true;

  await admin.locator("[data-logout]").click();
  await admin.locator("[data-login]").waitFor({ state: "visible" });
  await admin.getByLabel("后台密码").fill(password);
  await admin.getByRole("button", { name: "进入", exact: true }).click();
  await admin.locator("[data-admin]").waitFor({ state: "visible" });
  results.logoutRelogin = true;

  const api = await playwrightRequest.newContext({ baseURL: siteUrl });
  assert.equal((await api.get("/api/admin-data", { headers: { "x-admin-password": `${password}x` } })).status(), 401);
  results.wrongPassword = true;
  const ownData = await (await api.get("/api/site-data")).json();
  const uploadedPath = ownData.data.galleryDraft.images[0].image;
  const isolatedApi = await playwrightRequest.newContext({ baseURL: isolationUrl });
  assert.equal((await isolatedApi.get("/api/admin-data", { headers: { "x-admin-password": password } })).status(), 401);
  assert.equal((await isolatedApi.get(uploadedPath)).status(), 404);
  const isolatedData = await (await isolatedApi.get("/api/site-data")).json();
  assert.notEqual(isolatedData.customerId, ownData.customerId);
  assert.equal(JSON.stringify(isolatedData.data || {}).includes(marker), false);
  results.crossSiteIsolation = true;
  await api.dispose();
  await isolatedApi.dispose();

  const cold = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const coldFront = await cold.newPage();
  watchErrors(coldFront, "cold-front");
  await installFrameProbe(coldFront);
  await coldFront.route("**/api/site-data", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await coldFront.goto(`${siteUrl}/?golden-cold=1`, { waitUntil: "domcontentloaded" });
  await coldFront.waitForTimeout(150);
  assert.equal(await coldFront.locator("[data-site-bootstrap]").isVisible(), true);
  assert.equal(await coldFront.locator(".site-shell").evaluate((node) => getComputedStyle(node).visibility), "hidden");
  await coldFront.waitForFunction(() => document.documentElement.dataset.siteInit === "ready", null, { timeout: 30000 });
  await assertNoPrematureVisibleFrame(coldFront, "site");
  results.publicColdStartGate = true;
  await cold.close();

  const adminCold = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const coldAdmin = await adminCold.newPage();
  watchErrors(coldAdmin, "cold-admin");
  await installFrameProbe(coldAdmin);
  await login(coldAdmin);
  await coldAdmin.route("**/api/admin-data", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await coldAdmin.reload({ waitUntil: "domcontentloaded" });
  await coldAdmin.waitForTimeout(150);
  assert.equal(await coldAdmin.locator("[data-admin-bootstrap]").isVisible(), true);
  assert.equal(await coldAdmin.locator("[data-admin]").evaluate((node) => getComputedStyle(node).visibility), "hidden");
  await coldAdmin.waitForFunction(() => document.documentElement.dataset.adminInit === "ready", null, { timeout: 30000 });
  await assertNoPrematureVisibleFrame(coldAdmin, "admin");
  results.adminColdStartGate = true;
  await adminCold.close();

  const failure = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const failedFront = await failure.newPage();
  await failedFront.route("**/api/site-data", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"message":"模拟服务不可用"}' }));
  await failedFront.goto(`${siteUrl}/?golden-failure=1`, { waitUntil: "domcontentloaded" });
  await failedFront.waitForFunction(() => document.documentElement.dataset.siteInit === "error");
  assert.equal(await failedFront.locator("[data-site-bootstrap-retry]").isVisible(), true);
  assert.match(await failedFront.locator("[data-site-bootstrap-message]").innerText(), /503|失败|不可用/);
  results.apiFailureRetry = true;
  await failure.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const mobileFront = await mobile.newPage();
  watchErrors(mobileFront, "mobile-front");
  await installFrameProbe(mobileFront);
  await mobileFront.goto(`${siteUrl}/`, { waitUntil: "networkidle" });
  await mobileFront.waitForFunction(() => document.documentElement.dataset.siteInit === "ready");
  await assertNoPrematureVisibleFrame(mobileFront, "site");
  await mobileFront.screenshot({ path: path.join(outputDir, "mobile-front.png"), fullPage: true });
  const mobileAdmin = await mobile.newPage();
  watchErrors(mobileAdmin, "mobile-admin");
  await installFrameProbe(mobileAdmin);
  await login(mobileAdmin);
  await assertNoPrematureVisibleFrame(mobileAdmin, "admin");
  await mobileAdmin.screenshot({ path: path.join(outputDir, "mobile-admin.png"), fullPage: true });
  results.mobileScreenshots = true;
  await mobile.close();

  assert.deepEqual(results.consoleErrors, []);
  await desktop.close();
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, "result.json"), `${JSON.stringify({ siteUrl, isolationUrl, marker, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputDir, results }, null, 2));

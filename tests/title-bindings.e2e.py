import json
import os
import re
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("TITLE_TEST_BASE_URL", "http://127.0.0.1:8788")
PASSWORD = os.environ["TITLE_TEST_PASSWORD"]

TITLES = {
    "profile.nickname": "首页 Title ✦",
    "modules.aboutTitle": "关于我们-TEST",
    "profile.musicModuleTitle": "Music Title TEST 🎵",
    "modules.storyTitle": "故事标题-TEST 🚀",
    "modules.galleryTitle": "相册标题-TEST ⟡",
    "modules.adminTitle": "后台入口-TEST",
    "modules.albumPageTitle": "Album  ✦  Page",
    "modules.quoteTitle": "语录标题-TEST 💬",
    "modules.anniversaryTitle": "纪念日标题-TEST",
    "modules.calendarTitle": "日历标题-TEST",
}


def text(page, selector):
    locator = page.locator(selector).first
    return locator.text_content().strip() if locator.count() else None


def login(page):
    page.goto(f"{BASE_URL}/admin/", wait_until="networkidle")
    if page.locator("[data-login]").is_visible():
        page.locator('input[name="password"]').fill(PASSWORD)
        page.locator("[data-login-form]").evaluate("form => form.requestSubmit()")
    page.locator("[data-admin]").wait_for(state="visible")


def open_tab(page, name):
    page.locator(f'[data-tab="{name}"]').evaluate("button => button.click()")


def verify_front(page, expected_story):
    page.goto(f"{BASE_URL}/?audit=title-e2e", wait_until="networkidle")
    page.wait_for_timeout(400)
    expected = {
        ".brand": TITLES["profile.nickname"],
        ".about-story [data-cloud-text]": TITLES["modules.aboutTitle"],
        "[data-music-player] > h2": TITLES["profile.musicModuleTitle"],
        "#story": expected_story,
        '[data-gallery-module="home-gallery"] > .section-heading-row h2': TITLES["modules.galleryTitle"],
        "[data-admin-entry] h2": TITLES["modules.adminTitle"],
        "[data-random-quote] .eyebrow": TITLES["modules.quoteTitle"],
        "[data-anniversary-panel] h2": TITLES["modules.anniversaryTitle"],
        "[data-mini-calendar] > h2": TITLES["modules.calendarTitle"],
    }
    for selector, value in expected.items():
        assert text(page, selector) == value, (selector, text(page, selector), value)
    assert page.title() == TITLES["profile.nickname"]
    assert [item.strip() for item in page.locator("[data-nav-links] a").all_inner_texts()] == [
        "主页",
        TITLES["modules.aboutTitle"],
        expected_story,
        TITLES["modules.galleryTitle"],
        TITLES["modules.adminTitle"],
    ]
    assert text(page, "[data-mini-title]").startswith("202")


def make_story_test_image(path):
    image = Image.new("RGB", (1170, 5200), "white")
    draw = ImageDraw.Draw(image)
    for y in range(60, 5140, 70):
        draw.text((60, y), "STORY IMAGE DETAIL 0123456789 " * 2, fill="black")
        draw.line((60, y + 28, 1110, y + 28), fill="#4267a5", width=3)
    image.save(path, quality=96)


def main():
    results = {"payloads": 0, "desktop": False, "mobile": False, "incognito": False, "defaults": False}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        payloads = []

        def capture_request(request):
            if request.method == "POST" and "/api/admin-data" in request.url:
                payloads.append(request.post_data_json)

        page.on("request", capture_request)
        login(page)

        page.locator('[name="profile.nickname"]').fill(TITLES["profile.nickname"])
        page.locator('[name="profile.showQuotes"]').first.uncheck()
        open_tab(page, "modules")
        for path, value in TITLES.items():
            if path.startswith("modules."):
                page.locator(f'[name="{path}"]').fill(value)
        open_tab(page, "music")
        page.locator('[name="profile.musicModuleTitle"]').fill(TITLES["profile.musicModuleTitle"])
        with page.expect_response(lambda response: "/api/admin-data" in response.url and response.request.method == "POST") as saved:
            page.get_by_role("button", name="保存到云端", exact=True).click()
        assert saved.value.status == 200
        assert payloads[-1]["modules"]["storyTitle"] == TITLES["modules.storyTitle"]
        assert payloads[-1]["profile"]["musicModuleTitle"] == TITLES["profile.musicModuleTitle"]

        page.goto(f"{BASE_URL}/", wait_until="networkidle")
        page.wait_for_timeout(300)
        assert page.locator("[data-random-quote]").is_hidden()

        login(page)
        open_tab(page, "modules")
        assert page.locator('[name="modules.storyTitle"]').input_value() == TITLES["modules.storyTitle"]
        open_tab(page, "profile")
        page.locator('[name="profile.showQuotes"]').first.check()
        preview_story_title = "故事标题-预览 ✅"
        open_tab(page, "modules")
        page.locator('[name="modules.storyTitle"]').fill(preview_story_title)
        with page.expect_response(lambda response: "/api/admin-data" in response.url and response.request.method == "POST") as preview_saved:
            page.get_by_role("button", name="保存并预览首页", exact=True).click()
        assert preview_saved.value.status == 200
        page.wait_for_url(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        verify_front(page, preview_story_title)
        results["desktop"] = True

        page.close()
        reopened = context.new_page()
        verify_front(reopened, preview_story_title)
        results["incognito"] = True

        reopened.goto(f"{BASE_URL}/album/?audit=title-e2e", wait_until="networkidle")
        reopened.wait_for_timeout(300)
        assert text(reopened, '[data-gallery-module="album-gallery"] > .section-heading-row h2') == TITLES["modules.albumPageTitle"]
        assert reopened.title() == re.sub(r"\s+", " ", TITLES["modules.albumPageTitle"])

        mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
        mobile = mobile_context.new_page()
        verify_front(mobile, preview_story_title)
        results["mobile"] = True

        fallback_context = browser.new_context(viewport={"width": 1200, "height": 900})
        fallback = fallback_context.new_page()
        fallback.route("**/api/site-data*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({
            "ok": True,
            "data": {"profile": {"showAbout": True, "showStory": True, "showMusic": True, "showQuotes": True,
                                 "showAnniversaryList": True, "showCalendar": True, "showGoodsWall": True, "showAdminEntry": True},
                     "modules": {}},
        })))
        fallback.goto(f"{BASE_URL}/?audit=legacy-defaults", wait_until="networkidle")
        assert text(fallback, "#story") == "我们的故事"
        assert text(fallback, '[data-gallery-module="home-gallery"] > .section-heading-row h2') == "周边与相册"
        assert text(fallback, "[data-admin-entry] h2") == "管理入口"
        results["defaults"] = True

        login(page := context.new_page())
        story_path = Path(tempfile.gettempdir()) / "dream-story-resolution-test.jpg"
        make_story_test_image(story_path)
        open_tab(page, "stories")
        page.locator("[data-story-title]").fill("故事图片清晰度-TEST")
        page.locator("[data-story-date]").fill("2026-07-22")
        with page.expect_response(lambda response: "/api/admin-image" in response.url and response.request.method == "POST") as uploaded:
            page.locator("[data-story-images]").set_input_files(str(story_path))
        assert uploaded.value.status == 200
        page.locator("[data-add-story]").click()
        page.wait_for_timeout(500)
        page.goto(f"{BASE_URL}/?audit=story-resolution", wait_until="networkidle")
        page.locator('[data-cloud-story-id]', has_text="故事图片清晰度-TEST").first.click()
        story_image = page.locator("[data-cloud-story-detail] .story-detail-images img")
        story_image.wait_for(state="visible")
        dimensions = story_image.evaluate("img => ({naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, renderedWidth: img.getBoundingClientRect().width, renderedHeight: img.getBoundingClientRect().height, aspectRatio: getComputedStyle(img).aspectRatio, objectFit: getComputedStyle(img).objectFit})")
        assert dimensions["naturalWidth"] == 1170, dimensions
        assert dimensions["naturalHeight"] == 5200, dimensions
        assert dimensions["naturalWidth"] > dimensions["renderedWidth"] * 1.4, dimensions
        assert dimensions["aspectRatio"] == "auto", dimensions
        assert dimensions["objectFit"] == "contain", dimensions
        results["storyImage"] = dimensions

        login(page := context.new_page())
        open_tab(page, "gallery")
        if page.locator("[data-category-title]").count() == 0:
            page.locator("[data-add-category]").click()
            page.locator("[data-category-title]").first.fill("清晰度测试分类")
        page.locator("[data-batch-title]").fill("相册清晰度-TEST")
        with page.expect_response(lambda response: "/api/admin-image" in response.url and response.request.method == "POST") as gallery_uploaded:
            page.locator("[data-batch-input]").set_input_files(str(story_path))
        assert gallery_uploaded.value.status == 200
        page.wait_for_timeout(800)
        gallery_data = page.request.get(f"{BASE_URL}/api/site-data?audit=gallery-resolution").json()["data"]
        gallery_url = gallery_data["galleryDraft"]["images"][-1]["image"]
        page.goto(f"{BASE_URL}/?audit=gallery-resolution", wait_until="networkidle")
        page.locator("[data-open-category]").first.click()
        page.locator(f'.goods-card img[src="{gallery_url}"]').click()
        gallery_image = page.locator("[data-gallery-lightbox]:not([hidden]) [data-gallery-image]")
        gallery_image.wait_for(state="visible")
        gallery_dimensions = gallery_image.evaluate("img => ({naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight})")
        assert gallery_dimensions == {"naturalWidth": 1170, "naturalHeight": 5200}, gallery_dimensions
        original_href = page.locator("[data-gallery-lightbox]:not([hidden]) [data-gallery-original]").get_attribute("href")
        assert original_href == gallery_url
        results["galleryImage"] = {**gallery_dimensions, "originalLink": True}

        results["payloads"] = len(payloads)
        browser.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

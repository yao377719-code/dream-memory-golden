import base64
import copy
import json
import time

from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:4321"
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

cloud_state = {
    "profile": {"showGoodsWall": True},
    "galleryCategories": [{"key": "daily", "title": "日常", "order": 1}],
    "galleryDraft": {"images": []},
}
admin_posts = []
uploaded_urls = []
upload_counter = 0


def image_payloads(prefix, count):
    return [
        {"name": f"{prefix}-{index + 1}.png", "mimeType": "image/png", "buffer": PNG_BYTES}
        for index in range(count)
    ]


def install_routes(page):
    def route_api(route):
        global upload_counter
        request = route.request
        if request.url.endswith("/api/admin-data"):
            if request.method == "POST":
                payload = json.loads(request.post_data or "{}")
                cloud_state.clear()
                cloud_state.update(copy.deepcopy(payload))
                admin_posts.append(copy.deepcopy(payload))
                route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
            else:
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({"ok": True, "data": cloud_state}, ensure_ascii=False),
                )
        elif request.url.endswith("/api/admin-image"):
            payload = json.loads(request.post_data or "{}")
            file_name = payload.get("fileName", "image.jpg")
            if file_name.startswith("batch-a-"):
                time.sleep(0.03)
            if file_name.startswith("fail-"):
                route.fulfill(
                    status=400,
                    content_type="application/json",
                    body=json.dumps({"ok": False, "message": "模拟的文件损坏"}, ensure_ascii=False),
                )
                return
            upload_counter += 1
            image_url = f"/api/site-image?id=test%2F{upload_counter}-{file_name}"
            uploaded_urls.append(image_url)
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"ok": True, "image": image_url}),
            )
        elif request.url.endswith("/api/site-data"):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"ok": True, "data": cloud_state}, ensure_ascii=False),
            )
        elif "/api/site-image" in request.url:
            route.fulfill(status=200, content_type="image/png", body=PNG_BYTES)
        else:
            route.continue_()

    page.route("**/api/**", route_api)


def wait_for_status(page, text):
    page.wait_for_function(
        "expected => document.querySelector('[data-batch-upload-status]')?.textContent.includes(expected)",
        arg=text,
        timeout=60_000,
    )


def save_admin(page):
    previous_posts = len(admin_posts)
    page.get_by_role("button", name="保存到云端", exact=True).click()
    page.wait_for_timeout(100)
    assert len(admin_posts) == previous_posts + 1


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=3,
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_routes(page)

    page.goto(f"{BASE_URL}/admin", wait_until="networkidle")
    if page.locator('input[name="password"]').count() == 0:
        raise AssertionError(f"admin page did not render: {page.url}\n{page.content()[:2000]}")
    page.get_by_label("后台密码").fill("test-password")
    page.get_by_role("button", name="进入", exact=True).click()
    page.get_by_role("button", name="图片管理", exact=True).click()
    batch_input = page.locator("[data-batch-input]")
    assert batch_input.evaluate("input => input.multiple") is True

    batch_input.set_input_files(image_payloads("batch-a", 12))
    page.wait_for_timeout(120)
    page.locator("[data-login-form]").evaluate("form => form.requestSubmit()")
    wait_for_status(page, "已上传并保存 12 张图片")
    assert len(cloud_state["galleryDraft"]["images"]) == 12
    assert page.locator('[data-gallery-source="cloud"]').count() == 12

    batch_input.set_input_files(image_payloads("batch-b", 5))
    wait_for_status(page, "已上传并保存 5 张图片")
    assert len(cloud_state["galleryDraft"]["images"]) == 17
    assert len(set(item["image"] for item in cloud_state["galleryDraft"]["images"])) == 17

    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="图片管理", exact=True).click()
    page.wait_for_function(
        "expected => document.querySelectorAll('[data-gallery-source=cloud]').length === expected",
        arg=17,
    )
    batch_input = page.locator("[data-batch-input]")

    first_two = [item["image"] for item in cloud_state["galleryDraft"]["images"][:2]]
    first_figure = page.locator('[data-gallery-source="cloud"]').first
    first_figure.locator("img").click()
    first_figure.locator('[data-move-gallery-image="down"]').click()
    save_admin(page)
    assert [item["image"] for item in cloud_state["galleryDraft"]["images"][:2]] == list(reversed(first_two))

    first_figure = page.locator('[data-gallery-source="cloud"]').first
    first_figure.locator("img").click()
    first_figure.locator("[data-remove-gallery-image]").click()
    save_admin(page)
    assert len(cloud_state["galleryDraft"]["images"]) == 16

    batch_input.set_input_files(image_payloads("single", 1))
    wait_for_status(page, "已上传并保存 1 张图片")
    assert len(cloud_state["galleryDraft"]["images"]) == 17

    batch_input.set_input_files(
        image_payloads("partial", 2)
        + [{"name": "fail-damaged.png", "mimeType": "image/png", "buffer": PNG_BYTES}]
    )
    wait_for_status(page, "2 张成功，1 张失败")
    assert "模拟的文件损坏" in page.locator("[data-batch-upload-status]").inner_text()
    assert len(cloud_state["galleryDraft"]["images"]) == 19

    page.goto(BASE_URL, wait_until="networkidle")
    page.wait_for_function(
        "expected => document.querySelectorAll(\"[data-gallery-module='home-gallery'] article.goods-card img[src^='/api/site-image']\").length === expected",
        arg=19,
    )
    page.goto(f"{BASE_URL}/album", wait_until="networkidle")
    page.wait_for_function(
        "expected => document.querySelectorAll(\"[data-gallery-module='album-gallery'] article.goods-card img[src^='/api/site-image']\").length === expected",
        arg=19,
    )
    context.close()

    relogin_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    relogin_page = relogin_context.new_page()
    relogin_errors = []
    relogin_page.on("pageerror", lambda error: relogin_errors.append(str(error)))
    install_routes(relogin_page)
    relogin_page.goto(f"{BASE_URL}/admin", wait_until="networkidle")
    relogin_page.get_by_label("后台密码").fill("test-password")
    relogin_page.get_by_role("button", name="进入", exact=True).click()
    relogin_page.get_by_role("button", name="图片管理", exact=True).click()
    relogin_page.wait_for_function(
        "expected => document.querySelectorAll('[data-gallery-source=cloud]').length === expected",
        arg=19,
    )
    assert not errors, errors
    assert not relogin_errors, relogin_errors
    relogin_context.close()
    browser.close()

print(json.dumps({
    "midUploadCloudReloadRace": "passed",
    "initialBatch": 12,
    "appendBatch": 5,
    "afterSingleDeleteReorder": 17,
    "partialSuccess": 2,
    "partialFailure": 1,
    "persistedAfterRelogin": len(cloud_state["galleryDraft"]["images"]),
    "uniqueUploadedPaths": len(set(uploaded_urls)),
}, ensure_ascii=False))

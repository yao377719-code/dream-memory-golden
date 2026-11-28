import { listImageCandidates } from "../../cloudflare/lib/image-inventory.mjs";
import { measure } from "../../cloudflare/lib/telemetry.mjs";
import { imageLifecycleCall } from "../../cloudflare/lib/site-snapshot.mjs";
import { assertRuntimeIdentity, isAuthorized, json } from "../../cloudflare/lib/http.mjs";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function onRequestPost({ request, env, data }) {
  if (!isAuthorized(request, env)) return json({ ok: false, message: "密码不对" }, 401);
  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return json({ ok: false, message: "图片请求过大" }, 413);
  }
  let payload;
  try { payload = await request.json(); } catch { return json({ ok: false, message: "没有收到正确的图片" }, 400); }
  const match = String(payload.imageData || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || !ALLOWED_IMAGE_TYPES.has(match[1])) return json({ ok: false, message: "只支持 JPG、PNG 或 WebP 图片" }, 400);
  let bytes;
  try { bytes = decodeBase64(match[2]); } catch { return json({ ok: false, message: "图片数据格式不正确" }, 400); }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return json({ ok: false, message: "图片不能超过 6MB" }, 413);
  const validSignature = match[1] === "image/jpeg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === "image/png"
      ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!validSignature) return json({ ok: false, message: "图片内容与格式不一致" }, 400);

  const { customerId } = assertRuntimeIdentity(request, env, { requireStore: true });
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  const id = `${customerId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const managed = await imageLifecycleCall(env, data, customerId, "/upload?id=" + encodeURIComponent(id), {
    method: "POST", body: bytes.buffer, headers: { "content-type": match[1] },
  });
  if (managed && !managed.ok) return managed;
  if (!managed) await measure(data, "kv-write", () => env.DREAM_MEMORY_STORE.put(id, bytes.buffer, {
    metadata: {
      contentType: match[1],
      fileName: String(payload.fileName || "").slice(0, 255),
    },
  }));
  return json({ ok: true, image: `/api/site-image?id=${encodeURIComponent(id)}` });
}

export async function onRequestGet({ request, env, data }) {
  if (!isAuthorized(request, env)) return json({ ok: false, message: "密码不对" }, 401);
  const url = new URL(request.url);
  if (url.searchParams.get("inventory") !== "1") return json({ ok: false }, 404);
  const identity = assertRuntimeIdentity(request, env, { requireStore: true });
  const result = await listImageCandidates(env, data, identity, url.searchParams.get("cursor"));
  return json({ ok: true, ...result });
}
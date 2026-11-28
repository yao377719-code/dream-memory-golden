import { measure } from "../../cloudflare/lib/telemetry.mjs";
import { assertRuntimeIdentity, json } from "../../cloudflare/lib/http.mjs";

const ALLOWED_HOSTS = new Set(["163cn.tv", "music.163.com", "y.music.163.com"]);
function extractUrl(value) { const raw = String(value || "").trim(); return raw.match(/https?:\/\/[^\s)）]+/i)?.[0] || raw; }
function extractSongId(value) { const raw = String(value || ""); return (raw.match(/[?&]id=(\d+)/) || raw.match(/\/song\/(\d+)/) || raw.match(/^(\d+)$/))?.[1] || ""; }

export async function onRequestGet({ request, env, data }) {
  assertRuntimeIdentity(request, env);
  const input = new URL(request.url).searchParams.get("url") || "";
  const directId = extractSongId(input);
  if (directId) return json({ ok: true, provider: "netease", id: directId, source: `https://music.163.com/song/media/outer/url?id=${directId}.mp3` }, 200, "public, max-age=300");
  let parsed;
  try { parsed = new URL(extractUrl(input)); } catch { return json({ ok: false, message: "音乐链接格式不对" }, 400); }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) return json({ ok: false, message: "暂时只解析网易云音乐链接" }, 400);
  try {
    const response = await measure(data, "music-upstream", () => fetch(parsed, {
      redirect: "follow", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000),
    }));
    let id = extractSongId(response.url || parsed.toString());
    if (!id) id = extractSongId(await measure(data, "music-response", () => response.text()));
    if (!id) return json({ ok: false, message: "没有从链接里找到歌曲 ID" }, 404);
    return json({ ok: true, provider: "netease", id, source: `https://music.163.com/song/media/outer/url?id=${id}.mp3` }, 200, "public, max-age=300");
  } catch { return json({ ok: false, message: "解析音乐链接失败" }, 502); }
}

const YOUTUBE_HOSTS = ["www.youtube.com", "youtube.com", "m.youtube.com"];
const MEDIA_SUFFIXES = [".googlevideo.com"];

function cors(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range,Content-Type",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Type,Content-Disposition",
    "Vary": "Origin"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...cors(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function extractJsonObject(source, marker) {
  const startAt = source.indexOf(marker);
  if (startAt < 0) return null;
  const objectStart = source.indexOf("{", startAt + marker.length);
  if (objectStart < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = objectStart; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try { return JSON.parse(source.slice(objectStart, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function directUrl(format) {
  if (format.url) return format.url;
  if (!format.signatureCipher && !format.cipher) return null;
  const params = new URLSearchParams(format.signatureCipher || format.cipher);
  const url = params.get("url");
  const signature = params.get("sig");
  const key = params.get("sp") || "signature";
  if (!url || !signature) return null;
  const target = new URL(url);
  target.searchParams.set(key, signature);
  return target.href;
}

function normalize(format) {
  const url = directUrl(format);
  if (!url) return null;
  const mime = format.mimeType || "";
  const mimeMain = mime.split(";")[0];
  const codecs = (mime.match(/codecs="([^"]+)"/) || [])[1] || "";
  const hasVideo = mimeMain.startsWith("video/");
  const hasAudio = mimeMain.startsWith("audio/") || Boolean(format.audioQuality);
  const kind = hasVideo && format.audioQuality ? "影音合一" : hasVideo ? "僅視訊" : hasAudio ? "僅音訊" : "媒體";
  return {
    itag: format.itag,
    quality: format.qualityLabel || format.audioQuality || format.quality || "未知",
    kind,
    container: mimeMain.split("/")[1] || "bin",
    mimeType: mimeMain,
    codec: codecs,
    bitrate: format.bitrate || 0,
    contentLength: format.contentLength || "",
    url
  };
}

async function youtube(id) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id || "")) return json({ error: "影片 ID 格式錯誤" }, 400);
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=zh-TW`;
  const response = await fetch(watch, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6" } });
  if (!response.ok) return json({ error: `YouTube 頁面回傳 HTTP ${response.status}` }, 502);
  const html = await response.text();
  const player = extractJsonObject(html, "ytInitialPlayerResponse");
  if (!player) return json({ error: "頁面中找不到播放器資料" }, 422);
  const details = player.videoDetails || {};
  const streaming = player.streamingData || {};
  const raw = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
  const formats = raw.map(normalize).filter(Boolean).sort((a, b) => b.bitrate - a.bitrate);
  return json({
    id,
    title: details.title || "",
    thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "",
    lengthSeconds: details.lengthSeconds || "",
    formats,
    note: formats.length ? "" : "此影片格式需要新版播放器簽章處理，第一版尚未涵蓋"
  });
}

async function media(request, target) {
  let url;
  try { url = new URL(target); } catch { return json({ error: "媒體網址無效" }, 400); }
  if (url.protocol !== "https:" || !MEDIA_SUFFIXES.some(suffix => url.hostname.endsWith(suffix))) {
    return json({ error: "此媒體網域未列入允許清單" }, 403);
  }
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  const upstream = await fetch(url, { method: request.method, headers, redirect: "follow" });
  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));
  if (new URL(request.url).searchParams.get("download") === "1") {
    const ext = new URL(request.url).searchParams.get("ext") || "bin";
    output.set("Content-Disposition", `attachment; filename="youtube-media.${ext.replace(/[^a-z0-9]/gi, "")}"`);
  }
  output.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: output });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/youtube" && request.method === "GET") return youtube(url.searchParams.get("id"));
      if (url.pathname === "/media" && ["GET", "HEAD"].includes(request.method)) return media(request, url.searchParams.get("url"));
      return json({ service: "YouTube Static Helper v1", endpoints: ["GET /youtube?id=VIDEO_ID", "GET /media?url=MEDIA_URL"] });
    } catch (error) {
      return json({ error: error.message || "Worker 執行失敗" }, 500);
    }
  }
};

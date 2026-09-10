const VERSION = "2026.09.10-A3.0-Rolling";
const SERVICE = "OwO MO Downloader Worker A3 Rolling";
const MEDIA_SUFFIXES = [".googlevideo.com"];
const PLAYER_CACHE_TTL = 21600;

/* Client 組態集中管理。YouTube 改版時優先更新此區。 */
const PLAYER_CLIENTS = [
  { label: "WEB", clientName: "WEB", clientVersion: "2.20260909.00.00" },
  { label: "MWEB", clientName: "MWEB", clientVersion: "2.20260909.00.00" },
  { label: "WEB_EMBEDDED", clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20260909.00.00", clientScreen: "EMBED", embed: true },
  { label: "ANDROID", clientName: "ANDROID", clientVersion: "21.35.35", osName: "Android", osVersion: "14", androidSdkVersion: 34 },
  { label: "ANDROID_VR", clientName: "ANDROID_VR", clientVersion: "1.62.27", osName: "Android", osVersion: "12", androidSdkVersion: 32 },
  { label: "IOS", clientName: "IOS", clientVersion: "21.35.3", osName: "iPhone", osVersion: "18.6.2.22G100", deviceMake: "Apple", deviceModel: "iPhone16,2" },
  { label: "TVHTML5", clientName: "TVHTML5", clientVersion: "7.20260909.18.00", platform: "TV" }
];

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range,Content-Type",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Type,Content-Disposition",
    "Vary": "Origin"
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...cors(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function classify(status, reason = "") {
  const text = `${status} ${reason}`.toLowerCase();
  if (text.includes("login") || text.includes("登入") || text.includes("bot")) return "AUTH_REQUIRED";
  if (text.includes("country") || text.includes("region") || text.includes("地區")) return "REGION_BLOCKED";
  if (status === "UNPLAYABLE" || status === "ERROR") return "VIDEO_UNAVAILABLE";
  return "NO_STREAMING_DATA";
}
function extractJsonObject(source, marker) {
  const startAt = source.indexOf(marker);
  if (startAt < 0) return null;
  const objectStart = source.indexOf("{", startAt + marker.length);
  if (objectStart < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = objectStart; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { try { return JSON.parse(source.slice(objectStart, i + 1)); } catch { return null; } }
  }
  return null;
}
function configValue(html, key) {
  const match = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"\\]+(?:\\.[^"\\]*)*)"'));
  if (!match) return "";
  try { return JSON.parse(`"${match[1]}"`).replace(/\\u0026/g, "&"); } catch { return match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"); }
}
function playerJsUrl(html) {
  const candidates = [configValue(html, "PLAYER_JS_URL"), configValue(html, "jsUrl"), (html.match(/"jsUrl"\s*:\s*"([^"]+)"/) || [])[1] || ""];
  const value = candidates.find(Boolean);
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http")) return value;
  return `https://www.youtube.com${value.startsWith("/") ? "" : "/"}${value}`;
}
function rawFormats(player) {
  const data = player?.streamingData || {};
  return [...(data.formats || []), ...(data.adaptiveFormats || [])];
}
function playState(player) {
  const value = player?.playabilityStatus || {};
  return { status: value.status || "UNKNOWN", reason: value.reason || (value.messages || []).join("；") || "未提供原因" };
}
async function innertubePlayer(apiKey, visitorData, id, profile) {
  const client = { hl: "zh-TW", gl: "TW", ...profile };
  delete client.label; delete client.embed;
  if (visitorData) client.visitorData = visitorData;
  const context = { client };
  if (profile.embed) context.thirdParty = { embedUrl: `https://www.youtube.com/embed/${id}` };
  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://www.youtube.com", "X-YouTube-Client-Name": profile.clientName, "X-YouTube-Client-Version": profile.clientVersion, ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}) },
    body: JSON.stringify({ videoId: id, context, contentCheckOk: true, racyCheckOk: true }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function collectSources(html, watchPlayer, id, steps) {
  const output = [{ label: "WATCH_PAGE", player: watchPlayer }];
  let state = playState(watchPlayer);
  steps.push(`【WATCH_PAGE】狀態：${state.status}；格式：「${rawFormats(watchPlayer).length}」個；原因：${state.reason}。`);
  if (rawFormats(watchPlayer).length) return output;
  const apiKey = configValue(html, "INNERTUBE_API_KEY");
  const visitorData = configValue(html, "VISITOR_DATA");
  if (!apiKey) { steps.push("【FALLBACK】找不到 INNERTUBE_API_KEY，無法執行多 Client 輪詢。"); return output; }
  steps.push("【FALLBACK】WATCH_PAGE 未提供格式，開始嘗試其他播放器 Client。");
  for (const profile of PLAYER_CLIENTS) {
    try {
      const player = await innertubePlayer(apiKey, visitorData, id, profile);
      state = playState(player);
      const count = rawFormats(player).length;
      steps.push(`【${profile.label}】狀態：${state.status}；格式：「${count}」個；原因：${state.reason}。`);
      output.push({ label: profile.label, player });
      if (count) break;
    } catch (error) { steps.push(`【${profile.label}】請求失敗：${error.message}。`); }
  }
  return output;
}

/* A3 使用無 eval 的有限指令解譯器。Player JS 變更時，只需擴充規則定位與操作辨識。 */
function balancedBlock(source, braceStart) {
  let depth = 0, quote = "", escaped = false;
  for (let i = braceStart; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return source.slice(braceStart, i + 1);
  }
  return "";
}
function locateFunction(js, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [new RegExp(`function\\s+${escaped}\\s*\\([^)]*\\)\\s*\\{`), new RegExp(`${escaped}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`), new RegExp(`${escaped}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{`)];
  for (const pattern of patterns) { const match = pattern.exec(js); if (match) { const start = js.indexOf("{", match.index); return balancedBlock(js, start); } }
  return "";
}
function detectSignatureName(js) {
  const patterns = [/\.sig\|\|([\w$]+)\(/, /signature",([\w$]+)\(/, /\.set\([^,]+,encodeURIComponent\(([\w$]+)\(/, /\bc&&\(c=([\w$]+)\(decodeURIComponent\(c\)\)\)/];
  for (const pattern of patterns) { const match = js.match(pattern); if (match) return match[1]; }
  return "";
}
function detectNName(js) {
  const patterns = [/\.get\("n"\)\)&&\([\w$]+=([\w$]+)\([\w$]+\)/, /\bn=([\w$]+)\(n\)/, /\.set\("n",([\w$]+)\(/];
  for (const pattern of patterns) { const match = js.match(pattern); if (match) return match[1]; }
  return "";
}
function helperObject(js, body) {
  const call = body.match(/;([\w$]+)\.([\w$]+)\([\w$]+(?:,\d+)?\)/);
  if (!call) return null;
  const objectName = call[1];
  const markerPatterns = [new RegExp(`(?:var\\s+)?${objectName.replace(/\$/g,"\\$")}\\s*=\\s*\\{`), new RegExp(`${objectName.replace(/\$/g,"\\$")}\\s*:\\s*\\{`)];
  for (const pattern of markerPatterns) { const match = pattern.exec(js); if (match) { const start = js.indexOf("{", match.index); return { name: objectName, source: balancedBlock(js, start) }; } }
  return null;
}
function methodKinds(helper) {
  const map = {};
  if (!helper) return map;
  const methodRegex = /([\w$]+)\s*:\s*function\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = methodRegex.exec(helper.source))) {
    const start = helper.source.indexOf("{", match.index);
    const body = balancedBlock(helper.source, start);
    if (/\.reverse\(/.test(body)) map[match[1]] = "reverse";
    else if (/\.splice\(0,/.test(body)) map[match[1]] = "splice";
    else if (/\.slice\(/.test(body)) map[match[1]] = "slice";
    else if (/\[0\].*%.*\.length|var\s+\w+=\w+\[0\]/.test(body)) map[match[1]] = "swap";
  }
  return map;
}
function compileTransform(js, name) {
  if (!name) return null;
  const body = locateFunction(js, name);
  if (!body || !/\.split\(""\)/.test(body)) return null;
  const helper = helperObject(js, body), kinds = methodKinds(helper), operations = [];
  const callRegex = helper ? new RegExp(`${helper.name.replace(/\$/g,"\\$")}\\.([\\w$]+)\\([\\w$]+(?:,(\\d+))?\\)`, "g") : null;
  let match;
  while (callRegex && (match = callRegex.exec(body))) { const kind = kinds[match[1]]; if (kind) operations.push({ kind, value: Number(match[2] || 0) }); }
  if (!operations.length) return null;
  return value => {
    let chars = String(value).split("");
    for (const op of operations) {
      if (op.kind === "reverse") chars.reverse();
      else if (op.kind === "splice") chars.splice(0, op.value);
      else if (op.kind === "slice") chars = chars.slice(op.value);
      else if (op.kind === "swap" && chars.length) { const index = op.value % chars.length; [chars[0], chars[index]] = [chars[index], chars[0]]; }
    }
    return chars.join("");
  };
}
async function playerRules(jsUrl, steps) {
  if (!jsUrl) { steps.push("【PLAYER_JS】找不到播放器 JavaScript 網址。"); return { signature: null, n: null }; }
  const response = await fetch(jsUrl, { cache: "no-store" });
  if (!response.ok) { steps.push(`【PLAYER_JS】下載失敗：HTTP ${response.status}。`); return { signature: null, n: null }; }
  const js = await response.text();
  const signatureName = detectSignatureName(js), nName = detectNName(js);
  const signature = compileTransform(js, signatureName), n = compileTransform(js, nName);
  steps.push(`【PLAYER_JS】已取得播放器程式；Signature：${signature ? "可用" : "未定位"}；N：${n ? "可用" : "未定位"}。`);
  return { signature, n };
}
function decipherUrl(format, rules, counters) {
  let value = format.url || "";
  if (!value && (format.signatureCipher || format.cipher)) {
    const params = new URLSearchParams(format.signatureCipher || format.cipher);
    value = params.get("url") || "";
    const signature = params.get("sig") || params.get("signature");
    const encrypted = params.get("s");
    if (signature) { const target = new URL(value); target.searchParams.set(params.get("sp") || "signature", signature); value = target.href; counters.signature++; }
    else if (encrypted && rules.signature) { const target = new URL(value); target.searchParams.set(params.get("sp") || "signature", rules.signature(encrypted)); value = target.href; counters.signature++; }
    else if (encrypted) counters.signatureFailed++;
  }
  if (!value) return null;
  const target = new URL(value);
  const nValue = target.searchParams.get("n");
  if (nValue && rules.n) { target.searchParams.set("n", rules.n(nValue)); counters.n++; }
  else if (nValue && !rules.n) counters.nFailed++;
  return target.href;
}
function normalize(format, url) {
  if (!url) return null;
  const mime = format.mimeType || "", mimeMain = mime.split(";")[0];
  const codecs = (mime.match(/codecs="([^"]+)"/) || [])[1] || "";
  const hasVideo = mimeMain.startsWith("video/"), hasAudio = mimeMain.startsWith("audio/") || Boolean(format.audioQuality);
  const kind = hasVideo && (format.audioQuality || codecs.includes(",")) ? "影音合一" : hasVideo ? "僅視訊" : hasAudio ? "僅音訊" : "媒體";
  return { itag: format.itag, quality: format.qualityLabel || format.audioQuality || format.quality || "未知", kind, container: mimeMain.split("/")[1] || "bin", mimeType: mimeMain, codec: codecs, bitrate: format.bitrate || 0, contentLength: format.contentLength || "", url };
}
async function youtube(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) return json({ error: "影片 ID 格式錯誤。", code: "INVALID_VIDEO_ID" }, 400);
  const steps = [];
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=zh-TW&gl=TW`;
  const response = await fetch(watch, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6" }, cache: "no-store" });
  if (!response.ok) return json({ error: `YouTube 頁面回傳 HTTP ${response.status}。`, code: "WATCH_PAGE_HTTP_ERROR", steps }, 502);
  const html = await response.text();
  steps.push("【解析】已取得 watch 頁面 HTML。");
  const watchPlayer = extractJsonObject(html, "ytInitialPlayerResponse");
  if (!watchPlayer) return json({ error: "頁面中找不到 ytInitialPlayerResponse。", code: "PLAYER_RESPONSE_NOT_FOUND", steps }, 422);
  steps.push("【解析】已取得 ytInitialPlayerResponse。");
  const sources = await collectSources(html, watchPlayer, id, steps);
  const selected = sources.find(source => rawFormats(source.player).length) || sources[0];
  const details = selected.player?.videoDetails || watchPlayer.videoDetails || {};
  const raw = rawFormats(selected.player);
  if (!raw.length) {
    const states = sources.map(source => `${source.label}=${playState(source.player).status}`).join("、");
    const mainState = playState(selected.player);
    const code = classify(mainState.status, mainState.reason);
    return json({ id, title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "", formats: [], steps, code, note: `所有播放器來源均未提供 streamingData（${states}）。分類：${code}。` });
  }
  steps.push(`【來源】採用 ${selected.label}，取得「${raw.length}」個原始格式。`);
  const needRules = raw.some(format => format.signatureCipher || format.cipher || (() => { try { return new URL(format.url || "").searchParams.has("n"); } catch { return false; } })());
  const rules = needRules ? await playerRules(playerJsUrl(html), steps) : { signature: null, n: null };
  const counters = { signature: 0, signatureFailed: 0, n: 0, nFailed: 0 };
  const formats = raw.map(format => normalize(format, decipherUrl(format, rules, counters))).filter(Boolean).sort((a, b) => b.bitrate - a.bitrate);
  steps.push(`【網址】已處理 Signature：「${counters.signature}」個；失敗：「${counters.signatureFailed}」個。`);
  steps.push(`【網址】已處理 N 參數：「${counters.n}」個；未處理：「${counters.nFailed}」個。`);
  steps.push(`【格式】產生「${formats.length}」個可直接使用的候選網址。`);
  const note = formats.length ? "" : counters.signatureFailed ? "PLAYER_JS 規則已變更，請更新 Signature 函式定位規則。" : "播放器未提供可直接使用的媒體網址。";
  return json({ id, source: selected.label, version: VERSION, title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "", lengthSeconds: details.lengthSeconds || "", formats, steps, note });
}
async function media(request, target) {
  let url;
  try { url = new URL(target); } catch { return json({ error: "媒體網址無效。" }, 400); }
  if (url.protocol !== "https:" || !MEDIA_SUFFIXES.some(suffix => url.hostname.endsWith(suffix))) return json({ error: "此媒體網域未列入允許清單。" }, 403);
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  const upstream = await fetch(url, { method: request.method, headers, redirect: "follow" });
  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));
  if (new URL(request.url).searchParams.get("download") === "1") {
    const ext = (new URL(request.url).searchParams.get("ext") || "bin").replace(/[^a-z0-9]/gi, "");
    output.set("Content-Disposition", `attachment; filename="youtube-media.${ext}"`);
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
      return json({ service: SERVICE, version: VERSION, architecture: "GitHub Pages + Cloudflare Worker Free", endpoints: ["GET /youtube?id=VIDEO_ID", "GET /media?url=MEDIA_URL"] });
    } catch (error) { return json({ error: error.message || "Worker 執行失敗。", code: "WORKER_INTERNAL_ERROR" }, 500); }
  }
};
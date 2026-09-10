const VERSION = "2026.09.10-A3.1.0-HQ";
const SERVICE = "OwO MO Downloader Worker A3 Rolling";
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

function normalize(format, resolvedUrl = "") {
  const url = resolvedUrl || directUrl(format);
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


function configValue(html, key) {
  const match = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"'));
  return match ? match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/") : "";
}

function rawFormats(player) {
  const data = player && player.streamingData || {};
  return [...(data.formats || []), ...(data.adaptiveFormats || [])];
}

function playState(player) {
  const value = player && player.playabilityStatus || {};
  return {
    status: value.status || "UNKNOWN",
    reason: value.reason || (value.messages || []).join("；") || "未提供原因"
  };
}

function hasAddress(format) {
  return Boolean(format && (format.url || format.signatureCipher || format.cipher));
}

function addressableFormats(player) {
  return rawFormats(player).filter(hasAddress);
}

function sourceSummary(source) {
  const state = playState(source.player);
  const rawCount = rawFormats(source.player).length;
  const addressCount = addressableFormats(source.player).length;
  return `${source.label}=${state.status}/${rawCount}/${addressCount}`;
}

const PLAYER_CLIENTS = [
  { label: "ANDROID", clientName: "ANDROID", clientVersion: "21.35.35", osName: "Android", osVersion: "14", androidSdkVersion: 34 },
  { label: "WEB", clientName: "WEB", clientVersion: "2.20260909.00.00" },
  { label: "MWEB", clientName: "MWEB", clientVersion: "2.20260909.00.00" },
  { label: "WEB_EMBEDDED", clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20260909.00.00", clientScreen: "EMBED", embed: true },
  { label: "ANDROID_VR", clientName: "ANDROID_VR", clientVersion: "1.62.27", osName: "Android", osVersion: "12", androidSdkVersion: 32 },
  { label: "IOS", clientName: "IOS", clientVersion: "21.35.3", osName: "iPhone", osVersion: "18.6.2.22G100", deviceMake: "Apple", deviceModel: "iPhone16,2" },
  { label: "TVHTML5", clientName: "TVHTML5", clientVersion: "7.20260909.18.00", platform: "TV" }
];

async function innertubePlayer(apiKey, visitorData, id, profile) {
  const client = { hl: "zh-TW", gl: "TW", ...profile };
  delete client.label;
  delete client.embed;
  if (visitorData) client.visitorData = visitorData;
  const context = { client };
  if (profile.embed) context.thirdParty = { embedUrl: "https://www.youtube.com/" };
  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://www.youtube.com",
      "X-YouTube-Client-Name": profile.clientName,
      "X-YouTube-Client-Version": profile.clientVersion,
      ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {})
    },
    body: JSON.stringify({ videoId: id, context, contentCheckOk: true, racyCheckOk: true }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function collectSources(html, watchPlayer, id, steps) {
  const output = [{ label: "WATCH_PAGE", player: watchPlayer }];
  let state = playState(watchPlayer);
  let rawCount = rawFormats(watchPlayer).length;
  let addressCount = addressableFormats(watchPlayer).length;

  steps.push(`【WATCH_PAGE】狀態：${state.status}；原始格式：「${rawCount}」個；含網址或密文：「${addressCount}」個；原因：${state.reason}。`);

  if (rawCount && !addressCount) {
    steps.push("【SABR】WATCH_PAGE 僅提供格式描述，未含 url、signatureCipher 或 cipher，繼續嘗試其他 Client。");
  }

  const apiKey = configValue(html, "INNERTUBE_API_KEY");
  const visitorData = configValue(html, "VISITOR_DATA");

  if (!apiKey) {
    steps.push("【FALLBACK】找不到 INNERTUBE_API_KEY，無法執行多 Client 輪詢。");
    return output;
  }

  const existing = addressableFormats(watchPlayer);
  const hasVideoOnly = existing.some(format => String(format.mimeType || "").startsWith("video/") && !format.audioQuality);
  const hasAudioOnly = existing.some(format => String(format.mimeType || "").startsWith("audio/") || (!String(format.mimeType || "").startsWith("video/") && format.audioQuality));

  if (addressCount && hasVideoOnly && hasAudioOnly) {
    steps.push("【來源】WATCH_PAGE 已同時提供分離視訊與音訊，略過其他 Client。");
    return output;
  }

  steps.push("【FALLBACK】繼續蒐集可用影音合一、分離視訊與分離音訊格式。");
  let authCount = state.status === "LOGIN_REQUIRED" ? 1 : 0;

  for (const profile of PLAYER_CLIENTS) {
    try {
      const player = await innertubePlayer(apiKey, visitorData, id, profile);
      state = playState(player);
      rawCount = rawFormats(player).length;
      addressCount = addressableFormats(player).length;
      if (state.status === "LOGIN_REQUIRED") authCount++;

      steps.push(`【${profile.label}】狀態：${state.status}；原始格式：「${rawCount}」個；含網址或密文：「${addressCount}」個；原因：${state.reason}。`);
      output.push({ label: profile.label, player });

      const all = output.flatMap(source => addressableFormats(source.player));
      const videoOnly = all.some(format => String(format.mimeType || "").startsWith("video/") && !format.audioQuality);
      const audioOnly = all.some(format => String(format.mimeType || "").startsWith("audio/") || (!String(format.mimeType || "").startsWith("video/") && format.audioQuality));
      const muxed = all.some(format => String(format.mimeType || "").startsWith("video/") && Boolean(format.audioQuality));

      if (videoOnly && audioOnly) {
        steps.push(`【高畫質】${profile.label} 後已取得分離視訊與音訊，停止其餘 Client 輪詢。`);
        break;
      }

      if (muxed && authCount >= 4) {
        steps.push("【快速停止】已有影音合一格式，且多個來源要求登入，停止其餘 Client 輪詢。");
        break;
      }

      if (authCount >= 4 && !all.length) {
        steps.push(`【快速停止】已有「${authCount}」個來源要求登入，判定為 AUTH_REQUIRED。`);
        break;
      }
    } catch (error) {
      steps.push(`【${profile.label}】請求失敗：${error.message}。`);
      if (String(error.message).includes("HTTP 429")) {
        steps.push("【快速停止】YouTube 已回傳 HTTP 429，停止其餘 Client 輪詢。");
        break;
      }
    }
  }

  return output;
}

function playerJsUrl(html) {
  const value = configValue(html, "PLAYER_JS_URL") || configValue(html, "jsUrl");
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//.test(value)) return value;
  return `https://www.youtube.com${value.startsWith("/") ? "" : "/"}${value}`;
}

function balancedBlock(source, braceStart) {
  let depth = 0, quote = "", escaped = false;
  for (let index = braceStart; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(braceStart, index + 1);
  }
  return "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locateNamedFunction(playerJs, functionName) {
  if (!functionName) return "";
  const name = escapeRegex(functionName);
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`${name}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`${name}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{`)
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(playerJs);
    if (!match) continue;
    const body = balancedBlock(playerJs, playerJs.indexOf("{", match.index));
    if (body) return body;
  }
  return "";
}

function detectSignatureFunctionName(playerJs) {
  const patterns = [
    /\.sig\|\|([\w$]+)\(/,
    /["']signature["']\s*,\s*([\w$]+)\(/,
    /\.set\([^,]+,\s*encodeURIComponent\(([\w$]+)\(/,
    /\bc&&\(c=([\w$]+)\(decodeURIComponent\(c\)\)\)/
  ];
  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function detectNFunctionName(playerJs) {
  const patterns = [
    /\.get\(["']n["']\)\)&&\([\w$]+=([\w$]+)\([\w$]+\)/,
    /\bn=([\w$]+)\(n\)/,
    /\.set\(["']n["'],\s*([\w$]+)\(/
  ];
  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function locateHelper(playerJs, functionBody) {
  const call = functionBody.match(/;([\w$]+)\.([\w$]+)\([\w$]+(?:,\d+)?\)/);
  if (!call) return null;
  const name = call[1];
  const match = new RegExp(`(?:var\\s+)?${escapeRegex(name)}\\s*=\\s*\\{`).exec(playerJs);
  if (!match) return null;
  const source = balancedBlock(playerJs, playerJs.indexOf("{", match.index));
  return source ? { name, source } : null;
}

function identifyHelperMethods(helper) {
  const methods = {};
  if (!helper) return methods;
  const pattern = /([\w$]+)\s*:\s*function\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = pattern.exec(helper.source))) {
    const body = balancedBlock(helper.source, helper.source.indexOf("{", match.index));
    if (/\.reverse\(/.test(body)) methods[match[1]] = "reverse";
    else if (/\.splice\(0,/.test(body)) methods[match[1]] = "splice";
    else if (/\.slice\(/.test(body)) methods[match[1]] = "slice";
    else if (/\[0\].*%.*\.length|var\s+\w+\s*=\s*\w+\[0\]/.test(body)) methods[match[1]] = "swap";
  }
  return methods;
}

function compileTransform(playerJs, functionName) {
  const body = locateNamedFunction(playerJs, functionName);
  if (!body || !/\.split\(["']["']\)/.test(body)) return null;
  const helper = locateHelper(playerJs, body);
  if (!helper) return null;
  const methods = identifyHelperMethods(helper);
  const operations = [];
  const calls = new RegExp(`${escapeRegex(helper.name)}\\.([\\w$]+)\\([\\w$]+(?:,(\\d+))?\\)`, "g");
  let match;
  while ((match = calls.exec(body))) {
    const kind = methods[match[1]];
    if (kind) operations.push({ kind, value: Number(match[2] || 0) });
  }
  if (!operations.length) return null;
  return input => {
    let chars = String(input).split("");
    for (const operation of operations) {
      if (operation.kind === "reverse") chars.reverse();
      else if (operation.kind === "splice") chars.splice(0, operation.value);
      else if (operation.kind === "slice") chars = chars.slice(operation.value);
      else if (operation.kind === "swap" && chars.length) {
        const target = operation.value % chars.length;
        [chars[0], chars[target]] = [chars[target], chars[0]];
      }
    }
    return chars.join("");
  };
}

async function loadPlayerRules(html, steps) {
  const jsUrl = playerJsUrl(html);
  if (!jsUrl) {
    steps.push("【PLAYER_JS】找不到播放器 JavaScript 網址。");
    return { signature: null, n: null };
  }
  const response = await fetch(jsUrl, { cache: "no-store" });
  if (!response.ok) {
    steps.push(`【PLAYER_JS】下載失敗：HTTP ${response.status}。`);
    return { signature: null, n: null };
  }
  const playerJs = await response.text();
  const signature = compileTransform(playerJs, detectSignatureFunctionName(playerJs));
  const n = compileTransform(playerJs, detectNFunctionName(playerJs));
  steps.push(`【PLAYER_JS】已取得播放器程式；Signature：${signature ? "可用" : "未定位"}；N：${n ? "可用" : "未定位"}。`);
  return { signature, n };
}

function resolveFormatUrl(format, rules, counters) {
  let value = format.url || "";
  if (!value && (format.signatureCipher || format.cipher)) {
    const params = new URLSearchParams(format.signatureCipher || format.cipher);
    value = params.get("url") || "";
    if (!value) return null;
    const key = params.get("sp") || "signature";
    const plain = params.get("sig") || params.get("signature");
    const encrypted = params.get("s");
    const target = new URL(value);
    if (plain) {
      target.searchParams.set(key, plain);
      counters.signature++;
    } else if (encrypted && rules.signature) {
      target.searchParams.set(key, rules.signature(encrypted));
      counters.signature++;
    } else if (encrypted) {
      counters.signatureFailed++;
      return null;
    }
    value = target.href;
  }
  if (!value) return null;
  const target = new URL(value);
  const nValue = target.searchParams.get("n");
  if (nValue && rules.n) {
    target.searchParams.set("n", rules.n(nValue));
    counters.n++;
  } else if (nValue) {
    counters.nFailed++;
  }
  return target.href;
}

async function youtube(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) return json({ error: "影片 ID 格式錯誤" }, 400);
  const steps = [];
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=zh-TW`;
  const response = await fetch(watch, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6" },
    cache: "no-store"
  });
  if (!response.ok) return json({ error: `YouTube 頁面回傳 HTTP ${response.status}` }, 502);
  const html = await response.text();
  steps.push("【解析】已取得 watch 頁面 HTML。");
  const watchPlayer = extractJsonObject(html, "ytInitialPlayerResponse");
  if (!watchPlayer) return json({ error: "頁面中找不到 ytInitialPlayerResponse", steps }, 422);
  steps.push("【解析】已取得 ytInitialPlayerResponse。");

  const sources = await collectSources(html, watchPlayer, id, steps);
  const selected = sources.find(source => addressableFormats(source.player).length) || sources[0];
  const details = selected.player.videoDetails || watchPlayer.videoDetails || {};
  const rawMap = new Map();
  for (const source of sources) {
    for (const format of addressableFormats(source.player)) {
      const key = `${format.itag || ""}|${format.mimeType || ""}|${format.qualityLabel || format.audioQuality || ""}`;
      if (!rawMap.has(key)) rawMap.set(key, { ...format, _source: source.label });
    }
  }
  const raw = [...rawMap.values()];
  if (!raw.length) {
    const summary = sources.map(sourceSummary).join("、");
    const hasLoginRequired = sources.some(source => playState(source.player).status === "LOGIN_REQUIRED");
    const code = hasLoginRequired ? "AUTH_REQUIRED" : "NO_MEDIA_ADDRESS";
    const note = hasLoginRequired
      ? `已測試來源要求登入，且沒有取得可解析媒體位址（${summary}）。`
      : `播放器可能只提供 SABR 格式描述，沒有 url、signatureCipher 或 cipher（${summary}）。`;
    return json({ id, title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "", formats: [], steps, code, retryable: false, version: VERSION, note });
  }

  steps.push(`【來源】彙整 ${sources.map(source => source.label).join("、")}，取得「${raw.length}」個不重複的含網址或密文格式。`);
  const needsRules = raw.some(format => format.signatureCipher || format.cipher || (() => {
    try { return new URL(format.url || "").searchParams.has("n"); } catch { return false; }
  })());
  const rules = needsRules ? await loadPlayerRules(html, steps) : { signature: null, n: null };
  const counters = { signature: 0, signatureFailed: 0, n: 0, nFailed: 0 };
  const formats = raw
    .map(format => normalize(format, resolveFormatUrl(format, rules, counters)))
    .filter(Boolean)
    .sort((a, b) => b.bitrate - a.bitrate);
  steps.push(`【網址】Signature 成功：「${counters.signature}」個；失敗：「${counters.signatureFailed}」個。`);
  steps.push(`【網址】N 參數成功：「${counters.n}」個；未處理：「${counters.nFailed}」個。`);
  steps.push(`【網址】取得「${formats.length}」個可直接使用的候選網址。`);
  return json({ id, source: sources.filter(source => addressableFormats(source.player).length).map(source => source.label).join("+") || selected.label, version: VERSION, code: formats.length ? "OK" : "SIGNATURE_REQUIRED", title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "",
    lengthSeconds: details.lengthSeconds || "", formats, steps,
    note: formats.length ? "" : "播放器已回傳格式，但格式都只有加密 signatureCipher。此執行環境需要更新播放器規則解析器。" });
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
      if (url.pathname === "/youtube" && request.method === "GET") return await youtube(url.searchParams.get("id"));
      if (url.pathname === "/media" && ["GET", "HEAD"].includes(request.method)) return await media(request, url.searchParams.get("url"));
      return json({ service: SERVICE, version: VERSION, architecture: "GitHub Pages + Cloudflare Worker Free", endpoints: ["GET /youtube?id=VIDEO_ID", "GET /media?url=MEDIA_URL"] });
    } catch (error) {
      return json({ error: error.message || "Worker 執行失敗", code: "WORKER_INTERNAL_ERROR", version: VERSION }, 500);
    }
  }
};

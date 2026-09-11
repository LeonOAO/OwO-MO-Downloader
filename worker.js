const VERSION = "2026.09.11-A3.4.3-Strict-Deduplication";
const SERVICE = "OwO MO Downloader Worker A3 Rolling";
const MEDIA_SUFFIXES = [".googlevideo.com"];
const FACEBOOK_PAGE_HOSTS = ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"];
const FACEBOOK_MEDIA_SUFFIXES = [".fbcdn.net", ".facebook.com"];
const INSTAGRAM_PAGE_HOSTS = ["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"];
const THREADS_PAGE_HOSTS = ["threads.com", "www.threads.com", "threads.net", "www.threads.net"];
const META_MEDIA_SUFFIXES = [".cdninstagram.com", ".fbcdn.net", ".instagram.com", ".threads.com", ".threads.net"];

function cors(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range,Content-Type,Cache-Control,X-FB-Session,X-IG-Session,X-TH-Session",
    "Access-Control-Max-Age": "86400",
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

async function collectSources(html, watchPlayer, id, steps, mode = "quick") {
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

  steps.push(mode === "quick"
    ? "【快速解析】先使用 ANDROID 尋找可直接下載的影音合一格式。"
    : "【高畫質搜尋】保留既有結果，繼續蒐集分離視訊與分離音訊格式。");
  let authCount = state.status === "LOGIN_REQUIRED" ? 1 : 0;
  const profiles = mode === "quick"
    ? PLAYER_CLIENTS.filter(profile => profile.label === "ANDROID")
    : PLAYER_CLIENTS.filter(profile => profile.label !== "ANDROID");

  for (const profile of profiles) {
    try {
      const player = await innertubePlayer(apiKey, visitorData, id, profile);
      state = playState(player);
      rawCount = rawFormats(player).length;
      addressCount = addressableFormats(player).length;
      if (state.status === "LOGIN_REQUIRED") authCount++;

      steps.push(`【${profile.label}】狀態：${state.status}；原始格式：「${rawCount}」個；含網址或密文：「${addressCount}」個；原因：${state.reason}。`);
      output.push({ label: profile.label, player });

      if (mode === "quick" && addressCount) {
        steps.push(`【快速解析】${profile.label} 已取得「${addressCount}」個可解析格式，先回傳基本結果。`);
        break;
      }

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

async function youtube(id, mode = "quick") {
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

  const sources = await collectSources(html, watchPlayer, id, steps, mode);
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
    return json({ id, phase: mode, title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "", formats: [], steps, code, retryable: false, version: VERSION, note });
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
  return json({ id, phase: mode, source: sources.filter(source => addressableFormats(source.player).length).map(source => source.label).join("+") || selected.label, version: VERSION, code: formats.length ? "OK" : "SIGNATURE_REQUIRED", title: details.title || "", thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "",
    lengthSeconds: details.lengthSeconds || "", formats, steps,
    note: formats.length ? "" : "播放器已回傳格式，但格式都只有加密 signatureCipher。此執行環境需要更新播放器規則解析器。" });
}


function decodeHtml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
    })
    .replace(/&#([0-9]+);/g, (_, decimal) => {
      try { return String.fromCodePoint(parseInt(decimal, 10)); } catch { return _; }
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decodeFacebookValue(value) {
  let output = decodeHtml(value);
  try { output = JSON.parse(`"${output.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`); } catch {}
  return decodeHtml(output)
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003D/g, "=")
    .replace(/\\u003F/g, "?")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\\//g, "/");
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function cleanFacebookTitle(value) {
  let title = decodeHtml(decodeFacebookValue(value))
    .replace(/\s*\|\s*Facebook\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return "Facebook 影片";
  const firstSentence = title.match(/^(.{1,100}?[。！？!?])(?:\s|$)/);
  if (firstSentence) title = firstSentence[1];
  else if (title.length > 100) title = `${title.slice(0, 100).trim()}…`;
  return title;
}

function inferFacebookHeight(url, quality) {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/(?:height|_nc_ohc|dimensions?)[=_-](\d{3,4})/i) || decoded.match(/(2160|1440|1080|720|540|480|360)p/i);
  if (match) return Number(match[1]);
  return quality === "HD" ? 720 : 360;
}

function parseDashManifest(value) {
  const manifest = decodeFacebookValue(value)
    .replace(/\\n/g, "")
    .replace(/\\t/g, "")
    .replace(/\\"/g, '"');
  const candidates = [];
  const representationPattern = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi;
  let match;
  while ((match = representationPattern.exec(manifest))) {
    const attributes = match[1];
    const body = match[2];
    const baseUrlMatch = body.match(/<BaseURL>([\s\S]*?)<\/BaseURL>/i);
    if (!baseUrlMatch) continue;
    const url = decodeHtml(baseUrlMatch[1].trim());
    if (!/^https:\/\//i.test(url)) continue;
    const mime = (attributes.match(/mimeType="([^"]+)"/i) || [])[1] || "";
    const height = Number((attributes.match(/height="(\d+)"/i) || [])[1] || 0);
    const bandwidth = Number((attributes.match(/bandwidth="(\d+)"/i) || [])[1] || 0);
    const codecs = (attributes.match(/codecs="([^"]+)"/i) || [])[1] || "";
    candidates.push({
      quality: height ? `${height}p` : mime.startsWith("audio/") ? "音訊" : "HD",
      height,
      bitrate: bandwidth,
      kind: mime.startsWith("audio/") ? "僅音訊" : "僅視訊",
      mimeType: mime || (height ? "video/mp4" : "audio/mp4"),
      codec: codecs,
      url
    });
  }
  return candidates;
}

function collectFacebookUrls(html) {
  const candidates = [];
  const definitions = [
    { quality: "HD", patterns: [
      /"browser_native_hd_url"\s*:\s*"([^"]+)"/g,
      /"browser_native_hd_url"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
      /"hd_src"\s*:\s*"([^"]+)"/g,
      /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/g,
      /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g,
      /"playable_url_quality_hd"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
      /"video_hd_url"\s*:\s*"([^"]+)"/g,
      /"hdUrl"\s*:\s*"([^"]+)"/g
    ] },
    { quality: "SD", patterns: [
      /"browser_native_sd_url"\s*:\s*"([^"]+)"/g,
      /"browser_native_sd_url"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
      /"sd_src"\s*:\s*"([^"]+)"/g,
      /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/g,
      /"playable_url"\s*:\s*"([^"]+)"/g,
      /"playable_url"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g,
      /"video_url"\s*:\s*"([^"]+)"/g,
      /"sdUrl"\s*:\s*"([^"]+)"/g
    ] }
  ];
  for (const definition of definitions) {
    for (const pattern of definition.patterns) {
      let match;
      while ((match = pattern.exec(html))) {
        const url = decodeFacebookValue(match[1]);
        if (/^https:\/\//i.test(url)) {
          candidates.push({
            quality: definition.quality,
            height: inferFacebookHeight(url, definition.quality),
            bitrate: definition.quality === "HD" ? 2000000 : 700000,
            kind: "影音合一",
            mimeType: "video/mp4",
            codec: "",
            url
          });
        }
      }
    }
  }

  const dashPatterns = [
    /"dash_manifest"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"dashManifest"\s*:\s*"((?:\\.|[^"])*)"/g
  ];
  for (const pattern of dashPatterns) {
    let match;
    while ((match = pattern.exec(html))) candidates.push(...parseDashManifest(match[1]));
  }

  const ogVideo = metaContent(html, "og:video") || metaContent(html, "og:video:url") || metaContent(html, "og:video:secure_url");
  if (/^https:\/\//i.test(ogVideo)) {
    candidates.push({ quality: "SD", height: 360, bitrate: 700000, kind: "影音合一", mimeType: "video/mp4", codec: "", url: ogVideo });
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.kind}|${candidate.height || candidate.quality}|${candidate.url}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function validateFacebookPageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !FACEBOOK_PAGE_HOSTS.includes(url.hostname.toLowerCase())) {
    throw new Error("僅接受 Facebook 或 fb.watch 的 HTTPS 網址。");
  }
  return url;
}


function isFacebookSharePath(url) {
  if (url.hostname.toLowerCase() === "fb.watch") return true;
  return /^\/share\/(?:r\/|v\/|reel\/)?[^/?#]+\/?$/i.test(url.pathname);
}

function isFacebookAuthPath(url) {
  return /^\/(?:login|checkpoint|recover|reg|privacy\/consent)(?:\/|$)/i.test(url.pathname);
}

function isFacebookStoryPath(url) {
  return /^\/stories\/[^/]+\/[^/?#]+/i.test(url.pathname);
}

function cleanFacebookStoryUrl(input) {
  const url = new URL(input.href);
  ["mibextid", "source", "refsrc", "ref", "sfnsn"].forEach(key => url.searchParams.delete(key));
  url.searchParams.set("view_single", "1");
  url.hash = "";
  return url;
}

function isUsableFacebookVideoUrl(url) {
  return !isFacebookSharePath(url) && !isFacebookAuthPath(url);
}

function cleanFacebookShareUrl(input) {
  const url = new URL(input.href);
  ["mibextid", "sfnsn", "d", "rdid", "share_url", "refsrc", "ref"].forEach(key => url.searchParams.delete(key));
  url.hash = "";
  return url;
}

function absoluteFacebookUrl(value, baseUrl) {
  if (!value) return "";
  const decoded = decodeFacebookValue(value);
  try {
    const url = new URL(decoded, baseUrl);
    return FACEBOOK_PAGE_HOSTS.includes(url.hostname.toLowerCase()) ? url.href : "";
  } catch {
    return "";
  }
}

function canonicalFacebookUrl(html, baseUrl) {
  const candidates = [
    metaContent(html, "og:url"),
    metaContent(html, "al:android:url"),
    metaContent(html, "al:ios:url"),
    metaContent(html, "twitter:url"),
    (html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i) || [])[1] || "",
    (html.match(/(?:window\.location(?:\.href)?|location\.replace)\s*(?:=|\()\s*["']([^"']+)["']/i) || [])[1] || "",
    (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] || "",
    (html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) || [])[1] || "",
    (html.match(/"url"\s*:\s*"(https?:\\?\/\\?\/(?:www\.)?facebook\.com\\?\/(?:reel|watch|[^"\\]+\/videos)\\?\/[^"\\]+)"/i) || [])[1] || ""
  ];
  const base = new URL(baseUrl);
  for (const candidate of candidates) {
    const result = absoluteFacebookUrl(candidate, baseUrl);
    if (!result) continue;
    const resolved = new URL(result);
    if (resolved.href === base.href || isFacebookSharePath(resolved) || isFacebookAuthPath(resolved)) continue;
    return resolved.href;
  }
  return "";
}

async function fetchFacebookPage(url, options = {}) {
  const mobile = Boolean(options.mobile);
  const target = new URL(url.href);
  if (mobile && target.hostname !== "fb.watch") target.hostname = "m.facebook.com";
  const headers = new Headers({
    "User-Agent": mobile
      ? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
  });
  if (options.cookie) headers.set("Cookie", options.cookie);
  return fetch(target, {
    method: "GET",
    headers,
    redirect: options.redirect || "manual",
    cache: "no-store"
  });
}

async function resolveFacebookShareUrl(inputUrl, steps, cookie = "") {
  const original = cleanFacebookShareUrl(inputUrl);
  const genericShare = /^\/share\/[^/]+\/?$/i.test(original.pathname);
  steps.push(`【FACEBOOK】已辨識${genericShare ? "通用" : "分類"}分享網址：${original.pathname}`);
  steps.push("【FACEBOOK】已移除分享追蹤參數。");

  function validResolvedUrl(value) {
    if (!value) return null;
    try {
      const url = cleanFacebookShareUrl(new URL(value, original.href));
      if (!FACEBOOK_PAGE_HOSTS.includes(url.hostname.toLowerCase())) return null;
      if (isFacebookAuthPath(url) || isFacebookSharePath(url)) return null;
      return url;
    } catch {
      return null;
    }
  }

  async function inspectResponse(response, label, requestUrl) {
    steps.push(`【FACEBOOK】${label}回傳 HTTP ${response.status}。`);
    const location = response.headers.get("Location");
    if (location) {
      const locationUrl = absoluteFacebookUrl(location, requestUrl.href);
      const resolved = validResolvedUrl(locationUrl);
      if (resolved) {
        steps.push(`【FACEBOOK】${label}已取得固定網址：${resolved.pathname}`);
        return resolved;
      }
      if (locationUrl) {
        const rejected = new URL(locationUrl);
        if (isFacebookAuthPath(rejected)) {
          steps.push(`【FACEBOOK】${label}指向登入頁，忽略該位置並繼續匿名備援。`);
        } else if (isFacebookSharePath(rejected)) {
          steps.push(`【FACEBOOK】${label}仍指向分享中介頁，繼續匿名備援。`);
        }
      }
    }

    const html = await response.text().catch(() => "");
    if (!html) return null;
    const canonical = canonicalFacebookUrl(html, requestUrl.href);
    const resolved = validResolvedUrl(canonical);
    if (resolved) {
      steps.push(`【FACEBOOK】${label}已從頁面資料取得固定網址：${resolved.pathname}`);
      return resolved;
    }
    return null;
  }

  const variants = [];
  const seen = new Set();
  function addVariant(hostname, mobile, redirect, label) {
    const url = new URL(original.href);
    url.hostname = hostname;
    const key = `${url.href}|${mobile}|${redirect}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ url, mobile, redirect, label });
  }

  addVariant(original.hostname, original.hostname === "m.facebook.com", "manual", "原始分享網址");
  addVariant("m.facebook.com", true, "manual", "行動版手動轉址");
  addVariant("www.facebook.com", false, "manual", "桌面版手動轉址");
  addVariant("m.facebook.com", true, "follow", "行動版自動轉址");
  addVariant("www.facebook.com", false, "follow", "桌面版自動轉址");

  for (const variant of variants) {
    try {
      const response = await fetchFacebookPage(variant.url, {
        mobile: variant.mobile,
        redirect: variant.redirect,
        cookie
      });

      if (variant.redirect === "follow") {
        const finalUrl = validResolvedUrl(response.url);
        if (finalUrl) {
          steps.push(`【FACEBOOK】${variant.label}回傳 HTTP ${response.status}。`);
          steps.push(`【FACEBOOK】${variant.label}已取得固定網址：${finalUrl.pathname}`);
          return finalUrl;
        }
        if (isFacebookAuthPath(new URL(response.url))) {
          steps.push(`【FACEBOOK】${variant.label}回傳 HTTP ${response.status}，最終仍進入登入頁。`);
        }
      }

      const resolved = await inspectResponse(response, variant.label, variant.url);
      if (resolved) return resolved;
    } catch (error) {
      steps.push(`【FACEBOOK】${variant.label}失敗：${error.message}。`);
    }
  }

  steps.push("【FACEBOOK】匿名分享入口均未取得固定網址，保留原分享網址交由後續頁面解析或登入工作階段備援。");
  return original;
}

function requestFacebookCookie(request, env) {
  const supplied = String(request.headers.get("X-FB-Session") || "").trim();
  const secret = String(env && env.FB_COOKIE || "").trim();
  return supplied || secret;
}
async function facebookResolve(value, env, request) {
  let pageUrl;
  try { pageUrl = validateFacebookPageUrl(value); }
  catch (error) { return json({ error: error.message, code: "INVALID_FACEBOOK_URL", version: VERSION }, 400); }

  const steps = [];
  const cookie = requestFacebookCookie(request, env);
  const storyMode = isFacebookStoryPath(pageUrl);
  if (storyMode) {
    pageUrl = cleanFacebookStoryUrl(pageUrl);
    steps.push("【FACEBOOK STORY】已辨識限時動態網址，改用登入工作階段專用流程。");
  }
  const originalUrl = new URL(pageUrl.href);

  async function resolveAndFetch(activeCookie, label) {
    let target = new URL(originalUrl.href);
    if (isFacebookSharePath(target)) {
      target = await resolveFacebookShareUrl(target, steps, activeCookie);
    }
    let result = await fetchFacebookPage(target, { mobile: true, redirect: "follow", cookie: activeCookie });
    steps.push(`【FACEBOOK】${label}影片頁面回傳 HTTP ${result.status}。`);
    let resultUrl = new URL(result.url);
    if ((!result.ok || isFacebookAuthPath(resultUrl)) && target.hostname !== "www.facebook.com") {
      const desktopUrl = new URL(target.href);
      desktopUrl.hostname = "www.facebook.com";
      result = await fetchFacebookPage(desktopUrl, { redirect: "follow", cookie: activeCookie });
      resultUrl = new URL(result.url);
      steps.push(`【FACEBOOK】${label}桌面版備援回傳 HTTP ${result.status}。`);
    }
    return { response: result, finalUrl: resultUrl };
  }

  if (storyMode && !cookie) {
    return json({
      error: "Facebook 限時動態需要登入工作階段；目前 Worker 尚未設定 FB_COOKIE Secret。",
      code: "FB_STORY_SESSION_REQUIRED",
      retryable: false,
      version: VERSION,
      steps
    }, 401);
  }

  let attempt = storyMode
    ? await resolveAndFetch(cookie, "限時動態登入工作階段")
    : await resolveAndFetch("", "訪客");
  let response = attempt.response;
  let finalUrlObject = attempt.finalUrl;

  if (!storyMode && (!response.ok || isFacebookAuthPath(finalUrlObject)) && cookie) {
    steps.push("【FACEBOOK】訪客模式未取得影片頁面，開始使用 FB_COOKIE Secret 重試。");
    attempt = await resolveAndFetch(cookie, "登入工作階段");
    response = attempt.response;
    finalUrlObject = attempt.finalUrl;
  }

  if (isFacebookAuthPath(finalUrlObject)) {
    return json({ error: cookie ? "FB_COOKIE 工作階段已失效或沒有影片觀看權限。" : "Facebook 將網址導向登入頁；尚未設定 FB_COOKIE Secret。", code: cookie ? "FB_SESSION_EXPIRED" : "FB_SESSION_REQUIRED", retryable: false, version: VERSION, steps }, 401);
  }
  if (!response.ok) return json({ error: `Facebook 影片頁面回傳 HTTP ${response.status}。`, code: "FACEBOOK_PAGE_ERROR", version: VERSION, steps }, 502);

  const finalUrl = finalUrlObject.href;
  let html = await response.text();
  steps.push(`【FACEBOOK】已取得影片頁面 HTML，共「${html.length}」個字元。`);
  let found = collectFacebookUrls(html);

  const hasHighQuality = found.some(item => item.kind === "僅視訊" || Number(item.height || 0) >= 720 || item.quality === "HD");
  if (!hasHighQuality && cookie) {
    steps.push("【FACEBOOK】訪客頁面只有 SD，使用 FB_COOKIE 再搜尋 HD 與 DASH 格式。");
    const authenticated = await fetchFacebookPage(new URL(finalUrl), { mobile: false, redirect: "follow", cookie });
    steps.push(`【FACEBOOK】登入工作階段高畫質頁面回傳 HTTP ${authenticated.status}。`);
    if (authenticated.ok && !isFacebookAuthPath(new URL(authenticated.url))) {
      const authenticatedHtml = await authenticated.text();
      steps.push(`【FACEBOOK】已取得登入工作階段 HTML，共「${authenticatedHtml.length}」個字元。`);
      const merged = new Map();
      for (const item of [...found, ...collectFacebookUrls(authenticatedHtml)]) {
        merged.set(`${item.kind}|${item.height || item.quality}|${item.url}`, item);
      }
      found = [...merged.values()];
      html = `${html}
${authenticatedHtml}`;
    }
  }

  const muxedCount = found.filter(item => item.kind === "影音合一").length;
  const videoCount = found.filter(item => item.kind === "僅視訊").length;
  const audioCount = found.filter(item => item.kind === "僅音訊").length;
  steps.push(`${storyMode ? "【FACEBOOK STORY】" : "【FACEBOOK】"}找到「${found.length}」個媒體格式：影音合一「${muxedCount}」個、僅視訊「${videoCount}」個、僅音訊「${audioCount}」個。`);

  const formats = found.map((item, index) => ({
    itag: `fb-${String(item.kind || "media").replace(/[^a-z0-9]/gi, "").toLowerCase()}-${item.height || String(item.quality).toLowerCase()}-${index + 1}`,
    quality: item.quality || (item.height ? `${item.height}p` : "未知"),
    kind: item.kind || "影音合一",
    container: String(item.mimeType || "video/mp4").includes("webm") ? "webm" : "mp4",
    mimeType: item.mimeType || "video/mp4",
    codec: item.codec || "",
    bitrate: item.bitrate || 0,
    contentLength: "",
    source: "FACEBOOK",
    url: item.url
  })).sort((a, b) => {
    const heightA = Number((String(a.quality).match(/\d+/) || [0])[0]);
    const heightB = Number((String(b.quality).match(/\d+/) || [0])[0]);
    return heightB - heightA || b.bitrate - a.bitrate;
  });

  const rawTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title") || "Facebook 影片";
  const title = cleanFacebookTitle(rawTitle);
  const thumbnail = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  const idMatch = finalUrl.match(/(?:videos|reel)\/(\d+)/) || finalUrl.match(/[?&]v=(\d+)/);
  const id = idMatch ? idMatch[1] : `fb-${Date.now()}`;

  if (!formats.length) {
    return json({
      platform: "facebook", id, canonicalUrl: finalUrl, title, thumbnail, formats: [], steps,
      code: "FACEBOOK_MEDIA_NOT_FOUND", retryable: false, version: VERSION,
      note: storyMode
        ? "限時動態頁面已載入，但沒有找到可下載的影片媒體。內容可能是圖片、已過期，或目前登入帳戶沒有觀看權限。"
        : "頁面中沒有找到公開 HD／SD 媒體網址。影片可能需要登入、不是公開內容，或 Facebook 已調整頁面資料格式。"
    });
  }

  return json({ platform: "facebook", contentType: storyMode ? "story" : "video", id, canonicalUrl: finalUrl, source: "FACEBOOK", version: VERSION, code: "OK", title, thumbnail, lengthSeconds: "", formats, steps, note: "" });
}

async function facebookMedia(request, target, env) {
  let url;
  try { url = new URL(target); }
  catch { return json({ error: "Facebook 媒體網址無效。", code: "INVALID_FACEBOOK_MEDIA_URL", version: VERSION }, 400); }

  if (url.protocol !== "https:" || !FACEBOOK_MEDIA_SUFFIXES.some(suffix => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix))) {
    return json({ error: "此 Facebook 媒體網域未列入允許清單。", code: "FACEBOOK_MEDIA_DOMAIN_DENIED", version: VERSION }, 403);
  }

  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
    "Referer": "https://www.facebook.com/",
    "Accept": "*/*",
    "Accept-Encoding": "identity"
  });
  const cookie = requestFacebookCookie(request, env);
  if (cookie) headers.set("Cookie", cookie);
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  const upstream = await fetch(url, { method: request.method, headers, redirect: "follow", cache: "no-store" });
  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));
  output.set("Cache-Control", "no-store");
  output.set("X-OwO-Version", VERSION);
  output.set("Content-Disposition", 'attachment; filename="facebook-video.mp4"');
  return new Response(upstream.body, { status: upstream.status, headers: output });
}


function requestMetaCookie(request, env, platform) {
  const header = platform === "instagram" ? "X-IG-Session" : "X-TH-Session";
  const secretName = platform === "instagram" ? "IG_COOKIE" : "TH_COOKIE";
  const supplied = String(request.headers.get(header) || "").trim();
  const secret = String(env && env[secretName] || "").trim();
  const instagramFallback = platform === "threads" ? String(request.headers.get("X-IG-Session") || env && env.IG_COOKIE || "").trim() : "";
  return supplied || secret || instagramFallback;
}

function normalizeSocialUrl(value, platform) {
  const url = new URL(value);
  const hosts = platform === "instagram" ? INSTAGRAM_PAGE_HOSTS : THREADS_PAGE_HOSTS;
  if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase())) throw new Error(`僅接受 ${platform === "instagram" ? "Instagram" : "Threads"} 的 HTTPS 網址。`);
  url.hash = "";
  ["igsh", "igshid", "utm_source", "utm_medium", "utm_campaign", "xmt", "share_id", "fbclid"].forEach(key => url.searchParams.delete(key));
  if (platform === "instagram") {
    url.hostname = "www.instagram.com";
    const reel = url.pathname.match(/^\/(?:reels?|reel)\/([^/?#]+)/i);
    const post = url.pathname.match(/^\/(?:p|tv)\/([^/?#]+)/i);
    const story = url.pathname.match(/^\/stories\/([^/?#]+)\/([^/?#]+)/i);
    const highlight = url.pathname.match(/^\/stories\/highlights\/([^/?#]+)/i);
    if (reel) url.pathname = `/reel/${reel[1]}/`;
    else if (post) url.pathname = `/p/${post[1]}/`;
    else if (story) url.pathname = `/stories/${story[1]}/${story[2]}/`;
    else if (highlight) url.pathname = `/stories/highlights/${highlight[1]}/`;
  } else {
    url.hostname = "www.threads.com";
    const full = url.pathname.match(/^\/@([^/]+)\/post\/([^/?#]+)/i);
    const short = url.pathname.match(/^\/t\/([^/?#]+)/i);
    const share = url.pathname.match(/^\/share\/([^/?#]+)/i);
    if (full) url.pathname = `/@${full[1]}/post/${full[2]}/`;
    else if (short) url.pathname = `/t/${short[1]}/`;
    else if (share) url.pathname = `/share/${share[1]}/`;
  }
  return url;
}

function socialContentType(url, platform) {
  if (platform === "instagram") {
    if (/^\/stories\/highlights\//i.test(url.pathname)) return "highlight";
    if (/^\/stories\//i.test(url.pathname)) return "story";
    if (/^\/reel\//i.test(url.pathname)) return "reel";
    if (/^\/p\//i.test(url.pathname)) return "post";
    return "unknown";
  }
  if (/^\/share\/[^/?#]+\/?$/i.test(url.pathname)) return "share";
  return /^\/(?:@[^/]+\/post|t)\//i.test(url.pathname) ? "post" : "unknown";
}

function decodeSocialMediaUrl(value) {
  let out = String(value || "");
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = decodeFacebookValue(out).replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/").replace(/&amp;/gi, "&");
    if (out === before) break;
  }
  return out;
}
function socialMediaKey(value) {
  try { const u = new URL(value); return `${u.hostname.toLowerCase()}${u.pathname}`; } catch { return value; }
}
function jsonLdVideos(html) {
  const urls = []; let m;
  const re = new RegExp(`<script[^>]+type=["']application/ld\\+json["'][^>]*>([\\s\\S]*?)</script>`, "gi");
  while ((m = re.exec(html))) {
    try {
      const q = [JSON.parse(decodeHtml(m[1]))];
      while (q.length) { const v=q.shift(); if (!v || typeof v!=="object") continue;
        for (const [k,x] of Object.entries(v)) { if (typeof x==="string" && /^(?:https:).*?(?:\\.mp4|cdninstagram|fbcdn)/i.test(x)) urls.push(x); else if (x && typeof x==="object") q.push(...(Array.isArray(x)?x:[x])); }
      }
    } catch {}
  }
  return urls;
}
function collectMetaSocialMedia(html, platform) {
  const candidates = [];
  const add = (url, quality = "原始畫質", kind = "影音合一", mimeType = "video/mp4", bitrate = 0) => {
    const decoded = decodeSocialMediaUrl(url);
    if (/^https:\/\//i.test(decoded)) candidates.push({ url: decoded, quality, kind, mimeType, bitrate });
  };

  [metaContent(html, "og:video"), metaContent(html, "og:video:url"), metaContent(html, "og:video:secure_url"), metaContent(html, "twitter:player:stream")].filter(Boolean).forEach(url => add(url));
  jsonLdVideos(html).forEach(url => add(url));

  const videoPatterns = [
    /"video_url"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"videoUrl"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"contentUrl"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"content_url"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"playable_url"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"playable_url_quality_hd"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"src"\s*:\s*"((?:\\.|[^"])*?(?:cdninstagram|fbcdn)[^"]*?\.mp4(?:[^"\\]*|\\.)*)"/g
  ];
  for (const pattern of videoPatterns) {
    let match;
    while ((match = pattern.exec(html))) add(match[1], /quality_hd|1080|720/i.test(match[0]) ? "HD" : "原始畫質");
  }

  const versionObjects = /"video_versions"\s*:\s*\[([\s\S]*?)\]/g;
  let versions;
  while ((versions = versionObjects.exec(html))) {
    const itemPattern = /\{([\s\S]*?)\}/g;
    let item;
    while ((item = itemPattern.exec(versions[1]))) {
      const url = (item[1].match(/"url"\s*:\s*"((?:\\.|[^"])*)"/) || [])[1];
      const width = Number((item[1].match(/"width"\s*:\s*(\d+)/) || [])[1] || 0);
      const height = Number((item[1].match(/"height"\s*:\s*(\d+)/) || [])[1] || 0);
      if (url) add(url, height ? `${height}p` : width ? `${width}px` : "原始畫質", "影音合一", "video/mp4", height * width);
    }
  }

  const images = [metaContent(html, "og:image"), metaContent(html, "twitter:image")].filter(Boolean);
  const unique = new Map();
  for (const item of candidates) {
    const key = socialMediaKey(item.url);
    if (!unique.has(key)) unique.set(key, item);
  }
  return { media: [...unique.values()], images };
}

function socialLoginPage(url, html, platform) {
  if (/\/(?:accounts\/login|login|challenge|checkpoint)(?:\/|$)/i.test(url.pathname)) return true;
  const markers = platform === "instagram"
    ? ["Log in • Instagram", "loginForm", "accounts/login"]
    : ["Log in • Threads", "LoginForm", "login"];
  return markers.filter(marker => html.includes(marker)).length >= 2;
}

async function fetchSocialPage(url, platform, cookie = "") {
  const referer = platform === "instagram" ? "https://www.instagram.com/" : "https://www.threads.com/";
  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": referer,
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
  });
  if (cookie) headers.set("Cookie", cookie);
  return fetch(url, { headers, redirect: "follow", cache: "no-store" });
}


function instagramShortcode(url) {
  return (url.pathname.match(/^\/(?:reel|p|tv)\/([^/?#]+)/i) || [])[1] || "";
}

function instagramCsrfFromPage(html, response, cookie = "") {
  const cookieMatch = String(cookie).match(/(?:^|;\s*)csrftoken=([^;]+)/i);
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
  const htmlPatterns = [
    /"csrf_token"\s*:\s*"([^"]+)"/i,
    /"csrfToken"\s*:\s*"([^"]+)"/i,
    /csrftoken=([^;"'\\]+)/i
  ];
  for (const pattern of htmlPatterns) {
    const found = html.match(pattern);
    if (found) return decodeSocialMediaUrl(found[1]);
  }
  const setCookie = response && response.headers ? String(response.headers.get("set-cookie") || "") : "";
  const headerMatch = setCookie.match(/csrftoken=([^;]+)/i);
  return headerMatch ? decodeURIComponent(headerMatch[1]) : "";
}

function instagramMediaFromApi(value) {
  const candidates = [];
  const images = [];
  const visited = new Set();
  const queue = [value];
  const addVideo = (url, width = 0, height = 0) => {
    const decoded = decodeSocialMediaUrl(url);
    if (!/^https:\/\//i.test(decoded) || !/(?:cdninstagram|fbcdn)/i.test(decoded)) return;
    candidates.push({
      url: decoded,
      quality: height ? `${height}p` : width ? `${width}px` : "原始畫質",
      kind: "影音合一",
      mimeType: "video/mp4",
      bitrate: Number(width || 0) * Number(height || 0)
    });
  };
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || visited.has(item)) continue;
    visited.add(item);
    if (typeof item.video_url === "string") addVideo(item.video_url, item.original_width || item.width, item.original_height || item.height);
    if (typeof item.videoUrl === "string") addVideo(item.videoUrl, item.width, item.height);
    if (typeof item.contentUrl === "string" && /(?:\.mp4|cdninstagram|fbcdn)/i.test(item.contentUrl)) addVideo(item.contentUrl, item.width, item.height);
    if (Array.isArray(item.video_versions)) {
      for (const version of item.video_versions) addVideo(version && version.url, version && version.width, version && version.height);
    }
    const imageUrl = item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates[0] && item.image_versions2.candidates[0].url;
    if (imageUrl) images.push(decodeSocialMediaUrl(imageUrl));
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") queue.push(...(Array.isArray(child) ? child : [child]));
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = socialMediaKey(candidate.url);
    const old = unique.get(key);
    if (!old || candidate.bitrate > old.bitrate) unique.set(key, candidate);
  }
  return { media: [...unique.values()], images: [...new Set(images)] };
}

async function fetchInstagramGraphql(url, pageHtml, pageResponse, cookie, steps) {
  const shortcode = instagramShortcode(url);
  if (!shortcode) return { media: [], images: [] };
  const csrf = instagramCsrfFromPage(pageHtml, pageResponse, cookie);
  const variables = {
    shortcode,
    fetch_tagged_user_count: null,
    hoisted_comment_id: null,
    hoisted_reply_id: null,
    __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    __relay_internal__pv__PolarisIsLoggedInrelayprovider: Boolean(cookie)
  };
  const body = new URLSearchParams({
    av: "0",
    __d: "www",
    __user: "0",
    __a: "1",
    __req: "1",
    __comet_req: "7",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostRootQuery",
    variables: JSON.stringify(variables),
    server_timestamps: "true",
    doc_id: "27128499623469141"
  });
  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    "Accept": "*/*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.instagram.com",
    "Referer": url.href,
    "X-IG-App-ID": "936619743392459",
    "X-FB-Friendly-Name": "PolarisPostRootQuery",
    "X-ASBD-ID": "129477"
  });
  if (csrf) headers.set("X-CSRFToken", csrf);
  const combinedCookie = [cookie, csrf && !/(?:^|;\s*)csrftoken=/i.test(cookie || "") ? `csrftoken=${csrf}` : ""].filter(Boolean).join("; ");
  if (combinedCookie) headers.set("Cookie", combinedCookie);
  try {
    const response = await fetch("https://www.instagram.com/graphql/query", {
      method: "POST",
      headers,
      body,
      redirect: "follow",
      cache: "no-store"
    });
    const text = await response.text();
    steps.push(`【INSTAGRAM GRAPHQL】PolarisPostRootQuery 回傳 HTTP ${response.status}，JSON「${text.length}」個字元。`);
    if (!response.ok) return { media: [], images: [] };
    let data;
    try { data = JSON.parse(text.replace(/^for \(;;\);/, "")); }
    catch { steps.push(`【INSTAGRAM GRAPHQL】回應不是有效 JSON：${text.slice(0,180).replace(/\s+/g," ")}。`); return { media: [], images: [] }; }
    if (data.error || data.message || data.require_login) steps.push(`【INSTAGRAM GRAPHQL】狀態：${data.error || data.message || "需要登入"}。`);
    if (Array.isArray(data.errors)) for (const err of data.errors) steps.push(`【INSTAGRAM GRAPHQL】錯誤：${err.message || err.summary || JSON.stringify(err).slice(0,160)}。`);
    const parsed = instagramMediaFromApi(data);
    steps.push(`【INSTAGRAM GRAPHQL】shortcode ${shortcode} 找到「${parsed.media.length}」個目標影片格式。`);
    return parsed;
  } catch (error) {
    steps.push(`【INSTAGRAM GRAPHQL】請求失敗：${error.message}。`);
    return { media: [], images: [] };
  }
}


function mergeInstagramResults(...results) {
  const media = new Map(), images = [];
  for (const result of results) {
    for (const item of result?.media || []) { const key=socialMediaKey(item.url); if (!media.has(key) || (item.bitrate||0)>(media.get(key).bitrate||0)) media.set(key,item); }
    for (const image of result?.images || []) if (image && !images.includes(image)) images.push(image);
  }
  return { media:[...media.values()], images };
}
function collectInstagramEmbedMedia(html) {
  const base = collectMetaSocialMedia(html,"instagram");
  const candidates=[...base.media], images=[...base.images];
  const add=(raw,w=0,h=0)=>{ const url=decodeSocialMediaUrl(raw); if (/^https:\/\//i.test(url) && /(?:cdninstagram|fbcdn)/i.test(url)) candidates.push({url,quality:h?`${h}p`:w?`${w}px`:"原始畫質",kind:"影音合一",mimeType:"video/mp4",bitrate:Number(w)*Number(h)}); };
  const variants=[html, decodeHtml(html), html.replace(/\\u0026/gi,"&").replace(/\\u003d/gi,"=").replace(/\\u002f/gi,"/").replace(/\\\//g,"/")];
  const patterns=[
    /["']video_url["']\s*:\s*["']([^"']+)["']/gi,
    /["']videoUrl["']\s*:\s*["']([^"']+)["']/gi,
    /["']contentUrl["']\s*:\s*["']([^"']+)["']/gi,
    /(https?:\\?\/\\?\/(?:[^"'<>\\]|\\.)*?(?:cdninstagram|fbcdn)(?:[^"'<>\\]|\\.)*?\.mp4(?:[^"'<>\\]|\\.)*)/gi
  ];
  for (const source of variants) for (const pattern of patterns) { pattern.lastIndex=0; let m; while((m=pattern.exec(source))) add(m[1]); }
  const blocks=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) { const text=decodeHtml(block[1]).trim(); if (!text || !/[{[]/.test(text)) continue; const starts=[]; for(let i=0;i<text.length;i++) if(text[i]==='{'||text[i]==='[') starts.push(i); for(const start of starts.slice(0,30)){ try{const obj=JSON.parse(text.slice(start)); const parsed=instagramMediaFromApi(obj); candidates.push(...parsed.media); images.push(...parsed.images); break;}catch{}} }
  const map=new Map(); for(const item of candidates){const key=socialMediaKey(item.url);if(!map.has(key)||(item.bitrate||0)>(map.get(key).bitrate||0))map.set(key,item);} return {media:[...map.values()],images:[...new Set(images)]};
}
async function fetchInstagramEmbedData(url,cookie,steps){
  const code=instagramShortcode(url); if(!code)return {media:[],images:[]}; const type=url.pathname.startsWith('/reel/')?'reel':'p';
  for(const suffix of ['embed/captioned/','embed/']){const target=new URL(`https://www.instagram.com/${type}/${code}/${suffix}`); const response=await fetchSocialPage(target,'instagram',cookie); const html=await response.text(); steps.push(`【INSTAGRAM EMBED】/${type}/${code}/${suffix} 回傳 HTTP ${response.status}，HTML「${html.length}」個字元。`); if(!response.ok)continue; const parsed=collectInstagramEmbedMedia(html); steps.push(`【INSTAGRAM EMBED】深層資料找到「${parsed.media.length}」個目標影片格式。`); if(parsed.media.length)return parsed;} return {media:[],images:[]};
}
async function fetchInstagramLegacyJson(url,cookie,steps){
  const target=new URL(url);target.searchParams.set('__a','1');target.searchParams.set('__d','dis');const headers=new Headers({'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1','Accept':'application/json,text/plain,*/*','X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest','Referer':url.href});if(cookie)headers.set('Cookie',cookie);const response=await fetch(target,{headers,redirect:'follow',cache:'no-store'});const text=await response.text();steps.push(`【INSTAGRAM JSON】__a=1 回傳 HTTP ${response.status}，內容「${text.length}」個字元。`);if(!response.ok)return {media:[],images:[]};try{return instagramMediaFromApi(JSON.parse(text.replace(/^for \\(;;\\);/,'')));}catch{return {media:[],images:[]};}}
async function resolveInstagramFallback(url,html,response,cookie,steps){const graph=await fetchInstagramGraphql(url,html,response,cookie,steps);if(graph.media.length)return graph;const embed=await fetchInstagramEmbedData(url,cookie,steps);if(embed.media.length)return embed;const legacy=await fetchInstagramLegacyJson(url,cookie,steps);return mergeInstagramResults(graph,embed,legacy);}


const IG_CRAWLER_COOLDOWN_MS = 10 * 60 * 1000;
const IG_SESSION_LOCK_COOLDOWN_MS = 30 * 60 * 1000;
let instagramCrawlerBlockedUntil = 0;
let instagramSessionLockedUntil = 0;
const INSTAGRAM_LINK_CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const IG_SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function instagramMediaId(shortcode) {
  if (!shortcode) return "";
  let id = BigInt(0);
  for (const char of shortcode) {
    const value = IG_SHORTCODE_ALPHABET.indexOf(char);
    if (value < 0) return "";
    id = id * BigInt(64) + BigInt(value);
  }
  return id.toString();
}

function instagramCookieValue(cookie, name) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\s*)${name}=([^;]+)`, "i"));
  return match ? match[1] : "";
}

function normalizeInstagramCookie(cookie, csrf = "") {
  const input = String(cookie || "").trim();
  if (!input) return "";
  const order = ["datr", "ig_did", "mid", "csrftoken", "ds_user_id", "rur", "wd", "sessionid"];
  const pairs = [];
  for (const name of order) {
    let value = instagramCookieValue(input, name);
    if (name === "csrftoken" && !value) value = csrf;
    if (value) pairs.push(`${name}=${value}`);
  }
  return pairs.join("; ");
}

function largestInstagramRendition(list) {
  const usable = (Array.isArray(list) ? list : []).filter(item => item && item.url);
  if (!usable.length) return null;
  return usable.reduce((best, item) => {
    const bestArea = Number(best.width || 0) * Number(best.height || 0);
    const itemArea = Number(item.width || 0) * Number(item.height || 0);
    return itemArea > bestArea ? item : best;
  });
}

function instagramCrawlerUrlAfterKey(html, from, key) {
  const keyAt = html.indexOf(key, from);
  if (keyAt < 0 || keyAt - from > 80000) return "";
  const raw = /"url":"(https:.*?)"/.exec(html.slice(keyAt, keyAt + 9000))?.[1];
  if (!raw) return "";
  try { return JSON.parse(`"${raw}"`); } catch { return decodeSocialMediaUrl(raw); }
}

function parseInstagramCrawlerMedia(html, mediaId) {
  const anchors = [`"pk":"${mediaId}"`, `"pk":${mediaId}`, `"id":"${mediaId}`];
  let anchor = -1;
  for (const marker of anchors) { anchor = html.indexOf(marker); if (anchor >= 0) break; }
  if (anchor < 0) return { media: [], images: [] };
  const videoUrl = instagramCrawlerUrlAfterKey(html, anchor, "video_versions");
  const poster = instagramCrawlerUrlAfterKey(html, anchor, "image_versions2");
  if (!videoUrl) return { media: [], images: poster ? [poster] : [] };
  return { media: [{ url: videoUrl, quality: "原始畫質", kind: "影音合一", mimeType: "video/mp4", bitrate: 0 }], images: poster ? [poster] : [] };
}

async function fetchInstagramCrawlerView(url, steps) {
  if (Date.now() < instagramCrawlerBlockedUntil) {
    const seconds = Math.ceil((instagramCrawlerBlockedUntil - Date.now()) / 1000);
    steps.push(`【INSTAGRAM CRAWLER】仍在 HTTP 429 冷卻期，剩餘約「${seconds}」秒。`);
    return { media: [], images: [] };
  }
  const shortcode = instagramShortcode(url);
  const mediaId = instagramMediaId(shortcode);
  if (!shortcode || !mediaId) return { media: [], images: [] };
  const target = new URL(`/reel/${shortcode}/`, "https://www.instagram.com");
  const response = await fetch(target, {
    headers: { "User-Agent": INSTAGRAM_LINK_CRAWLER_UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow", cache: "no-store"
  });
  const html = await response.text();
  steps.push(`【INSTAGRAM CRAWLER】連結預覽頁面回傳 HTTP ${response.status}，HTML「${html.length}」個字元。`);
  if (response.status === 429) {
    instagramCrawlerBlockedUntil = Date.now() + IG_CRAWLER_COOLDOWN_MS;
    steps.push("【INSTAGRAM CRAWLER】已啟用 10 分鐘冷卻，避免持續觸發速率限制。");
    return { media: [], images: [] };
  }
  if (!response.ok || !html) return { media: [], images: [] };
  const parsed = parseInstagramCrawlerMedia(html, mediaId);
  steps.push(`【INSTAGRAM CRAWLER】Media ID ${mediaId}；錨點：${html.includes(`"pk":"${mediaId}"`) || html.includes(`"pk":${mediaId}`) ? "找到" : "未找到"}；video_versions：${html.includes("video_versions") ? "存在" : "不存在"}；目標影片：「${parsed.media.length}」個。`);
  return parsed;
}

function instagramSessionRefusal(data, text) {
  const joined = `${JSON.stringify(data || {})} ${String(text || "")}`.toLowerCase();
  if (joined.includes("checkpoint_required") || joined.includes("challenge_required") || joined.includes("consent_required")) return "checkpoint";
  if (joined.includes("login_required") || joined.includes("not logged in") || joined.includes("please wait")) return "login";
  return "";
}

async function fetchInstagramMediaInfo(url, cookie, pageHtml, pageResponse, steps) {
  if (!cookie) { steps.push("【INSTAGRAM MEDIA API】未提供 IG_COOKIE，略過登入工作階段 API。"); return { media: [], images: [] }; }
  if (Date.now() < instagramSessionLockedUntil) {
    const seconds = Math.ceil((instagramSessionLockedUntil - Date.now()) / 1000);
    steps.push(`【INSTAGRAM MEDIA API】工作階段仍在安全冷卻期，剩餘約「${seconds}」秒。`);
    return { media: [], images: [] };
  }
  const shortcode = instagramShortcode(url);
  const mediaId = instagramMediaId(shortcode);
  if (!mediaId) return { media: [], images: [] };
  const harvestedCsrf = instagramCsrfFromPage(pageHtml, pageResponse, cookie);
  const normalizedCookie = normalizeInstagramCookie(cookie, harvestedCsrf);
  const csrf = instagramCookieValue(normalizedCookie, "csrftoken") || harvestedCsrf;
  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    "Accept": "*/*", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    "Referer": url.href, "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "129477", "Cookie": normalizedCookie
  });
  if (csrf) headers.set("X-CSRFToken", csrf);
  const response = await fetch(`https://www.instagram.com/api/v1/media/${encodeURIComponent(mediaId)}/info/`, { headers, redirect: "follow", cache: "no-store" });
  const text = await response.text();
  steps.push(`【INSTAGRAM MEDIA API】/api/v1/media/${mediaId}/info/ 回傳 HTTP ${response.status}，內容「${text.length}」個字元。`);
  let data = null;
  try { data = JSON.parse(text.replace(/^for \(;;\);/, "")); } catch {}
  const refusal = instagramSessionRefusal(data, text);
  if (refusal === "checkpoint") {
    instagramSessionLockedUntil = Date.now() + IG_SESSION_LOCK_COOLDOWN_MS;
    steps.push("【INSTAGRAM MEDIA API】工作階段要求 checkpoint／challenge，已停止使用 Cookie 30 分鐘以降低帳號風險。");
    return { media: [], images: [] };
  }
  if (!response.ok || !data?.items?.[0]) {
    const message = data?.message || data?.error_title || data?.status || (refusal === "login" ? "登入工作階段已失效" : "沒有 items[0]");
    steps.push(`【INSTAGRAM MEDIA API】未取得媒體：${message}。`);
    return { media: [], images: [] };
  }
  const candidates = [];
  const images = [];
  const queue = [data.items[0]];
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object") continue;
    const video = largestInstagramRendition(item.video_versions);
    if (video?.url) candidates.push({ url: decodeSocialMediaUrl(video.url), quality: video.height ? `${video.height}p` : "原始畫質", kind: "影音合一", mimeType: "video/mp4", bitrate: Number(video.width || 0) * Number(video.height || 0) });
    const image = largestInstagramRendition(item.image_versions2?.candidates);
    if (image?.url) images.push(decodeSocialMediaUrl(image.url));
    if (Array.isArray(item.carousel_media)) queue.push(...item.carousel_media);
  }
  const unique = new Map();
  for (const item of candidates) { const key = socialMediaKey(item.url); const old = unique.get(key); if (!old || item.bitrate > old.bitrate) unique.set(key, item); }
  steps.push(`【INSTAGRAM MEDIA API】找到「${unique.size}」個影片媒體，包含輪播項目。`);
  return { media: [...unique.values()], images: [...new Set(images)] };
}

async function resolveInstagramNative(url, html, response, cookie, steps) {
  const results = [];
  const embed = await fetchInstagramEmbedData(url, cookie, steps);
  results.push(embed);
  if (embed.media.length) return embed;
  const crawler = await fetchInstagramCrawlerView(url, steps);
  results.push(crawler);
  if (crawler.media.length) return crawler;
  const mediaInfo = await fetchInstagramMediaInfo(url, cookie, html, response, steps);
  results.push(mediaInfo);
  return mergeInstagramResults(...results);
}

async function resolveThreadsShare(url, cookie, steps) {
  for (const host of ["www.threads.com", "www.threads.net"]) {
    try {
      const target = new URL(url); target.hostname = host;
      const response = await fetchSocialPage(target, "threads", cookie);
      const finalUrl = new URL(response.url);
      steps.push(`【THREADS】分享網址 ${host} 回傳 HTTP ${response.status}，最終路徑：${finalUrl.pathname}`);
      if (/^\/@[^/]+\/post\/[^/?#]+/i.test(finalUrl.pathname) || /^\/t\/[^/?#]+/i.test(finalUrl.pathname)) { finalUrl.hostname="www.threads.com"; finalUrl.search=""; steps.push(`【THREADS】已轉為貼文永久網址：${finalUrl.pathname}`); return finalUrl; }
      const html = await response.text();
      for (const value of [metaContent(html,"og:url"),metaContent(html,"twitter:url"),(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)||[])[1]]) {
        try { const u=new URL(decodeSocialMediaUrl(value),target); if (/^\/@[^/]+\/post\/[^/?#]+/i.test(u.pathname)) {u.hostname="www.threads.com";u.search="";steps.push(`【THREADS】已從分享頁取得貼文永久網址：${u.pathname}`);return u;} } catch {}
      }
    } catch(e) { steps.push(`【THREADS】分享網址備援失敗：${e.message}。`); }
  }
  return url;
}
async function resolveSocial(value, platform, request, env) {
  const label = platform === "instagram" ? "INSTAGRAM" : "THREADS";
  let url;
  try { url = normalizeSocialUrl(value, platform); }
  catch (error) { return json({ error: error.message, code: `${label}_INVALID_URL`, version: VERSION }, 400); }
  const type = socialContentType(url, platform);
  if (type === "unknown") return json({ error: `${platform === "instagram" ? "Instagram" : "Threads"} 網址不是可辨識的貼文、Reel、Story、Highlight 或短網址。`, code: `${label}_UNSUPPORTED_URL`, version: VERSION }, 400);

  const steps = [`【${label}】已辨識${type === "reel" ? " Reels" : type === "story" ? " Stories" : type === "highlight" ? " Highlights" : type === "share" ? "分享" : "貼文"}網址：${url.pathname}`];
  const cookie = requestMetaCookie(request, env, platform);
  if (platform === "threads" && type === "share") {
    url = await resolveThreadsShare(url, "", steps);
    const validPostPath = /^\/@[^/]+\/post\/[^/?#]+/i.test(url.pathname) || /^\/t\/[^/?#]+/i.test(url.pathname);
    if (!validPostPath) {
      steps.push("【THREADS】分享網址未解析成有效貼文，停止掃描首頁或錯誤頁面的背景媒體。");
      return json({
        platform, contentType: "share", canonicalUrl: "", formats: [], steps, version: VERSION,
        code: "THREADS_SHARE_INVALID",
        error: "Threads 分享網址已失效、貼文不存在，或平台未回傳有效的貼文永久網址。"
      }, 422);
    }
  }
  let response = await fetchSocialPage(url, platform, "");
  let finalUrl = new URL(response.url);
  let html = await response.text();
  steps.push(`【${label}】訪客頁面回傳 HTTP ${response.status}，HTML「${html.length}」個字元。`);
  if (platform === "threads") {
    const validFinalPath = /^\/@[^/]+\/post\/[^/?#]+/i.test(finalUrl.pathname) || /^\/t\/[^/?#]+/i.test(finalUrl.pathname);
    if (!validFinalPath || finalUrl.searchParams.get("error") === "invalid_post") {
      steps.push("【THREADS】最終頁面不是有效貼文，停止掃描背景媒體。");
      return json({ platform, contentType: type, canonicalUrl: "", formats: [], steps, version: VERSION, code: "THREADS_INVALID_POST", error: "Threads 貼文不存在、已失效，或分享網址沒有對應到有效貼文。" }, 422);
    }
  }
  let parsed = collectMetaSocialMedia(html, platform);
  if (platform === "instagram" && ["reel", "post"].includes(type) && !parsed.media.length) {
    steps.push("【INSTAGRAM】靜態 HTML 沒有目標影片，依序嘗試 Embed、Crawler View 與登入 Media API。");
    parsed = await resolveInstagramNative(url, html, response, "", steps);
  }

  const loginRequiredType = type === "story" || type === "highlight";
  if ((!response.ok || socialLoginPage(finalUrl, html, platform) || !parsed.media.length) && cookie) {
    steps.push(`【${label}】訪客頁面未取得影片，使用分頁工作階段或 Worker Secret 再解析一次。`);
    response = await fetchSocialPage(url, platform, cookie);
    finalUrl = new URL(response.url);
    html = await response.text();
    steps.push(`【${label}】登入工作階段頁面回傳 HTTP ${response.status}，HTML「${html.length}」個字元。`);
    parsed = collectMetaSocialMedia(html, platform);
    if (platform === "instagram" && ["reel", "post"].includes(type) && !parsed.media.length) {
      parsed = await resolveInstagramNative(url, html, response, cookie, steps);
    }
  }

  if (!parsed.media.length) {
    const needsSession = loginRequiredType || socialLoginPage(finalUrl, html, platform);
    return json({
      platform, contentType: type, canonicalUrl: finalUrl.href, formats: [], steps, version: VERSION,
      code: needsSession ? `${label}_SESSION_REQUIRED` : `${label}_MEDIA_NOT_FOUND`,
      error: needsSession && !cookie ? `${platform === "instagram" ? "Instagram" : "Threads"} 此內容需要登入工作階段，請在進階設定貼入對應 Cookie。` : undefined,
      note: needsSession ? "登入工作階段不存在、已失效或帳戶沒有觀看權限。" : "頁面已載入，但沒有找到影片；內容可能是純文字、圖片、輪播圖片、已刪除或平台頁面格式已更新。"
    }, needsSession && !cookie ? 401 : 200);
  }

  const formats = parsed.media.map((item, index) => ({
    itag: `${platform}-${index + 1}`,
    quality: item.quality,
    kind: item.kind,
    container: item.mimeType.includes("webm") ? "webm" : "mp4",
    mimeType: item.mimeType,
    codec: "",
    bitrate: item.bitrate || 0,
    contentLength: "",
    source: label,
    url: item.url
  })).sort((a, b) => b.bitrate - a.bitrate);
  const title = cleanFacebookTitle(metaContent(html, "og:title") || metaContent(html, "twitter:title") || `${platform === "instagram" ? "Instagram" : "Threads"} 影片`);
  const thumbnail = parsed.images[0] || "";
  const id = (url.pathname.match(/(?:reel|p|tv|post|t|stories\/[^/]+)\/([^/]+)/i) || [])[1] || `${platform}-${Date.now()}`;
  steps.push(`【${label}】找到「${formats.length}」個影片格式。`);
  return json({ platform, contentType: type, id, canonicalUrl: finalUrl.href, source: label, version: VERSION, code: "OK", title, thumbnail, formats, steps, note: "" });
}

async function metaSocialMedia(request, target, platform, env) {
  let url;
  try { url = new URL(target); } catch { return json({ error: "媒體網址無效。", code: "SOCIAL_MEDIA_INVALID_URL", version: VERSION }, 400); }
  if (url.protocol !== "https:" || !META_MEDIA_SUFFIXES.some(suffix => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix))) {
    return json({ error: "此 Instagram／Threads 媒體網域未列入允許清單。", code: "SOCIAL_MEDIA_DOMAIN_DENIED", version: VERSION }, 403);
  }
  const cookie = requestMetaCookie(request, env, platform);
  const referer = platform === "instagram" ? "https://www.instagram.com/" : "https://www.threads.com/";
  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    "Referer": referer,
    "Accept": "*/*",
    "Accept-Encoding": "identity"
  });
  if (cookie) headers.set("Cookie", cookie);
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  const upstream = await fetch(url, { method: request.method, headers, redirect: "follow", cache: "no-store" });
  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));
  output.set("Cache-Control", "no-store");
  output.set("X-OwO-Version", VERSION);
  output.set("Content-Disposition", `attachment; filename="${platform}-video.mp4"`);
  return new Response(upstream.body, { status: upstream.status, headers: output });
}

function clientProfileByLabel(label) {
  return PLAYER_CLIENTS.find(profile => profile.label === label) || PLAYER_CLIENTS.find(profile => profile.label === "ANDROID");
}

async function freshMediaUrl(id, itag, sourceLabel, steps) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) throw new Error("影片 ID 格式錯誤。");
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=zh-TW&gl=TW`;
  const watchResponse = await fetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6"
    },
    cache: "no-store"
  });
  if (!watchResponse.ok) throw new Error(`重新解析 watch 頁面失敗：HTTP ${watchResponse.status}。`);
  const html = await watchResponse.text();
  const apiKey = configValue(html, "INNERTUBE_API_KEY");
  const visitorData = configValue(html, "VISITOR_DATA");
  if (!apiKey) throw new Error("重新解析時找不到 INNERTUBE_API_KEY。");

  const profile = clientProfileByLabel(sourceLabel);
  let player;
  if (sourceLabel === "WATCH_PAGE") {
    player = extractJsonObject(html, "ytInitialPlayerResponse");
  } else {
    player = await innertubePlayer(apiKey, visitorData, id, profile);
  }
  if (!player) throw new Error("重新解析時沒有取得播放器回應。");

  let format = addressableFormats(player).find(item => String(item.itag) === String(itag));
  if (!format && sourceLabel !== "ANDROID") {
    const android = clientProfileByLabel("ANDROID");
    const androidPlayer = await innertubePlayer(apiKey, visitorData, id, android);
    format = addressableFormats(androidPlayer).find(item => String(item.itag) === String(itag));
    if (format) sourceLabel = "ANDROID";
  }
  if (!format) throw new Error(`重新解析後找不到 itag ${itag} 的可下載位址。`);

  const needsRules = Boolean(format.signatureCipher || format.cipher || (() => {
    try { return new URL(format.url || "").searchParams.has("n"); } catch { return false; }
  })());
  const rules = needsRules ? await loadPlayerRules(html, steps) : { signature: null, n: null };
  const counters = { signature: 0, signatureFailed: 0, n: 0, nFailed: 0 };
  const url = resolveFormatUrl(format, rules, counters);
  if (!url) throw new Error(`itag ${itag} 的即時媒體網址解析失敗。`);
  steps.push(`【即時媒體】已使用 ${sourceLabel} 重新取得 itag ${itag} 的媒體網址。`);
  return { url, sourceLabel };
}

function mediaRequestHeaders(request, sourceLabel) {
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  headers.set("Accept", "*/*");
  headers.set("Accept-Encoding", "identity");
  headers.set("Origin", "https://www.youtube.com");
  headers.set("Referer", "https://www.youtube.com/");
  headers.set(
    "User-Agent",
    sourceLabel === "ANDROID"
      ? "com.google.android.youtube/21.35.35 (Linux; U; Android 14) gzip"
      : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
  );
  return headers;
}

async function media(request, target, id, itag, sourceLabel) {
  let resolvedTarget = target || "";
  const steps = [];

  if (id && itag) {
    const fresh = await freshMediaUrl(id, itag, sourceLabel || "ANDROID", steps);
    resolvedTarget = fresh.url;
    sourceLabel = fresh.sourceLabel;
  }

  let url;
  try {
    url = new URL(resolvedTarget);
  } catch {
    return json({ error: "媒體網址無效。", code: "INVALID_MEDIA_URL", version: VERSION, steps }, 400);
  }

  if (url.protocol !== "https:" || !MEDIA_SUFFIXES.some(suffix => url.hostname.endsWith(suffix))) {
    return json({ error: "此媒體網域未列入允許清單。", code: "MEDIA_DOMAIN_DENIED", version: VERSION, steps }, 403);
  }

  const upstream = await fetch(url, {
    method: request.method,
    headers: mediaRequestHeaders(request, sourceLabel),
    redirect: "follow",
    cache: "no-store"
  });

  if (upstream.status === 403 && id && itag) {
    return json({
      error: "即時重新解析後，Google Video Server 仍拒絕媒體請求。這通常表示目前 Worker 出口或 Client 驗證受到限制。",
      code: "MEDIA_URL_FORBIDDEN",
      version: VERSION,
      steps
    }, 403);
  }

  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));
  output.set("Cache-Control", "no-store");
  output.set("X-OwO-Media-Mode", id && itag ? "fresh" : "legacy");
  output.set("X-OwO-Version", VERSION);

  if (new URL(request.url).searchParams.get("download") === "1") {
    const ext = (new URL(request.url).searchParams.get("ext") || "bin").replace(/[^a-z0-9]/gi, "");
    output.set("Content-Disposition", `attachment; filename="youtube-media.${ext}"`);
  }

  return new Response(upstream.body, { status: upstream.status, headers: output });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      const headers = new Headers(cors());
      const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
      if (requestedHeaders) headers.set("Access-Control-Allow-Headers", requestedHeaders);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 204, headers });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === "/youtube" && request.method === "GET") return await youtube(url.searchParams.get("id"), url.searchParams.get("mode") === "hq" ? "hq" : "quick");
      if (url.pathname === "/facebook" && request.method === "GET") return await facebookResolve(url.searchParams.get("url"), env, request);
      if (url.pathname === "/facebook-media" && ["GET", "HEAD"].includes(request.method)) return await facebookMedia(request, url.searchParams.get("url"), env);
      if (url.pathname === "/instagram" && request.method === "GET") return await resolveSocial(url.searchParams.get("url"), "instagram", request, env);
      if (url.pathname === "/threads" && request.method === "GET") return await resolveSocial(url.searchParams.get("url"), "threads", request, env);
      if (url.pathname === "/social-media" && ["GET", "HEAD"].includes(request.method)) return await metaSocialMedia(request, url.searchParams.get("url"), url.searchParams.get("platform") === "threads" ? "threads" : "instagram", env);
      if (url.pathname === "/media" && ["GET", "HEAD"].includes(request.method)) return await media(request, url.searchParams.get("url"), url.searchParams.get("id"), url.searchParams.get("itag"), url.searchParams.get("source"));
      return json({ service: SERVICE, version: VERSION, architecture: "GitHub Pages + Cloudflare Worker Free", facebookSession: Boolean(env && env.FB_COOKIE), facebookStories: true, instagram: true, threads: true, webCookieInput: true, endpoints: ["GET /youtube?id=VIDEO_ID&mode=quick|hq", "GET /media?id=VIDEO_ID&itag=ITAG&source=CLIENT", "GET /facebook?url=FACEBOOK_URL", "GET /facebook-media?url=MEDIA_URL"] });
    } catch (error) {
      return json({ error: error.message || "Worker 執行失敗", code: "WORKER_INTERNAL_ERROR", version: VERSION }, 500);
    }
  }
};

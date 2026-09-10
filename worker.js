const MEDIA_SUFFIXES = [".googlevideo.com"];
const PLAYER_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

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
    headers: {
      ...cors(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function validVideoId(id) {
  return /^[A-Za-z0-9_-]{11}$/.test(id || "");
}

function extractJsonObject(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) return null;
  const start = source.indexOf("{", markerAt + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) {
      try { return JSON.parse(source.slice(start, index + 1)); }
      catch { return null; }
    }
  }
  return null;
}

function extractPlayerUrl(html) {
  const patterns = [
    /"jsUrl":"([^"]+)"/,
    /"PLAYER_JS_URL":"([^"]+)"/,
    /<script[^>]+src="([^"]+\/base\.js)"/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const decoded = match[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    return new URL(decoded, "https://www.youtube.com").href;
  }
  return null;
}

function findMatchingBrace(source, openAt) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openAt; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return index;
  }
  return -1;
}

function functionBodyByName(js, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}=function\\([^)]*\\)\\{`),
    new RegExp(`function\\s+${escaped}\\([^)]*\\)\\{`)
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(js);
    if (!match) continue;
    const openAt = js.indexOf("{", match.index);
    const closeAt = findMatchingBrace(js, openAt);
    if (closeAt > openAt) return js.slice(openAt + 1, closeAt);
  }
  return null;
}

function extractSignatureFunctionName(js) {
  const patterns = [
    /\.sig\|\|([A-Za-z0-9_$]+)\(/,
    /["']signature["']\s*,\s*([A-Za-z0-9_$]+)\(/,
    /\.set\([^,]+,\s*encodeURIComponent\(([A-Za-z0-9_$]+)\(/,
    /\bc&&\(c=([A-Za-z0-9_$]+)\(decodeURIComponent\(c\)\)\)/
  ];
  for (const pattern of patterns) {
    const match = js.match(pattern);
    if (match) return match[1];
  }
  const fallback = js.match(/([A-Za-z0-9_$]+)=function\([A-Za-z0-9_$]+\)\{[A-Za-z0-9_$]+=[A-Za-z0-9_$]+\.split\(""\)/);
  return fallback?.[1] || null;
}

function helperObject(js, objectName) {
  const escaped = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:var\\s+)?${escaped}=\\{`).exec(js);
  if (!match) return null;
  const openAt = js.indexOf("{", match.index);
  const closeAt = findMatchingBrace(js, openAt);
  return closeAt > openAt ? js.slice(openAt + 1, closeAt) : null;
}

function classifyHelpers(objectBody) {
  const map = new Map();
  const itemPattern = /([A-Za-z0-9_$]+)\s*:\s*function\([^)]*\)\{/g;
  let match;
  while ((match = itemPattern.exec(objectBody))) {
    const openAt = objectBody.indexOf("{", match.index);
    const closeAt = findMatchingBrace(objectBody, openAt);
    if (closeAt < 0) break;
    const body = objectBody.slice(openAt + 1, closeAt);
    let type = null;
    if (/\.reverse\(/.test(body)) type = "reverse";
    else if (/\.splice\(0,/.test(body)) type = "splice";
    else if (/\.slice\(/.test(body)) type = "slice";
    else if (/\[0\].*%.*\.length/.test(body) || /%[A-Za-z0-9_$]+\.length/.test(body)) type = "swap";
    if (type) map.set(match[1], type);
    itemPattern.lastIndex = closeAt + 1;
  }
  return map;
}

function buildTransformPlan(js, functionName) {
  const body = functionBodyByName(js, functionName);
  if (!body || !/\.split\(""\)/.test(body)) return null;
  const objectMatch = body.match(/;([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+)\([A-Za-z0-9_$]+(?:,\d+)?\)/);
  if (!objectMatch) return null;

  const objectName = objectMatch[1];
  const objectBody = helperObject(js, objectName);
  if (!objectBody) return null;
  const helperTypes = classifyHelpers(objectBody);
  const calls = [];
  const callPattern = new RegExp(`${objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.([A-Za-z0-9_$]+)\\([A-Za-z0-9_$]+(?:,(\\d+))?\\)`, "g");
  let call;
  while ((call = callPattern.exec(body))) {
    const type = helperTypes.get(call[1]);
    if (!type) return null;
    calls.push({ type, argument: Number(call[2] || 0) });
  }
  return calls.length ? calls : null;
}

function applyPlan(value, plan) {
  let characters = String(value).split("");
  for (const operation of plan || []) {
    if (operation.type === "reverse") characters.reverse();
    else if (operation.type === "splice" || operation.type === "slice") characters = characters.slice(operation.argument);
    else if (operation.type === "swap" && characters.length) {
      const index = operation.argument % characters.length;
      [characters[0], characters[index]] = [characters[index], characters[0]];
    }
  }
  return characters.join("");
}

function extractNFunctionName(js) {
  const patterns = [
    /\.get\("n"\)\)&&\([A-Za-z0-9_$]+=([A-Za-z0-9_$]+)\([A-Za-z0-9_$]+\)/,
    /\bn&&\(n=([A-Za-z0-9_$]+)\(n\)\)/,
    /\b([A-Za-z0-9_$]+)\([A-Za-z0-9_$]+\),[A-Za-z0-9_$]+\.set\("n"/
  ];
  for (const pattern of patterns) {
    const match = js.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function loadPlayer(playerUrl, steps) {
  if (!playerUrl) return { signaturePlan: null, nPlan: null };
  const cached = PLAYER_CACHE.get(playerUrl);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    steps.push("【Player】已使用快取的解析規則。");
    return cached.value;
  }

  const response = await fetch(playerUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Player JavaScript 回傳 HTTP ${response.status}`);
  const js = await response.text();

  const signatureName = extractSignatureFunctionName(js);
  const nName = extractNFunctionName(js);
  const value = {
    signaturePlan: signatureName ? buildTransformPlan(js, signatureName) : null,
    nPlan: nName ? buildTransformPlan(js, nName) : null
  };
  PLAYER_CACHE.set(playerUrl, { time: Date.now(), value });
  steps.push(`【Player】簽章規則：${value.signaturePlan ? "已解析" : "未找到"}；N 規則：${value.nPlan ? "已解析" : "保留原值"}。`);
  return value;
}

function resolveFormatUrl(format, player) {
  const cipherText = format.signatureCipher || format.cipher;
  let rawUrl = format.url || null;

  if (!rawUrl && cipherText) {
    const params = new URLSearchParams(cipherText);
    rawUrl = params.get("url");
    if (!rawUrl) return null;
    const target = new URL(rawUrl);
    const directSignature = params.get("sig");
    const encryptedSignature = params.get("s");
    const signatureKey = params.get("sp") || "signature";

    if (directSignature) target.searchParams.set(signatureKey, directSignature);
    else if (encryptedSignature && player.signaturePlan) {
      target.searchParams.set(signatureKey, applyPlan(encryptedSignature, player.signaturePlan));
    } else if (encryptedSignature) return null;
    rawUrl = target.href;
  }

  if (!rawUrl) return null;
  const target = new URL(rawUrl);
  const n = target.searchParams.get("n");
  if (n && player.nPlan) target.searchParams.set("n", applyPlan(n, player.nPlan));
  return target.href;
}

function normalize(format, player) {
  const url = resolveFormatUrl(format, player);
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

async function verifyFormat(format) {
  try {
    const url = new URL(format.url);
    if (url.protocol !== "https:" || !MEDIA_SUFFIXES.some(suffix => url.hostname.endsWith(suffix))) return false;
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store"
    });
    const ok = response.status === 200 || response.status === 206;
    await response.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

async function verifyFormats(formats) {
  const output = [];
  const candidates = formats.slice(0, 24);
  for (let index = 0; index < candidates.length; index += 6) {
    const batch = candidates.slice(index, index + 6);
    const results = await Promise.all(batch.map(verifyFormat));
    batch.forEach((format, offset) => { if (results[offset]) output.push(format); });
  }
  return output;
}

async function youtube(id) {
  if (!validVideoId(id)) return json({ error: "影片 ID 格式錯誤" }, 400);
  const steps = [];
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=zh-TW`;
  const response = await fetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6"
    },
    cache: "no-store"
  });
  if (!response.ok) return json({ error: `YouTube 頁面回傳 HTTP ${response.status}` }, 502);
  const html = await response.text();
  steps.push("【解析】已取得 watch 頁面 HTML。");

  const playerResponse = extractJsonObject(html, "ytInitialPlayerResponse");
  if (!playerResponse) return json({ error: "頁面中找不到 ytInitialPlayerResponse", steps }, 422);
  steps.push("【解析】已取得 ytInitialPlayerResponse。");

  const details = playerResponse.videoDetails || {};
  const streaming = playerResponse.streamingData || {};
  const rawFormats = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
  const requiresPlayer = rawFormats.some(format => format.signatureCipher || format.cipher || /[?&]n=/.test(format.url || ""));
  const playerUrl = extractPlayerUrl(html);
  const player = requiresPlayer ? await loadPlayer(playerUrl, steps) : { signaturePlan: null, nPlan: null };

  const resolved = rawFormats
    .map(format => normalize(format, player))
    .filter(Boolean)
    .sort((a, b) => b.bitrate - a.bitrate);
  steps.push(`【解析】已修正「${resolved.length}」個候選網址。`);

  const formats = await verifyFormats(resolved);
  steps.push(`【驗證】「${formats.length}」個 googlevideo 網址可用。`);

  const playability = playerResponse.playabilityStatus || {};
  const reason = playability.reason || playability.messages?.join("；") || "";
  return json({
    id,
    title: details.title || "",
    thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || "",
    lengthSeconds: details.lengthSeconds || "",
    formats,
    steps,
    note: formats.length
      ? ""
      : (reason || "沒有通過驗證的格式。影片可能需要登入、PO Token、地區授權，或目前 Player 規則已更新。")
  });
}

async function media(request, target) {
  let url;
  try { url = new URL(target); }
  catch { return json({ error: "媒體網址無效" }, 400); }

  if (url.protocol !== "https:" || !MEDIA_SUFFIXES.some(suffix => url.hostname.endsWith(suffix))) {
    return json({ error: "此媒體網域未列入允許清單" }, 403);
  }

  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  const upstream = await fetch(url, { method: request.method, headers, redirect: "follow" });
  const output = new Headers(upstream.headers);
  Object.entries(cors()).forEach(([key, value]) => output.set(key, value));

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("download") === "1") {
    const extension = (requestUrl.searchParams.get("ext") || "bin").replace(/[^a-z0-9]/gi, "");
    output.set("Content-Disposition", `attachment; filename="youtube-media.${extension}"`);
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
      return json({
        service: "OwO MO Downloader Worker A1",
        version: "2026.09.10",
        endpoints: ["GET /youtube?id=VIDEO_ID", "GET /media?url=MEDIA_URL"]
      });
    } catch (error) {
      return json({ error: error.message || "Worker 執行失敗" }, 500);
    }
  }
};

"use strict";
const $ = id => document.getElementById(id);
const state = { formats: [], mode: "hq", ffmpeg: null, ffmpegLoaded: false, ffmpegLoading: null, busy: false, videoId: "", baseReady: false, platform: "youtube", fbCookie: "", igCookie: "", thCookie: "" };
const APP_VERSION = "A3.4.5 Runtime Compatibility + Codec HLS Fallback";
const FFMPEG_MODULE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
const FFMPEG_UTIL_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";
const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const MAX_BROWSER_WORK_BYTES = 700 * 1024 * 1024;

function log(message) {
  const time = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  const box = $("log");
  if (box.textContent === "尚未執行。") box.textContent = "";
  box.textContent += `[${time}] ${message}\n`;
  box.scrollTop = box.scrollHeight;
}
function status(message, kind = "idle") {
  const node = $("status");
  node.className = `status ${kind}`;
  node.querySelector("span:last-child").textContent = message;
}
function setProgress(percent, text) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  $("progressBox").classList.remove("hidden");
  $("progressValue").textContent = `${value}%`;
  $("progressBar").style.width = `${value}%`;
  $("progressText").textContent = text;
}
function videoId(value) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      return (url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1] || null;
    }
    return null;
  } catch { return null; }
}
function detectPlatform(value) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) return "youtube";
    if (["facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"].includes(host)) return "facebook";
    if (["instagram.com", "m.instagram.com", "instagr.am"].includes(host)) return "instagram";
    if (["threads.com", "threads.net"].includes(host)) return "threads";
    return "";
  } catch { return ""; }
}

function platformRequestHeaders(platform = state.platform) {
  const headers = { "Cache-Control": "no-cache" };
  if (platform === "facebook" && state.fbCookie) headers["X-FB-Session"] = state.fbCookie;
  if (platform === "instagram" && state.igCookie) headers["X-IG-Session"] = state.igCookie;
  if (platform === "threads") {
    if (state.thCookie) headers["X-TH-Session"] = state.thCookie;
    else if (state.igCookie) headers["X-IG-Session"] = state.igCookie;
  }
  return headers;
}

function setFbSessionUi(applied, message = "") {
  const badge = $("fbSessionBadge");
  badge.textContent = applied ? "此分頁已套用" : "未套用";
  badge.className = `session-badge ${applied ? "on" : "off"}`;
  document.querySelector(".session-card").classList.toggle("applied", applied);
  if (message) $("fbSessionHelp").textContent = message;
}
function normalizeCookieInput(value) {
  return String(value || "").trim().replace(/^cookie\s*:\s*/i, "").replace(/^['"]|['"]$/g, "").trim();
}
function applyFbCookie() {
  const value = normalizeCookieInput($("fbCookie").value);
  if (!value || !/(?:^|;\s*)c_user=/.test(value) || !/(?:^|;\s*)xs=/.test(value)) {
    setFbSessionUi(false, "格式不完整，至少需要 c_user 與 xs。Cookie 不會保存至瀏覽器儲存空間。");
    status("FB_COOKIE 格式不完整，請確認包含 c_user 與 xs。", "error");
    return;
  }
  state.fbCookie = value;
  $("fbCookie").value = "";
  setFbSessionUi(true, "已套用至目前分頁。重新整理或關閉分頁後自動清除；執行紀錄不會顯示 Cookie。 ");
  status("Facebook 登入工作階段已套用至目前分頁。", "success");
  log("Facebook 登入工作階段已套用至目前分頁（內容已隱藏）。");
}
function clearFbCookie() {
  state.fbCookie = "";
  $("fbCookie").value = "";
  $("fbCookie").type = "password";
  $("toggleFbCookie").textContent = "顯示";
  setFbSessionUi(false, "Cookie 已從目前分頁記憶體清除，不會影響 Cloudflare Secret。 ");
  status("Facebook 登入工作階段已從目前分頁清除。", "idle");
  log("Facebook 登入工作階段已從目前分頁清除。");
}
function setSocialSessionUi(platform, applied, message = "") {
  const prefix = platform === "instagram" ? "ig" : "th";
  const badge = $(`${prefix}SessionBadge`);
  badge.textContent = applied ? "此分頁已套用" : "未套用";
  badge.className = `session-badge ${applied ? "on" : "off"}`;
  document.querySelector(`.${prefix}-session-card`).classList.toggle("applied", applied);
  if (message) $(`${prefix}SessionHelp`).textContent = message;
}
function applySocialCookie(platform) {
  const prefix = platform === "instagram" ? "ig" : "th";
  const value = normalizeCookieInput($(`${prefix}Cookie`).value);
  const valid = platform === "instagram" ? /(?:^|;\s*)sessionid=/.test(value) : value.length >= 20;
  if (!valid) {
    setSocialSessionUi(platform, false, platform === "instagram" ? "格式不完整，Instagram Cookie 至少需要 sessionid。" : "Threads Cookie 格式過短，請貼上完整 Header String。");
    status(`${platform === "instagram" ? "Instagram" : "Threads"} Cookie 格式不完整。`, "error");
    return;
  }
  state[platform === "instagram" ? "igCookie" : "thCookie"] = value;
  $(`${prefix}Cookie`).value = "";
  setSocialSessionUi(platform, true, "已套用至目前分頁，重新整理或關閉分頁後會自動清除。");
  status(`${platform === "instagram" ? "Instagram" : "Threads"} 登入工作階段已套用。`, "success");
}
function clearSocialCookie(platform) {
  const prefix = platform === "instagram" ? "ig" : "th";
  state[platform === "instagram" ? "igCookie" : "thCookie"] = "";
  $(`${prefix}Cookie`).value = "";
  setSocialSessionUi(platform, false, "Cookie 已從目前分頁記憶體清除。");
  status(`${platform === "instagram" ? "Instagram" : "Threads"} 登入工作階段已清除。`, "idle");
}
async function analyzeSocial(url, platform) {
  const label = platform === "instagram" ? "Instagram" : "Threads";
  log(`已辨識平台：${label}，開始解析影片頁面。`);
  const response = await fetch(endpoint(`/${platform}`, { url }), { cache: "no-store", headers: platformRequestHeaders(platform) });
  const data = await response.json().catch(() => ({}));
  if (Array.isArray(data.steps)) data.steps.forEach(log);
  if (!response.ok) throw Error(data.error || data.note || `Worker 回傳 HTTP ${response.status}。`);
  const formats = Array.isArray(data.formats) ? data.formats : [];
  if (data.canonicalUrl) log(`${label} 固定內容網址：${data.canonicalUrl}`);
  if (!formats.length) throw Error(data.note || `目前沒有取得 ${label} 影片格式。`);
  state.formats = mergeFormats([], formats);
  state.videoId = data.id || platform;
  state.baseReady = true;
  applyVideoData(data, state.videoId);
  setMode(lists().videoOnly.length && lists().audioOnly.length ? "hq" : "direct");
  status(`${label} 解析完成，共取得「${state.formats.length}」個影片格式。`, "success");
}
function endpoint(path, params = {}) {
  const base = $("worker").value.trim().replace(/\/$/, "");
  if (!base) throw Error("請先在進階設定輸入 Cloudflare Worker 網址。");
  const url = new URL(base + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}
function qualityNumber(format) {
  const match = String(format.quality || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}
function bytes(format) { return Number(format?.contentLength || 0); }
function humanBytes(value) {
  if (!value) return "大小未知";
  const units = ["B", "KiB", "MiB", "GiB"];
  let size = value, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}
function lists() {
  const videoOnly = state.formats.filter(f => f.kind === "僅視訊").sort((a,b) => qualityNumber(b)-qualityNumber(a) || (b.bitrate||0)-(a.bitrate||0));
  const audioOnly = state.formats.filter(f => f.kind === "僅音訊").sort((a,b) => (b.bitrate||0)-(a.bitrate||0));
  const muxed = state.formats.filter(f => f.kind === "影音合一").sort((a,b) => qualityNumber(b)-qualityNumber(a));
  return { videoOnly, audioOnly, muxed };
}
function appendOption(select, format, label) {
  const option = document.createElement("option");
  option.value = String(state.formats.indexOf(format));
  option.textContent = label;
  select.append(option);
}
function populate() {
  const { videoOnly, audioOnly, muxed } = lists();
  const video = $("videoFormat"), audio = $("audioFormat"), direct = $("directFormat");
  video.replaceChildren(); audio.replaceChildren(); direct.replaceChildren();
  videoOnly.forEach(f => appendOption(video, f, displayFormat(f)));
  audioOnly.forEach(f => appendOption(audio, f, displayFormat(f, true)));
  muxed.forEach(f => appendOption(direct, f, displayFormat(f)));
  const hqReady = videoOnly.length && audioOnly.length;
  const directReady = muxed.length;
  if (!hqReady && directReady) setMode("direct");
  else setMode("hq");
  $("formatNote").textContent = hqReady
    ? "高畫質模式會分別下載視訊與音訊，再以 ffmpeg.wasm 在本機合併。檔案越大，手機記憶體需求越高。"
    : directReady ? "目前沒有取得分離式高畫質來源，已切換為完整影片下載。" : "目前沒有可下載的格式。";
  updateButton();
}
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  $("hqOptions").classList.toggle("hidden", mode !== "hq");
  $("directOptions").classList.toggle("hidden", mode !== "direct");
  updateButton();
}
function selected(id) { return state.formats[Number($(id).value)]; }
function updateButton() {
  const { videoOnly, audioOnly, muxed } = lists();
  const ready = state.mode === "hq" ? videoOnly.length && audioOnly.length : muxed.length;
  $("download").disabled = !ready || state.busy;
  $("download").querySelector("span").textContent = "下載影片 MP4";
  const audioButton = $("extractAudio");
  const mp3Button = $("convertMp3");
  const wavButton = $("convertWav");
  const mp3Options = $("mp3Options");
  const completeVideoReady = state.mode === "direct" && muxed.length > 0;
  audioButton.classList.toggle("hidden", !completeVideoReady);
  mp3Button.classList.toggle("hidden", !completeVideoReady);
  wavButton.classList.toggle("hidden", !completeVideoReady);
  mp3Options.classList.toggle("hidden", !completeVideoReady);
  audioButton.disabled = !completeVideoReady || state.busy;
  mp3Button.disabled = !completeVideoReady || state.busy;
  wavButton.disabled = !completeVideoReady || state.busy;
  $("mp3Bitrate").disabled = !completeVideoReady || state.busy;
}
function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}
function explicitMediaIdentity(format) {
  for (const key of ["mediaId", "media_id", "videoId", "video_id", "pk", "assetId", "asset_id"]) {
    const value = format && format[key];
    if (value !== undefined && value !== null && String(value).trim()) return `${key}:${String(value).trim()}`;
  }
  if (Number.isInteger(format?.mediaIndex)) return `index:${format.mediaIndex}`;
  if (Number.isInteger(format?.carouselIndex)) return `carousel:${format.carouselIndex}`;
  if (!format?.url) return "";
  try {
    const url = new URL(format.url);
    for (const key of ["media_id", "mediaid", "video_id", "videoid", "asset_id"]) {
      const value = url.searchParams.get(key);
      if (value && /^[A-Za-z0-9_-]{5,}$/.test(value)) return `${key}:${value}`;
    }
    const efg = decodeBase64UrlJson(url.searchParams.get("efg"));
    const efgId = efg && (efg.video_id || efg.media_id || efg.asset_id);
    if (efgId) return `efg:${efgId}`;
  } catch {}
  return "";
}
function normalizedKind(format) {
  const kind = String(format?.kind || "影音合一");
  return kind === "完整影片" ? "影音合一" : kind;
}
function qualityBucket(format) {
  const height = Number(format?.height || qualityNumber(format) || 0);
  if (height) return `${height}p`;
  const label = String(format?.quality || "原始畫質").trim().toLowerCase();
  if (/^hd$|高畫質/.test(label)) return "hd";
  if (/^sd$|標準畫質/.test(label)) return "sd";
  return label || "original";
}
function codecFamily(format) {
  const codec = String(format?.codec || format?.codecs || "").toLowerCase();
  if (/av01|av1/.test(codec)) return "av1";
  if (/vp9|vp09/.test(codec)) return "vp9";
  if (/avc1|h264/.test(codec)) return "h264";
  if (/hevc|h265|hvc1/.test(codec)) return "hevc";
  if (/opus/.test(codec)) return "opus";
  if (/mp4a|aac/.test(codec)) return "aac";
  return codec || "unknown";
}
function strictFormatKey(format) {
  const platform = state.platform;
  const identity = explicitMediaIdentity(format);
  const kind = normalizedKind(format);
  const quality = qualityBucket(format);
  const container = String(format?.container || "bin").toLowerCase();
  const codec = codecFamily(format);
  if (platform === "youtube") {
    return `youtube:${format.itag || identity || "track"}:${kind}:${quality}:${container}:${codec}`;
  }
  if (identity) return `${platform}:${identity}:${kind}:${quality}:${container}:${codec}`;
  // Meta results without a trustworthy media identity are ambiguous. Collapse
  // equal-quality results into one item instead of treating CDN paths as videos.
  return `${platform}:unidentified:${kind}:${quality}:${container}:${codec}`;
}
function formatPreference(format) {
  const direct = format?.url ? 1 : 0;
  const height = Number(format?.height || qualityNumber(format) || 0);
  const width = Number(format?.width || 0);
  const pixels = height * (width || Math.round(height * 16 / 9));
  const bitrate = Number(format?.bitrate || 0);
  const length = bytes(format);
  const metadata = [format?.mediaId, format?.mediaIndex, format?.width, format?.height, format?.codec].filter(value => value !== undefined && value !== null && value !== "").length;
  return direct * 1e24 + pixels * 1e15 + bitrate * 1e6 + length * 10 + metadata;
}
function annotateMediaGroups(formats) {
  if (state.platform === "youtube") return formats.map(format => ({ ...format, mediaIndex: 1, mediaCount: 1 }));
  const identities = [];
  for (const format of formats) {
    const identity = explicitMediaIdentity(format);
    if (identity && !identities.includes(identity)) identities.push(identity);
  }
  // Only show video numbering when two or more explicit media identities exist.
  const count = identities.length > 1 ? identities.length : 1;
  return formats.map(format => {
    const identity = explicitMediaIdentity(format);
    const index = count > 1 && identity ? identities.indexOf(identity) + 1 : 1;
    return { ...format, kind: normalizedKind(format), mediaIdentity: identity, mediaIndex: index, mediaCount: count };
  });
}
function mergeFormats(current, incoming) {
  const map = new Map();
  for (const raw of [...current, ...incoming]) {
    const format = { ...raw, kind: normalizedKind(raw) };
    const key = strictFormatKey(format);
    const existing = map.get(key);
    if (!existing || formatPreference(format) > formatPreference(existing)) map.set(key, format);
  }
  return annotateMediaGroups([...map.values()]);
}
function mediaPrefix(format) {
  return Number(format?.mediaCount || 1) > 1 ? `影片 ${format.mediaIndex} · ` : "";
}
function displayFormat(format, audio = false) {
  const quality = audio ? `${Math.round((format.bitrate || 0) / 1000) || "未知"} kbps` : format.quality;
  return `${mediaPrefix(format)}${quality} · ${String(format.container || "bin").toUpperCase()} · ${humanBytes(bytes(format))}`;
}
function safeFileToken(value, fallback = "media") {
  const cleaned = String(value || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || fallback;
}
function mediaFileStem(format) {
  const index = Number(format?.mediaCount || 1) > 1 ? `-video-${String(format.mediaIndex).padStart(2, "0")}` : "";
  return `${safeFileToken(state.platform)}${index}-${safeFileToken(format.quality, "original")}`;
}

function applyVideoData(data, id) {
  const details = data || {};
  $("videoInfo").classList.remove("hidden");
  $("title").textContent = details.title || `${state.platform} 影片`;
  $("thumbnail").src = details.thumbnail || "";
  $("thumbnail").alt = details.title ? `${details.title} 縮圖` : "影片縮圖";
  const length = details.lengthSeconds ? ` · ${details.lengthSeconds} 秒` : "";
  $("meta").textContent = `影片 ID：${id || "未知"} · 來源：${String(details.source || state.platform).toUpperCase()} · 可用格式：${state.formats.length} 個${length}`;
  populate();
}
async function analyzeYoutube(id) {
  log(`開始解析影片 ID：${id}`);
  const quickResponse = await fetch(endpoint("/youtube", { id, mode: "quick" }), { cache: "no-store" });
  const quick = await quickResponse.json().catch(() => ({}));
  if (Array.isArray(quick.steps)) quick.steps.forEach(log);
  if (!quickResponse.ok) throw Error(quick.error || quick.note || `Worker 回傳 HTTP ${quickResponse.status}。`);
  state.formats = mergeFormats([], Array.isArray(quick.formats) ? quick.formats : []);
  let finalData = quick;
  if (!state.formats.length || state.mode === "hq") {
    log("【高畫質搜尋】正在蒐集分離視訊、音訊、Codec 與 HLS 備援資訊。");
    const hqResponse = await fetch(endpoint("/youtube", { id, mode: "hq" }), { cache: "no-store" });
    const hq = await hqResponse.json().catch(() => ({}));
    if (Array.isArray(hq.steps)) hq.steps.forEach(log);
    if (hqResponse.ok) {
      state.formats = mergeFormats(state.formats, Array.isArray(hq.formats) ? hq.formats : []);
      finalData = { ...quick, ...hq, title: hq.title || quick.title, thumbnail: hq.thumbnail || quick.thumbnail };
    } else if (!state.formats.length) {
      throw Error(hq.error || hq.note || `高畫質搜尋回傳 HTTP ${hqResponse.status}。`);
    }
  }
  if (!state.formats.length) throw Error(finalData.note || finalData.error || "目前沒有取得可下載的 YouTube 格式。");
  state.videoId = id;
  state.baseReady = true;
  applyVideoData(finalData, id);
  setMode(lists().videoOnly.length && lists().audioOnly.length ? "hq" : "direct");
  status(`YouTube 解析完成，共取得「${state.formats.length}」個格式。`, "success");
}
async function analyze() {
  if (state.busy) return;
  const value = $("youtubeUrl").value.trim();
  const platform = detectPlatform(value);
  if (!platform) { status("請貼上支援的 YouTube、Facebook、Instagram 或 Threads 網址。", "error"); return; }
  try {
    state.busy = true; state.platform = platform; state.formats = []; state.baseReady = false; updateButton();
    status("正在解析影片頁面…", "working");
    if (platform === "youtube") {
      const id = videoId(value); if (!id) throw Error("無法辨識 YouTube 影片 ID。");
      await analyzeYoutube(id);
    } else if (platform === "facebook") {
      log("已辨識平台：Facebook，開始解析影片頁面。");
      const response = await fetch(endpoint("/facebook", { url: value }), { cache: "no-store", headers: platformRequestHeaders("facebook") });
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.steps)) data.steps.forEach(log);
      if (!response.ok) throw Error(data.error || data.note || `Worker 回傳 HTTP ${response.status}。`);
      state.formats = mergeFormats([], Array.isArray(data.formats) ? data.formats : []);
      if (!state.formats.length) throw Error(data.note || "目前沒有取得 Facebook 影片格式。");
      state.videoId = data.id || "facebook"; state.baseReady = true; applyVideoData(data, state.videoId);
      setMode(lists().videoOnly.length && lists().audioOnly.length ? "hq" : "direct");
      status(`Facebook 解析完成，共取得「${state.formats.length}」個格式。`, "success");
    } else await analyzeSocial(value, platform);
  } catch (error) {
    status(String(error.message || error), "error"); log(`解析失敗：${String(error.message || error)}`);
  } finally { state.busy = false; updateButton(); }
}
function mediaEndpoint(format, download = false) {
  if (state.platform === "youtube") return endpoint("/media", { id: state.videoId, itag: format.itag, source: format.source || "ANDROID", ext: format.container || "bin", download: download ? "1" : "0" });
  if (state.platform === "facebook") return endpoint("/facebook-media", { url: format.url });
  return endpoint("/social-media", { url: format.url, platform: state.platform });
}
async function fetchMedia(format, label = "媒體", start = 5, end = 65) {
  const response = await fetch(mediaEndpoint(format), { cache: "no-store", headers: platformRequestHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `${label}下載失敗：HTTP ${response.status}。`);
  }
  const length = Number(response.headers.get("Content-Length") || format.contentLength || 0);
  if (length > MAX_BROWSER_WORK_BYTES) throw Error(`${label}大小 ${humanBytes(length)} 超過瀏覽器安全處理上限。`);
  setProgress(start, `正在下載${label}…`);
  const reader = response.body?.getReader();
  if (!reader) { const data = new Uint8Array(await response.arrayBuffer()); setProgress(end, `${label}下載完成。`); return data; }
  const chunks=[]; let received=0;
  while (true) {
    const {done,value}=await reader.read(); if (done) break;
    chunks.push(value); received += value.byteLength;
    if (received > MAX_BROWSER_WORK_BYTES) { await reader.cancel(); throw Error(`${label}超過瀏覽器安全處理上限。`); }
    if (length) setProgress(start + (end-start)*(received/length), `正在下載${label}：${humanBytes(received)} / ${humanBytes(length)}`);
  }
  const output=new Uint8Array(received); let offset=0; for (const chunk of chunks) { output.set(chunk,offset); offset+=chunk.byteLength; }
  setProgress(end, `${label}下載完成。`); return output;
}
function saveBlob(data, filename, type = "application/octet-stream") {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a"); anchor.href=url; anchor.download=filename; anchor.hidden=true;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function loadFFmpegModules() {
  const [ffmpegModule, utilModule] = await Promise.all([import(FFMPEG_MODULE_URL), import(FFMPEG_UTIL_URL)]);
  if (!ffmpegModule.FFmpeg || !utilModule.toBlobURL) throw Error("FFmpeg ES Module 載入內容不完整。");
  return { FFmpeg: ffmpegModule.FFmpeg, toBlobURL: utilModule.toBlobURL };
}
async function ensureFFmpeg() {
  if (state.ffmpegLoaded && state.ffmpeg) return state.ffmpeg;
  if (state.ffmpegLoading) return state.ffmpegLoading;
  state.ffmpegLoading = (async () => {
    status("首次使用，正在載入 FFmpeg WebAssembly…", "working"); log("【FFMPEG】以 ES Module 延遲載入，不使用會觸發 exports 錯誤的 CommonJS UMD util。");
    const { FFmpeg, toBlobURL } = await loadFFmpegModules();
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => message && log(`【FFMPEG】${message}`));
    ffmpeg.on("progress", ({ progress }) => Number.isFinite(progress) && setProgress(65 + Math.max(0,Math.min(1,progress))*30, "正在執行瀏覽器影音處理…"));
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm")
    });
    state.ffmpeg=ffmpeg; state.ffmpegLoaded=true; log("【FFMPEG】單執行緒核心載入完成。"); return ffmpeg;
  })();
  try { return await state.ffmpegLoading; } finally { state.ffmpegLoading=null; }
}
async function directDownload() {
  const format=selected("directFormat"); if (!format) throw Error("沒有可下載的完整影片格式。");
  const data=await fetchMedia(format,"完整影片",5,92); setProgress(100,"下載完成，正在儲存檔案…");
  saveBlob(data,`${mediaFileStem(format)}.${format.container || "mp4"}`,format.mimeType || "video/mp4"); log(`直接下載完成：${format.quality}/${format.container}。`);
}
async function mergeDownload() {
  const video=selected("videoFormat"), audio=selected("audioFormat");
  if (!video || !audio) throw Error("高畫質合併需要視訊與音訊格式。");
  const estimated=(bytes(video)+bytes(audio))*3; if (estimated > MAX_BROWSER_WORK_BYTES) throw Error(`預估合併記憶體 ${humanBytes(estimated)} 超過安全上限。`);
  const [videoData,audioData]=await Promise.all([fetchMedia(video,"高畫質視訊",3,31),fetchMedia(audio,"音訊",32,58)]);
  const ffmpeg=await ensureFFmpeg(); const videoExt=video.container || "mp4", audioExt=audio.container || "m4a";
  const v=`input-video.${videoExt}`, a=`input-audio.${audioExt}`, o="merged-video.mp4";
  await ffmpeg.writeFile(v,videoData); await ffmpeg.writeFile(a,audioData);
  setProgress(65,"正在合併視訊與音訊…");
  let copied=true;
  try { await ffmpeg.exec(["-i",v,"-i",a,"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",o]); }
  catch { copied=false; await ffmpeg.exec(["-i",v,"-i",a,"-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","veryfast","-c:a","aac","-b:a","192k","-movflags","+faststart",o]); }
  const output=await ffmpeg.readFile(o); await Promise.allSettled([ffmpeg.deleteFile(v),ffmpeg.deleteFile(a),ffmpeg.deleteFile(o)]);
  setProgress(100,"高畫質合併完成，正在儲存檔案…"); saveBlob(output,`${mediaFileStem(video)}.mp4`,"video/mp4"); log(`高畫質合併完成：${copied ? "保留原始視訊" : "相容性轉碼"}。`);
}

async function prepareCompleteVideoForAudio(format, start = 2, end = 56) {
  if (!format) throw Error("沒有可處理音訊的影片格式。");
  const mediaData = await fetchMedia(format, "影片", start, end);
  const estimated = mediaData.byteLength * 3;
  if (estimated > MAX_BROWSER_WORK_BYTES) {
    throw Error(`預估音訊處理記憶體約 ${humanBytes(estimated)}，超過瀏覽器安全上限。請選擇較小的影片格式。`);
  }
  return mediaData;
}

function selectedMp3Bitrate() {
  const allowed = new Set([128, 192, 256, 320]);
  const value = Number($("mp3Bitrate").value);
  return allowed.has(value) ? value : 192;
}

function updateMp3BitrateUi() {
  const bitrate = selectedMp3Bitrate();
  const descriptions = {
    128: "節省容量，適合語音與一般行動聆聽。",
    192: "適合一般聆聽與檔案大小平衡。",
    256: "較高音質，適合音樂保存。",
    320: "最高位元率，檔案容量也最大。"
  };
  $("mp3BitrateHelp").textContent = `目前選擇：${bitrate} kbps，${descriptions[bitrate]}`;
  $("convertMp3").querySelector("span").textContent = `轉換音訊 MP3｜${bitrate} kbps`;
}

async function convertWav() {
  if (state.busy) return;
  const format = selected("directFormat");
  if (!format) {
    status("沒有可轉換音訊的影片格式。", "error");
    return;
  }
  try {
    state.busy = true;
    updateButton();
    status("正在下載影片並轉換為 WAV…", "working");
    log(`開始將影片音訊轉換為 WAV：${format.quality}/${format.container}。`);
    const mediaData = await prepareCompleteVideoForAudio(format);
    const estimatedWavBytes = mediaData.byteLength * 5;
    if (estimatedWavBytes > MAX_BROWSER_WORK_BYTES) {
      throw Error(`WAV 為未壓縮格式，預估處理記憶體約 ${humanBytes(estimatedWavBytes)}，超過瀏覽器安全上限。請選擇較小的影片格式。`);
    }
    const ffmpeg = await ensureFFmpeg();
    const inputExt = format.container || "mp4";
    const inputName = `wav-source.${inputExt}`;
    const outputName = "converted-audio.wav";
    await ffmpeg.writeFile(inputName, mediaData);
    setProgress(70, "正在將音訊轉換為 WAV…");
    await ffmpeg.exec([
      "-i", inputName,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "pcm_s16le",
      "-ar", "44100",
      "-ac", "2",
      outputName
    ]);
    const output = await ffmpeg.readFile(outputName);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    if (!output || !output.length) throw Error("影片中沒有可轉換的音訊軌。");
    setProgress(100, "WAV 轉換完成，正在儲存檔案…");
    saveBlob(output, `${mediaFileStem(format)}-audio.wav`, "audio/wav");
    status("WAV 轉換完成，檔案已交給瀏覽器儲存。", "success");
    log("WAV 轉換完成：PCM 16-bit、44.1 kHz、立體聲。");
  } catch (error) {
    const message = String(error.message || error).includes("matches no streams")
      ? "影片中沒有可轉換的音訊軌。"
      : String(error.message || error);
    status(message, "error");
    log(`WAV 轉換失敗：${message}`);
  } finally {
    state.busy = false;
    updateButton();
  }
}

async function convertMp3() {
  if (state.busy) return;
  const format = selected("directFormat");
  if (!format) {
    status("沒有可轉換音訊的影片格式。", "error");
    return;
  }
  try {
    state.busy = true;
    updateButton();
    status("正在下載影片並轉換為 MP3…", "working");
    log(`開始將影片音訊轉換為 MP3：${format.quality}/${format.container}。`);
    const bitrate = selectedMp3Bitrate();
    const mediaData = await prepareCompleteVideoForAudio(format);
    const ffmpeg = await ensureFFmpeg();
    const inputExt = format.container || "mp4";
    const inputName = `mp3-source.${inputExt}`;
    const outputName = "converted-audio.mp3";
    await ffmpeg.writeFile(inputName, mediaData);
    setProgress(70, "正在將音訊轉換為 MP3…");
    await ffmpeg.exec([
      "-i", inputName,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", `${bitrate}k`,
      "-ar", "44100",
      "-ac", "2",
      outputName
    ]);
    const output = await ffmpeg.readFile(outputName);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    if (!output || !output.length) throw Error("影片中沒有可轉換的音訊軌。");
    setProgress(100, "MP3 轉換完成，正在儲存檔案…");
    saveBlob(output, `${mediaFileStem(format)}-audio-${bitrate}kbps.mp3`, "audio/mpeg");
    status("MP3 轉換完成，檔案已交給瀏覽器儲存。", "success");
    log(`MP3 轉換完成：${bitrate} kbps、44.1 kHz、立體聲。`);
  } catch (error) {
    const message = String(error.message || error).includes("matches no streams")
      ? "影片中沒有可轉換的音訊軌。"
      : String(error.message || error);
    status(message, "error");
    log(`MP3 轉換失敗：${message}`);
  } finally {
    state.busy = false;
    updateButton();
  }
}

async function extractAudio() {
  if (state.busy) return;
  const format = selected("directFormat");
  if (!format) {
    status("沒有可提取音訊的完整影片格式。", "error");
    return;
  }
  try {
    state.busy = true;
    updateButton();
    status("正在下載完整影片並提取音訊…", "working");
    log(`開始從完整影片提取音訊：${format.quality}/${format.container}。`);
    const mediaData = await prepareCompleteVideoForAudio(format, 2, 58);
    const ffmpeg = await ensureFFmpeg();
    const inputExt = format.container || "mp4";
    const inputName = `audio-source.${inputExt}`;
    const outputName = "extracted-audio.m4a";
    await ffmpeg.writeFile(inputName, mediaData);
    setProgress(72, "正在從完整影片提取音訊…");
    let copied = true;
    try {
      await ffmpeg.exec(["-i", inputName, "-map", "0:a:0", "-vn", "-c:a", "copy", outputName]);
    } catch {
      copied = false;
      await ffmpeg.exec(["-i", inputName, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", outputName]);
    }
    const output = await ffmpeg.readFile(outputName);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    if (!output || !output.length) throw Error("完整影片中沒有可提取的音訊軌。");
    setProgress(100, "音訊提取完成，正在儲存 M4A…");
    saveBlob(output, `${mediaFileStem(format)}-audio.m4a`, "audio/mp4");
    status("音訊提取完成，M4A 已交給瀏覽器儲存。", "success");
    log(`音訊提取完成：${copied ? "保留原始音訊品質" : "轉換為 AAC 192 kbps"}。`);
  } catch (error) {
    status(error.message.includes("matches no streams") ? "完整影片內沒有可提取的音訊軌。" : error.message, "error");
    log(`音訊提取失敗：${error.message}`);
  } finally {
    state.busy = false;
    updateButton();
  }
}

async function download() {
  if (state.busy) return;
  try {
    state.busy = true; updateButton();
    status(state.mode === "hq" ? "正在準備高畫質下載與合併…" : "正在下載影片…", "working");
    await (state.mode === "hq" ? mergeDownload() : directDownload());
    status("處理完成，檔案已交給瀏覽器儲存。", "success");
  } catch (error) {
    status(error.message, "error"); log(`處理失敗：${error.message}`);
  } finally { state.busy = false; updateButton(); }
}

$("analyze").onclick = analyze;
$("download").onclick = download;
$("extractAudio").onclick = extractAudio;
$("convertMp3").onclick = convertMp3;
$("convertWav").onclick = convertWav;
$("mp3Bitrate").onchange = updateMp3BitrateUi;
updateMp3BitrateUi();
$("youtubeUrl").onkeydown = event => { if (event.key === "Enter") analyze(); };
$("clearLog").onclick = () => $("log").textContent = "尚未執行。";
$("videoFormat").onchange = updateButton;
$("audioFormat").onchange = updateButton;
$("directFormat").onchange = updateButton;
$("fbCookieForm").onsubmit = event => { event.preventDefault(); applyFbCookie(); };
$("clearFbCookie").onclick = clearFbCookie;
$("toggleFbCookie").onclick = () => {
  const input = $("fbCookie");
  input.type = input.type === "password" ? "text" : "password";
  $("toggleFbCookie").textContent = input.type === "password" ? "顯示" : "隱藏";
};
$("igCookieForm").onsubmit = event => { event.preventDefault(); applySocialCookie("instagram"); };
$("clearIgCookie").onclick = () => clearSocialCookie("instagram");
$("thCookieForm").onsubmit = event => { event.preventDefault(); applySocialCookie("threads"); };
$("clearThCookie").onclick = () => clearSocialCookie("threads");
for (const prefix of ["ig", "th"]) {
  $(`toggle${prefix === "ig" ? "Ig" : "Th"}Cookie`).onclick = () => {
    const input = $(`${prefix}Cookie`);
    input.type = input.type === "password" ? "text" : "password";
  };
}
document.querySelectorAll(".mode").forEach(button => button.onclick = () => setMode(button.dataset.mode));
$("worker").value = localStorage.getItem("workerUrl") || "";

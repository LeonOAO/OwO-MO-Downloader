"use strict";
const $ = id => document.getElementById(id);
const state = { formats: [], mode: "hq", ffmpeg: null, ffmpegLoaded: false, busy: false, videoId: "", baseReady: false, platform: "youtube", fbCookie: "", igCookie: "", thCookie: "" };
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
  videoOnly.forEach(f => appendOption(video, f, `${f.quality} · ${f.container.toUpperCase()} · ${humanBytes(bytes(f))}`));
  audioOnly.forEach(f => appendOption(audio, f, `${Math.round((f.bitrate||0)/1000)||"未知"} kbps · ${f.container.toUpperCase()} · ${humanBytes(bytes(f))}`));
  muxed.forEach(f => appendOption(direct, f, `${f.quality} · ${f.container.toUpperCase()} · ${humanBytes(bytes(f))}`));
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
function mergeFormats(current, incoming) {
  const map = new Map();
  for (const format of [...current, ...incoming]) {
    let key;
    if (["instagram", "threads"].includes(state.platform) && format.url) {
      try { const u = new URL(format.url); key = `${u.hostname}${u.pathname}|${format.kind || ""}`; }
      catch { key = `${format.url}|${format.kind || ""}`; }
    } else key = `${format.itag || ""}|${format.mimeType || ""}|${format.quality || ""}|${format.kind || ""}`;
    if (!map.has(key) || (!map.get(key).url && format.url)) map.set(key, format);
  }
  return [...map.values()];
}

function applyVideoData(data, id) {
  if (data.title) $("title").textContent = data.title;
  if (data.thumbnail) $("thumbnail").src = data.thumbnail;
  else if (!$("thumbnail").src) $("thumbnail").src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  $("videoInfo").classList.remove("hidden");
  $("downloadPanel").classList.remove("hidden");
  $("meta").textContent = `影片 ID：${id} · 來源：${data.source || "目前保留"} · 可用格式：${state.formats.length} 個`;
  populate();
}

async function requestPhase(id, mode) {
  const response = await fetch(endpoint("/youtube", { id, mode }), { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (Array.isArray(data.steps)) data.steps.forEach(log);
  return { response, data };
}

async function searchHighQuality(id) {
  log("已保留基本下載格式，開始自動搜尋高畫質分離視訊與音訊。");
  status("已保留基本格式，正在自動搜尋高畫質…", "working");
  try {
    const { response, data } = await requestPhase(id, "hq");
    const incoming = Array.isArray(data.formats) ? data.formats : [];
    if (incoming.length) {
      state.formats = mergeFormats(state.formats, incoming);
      applyVideoData(data, id);
    }
    const { videoOnly, audioOnly } = lists();
    if (videoOnly.length && audioOnly.length) {
      setMode("hq");
      status(`高畫質搜尋完成，已保留基本格式並找到「${videoOnly.length}」個視訊及「${audioOnly.length}」個音訊格式。`, "success");
      log("高畫質搜尋成功，已合併格式清單，原有基本格式保持可用。");
      return;
    }
    const reason = data.note || data.error || (response.ok ? "目前沒有取得可合併的高畫質分離格式。" : `Worker 回傳 HTTP ${response.status}。`);
    setMode("direct");
    status(`基本格式仍可下載；高畫質搜尋未成功：${reason}`, "success");
    log(`高畫質搜尋未成功，但基本格式已保留：${reason}`);
  } catch (error) {
    setMode("direct");
    status(`基本格式仍可下載；高畫質搜尋發生錯誤：${error.message}`, "success");
    log(`高畫質搜尋錯誤，但基本格式未清除：${error.message}`);
  }
}

async function analyzeFacebook(url) {
  log("已辨識平台：Facebook，開始解析公開影片頁面。");
  const response = await fetch(endpoint("/facebook", { url }), { cache: "no-store", headers: platformRequestHeaders("facebook") });
  const data = await response.json().catch(() => ({}));
  if (Array.isArray(data.steps)) data.steps.forEach(log);
  if (!response.ok) throw Error(data.error || `Worker 回傳 HTTP ${response.status}。`);
  const formats = Array.isArray(data.formats) ? data.formats : [];
  if (data.canonicalUrl) log(`Facebook 固定影片網址：${data.canonicalUrl}`);
  if (!formats.length) throw Error(data.note || "目前沒有取得 Facebook 公開影片格式。");
  state.formats = mergeFormats([], formats);
  state.videoId = data.id || "facebook";
  state.baseReady = true;
  applyVideoData(data, state.videoId);
  const facebookLists = lists();
  if (facebookLists.videoOnly.length && facebookLists.audioOnly.length) setMode("hq");
  else setMode("direct");
  status(`Facebook 解析完成，共取得「${state.formats.length}」個影片格式。`, "success");
  log(`Facebook 解析完成，共取得「${state.formats.length}」個格式。`);
}

async function analyzeYouTube(url) {
  const id = videoId(url);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error("這不是可辨識的 YouTube 網址。");
  state.videoId = id;
  log(`開始解析影片 ID：${id}`);
  const { response, data } = await requestPhase(id, "quick");
  if (!response.ok) throw Error(data.error || `Worker 回傳 HTTP ${response.status}。`);
  const quickFormats = Array.isArray(data.formats) ? data.formats : [];
  if (!quickFormats.length) throw Error(data.note || "目前沒有取得可直接下載的基本格式。");
  state.formats = mergeFormats([], quickFormats);
  state.baseReady = true;
  applyVideoData(data, id);
  setMode("direct");
  status(`已取得「${state.formats.length}」個基本格式，正在自動搜尋高畫質…`, "success");
  log(`基本解析完成，已先保留「${state.formats.length}」個可下載格式。`);
  await searchHighQuality(id);
}

async function analyze() {
  const button = $("analyze");
  try {
    button.disabled = true;
    state.formats = [];
    state.baseReady = false;
    $("progressBox").classList.add("hidden");
    const input = $("youtubeUrl").value.trim();
    const platform = detectPlatform(input);
    if (!platform) throw Error("目前支援 YouTube、Facebook、Instagram 與 Threads 的影片網址。");
    state.platform = platform;
    localStorage.setItem("workerUrl", $("worker").value.trim());
    status(platform === "youtube" ? "正在尋找可直接下載的基本格式…" : `正在解析 ${platform === "facebook" ? "Facebook" : platform === "instagram" ? "Instagram" : "Threads"} 影片…`, "working");
    if (platform === "facebook") await analyzeFacebook(input);
    else if (platform === "instagram" || platform === "threads") await analyzeSocial(input, platform);
    else await analyzeYouTube(input);
  } catch (error) {
    if (state.baseReady && state.formats.length) {
      setMode("direct");
      status(`基本格式仍可下載；後續處理失敗：${error.message}`, "success");
      log(`後續處理失敗，但基本格式未清除：${error.message}`);
    } else {
      status(error.message, "error");
      log(`解析失敗：${error.message}`);
    }
  } finally { button.disabled = false; }
}

async function fetchMedia(format, label, from, to) {
  setProgress(from, `正在下載${label}…`);
  const mediaEndpoint = state.platform === "facebook"
    ? endpoint("/facebook-media", { url: format.url })
    : ["instagram", "threads"].includes(state.platform)
      ? endpoint("/social-media", { platform: state.platform, url: format.url })
      : endpoint("/media", {
        id: state.videoId,
        itag: format.itag,
        source: format.source || "ANDROID",
        ext: format.container || "bin"
      });
  const response = await fetch(mediaEndpoint, { cache: "no-store", headers: ["facebook", "instagram", "threads"].includes(state.platform) ? platformRequestHeaders() : undefined });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (Array.isArray(detail.steps)) detail.steps.forEach(log);
    throw Error(detail.error || `${label}下載失敗：HTTP ${response.status}。`);
  }
  const total = Number(response.headers.get("Content-Length")) || bytes(format);
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = []; let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.length;
    if (total) setProgress(from + (received / total) * (to - from), `正在下載${label}… ${humanBytes(received)} / ${humanBytes(total)}`);
  }
  const result = new Uint8Array(received); let offset = 0;
  chunks.forEach(chunk => { result.set(chunk, offset); offset += chunk.length; });
  return result;
}
async function ensureFFmpeg() {
  if (state.ffmpegLoaded) return state.ffmpeg;
  if (!window.FFmpegWASM || !window.FFmpegUtil) throw Error("ffmpeg.wasm 核心載入失敗，請確認網路可存取 unpkg.com。");
  setProgress(62, "正在載入 ffmpeg.wasm 核心…");
  const { FFmpeg } = window.FFmpegWASM;
  const { toBlobURL } = window.FFmpegUtil;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => setProgress(70 + progress * 27, "正在合併視訊與音訊…"));
  const core = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${core}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${core}/ffmpeg-core.wasm`, "application/wasm")
  });
  state.ffmpeg = ffmpeg; state.ffmpegLoaded = true;
  return ffmpeg;
}
function saveBlob(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function mergeDownload() {
  const video = selected("videoFormat"), audio = selected("audioFormat");
  if (!video || !audio) throw Error("缺少可用的視訊或音訊格式。");
  const estimated = (bytes(video) + bytes(audio)) * 3;
  if (estimated && estimated > MAX_BROWSER_WORK_BYTES) throw Error(`預估合併記憶體約 ${humanBytes(estimated)}，超過瀏覽器安全上限。請選擇較低畫質。`);
  log(`高畫質合併：視訊 ${video.quality}/${video.container}，音訊 ${audio.quality}/${audio.container}。`);
  const videoData = await fetchMedia(video, "視訊", 2, 32);
  const audioData = await fetchMedia(audio, "音訊", 32, 60);
  const ffmpeg = await ensureFFmpeg();
  const videoExt = video.container || "mp4", audioExt = audio.container || "m4a";
  const videoName = `input-video.${videoExt}`, audioName = `input-audio.${audioExt}`, outputName = "output.mp4";
  await ffmpeg.writeFile(videoName, videoData);
  await ffmpeg.writeFile(audioName, audioData);
  const audioCompatible = /mp4|m4a|aac/.test(audioExt) || /mp4a|aac/i.test(audio.codec || "");
  const args = audioCompatible
    ? ["-i", videoName, "-i", audioName, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart", outputName]
    : ["-i", videoName, "-i", audioName, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputName];
  await ffmpeg.exec(args);
  const output = await ffmpeg.readFile(outputName);
  await Promise.allSettled([ffmpeg.deleteFile(videoName), ffmpeg.deleteFile(audioName), ffmpeg.deleteFile(outputName)]);
  setProgress(100, "合併完成，正在儲存 MP4…");
  saveBlob(output, `${state.platform}-${video.quality}.mp4`, "video/mp4");
  log(`合併完成：${video.quality} MP4。`);
}
async function directDownload() {
  const format = selected("directFormat");
  if (!format) throw Error("沒有可直接下載的格式。");
  const data = await fetchMedia(format, "影片", 2, 95);
  setProgress(100, "下載完成，正在儲存檔案…");
  saveBlob(data, `${state.platform}-${format.quality}.${format.container || "mp4"}`, format.mimeType || "video/mp4");
  log(`直接下載完成：${format.quality}/${format.container}。`);
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
    saveBlob(output, `${state.platform}-${format.quality}-audio.wav`, "audio/wav");
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
    saveBlob(output, `${state.platform}-${format.quality}-audio-${bitrate}kbps.mp3`, "audio/mpeg");
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
    saveBlob(output, `${state.platform}-${format.quality}-audio.m4a`, "audio/mp4");
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
$("applyFbCookie").onclick = applyFbCookie;
$("clearFbCookie").onclick = clearFbCookie;
$("toggleFbCookie").onclick = () => {
  const input = $("fbCookie");
  input.type = input.type === "password" ? "text" : "password";
  $("toggleFbCookie").textContent = input.type === "password" ? "顯示" : "隱藏";
};
$("fbCookie").onkeydown = event => { if (event.key === "Enter") applyFbCookie(); };
$("applyIgCookie").onclick = () => applySocialCookie("instagram");
$("clearIgCookie").onclick = () => clearSocialCookie("instagram");
$("applyThCookie").onclick = () => applySocialCookie("threads");
$("clearThCookie").onclick = () => clearSocialCookie("threads");
for (const prefix of ["ig", "th"]) {
  $(`toggle${prefix === "ig" ? "Ig" : "Th"}Cookie`).onclick = () => {
    const input = $(`${prefix}Cookie`);
    input.type = input.type === "password" ? "text" : "password";
  };
}
document.querySelectorAll(".mode").forEach(button => button.onclick = () => setMode(button.dataset.mode));
$("worker").value = localStorage.getItem("workerUrl") || "";

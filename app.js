"use strict";
const $ = id => document.getElementById(id);
const state = { formats: [], mode: "hq", ffmpeg: null, ffmpegLoaded: false, busy: false };
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
    : directReady ? "目前沒有取得分離式高畫質來源，已切換為影音合一直接下載。" : "目前沒有可下載的格式。";
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
  $("download").querySelector("span").textContent = state.mode === "hq" ? "下載並合併 MP4" : "直接下載 MP4";
}
async function analyze() {
  const button = $("analyze");
  try {
    button.disabled = true;
    status("正在解析播放器資料…", "working");
    const id = videoId($("youtubeUrl").value);
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error("這不是可辨識的 YouTube 網址。");
    localStorage.setItem("workerUrl", $("worker").value.trim());
    log(`開始解析影片 ID：${id}`);
    const response = await fetch(endpoint("/youtube", { id }), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (Array.isArray(data.steps)) data.steps.forEach(log);
    if (!response.ok) throw Error(data.error || `Worker 回傳 HTTP ${response.status}。`);
    state.formats = Array.isArray(data.formats) ? data.formats : [];
    $("title").textContent = data.title || `YouTube ${id}`;
    $("thumbnail").src = data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    $("meta").textContent = `影片 ID：${id} · 來源：${data.source || "未知"} · 可用格式：${state.formats.length} 個`;
    $("videoInfo").classList.remove("hidden");
    $("downloadPanel").classList.remove("hidden");
    populate();
    if (!state.formats.length) throw Error(data.note || "目前沒有可下載格式。");
    status(`解析完成，共取得「${state.formats.length}」個可用格式。`, "success");
    log(`解析完成，共取得「${state.formats.length}」個可用格式。`);
  } catch (error) {
    status(error.message, "error");
    log(`解析失敗：${error.message}`);
  } finally { button.disabled = false; }
}
async function fetchMedia(format, label, from, to) {
  setProgress(from, `正在下載${label}…`);
  const response = await fetch(endpoint("/media", { url: format.url }), { cache: "no-store" });
  if (!response.ok) throw Error(`${label}下載失敗：HTTP ${response.status}。`);
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
  saveBlob(output, `youtube-${video.quality}.mp4`, "video/mp4");
  log(`合併完成：${video.quality} MP4。`);
}
async function directDownload() {
  const format = selected("directFormat");
  if (!format) throw Error("沒有可直接下載的格式。");
  const data = await fetchMedia(format, "影片", 2, 95);
  setProgress(100, "下載完成，正在儲存檔案…");
  saveBlob(data, `youtube-${format.quality}.${format.container || "mp4"}`, format.mimeType || "video/mp4");
  log(`直接下載完成：${format.quality}/${format.container}。`);
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
$("youtubeUrl").onkeydown = event => { if (event.key === "Enter") analyze(); };
$("clearLog").onclick = () => $("log").textContent = "尚未執行。";
$("videoFormat").onchange = updateButton;
$("audioFormat").onchange = updateButton;
$("directFormat").onchange = updateButton;
document.querySelectorAll(".mode").forEach(button => button.onclick = () => setMode(button.dataset.mode));
$("worker").value = localStorage.getItem("workerUrl") || "";

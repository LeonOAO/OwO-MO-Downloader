const $ = id => document.getElementById(id);

const state = {
  formats: [],
  type: "video"
};

function log(message) {
  const time = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  const box = $("log");
  if (box.textContent === "尚未執行。") box.textContent = "";
  box.textContent += `[${time}] ${message}\n`;
  box.scrollTop = box.scrollHeight;
}

function status(message, className = "idle") {
  const node = $("status");
  node.className = `status ${className}`;
  node.querySelector("span:last-child").textContent = message;
}

function extractVideoId(input) {
  const value = String(input || "").trim();
  const idPattern = /^[A-Za-z0-9_-]{11}$/;

  if (idPattern.test(value)) return value;

  let normalized = value;
  if (/^(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return idPattern.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const queryId = url.searchParams.get("v") || "";
      if (idPattern.test(queryId)) return queryId;

      const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
      if (match) return match[1];
    }
  } catch {
    return null;
  }

  return null;
}

function endpoint(path, params = {}) {
  const base = $("worker").value.trim().replace(/\/$/, "");
  if (!base) throw new Error("請先在進階設定輸入 Cloudflare Worker 網址");
  const url = new URL(base + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

function numericQuality(format) {
  const match = String(format.quality || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function available() {
  return state.type === "video"
    ? state.formats.filter(format => format.kind === "影音合一" && format.mimeType?.startsWith("video/"))
    : state.formats.filter(format => format.kind === "僅音訊" || format.mimeType?.startsWith("audio/"));
}

function updateButton() {
  const text = state.type === "video" ? "下載 MP4" : `下載音訊（${$("bitrate").value} kbps）`;
  $("download").querySelector("span").textContent = text;
}

function populate() {
  const list = available();
  const quality = $("quality");
  quality.replaceChildren();

  if (state.type === "video") {
    list.sort((a, b) => numericQuality(b) - numericQuality(a));
    for (const format of list) {
      const option = document.createElement("option");
      option.value = state.formats.indexOf(format);
      option.textContent = `${format.quality} · ${format.container.toUpperCase()} · 影音合一`;
      quality.append(option);
    }
  } else {
    list.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    for (const format of list) {
      const option = document.createElement("option");
      option.value = state.formats.indexOf(format);
      option.textContent = `${Math.round((format.bitrate || 0) / 1000) || "未知"} kbps · ${format.container.toUpperCase()} 來源`;
      quality.append(option);
    }
  }

  const none = !list.length;
  $("download").disabled = none;
  $("formatNote").textContent = none
    ? (state.type === "video"
      ? "目前沒有可用的影音合一格式。高畫質通常為影音分離格式。"
      : "目前沒有可用的音訊來源。")
    : (state.type === "video"
      ? "已完成 Player JS、簽章與 N 參數處理，並只列出 Worker 驗證成功的格式。"
      : "目前會保留 YouTube 音訊來源格式；真正 MP3 轉碼仍需加入 ffmpeg.wasm。自訂 kbps 不會改變來源音質。");
  updateButton();
}

async function analyze() {
  const button = $("analyze");
  try {
    button.disabled = true;
    const id = extractVideoId($("youtubeUrl").value);
    if (!id) throw new Error("無法從輸入內容取得有效的 YouTube 影片 ID");

    localStorage.setItem("workerUrl", $("worker").value.trim());
    status("【解析】正在取得影片資訊。", "working");
    log(`開始解析影片 ID：${id}`);

    const response = await fetch(endpoint("/youtube", { id }), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Worker 回傳 HTTP ${response.status}`);

    for (const item of data.steps || []) log(item);
    state.formats = Array.isArray(data.formats) ? data.formats : [];
    $("title").textContent = data.title || `YouTube ${id}`;
    $("thumbnail").src = data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    $("meta").textContent = `影片 ID：${id} · 可用格式：${state.formats.length} 個`;
    $("videoInfo").classList.remove("hidden");
    $("convertPanel").classList.remove("hidden");
    populate();

    if (!state.formats.length) throw new Error(data.note || "沒有通過驗證的可用影音格式");
    status(`【完成】找到「${state.formats.length}」個可用格式。`, "success");
    log(`解析完成：${state.formats.length} 個可用格式`);
    $("convertPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status(`【失敗】${error.message}。`, "error");
    log(`解析失敗：${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function download() {
  try {
    const index = Number($("quality").value);
    const format = state.formats[index];
    if (!format) throw new Error("沒有可下載的格式");

    status(`【下載】正在驗證「${format.quality}」格式。`, "working");
    const test = await fetch(endpoint("/media", { url: format.url }), {
      headers: { Range: "bytes=0-65535" },
      cache: "no-store"
    });
    if (![200, 206].includes(test.status)) throw new Error(`媒體驗證失敗：HTTP ${test.status}`);
    await test.body?.cancel();

    const anchor = document.createElement("a");
    anchor.href = endpoint("/media", {
      url: format.url,
      download: "1",
      ext: state.type === "video" ? "mp4" : (format.container || "m4a")
    });
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    status("【下載】已交由瀏覽器處理。", "success");
    log(`開始下載：${state.type} / ${format.quality} / ${format.container}`);
  } catch (error) {
    status(`【失敗】${error.message}。`, "error");
    log(`下載失敗：${error.message}`);
  }
}

$("analyze").onclick = analyze;
$("download").onclick = download;
$("youtubeUrl").onkeydown = event => { if (event.key === "Enter") analyze(); };
$("clearLog").onclick = () => $("log").textContent = "尚未執行。";
$("bitrate").onchange = updateButton;
document.querySelectorAll(".type-option").forEach(button => button.onclick = () => {
  document.querySelectorAll(".type-option").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  state.type = button.dataset.type;
  $("qualityGroup").classList.remove("hidden");
  $("bitrateGroup").classList.toggle("hidden", state.type !== "audio");
  populate();
});
$("worker").value = localStorage.getItem("workerUrl") || "";

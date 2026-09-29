# OwO 平台影音｜小幫手 v1.0

此完整版本包含前端、Cloudflare Worker 與同源 FFmpeg WebAssembly 資源。

## 本版重點

- YouTube 分段下載從 `contentLength`、Google Video `clen`、`Content-Range` 與 Worker 回傳標頭判斷完整總長度。
- 不再因第一個 256 KiB 區段回傳 HTTP 200 而誤判下載完成。
- 未知總長度時會繼續要求下一段，直到短末段、空末段或 HTTP 416。
- 合併前記錄並檢查視訊與音訊的預期大小及實際大小。
- FFmpeg 主 Worker、Core JS 與 WASM 全部包含在 `FFmpeg/`，由 GitHub Pages 同源載入。
- 不再從外部 CDN 建立 FFmpeg Worker。

## 部署

請將整個 `OwO-MO-Downloader-main` 目錄完整部署，不可遺漏 `FFmpeg/`。

```text
FFmpeg/
├── ffmpeg/
│   ├── index.js
│   ├── classes.js
│   ├── worker.js
│   ├── const.js
│   ├── errors.js
│   ├── types.js
│   └── utils.js
└── core/
    ├── ffmpeg-core.js
    └── ffmpeg-core.wasm
```

GitHub Pages 必須以正常 MIME 類型提供 `.js` 與 `.wasm`。首次使用合併或音訊轉換時，瀏覽器會下載約 31 MiB 的 WASM 核心並快取。

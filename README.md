# OwO 平台影音｜小幫手 v1.0

此版本包含完整前端、Cloudflare Worker、YouTube Media Session 修正，以及同源 FFmpeg WebAssembly 資源。

## YouTube Media Session 修正

- 解析完成後為每個格式建立「精確 Session 索引」與「影片/itag/Client 格式備援索引」。
- 前端媒體請求會攜帶 Session ID，紀錄只顯示前 8 碼供診斷。
- 若 Cache API 因節點差異未命中，會使用解析回應內同一格式的已驗證媒體網址，不會立即啟動 WATCH 刷新。
- 快取、格式備援及解析網址都不存在時回傳 `MEDIA_SESSION_MISS` 與 HTTP 409，要求重新解析。
- 只有 Google Video Server 明確拒絕既有網址後，才沿用解析階段 API Key、Visitor Data 與 Client 直接呼叫 Player API 刷新，不重新執行 WATCH。
- 直接 Player 刷新失敗使用 HTTP 422；未捕捉的程式例外才使用 HTTP 500。
- 媒體工作階段期限為 1800 秒。

## 完整媒體與 FFmpeg

- 從 `contentLength`、`clen`、`Content-Range` 及 `X-OwO-Media-Total` 判定媒體總長度。
- 不會把第一個 256 KiB 測試區段誤判為完整檔案。
- 合併前檢查影音預期大小與實際大小。
- `FFmpeg/` 包含主 Worker、Core JS 與 WASM，全部從網站同源載入。
- `classWorkerURL` 已明確指定為 `FFmpeg/ffmpeg/worker.js`。

## 部署結構

```text
OwO-MO-Downloader-main/
├── index.html
├── app.css
├── app.js
├── worker.js
└── FFmpeg/
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

必須完整部署 `FFmpeg/`，且大小寫不可更改。

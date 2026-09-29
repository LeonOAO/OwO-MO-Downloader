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


### YouTube 自動重試解析失敗
- 進階設定新增「YouTube 自動重試解析失敗」核取方塊。
- 可設定重試上限為 1、3 或 5 次，預設 3 次。
- 每次重新解析前固定等待 5 秒，不採用累進等待。
- 觸發條件包含 `YOUTUBE_PLAYER_RESPONSE_MISSING`、`YOUTUBE_RATE_LIMITED`、`YOUTUBE_PAGE_UNAVAILABLE`、`AUTH_REQUIRED` 與 `NO_MEDIA_ADDRESS`。
- 「WATCH 重試已達上限」及「所有 YouTube 解析來源均未取得可用媒體位址，部分來源要求登入」都會觸發。
- 重新解析成功、達到重試上限或遇到非指定錯誤時停止。
- 勾選狀態與重試上限會保存在目前瀏覽器的本機設定。


### 舊格式快取與等效格式續傳修正
- 精確 Session 未命中時，優先使用本次解析回應攜帶的已驗證網址。
- 格式備援索引最多接受 60 秒，超過即跳過，不再使用數分鐘前的舊網址。
- 已知總長度前收到 HTTP 416 時，保留前面已下載區段並從原位移續傳。
- 原 Client 找不到原 itag 時，依媒體類型、解析度、FPS、容器、Codec 與 bitrate 搜尋等效格式。
- 原 Client 無結果時，依序嘗試 ANDROID_VR、ANDROID、IOS、WEB 與 TV Player Client，不重新執行 WATCH。


### 自動重試設定介面修正
- 移除自動重試核取方塊下方的額外說明文字。
- 調整重試上限下拉選單的高度、內距、行高與箭頭位置，避免選項文字被裁切。
- 桌面與行動版皆保留完整的 1 次、3 次、5 次選項。


### 自訂重試次數與標點修正
- 修正自動重試原因訊息末尾重複出現兩個句點。
- 重試上限改為數字欄位，可使用上下箭頭或直接輸入 1 至 99 次。
- 預設仍為 3 次，每次重試前固定等待 5 秒。

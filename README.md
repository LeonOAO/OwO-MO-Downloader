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


### 2 MiB 正式分段與媒體區段重試
- 解析階段實載驗證維持 256 KiB。
- 正式下載區段提高為 2 MiB，降低大型媒體的總請求次數。
- 單一區段遇到 HTTP 403 或 416 時，先以相同網址與 Range 重試，等待時間依序為 500 ms、1000 ms。
- 原生 Range 連續三次失敗後再嘗試 URL Range。
- 仍失敗時才清除單一格式快取並執行直接 Player 刷新。
- 直接 Player 無格式時，最後執行一次完整 WATCH + 高畫質 Client 刷新，成功後從原 Range 位移續傳。


### 固定五段正式下載
- 不論媒體大小，完整視訊與音訊均依總長度平均切成固定 5 段。
- 每段正常只發出 1 次媒體請求。
- 單段遭 HTTP 403 或 416 時，只執行 1 次直接 Player 刷新並重試該段 1 次。
- 下載階段不再進行同區段多次重試、URL Range 備援或完整 WATCH 刷新。
- 解析階段的 256 KiB 實載驗證維持不變。


### 單一 Worker 呼叫內固定五段串流
- 瀏覽器下載一條視訊或音訊時只呼叫 Worker 一次。
- Worker 在同一次執行內依序完成 5 個上游 Range，並串流回傳瀏覽器。
- 不再依賴五個瀏覽器請求之間的 Cache API Session 命中。
- 任一段遭 403 或 416 時，整條媒體軌最多直接 Player 刷新一次；不重新 WATCH。


### 高畫質區段同一次 Worker 執行
- 新增 `/youtube-hq-segment`，每個 5 MiB 區段在同一次 Worker 執行內呼叫原始 Client Player API、取得指定 itag 並立即下載 Range。
- 不使用 Media Session Cache、analysis-fallback 或解析階段保存的媒體網址。
- 每段嚴格比對 itag、類型、解析度、FPS、容器、Codec 與 contentLength。
- 暫時未取得格式時，前端保留已完成區段並依設定每 5 秒重試。
- 360p 影音合一同工作階段下載完整保留。


### VISIONOS SABR／UMP 高畫質下載
- VISIONOS 為第一順位高畫質 Client；ANDROID_VR 僅作最後備援。
- VISIONOS 只提供 `serverAbrStreamingUrl` 時，Worker 會使用 GoogleVideo 4.1.1 的 `SabrStream` 實作處理 UMP／SABR。
- 解析階段會確認分離視訊、分離音訊、`serverAbrStreamingUrl` 與 `videoPlaybackUstreamerConfig` 完整後，直接採用 VISIONOS 並停止後續 Client。
- SABR 下載不使用傳統 GoogleVideo URL、Media Session Cache、5 MiB Range 或 ANDROID_VR。
- 視訊與音訊仍分別回傳前端，沿用既有瀏覽器 FFmpeg 合併、M4A、MP3 與 WAV 流程。
- 360p 影音合一仍使用已驗證的 ANDROID 同工作階段下載。

### 建置 Worker
完整可維護來源位於 `WorkerSource.js`。部署用 `worker.js` 已完成 bundle。重新建置：

```bash
npm install
npm run build:worker
```


### VISIONOS SABR Session 延續
- 解析階段取得完整 VISIONOS SABR Context 後，以 Media Session ID 保存 `serverAbrStreamingUrl`、`videoPlaybackUstreamerConfig` 與原始格式清單。
- 視訊與音訊下載優先命中同一份 SABR Context；Session 未命中或過期才重新呼叫 VISIONOS Player API。
- 下載檢查日誌分別顯示 Session、Player 狀態、可用 itag、Streaming URL 與 Ustreamer Config。
- 錯誤碼拆分為 `SABR_SESSION_EXPIRED`、`SABR_SELECTED_ITAG_MISSING`、`SABR_STREAMING_URL_MISSING`、`SABR_USTREAMER_CONFIG_MISSING` 與 `SABR_PAIR_MISSING`。


### FFmpeg ES Module Core 與統一紀錄格式
- `FFmpeg/core/ffmpeg-core.js` 已切換為與 Module Worker 相容的 ES Module Core，修正 `failed to import ffmpeg-core.js`。
- `ffmpeg-core.wasm` 維持相同核心版本與 SHA-256，載入時由同源 URL 明確指定。
- FFmpeg 載入前會分別記錄 Class Worker、ES Module Core 與 WebAssembly URL，便於部署診斷。
- 所有執行紀錄統一為 `[時間] 【分類】內容`。未帶分類的既有訊息會自動補上 `【系統】`。
- 影片解析起始紀錄統一為 `【開始解析影片】ID：VIDEO_ID`，錯誤統一為 `【處理失敗】錯誤內容`。


#### v1.5 VISIONOS SABR 完整軌道修正
- SABR 視訊與音訊改為單軌模式下載，不再於每次請求同時下載兩軌後丟棄其中一軌。
- Worker 回傳預期媒體大小、預期時間與單軌模式診斷標頭。
- 前端依預期 contentLength 顯示真實進度，串流結束後執行完整大小驗證。
- 下載資料未達預期大小時，明確標示覆蓋率並停止 FFmpeg 合併，不再把第一批 SABR 片段誤記為完整影片。
- SabrStream 分段重試上限提高為 8 次，停滯檢測維持 30 秒。

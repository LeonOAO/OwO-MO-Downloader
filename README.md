# OwO MO Downloader A3.4.5 Runtime Compatibility + Codec HLS Fallback

版本：2026.09.11-A3.4.5-Runtime-Compatibility-Codec-HLS-Fallback

## 修正

- 移除會造成 `exports is not defined` 的 FFmpeg UMD util 全域腳本。
- 第一次使用合併或音訊轉換時，才以 ES Module 延遲載入 FFmpeg。
- 使用單執行緒 `@ffmpeg/core`，不要求 SharedArrayBuffer。
- 補回完整 `analyze`、`applyVideoData`、`fetchMedia`、`ensureFFmpeg`、`directDownload`、`mergeDownload` 與 `saveBlob` 執行流程。
- Facebook、Instagram、Threads Cookie 密碼欄位均置於獨立表單，消除瀏覽器 DOM 警告。
- 表單 Submit 只套用至目前分頁，不重新整理頁面。
- JS 與 CSS 加入 A3.4.5 快取版本參數。

## YouTube

- 保留 A3.4.4 Client Matrix、SABR、PO Token Context、Visitor Data 與 Data Sync ID 診斷。
- 新增 YTSTUDIO_ANDROID、YTMUSIC_ANDROID Client 候選。
- 每個 Client 額外記錄 HLS、DASH、SABR 是否存在。
- 保留 Signature、N 參數、即時 Google Video URL 更新及高畫質瀏覽器端合併。

## 保留

Facebook Story 深層欄位與 Story ID 錨定、Instagram Crawler View、Instagram Media API、Threads 分享網址、四平台嚴格去重、MP4、M4A、MP3、WAV 全部保留。

# OwO 平台影音｜小幫手 v1.0.2

公開版本：v1.0.2

內部建置：2026.09.15-youtube-media-session-cache

## YouTube 高畫質下載修正

- 修正解析結果遺失來源 Client 的問題。每個格式現在保留 `source`、`width`、`height` 與 `fps`。
- 前端下載 `/media` 時會傳入解析當下取得的短效 Google Video URL，不再一開始就重新解析。
- Worker 解析成功後，會以 Cache API 暫存每個 `影片 ID + itag + Client` 的媒體網址 120 秒。
- `/media` 的優先順序：解析當下 URL → 短效工作階段快取 → 指定 Client 即時重新解析。
- 既有 URL 若回傳 HTTP 403，才清除快取並執行一次即時重新解析。
- 指定 itag 在第二次回應消失時，會依媒體種類、解析度、FPS 與 Codec 選擇等效格式。
- `ANDROID_VR` 高畫質格式下載時會使用正確來源 Client，不再預設回退成 `ANDROID`。
- 360p 影音合一直接下載維持不變。
- Cobalt 維持完全移除。

## 保留功能

Facebook Stories、Instagram Crawler View、Instagram Media API、Threads 分享網址、四平台嚴格去重、MP4、M4A、MP3、WAV、FFmpeg ES Module 延遲載入、Cookie 表單與手機版介面均完整保留。

## 更新檔案

本版必須同步更新 `app.js`、`worker.js` 與 `index.html`。建議直接使用完整 ZIP 覆蓋全部檔案。

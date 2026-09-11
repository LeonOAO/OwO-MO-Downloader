# OwO MO Downloader A3.4.3 Strict Deduplication

版本：2026.09.11-A3.4.3-Strict-Deduplication

## 嚴格去重

- YouTube、Facebook、Instagram、Threads 全部套用嚴格媒體去重。
- Meta 平台只有可靠的 media ID、輪播索引或資產 ID 不同時，才視為不同影片。
- 缺少可靠媒體識別的相同畫質、容器、Codec 與媒體種類會合併為一筆。
- 不再以不同 CDN 路徑、短效簽章、到期時間或預載 URL 判斷為不同影片。
- 同一影片的不同畫質、不同 Codec、完整影片／僅視訊／僅音訊仍保留。
- 真正多影片貼文會顯示「影片 1、影片 2……」。
- 單一影片不顯示多餘序號。
- 下載 MP4、M4A、MP3、WAV 檔名同步支援多影片序號。

## 更新檔案

本版核心去重位於 `app.js`，必須更新 `app.js`。

版本同步建議一併更新：

- `index.html`
- `worker.js`

完整 ZIP 已包含全部最新版檔案。

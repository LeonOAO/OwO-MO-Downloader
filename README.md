# OwO MO Downloader A3.3.12 Instagram GraphQL

版本：2026.09.11-A3.3.12-Instagram-GraphQL

## 修正內容

- Instagram 公開 Reel／貼文的靜態 HTML 沒有媒體時，改用 shortcode 執行 PolarisPostRootQuery。
- 使用目前 2026 年資料結構 `xdt_api__v1__media__shortcode__web_info`，遞迴提取 `video_url` 與 `video_versions`。
- 從頁面、Set-Cookie 或 IG_COOKIE 取得 CSRF Token。
- GraphQL 匿名查詢失敗且已提供 IG_COOKIE 時，再使用登入工作階段查詢一次。
- 媒體依 CDN 路徑去重，避免首頁或預載區塊造成重複格式。
- 保留 Threads 嚴格分享網址判定、四平台標籤、MP4、M4A、MP3 位元率與 WAV 功能。

## 部署

本次核心修正位於 `worker.js`，可只更新 Worker。完整 ZIP 同步提供全部最新版檔案。

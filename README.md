# OwO 平台影音｜小幫手 v1.0.0

公開版本：v1.0.0

內部建置：2026.09.14-youtube-all-mode-router-fix

## 顯示調整

- 移除首頁的「GitHub Pages + Cloudflare Worker」架構文字。
- 移除首頁的 A3.x 技術版本名稱。
- 對外版本重新從 `v1.0.0` 開始。
- 瀏覽器分頁標題只顯示「OwO 平台影音｜小幫手」。
- Worker 根網址回傳公開版本 `1.0.0`，另保留 `build` 供維護時追查實際建置。

## 功能基準

本版完整保留原 A3.4.8 的功能：

- YouTube `mode=quick|hq|all` 路由修正
- YouTube 單一工作階段 Client Matrix
- Facebook 一般影片、Reels 與 Stories
- Instagram Crawler View 與 Media API
- Threads 分享網址處理
- 四平台嚴格去重
- MP4、M4A、MP3、WAV
- FFmpeg ES Module 延遲載入
- Cookie 表單與手機版介面

## 後續版本規則

- 功能修正：`v1.0.1`、`v1.0.2`
- 向下相容的新功能：`v1.1.0`
- 大型架構或不相容更新：`v2.0.0`

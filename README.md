# OwO MO Downloader A3.4.1 Instagram Crawler Media API

版本：2026.09.11-A3.4.1-Instagram-Crawler-Media-API

## 架構

維持原本架構：GitHub Pages + 單一 Cloudflare Worker。本機不安裝 Python、Node.js、Docker、Cobalt、瀏覽器擴充功能或其他程式。

## Instagram 解析順序

1. 公開頁面靜態媒體資料。
2. Instagram Embed 頁面。
3. Link Crawler View，使用連結預覽 User-Agent 搜尋目標 Media ID 附近的 `video_versions`。
4. 提供 IG_COOKIE 時，使用 shortcode 直接換算 Media ID，呼叫 `/api/v1/media/<id>/info/`。
5. Private Media API 支援 `video_versions` 與 `carousel_media`，每個項目挑選最大解析度。

## 工作階段保護

- Crawler View 遇到 HTTP 429 後冷卻 10 分鐘。
- Cookie 工作階段遇到 `checkpoint_required`、`challenge_required` 或 `consent_required` 後冷卻 30 分鐘。
- Cookie 只會送往 `www.instagram.com` 與 Meta CDN，不會傳給第三方 API。
- 不儲存 Cookie、媒體網址或解析結果。

## 已移除

- COBALT_API_URL
- COBALT_API_AUTH
- `/cobalt-media`
- Cobalt 前端來源判斷

## 更新檔案

本版同步更新：

- `worker.js`
- `app.js`
- `index.html`

`app.css` 功能未變，但完整 ZIP 已包含最新版。

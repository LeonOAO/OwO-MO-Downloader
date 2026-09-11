# OwO MO Downloader A3.3.0 IG + Threads

版本：2026.09.11-A3.3.0-IG-Threads

## 支援平台

- YouTube
- Facebook
- Instagram
- Threads

## Instagram 網址正規化

- `/reel/{shortcode}`
- `/reels/{shortcode}`
- `/p/{shortcode}`
- `/tv/{shortcode}`
- `/stories/{username}/{story-id}`
- `/stories/highlights/{highlight-id}`
- `instagr.am` 舊短網域
- 自動移除 `igsh`、`igshid`、`utm_*`、`fbclid` 等追蹤參數

## Threads 網址正規化

- `threads.com/@username/post/{shortcode}`
- `threads.net/@username/post/{shortcode}`
- `threads.com/t/{shortcode}`
- `threads.net/t/{shortcode}`
- 自動移除 `xmt`、`utm_*` 與 `fbclid` 等追蹤參數

## 工作階段

- `FB_COOKIE` 或 `X-FB-Session`
- `IG_COOKIE` 或 `X-IG-Session`
- `TH_COOKIE` 或 `X-TH-Session`
- Threads 未提供 Cookie 時，可使用 Instagram 工作階段備援
- 靜態網頁 Cookie 僅存在目前分頁記憶體

## 解析方式

- 公開內容優先匿名解析
- 解析 Open Graph、Twitter Card、video_url、video_versions、contentUrl、playable_url 與 CDN MP4
- 匿名沒有影片時，才使用分頁 Cookie 或 Cloudflare Secret 再解析一次
- 媒體下載由 Worker 代理，僅允許 Instagram、Threads 與 Meta CDN 白名單
- 圖片、純文字與無影片輪播會回傳明確的 MEDIA_NOT_FOUND

## 部署

完整更新 `worker.js`、`index.html`、`app.js`、`app.css`。Cloudflare Secret 可選擇新增 `IG_COOKIE` 與 `TH_COOKIE`。

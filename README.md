# OwO MO Downloader A3.1 HQ

版本：2026.09.11-A3.2.0-FB-Public

## 部署

1. 將 `worker.js` 完整部署到 Cloudflare Worker。
2. 將 `index.html`、`app.js`、`app.css` 放到 GitHub Pages 發布目錄。
3. 開啟網站，在「進階設定」填入 Worker 根網址。
4. 解析影片後，若同時取得「僅視訊」與「僅音訊」，即可使用高畫質合併。

## 工作方式

- Worker 蒐集各播放器 Client 的可用格式。
- 高畫質通常為分離式視訊與音訊。
- 前端分別下載兩條串流。
- ffmpeg.wasm 在瀏覽器內合併並輸出 MP4。
- 若只有影音合一格式，介面自動切換為直接下載。

## 限制

- 手機瀏覽器不適合合併大型或長時間影片。
- 預估工作記憶體超過 700 MiB 時，前端會停止並要求選擇較低畫質。
- ffmpeg.wasm 核心由 unpkg CDN 載入。
- Cloudflare Worker 的 YouTube 出口仍可能遇到 HTTP 429 或 LOGIN_REQUIRED。
- 媒體網址有時效性，解析後應盡快下載。

## A3.1.1 自動高畫質流程

1. 先以快速階段尋找 360p 或其他影音合一格式。
2. 成功後立即保存至前端狀態並顯示下載選項。
3. 前端自動呼叫高畫質階段。
4. 高畫質階段成功時，追加分離視訊與音訊格式。
5. 高畫質階段失敗、429、403 或要求登入時，保留原有基本格式及影片資訊。

## A3.1.2 媒體 403 修正

- 前端下載時不再直接重用解析階段產生的 googlevideo URL。
- `/media` 改以 `id + itag + source` 即時重新解析。
- 在同一個 Worker 請求內取得新媒體網址並立即向 Google Video Server 串流。
- 依播放器來源補上 Android 或瀏覽器 User-Agent、Origin、Referer 與 Range。
- 若即時重新解析後仍為 403，回傳 `MEDIA_URL_FORBIDDEN` 與明確診斷。

## A3.2 Facebook 公開影片

- 自動辨識 YouTube 與 Facebook 網址。
- 支援 Facebook 公開影片、公開 Reels、fb.watch 與 share/v 重新導向。
- 從公開頁面的 Open Graph 與影片資料尋找 HD／SD MP4。
- Facebook 格式使用 Cloudflare Worker 代理下載。
- 不接收 Facebook 帳號、密碼或 Cookie。
- 私人、朋友限定、社團限定與需要登入的影片不在本版範圍。

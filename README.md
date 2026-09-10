# OwO MO Downloader A3.1 HQ

版本：2026.09.10-A3.1.0-HQ

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

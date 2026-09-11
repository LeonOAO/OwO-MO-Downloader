# OwO MO Downloader A3.3.1 Platform Fix

版本：2026.09.11-A3.3.1-Platform-Fix

## 修正內容

- 修正 `app.js` 仍顯示「目前僅支援 YouTube 與 Facebook網址」的舊版訊息。
- 首頁直接標示 YouTube、Facebook、Instagram 與 Threads，不再只寫「Meta」。
- 平台辨識支援各平台官方子網域，不再只比對少數固定主機名稱。
- Instagram 支援 `instagram.com`、其官方子網域與 `instagr.am` 舊短網域。
- Threads 支援 `threads.com`、`threads.net` 與相應官方子網域。
- Instagram 與 Threads 下載檔名不再錯誤命名為 `youtube-*`。
- Worker 根網址的 endpoints 清單加入 Instagram、Threads 與 social-media。

## 支援平台

- YouTube
- Facebook
- Instagram
- Threads

## 部署

本次必須同步更新：

- `index.html`
- `app.js`
- `worker.js`

建議直接使用完整 ZIP 覆蓋 `index.html`、`app.js`、`app.css`、`worker.js` 與 `README.md`，避免版本混用。

## 驗證

Worker 根網址應顯示：

```json
{
  "version": "2026.09.11-A3.3.1-Platform-Fix",
  "instagram": true,
  "threads": true
}
```

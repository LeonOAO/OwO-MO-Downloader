# OwO MO Downloader A3.2.8 FB Web Cookie

版本：2026.09.11-A3.2.8-FB-Web-Cookie

## 新增功能

- 在 GitHub Pages 的「進階設定」加入 FB_COOKIE 輸入區。
- 支援顯示／隱藏、套用至目前分頁與清除。
- 至少檢查 `c_user` 與 `xs` 是否存在。
- 自動移除誤貼的 `Cookie:` 前綴與外層引號。
- Cookie 僅保存在目前分頁的 JavaScript 記憶體。
- 不寫入網址、localStorage、sessionStorage、IndexedDB、GitHub、ZIP 或執行紀錄。
- 重新整理或關閉分頁後自動清除。
- Facebook 解析與媒體下載均透過 `X-FB-Session` Header 傳送同一工作階段。
- Worker 優先使用網頁本次提供的 Cookie，未提供時才使用 Cloudflare Secret `FB_COOKIE`。

## 部署

1. 完整部署 `worker.js` 至 Cloudflare Worker。
2. 完整覆蓋 GitHub Pages 的 `index.html`、`app.js`、`app.css`。
3. 清除網站快取並重新開啟頁面。
4. 在「進階設定」貼上 Cookie，按「套用至此分頁」。
5. 再解析 Facebook Stories 或登入限定影片。

## Worker 驗證

Worker 根網址應顯示：

```json
{
  "version": "2026.09.11-A3.2.8-FB-Web-Cookie",
  "facebookStories": true,
  "webCookieInput": true
}
```

## Cookie 格式

```text
c_user=...; xs=...; datr=...; fr=...;
```

不要加入 `Cookie:` 前綴。即使誤貼，前端也會嘗試自動移除。

## 注意

- Cookie 具有登入工作階段效力，只適合在自己控制的裝置與網站使用。
- 瀏覽器開發者工具的 Network 面板仍能看到送往自己 Worker 的 Request Header。
- 請勿在共用裝置上使用，離開前按「清除」並關閉分頁。
- Cloudflare Worker 的一般請求標頭大小限制仍適用；Cookie 過長時可能遭平台拒絕。
- 原有 YouTube、Facebook 公開影片、Reels、Stories、HD／SD、DASH 與 ffmpeg.wasm 功能均保留。

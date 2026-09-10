# OwO MO Downloader

更新日期：2026-09-10

## 本次修正

Worker 解析順序更新為播放頁直接格式、InnerTube ANDROID_VR、InnerTube TVHTML5。若一般播放頁只回傳需要簽章轉換的格式，會自動嘗試其他播放器模式取得已簽署的 Google Video 串流網址。

## 更新方式

1. GitHub 根目錄覆蓋 `index.html`、`app.js`、`app.css`、`.nojekyll`。
2. Cloudflare Worker 的 Edit code 內完整覆蓋新版 `worker.js`，再按 Deploy。
3. 直接開啟 Worker 網址，確認 `updated` 顯示 `2026-09-10`。
4. 回到 GitHub Pages 按 Ctrl+F5 強制重新整理後測試。

## 現有限制

MP4 僅直接下載影音合一串流。高解析度影音分離合併與真正 MP3 轉碼仍需後續加入 ffmpeg.wasm。

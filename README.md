# OwO MO Downloader

亮色系 GitHub Pages 前端，加上 YouTube 網址解析、MP4／MP3 輸出介面、解析度與 kbps 選擇。

## GitHub Pages

將 `index.html`、`app.css`、`app.js` 放在儲存庫根目錄，於 Settings > Pages 選擇 `Deploy from a branch`、`main`、`/(root)`。

## Cloudflare Worker

將 `worker.js` 貼入 Cloudflare Worker 並部署。開啟網站後，在「進階設定」填入 workers.dev 網址。

## v2 功能狀態

- MP4：會列出目前解析到的影音合一格式，並依解析度選擇及下載。
- 音訊：會列出音訊來源並提供 128、192、256、320 kbps 選項。
- MP3：此版已完成輸出選擇介面，但實際下載仍保留 YouTube 音訊來源格式。要產生真正 MP3，下一步需把 ffmpeg.wasm 核心檔放入網站並加入瀏覽器端轉碼。
- 高畫質影音分離：此版尚未合併。

# OwO MO Downloader A3 Rolling

更新日期：2026-09-10
版本：2026.09.10-A3.0-Rolling

## 架構

- GitHub Pages：`index.html`、`app.js`、`app.css`
- Cloudflare Worker Free：`worker.js`
- 不需要主機、Cloudflare Tunnel、Docker 或付費 Container

## A3 新增內容

- 集中式 Player Client 組態，便於 YouTube 改版後快速更新。
- WATCH_PAGE、WEB、MWEB、WEB_EMBEDDED、ANDROID、ANDROID_VR、IOS、TVHTML5 輪詢。
- Player JavaScript 網址提取。
- 無 `eval` 的 Signature 操作解譯器。
- `n` 參數轉換框架。
- 錯誤分類：AUTH_REQUIRED、NO_STREAMING_DATA、VIDEO_UNAVAILABLE、REGION_BLOCKED 等。
- Worker 回傳的完整 `steps` 已由前端逐條寫入執行紀錄。
- 音訊下載保留實際容器，不再將未轉碼的來源誤標成 MP3。

## 部署 Worker

1. 開啟 Cloudflare Dashboard。
2. 進入 Workers & Pages，建立或開啟現有 Worker。
3. 用本套件的 `worker.js` 完整取代現有程式。
4. 部署後開啟 Worker 根網址。
5. 確認回傳版本為 `2026.09.10-A3.0-Rolling`。

## 部署 GitHub Pages

將以下三個檔案放在 GitHub Pages 發布目錄：

- `index.html`
- `app.js`
- `app.css`

開啟網站，在「進階設定」填入 Worker 根網址後即可使用。

## 重要限制

- 若所有 Client 都回傳 LOGIN_REQUIRED，代表 YouTube 未提供 streamingData，Signature 解密無法介入。
- Player JavaScript 經常改版，Signature 或 N 規則可能需要再次更新。
- Cloudflare Worker 無法執行原生 FFmpeg，因此不提供 1080p 以上影音分離串流的伺服器端合併。
- 請只下載你有權保存的內容，並遵守來源網站條款與著作權規範。

# OwO MO Downloader 強化版 A1

更新日期：2026-09-10

## 本版新增

- 支援完整 YouTube 網址、`youtu.be` 縮短網址、Shorts、Live、Embed、Music YouTube 與純 11 碼影片 ID。
- 從 watch 頁面取得 `ytInitialPlayerResponse` 與 Player JavaScript。
- 解析常見 `signatureCipher` 交換、反轉及裁切規則。
- 對常見 N 參數規則進行最佳努力解析。
- 僅回傳經 `googlevideo.com` Range 請求驗證成功的格式。
- Player 規則在同一 Worker isolate 快取 1 小時。
- 前端紀錄會顯示 HTML、Player、簽章、N 參數及格式驗證步驟。

## 部署

### GitHub Pages

將 `index.html`、`app.css`、`app.js` 放在儲存庫根目錄。於 Settings > Pages 選擇從 `main` 分支的根目錄部署。

### Cloudflare Worker

1. 建立 Module Worker。
2. 以本版 `worker.js` 完整取代原始內容。
3. 部署後複製 `https://名稱.帳號.workers.dev` 網址。
4. 回到網站，在「進階設定」貼上 Worker 網址。

## 重要限制

- 本版不會繞過登入、付費、私人影片、年齡驗證、地區授權或 DRM。
- 若 YouTube 要求 PO Token、Visitor Data 或登入，純 Worker 版仍可能無法取得格式。
- Player JavaScript 會持續變動；N 參數若改為複雜函式，目前會保留原值，再以實際 CDN 驗證結果決定是否回傳。
- 目前音訊下載保留來源格式，尚未在瀏覽器內轉成真正 MP3。
- 請只下載你有權保存的內容，並遵守相關服務條款及法律規範。

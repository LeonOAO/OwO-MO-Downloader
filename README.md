# OwO MO Downloader A3.4.4 FB Story Fields + YouTube Client Matrix

版本：2026.09.11-A3.4.4-FB-Story-Fields-YouTube-Client-Matrix

## Facebook 限時動態

- 新增深層欄位辨識：`browser_native_hd_url`、`browser_native_sd_url`、`playable_url_quality_hd`、`playable_url`、`hd_src`、`sd_src`、`hdSrc`、`sdSrc`、`progressive_url`、`videoUrl`、`video_url`。
- 支援字串欄位與 `{ url: ... }` 巢狀欄位。
- 限時動態依 Story ID 建立資料錨點，縮小掃描範圍，降低誤抓推薦內容或下一位發布者媒體的機率。
- HD 優先、SD 備援，保留 DASH 影音分離格式。
- 完整保留 FB_COOKIE 分頁工作階段與 Worker Secret 流程。

## YouTube 高畫質

- Client Matrix 納入：ANDROID、WEB、WEB_SAFARI、MWEB、WEB_EMBEDDED、IOS、VISIONOS、TVHTML5、TV_SIMPLY。
- 各 Client 紀錄狀態、原始格式、可解析位址與 SABR 指標。
- 分開顯示 PLAYER、GVS、SUBS PO Token 狀態。
- 記錄 Visitor Data、Data Sync ID 與 `serverAbrStreamingUrl`。
- 保留既有 Signature、N 參數靜態操作解析與即時媒體網址更新。

## 架構

維持 GitHub Pages + 單一 Cloudflare Worker，不加入 Cobalt、第三方下載 API、Node、Deno、Python、Docker 或外部 Token Provider。

## 保留功能

Instagram Crawler View、Instagram Media API、Threads 分享網址、A3.4.3 四平台嚴格去重、MP4、M4A、MP3、WAV 全部保留。

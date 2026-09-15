# OwO 平台影音｜小幫手 v1.0.4

公開版本：v1.0.4  
內部建置：2026.09.15-youtube-client-media-identity-diagnostics

## 本版補強

- YouTube 媒體請求依來源 Client 使用對應 User-Agent。
- ANDROID_VR 高畫質網址不再使用一般瀏覽器 User-Agent。
- 下載失敗時，完整 Worker steps 會寫入執行紀錄。
- 解析網址 403 時先嘗試不同短效快取，再即時重新解析一次。
- 即時重新解析 HTTP 429 明確回傳 YOUTUBE_RATE_LIMITED。

## 完整保留

非 YouTube 畫質標示、預設 Worker、YouTube Media Session Cache、ANDROID_VR、高畫質合併、Log 自動清除與複製、Facebook Stories、Instagram Crawler View、Instagram Media API、Threads、MP4、M4A、MP3、WAV 與 Cookie 表單均保留。

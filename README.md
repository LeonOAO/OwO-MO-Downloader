# OwO 平台影音｜小幫手 v1.6.3

## 本版修正範圍

本版僅修正 YouTube 流程，Facebook、Instagram、Threads 與既有介面維持原樣。

### YouTube 修正

- 解析完成後建立獨立的短效媒體 Session Token。
- 前端下載時不再回傳完整 Google Video 簽名網址，改由 Worker 依 Session Token 取回。
- YouTube 正式媒體請求預設使用 `Range: bytes=0-`，使下載條件與預先驗證一致。
- 403 後的即時刷新會沿用目前請求的 YouTube 登入工作階段。
- Visitor Data 改為單次請求範圍，不再由 Worker isolate 跨工作共用。
- YouTube 媒體快取加入 Session ID，避免不同解析工作互相覆蓋。
- 保留原有 360p 基本格式與高畫質失敗隔離機制。

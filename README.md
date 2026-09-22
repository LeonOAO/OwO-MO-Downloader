# OwO 平台影音｜小幫手 v1.6.6

## 修正範圍

本版只修正 YouTube 正式媒體下載，其他平台與介面維持原樣。

- 正式下載改用與實載驗證完全相同的 256 KiB 有限 Range。
- 每段 Range 均包含明確起點與結束位置。
- Worker 原樣轉送前端 Range，不再自行產生 `bytes=0-`。
- 檢查 `Content-Range` 起點連續性，避免重複或缺段。
- 延續 Session Token、Cookie 刷新、Visitor Data 隔離、多 Client 搜尋與高畫質失敗隔離。

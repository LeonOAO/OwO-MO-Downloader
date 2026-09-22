# OwO 平台影音｜小幫手 v1.6.4

## 本版修正範圍

本版只修正 YouTube 流程，其他平台與介面維持原樣。

### YouTube v1.6.4

- 將原本 2-byte 網址探測提升為 256 KiB 實載驗證。
- Client 回傳高畫質格式後，先驗證分離視訊與音訊是否真的可讀取。
- 若 ANDROID_VR 僅能通過極小探測、無法讀取實際內容，會繼續搜尋 WEB_EMBEDDED、IOS、WEB、MWEB、TV 等後續 Client。
- 最終格式清單只保留通過 256 KiB 實載驗證的網址，避免下載時才發現 HTTP 403。
- 延續 v1.6.3 的 Session Token、Cookie 刷新、Visitor Data 隔離及 Range 下載修正。

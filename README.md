# OwO 平台影音｜小幫手 v1.6.7

本版只修正 YouTube 非零位移分段下載。瀏覽器使用 256 KiB 有限 Range；Worker 將 HTTP Range 轉成 Google Video URL `range=start-end` 參數，並在快取及刷新網址重新套用目前區段。其他平台與介面維持原樣。

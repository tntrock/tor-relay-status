# Tor Relay 儀表板改版設計

日期：2026-09-13
狀態：已核准，進入實作

## 背景

`tor.info-sec.vip` 目前是三個檔案的靜態頁面（`index.html` / `app.js` / `style.css`），
在瀏覽器直接 fetch `https://onionoo.torproject.org/details`，顯示單一 relay
（fingerprint `6940E0224E550AD368EAB57C768EA2958F5C2337`，nickname `AllenInfoSec`）。

兩個問題：

1. 部分訪客的網路無法連到 `torproject.org`，頁面對他們完全空白。
2. 只用了 `/details` 一個端點，沒有任何歷史趨勢；版面無深色模式、手機體驗差。

## 實測確認的事實（2026-09-13）

打過四個 onionoo 端點後確認：

- onionoo **本來就回 `Access-Control-Allow-Origin: *`**。舊版程式把失敗歸因於 CORS 是錯的，
  真正的問題是**可達性**（網路層被擋）。代理層要解決的是後者。
- 此 relay 只有 `1_month` 與 `6_months` 兩個期間（`first_seen` 為 2026-05-08）。
  onionoo 不回傳沒資料的期間，因此**期間頁籤必須由回應動態產生**，不可寫死。
- `exit_probability` 的 `factor` 為 `0.0`（純 Guard/Middle 節點），整條序列為 0。
  圖表必須擋掉這種退化序列。
- 上游 `Cache-Control`：`details` 為 `max-age=1800`，其餘為 `max-age=1200`；
  資料每小時更新一次（`relays_published`）。

## 決策

| 項目 | 決定 |
|---|---|
| 部署 | Cloudflare Pages，代理用 `_worker.js`（同網域） |
| 前端結構 | 零依賴、零 build，ES modules |
| 圖表 | 手寫 SVG，不引入 CDN 依賴（訪客連不到外部 CDN 的風險與 onionoo 相同） |
| 邊緣快取 | 統一 60 秒，寫成單一 `EDGE_TTL` 常數 |
| 更新方式 | 手動重新整理按鈕，不自動輪詢 |
| Relay 數量 | 設定檔驅動，目前一台，`RELAYS` 加一筆即可擴充 |
| 視覺 | 保留 GitHub 淺色風格，加深色模式與排版優化 |

## 架構

    tor.info-sec.vip  (Cloudflare Pages)
    |
    +-- 靜態檔  index.html / style.css / config.js / js/*
    |
    +-- _worker.js                            <- Pages advanced mode
            |  同網域 /api/onionoo/details?lookup=...
            +--> fetch onionoo.torproject.org  (由 Cloudflare 邊緣發出)

瀏覽器永遠只連 `tor.info-sec.vip`，不碰 `torproject.org`。

## 代理層

實作於 `_worker.js`。原先設計為 `functions/api/onionoo/[[path]].js`，
但 Pages 的 `functions/` 目錄要靠建置流程編譯，直接上傳（拖曳）的專案不支援；
改用 advanced mode 的 `_worker.js` 後兩種專案型態都能跑，且不需要建置。
代價是 `_headers` 在 advanced mode 下不生效，安全標頭改由 worker 加在靜態檔回應上。

- 端點白名單：`details` `bandwidth` `uptime` `weights` `summary`，其餘 404
- 參數白名單：`lookup` `fingerprint` `search` `fields` `limit` `offset` `order`
  `running` `flag` `country` `type` `host_name` `contact` `family` `version` `os`
- 方法：只收 `GET` / `HEAD`（`OPTIONS` 回 204），其餘 405
- 邊緣快取：`caches.default`，查詢參數排序後當快取鍵
- 診斷標頭：`X-Cache`、`X-Upstream-Status`、`X-Upstream-Last-Modified`
- 上游失敗：回 502 + JSON `{error, upstream}`
- 安全：剝除訪客 `cookie` / `authorization` 再轉發

## 資料層

`api.js` 以 `Promise.allSettled` 併發四個端點，任一失敗不擋整頁，該區塊自行降級。

history 正規化為統一格式供圖表使用：

    { period, first, last, interval, points: [{ t: Date, v: number|null }] }

其中 `v = 原始值 × factor`。onionoo 時間字串為 UTC 但無時區標記，
必須轉成 `YYYY-MM-DDTHH:MM:SSZ` 再 `new Date()`，否則會被當成本地時間。

## 版面

1. 頁首 — nickname、狀態膠囊、fingerprint（可複製）、深色模式切換、重新整理、資料時間
2. KPI 卡 — 觀測/廣告頻寬、設定上限、共識權重與佔比、30 天上線率、版本狀態
3. Flags — 中文說明 tooltip，含歷史上出現過但目前沒有的 flag
4. 頻寬歷史 — SVG 面積圖，read/write 疊圖，期間頁籤動態產生，hover 顯示數值
5. 上線率 — 大數字 + 時間軸色塊帶 + 各 flag 持有率
6. 共識權重歷史 — 折線圖，可切換 weight / guard / middle / exit，退化序列標「不適用」
7. 節點資訊 — 分成身分 / 網路位置 / 頻寬權重 / 版本生命週期 四組表格
8. Exit Policy — 保留原判斷邏輯，補上完整 `exit_policy` 原文可展開
9. 頁尾 — 資料來源、中繼說明

## 介面細節

- 深色模式：`prefers-color-scheme` 自動 +手動三段切換，存 `localStorage`
- 所有顏色走 CSS 變數，SVG 圖表一併吃變數
- 載入中用骨架佔位，避免版面跳動
- 手機版：KPI 單欄、表格上下排列、圖表寬度自適應
- 頁籤 `role="tablist"`、狀態膠囊 `aria-live`
- 嚴格 CSP：無 inline script、無 inline style 屬性（動態樣式一律走 CSSOM）

## 檔案結構

    index.html
    style.css
    config.js
    js/  api.js  format.js  chart.js  theme.js  ui.js  main.js
         sections/ header.js kpi.js flags.js bandwidth.js
                   uptime.js weights.js details.js exitpolicy.js
    _worker.js
    README.md

## 驗證

無測試框架。以 `wrangler pages dev` 在本機跑起含 Function 的完整站台，
確認四端點皆通、任一端點故意打壞時頁面仍可用，並截圖淺色 / 深色 / 手機三種版面。

# Tor 中繼狀態頁

單一 Tor relay 的運行狀態儀表板，部署於 <https://tor.info-sec.vip/>。

資料來自 Tor Metrics 的 [onionoo API](https://onionoo.torproject.org/)，
但**瀏覽器不會直接連線 torproject.org** —— 所有請求都走同網域的 `_worker.js`，
由 Cloudflare 邊緣代為取得。網路封鎖了 Tor 官方網域的訪客一樣看得到完整資料。

零依賴、零建置流程：沒有 npm、沒有打包器，資料夾丟上 Pages 就會動。

## 檔案結構

```
index.html      版面骨架
style.css       全部樣式（顏色走 CSS 變數，深色模式只換變數）
config.js       ★ 唯一需要編輯的設定檔
_worker.js      ★ Cloudflare 入口：onionoo 中繼代理 + 靜態檔 + 安全標頭
js/
  main.js       進入點：載入資料、驅動各區塊
  api.js        onionoo 存取與歷史資料正規化
  chart.js      手寫 SVG 折線／面積圖
  format.js     數值與時間格式
  theme.js      深色模式切換
  ui.js         共用小元件（頁籤、表格、提示框、骨架）
  sections/     各區塊的渲染邏輯，一個檔案一區
```

## 設定

改 `config.js` 就好：

```js
export const RELAYS = [
  { fingerprint: "6940E022...2337", label: "AllenInfoSec" },
];
```

**要加第二台節點**，往 `RELAYS` 加一筆即可，頁面會自動長出切換頁籤，
網址也支援 `?relay=<nickname 或 fingerprint>` 直接指定。

## 部署到 Cloudflare Pages

把整個資料夾上傳到 Pages 即可，**不需要建置流程**。
`_worker.js` 必須位於上傳內容的根目錄（與 `index.html` 同層）。

驗收：部署後直接打
`https://<你的網域>/api/onionoo/details?lookup=<fingerprint>`，應該要回 JSON。

### 為什麼是 `_worker.js` 而不是 `functions/`

Pages 有兩種寫後端邏輯的方式：

| 方式 | 需要建置流程 | 拖曳上傳可用 |
|---|---|---|
| `functions/` 目錄 | 要 | **不行** |
| `_worker.js`（advanced mode） | 不要 | 可以 |

`functions/` 目錄是在建置階段被編譯成 Worker 的，所以只有接 Git、會跑建置的專案才有效；
直接上傳的專案不會處理它。本專案用 `_worker.js`，兩種專案型態都能跑。

代價是 advanced mode 下 **`_headers` 與 `_redirects` 不會生效**，
所以安全標頭改由 `_worker.js` 自己加在靜態檔回應上（見檔案裡的 `SECURITY_HEADERS`）。

### 改用獨立 Worker

若想把代理放到 Pages 之外，`_worker.js` 的 `handleApi()` 可以整段搬進獨立 Worker，
設一條路由指向 `tor.info-sec.vip/api/onionoo/*`，前端不用改。
若 Worker 掛在別的網域，改 `config.js` 的 `API_BASE` 並放寬 Worker 的 CORS 設定。

## 代理層行為

| 項目 | 設定 |
|---|---|
| 允許的端點 | `details` `bandwidth` `uptime` `weights` `summary`，其餘回 404 |
| 允許的查詢參數 | 白名單制，其餘丟棄，避免被當成開放代理 |
| 允許的方法 | `GET` / `HEAD`（`OPTIONS` 回 204），其餘 405 |
| 邊緣快取 | `EDGE_TTL`，目前 60 秒 |
| 上游失敗 | 回 502 + JSON `{error, upstream}` |
| 靜態檔 | 交給 `env.ASSETS`，並補上安全標頭與 CSP |

診斷用回應標頭：`X-Cache`（HIT/MISS）、`X-Upstream-Status`、`X-Upstream-Last-Modified`。

### 關於快取秒數

onionoo 自己回的 `Cache-Control` 是 `details` 1800 秒、其餘 1200 秒，
而且資料每小時才重新產生一次（見回應中的 `relays_published`）。
把 `EDGE_TTL` 調大不會讓資料變舊，只會少打幾次上游；
目前設 60 秒是偏保守的選擇。要改就改 `_worker.js` 最上方那個常數。

## 幾個實作上的注意事項

- **期間頁籤是動態的。** onionoo 只回傳「累積到足夠資料」的期間，
  節點上線未滿一年就不會有 `1_year`。所以頁籤一律由回應推導，不可寫死。
- **onionoo 的時間字串是 UTC 但沒有時區標記**（`2026-09-13 12:00:00`）。
  直接丟給 `new Date()` 會被當成本地時間。`format.js` 的 `parseTime()` 會補上 `Z`。
- **歷史資料的真實值 = `values[i] × factor`**，`values` 是 0–999 的整數，缺漏為 `null`。
- **退化序列要擋掉。** 純 Guard／Middle 節點的 `exit_probability` 其 `factor` 為 `0`，
  整條序列都是 0，畫出來沒有意義，改顯示「此節點不適用」。
- **沒有 inline script 與 inline style 屬性**，所以 CSP 可以收得很緊
  （連 `'unsafe-inline'` 都不需要）。動態樣式一律透過 CSSOM（`element.style.x = ...`）設定
  —— CSSOM 不受 CSP 管轄，`style="..."` 屬性才會被擋。

## 本機預覽

純靜態的部分用任何靜態伺服器都能看：

```sh
python -m http.server 8000
```

但 `/api/onionoo/*` 不會有回應，頁面會顯示「連不到本站的 API 中繼」。
要連 `_worker.js` 一起測，用 `wrangler pages dev .`。

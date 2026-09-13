# Tor 中繼狀態頁

單一 Tor relay 的運行狀態儀表板，部署於 <https://tor.info-sec.vip/>。

資料來自 Tor Metrics 的 [onionoo API](https://onionoo.torproject.org/)，
但**瀏覽器不會直接連線 torproject.org** —— 所有請求都走同網域的 Worker，
由 Cloudflare 邊緣代為取得。網路封鎖了 Tor 官方網域的訪客一樣看得到完整資料。

部署在 **Cloudflare Workers + Static Assets**（不是 Pages），接 GitHub 自動部署。
前端零依賴、零打包：沒有 npm、沒有建置步驟，靜態檔原樣上傳。

## 檔案結構

```
wrangler.jsonc      Worker 設定：進入點、資產目錄、Worker 名稱
worker.js           ★ Worker：onionoo 中繼代理 + 靜態檔 + 安全標頭
public/             ★ 只有這個目錄會被上傳成公開資產
  index.html        版面骨架
  style.css         全部樣式（顏色走 CSS 變數，深色模式只換變數）
  config.js         ★ 唯一需要編輯的設定檔
  js/
    main.js         進入點：載入資料、驅動各區塊
    api.js          onionoo 存取與歷史資料正規化
    chart.js        手寫 SVG 折線／面積圖
    format.js       數值與時間格式
    theme.js        深色模式切換
    ui.js           共用小元件（頁籤、表格、提示框、骨架）
    sections/       各區塊的渲染邏輯，一個檔案一區
docs/               設計文件
```

`worker.js` 與 `README.md` 刻意放在 `public/` **外面** ——
資產目錄只設為 `./public`，伺服器端程式碼就不會被當成公開檔案送出去。

## 設定

改 `public/config.js` 就好：

```js
export const RELAYS = [
  { fingerprint: "6940E022...2337", label: "AllenInfoSec" },
];
```

**要加第二台節點**，往 `RELAYS` 加一筆即可，頁面會自動長出切換頁籤，
網址也支援 `?relay=<nickname 或 fingerprint>` 直接指定。

## 部署

Worker 接在 GitHub 上，**push 到 `main` 就會自動部署**，不需要任何手動步驟。

```sh
git add -A && git commit -m "說明改了什麼" && git push
```

建置流程跑的是 `npx wrangler deploy`，設定全部來自 `wrangler.jsonc`。

驗收：部署後打
`https://<你的網域>/api/onionoo/details?lookup=<fingerprint>`，應該要回 JSON。

### 這是 Workers，不是 Pages

兩者的慣例不通用，踩過的坑記在這裡：

| | Pages | Workers + Static Assets（本專案） |
|---|---|---|
| 進入點 | 根目錄的 `_worker.js` 自動生效 | 由 `wrangler.jsonc` 的 `main` 指定 |
| 靜態檔範圍 | 輸出目錄 | `assets.directory` |
| 安全標頭 | `_headers` 檔 | 本專案由 Worker 自己加 |

在 Workers 專案裡放 `_worker.js` **不會**被當成進入點，反而會被當成一般靜態檔上傳，
部署時 wrangler 會直接報錯擋下來：「Uploading a Pages `_worker.js` file as an asset.
This could expose your private server-side code to the public Internet.」

另外 `assets.directory` 若設成 `"."`，`npx` 安裝 wrangler 時產生的 `node_modules`
會一起被當成公開資產上傳（實測會從 21 個檔案暴增到 121 個）。
把靜態檔隔離在 `public/` 就不會有這個問題。

### 關於 `run_worker_first`

預設情況下靜態檔由資產伺服器直接回應，Worker 只處理沒對應到檔案的路徑。
本專案設了 `"run_worker_first": true`，讓每個請求都先進 Worker，
這樣安全標頭與 CSP 才能一併套在靜態檔的回應上。
代價是每個請求都算一次 Worker 呼叫；這個量級的個人站台不會有影響。

### 改用獨立 Worker

若想把代理拆出去自成一個 Worker，`worker.js` 的 `handleApi()` 可以整段搬過去，
設一條路由指向 `tor.info-sec.vip/api/onionoo/*`，前端不用改。
若 Worker 掛在別的網域，改 `public/config.js` 的 `API_BASE` 並放寬 CORS 設定。

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
目前設 60 秒是偏保守的選擇。要改就改 `worker.js` 最上方那個常數。

## 幾個實作上的注意事項

- **期間頁籤是動態的。** onionoo 只回傳「累積到足夠資料」的期間，
  節點上線未滿一年就不會有 `1_year`。所以頁籤一律由回應推導，不可寫死。
- **onionoo 的時間字串是 UTC 但沒有時區標記**（`2026-09-13 12:00:00`）。
  直接丟給 `new Date()` 會被當成本地時間。`public/js/format.js` 的 `parseTime()` 會補上 `Z`。
- **歷史資料的真實值 = `values[i] × factor`**，`values` 是 0–999 的整數，缺漏為 `null`。
- **退化序列要擋掉。** 純 Guard／Middle 節點的 `exit_probability` 其 `factor` 為 `0`，
  整條序列都是 0，畫出來沒有意義，改顯示「此節點不適用」。
- **沒有 inline script 與 inline style 屬性**，所以 CSP 可以收得很緊
  （連 `'unsafe-inline'` 都不需要）。動態樣式一律透過 CSSOM（`element.style.x = ...`）設定
  —— CSSOM 不受 CSP 管轄，`style="..."` 屬性才會被擋。

## 本機預覽

純靜態的部分用任何靜態伺服器都能看：

```sh
cd public && python -m http.server 8000
```

但 `/api/onionoo/*` 不會有回應，頁面會顯示「連不到本站的 API 中繼」。
要連 Worker 一起測，用 `npx wrangler dev`。

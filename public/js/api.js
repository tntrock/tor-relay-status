/**
 * onionoo 存取層。
 * 一律走同網域的 Cloudflare Pages Function，不直接連 torproject.org。
 */

import { API_BASE } from "../config.js";
import { parseTime } from "./format.js";

export const ENDPOINTS = ["details", "bandwidth", "uptime", "weights"];

export class ApiError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, info);
  }
}

async function getJson(endpoint, fingerprint) {
  const url = `${API_BASE}/${endpoint}?lookup=${encodeURIComponent(fingerprint)}`;

  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (err) {
    throw new ApiError("連不到本站的 API 中繼（網路中斷或代理未部署）", { endpoint, cause: err });
  }

  if (!res.ok) {
    let detail = null;
    try {
      detail = await res.json();
    } catch {
      /* 回應不是 JSON 就算了，下面只用狀態碼描述 */
    }
    const upstream = detail && detail.upstream;
    const reason =
      detail && detail.error === "upstream_unreachable"
        ? "Cloudflare 邊緣連不到 onionoo"
        : upstream
          ? `onionoo 回應 HTTP ${upstream}`
          : `中繼回應 HTTP ${res.status}`;
    throw new ApiError(reason, { endpoint, status: res.status, detail });
  }

  const payload = await res.json();
  return {
    payload,
    cache: res.headers.get("X-Cache"),
    upstreamLastModified: res.headers.get("X-Upstream-Last-Modified") || null,
  };
}

/**
 * 四個端點併發抓取。
 * 用 allSettled 是刻意的：任何一個端點掛掉，其餘區塊照樣要能顯示。
 */
export async function loadRelay(fingerprint) {
  const settled = await Promise.allSettled(ENDPOINTS.map((e) => getJson(e, fingerprint)));

  const result = {
    fingerprint,
    fetchedAt: new Date(),
    relaysPublished: null,
    cache: null,
    parts: {},
  };

  settled.forEach((outcome, i) => {
    const endpoint = ENDPOINTS[i];
    if (outcome.status === "rejected") {
      result.parts[endpoint] = { ok: false, error: outcome.reason, relay: null };
      return;
    }
    const { payload, cache } = outcome.value;
    const relay = payload && Array.isArray(payload.relays) ? payload.relays[0] : null;
    if (!relay) {
      result.parts[endpoint] = {
        ok: false,
        relay: null,
        error: new ApiError("onionoo 沒有這個 fingerprint 的資料", { endpoint }),
      };
      return;
    }
    if (!result.relaysPublished) result.relaysPublished = parseTime(payload.relays_published);
    if (!result.cache) result.cache = cache;
    result.parts[endpoint] = { ok: true, relay, error: null };
  });

  return result;
}

/* ---------- 歷史資料正規化 ---------- */

/** 期間由短到長排序用；出現在 onionoo 回應但不在表裡的期間排到最後 */
const PERIOD_ORDER = ["3_days", "1_week", "1_month", "3_months", "6_months", "1_year", "5_years"];

export const PERIOD_LABEL = {
  "3_days": "3 天",
  "1_week": "1 週",
  "1_month": "1 個月",
  "3_months": "3 個月",
  "6_months": "6 個月",
  "1_year": "1 年",
  "5_years": "5 年",
};

export function periodLabel(period) {
  return PERIOD_LABEL[period] || period.replaceAll("_", " ");
}

/**
 * onionoo 只回傳「有資料」的期間，所以可選期間一律從回應推導，不能寫死。
 * 這個節點目前只有 1_month 與 6_months。
 */
export function periodsOf(historyObject) {
  if (!historyObject || typeof historyObject !== "object") return [];
  return Object.keys(historyObject).sort((a, b) => {
    const ia = PERIOD_ORDER.indexOf(a);
    const ib = PERIOD_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/**
 * 把 onionoo 的 history 物件轉成圖表吃的統一格式。
 * 原始 values 是 0–999 的整數（缺資料為 null），真實值 = value × factor。
 */
export function normalizeHistory(history) {
  if (!history || !Array.isArray(history.values)) return null;

  const first = parseTime(history.first);
  const interval = Number(history.interval) || 0;
  const factor = Number(history.factor) || 0;
  if (!first || !interval) return null;

  const points = history.values.map((raw, i) => ({
    t: new Date(first.getTime() + i * interval * 1000),
    v: raw == null ? null : raw * factor,
  }));

  return {
    first,
    last: parseTime(history.last),
    interval,
    factor,
    points,
  };
}

/** 平均值，忽略缺漏點。全部缺漏回 null。 */
export function average(points) {
  if (!points || !points.length) return null;
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.v != null && Number.isFinite(p.v)) {
      sum += p.v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

export function maxValue(points) {
  let max = null;
  for (const p of points || []) {
    if (p.v != null && Number.isFinite(p.v) && (max == null || p.v > max)) max = p.v;
  }
  return max;
}

/** 整條序列都是 0 或缺漏 —— 例如純 Guard 節點的 exit_probability（factor 為 0） */
export function isDegenerate(normalized) {
  if (!normalized) return true;
  const max = maxValue(normalized.points);
  return max == null || max === 0;
}

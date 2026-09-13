/**
 * Cloudflare Worker（Workers + Static Assets）。
 *
 * 進入點由 wrangler.jsonc 的 `main` 指定，靜態檔放在 public/ 並由
 * `assets.binding` 綁成 env.ASSETS。設定了 `run_worker_first`，
 * 所以每個請求都會先進到這裡。
 *
 * 兩件事：
 *   1. /api/onionoo/*  由 Cloudflare 邊緣代為向 onionoo 取資料，
 *      訪客的電腦連不到 torproject.org 也沒關係。
 *   2. 其餘路徑交給 env.ASSETS 送靜態檔，並補上安全標頭與 CSP。
 */

const UPSTREAM = "https://onionoo.torproject.org";
const API_PREFIX = "/api/onionoo/";

/**
 * 邊緣快取秒數。
 * 參考：onionoo 自己回的 Cache-Control 是 details max-age=1800、其餘 max-age=1200，
 * 而且資料每小時才更新一次。調大這個值不會讓資料變舊，只會少打幾次上游。
 */
const EDGE_TTL = 60;

const ENDPOINTS = new Set(["details", "bandwidth", "uptime", "weights", "summary"]);

/** 只轉發這些查詢參數，避免這支代理被當成開放 proxy 亂用 */
const ALLOWED_PARAMS = new Set([
  "lookup", "fingerprint", "search", "fields", "limit", "offset", "order",
  "running", "flag", "country", "type", "host_name", "contact", "family",
  "version", "os", "first_seen_days", "last_seen_days",
]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(API_PREFIX)) {
      return handleApi(request, url, ctx);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

async function handleApi(request, url, ctx) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD, OPTIONS" });
  }

  const endpoint = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, "");
  if (!ENDPOINTS.has(endpoint)) {
    return json({ error: "unknown_endpoint", endpoint, allowed: [...ENDPOINTS] }, 404);
  }

  const upstreamUrl = new URL(`${UPSTREAM}/${endpoint}`);
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(key)) upstreamUrl.searchParams.append(key, value);
  }
  // 排序後參數順序固定，同一組查詢才會命中同一個快取項目
  upstreamUrl.searchParams.sort();

  const cache = caches.default;
  const cacheKey = new Request(
    `${url.origin}/__onionoo/${endpoint}${upstreamUrl.search}`,
    { method: "GET" },
  );

  const cached = await cache.match(cacheKey);
  if (cached) return finalize(cached, "HIT", request.method);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "User-Agent": "tor.info-sec.vip relay dashboard (+https://tor.info-sec.vip/)",
      },
      redirect: "follow",
      cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
    });
  } catch (err) {
    return json(
      { error: "upstream_unreachable", detail: String(err && err.message ? err.message : err) },
      502,
    );
  }

  if (!upstream.ok) {
    return json({ error: "upstream_error", upstream: upstream.status }, 502, {
      "X-Upstream-Status": String(upstream.status),
    });
  }

  const body = await upstream.arrayBuffer();
  const stored = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${EDGE_TTL}`,
      "X-Upstream-Status": String(upstream.status),
      "X-Upstream-Last-Modified": upstream.headers.get("last-modified") || "",
      ...corsHeaders(),
    },
  });

  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  return finalize(stored, "MISS", request.method);
}

function finalize(response, cacheState, method) {
  const headers = new Headers(response.headers);
  headers.set("X-Cache", cacheState);
  const body = method === "HEAD" ? null : response.body;
  return new Response(body, { status: response.status, headers });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(payload, status, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...(extra || {}),
    },
  });
}

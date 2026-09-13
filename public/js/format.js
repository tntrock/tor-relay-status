/** 數值、時間、字串的呈現格式。 */

export function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const RATE_UNITS = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

function scale(value, units, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  let v = Math.abs(value);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  const d = digits != null ? digits : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${(value < 0 ? -v : v).toFixed(d)} ${units[i]}`;
}

/** 位元組/秒 —— onionoo 的頻寬欄位都是這個單位 */
export function bps(value, digits) {
  return scale(value, RATE_UNITS, digits) ?? "—";
}

export function bytes(value, digits) {
  return scale(value, SIZE_UNITS, digits) ?? "—";
}

export function num(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "—";
}

/** 小數 0.0431 -> "4.31 %"；極小的值自動改用科學記號避免整排 0 */
export function pct(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const p = value * 100;
  if (p !== 0 && Math.abs(p) < 10 ** -digits) return `${p.toExponential(2)} %`;
  return `${p.toFixed(digits)} %`;
}

/**
 * onionoo 的時間字串是 UTC 但沒有時區標記（"2026-09-13 12:00:00"）。
 * 直接丟給 new Date() 會被當成本地時間，差 8 小時，所以要自己補 Z。
 */
export function parseTime(text) {
  if (!text || typeof text !== "string") return null;
  const d = new Date(`${text.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** 轉成訪客本地時區的 YYYY-MM-DD HH:MM */
export function fmtTime(date) {
  if (!date) return "—";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function fmtDate(date) {
  if (!date) return "—";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fmtClock(date) {
  if (!date) return "—";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const SPANS = [
  [31536000, "年"],
  [2592000, "個月"],
  [86400, "天"],
  [3600, "小時"],
  [60, "分鐘"],
];

/** 「3 天前」、「剛剛」 */
export function relTime(date, now = Date.now()) {
  if (!date) return "—";
  const seconds = Math.round((now - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "剛剛";
  for (const [size, label] of SPANS) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      return seconds >= 0 ? `${n} ${label}前` : `${n} ${label}後`;
    }
  }
  return "剛剛";
}

/** 「12 天 4 小時」——給「已運行多久」用 */
export function duration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小時`;
  if (hours > 0) return `${hours} 小時 ${minutes} 分`;
  return `${minutes} 分鐘`;
}

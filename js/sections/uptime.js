/** 上線率：大數字、時間軸色塊帶、各 flag 的持有比例。 */

import { pct, fmtTime } from "../format.js";
import { normalizeHistory, periodsOf, periodLabel, average } from "../api.js";
import { el, makeTabs, errorBox, infoBox } from "../ui.js";

function toneOf(value) {
  if (value == null) return "none";
  if (value >= 0.999) return "full";
  if (value >= 0.95) return "high";
  if (value >= 0.5) return "mid";
  if (value > 0) return "low";
  return "down";
}

/**
 * 色塊帶最多畫這麼多格。超過就合併相鄰取樣點，
 * 否則窄螢幕或長期間（5 年有數千點）會讓後半段被容器裁掉而看不見。
 */
const MAX_CELLS = 320;

/** 合併時取區間內的最小值：寧可誇大斷線，也不要把斷線平均掉而看不出來 */
function bucketize(points) {
  if (points.length <= MAX_CELLS) {
    return points.map((p) => ({ from: p.t, to: p.t, v: p.v }));
  }

  const size = Math.ceil(points.length / MAX_CELLS);
  const buckets = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    const known = slice.filter((p) => p.v != null);
    buckets.push({
      from: slice[0].t,
      to: slice[slice.length - 1].t,
      v: known.length ? Math.min(...known.map((p) => p.v)) : null,
    });
  }
  return buckets;
}

function heatBar(normalized) {
  const bar = el("div", "heat");
  const points = normalized.points;
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    `從 ${fmtTime(points[0].t)} 到 ${fmtTime(points[points.length - 1].t)} 的上線狀態`,
  );

  for (const cellData of bucketize(points)) {
    const cell = el("span", `heat-cell heat-${toneOf(cellData.v)}`);
    const when =
      cellData.from.getTime() === cellData.to.getTime()
        ? fmtTime(cellData.from)
        : `${fmtTime(cellData.from)} – ${fmtTime(cellData.to)}`;
    cell.title = `${when} · ${cellData.v == null ? "無資料" : pct(cellData.v, 1)}`;
    bar.append(cell);
  }
  return bar;
}

function legend() {
  const wrap = el("div", "heat-legend");
  const items = [
    ["full", "100%"],
    ["high", "95% 以上"],
    ["mid", "50–95%"],
    ["low", "50% 以下"],
    ["down", "完全離線"],
    ["none", "無資料"],
  ];
  for (const [tone, label] of items) {
    const item = el("span", "heat-legend-item");
    item.append(el("span", `heat-cell heat-${tone}`), el("span", null, label));
    wrap.append(item);
  }
  return wrap;
}

function flagTable(flagsHistory, period) {
  const names = Object.keys(flagsHistory || {}).sort();
  const rows = [];

  for (const name of names) {
    const normalized = normalizeHistory(flagsHistory[name][period]);
    if (!normalized) continue;
    const mean = average(normalized.points);
    if (mean == null) continue;

    const row = el("div", "meter-row");
    row.append(el("span", "meter-name", name));

    const track = el("div", "meter-track");
    const fill = el("div", "meter-fill");
    fill.style.width = `${Math.min(100, mean * 100).toFixed(2)}%`;
    track.append(fill);

    row.append(track, el("span", "meter-value", pct(mean, 1)));
    rows.push(row);
  }

  if (!rows.length) return null;
  const wrap = el("div", "meters");
  wrap.append(el("h3", "sub-heading", "各 flag 在此期間的持有比例"));
  for (const row of rows) wrap.append(row);
  return wrap;
}

export function renderUptime(host, view) {
  const part = view.parts.uptime;
  if (!part || !part.ok) {
    host.replaceChildren(errorBox(part && part.error ? part.error.message : "沒有上線率資料"));
    return;
  }

  const uptime = part.relay.uptime || {};
  const periods = periodsOf(uptime);
  if (!periods.length) {
    host.replaceChildren(infoBox("onionoo 尚未累積到這個節點的上線率歷史。"));
    return;
  }

  const tabsHost = el("div");
  const body = el("div");
  host.replaceChildren(tabsHost, body);

  function update(period) {
    const normalized = normalizeHistory(uptime[period]);
    if (!normalized) {
      body.replaceChildren(infoBox("這個期間沒有資料。"));
      return;
    }

    const mean = average(normalized.points);
    const downCount = normalized.points.filter((p) => p.v != null && p.v < 0.999).length;

    const headline = el("div", "uptime-headline");
    const big = el("div", `uptime-big tone-${toneOf(mean)}`, mean == null ? "—" : pct(mean, 3));
    const caption = el("div", "uptime-caption");
    caption.append(
      el("div", null, `${periodLabel(period)}內的平均上線率`),
      el(
        "div",
        "dim",
        `共 ${normalized.points.length} 個取樣點（每 ${Math.round(normalized.interval / 3600)} 小時一次）` +
          `，其中 ${downCount} 個未達 100%`,
      ),
    );
    headline.append(big, caption);

    const children = [headline, heatBar(normalized), legend()];
    const flags = flagTable(part.relay.flags, period);
    if (flags) children.push(flags);

    body.replaceChildren(...children);
  }

  tabsHost.replaceChildren(
    makeTabs(
      periods.map((p) => ({ id: p, label: periodLabel(p) })),
      periods[0],
      update,
    ),
  );

  update(periods[0]);
}

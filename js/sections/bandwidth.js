/** 頻寬歷史：讀取／寫入兩條序列疊圖，期間頁籤由 onionoo 回應動態產生。 */

import { bps, bytes } from "../format.js";
import { normalizeHistory, periodsOf, periodLabel, average, maxValue } from "../api.js";
import { makeChart } from "../chart.js";
import { el, makeTabs, errorBox, infoBox } from "../ui.js";

/** 每個取樣點代表 interval 秒的平均速率，乘回去就是這段期間的總傳輸量 */
function totalBytes(normalized) {
  if (!normalized) return null;
  let sum = 0;
  let counted = 0;
  for (const point of normalized.points) {
    if (point.v == null) continue;
    sum += point.v * normalized.interval;
    counted += 1;
  }
  return counted ? sum : null;
}

function statRow(label, value) {
  const node = el("div", "stat");
  node.append(el("span", "stat-label", label), el("span", "stat-value", value));
  return node;
}

export function renderBandwidth(host, view) {
  const part = view.parts.bandwidth;
  if (!part || !part.ok) {
    host.replaceChildren(errorBox(part && part.error ? part.error.message : "沒有頻寬資料"));
    return;
  }

  const relay = part.relay;
  const read = relay.read_history || {};
  const write = relay.write_history || {};

  // 兩種歷史的期間不一定完全一樣，取聯集才不會漏掉
  const periods = periodsOf({ ...read, ...write });
  if (!periods.length) {
    host.replaceChildren(infoBox("onionoo 尚未累積到這個節點的頻寬歷史。"));
    return;
  }

  const tabsHost = el("div");
  const chartHost = el("div");
  const statsHost = el("div", "stats");
  host.replaceChildren(tabsHost, chartHost, statsHost);

  const chart = makeChart(chartHost, {
    height: 250,
    yFormat: (v) => bps(v, v >= 1000 ? 1 : 0),
    ariaLabel: "頻寬歷史",
  });

  let active = periods[0];

  function update(period) {
    active = period;
    const readSeries = normalizeHistory(read[period]);
    const writeSeries = normalizeHistory(write[period]);

    chart.setSeries(
      [
        readSeries && {
          key: "read",
          name: "讀取（流入）",
          color: "var(--chart-1)",
          fill: true,
          points: readSeries.points,
        },
        writeSeries && {
          key: "write",
          name: "寫入（流出）",
          color: "var(--chart-2)",
          fill: true,
          points: writeSeries.points,
        },
      ].filter(Boolean),
    );

    const stats = [];
    for (const [label, normalized] of [["讀取", readSeries], ["寫入", writeSeries]]) {
      if (!normalized) continue;
      stats.push(
        statRow(`${label}平均`, bps(average(normalized.points))),
        statRow(`${label}尖峰`, bps(maxValue(normalized.points))),
        statRow(`${label}總量`, bytes(totalBytes(normalized))),
      );
    }
    statsHost.replaceChildren(...stats);
  }

  tabsHost.replaceChildren(
    makeTabs(
      periods.map((p) => ({ id: p, label: periodLabel(p) })),
      active,
      update,
    ),
  );

  update(active);
}

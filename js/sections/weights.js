/** 共識權重與路徑機率的歷史變化。 */

import { num, pct } from "../format.js";
import { normalizeHistory, periodsOf, periodLabel, average, isDegenerate } from "../api.js";
import { makeChart } from "../chart.js";
import { el, makeTabs, errorBox, infoBox } from "../ui.js";

const METRICS = [
  {
    id: "consensus_weight",
    label: "共識權重",
    color: "var(--chart-1)",
    format: (v) => num(Math.round(v)),
    hint: "目錄權威給這個節點的絕對權重值，客戶端依此按比例挑選節點。",
  },
  {
    id: "consensus_weight_fraction",
    label: "權重佔比",
    color: "var(--chart-2)",
    format: (v) => pct(v, 4),
    hint: "這個節點的權重佔全網總權重的比例。",
  },
  {
    id: "guard_probability",
    label: "入口機率",
    color: "var(--chart-3)",
    format: (v) => pct(v, 4),
    hint: "客戶端建立電路時，選中這個節點作為入口（Guard）的機率。",
  },
  {
    id: "middle_probability",
    label: "中間機率",
    color: "var(--chart-4)",
    format: (v) => pct(v, 4),
    hint: "選中這個節點作為中間跳點的機率。",
  },
  {
    id: "exit_probability",
    label: "出口機率",
    color: "var(--chart-5)",
    format: (v) => pct(v, 4),
    hint: "選中這個節點作為出口的機率；非出口節點恆為 0。",
  },
];

function stat(label, value) {
  const node = el("div", "stat");
  node.append(el("span", "stat-label", label), el("span", "stat-value", value));
  return node;
}

export function renderWeights(host, view) {
  const part = view.parts.weights;
  if (!part || !part.ok) {
    host.replaceChildren(errorBox(part && part.error ? part.error.message : "沒有權重資料"));
    return;
  }

  const relay = part.relay;

  // 只留下 onionoo 真的有回傳的指標
  const available = METRICS.filter((m) => relay[m.id] && periodsOf(relay[m.id]).length);
  if (!available.length) {
    host.replaceChildren(infoBox("onionoo 尚未累積到這個節點的權重歷史。"));
    return;
  }

  // 不同指標的期間理論上一致，取聯集以防萬一
  const periods = periodsOf(Object.assign({}, ...available.map((m) => relay[m.id])));

  const metricTabsHost = el("div");
  const periodTabsHost = el("div");
  const noteHost = el("div");
  const chartHost = el("div");
  const statsHost = el("div", "stats");
  host.replaceChildren(metricTabsHost, periodTabsHost, noteHost, chartHost, statsHost);

  let activeMetric = available[0];
  let activePeriod = periods[0];

  // yFormat 讀取閉包變數，切換指標時不必重建圖表
  const chart = makeChart(chartHost, {
    height: 240,
    yFormat: (v) => activeMetric.format(v),
    ariaLabel: "權重歷史",
  });

  function update() {
    const normalized = normalizeHistory((relay[activeMetric.id] || {})[activePeriod]);

    noteHost.replaceChildren();
    statsHost.replaceChildren();

    if (!normalized) {
      chart.setSeries([]);
      noteHost.append(infoBox(`${activeMetric.label}在${periodLabel(activePeriod)}期間沒有資料。`));
      return;
    }

    if (isDegenerate(normalized)) {
      chart.setSeries([]);
      noteHost.append(
        infoBox(
          `${activeMetric.label}整段期間皆為 0，此節點不適用這項指標` +
            `（例如純 Guard／Middle 節點的出口機率）。`,
        ),
      );
      return;
    }

    chart.setSeries([
      {
        key: activeMetric.id,
        name: activeMetric.label,
        color: activeMetric.color,
        fill: true,
        points: normalized.points,
      },
    ]);

    noteHost.append(infoBox(activeMetric.hint));

    const mean = average(normalized.points);
    const latest = [...normalized.points].reverse().find((p) => p.v != null);
    statsHost.append(
      stat("期間平均", mean == null ? "—" : activeMetric.format(mean)),
      stat("最新一筆", latest ? activeMetric.format(latest.v) : "—"),
    );
  }

  metricTabsHost.replaceChildren(
    makeTabs(
      available.map((m) => ({ id: m.id, label: m.label })),
      activeMetric.id,
      (id) => {
        activeMetric = available.find((m) => m.id === id) || activeMetric;
        update();
      },
    ),
  );

  periodTabsHost.replaceChildren(
    makeTabs(
      periods.map((p) => ({ id: p, label: periodLabel(p) })),
      activePeriod,
      (id) => {
        activePeriod = id;
        update();
      },
    ),
  );

  update();
}

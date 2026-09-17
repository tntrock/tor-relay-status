/** 頂部的重點數字卡。 */

import { bps, num, pct, duration, parseTime } from "../format.js";
import { normalizeHistory, periodsOf, average, periodLabel } from "../api.js";
import { el, errorBox, skeleton } from "../ui.js";

function card({ label, value, sub, hint, tone }) {
  const box = el("div", `card${tone ? ` card-${tone}` : ""}`);

  const head = el("div", "card-label");
  head.append(el("span", null, label));
  if (hint) {
    const mark = el("span", "hint", "?");
    mark.title = hint;
    mark.setAttribute("aria-label", hint);
    head.append(mark);
  }

  box.append(head, el("div", "card-value", value));
  if (sub) box.append(el("div", "card-sub", sub));
  return box;
}

export function renderKpi(host, view) {
  const details = view.parts.details;
  const uptimePart = view.parts.uptime;

  if (!details || !details.ok) {
    host.replaceChildren(
      errorBox(details && details.error ? details.error.message : "沒有節點資料"),
    );
    return;
  }

  const relay = details.relay;
  const cards = [];

  cards.push(
    card({
      label: "觀測頻寬",
      value: bps(relay.observed_bandwidth),
      sub: relay.measured === true ? "True" : "False",
      tone: "accent",
      hint: "節點在過去一段時間內實際達到的持續吞吐量，取自節點自行回報的描述檔。",
    }),
    card({
      label: "宣告頻寬",
      value: bps(relay.advertised_bandwidth),
      sub: "對外宣告可提供的頻寬",
      hint: "節點宣告願意提供的頻寬，等於設定上限與觀測頻寬中較小的那個。",
    }),
    card({
      label: "設定上限",
      value: bps(relay.bandwidth_rate),
      sub: relay.bandwidth_burst ? `突發上限 ${bps(relay.bandwidth_burst)}` : null,
      hint: "torrc 中 RelayBandwidthRate 與 RelayBandwidthBurst 的設定值。",
    }),
    card({
      label: "共識權重",
      value: num(relay.consensus_weight),
      sub:
        typeof relay.consensus_weight_fraction === "number"
          ? `佔全網 ${pct(relay.consensus_weight_fraction, 4)}`
          : null,
      hint: "目錄權威給這個節點的權重，決定客戶端選到它的機率。",
    }),
  );

  /* 上線率：期間由 onionoo 回應決定，這個節點目前最短是 1 個月 */
  if (uptimePart && uptimePart.ok && uptimePart.relay.uptime) {
    const periods = periodsOf(uptimePart.relay.uptime);
    const shortest = periods[0];
    if (shortest) {
      const normalized = normalizeHistory(uptimePart.relay.uptime[shortest]);
      const mean = normalized ? average(normalized.points) : null;
      cards.push(
        card({
          label: `${periodLabel(shortest)}上線率`,
          value: mean == null ? "—" : pct(mean, 2),
          sub: "期間內被目錄共識視為 Running 的比例",
          tone: mean == null ? null : mean >= 0.99 ? "ok" : mean >= 0.9 ? "warn" : "bad",
          hint: "由 onionoo 每隔數小時取樣的 Running 標記平均而得。",
        }),
      );
    }
  } else {
    cards.push(
      card({ label: "上線率", value: "—", sub: "上線率資料未取得", hint: "onionoo /uptime 端點沒有回應。" }),
    );
  }

  const restarted = parseTime(relay.last_restarted);
  cards.push(
    card({
      label: "本次已運行",
      value: restarted ? duration(Date.now() - restarted.getTime()) : "—",
      sub: restarted ? `自 ${restarted.toISOString().slice(0, 16).replace("T", " ")} UTC` : null,
      hint: "距離 Tor 行程最後一次重新啟動的時間。",
    }),
  );

  host.replaceChildren(...cards);
}

export function kpiSkeleton(host) {
  host.replaceChildren(skeleton("cards", 6));
}

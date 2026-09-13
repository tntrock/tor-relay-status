/** 頁首：節點名稱、運行狀態、fingerprint、資料時間。 */

import { fmtTime, relTime, duration, parseTime } from "../format.js";
import { el, mono, copyButton } from "../ui.js";

const VERSION_STATUS = {
  recommended: { text: "版本受推薦", tone: "ok" },
  experimental: { text: "實驗版本", tone: "warn" },
  obsolete: { text: "版本過舊", tone: "bad" },
  unrecommended: { text: "版本不受推薦", tone: "bad" },
  "new in series": { text: "新版本系列", tone: "warn" },
};

function pill(text, tone, title) {
  const node = el("span", `pill pill-${tone}`);
  node.append(el("span", "pill-dot"), el("span", null, text));
  if (title) node.title = title;
  return node;
}

export function renderMasthead(nodes, view) {
  const part = view.parts.details;
  const relay = part && part.relay;

  /* --- 標題 --- */
  nodes.title.textContent = relay && relay.nickname ? relay.nickname : "Tor 中繼";
  document.title = relay && relay.nickname
    ? `${relay.nickname} · Tor 中繼狀態`
    : "Tor 中繼狀態";

  /* --- 狀態列 --- */
  nodes.status.replaceChildren();

  if (!relay) {
    nodes.status.append(pill("資料無法取得", "bad"));
  } else {
    if (relay.running === true) {
      const since = parseTime(relay.last_restarted);
      nodes.status.append(
        pill(
          "上線中",
          "ok",
          since ? `自 ${fmtTime(since)} 起已運行 ${duration(Date.now() - since.getTime())}` : "",
        ),
      );
    } else {
      nodes.status.append(pill("離線", "bad", "目錄共識中找不到 Running 標記"));
    }

    if (relay.hibernating) {
      nodes.status.append(pill("休眠中", "warn", "節點已達流量上限，暫停轉送流量"));
    }

    const versionStatus = VERSION_STATUS[relay.version_status];
    if (relay.version) {
      const tone = versionStatus ? versionStatus.tone : "neutral";
      const note = versionStatus ? versionStatus.text : "版本狀態未知";
      nodes.status.append(pill(`Tor ${relay.version}`, tone, note));
    }

    if (relay.overload_general_timestamp) {
      const when = parseTime(relay.overload_general_timestamp);
      nodes.status.append(pill("近期過載", "warn", `節點於 ${fmtTime(when)} 回報過載`));
    }

    if (Array.isArray(relay.flags) && relay.flags.includes("Exit")) {
      nodes.status.append(pill("出口節點", "neutral"));
    } else if (Array.isArray(relay.flags) && relay.flags.includes("Guard")) {
      nodes.status.append(pill("入口節點 (Guard)", "neutral"));
    }
  }

  /* --- fingerprint --- */
  nodes.ident.replaceChildren();
  const fingerprint = (relay && relay.fingerprint) || view.fingerprint;
  const row = el("div", "ident-row");
  row.append(el("span", "ident-label", "Fingerprint"), mono(fingerprint), copyButton(fingerprint));
  nodes.ident.append(row);

  if (relay && relay.contact) {
    const contact = el("div", "ident-row");
    contact.append(el("span", "ident-label", "Contact"), el("span", "ident-value", relay.contact));
    nodes.ident.append(contact);
  }

  /* --- 資料時間 --- */
  nodes.meta.replaceChildren();
  const bits = [];
  if (view.relaysPublished) {
    bits.push(`onionoo 資料時間 ${fmtTime(view.relaysPublished)}（${relTime(view.relaysPublished)}）`);
  }
  bits.push(`取得於 ${fmtTime(view.fetchedAt)}`);
  if (view.cache) bits.push(`邊緣快取 ${view.cache}`);
  nodes.meta.textContent = bits.join(" · ");
}

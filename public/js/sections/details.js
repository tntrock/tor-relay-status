/** 節點資訊：分成身分／網路位置／頻寬權重／版本生命週期四組。 */

import { bps, num, pct, parseTime, fmtTime, relTime, duration } from "../format.js";
import { el, kvTable, mono, monoList, errorBox } from "../ui.js";

const VERSION_STATUS_ZH = {
  recommended: "recommended",
  experimental: "experimental",
  obsolete: "obsolete",
  unrecommended: "unrecommended",
  "new in series": "新版本系列",
};

function isIPv6(address) {
  return address.includes("[");
}

function group(title, rows) {
  const table = kvTable(rows);
  if (!table.querySelector("tr")) return null;
  const wrap = el("div", "group");
  wrap.append(el("h3", "sub-heading", title), table);
  return wrap;
}

function timeCell(text) {
  const date = parseTime(text);
  if (!date) return null;
  const node = el("span");
  node.append(el("span", null, fmtTime(date)), el("span", "dim", ` · ${relTime(date)}`));
  node.title = `${text} UTC`;
  return node;
}

export function renderDetails(host, view) {
  const part = view.parts.details;
  if (!part || !part.ok) {
    host.replaceChildren(errorBox(part && part.error ? part.error.message : "沒有節點資料"));
    return;
  }

  const r = part.relay;
  const orAddresses = Array.isArray(r.or_addresses) ? r.or_addresses : [];
  const family = Array.isArray(r.effective_family)
    ? r.effective_family.filter((f) => f !== r.fingerprint)
    : [];

  const groups = [];

  groups.push(
    group("身分", [
      ["Nickname", r.nickname],
      ["Fingerprint", mono(r.fingerprint)],
      ["Contact", r.contact || null, "節點營運者自行填寫的聯絡資訊。"],
      [
        "Effective family",
        family.length ? monoList(family) : el("span", "dim", "無（未與其他節點組成家族）"),
        "同一營運者的節點群；客戶端不會在同一條電路上同時選用家族成員。",
      ],
      [
        "Alleged family",
        Array.isArray(r.alleged_family) && r.alleged_family.length
          ? monoList(r.alleged_family)
          : undefined,
        "單方面宣告、但對方沒有回應的家族成員，不生效。",
      ],
    ]),
  );

  groups.push(
    group("網路位置", [
      [
        "OR 位址 (IPv4)",
        monoList(orAddresses.filter((a) => !isIPv6(a))),
        "節點對外接受 Tor 連線的位址與連接埠。",
      ],
      [
        "OR 位址 (IPv6)",
        orAddresses.some(isIPv6)
          ? monoList(orAddresses.filter(isIPv6))
          : el("span", "dim", "未提供 IPv6"),
      ],
      ["Dir 位址", r.dir_address ? mono(r.dir_address) : undefined],
      [
        "無法連線的位址",
        Array.isArray(r.unreachable_or_addresses) && r.unreachable_or_addresses.length
          ? monoList(r.unreachable_or_addresses)
          : undefined,
        "節點宣告了但目錄權威連不上的位址。",
      ],
      [
        "出口位址",
        Array.isArray(r.exit_addresses) && r.exit_addresses.length
          ? monoList(r.exit_addresses)
          : undefined,
        "實際對外送出流量時使用的位址，可能與 OR 位址不同。",
      ],
      ["國家", r.country_name ? `${r.country_name} (${String(r.country).toUpperCase()})` : null],
      ["自治系統", r.as ? `${r.as} — ${r.as_name || "未知"}` : null, "節點所在的網路供應商 AS 編號。"],
      [
        "主機名稱",
        Array.isArray(r.verified_host_names) && r.verified_host_names.length
          ? monoList(r.verified_host_names)
          : undefined,
        "經正反解交叉驗證過的主機名稱。",
      ],
      ["最後變更位址", timeCell(r.last_changed_address_or_port)],
    ]),
  );

  groups.push(
    group("頻寬與權重", [
      ["觀測頻寬", bps(r.observed_bandwidth)],
      ["宣告頻寬", bps(r.advertised_bandwidth)],
      ["設定上限 (Rate)", bps(r.bandwidth_rate)],
      ["設定上限 (Burst)", bps(r.bandwidth_burst)],
      [
        "是否經實測",
        r.measured === true ? "True" : "False",
        "未經實測的節點權重會被限制，影響被選中的機率。",
      ],
      ["共識權重", num(r.consensus_weight)],
      ["權重佔全網", pct(r.consensus_weight_fraction, 6)],
      ["入口機率", pct(r.guard_probability, 6)],
      ["中繼機率", pct(r.middle_probability, 6)],
      ["出口機率", pct(r.exit_probability, 6)],
    ]),
  );

  const restarted = parseTime(r.last_restarted);
  const firstSeen = parseTime(r.first_seen);
  groups.push(
    group("版本與生命週期", [
      ["平台", r.platform],
      [
        "Tor 版本",
        r.version
          ? `${r.version}（${VERSION_STATUS_ZH[r.version_status] || r.version_status || "狀態未知"}）`
          : null,
      ],
      ["最後重新啟動", timeCell(r.last_restarted)],
      ["本次已運行", restarted ? duration(Date.now() - restarted.getTime()) : null],
      ["首次出現", timeCell(r.first_seen)],
      ["加入網路已", firstSeen ? duration(Date.now() - firstSeen.getTime()) : null],
      ["最後被看到", timeCell(r.last_seen)],
      ["休眠中", r.hibernating ? "是，已達流量上限" : undefined],
      [
        "一般過載回報",
        r.overload_general_timestamp ? timeCell(r.overload_general_timestamp) : undefined,
        "節點回報自身資源吃緊的最後時間。",
      ],
      [
        "檔案描述子耗盡",
        r.overload_fd_exhausted_timestamp ? timeCell(r.overload_fd_exhausted_timestamp) : undefined,
      ],
    ]),
  );

  host.replaceChildren(...groups.filter(Boolean));
}

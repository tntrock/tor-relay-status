/** Exit Policy：先給一句結論，再列出連接埠與完整規則原文。 */

import { el, errorBox, mono } from "../ui.js";

const WELL_KNOWN = {
  "20-21": "FTP",
  22: "SSH",
  23: "Telnet",
  43: "WHOIS",
  53: "DNS",
  "79-81": "Finger / HTTP",
  80: "HTTP",
  "88": "Kerberos",
  110: "POP3",
  143: "IMAP",
  194: "IRC",
  443: "HTTPS",
  464: "Kerberos",
  531: "IRC / AIM",
  543: "Kerberos",
  544: "Kerberos",
  554: "RTSP",
  563: "NNTPS",
  587: "SMTP 送信",
  636: "LDAPS",
  706: "SILC",
  749: "Kerberos",
  873: "rsync",
  902: "VMware",
  903: "VMware",
  904: "VMware",
  981: "遠端管理",
  989: "FTPS",
  990: "FTPS",
  991: "網路管理",
  992: "Telnet over TLS",
  993: "IMAPS",
  994: "IRCS",
  995: "POP3S",
  1194: "OpenVPN",
  1220: "QuickTime",
  1293: "IPSec",
  1500: "VLSI",
  1533: "Sametime",
  1677: "GroupWise",
  1723: "PPTP",
  1755: "MMS",
  1863: "MSNP",
  2082: "cPanel",
  2083: "cPanel TLS",
  2086: "WHM",
  2087: "WHM TLS",
  2095: "Webmail",
  2096: "Webmail TLS",
  2102: "Zephyr",
  3128: "HTTP Proxy",
  3389: "RDP",
  3690: "SVN",
  4321: "RWHOIS",
  4643: "Virtuozzo",
  5050: "MSN Messenger",
  5190: "AIM / ICQ",
  5222: "XMPP",
  5223: "XMPP",
  5228: "Android Market",
  5900: "VNC",
  6660: "IRC",
  6661: "IRC",
  6662: "IRC",
  6663: "IRC",
  6664: "IRC",
  6665: "IRC",
  6666: "IRC",
  6667: "IRC",
  6668: "IRC",
  6669: "IRC",
  6679: "IRC SSL",
  6697: "IRC SSL",
  8000: "HTTP 替代埠",
  8008: "HTTP 替代埠",
  8074: "Gadu-Gadu",
  8080: "HTTP Proxy",
  8082: "HTTP 替代埠",
  8087: "SPP",
  8088: "HTTP 替代埠",
  8232: "Zcash",
  8233: "Zcash",
  8332: "Bitcoin",
  8333: "Bitcoin",
  8443: "HTTPS 替代埠",
  8888: "HTTP 替代埠",
  9418: "Git",
  9999: "Distinct",
  10000: "Webmin",
  11371: "OpenPGP 金鑰伺服器",
  19294: "Google Voice",
  19638: "Ensim",
  50002: "Electrum",
  64738: "Mumble",
};

function portChip(spec) {
  const chip = el("span", "port");
  if (spec === "1-65535") {
    chip.textContent = "1–65535（全部）";
    return chip;
  }
  chip.append(el("span", "port-num", spec));
  const name = WELL_KNOWN[spec];
  if (name) chip.append(el("span", "port-name", name));
  return chip;
}

function verdictBox(tone, title, note) {
  const box = el("div", `verdict verdict-${tone}`);
  const head = el("div", "verdict-head");
  head.append(el("span", "verdict-dot"), el("strong", null, title));
  box.append(head, el("p", "verdict-note", note));
  return box;
}

function rawPolicy(policy) {
  if (!Array.isArray(policy) || !policy.length) return null;
  const wrap = el("details", "raw");
  const summary = el("summary", null, `完整規則原文（${policy.length} 條）`);
  const list = el("pre", "raw-body", policy.join("\n"));
  wrap.append(summary, list);
  return wrap;
}

export function renderExitPolicy(host, view) {
  const part = view.parts.details;
  if (!part || !part.ok) {
    host.replaceChildren(errorBox(part && part.error ? part.error.message : "沒有節點資料"));
    return;
  }

  const relay = part.relay;
  const summary = relay.exit_policy_summary || relay.exit_policy_v6_summary || null;
  const accept = summary && Array.isArray(summary.accept) ? summary.accept : null;
  const reject = summary && Array.isArray(summary.reject) ? summary.reject : null;
  const isAll = (list) => list && list.length === 1 && list[0] === "1-65535";

  const children = [];

  if ((!accept && !reject) || (reject && isAll(reject))) {
    children.push(
      verdictBox(
        "reject",
        "Reject all — 非出口節點",
        "此節點只擔任入口（Guard）或中間跳點，不會把流量送出 Tor 網路，" +
          "因此不會收到針對出口節點的濫用檢舉。",
      ),
    );
  } else if (accept && isAll(accept)) {
    children.push(
      verdictBox("accept", "Accept all — 完全開放出口", "此節點允許連往所有連接埠。"),
    );
  } else if (accept) {
    children.push(
      verdictBox("accept", "出口節點 — 僅允許特定連接埠", "只有下列連接埠允許對外連線，其餘一律拒絕。"),
    );
    const row = el("div", "port-row");
    row.append(el("span", "port-tag port-tag-accept", "允許"));
    const ports = el("div", "ports");
    for (const spec of accept) ports.append(portChip(spec));
    row.append(ports);
    children.push(row);
  } else {
    children.push(
      verdictBox("accept", "出口節點 — 拒絕特定連接埠", "除了下列被拒絕的連接埠，其餘皆允許對外連線。"),
    );
    const row = el("div", "port-row");
    row.append(el("span", "port-tag port-tag-reject", "拒絕"));
    const ports = el("div", "ports");
    for (const spec of reject) ports.append(portChip(spec));
    row.append(ports);
    children.push(row);
  }

  if (relay.exit_policy_v6_summary && relay.exit_policy_summary) {
    const note = el("p", "verdict-note");
    note.append(el("span", null, "IPv6 另有獨立政策："), mono(JSON.stringify(relay.exit_policy_v6_summary)));
    children.push(note);
  }

  const raw = rawPolicy(relay.exit_policy);
  if (raw) children.push(raw);

  host.replaceChildren(...children);
}

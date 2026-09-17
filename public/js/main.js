/** 進入點：載入資料、驅動各區塊、處理重新整理與多節點切換。 */

import { RELAYS, SITE } from "../config.js";
import { loadRelay, ENDPOINTS } from "./api.js";
import { initTheme } from "./theme.js";
import { el, errorBox, skeleton, setSectionBusy } from "./ui.js";
import { renderMasthead } from "./sections/header.js";
import { renderKpi } from "./sections/kpi.js";
import { renderFlags } from "./sections/flags.js";
import { renderBandwidth } from "./sections/bandwidth.js";
import { renderUptime } from "./sections/uptime.js";
import { renderWeights } from "./sections/weights.js";
import { renderDetails } from "./sections/details.js";
import { renderExitPolicy } from "./sections/exitpolicy.js";

const $ = (id) => document.getElementById(id);

const nodes = {
  title: $("relay-title"),
  status: $("relay-status"),
  ident: $("relay-ident"),
  meta: $("relay-meta"),
  switcher: $("relay-switcher"),
  globalError: $("global-error"),
  refresh: $("refresh"),
  theme: $("theme-toggle"),
  footer: $("footer"),
};

/** 每個區塊：容器、渲染函式、載入骨架的長相 */
const SECTIONS = [
  { host: $("kpi"), render: renderKpi, skeleton: () => skeleton("cards", 6) },
  { host: $("flags"), render: renderFlags, skeleton: () => skeleton("chips", 6) },
  { host: $("bandwidth"), render: renderBandwidth, skeleton: () => skeleton("chart", 1) },
  { host: $("uptime"), render: renderUptime, skeleton: () => skeleton("chart", 1) },
  { host: $("weights"), render: renderWeights, skeleton: () => skeleton("chart", 1) },
  { host: $("details"), render: renderDetails, skeleton: () => skeleton("rows", 8) },
  { host: $("exitpolicy"), render: renderExitPolicy, skeleton: () => skeleton("rows", 2) },
];

let activeRelay = pickInitialRelay();
let loading = false;

function pickInitialRelay() {
  const wanted = new URL(location.href).searchParams.get("relay");
  if (wanted) {
    const match = RELAYS.find(
      (r) =>
        r.fingerprint.toLowerCase() === wanted.toLowerCase() ||
        (r.label || "").toLowerCase() === wanted.toLowerCase(),
    );
    if (match) return match;
  }
  return RELAYS[0];
}

function buildSwitcher() {
  if (RELAYS.length < 2) {
    nodes.switcher.hidden = true;
    return;
  }
  nodes.switcher.hidden = false;
  nodes.switcher.replaceChildren();
  nodes.switcher.setAttribute("role", "tablist");

  for (const relay of RELAYS) {
    const button = el("button", "switch", relay.label || relay.fingerprint.slice(0, 8));
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(relay === activeRelay));
    button.addEventListener("click", () => {
      if (relay === activeRelay) return;
      activeRelay = relay;
      const url = new URL(location.href);
      url.searchParams.set("relay", relay.label || relay.fingerprint);
      history.replaceState(null, "", url);
      buildSwitcher();
      load();
    });
    nodes.switcher.append(button);
  }
}

function showSkeletons() {
  for (const section of SECTIONS) {
    if (!section.host) continue;
    setSectionBusy(section.host.closest("section"), true);
    section.host.replaceChildren(section.skeleton());
  }
}

function renderFooter() {
  nodes.footer.replaceChildren();

  const note = el("p", "footer-note");
  note.append(
    el("span", null, "資料來源："),
    link("Tor Metrics onionoo API", "https://onionoo.torproject.org/"),
    el(
      "span",
      null,
      "。本站透過 Cloudflare 邊緣代為取得資料，你的瀏覽器不會直接連線 torproject.org",
    ),
  );
  nodes.footer.append(note);

  const links = el("p", "footer-note");
  links.append(
    link("在 Relay Search 查看此節點", `https://metrics.torproject.org/rs.html#details/${activeRelay.fingerprint}`),
    el("span", "dim", " · "),
    link("Tor Metrics", "https://metrics.torproject.org/"),
    el("span", "dim", " · "),
    link("如何架設中繼", "https://community.torproject.org/relay/"),
  );
  nodes.footer.append(links);

  if (SITE.contact) {
    nodes.footer.append(el("p", "footer-note dim", `節點營運者聯絡方式：${SITE.contact}`));
  }
}

function link(text, href) {
  const anchor = el("a", null, text);
  anchor.href = href;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  return anchor;
}

async function load() {
  if (loading) return;
  loading = true;
  nodes.refresh.disabled = true;
  nodes.refresh.classList.add("spinning");
  nodes.globalError.replaceChildren();
  showSkeletons();

  const view = await loadRelay(activeRelay.fingerprint);

  const failed = ENDPOINTS.filter((name) => !view.parts[name] || !view.parts[name].ok);
  if (failed.length === ENDPOINTS.length) {
    const first = view.parts[ENDPOINTS[0]];
    nodes.globalError.replaceChildren(
      errorBox(
        first && first.error ? first.error.message : "所有資料端點都失敗了",
        "請確認 functions/api/onionoo/[[path]].js 已隨網站部署到 Cloudflare Pages，" +
          "並確認 onionoo 服務本身正常。",
      ),
    );
  } else if (failed.length) {
    nodes.globalError.replaceChildren(
      errorBox(`部分資料未取得（${failed.join("、")}）`, "其餘區塊仍顯示已取得的資料。"),
    );
  }

  renderMasthead(nodes, view);
  for (const section of SECTIONS) {
    if (!section.host) continue;
    try {
      section.render(section.host, view);
    } catch (err) {
      section.host.replaceChildren(errorBox("這個區塊渲染失敗", String(err && err.message)));
    }
    setSectionBusy(section.host.closest("section"), false);
  }
  renderFooter();

  loading = false;
  nodes.refresh.disabled = false;
  nodes.refresh.classList.remove("spinning");
}

initTheme(nodes.theme);
nodes.refresh.addEventListener("click", load);
buildSwitcher();
load();

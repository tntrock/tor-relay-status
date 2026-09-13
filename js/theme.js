/** 深色模式：自動（跟隨系統）→ 淺色 → 深色 三段循環，選擇存在 localStorage。 */

const KEY = "tor-relay-theme";
const ORDER = ["auto", "light", "dark"];
const LABEL = { auto: "自動", light: "淺色", dark: "深色" };
const ICON = { auto: "◐", light: "☀", dark: "☾" };

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return ORDER.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function write(mode) {
  try {
    if (mode === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* 無痕模式下 localStorage 會丟例外，忽略即可，主題仍在本次瀏覽有效 */
  }
}

function apply(mode) {
  if (mode === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

export function initTheme(button) {
  let mode = read();
  apply(mode);

  function refresh() {
    button.textContent = ICON[mode];
    button.title = `外觀：${LABEL[mode]}（點擊切換）`;
    button.setAttribute("aria-label", `外觀：${LABEL[mode]}，點擊切換`);
  }

  refresh();
  button.addEventListener("click", () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    apply(mode);
    write(mode);
    refresh();
  });
}

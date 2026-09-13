/** 共用的小型 UI 元件。刻意不用 innerHTML 拼字串，避免 CSP 與跳脫問題。 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * 期間／指標切換頁籤。
 * @param {{id: string, label: string}[]} items
 * @param {string} activeId
 * @param {(id: string) => void} onSelect
 */
export function makeTabs(items, activeId, onSelect) {
  const nav = el("div", "tabs");
  nav.setAttribute("role", "tablist");

  const buttons = items.map((item) => {
    const button = el("button", "tab", item.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(item.id === activeId));
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-selected", "false");
      button.setAttribute("aria-selected", "true");
      onSelect(item.id);
    });
    nav.append(button);
    return button;
  });

  return nav;
}

/**
 * 鍵值表格。
 * @param {[string, (string|Node|null), (string|undefined)][]} rows
 *        [標籤, 值, 說明]；值為 null / 空字串時顯示破折號
 */
export function kvTable(rows) {
  const table = el("table", "kv");
  const body = el("tbody");

  for (const [key, value, hint] of rows) {
    if (value === undefined) continue;
    const tr = el("tr");

    const th = el("th");
    th.scope = "row";
    th.append(el("span", null, key));
    if (hint) {
      const mark = el("span", "hint", "?");
      mark.title = hint;
      mark.setAttribute("aria-label", hint);
      th.append(mark);
    }

    const td = el("td");
    if (value instanceof Node) {
      td.append(value);
    } else if (value == null || value === "") {
      td.append(el("span", "dim", "—"));
    } else {
      td.textContent = String(value);
    }

    tr.append(th, td);
    body.append(tr);
  }

  table.append(body);
  return table;
}

export function mono(text) {
  return el("span", "mono", text);
}

/** 一段等寬、可換行的清單（家族成員、位址等） */
export function monoList(values) {
  if (!values || !values.length) return null;
  const wrap = el("div", "mono-list");
  for (const value of values) wrap.append(el("div", "mono", value));
  return wrap;
}

export function copyButton(text, label = "複製") {
  const button = el("button", "copy", label);
  button.type = "button";
  button.title = "複製到剪貼簿";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "已複製";
    } catch {
      button.textContent = "複製失敗";
    }
    setTimeout(() => {
      button.textContent = label;
    }, 1500);
  });
  return button;
}

/** 區塊層級的錯誤訊息：只讓這一塊降級，不影響整頁 */
export function errorBox(message, detail) {
  const box = el("div", "notice notice-bad");
  box.append(el("strong", null, "無法載入："), el("span", null, ` ${message}`));
  if (detail) box.append(el("div", "notice-detail", detail));
  return box;
}

export function infoBox(message) {
  return el("div", "notice notice-info", message);
}

/** 載入骨架，避免資料回來時整頁跳動 */
export function skeleton(kind = "block", count = 1) {
  const wrap = el("div", `skel skel-${kind}`);
  for (let i = 0; i < count; i += 1) wrap.append(el("div", "skel-bar"));
  return wrap;
}

export function setSectionBusy(section, busy) {
  if (!section) return;
  section.setAttribute("aria-busy", String(Boolean(busy)));
}

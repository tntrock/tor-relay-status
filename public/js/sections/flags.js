/** Flags：目錄權威給節點的角色標記，附中文解釋。 */

import { el, errorBox, infoBox } from "../ui.js";

/** 說明取自 Tor 目錄協定規格 dir-spec 對各 flag 的定義 */
const FLAG_INFO = {
  Authority: ["目錄權威", "這個節點本身就是目錄權威伺服器。"],
  BadExit: ["不良出口", "被目錄權威標記為不可信任的出口，客戶端不會用它連往外部網路。"],
  Exit: ["出口節點", "允許連往 Tor 網路以外的目的地，是電路的最後一站。"],
  Fast: ["高頻寬", "頻寬排在全網前段，會被選來承載一般電路。"],
  Guard: ["入口節點", "穩定且頻寬充足，適合當客戶端長期固定的第一跳。"],
  HSDir: ["洋蔥服務目錄", "擔任洋蔥服務描述檔的分散式目錄快取。"],
  MiddleOnly: ["僅中間節點", "被限制只能當中間節點，不會被選為入口或出口。"],
  NoEdConsensus: ["金鑰無共識", "目錄權威對這個節點的 Ed25519 金鑰沒有共識。"],
  Running: ["運行中", "目錄權威近期確認過這個節點可以連線。"],
  Stable: ["穩定", "平均不中斷運行時間長，適合承載長連線。"],
  StaleDesc: ["描述檔過舊", "節點描述檔超過 18 小時沒有更新。"],
  Sybil: ["同源過多", "同一個 IP 上的節點數量過多，部分被排除在共識之外。"],
  V2Dir: ["目錄快取", "提供目錄服務，讓客戶端能向它索取共識文件。"],
  Valid: ["通過驗證", "版本與設定正常，可以納入共識。"],
};

function chip(flag, { active }) {
  const info = FLAG_INFO[flag];
  const bad = flag === "BadExit" || flag === "StaleDesc" || flag === "Sybil" || flag === "NoEdConsensus";
  const node = el("span", `flag${active ? "" : " flag-past"}${bad && active ? " flag-bad" : ""}`);

  node.append(el("strong", null, flag));
  if (info) node.append(el("span", "flag-zh", info[0]));
  node.title = info ? `${flag}：${info[1]}` : flag;
  node.setAttribute("aria-label", info ? `${flag}，${info[0]}，${info[1]}` : flag);
  return node;
}

export function renderFlags(host, view) {
  const details = view.parts.details;
  if (!details || !details.ok) {
    host.replaceChildren(errorBox(details && details.error ? details.error.message : "沒有節點資料"));
    return;
  }

  const current = Array.isArray(details.relay.flags) ? details.relay.flags : [];
  const children = [];

  const list = el("div", "flags");
  if (current.length) {
    for (const flag of current) list.append(chip(flag, { active: true }));
  } else {
    list.append(el("span", "dim", "目前沒有任何 flag"));
  }
  children.push(list);

  /* onionoo /uptime 會回傳歷史上持有過的 flag，拿來標出「現在沒有、以前有」 */
  const uptimePart = view.parts.uptime;
  if (uptimePart && uptimePart.ok && uptimePart.relay.flags) {
    const past = Object.keys(uptimePart.relay.flags).filter((f) => !current.includes(f));
    if (past.length) {
      const pastList = el("div", "flags flags-past");
      pastList.append(el("span", "flags-past-label", "歷史上曾持有："));
      for (const flag of past) pastList.append(chip(flag, { active: false }));
      children.push(pastList);
    }
  }

  children.push(infoBox("將游標移到標記上可看說明。這些標記由目錄權威每小時重新投票決定。"));
  host.replaceChildren(...children);
}

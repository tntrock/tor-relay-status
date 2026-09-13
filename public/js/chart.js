/**
 * 手寫 SVG 折線／面積圖。
 *
 * 刻意不引入圖表函式庫：本站的存在理由就是「訪客連不到外部主機」，
 * 再掛一個 CDN 依賴等於把同一個問題搬到別的網域上。
 * 顏色全部走 CSS 變數，深色模式不必另外處理。
 */

import { fmtTime } from "./format.js";

const NS = "http://www.w3.org/2000/svg";
/** left 只是下限，實際左側留白會依 Y 軸標籤量出來的寬度決定 */
const PAD = { top: 14, right: 16, bottom: 26, left: 34 };

/** getBBox 在某些情況（元素尚未佈局）會失敗，退回用字數估算 */
function measureWidth(nodes) {
  let max = 0;
  for (const node of nodes) {
    let width = 0;
    try {
      width = node.getBBox().width;
    } catch {
      width = 0;
    }
    if (!width) width = (node.textContent || "").length * 6.6;
    if (width > max) max = width;
  }
  return max;
}

function svgEl(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs || {})) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/** 算出好看的 Y 軸刻度（1 / 2 / 2.5 / 5 × 10^n） */
function niceScale(max, tickCount = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const stepFactor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Number(v.toFixed(10)));
  return { max: top, ticks };
}

function nearestPoint(points, time) {
  let best = null;
  let bestDistance = Infinity;
  for (const p of points) {
    if (p.v == null) continue;
    const distance = Math.abs(p.t.getTime() - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best;
}

function buildLine(points, xOf, yOf) {
  let d = "";
  let open = false;
  for (const p of points || []) {
    if (p.v == null) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${xOf(p.t.getTime()).toFixed(1)} ${yOf(p.v).toFixed(1)}`;
    open = true;
  }
  return d;
}

/** 缺漏點會把面積切成好幾段，每段各自封底，不能一路連過去 */
function buildArea(points, xOf, yOf, baseY) {
  let d = "";
  let segment = [];

  const flush = () => {
    if (segment.length >= 2) {
      d += `M${segment[0].x} ${baseY}`;
      for (const s of segment) d += `L${s.x} ${s.y}`;
      d += `L${segment[segment.length - 1].x} ${baseY}Z`;
    }
    segment = [];
  };

  for (const p of points || []) {
    if (p.v == null) {
      flush();
      continue;
    }
    segment.push({ x: xOf(p.t.getTime()).toFixed(1), y: yOf(p.v).toFixed(1) });
  }
  flush();
  return d;
}

/**
 * @param {HTMLElement} host 圖表要塞進去的容器
 * @param {object} options height / yFormat / emptyText / ariaLabel
 * @returns {{setSeries(series): void, destroy(): void}}
 *   series: [{ key, name, color, fill, points: [{t: Date, v: number|null}] }]
 */
export function makeChart(host, options = {}) {
  const settings = {
    height: 230,
    yFormat: (v) => String(v),
    emptyText: "此期間沒有資料",
    ariaLabel: "趨勢圖",
    ...options,
  };

  const wrap = document.createElement("div");
  wrap.className = "chart";

  const legend = document.createElement("div");
  legend.className = "chart-legend";

  const plot = document.createElement("div");
  plot.className = "chart-plot";

  const svg = svgEl("svg", { class: "chart-svg", role: "img" });
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;

  plot.append(svg, tip);
  wrap.append(legend, plot);
  host.replaceChildren(wrap);

  let series = [];
  const hidden = new Set();
  let frame = 0;

  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  observer.observe(plot);

  function visibleSeries() {
    return series.filter((s) => !hidden.has(s.key));
  }

  /** 按鈕只建立一次；切換時原地改 aria-pressed，重建會讓鍵盤焦點掉失 */
  function drawLegend() {
    legend.replaceChildren();
    if (series.length < 2) return;

    const buttons = series.map((s) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chart-legend-item";

      const swatch = document.createElement("span");
      swatch.className = "chart-swatch";
      swatch.style.background = s.color;

      const label = document.createElement("span");
      label.textContent = s.name;

      item.append(swatch, label);
      legend.append(item);
      return { item, series: s };
    });

    const sync = () => {
      for (const { item, series: s } of buttons) {
        item.setAttribute("aria-pressed", String(!hidden.has(s.key)));
      }
    };

    for (const { item, series: s } of buttons) {
      item.addEventListener("click", () => {
        // 至少保留一條序列，全部關掉只會看到空圖
        if (hidden.has(s.key)) hidden.delete(s.key);
        else if (visibleSeries().length > 1) hidden.add(s.key);
        sync();
        draw();
      });
    }

    sync();
  }

  function draw() {
    const width = plot.clientWidth;
    if (!width) return;

    const height = settings.height;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.replaceChildren();
    tip.hidden = true;

    const active = visibleSeries();
    const allPoints = active.flatMap((s) => s.points || []);
    const known = allPoints.filter((p) => p.v != null && Number.isFinite(p.v));

    if (!known.length) {
      const text = svgEl("text", {
        x: width / 2,
        y: height / 2,
        class: "chart-empty-text",
        "text-anchor": "middle",
      });
      text.textContent = settings.emptyText;
      svg.append(text);
      return;
    }

    const plotHeight = Math.max(10, height - PAD.top - PAD.bottom);
    const baseY = PAD.top + plotHeight;

    const times = allPoints.map((p) => p.t.getTime());
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const span = tMax - tMin;

    const scale = niceScale(Math.max(...known.map((p) => p.v)));

    // 先畫出 Y 軸文字量它多寬，左側留白才會剛好夠用；
    // 寫死留白的話，窄螢幕上像「500.0 KB/s」這種標籤會被 SVG 邊界切掉。
    const yLabels = scale.ticks.map((tick) => {
      const label = svgEl("text", { class: "chart-axis-text", "text-anchor": "end" });
      label.textContent = settings.yFormat(tick);
      svg.append(label);
      return label;
    });
    const padLeft = Math.min(
      Math.max(Math.ceil(measureWidth(yLabels)) + 12, PAD.left),
      Math.round(width * 0.45),
    );

    const plotWidth = Math.max(10, width - padLeft - PAD.right);
    const xOf = (t) =>
      span === 0 ? padLeft + plotWidth / 2 : padLeft + ((t - tMin) / span) * plotWidth;
    const yOf = (v) => baseY - (v / scale.max) * plotHeight;

    scale.ticks.forEach((tick, i) => {
      const y = yOf(tick);
      yLabels[i].setAttribute("x", padLeft - 8);
      yLabels[i].setAttribute("y", y + 4);
      svg.insertBefore(
        svgEl("line", { x1: padLeft, y1: y, x2: padLeft + plotWidth, y2: y, class: "chart-grid" }),
        svg.firstChild,
      );
    });

    // X 軸刻度：跨度超過三天就顯示日期，否則顯示時分
    const showDate = span > 3 * 86400000;
    const tickCount = Math.max(2, Math.min(5, Math.floor(plotWidth / 110)));
    for (let i = 0; i < tickCount; i += 1) {
      const t = tMin + (span * i) / (tickCount - 1);
      const date = new Date(t);
      const label = svgEl("text", {
        x: xOf(t),
        y: height - 8,
        class: "chart-axis-text",
        "text-anchor": i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle",
      });
      label.textContent = showDate
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : fmtTime(date).slice(5);
      svg.append(label);
    }

    // 每條序列：面積 + 折線
    for (const s of active) {
      if (s.fill) {
        const area = svgEl("path", { d: buildArea(s.points, xOf, yOf, baseY), class: "chart-area" });
        area.style.fill = s.color;
        svg.append(area);
      }
      const line = svgEl("path", { d: buildLine(s.points, xOf, yOf), class: "chart-line" });
      line.style.stroke = s.color;
      svg.append(line);
    }

    // 游標十字線與標記點，預設隱藏，hover 才出現
    const cursor = svgEl("line", { class: "chart-cursor", y1: PAD.top, y2: baseY });
    cursor.style.display = "none";
    svg.append(cursor);

    const markers = active.map((s) => {
      const dot = svgEl("circle", { r: 4, class: "chart-dot" });
      dot.style.stroke = s.color;
      dot.style.display = "none";
      svg.append(dot);
      return dot;
    });

    svg.setAttribute(
      "aria-label",
      `${settings.ariaLabel}，${active.map((s) => s.name).join("、")}，` +
        `${fmtTime(new Date(tMin))} 至 ${fmtTime(new Date(tMax))}`,
    );

    const hitArea = svgEl("rect", {
      x: padLeft,
      y: PAD.top,
      width: plotWidth,
      height: plotHeight,
      class: "chart-hit",
    });
    svg.append(hitArea);

    function hide() {
      tip.hidden = true;
      cursor.style.display = "none";
      for (const marker of markers) marker.style.display = "none";
    }

    function move(event) {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      const x = ((event.clientX - box.left) / box.width) * width;
      const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotWidth));
      const time = tMin + ratio * span;

      const rows = [];
      let cursorX = null;

      active.forEach((s, i) => {
        const point = nearestPoint(s.points, time);
        if (!point) {
          markers[i].style.display = "none";
          return;
        }
        const px = xOf(point.t.getTime());
        const py = yOf(point.v);
        markers[i].setAttribute("cx", px);
        markers[i].setAttribute("cy", py);
        markers[i].style.display = "";
        if (cursorX == null) cursorX = px;
        rows.push({ name: s.name, color: s.color, value: settings.yFormat(point.v), at: point.t });
      });

      if (!rows.length) {
        hide();
        return;
      }

      cursor.setAttribute("x1", cursorX);
      cursor.setAttribute("x2", cursorX);
      cursor.style.display = "";

      tip.replaceChildren();
      const when = document.createElement("div");
      when.className = "chart-tip-time";
      when.textContent = fmtTime(rows[0].at);
      tip.append(when);

      for (const row of rows) {
        const line = document.createElement("div");
        line.className = "chart-tip-row";
        const swatch = document.createElement("span");
        swatch.className = "chart-swatch";
        swatch.style.background = row.color;
        const name = document.createElement("span");
        name.textContent = row.name;
        const value = document.createElement("b");
        value.textContent = row.value;
        line.append(swatch, name, value);
        tip.append(line);
      }

      tip.hidden = false;
      const tipWidth = tip.offsetWidth;
      const left = Math.min(Math.max(cursorX - tipWidth / 2, 4), Math.max(4, width - tipWidth - 4));
      tip.style.left = `${left}px`;
      tip.style.top = `${PAD.top}px`;
    }

    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointercancel", hide);
  }

  return {
    setSeries(next) {
      series = Array.isArray(next) ? next : [];
      for (const key of [...hidden]) {
        if (!series.some((s) => s.key === key)) hidden.delete(key);
      }
      drawLegend();
      draw();
    },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

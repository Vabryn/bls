/*
 * UI and layout audit for the BLS Wage Explorer.
 *
 * Loads the app at phone, tablet and desktop sizes (both themes, plus 125%
 * text), drives it into a set of states, and runs general checks in each.
 *
 * Layout
 *   page-overflow      page scrolls sideways
 *   offscreen          content placed past the viewport's left/right edge
 *   text-spill         text extends past its own box
 *   text-clipped       text cut off with no ellipsis
 *   clipped            element partly cut off by an ancestor that hides overflow
 *   overlap            two controls or two pieces of text overlap
 *   covered            a control's centre is under an unrelated element
 *   popup-offscreen    an open menu, list or tooltip extends past the viewport
 *   row-misaligned     controls sharing a toolbar row differ in height or centre
 *   off-centre         a button's icon/label is not centred in the button
 *   ragged-row         (phones) a control stops well short of its card's width
 *   band-gap           unexplained vertical gap between stacked card sections
 *   column-align       a table header is aligned differently from its column
 *   heavy-wrap         text wraps to 4+ lines in a narrow box
 *   empty-box          a bordered/filled box with nothing in it
 *   select-truncated   a <select> is too narrow for its selected label
 *   sticky-offset      a sticky header is not at the top of its scroll box
 *   inner-hscroll      content wider than its box, reachable only sideways
 * Visual
 *   contrast           text below WCAG AA contrast against its background
 *   bad-value          NaN / undefined / null / Infinity / [object ...] shown
 *   text-artifact      doubled words, stray spaces before punctuation, "· ·"
 *   truncated-no-full  text cut with an ellipsis and no title to read it
 *   small-text         (phones) text under 11px
 *   touch-target       (phones) hit area under 44px
 * Behaviour
 *   runtime-error      page error or console.error
 *   layout-shift       cumulative layout shift over 0.1 while loading
 *   focus-invisible    (desktop) keyboard focus shows no visible change
 *   focus-obscured     focused control hidden under the sticky header
 *   popup-escape       Escape does not close an open menu or list
 *   search-label       a search suggestion does not show the words searched
 *   state-mismatch     controls disagree with the app state after rapid input
 *   state-failed       the state could not be reached
 *
 * Findings accepted as intended go in tests/layout-audit.allow.json as
 * "<check> <target>": "<reason>". Errors not in that file fail the run;
 * --strict fails on warnings too.
 *
 * Usage: node tests/layout-audit.cjs [--strict] [--quick] [--only=phone|tablet|desktop]
 *   --quick                    one phone and one desktop size (both themes) only
 *   BLS_URL=<url>              audit a deployed site instead of the local files
 *   LAYOUT_SCREENSHOTS=<dir>   save a screenshot where each finding first appears
 *   LAYOUT_JSON=<file>         write all findings as JSON
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("puppeteer");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const quick = args.includes("--quick");
const only = (args.find(a => a.startsWith("--only=")) || "").slice(7);
const shotDir = process.env.LAYOUT_SCREENSHOTS;
const allowFile = path.join(__dirname, "layout-audit.allow.json");
const allow = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, "utf8")) : {};
const CONCURRENCY = 4;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VIEWPORTS = [
  { name: "phone-320", kind: "phone", width: 320, height: 568 },
  { name: "phone-390", kind: "phone", width: 390, height: 844, quick: true },
  { name: "phone-390-light", kind: "phone", width: 390, height: 844, theme: "light", quick: true },
  { name: "phone-430", kind: "phone", width: 430, height: 932 },
  { name: "phone-390-text125", kind: "phone", width: 390, height: 844, textScale: 1.25 },
  { name: "phone-landscape", kind: "phone", width: 844, height: 390 },
  { name: "tablet-768", kind: "tablet", width: 768, height: 1024 },
  { name: "desktop-1024", kind: "desktop", width: 1024, height: 768 },
  { name: "desktop-1440", kind: "desktop", width: 1440, height: 900, quick: true },
  { name: "desktop-1440-light", kind: "desktop", width: 1440, height: 900, theme: "light", quick: true }
].filter(v => (!only || v.kind === only) && (!quick || v.quick));

// ------------------------------------------------------------------ server
function contentType(file) {
  return { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" }[path.extname(file)] || "text/html; charset=utf-8";
}
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(root + path.sep) || name.includes("/.") || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader("Content-Type", contentType(file));
  fs.createReadStream(file).pipe(res);
});

// ------------------------------------------------------------ in-page checks
// Runs inside the page; returns [{ check, severity, target, detail }].
function auditPage(opts) {
  const out = [];
  const add = (check, severity, el, detail) => out.push({ check, severity, target: typeof el === "string" ? el : describe(el), detail });
  const INTERACTIVE = "button, a[href], select, input, summary, [role=option], [role=button]:not(path):not(circle):not(g)";

  function describe(el) {
    if (!el || !el.tagName) return "?";
    if (el.id && !/^(map-job-option|area-option|area-suggestion)-/.test(el.id)) return `#${el.id}`;
    const cls = [...el.classList].filter(c => !/^(active|hovered|selected|is-|pos$|neg$|neutral$|high$)/.test(c)).slice(0, 2).join(".");
    const parent = el.parentElement && el.parentElement.closest("[id]:not([id^=map-job-option]):not([id^=area-])");
    return `${parent ? "#" + parent.id + " " : ""}${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  }
  function visible(el) {
    if (el.closest("svg") || el.closest("[hidden]")) return false;
    const closed = el.closest("details:not([open])");        // Chromium sizes closed <details> content
    if (closed && !el.closest("summary")) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;          // 1px boxes are screen-reader-only text
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    }
    return true;
  }
  function clipRect(el) {
    let rect = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const r = e.getBoundingClientRect();
        rect = { left: Math.max(rect.left, r.left), top: Math.max(rect.top, r.top), right: Math.min(rect.right, r.right), bottom: Math.min(rect.bottom, r.bottom) };
      }
    }
    return rect;
  }
  function shownRect(el, r = el.getBoundingClientRect()) {
    if (!r) return null;
    const c = clipRect(el);
    const o = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    o.width = o.right - o.left; o.height = o.bottom - o.top;
    return o.width > 1 && o.height > 1 ? o : null;
  }
  function textRect(el) {
    const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length) return null;
    const range = document.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes[nodes.length - 1]);
    const r = range.getBoundingClientRect();
    return r.width ? r : null;
  }
  function lineCount(el) {
    const tops = new Set();
    for (const n of [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top));
    }
    return tops.size;
  }
  const inViewport = r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  function hitArea(el) {
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    const grow = side => after.content !== "none" && after.position === "absolute" ? Math.max(0, -parseFloat(after[side]) || 0) : 0;
    return { width: r.width + grow("left") + grow("right"), height: r.height + grow("top") + grow("bottom") };
  }
  const POPUPS = "details[open] .map-metric-menu, .combobox-dropdown, .custom-tooltip";
  const isPopup = e => !!(e && e.closest && e.closest(`${POPUPS}, .masthead`));

  // colour helpers for contrast
  function rgba(str) {
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  const blend = (top, bottom) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  function background(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none") return null;          // gradient or image: unknown
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let colour = [255, 255, 255, 1];
    for (const c of layers.reverse()) colour = blend(c, colour);
    return colour;
  }
  function luminance([r, g, b]) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const all = [...document.querySelectorAll("body *")].filter(visible);

  if (document.documentElement.scrollWidth > innerWidth + 1) {
    add("page-overflow", "error", "html", `page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px viewport`);
  }

  for (const el of all) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const shown = shownRect(el);
    if (!shown) continue;
    const t = textRect(el);
    const text = t ? [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ").replace(/\s+/g, " ").trim() : "";

    if ((shown.right > innerWidth + 1 || shown.left < -1) && cs.position !== "fixed") {
      add("offscreen", "error", el, `extends to x=${Math.round(shown.left)}..${Math.round(shown.right)} in a ${innerWidth}px viewport`);
    }

    if (t && (cs.display !== "inline" || el.tagName === "BUTTON")) {
      const over = Math.max(r.left - t.left, t.right - r.right);
      if (over > 1.5) {
        if (cs.overflowX === "visible") add("text-spill", "error", el, `text runs ${Math.round(over)}px past its box`);
        else if (cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1) add("text-clipped", "error", el, `text cut by ${Math.round(over)}px with no ellipsis`);
      }
      if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1 && !el.closest("[title], [aria-label]")) {
        add("truncated-no-full", "warn", el, `"${text.slice(0, 40)}" is cut with an ellipsis and has no title`);
      }
      const lines = lineCount(el);
      if (lines >= 4 && r.width < 160) add("heavy-wrap", "warn", el, `"${text.slice(0, 30)}" wraps to ${lines} lines in ${Math.round(r.width)}px`);
    }
    if (t) {
      if (/\b(NaN|undefined|null|Infinity)\b|\[object |\$-?NaN/.test(text)) add("bad-value", "error", el, `shows "${text.slice(0, 60)}"`);
      if (/\b([a-z]{2,})\s+\1\b/.test(text) || /\s[,.;:)]|\(\s|·\s*·|,\s*,/.test(text)) add("text-artifact", "warn", el, `"${text.slice(0, 60)}"`);
      const fg = rgba(cs.color), bg = background(el);
      if (fg && bg && !el.closest("[aria-hidden=true]") && !el.disabled) {
        const c = ratio(blend(fg, bg), bg);
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
        const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        if (c < need) add("contrast", c < 3 ? "error" : "warn", el, `${c.toFixed(2)}:1 (needs ${need}:1) for "${text.slice(0, 30)}"`);
      }
    }

    if (el.matches(INTERACTIVE) || t) {
      let e = el.parentElement;
      for (; e && e !== document.body; e = e.parentElement) {
        const ecs = getComputedStyle(e);
        if (ecs.overflowX !== "visible" || ecs.overflowY !== "visible") break;
      }
      const ecs = e && e !== document.body ? getComputedStyle(e) : null;
      if (ecs && !/(auto|scroll)/.test(ecs.overflowX + ecs.overflowY)) {
        const pr = e.getBoundingClientRect();
        const cut = Math.max(pr.left - r.left, r.right - pr.right, pr.top - r.top, r.bottom - pr.bottom);
        if (cut > 2) add("clipped", "error", el, `${Math.round(cut)}px cut off by ${describe(e)}`);
      }
    }

    if (el.tagName === "SELECT" && el.selectedOptions[0]) {
      const ctx = (window.__auditCanvas ||= document.createElement("canvas")).getContext("2d");
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const label = el.selectedOptions[0].textContent.trim();
      const need = ctx.measureText(label).width;
      const have = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (need > have + 1) add("select-truncated", "warn", el, `"${label}" needs ${Math.round(need)}px, has ${Math.round(have)}px`);
    }

    // off-centre: the single child or text of a centred button
    if (el.matches("button") && (cs.justifyContent === "center" || cs.textAlign === "center") && r.width < 200) {
      const kids = [...el.children].filter(k => { const kr = k.getBoundingClientRect(); return kr.width > 1 && getComputedStyle(k).display !== "none"; });
      const inner = t && !kids.length ? t : (!t && kids.length === 1 ? kids[0].getBoundingClientRect() : null);
      if (inner) {
        const dx = (inner.left + inner.right) / 2 - (r.left + r.right) / 2;
        const dy = (inner.top + inner.bottom) / 2 - (r.top + r.bottom) / 2;
        if (Math.abs(dx) > 2.5 || Math.abs(dy) > 2.5) add("off-centre", "warn", el, `content ${dx.toFixed(1)}px, ${dy.toFixed(1)}px from centre`);
      }
    }

    // empty-box: a visible frame with nothing inside
    if (!el.matches(`${INTERACTIVE}, hr, img, canvas, table *, [aria-hidden=true], [aria-hidden=true] *`) && !el.textContent.trim() &&
        !el.querySelector("svg, img, input, select, button, canvas") && r.width >= 24 && r.height >= 14 && cs.backgroundImage === "none" &&
        !el.closest(".map-legend-gradient-track, .split-divider, .split-divider-h")) {
      const framed = (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0) || (rgba(cs.backgroundColor) || [0, 0, 0, 0])[3] > 0;
      if (framed) add("empty-box", "warn", el, `${Math.round(r.width)}x${Math.round(r.height)}px box with no content`);
    }

    if (opts.kind === "phone" && el.matches(INTERACTIVE) && !el.closest("table") && !el.matches("[role=option]")) {
      const h = hitArea(el);
      if (h.width < 44 || h.height < 44) add("touch-target", "error", el, `hit area ${Math.round(h.width)}x${Math.round(h.height)}px`);
    }
    if (opts.kind === "phone" && t && parseFloat(cs.fontSize) < 11) add("small-text", "warn", el, `${cs.fontSize} text`);
  }

  // overlap / covered
  const leaves = all.filter(el => (el.matches(INTERACTIVE) || textRect(el)) && inViewport(el.getBoundingClientRect()) && !isPopup(el) && shownRect(el));
  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i], ra = shownRect(a);
    for (let j = i + 1; j < leaves.length; j++) {
      const b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = shownRect(b);
      if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) <= 3 || Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) <= 3) continue;
      const ta = a.matches(INTERACTIVE) ? ra : shownRect(a, textRect(a)), tb = b.matches(INTERACTIVE) ? rb : shownRect(b, textRect(b));
      if (!ta || !tb) continue;
      const w = Math.min(ta.right, tb.right) - Math.max(ta.left, tb.left), h = Math.min(ta.bottom, tb.bottom) - Math.max(ta.top, tb.top);
      if (w > 3 && h > 3) add("overlap", "error", a, `overlaps ${describe(b)} by ${Math.round(w)}x${Math.round(h)}px`);
    }
  }
  for (const el of leaves.filter(e => e.matches(INTERACTIVE))) {
    const r = shownRect(el);
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && !el.contains(hit) && !hit.contains(el) && !isPopup(hit)) add("covered", "error", el, `centre covered by ${describe(hit)}`);
  }

  // focus-obscured: the focused field sits under the sticky masthead
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest(".masthead") && visible(active)) {
    const ar = active.getBoundingClientRect(), mb = document.querySelector(".masthead").getBoundingClientRect().bottom;
    if (ar.top < mb - 2 && ar.bottom > 0) add("focus-obscured", "error", active, `focused, but ${Math.round(Math.min(ar.height, mb - ar.top))}px is under the sticky header`);
  }

  // inner-hscroll: content wider than its box, reachable only by scrolling
  // sideways inside it
  for (const el of all) {
    const ecs = getComputedStyle(el);
    if (/(auto|scroll)/.test(ecs.overflowX) && el.scrollWidth > el.clientWidth + 2) {
      add("inner-hscroll", el.querySelector("table") ? "error" : "warn", el, `content is ${el.scrollWidth}px wide in a ${el.clientWidth}px box; the rest needs a sideways scroll`);
    }
  }

  // popup-offscreen (a list running below the fold is fine if the page can scroll to it)
  for (const p of document.querySelectorAll(POPUPS)) {
    if (!visible(p)) continue;
    const r = p.getBoundingClientRect();
    const side = Math.max(-r.left, r.right - innerWidth, -r.top);
    const below = r.bottom - innerHeight;
    const canScroll = document.documentElement.scrollHeight - innerHeight - scrollY >= below;
    if (side > 1 || (below > 1 && !canScroll)) add("popup-offscreen", "error", p, `extends ${Math.round(Math.max(side, below))}px past the viewport`);
  }

  // row-misaligned: controls on one visual row of a toolbar
  const bars = [...document.querySelectorAll(".masthead-inner, .map-card-toolbar, .map-card-controls-bar, .browse-card-toolbar, #browseControlBar, #browseDrilldownBar, .map-zoom-overlay")].filter(visible);
  for (const bar of bars) {
    // Only controls drawn as boxes (border or fill); a plain text link has no
    // visible height to line up.
    const boxed = c => { const s = getComputedStyle(c); return parseFloat(s.borderTopWidth) > 0 || (rgba(s.backgroundColor) || [0, 0, 0, 0])[3] > 0; };
    const controls = [...bar.querySelectorAll("button, a[href], select, summary, .combobox-input-box, .segmented-control")]
      .filter(c => visible(c) && boxed(c) && !c.closest(".combobox-dropdown, .map-metric-menu, .sel-chip") && !c.parentElement.closest(".segmented-control, .combobox-input-box"))
      .map(c => ({ c, r: c.getBoundingClientRect() }));
    const rows = [];
    for (const item of controls) {
      const row = rows.find(rw => rw.some(o => o.r.top < item.r.bottom - 4 && o.r.bottom > item.r.top + 4));
      if (row) row.push(item); else rows.push([item]);
    }
    for (const row of rows.filter(rw => rw.length > 1)) {
      const hs = row.map(o => o.r.height), cs = row.map(o => (o.r.top + o.r.bottom) / 2);
      const hSpread = Math.max(...hs) - Math.min(...hs), cSpread = Math.max(...cs) - Math.min(...cs);
      if (hSpread > 4 || cSpread > 2) {
        const median = [...hs].sort((a, b) => a - b)[Math.floor(hs.length / 2)];
        const odd = row.reduce((a, b) => (Math.abs(b.r.height - median) > Math.abs(a.r.height - median) ? b : a));
        add("row-misaligned", "warn", odd.c, `row in ${describe(bar)}: heights ${hs.map(Math.round).join("/")}px, centres differ ${cSpread.toFixed(1)}px`);
      }
    }
  }

  // ragged-row (stacked phone layout) and band-gap
  const cards = [...document.querySelectorAll(".map-card, .browse-card, .area-summary")].filter(visible);
  for (const card of innerWidth < 600 ? cards : []) {
    const rects = [...card.querySelectorAll("select, summary, .combobox-input-box, .segmented-control")]
      .filter(c => visible(c) && !c.closest(".combobox-dropdown")).map(c => ({ c, r: c.getBoundingClientRect() }));
    if (rects.length < 2) continue;
    const maxRight = Math.max(...rects.map(x => x.r.right)), span = maxRight - Math.min(...rects.map(x => x.r.left));
    for (const { c, r } of rects) {
      const rowRight = Math.max(r.right, ...rects.filter(x => x.c !== c && x.r.top < r.bottom - 2 && x.r.bottom > r.top + 2).map(x => x.r.right));
      if (rowRight < maxRight - 40 && r.width < span * 0.7) add("ragged-row", "warn", c, `row ends ${Math.round(maxRight - rowRight)}px short in ${describe(card)}`);
    }
  }
  for (const card of cards) {
    const gapSet = parseFloat(getComputedStyle(card).rowGap) || 0;
    const kids = [...card.children].filter(visible).map(k => ({ k, r: k.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    for (let i = 1; i < kids.length; i++) {
      const gap = kids[i].r.top - kids[i - 1].r.bottom;
      if (gap - gapSet > 6 && kids[i].r.left < kids[i - 1].r.right) add("band-gap", "warn", kids[i].k, `${Math.round(gap)}px gap below ${describe(kids[i - 1].k)}`);
    }
  }

  // column-align
  for (const table of document.querySelectorAll("table")) {
    if (!visible(table)) continue;
    const ths = [...table.querySelectorAll("thead th")];
    const row = [...table.querySelectorAll("tbody tr")].find(tr => tr.children.length === ths.length && visible(tr));
    if (!row) continue;
    const align = e => getComputedStyle(e).textAlign.replace("start", "left").replace("end", "right");
    ths.forEach((th, i) => {
      if (visible(th) && align(th) !== align(row.children[i])) add("column-align", "warn", th, `header is ${align(th)}-aligned, column is ${align(row.children[i])}-aligned`);
    });
  }

  return out;
}

async function checkStickyHeaders(page) {
  return page.evaluate(async () => {
    const out = [];
    const boxes = [...document.querySelectorAll("*")].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20 && e.getBoundingClientRect().height > 0);
    for (const box of boxes) {
      const sticky = [...box.querySelectorAll("th, thead")].find(s => getComputedStyle(s).position === "sticky" && s.getBoundingClientRect().height > 0);
      if (!sticky) continue;
      const before = box.scrollTop;
      box.scrollTop = Math.min(box.scrollHeight - box.clientHeight, 120);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const top = box.getBoundingClientRect().top + box.clientTop + (parseFloat(getComputedStyle(sticky).top) || 0);
      const off = sticky.getBoundingClientRect().top - top;
      if (Math.abs(off) > 1) out.push({ check: "sticky-offset", severity: "error", target: box.id ? `#${box.id}` : box.className, detail: `sticky header ${Math.round(off)}px from the top of its scroll box` });
      box.scrollTop = before;
    }
    return out;
  });
}

// Keyboard focus: each stop must change visibly and not sit under the masthead.
async function checkFocus(page) {
  await page.evaluate(() => {
    const props = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "borderColor", "backgroundColor", "color", "stroke", "strokeWidth", "textDecorationLine"];
    window.__focusProps = props;
    window.__focusBase = new Map();
    // An element and its two nearest ancestors, so :focus-within styling on a
    // wrapper counts as a visible change.
    window.__focusSnap = el => [el, el.parentElement, el.parentElement && el.parentElement.parentElement]
      .filter(Boolean).map(e => { const cs = getComputedStyle(e); return props.map(p => cs[p]).join("|"); }).join("||");
    for (const el of document.querySelectorAll("a[href], button, input, select, summary, [tabindex]")) window.__focusBase.set(el, window.__focusSnap(el));
    if (document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const out = [], seen = new Set();
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    await sleep(40);
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const now = window.__focusSnap(el);
      const r = el.getBoundingClientRect(), mast = document.querySelector(".masthead").getBoundingClientRect();
      const region = el.closest("#areasLayer, #statesLayer, #bubblesLayer");
      const name = region ? `#${region.id} region` : el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.classList[0] ? "." + el.classList[0] : ""}`;
      return { name, changed: now !== window.__focusBase.get(el), obscured: !el.closest(".masthead") && r.top < mast.bottom - 2 && r.bottom > 0 };
    });
    if (!f || seen.has(f.name)) continue;
    seen.add(f.name);
    if (!f.changed) out.push({ check: "focus-invisible", severity: "error", target: f.name, detail: "keyboard focus shows no visible change" });
    if (f.obscured) out.push({ check: "focus-obscured", severity: "error", target: f.name, detail: "focused control is under the sticky header" });
  }
  await page.keyboard.press("Escape");
  return out;
}

// ----------------------------------------------------------------- states
async function ready(page) {
  await page.waitForFunction(() => typeof state !== "undefined" && state.mapData && state.areaData &&
    document.querySelectorAll("#areasLayer .area-boundary-shape").length > 500, { timeout: 30000 });
  await sleep(400);
}
async function typeInto(page, sel, text) {
  await page.evaluate(s => { const el = document.querySelector(s); el.value = ""; el.focus(); }, sel);
  await page.type(sel, text);
  await sleep(450);
}
async function pickMetric(page, metric) {
  await page.click("#mapMetricSelect");
  await page.click(`.map-metric-option[data-metric="${metric}"]`);
}
async function searchLabels(page, queries) {
  const found = [];
  for (const q of queries) {
    await typeInto(page, "#areaSearchInput", q);
    const labels = await page.$$eval("#areaDropdownSuggest .area-opt-name", els => els.map(e => e.textContent.trim()));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[.']/g, ""));
    for (const l of labels) {
      // Each word searched should start a word in the suggestion as shown.
      const shown = l.toLowerCase().replace(/[.']/g, "").split(/[\s,·-]+/);
      if (!words.every(w => shown.some(s => s.startsWith(w)))) {
        found.push({ check: "search-label", severity: "error", target: "#areaDropdownSuggest", detail: `"${q}" suggests "${l}"` });
      }
    }
  }
  return found;
}
const openOccupation = (page, soc) => page.evaluate(s => openOccupationAreaBreakdown(s, state.mapData.occupations.find(o => o.soc === s).title), soc);
const setViewport = (page, vp, width, height) => page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: vp.kind === "phone", hasTouch: vp.kind !== "desktop" });

const LONGEST_AREA = "0600007", LOW_AREA = "4800002", HIGH_AREA = "41940";
const LONGEST_OCC = "53-1047", HOURLY_OCC = "27-2011";

// Each state starts from a fresh load. desktopOnly / phoneOnly limit where it
// runs; a state may return extra findings of its own.
const STATES = [
  { name: "initial" },
  { name: "metric-menu-open", run: page => page.click("#mapMetricSelect") },
  { name: "metric-employment", run: page => pickMetric(page, "emp") },
  { name: "metric-density-bubbles", run: async page => { await page.click('#mapModeTabs [data-mode="bubble"]'); await pickMetric(page, "lq"); } },
  { name: "area-list-open", run: async page => { await page.click("#areaSearchInput"); await sleep(300); } },
  { name: "area-search-words", run: page => searchLabels(page, ["san lui", "new york", "salt lake", "fort worth", "st. lou", "coeur", "90210", "7870"]) },
  { name: "area-search-no-results", run: page => typeInto(page, "#areaSearchInput", "zzqqxx") },
  { name: "area-search-long-input", run: page => typeInto(page, "#areaSearchInput", "a very long query that keeps going well past the edge of the field and further") },
  { name: "occupation-list-open", run: page => typeInto(page, "#mapJobSearchInput", "manager") },
  { name: "area-longest-name", run: page => page.evaluate(id => loadArea(id, true), LONGEST_AREA) },
  { name: "area-low-wage", run: page => page.evaluate(id => loadArea(id, true), LOW_AREA) },
  { name: "area-high-wage", run: page => page.evaluate(id => loadArea(id, true), HIGH_AREA) },
  { name: "state-selected", run: page => page.evaluate(() => loadArea("06", true)) },
  { name: "occupation-longest-title", run: page => openOccupation(page, LONGEST_OCC) },
  { name: "occupation-hourly-only", run: page => openOccupation(page, HOURLY_OCC) },
  { name: "occupation-in-area-region-filter", run: async page => {
    await page.evaluate(id => loadArea(id, true), LONGEST_AREA);
    await sleep(600);
    await openOccupation(page, "29-1141");
    await sleep(600);
    await page.evaluate(() => {
      const s = document.getElementById("drilldownRegionFilter");
      if (s.options.length > 1) { s.selectedIndex = s.options.length - 1; s.dispatchEvent(new Event("change", { bubbles: true })); }
    });
  } },
  { name: "sector-expanded-sorted", run: async page => {
    await page.evaluate(() => document.querySelector("#tableBody tr")?.click());
    await sleep(400);
    for (const col of ["title", "emp", "lq", "wage"]) await page.evaluate(c => document.querySelector(`#occupationsTable th[data-col="${c}"]`)?.click(), col);
  } },
  { name: "filters-narrow", run: page => page.evaluate(() => {
    for (const [id, idx] of [["browseEduFilter", 7], ["browseGroupFilter", 3]]) {
      const s = document.getElementById(id);
      s.selectedIndex = Math.min(idx, s.options.length - 1);
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }) },
  { name: "zoomed-region", run: async page => {
    await page.evaluate(id => loadArea(id, true), HIGH_AREA);
    await sleep(500);
    for (let i = 0; i < 3; i++) { await page.click("#mapZoomIn"); await sleep(200); }
  } },
  { name: "rapid-toggles", run: async page => {
    for (let i = 0; i < 5; i++) await page.click("#themeToggleBtn");
    for (const m of ["mean", "p25", "p75", "emp", "lq", "median"]) await pickMetric(page, m);
    await page.click('#mapModeTabs [data-mode="bubble"]');
    await page.click('#mapModeTabs [data-mode="area"]');
    await sleep(300);
    const s = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll("#mapModeTabs [aria-pressed=true]")].map(b => b.dataset.mode).join(),
      metric: document.getElementById("mapMetricSelectedLabel").textContent.trim(),
      mode: state.mapMode, stateMetric: state.mapMetric
    }));
    return s.pressed === "area" && s.mode === "area" && /Median/.test(s.metric) ? [] :
      [{ check: "state-mismatch", severity: "error", target: "#mapCardContainer", detail: `after rapid toggles: ${JSON.stringify(s)}` }];
  } },
  { name: "popup-escape", run: async page => {
    const found = [];
    await page.click("#mapMetricSelect");
    await page.keyboard.press("Escape");
    await sleep(150);
    if (await page.$eval("#mapMetricPicker", d => d.open)) found.push({ check: "popup-escape", severity: "error", target: "#mapMetricPicker", detail: "Escape leaves the metric menu open" });
    for (const [input, list] of [["#areaSearchInput", "area"], ["#mapJobSearchInput", "occupation"]]) {
      await typeInto(page, input, "den");
      await page.keyboard.press("Escape");
      await sleep(150);
      if (await page.$eval(input, i => i.getAttribute("aria-expanded") === "true")) found.push({ check: "popup-escape", severity: "error", target: input, detail: `Escape leaves the ${list} list open` });
    }
    return found;
  } },
  { name: "resize-from-desktop", setup: { width: 1440, height: 900 }, run: async (page, vp) => {
    await page.evaluate(id => loadArea(id, true), LOW_AREA);
    await sleep(500);
    await setViewport(page, vp, vp.width, vp.height);
    await sleep(600);
  } },
  { name: "rotate-and-back", phoneOnly: true, run: async (page, vp) => {
    await page.evaluate(id => loadArea(id, true), LOW_AREA);
    await sleep(500);
    await setViewport(page, vp, vp.height, vp.width);
    await sleep(400);
    await setViewport(page, vp, vp.width, vp.height);
    await sleep(600);
  } },
  { name: "tooltip-edges", desktopOnly: true, run: async page => {
    const found = [];
    const targets = await page.evaluate(() => {
      const shapes = [...document.querySelectorAll("#areasLayer .area-boundary-shape")].map(p => p.getBoundingClientRect()).filter(r => r.width > 4 && r.height > 4);
      const pick = f => shapes.reduce((a, b) => (f(b) > f(a) ? b : a));
      return [pick(r => r.right), pick(r => r.bottom), pick(r => -r.left), pick(r => -r.top)].map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }));
    });
    const { width, height } = page.viewport();
    for (const t of targets) {
      await page.mouse.move(t.x, t.y);
      await sleep(200);
      const r = await page.evaluate(() => {
        const tip = document.getElementById("chartTooltip"), b = tip.getBoundingClientRect();
        return getComputedStyle(tip).display !== "none" && getComputedStyle(tip).opacity !== "0" && b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
      });
      if (r && (r.l < 0 || r.t < 0 || r.r > width || r.b > height)) found.push({ check: "popup-offscreen", severity: "error", target: "#chartTooltip", detail: `tooltip at ${Math.round(r.l)},${Math.round(r.t)}..${Math.round(r.r)},${Math.round(r.b)} in ${width}x${height}` });
    }
    return found;
  } },
  { name: "keyboard-focus", desktopOnly: true, run: page => checkFocus(page) }
];

// ------------------------------------------------------------------- run
async function runCase(browser, baseUrl, vp, st, record) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message.split("\n")[0]));
  page.on("console", m => { if (m.type() === "error" && !/favicon|beacon|cloudflareinsights/i.test(m.text())) errors.push(m.text()); });
  const size = st.setup || vp;
  await setViewport(page, vp, size.width, size.height);
  if (vp.kind !== "desktop") await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
  await page.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch {}
    window.__cls = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  });
  const where = `${vp.name} / ${st.name}`;
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
    if (vp.textScale) await page.addStyleTag({ content: `html { -webkit-text-size-adjust: ${vp.textScale * 100}% !important; text-size-adjust: ${vp.textScale * 100}% !important; font-size: ${vp.textScale * 100}%; }` });
    await ready(page);
    if (st.name === "initial") {
      const cls = await page.evaluate(() => window.__cls);
      if (cls > 0.1) await record(page, where, [{ check: "layout-shift", severity: "warn", target: "page load", detail: `cumulative layout shift ${cls.toFixed(3)}` }]);
    }
    if (vp.theme === "light") { await page.click("#themeToggleBtn"); await sleep(250); }
    const extra = st.run ? await st.run(page, vp) : null;
    await sleep(550);
    await record(page, where, Array.isArray(extra) ? extra : []);
    await record(page, where, await page.evaluate(auditPage, { kind: vp.kind }));
    for (const sel of ["#mapCardContainer", "#browseCardContainer"]) {
      await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);
      await sleep(120);
      await record(page, where, await checkStickyHeaders(page));
    }
  } catch (error) {
    await record(page, where, [{ check: "state-failed", severity: "error", target: st.name, detail: error.message.split("\n")[0] }]);
  }
  await record(page, where, errors.map(e => ({ check: "runtime-error", severity: "error", target: "page", detail: e.slice(0, 160) })));
  await context.close();
}

async function main() {
  const useLocal = !process.env.BLS_URL;
  if (useLocal) await new Promise(r => server.listen(0, "127.0.0.1", r));
  const baseUrl = process.env.BLS_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const findings = new Map();
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  const record = async (page, where, list) => {
    for (const f of list) {
      const key = `${f.check} ${f.target}`;
      if (!findings.has(key)) {
        findings.set(key, { ...f, key, where: [] });
        if (shotDir) await page.screenshot({ path: path.join(shotDir, `${f.check}-${f.target.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}.png`) }).catch(() => {});
      }
      const entry = findings.get(key);
      if (entry.where.includes(where)) continue;
      if (entry.where.length < 5) entry.where.push(where);
      else entry.more = (entry.more || 0) + 1;
    }
  };

  const jobs = [];
  for (const vp of VIEWPORTS) for (const st of STATES) {
    if (st.desktopOnly && vp.kind !== "desktop") continue;
    if (st.phoneOnly && vp.kind !== "phone") continue;
    jobs.push([vp, st]);
  }
  let next = 0, done = 0;
  const started = Date.now();
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const [vp, st] = jobs[next++];
        await runCase(browser, baseUrl, vp, st, record);
        if (++done % 25 === 0) console.log(`${done}/${jobs.length} cases`);
      }
    }));
  } finally {
    await browser.close();
    if (useLocal) server.close();
  }

  const order = { error: 0, warn: 1 };
  const list = [...findings.values()].sort((a, b) => order[a.severity] - order[b.severity] || a.check.localeCompare(b.check) || a.target.localeCompare(b.target));
  let failing = 0;
  console.log("");
  for (const f of list) {
    const allowed = Object.prototype.hasOwnProperty.call(allow, f.key);
    if (!allowed && (f.severity === "error" || strict)) failing++;
    console.log(`${allowed ? "ALLOW" : f.severity.toUpperCase().padEnd(5)} ${f.check}  ${f.target}  ${f.detail}`);
    console.log(`      at ${f.where.join("; ")}${f.more ? `; +${f.more} more` : ""}${allowed ? `\n      allowed: ${allow[f.key]}` : ""}`);
  }
  for (const k of Object.keys(allow).filter(k => !findings.has(k))) console.log(`STALE allow entry no longer found: ${k}`);
  console.log(`\n${list.length} finding(s), ${failing} failing — ${jobs.length} cases (${VIEWPORTS.length} viewports) in ${Math.round((Date.now() - started) / 1000)}s`);
  if (process.env.LAYOUT_JSON) fs.writeFileSync(process.env.LAYOUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, findings: list }, null, 2));
  process.exitCode = failing ? 1 : 0;
}

main().catch(error => { console.error(error); if (server.listening) server.close(); process.exitCode = 1; });

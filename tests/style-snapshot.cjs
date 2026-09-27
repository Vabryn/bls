/*
 * Computed-style snapshot for CSS refactors.
 *
 *   node tests/style-snapshot.cjs save before.json
 *   (edit CSS)
 *   node tests/style-snapshot.cjs compare before.json
 *
 * Records getComputedStyle for every element and its ::before/::after in a
 * set of app states (phone and desktop, both themes, national view, an area,
 * and a mapped occupation). `compare` exits non-zero and lists the element
 * paths and properties that changed. Use it to confirm that removing or
 * reorganising rules does not change what renders.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("puppeteer");

const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(root + path.sep) || name.includes("/.") || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css"
    : file.endsWith(".json") ? "application/json" : file.endsWith(".svg") ? "image/svg+xml" : "text/html";
  res.setHeader("Content-Type", type);
  fs.createReadStream(file).pipe(res);
});

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
];
const THEMES = ["dark", "light"];
const STATES = {
  national: async () => {},
  area: async p => { await p.evaluate(() => loadArea("06")); },
  occupation: async p => {
    await p.evaluate(async () => {
      const occ = state.mapData.occupations.find(o => o.soc !== "00-0000");
      await loadMapJob(occ.soc);
    });
  },
};

async function capture(page) {
  return page.evaluate(() => {
    // Finish transitions and hold animations at their start so values are stable between runs.
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) a.finish();
      else { a.pause(); a.currentTime = 0; }
    }
    const styles = [];
    const ids = new Map();
    const intern = s => {
      if (!ids.has(s)) { ids.set(s, styles.length); styles.push(s); }
      return ids.get(s);
    };
    const serialize = cs => {
      const out = [];
      for (let i = 0; i < cs.length; i++) out.push(cs[i] + ":" + cs.getPropertyValue(cs[i]));
      return out.sort().join(";");
    };
    const elements = {};
    const walk = (el, p) => {
      elements[p] = intern(serialize(getComputedStyle(el)));
      for (const pseudo of ["::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content && cs.content !== "none" && cs.content !== "normal") elements[p + pseudo] = intern(serialize(cs));
      }
      const counts = {};
      for (const child of el.children) {
        const tag = child.tagName.toLowerCase();
        counts[tag] = (counts[tag] || 0) + 1;
        walk(child, `${p}>${tag}${child.id ? "#" + child.id : ""}[${counts[tag]}]`);
      }
    };
    walk(document.documentElement, "html");
    return { styles, elements };
  });
}

async function snapshot(browser, url) {
  const out = {};
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const [stateName, apply] of Object.entries(STATES)) {
        const page = await browser.newPage();
        await page.setViewport(vp);
        await page.evaluateOnNewDocument(t => { try { localStorage.setItem("bls-theme", t); } catch {} }, theme);
        await page.goto(url);
        await page.waitForFunction(() => typeof state !== "undefined" && state.mapData && state.areaData, { timeout: 20000 });
        await page.evaluate(t => {
          if (document.documentElement.getAttribute("data-theme") !== t) document.getElementById("themeToggleBtn").click();
        }, theme);
        await apply(page);
        await new Promise(r => setTimeout(r, 800));
        out[`${vp.name}/${theme}/${stateName}`] = await capture(page);
        await page.close();
      }
    }
  }
  return out;
}

function compare(before, after) {
  let changed = 0;
  for (const key of Object.keys(before)) {
    const a = before[key], b = after[key];
    if (!b) { console.log(`MISSING state ${key}`); changed++; continue; }
    const paths = new Set([...Object.keys(a.elements), ...Object.keys(b.elements)]);
    for (const p of paths) {
      const sa = a.styles[a.elements[p]], sb = b.styles[b.elements[p]];
      if (sa === sb) continue;
      changed++;
      if (changed > 40) continue;
      if (sa === undefined || sb === undefined) { console.log(`${key} ${p}: ${sa === undefined ? "added" : "removed"}`); continue; }
      const pa = Object.fromEntries(sa.split(";").map(x => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]));
      const pb = Object.fromEntries(sb.split(";").map(x => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]));
      const diffs = Object.keys({ ...pa, ...pb }).filter(k => pa[k] !== pb[k]).map(k => `${k}: ${pa[k]} -> ${pb[k]}`);
      console.log(`${key} ${p}\n    ${diffs.join("\n    ")}`);
    }
  }
  return changed;
}

(async () => {
  const [mode, file] = process.argv.slice(2);
  if (!["save", "compare"].includes(mode) || !file) {
    console.error("usage: node tests/style-snapshot.cjs save|compare <file.json>");
    process.exit(2);
  }
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const snap = await snapshot(browser, `http://127.0.0.1:${server.address().port}/`);
    const count = Object.values(snap).reduce((n, s) => n + Object.keys(s.elements).length, 0);
    if (mode === "save") {
      fs.writeFileSync(file, JSON.stringify(snap));
      console.log(`Saved ${Object.keys(snap).length} states / ${count} elements to ${file}`);
    } else {
      const changed = compare(JSON.parse(fs.readFileSync(file, "utf8")), snap);
      console.log(changed ? `FAIL ${changed} element styles differ` : `PASS ${count} element styles identical across ${Object.keys(snap).length} states`);
      process.exitCode = changed ? 1 : 0;
    }
  } finally {
    await browser.close();
    server.close();
  }
})();

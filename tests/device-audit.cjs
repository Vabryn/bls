/*
 * Reusable end-to-end audit for the BLS Wage Explorer.
 *
 * Runs the same interaction checks in a desktop Chromium context and in
 * touch-enabled iPhone contexts. Set AUDIT_SCREENSHOTS=/tmp/bls-audit to
 * retain a full-page screenshot for each device (and any failed case).
 * Set BLS_URL to audit a deployed site instead of the local files.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("puppeteer");

const root = path.resolve(__dirname, "..");
const screenshots = process.env.AUDIT_SCREENSHOTS;
const cases = [];
const test = (name, device, fn) => cases.push({ name, device, fn });

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/html; charset=utf-8";
}

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(root + path.sep) || name.includes("/.") ||
      !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const headersFile = path.join(root, "_headers");
  if (fs.existsSync(headersFile)) {
    for (const line of fs.readFileSync(headersFile, "utf8").split("\n")) {
      const i = line.indexOf(":");
      if (line.startsWith("  ") && i > 0) res.setHeader(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
  }
  res.setHeader("Content-Type", contentType(file));
  fs.createReadStream(file).pipe(res);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ready(page) {
  await page.waitForFunction(() => state.mapData && state.areaData &&
    document.querySelectorAll("#areasLayer .area-boundary-shape").length > 500, { timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("dataNotice")?.textContent.trim());
}

async function visibleOptions(page, selector) {
  return page.$$eval(selector, els => els.filter(el => getComputedStyle(el).display !== "none" && el.getAttribute("aria-hidden") !== "true").length);
}

async function selectValue(page, selector, value) {
  await page.select(selector, String(value));
  await page.evaluate(sel => document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true })), selector);
  await sleep(100);
}

async function clearArea(page) {
  await page.click("#areaSelChipClear");
  await page.waitForFunction(() => state.currentAreaId === "99");
}

async function clearOccupation(page) {
  await page.click("#jobSelChipClear");
  await page.waitForFunction(() => state.activeMapSoc === "00-0000" && !state.drilldownSoc);
}

async function typeOccupation(page) {
  const occ = await page.evaluate(() => state.mapData.occupations.find(o => /registered nurses/i.test(o.title)) ||
    state.mapData.occupations.find(o => o.soc !== "00-0000"));
  assert.ok(occ && occ.soc && occ.title, "occupation fixture is available");
  const input = "#mapJobSearchInput";
  await page.click(input);
  await page.type(input, occ.title);
  await page.waitForSelector(`#mapJobDropdown [data-soc="${occ.soc}"]`, { timeout: 10000 });
  return occ;
}

async function checkNoOverflow(page) {
  return page.evaluate(() => {
    const offenders = [...document.querySelectorAll("body *")].filter(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // SVG map geometry is intentionally allowed to extend outside the
      // viewport; the SVG viewport clips it. Only report real HTML overflow.
      if (el.closest("svg")) return false;
      return style.position !== "absolute" && style.position !== "fixed" &&
        (r.right > innerWidth + 2 || r.left < -2);
    }).slice(0, 8).map(el => ({ tag: el.tagName, id: el.id, cls: el.className, right: Math.round(el.getBoundingClientRect().right) }));
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth, offenders };
  });
}

// Hit area size, including an absolutely positioned ::after that extends a
// small visual button's touch area (see .theme-toggle).
function touchSize(page, selectors) {
  return page.evaluate(sels => sels.map(sel => [sel, [...document.querySelectorAll(sel)].map(el => {
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    const grow = after.content !== "none" && after.position === "absolute"
      ? side => Math.max(0, -parseFloat(after[side]) || 0) : () => 0;
    return { width: Math.round(r.width + grow("left") + grow("right")),
      height: Math.round(r.height + grow("top") + grow("bottom")) };
  })]), selectors);
}

// ---------------------------- desktop workflow ---------------------------
test("Desktop boot, data, semantics, and duplicate-id audit", "desktop", async page => {
  await ready(page);
  const inventory = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map(e => e.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    const badButtons = [...document.querySelectorAll("button")].filter(b =>
      !(b.getAttribute("aria-label") || b.title || b.textContent.trim())).map(b => b.outerHTML.slice(0, 100));
    return {
      areaCount: document.querySelectorAll("#areasLayer .area-boundary-shape").length,
      stateCount: document.querySelectorAll("#statesLayer .state-boundary").length,
      sectorRows: document.querySelectorAll("#tableBody tr").length,
      summaryValues: ["#kpiTotalEmp", "#kpiMedianWage", "#kpiMeanWage"].map(sel => document.querySelector(sel)?.textContent.trim()),
      duplicateIds: [...new Set(duplicates)],
      badButtons,
      notice: document.getElementById("dataNotice")?.textContent.trim()
    };
  });
  assert.equal(inventory.areaCount, 520);
  assert.ok(inventory.stateCount >= 50);
  assert.ok(inventory.sectorRows >= 15);
  assert.ok(inventory.summaryValues.every(value => value && value !== "—"));
  assert.deepEqual(inventory.duplicateIds, []);
  assert.deepEqual(inventory.badButtons, []);
  assert.equal(inventory.notice, "");
  assert.equal((await checkNoOverflow(page)).offenders.length, 0);
});

test("Desktop theme, metric, map mode, zoom, wheel, and reset controls", "desktop", async page => {
  await ready(page);
  assert.equal(await page.$eval("#themeToggleBtn", el => el.getAttribute("aria-pressed")), "true");
  assert.equal(await page.$eval("#mapMetricSelect", el => el.textContent.trim()), "Typical pay (Median)");
  assert.equal(await page.$$eval("#mapModeTabs .segmented-btn[aria-pressed=\"true\"]", els => els.length), 1);
  const rootTheme = () => page.$eval("html", el => el.getAttribute("data-theme") || "dark");
  const initial = await rootTheme();
  await page.click("#themeToggleBtn");
  await page.waitForFunction(t => (document.documentElement.getAttribute("data-theme") || "dark") !== t, {}, initial);
  assert.match(await page.$eval("#themeLabel", el => el.textContent), /Mode/);
  assert.equal(await page.$eval("#themeToggleBtn", el => el.getAttribute("aria-pressed")), "false");
  await page.click("#themeToggleBtn");
  await page.waitForFunction(t => (document.documentElement.getAttribute("data-theme") || "dark") === t, {}, initial);

  for (const metric of ["mean", "p25", "p75", "emp", "lq", "median"]) {
    await page.click("#mapMetricSelect");
    await page.click(`#mapMetricMenu [data-metric="${metric}"]`);
    assert.equal(await page.evaluate(() => state.activeMapMetric), metric);
    assert.equal(await page.$eval("#mapMetricSelect", el => el.textContent.trim()), await page.$eval(`#mapMetricMenu [data-metric="${metric}"]`, el => el.textContent.trim()));
  }
  await page.click('#mapModeTabs [data-mode="bubble"]');
  assert.equal(await page.evaluate(() => state.mapMode), "bubble");
  assert.equal(await page.$eval("#areasLayer", el => getComputedStyle(el).display), "none");
  assert.notEqual(await page.$eval("#bubblesLayer", el => getComputedStyle(el).display), "none");
  await page.click('#mapModeTabs [data-mode="area"]');
  assert.equal(await page.evaluate(() => state.mapMode), "area");

  await page.click("#mapZoomIn");
  assert.ok(await page.evaluate(() => state.mapZoom.scale > 1));
  await page.click("#mapZoomOut");
  assert.ok(await page.evaluate(() => state.mapZoom.scale >= 1));
  await page.evaluate(() => {
    const el = document.getElementById("mapSvgContainer");
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      bubbles: true, cancelable: true
    }));
  });
  await sleep(100);
  await page.waitForFunction(() => state.mapZoom.scale > 1);
  await page.click("#mapResetBtn");
  await page.waitForFunction(() => state.mapZoom.scale === 1 && state.mapZoom.x === 0 && state.mapZoom.y === 0);
});

test("Desktop area search: state, ZIP, place, map polygon, tooltip, and clear", "desktop", async page => {
  await ready(page);
  const areaInput = "#areaSearchInput";
  await page.click(areaInput);
  await page.type(areaInput, "California");
  await page.waitForSelector('#areaDropdown [data-id="06"]');
  assert.ok(await visibleOptions(page, '#areaDropdown [data-id="06"]'));
  await page.click('#areaDropdown [data-id="06"]');
  await page.waitForFunction(() => state.currentAreaId === "06");
  assert.match(await page.$eval("#hudMetroTitle", el => el.textContent), /California/i);
  await clearArea(page);

  await page.waitForFunction(() => state.zipToArea && state.placeIndex);
  await page.click(areaInput);
  await page.type(areaInput, "10001");
  await page.waitForSelector('#areaDropdownSuggest [data-id="35620"]');
  await page.click('#areaDropdownSuggest [data-id="35620"]');
  await page.waitForFunction(() => state.currentAreaId === "35620");
  await clearArea(page);

  await page.click(areaInput);
  await page.type(areaInput, "New York");
  await page.waitForSelector('#areaDropdownSuggest [data-id="35620"]');
  await page.click('#areaDropdownSuggest [data-id="35620"]');
  await page.waitForFunction(() => state.currentAreaId === "35620");
  await clearArea(page);

  const area = await page.$("#areasLayer .area-boundary-shape");
  await area.hover();
  await page.waitForFunction(() => getComputedStyle(document.getElementById("chartTooltip")).display === "block");
  const tip = await page.$eval("#chartTooltip", el => ({ text: el.textContent.trim(), rect: el.getBoundingClientRect().toJSON() }));
  assert.ok(tip.text.length > 20);
  assert.ok(tip.rect.left >= 0 && tip.rect.right <= 1441);
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.querySelector("#areasLayer .area-boundary-shape").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForFunction(() => state.currentAreaId !== "99");
  await clearArea(page);
});

test("Desktop map keyboard state selection and drag pan", "desktop", async page => {
  await ready(page);
  const statePath = "#statesLayer .state-boundary";
  await page.$eval(statePath, el => el.focus());
  const before = await page.evaluate(() => state.mapZoom.scale);
  await page.keyboard.press("Enter");
  await page.waitForFunction(s => state.mapZoom.scale > s, {}, before);
  assert.ok(await page.evaluate(() => state.focusedState));
  await page.keyboard.press(" ");
  await page.waitForFunction(() => state.mapZoom.scale === 1);

  await page.click("#mapZoomIn");
  const box = await page.$eval("#mapSvgContainer", el => { const r = el.getBoundingClientRect(); return { x: r.left + 160, y: r.top + 180 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 4, { steps: 5 });
  await page.mouse.up();
  await sleep(120);
  const pan = await page.evaluate(() => ({ x: state.mapZoom.x, y: state.mapZoom.y }));
  assert.ok(Math.abs(pan.x) > 0 || Math.abs(pan.y) > 0, "horizontal map drag changes the view");
  await page.click("#mapResetBtn");
});

test("Desktop browse filters, sorting, occupation drilldown, region filter, and back", "desktop", async page => {
  await ready(page);
  assert.equal(await page.$eval("#occupationsTable th[data-col=title]", el => el.textContent.trim()), "Sector");
  const firstSector = "#occupationsTable tbody tr.clickable-row";
  await page.waitForSelector(firstSector);
  await page.click(firstSector);
  await page.waitForFunction(() => Number(document.getElementById("browseGroupFilter").value) >= 0);
  assert.equal(await page.$eval("#occupationsTable th[data-col=title]", el => el.textContent.trim()), "Occupation Title");
  assert.ok(await page.$$eval("#tableBody tr", rows => rows.length > 1));

  await selectValue(page, "#browseEduFilter", "4");
  assert.equal(await page.$eval("#browseEduFilter", el => el.value), "4");
  await selectValue(page, "#browseWageMetric", "p75");
  assert.equal(await page.$eval("#occWageColHeader", el => el.textContent), "Upper Range (P75)");
  await page.click('#occupationsTable th[data-col="title"]');
  assert.ok(await page.$eval('#occupationsTable th[data-col="title"]', el => el.classList.contains("sorted-asc")));

  // A merged occupation search must work both as a dropdown and as a table filter.
  await selectValue(page, "#browseEduFilter", "-1");
  await selectValue(page, "#browseGroupFilter", "-1");
  const occ = await typeOccupation(page);
  assert.ok(await visibleOptions(page, `#mapJobDropdown [data-soc="${occ.soc}"]`));
  await page.click(`#mapJobDropdown [data-soc="${occ.soc}"]`);
  await page.waitForFunction(soc => state.drilldownSoc === soc && state.activeMapSoc === soc &&
    getComputedStyle(document.getElementById("browseDrilldownBar")).display !== "none" &&
    document.querySelectorAll("#occupationAreasTableBody tr").length > 0, {}, occ.soc);
  assert.notEqual(await page.$eval("#browseDrilldownBar", el => getComputedStyle(el).display), "none");
  assert.equal(await page.$eval("#occupationsTable", el => getComputedStyle(el).display), "none");
  assert.ok(await page.$$eval("#occupationAreasTableBody tr", rows => rows.length > 0));

  const regionCount = await page.$$eval("#drilldownRegionFilter option", options => options.length);
  if (regionCount > 1) {
    const region = await page.$eval("#drilldownRegionFilter option:nth-child(2)", el => el.value);
    await selectValue(page, "#drilldownRegionFilter", region);
    assert.equal(await page.$eval("#drilldownRegionFilter", el => el.value), region);
    assert.ok(await page.$$eval("#occupationAreasTableBody tr", rows => rows.length >= 0));
  }
  await selectValue(page, "#drilldownWageMetric", "mean");
  assert.equal(await page.$eval("#areaWageColHeader", el => el.textContent), "Average Wage (Mean)");
  await page.click('#occupationAreasTable th[data-col="name"]');
  assert.ok(await page.$eval('#occupationAreasTable th[data-col="name"]', el => el.classList.contains("sorted-asc")));
  const areaRows = await page.$$("#occupationAreasTableBody tr");
  if (areaRows.length) {
    await areaRows[0].click();
    await sleep(100);
    assert.ok(await page.evaluate(() => state.currentAreaId));
  }
  await page.click("#browseDrilldownBackBtn");
  await page.waitForFunction(() => !state.drilldownSoc && getComputedStyle(document.getElementById("occupationsTable")).display !== "none");
  await clearOccupation(page);
});

test("Desktop deep links preserve year, area, and occupation scope", "desktop", async page => {
  await page.goto(`${page._auditUrl}?year=2024&area=06`);
  await ready(page);
  assert.equal(await page.evaluate(() => state.year), "2024");
  assert.equal(await page.evaluate(() => state.currentAreaId), "06");
  assert.match(await page.$eval("#sourceLabel", el => el.textContent), /2024/);
  const occ = await page.evaluate(() => state.mapData.occupations.find(o => o.soc !== "00-0000"));
  await page.goto(`${page._auditUrl}?year=2024&area=06&occ=${encodeURIComponent(occ.soc)}`);
  await ready(page);
  await page.waitForFunction(soc => state.drilldownSoc === soc &&
    getComputedStyle(document.getElementById("browseDrilldownBar")).display !== "none" &&
    document.querySelectorAll("#occupationAreasTableBody tr").length > 0, {}, occ.soc);
  assert.equal(await page.evaluate(() => state.year), "2024");
  assert.equal(await page.evaluate(() => state.currentAreaId), "06");
  assert.equal(await page.evaluate(() => state.activeMapSoc), occ.soc);
});

test("Desktop hourly-wage disclosure survives occupation selection", "desktop", async page => {
  await ready(page);
  const actor = await page.evaluate(() => state.mapData.occupations.find(o => o.soc === "27-2011") || state.mapData.occupations.find(o => /actors/i.test(o.title)));
  assert.ok(actor, "hourly occupation fixture is available");
  await page.click("#mapJobSearchInput");
  await page.type("#mapJobSearchInput", actor.title);
  await page.waitForSelector(`#mapJobDropdown [data-soc="${actor.soc}"]`);
  await page.click(`#mapJobDropdown [data-soc="${actor.soc}"]`);
  await page.waitForFunction(soc => state.activeMapSoc === soc &&
    !document.getElementById("kpiDisclosure")?.hidden, {}, actor.soc);
  const disclosure = await page.$eval("#kpiDisclosure", el => el.textContent);
  assert.match(disclosure, /hourly wage schedule/i);
  assert.match(disclosure, /2,080/);
  await clearOccupation(page);
});

// ----------------------------- iPhone workflow ---------------------------
test("iPhone touch boot, targets, order, and no overflow", "iphone", async page => {
  await ready(page);
  const layout = await page.evaluate(() => {
    const split = document.getElementById("mapCenterSplit");
    return {
      order: [...split.children].map(el => el.id),
      summaryPosition: getComputedStyle(document.getElementById("kpiBar")).position,
      coarse: matchMedia("(pointer: coarse)").matches,
      hover: matchMedia("(hover: hover)").matches
    };
  });
  const map = layout.order.indexOf("mapCardContainer");
  const summary = layout.order.indexOf("kpiBar");
  const browse = layout.order.indexOf("browseCardContainer");
  assert.ok(layout.coarse);
  assert.ok(map >= 0 && summary > map && browse > summary);
  assert.equal(layout.summaryPosition, "static");
  const overflow = await checkNoOverflow(page);
  assert.equal(overflow.offenders.length, 0, JSON.stringify(overflow));
  const sizes = await touchSize(page, ["#themeToggleBtn", ".portfolio-back", "#mapZoomIn", "#mapZoomOut", "#mapResetBtn", "#mapModeTabs .segmented-btn", "#mapMetricSelect", ".combobox-input-box", "#browseControlBar .control-select"]);
  for (const [, boxes] of sizes) for (const box of boxes) assert.ok(box.width >= 44 && box.height >= 44, `small touch target: ${JSON.stringify(sizes)}`);
});

test("iPhone touch theme, metric/mode controls, search, and reset", "iphone", async page => {
  await ready(page);
  await page.tap("#themeToggleBtn");
  assert.match(await page.$eval("#themeLabel", el => el.textContent), /Mode/);
  await page.tap("#mapMetricSelect");
  await page.tap('#mapMetricMenu [data-metric="emp"]');
  assert.equal(await page.evaluate(() => state.activeMapMetric), "emp");
  await page.tap('#mapModeTabs [data-mode="bubble"]');
  assert.equal(await page.evaluate(() => state.mapMode), "bubble");
  await page.tap('#mapModeTabs [data-mode="area"]');
  await page.tap("#mapZoomIn");
  assert.ok(await page.evaluate(() => state.mapZoom.scale > 1));
  await page.tap("#mapResetBtn");
  await page.waitForFunction(() => state.mapZoom.scale === 1);
  await page.tap("#areaSearchInput");
  await page.type("#areaSearchInput", "California");
  await page.waitForSelector('#areaDropdown [data-id="06"]');
  await page.tap('#areaDropdown [data-id="06"]');
  await page.waitForFunction(() => state.currentAreaId === "06");
  await page.tap("#areaSelChipClear");
  await page.waitForFunction(() => state.currentAreaId === "99");
  assert.equal((await checkNoOverflow(page)).offenders.length, 0);
});

test("iPhone occupation flow remains usable with touch scrolling", "iphone", async page => {
  await ready(page);
  const occ = await typeOccupation(page);
  await page.tap(`#mapJobDropdown [data-soc="${occ.soc}"]`);
  await page.waitForFunction(soc => state.drilldownSoc === soc &&
    getComputedStyle(document.getElementById("browseDrilldownBar")).display !== "none" &&
    document.querySelectorAll("#occupationAreasTableBody tr").length > 0, {}, occ.soc);
  const firstTable = await page.$("#occupationAreasTableBody tr");
  assert.ok(firstTable);
  await page.tap("#browseDrilldownBackBtn");
  await page.waitForFunction(() => !state.drilldownSoc);
  await page.tap("#jobSelChipClear");
  await page.waitForFunction(() => state.activeMapSoc === "00-0000");
  // The table is intentionally internally scrollable; the document itself is
  // still allowed to scroll on a touch viewport.
  const scroll = await page.evaluate(() => {
    const table = document.getElementById("browseTableResponsive");
    return { body: document.body.scrollHeight, viewport: innerHeight, tableMax: getComputedStyle(table).maxHeight, tableScroll: table.scrollHeight > table.clientHeight };
  });
  assert.ok(scroll.body >= scroll.viewport);
  assert.ok(scroll.tableScroll, `browse table should scroll internally: ${JSON.stringify(scroll)}`);
  assert.equal((await checkNoOverflow(page)).offenders.length, 0);
});

// Synthetic touch gestures through CDP, so the browser applies touch-action
// and page scrolling the way it does for a real finger.
async function touchGesture(page, frames) {
  const cdp = await page.target().createCDPSession();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: frames[0] });
  for (const points of frames.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points });
    await sleep(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await sleep(250);
}

function pinchFrames(cx, cy, fromGap, toGap, steps = 10) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const gap = fromGap + (toGap - fromGap) * i / steps;
    return [{ x: cx - gap / 2, y: cy }, { x: cx + gap / 2, y: cy }];
  });
}

function dragFrames(x, y, dx, dy, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => [{ x: x + dx * i / steps, y: y + dy * i / steps }]);
}

const mapZoom = page => page.evaluate(() => ({ ...state.mapZoom, scrollY: Math.round(scrollY),
  zoomed: document.getElementById("mapSvgContainer").classList.contains("is-zoomed"),
  touchAction: getComputedStyle(document.getElementById("mapSvgContainer")).touchAction }));

test("iPhone map pinch-zooms, pans freely when zoomed, and stays centred at 1x", "iphone", async page => {
  await ready(page);
  const box = await page.$eval("#usMetroSvg", el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  await touchGesture(page, dragFrames(box.x + 90, box.y, -160, 3));
  let z = await mapZoom(page);
  assert.deepEqual([z.scale, z.x, z.y], [1, 0, 0], "a sideways swipe at 1x leaves the map centred");
  assert.equal(z.touchAction, "pan-y");

  await touchGesture(page, pinchFrames(box.x, box.y, 40, 200));
  z = await mapZoom(page);
  assert.ok(z.scale > 2, `pinch out zooms the map: ${JSON.stringify(z)}`);
  assert.ok(z.zoomed && z.touchAction === "none", `zoomed map takes one-finger pans: ${JSON.stringify(z)}`);

  const before = z;
  await touchGesture(page, dragFrames(box.x, box.y + 40, 0, -100));
  z = await mapZoom(page);
  assert.ok(z.y < before.y - 50, `vertical drag pans the zoomed map: ${JSON.stringify([before, z])}`);
  assert.equal(z.scrollY, before.scrollY, "the page does not scroll while panning the zoomed map");

  await touchGesture(page, pinchFrames(box.x, box.y, 240, 20, 14));
  z = await mapZoom(page);
  assert.deepEqual([z.scale, z.x, z.y, z.zoomed], [1, 0, 0, false], "pinching back in returns to the centred 1x map");
});

test("iPhone zoom controls sit below the map and legend badges stay inside the card", "iphone", async page => {
  await ready(page);
  const layout = await page.evaluate(() => {
    const rect = id => document.getElementById(id).getBoundingClientRect();
    const svg = rect("usMetroSvg"), zoom = rect("mapZoomButtonsGroup"), box = rect("mapSvgContainer");
    return { overlap: zoom.top < svg.bottom && zoom.bottom > svg.top && zoom.left < svg.right && zoom.right > svg.left,
      slack: Math.round(box.height - svg.height - zoom.height) };
  });
  assert.equal(layout.overlap, false, "zoom buttons do not cover the map");
  assert.ok(layout.slack <= 20, `no empty band under the map: ${JSON.stringify(layout)}`);

  // A low-wage area puts the area badge near the left edge; the long U.S.
  // label for an occupation stresses the other badge.
  for (const areaId of ["4800002", "19740"]) {
    await page.evaluate(id => loadArea(id, true), areaId);
    await page.waitForFunction(id => state.currentAreaId === id &&
      getComputedStyle(document.getElementById("mapLegendAreaPuck")).display !== "none", {}, areaId);
    await sleep(450);
    const clipped = await page.evaluate(() => {
      const bound = document.querySelector(".map-legend-container").getBoundingClientRect();
      return ["legendAreaPuckBadge", "legendUsPuckBadge"].map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, left: Math.round(r.left - bound.left), right: Math.round(bound.right - r.right) };
      }).filter(b => b.left < 0 || b.right < 0);
    });
    assert.deepEqual(clipped, [], `legend badges stay inside the legend for area ${areaId}`);
  }
});

test("iPhone No data key appears only when areas lack a value", "iphone", async page => {
  await ready(page);
  const key = () => page.evaluate(() => ({ hidden: document.getElementById("mapLegendNoData").hidden,
    missing: state.mapLegendScale.missingCount, mode: state.mapMode }));
  let k = await key();
  assert.equal(k.hidden, !(k.missing > 0), `key matches missing areas: ${JSON.stringify(k)}`);

  await page.tap("#mapJobSearchInput");
  await page.type("#mapJobSearchInput", "Chief Executives");
  await page.waitForSelector('#mapJobDropdown [data-soc="11-1011"]', { timeout: 10000 });
  await page.tap('#mapJobDropdown [data-soc="11-1011"]');
  await page.waitForFunction(() => state.activeMapSoc === "11-1011" && state.mapLegendScale);
  await sleep(300);
  k = await key();
  assert.ok(k.missing > 0 && !k.hidden, `occupation with suppressed areas shows the key: ${JSON.stringify(k)}`);

  await page.tap('#mapModeTabs [data-mode="bubble"]');
  await page.waitForFunction(() => state.mapMode === "bubble");
  assert.equal((await key()).hidden, true, "bubble mode draws no no-data areas, so no key");
});

async function main() {
  const useLocal = !process.env.BLS_URL;
  if (useLocal) await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = process.env.BLS_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  let failures = 0;
  const results = [];
  try {
    for (const item of cases) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      page._auditUrl = baseUrl;
      const runtimeErrors = [];
      page.on("pageerror", error => runtimeErrors.push(`pageerror: ${error.message}`));
      page.on("console", msg => { if (msg.type() === "error") runtimeErrors.push(`console: ${msg.text()}`); });
      if (item.device === "iphone") await page.emulate(puppeteer.KnownDevices["iPhone 12"]);
      else await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
      if (useLocal) {
        await page.setRequestInterception(true);
        page.on("request", req => req.url().startsWith(baseUrl) || req.url().startsWith("data:") ? req.continue() : req.abort());
      }
      const shotName = `${item.device}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
      try {
        await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await item.fn(page);
        assert.deepEqual(runtimeErrors, []);
        results.push({ name: item.name, device: item.device, status: "PASS" });
        console.log(`PASS [${item.device}] ${item.name}`);
        if (screenshots) {
          fs.mkdirSync(screenshots, { recursive: true });
          await page.screenshot({ path: path.join(screenshots, shotName), fullPage: true });
        }
      } catch (error) {
        failures++;
        results.push({ name: item.name, device: item.device, status: "FAIL", error: error.message });
        console.log(`FAIL [${item.device}] ${item.name}: ${error.message}`);
        if (screenshots) {
          fs.mkdirSync(screenshots, { recursive: true });
          await page.screenshot({ path: path.join(screenshots, `failure-${shotName}`), fullPage: true }).catch(() => {});
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    if (useLocal) server.close();
  }
  const passed = cases.length - failures;
  console.log(`${passed}/${cases.length} audit cases passed`);
  if (process.env.AUDIT_JSON) fs.writeFileSync(process.env.AUDIT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, passed, total: cases.length, results }, null, 2));
  process.exitCode = failures ? 1 : 0;
}

main().catch(error => { console.error(error); if (server.listening) server.close(); process.exitCode = 1; });

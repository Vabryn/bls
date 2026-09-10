// Master App State
const DATA_YEARS = ["2025", "2024", "2023", "2022"];
function resolveInitialYear() {
  const q = new URLSearchParams(window.location.search).get("year");
  return DATA_YEARS.includes(q) ? q : "2025";
}
// Prefix for year-scoped data files (areas, jobs, metro_map).
// Year-independent files (zip_to_area, us_states_paths, metro_shapes) stay at data/.
function yb() { return `data/${state.year}`; }

const state = {
  year: resolveInitialYear(),
  manifest: [],
  currentAreaId: "99",
  areaData: null,
  areaCache: new Map(),
  nationalTotals: null,
  nationalArea: null,
  nationalMajorShares: null,
  tableSort: { col: "wage", asc: false },
  drilldownSoc: null,
  drilldownRegion: "ALL",
  browseWageMetric: "median",   // 'median' | 'mean' | 'p25' | 'p75' — shared by both browse tables
  jobDataYear: null,            // year the active occupation's data actually came from (fallback when the selected year is incomplete)
  jobPrior: new Map(),         // soc -> { "2024": payload, "2023": payload, "2022": payload } for per-field gap-fill
  _priorLoading: new Set(),
  drilldownTitle: "",
  areaTableSort: { col: "wage", asc: false },

  // Map Feature State
  mapData: null,
  metroShapes: null,
  statesById: {},
  stateByCode: {},
  focusedState: null,
  activeMapSoc: "00-0000",
  activeMapMetric: "median", // 'median' | 'mean' | 'p25' | 'p75'
  mapMode: "area",           // 'area' | 'bubble'
  jobCache: new Map(),
  activeJobPayload: null,
  mapZoom: { scale: 1, x: 0, y: 0 },
  dragSuppressedClick: false,
  _areaLoadToken: 0,
  _areaEls: null,
  _mapCtx: null
};

// Formatters
const fmt = {
  currency: (n) => {
    if (n === null || n === undefined || isNaN(n) || n <= 0) return "—";
    // 239200 is BLS's annual top code ('#' = "$239,200 or more"). Values ABOVE
    // it are real published figures (physicians, surgeons, CEOs) — show them.
    if (n === 239200) return "≥ $239,200";
    return "$" + Math.round(n).toLocaleString();
  },
  number: (n) => {
    if (n === null || n === undefined || isNaN(n) || n <= 0) return "—";
    return Math.round(n).toLocaleString();
  },
  compact: (n) => {
    if (n === null || n === undefined || isNaN(n) || n <= 0) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString();
  },
  lq: (n) => {
    // LQ is a ratio of employment shares; 0 / null means BLS suppressed the
    // employment it's derived from, not "zero concentration".
    if (n === null || n === undefined || isNaN(n) || n <= 0) return "—";
    return n.toFixed(2) + "×";
  },
  pct: (n) => {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }
};

// Trailing debounce — keeps keystroke-driven table rebuilds off the critical
// path so typing stays smooth on low-powered devices.
function debounce(fn, wait = 130) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// Color Scale Interpolator (5 stops: Deep Indigo -> Blue -> Teal -> Emerald -> Radiant Gold)
const COLOR_STOPS = [
  { t: 0.0, rgb: [49, 46, 129] },   // #312e81
  { t: 0.25, rgb: [2, 132, 199] },  // #0284c7
  { t: 0.50, rgb: [13, 148, 136] }, // #0d9488
  { t: 0.75, rgb: [16, 185, 129] }, // #10b981
  { t: 1.0, rgb: [251, 191, 36] }   // #fbbf24
];

function getChoroplethColor(val, minVal, maxVal, isLog = false) {
  if (val === null || val === undefined || isNaN(val) || val <= 0) {
    return "rgba(100, 116, 139, 0.4)"; // Unreported gray
  }
  let t;
  if (isLog) {
    const logVal = Math.log(val);
    const logMin = Math.log(minVal > 0 ? minVal : 1);
    const logMax = Math.log(maxVal > 0 ? maxVal : 1);
    t = (logMax > logMin) ? Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin))) : 0.5;
  } else {
    t = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));
  }
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const s1 = COLOR_STOPS[i], s2 = COLOR_STOPS[i + 1];
    if (t >= s1.t && t <= s2.t) {
      const p = (t - s1.t) / (s2.t - s1.t);
      const r = Math.round(s1.rgb[0] + (s2.rgb[0] - s1.rgb[0]) * p);
      const g = Math.round(s1.rgb[1] + (s2.rgb[1] - s1.rgb[1]) * p);
      const b = Math.round(s1.rgb[2] + (s2.rgb[2] - s1.rgb[2]) * p);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

function getChoroplethFill(val, minVal, maxVal, isDark = true, isLog = false) {
  if (val === null || val === undefined || isNaN(val) || val <= 0) {
    return isDark ? "rgba(30, 41, 59, 0.4)" : "#e2e8f0";
  }
  let t;
  if (isLog) {
    const logVal = Math.log(val);
    const logMin = Math.log(minVal > 0 ? minVal : 1);
    const logMax = Math.log(maxVal > 0 ? maxVal : 1);
    t = (logMax > logMin) ? Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin))) : 0.5;
  } else {
    t = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));
  }
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const s1 = COLOR_STOPS[i], s2 = COLOR_STOPS[i + 1];
    if (t >= s1.t && t <= s2.t) {
      const p = (t - s1.t) / (s2.t - s1.t);
      const r = Math.round(s1.rgb[0] + (s2.rgb[0] - s1.rgb[0]) * p);
      const g = Math.round(s1.rgb[1] + (s2.rgb[1] - s1.rgb[1]) * p);
      const b = Math.round(s1.rgb[2] + (s2.rgb[2] - s1.rgb[2]) * p);
      const alpha = isDark ? 0.38 : 0.85;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
  const alpha = isDark ? 0.38 : 0.85;
  return `rgba(${last[0]}, ${last[1]}, ${last[2]}, ${alpha})`;
}

// Initialize Application
// Stacked layout (phones/tablets, <=990px): the Summary is the first section,
// above the map, and pins under the masthead in a compressed form so the
// current area + its figures are always on screen. On desktop it's its own
// full-width panel below the map+browse split. Move the actual node (a CSS
// display:contents reorder did not take on iOS Safari) and re-settle it on
// breakpoint changes.
function positionSummaryPanel() {
  const summary = document.getElementById("kpiBar");
  const col = document.getElementById("mapCanvasColumn");
  const split = document.getElementById("mapCenterSplit");
  if (!summary || !col || !split) return;
  const stacked = window.matchMedia("(max-width: 990px)").matches;
  if (stacked) {
    if (col.firstElementChild !== summary) col.insertBefore(summary, split);
  } else if (summary.parentElement !== col || summary.nextElementSibling) {
    col.appendChild(summary);   // back to last child, after #summaryDivider
  }
}

async function init() {
  setupTheme();
  setupDropdowns();
  setupEventListeners();
  setupYearSelect();
  introTraceSearchBars();
  positionSummaryPanel();
  try {
    window.matchMedia("(max-width: 990px)").addEventListener("change", positionSummaryPanel);
  } catch (e) { window.addEventListener("resize", positionSummaryPanel); }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedArea = urlParams.get("area");

  try {
    const [manifestRes, natRes] = await Promise.all([
      fetch(`${yb()}/areas.json`),
      fetch(`${yb()}/areas/99.json`)
    ]);
    if (!manifestRes.ok || !natRes.ok) throw new Error('Initial wage data unavailable');
    state.manifest = await manifestRes.json();
    const natData = await natRes.json();
    state.areaCache.set("99", natData);
    state.nationalArea = natData;
    state.nationalTotals = natData.total || state.manifest.find(a => a.id === "99");

    // Precompute national major shares for accurate Location Quotient calculations
    state.nationalMajorShares = {};
    if (natData.majors && natData.total && natData.total.emp) {
      natData.majors.forEach(m => {
        if (m.emp && m.emp > 0) {
          state.nationalMajorShares[m.soc] = m.emp / natData.total.emp;
        }
      });
    }

    populateAreaDropdown();

    if (requestedArea && state.manifest.some(a => a.id === requestedArea)) {
      state.currentAreaId = requestedArea;
    } else {
      state.currentAreaId = "99";
    }

    // Fetch ZIP + place crosswalks asynchronously (used only to resolve search
    // queries; not on the critical render path).
    fetch("data/zip_to_area.json")
      .then(r => r.json())
      .then(d => { state.zipToArea = d; })
      .catch(err => console.warn("ZIP data load:", err));
    fetch("data/place_index.json")
      .then(r => r.json())
      .then(d => { state.placeIndex = d; })
      .catch(err => console.warn("Place index load:", err));

    // Load initial area and boot the metro map
    await Promise.all([
      loadArea(state.currentAreaId),
      initMetroMap()
    ]);

    // ?occ=<soc> deep-link: open that occupation's area breakdown.
    if (state._pendingOccBreakdown) {
      const o = state._pendingOccBreakdown;
      state._pendingOccBreakdown = null;
      try { await openOccupationAreaBreakdown(o.soc, o.title); } catch (e) {}
    }
  } catch (err) {
    showDataNotice('Wage data could not be loaded. Check your connection and reload this page.');
    console.error("Failed to load BLS manifest:", err);
  }
}

// Wire up the OEWS data-year selector. Switching year reloads the page with
// ?year=<yyyy> so every data engine re-initializes cleanly against the new
// release; the current ?area= selection is preserved across the reload.
function setupYearSelect() {
  const sel = document.getElementById("yearSelect");
  if (sel) {
    sel.value = state.year;
    sel.addEventListener("change", () => {
      const url = new URL(window.location);
      if (sel.value === "2025") {
        url.searchParams.delete("year");
      } else {
        url.searchParams.set("year", sel.value);
      }
      window.location.assign(url);
    });
  }
  const src = document.getElementById("sourceLabel");
  if (src) {
    src.textContent = `U.S. Bureau of Labor Statistics May ${state.year} Release`;
  }
  const fy = document.getElementById("footerYear");
  if (fy) fy.textContent = state.year;
}

// -------------------------------------------------------------
// METRO WAGE MAP ENGINE
// -------------------------------------------------------------
async function initMetroMap() {
  try {
    const [mapRes, statesRes, shapesRes] = await Promise.all([
      fetch(`${yb()}/metro_map.json`),
      fetch("data/us_states_paths.json"),
      fetch("data/metro_shapes.json")
    ]);
    state.mapData = await mapRes.json();
    const statesPaths = await statesRes.json();
    state.metroShapes = await shapesRes.json();

    state.statesById = {};
    statesPaths.forEach(s => {
      state.statesById[s.id] = s;
    });

    renderStateBoundaries(statesPaths);
    populateMapJobDropdown();
    setupMapControls();
    const wantOcc = new URLSearchParams(window.location.search).get("occ");
    const occMeta = wantOcc && state.mapData.occupations && state.mapData.occupations.find(o => o.soc === wantOcc);
    await loadMapJob(occMeta ? wantOcc : "00-0000");
    if (occMeta) state._pendingOccBreakdown = occMeta;

    if (state.currentAreaId && state.currentAreaId !== "99") {
      renderMetroShapeOverlay(state.currentAreaId);
    }
  } catch (err) {
    console.error("Failed to initialize metro map:", err);
    document.getElementById("mapSummaryStats").textContent = "Unable to load metro map data.";
  }
}

function renderStateBoundaries(states) {
  const layer = document.getElementById("statesLayer");
  if (!layer) return;
  layer.innerHTML = "";

  state.stateByCode = {};
  states.forEach(s => {
    state.statesById[s.id] = s;
    const manifestState = state.manifest.find(a => a.id === s.id);
    if (manifestState && manifestState.state) {
      state.stateByCode[manifestState.state] = s;
      s.state = manifestState.state;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "state-boundary");
    path.setAttribute("d", s.d);
    path.setAttribute("data-id", s.id);
    path.setAttribute("data-name", s.name);
    if (s.state) path.setAttribute("data-state", s.state);

    path.addEventListener("click", (e) => {
      if (state.dragSuppressedClick) return;
      e.stopPropagation();
      zoomToState(s.id);
    });

    layer.appendChild(path);
  });
  state._stateEls = Array.from(layer.querySelectorAll(".state-boundary"));
}

// -------------------------------------------------------------
// SVG PATH BOUNDS HELPER
// -------------------------------------------------------------
function getPathBounds(d) {
  if (!d) return { minX: 0, minY: 0, maxX: 975, maxY: 610, width: 975, height: 610 };
  const nums = d.match(/-?\d+\.?\d*/g);
  if (!nums) return { minX: 0, minY: 0, maxX: 975, maxY: 610, width: 975, height: 610 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const x = Number(nums[i]), y = Number(nums[i + 1]);
    if (!isNaN(x) && !isNaN(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 975,
    maxY: isFinite(maxY) ? maxY : 610,
    width: Math.max(10, maxX - minX),
    height: Math.max(10, maxY - minY)
  };
}

function zoomToState(stateIdOrCode) {
  const stateObj = state.statesById[stateIdOrCode] || state.stateByCode[stateIdOrCode];
  if (!stateObj) return;

  const stFips = stateObj.id;
  const stateMeta = state.manifest.find(a => a.id === stFips) || { name: stateObj.name, state: "" };
  const stCode = stateMeta.state || stateObj.state;

  // Toggle: if already focused on this state, reset zoom back to nationwide
  if (state.focusedState === stCode) {
    resetMapZoom();
    return;
  }

  state.focusedState = stCode;

  // 1. Calculate bounding box using getPathBounds
  const bounds = getPathBounds(stateObj.d);
  const minX = bounds.minX, maxX = bounds.maxX, minY = bounds.minY, maxY = bounds.maxY;

  // 2. Smooth zoom transform
  if (isFinite(minX) && isFinite(maxX)) {
    const dx = Math.max(30, maxX - minX);
    const dy = Math.max(30, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const scale = Math.min(4.8, Math.max(1.5, 0.74 / Math.max(dx / 975, dy / 610)));
    const tx = Math.round(975 / 2 - scale * cx);
    const ty = Math.round(610 / 2 - scale * cy);

    state.mapZoom = { scale, x: tx, y: ty };
    const zoomGroup = document.getElementById("mapZoomGroup");
    if (zoomGroup) {
      zoomGroup.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
    }
    refreshBubblesForZoom();
  }

  // 3. Highlight this state in statesLayer, dim others
  document.querySelectorAll(".state-boundary").forEach(p => {
    p.classList.toggle("state-focused", p.dataset.id === stFips);
    p.classList.toggle("state-dimmed", p.dataset.id !== stFips);
  });

  // 4. Highlight areas of this state, dim other areas
  let metroCount = 0;
  let nonmetroCount = 0;
  document.querySelectorAll(".area-boundary-shape").forEach(p => {
    const inState = p.dataset.state === stCode;
    // No specific region picked yet — keep in-state regions fully coloured.
    p.classList.remove("area-focused");
    p.classList.toggle("area-dimmed", !inState);
    if (inState) {
      if (p.dataset.type === "msa") metroCount++;
      else nonmetroCount++;
    }
  });

  // 5. Update Toolbar Area Info
  const titleEl = document.getElementById("hudMetroTitle");
  const subEl = document.getElementById("hudMetroCounties");
  const resetBtn = document.getElementById("hudResetBtn");
  if (titleEl) titleEl.textContent = stateMeta.name;
  const subtitle = nonmetroCount > 0
    ? `${metroCount} Metropolitan & ${nonmetroCount} Non-Metro Areas`
    : `${metroCount} Metropolitan Areas`;
  if (subEl) subEl.textContent = subtitle;
  if (resetBtn) resetBtn.style.display = "inline-flex";

  // 6. Update Explorer Data for the State
  loadArea(stFips, false);
}

function resetMapZoom() {
  state.focusedState = null;
  state.mapZoom = { scale: 1, x: 0, y: 0 };
  const zoomGroup = document.getElementById("mapZoomGroup");
  if (zoomGroup) {
    zoomGroup.setAttribute("transform", "translate(0, 0) scale(1)");
  }
  refreshBubblesForZoom();

  document.querySelectorAll(".state-boundary").forEach(p => {
    p.classList.remove("state-focused", "state-dimmed");
  });
  document.querySelectorAll(".area-boundary-shape").forEach(p => {
    p.classList.remove("area-focused", "area-dimmed", "selected");
  });
  document.querySelectorAll(".metro-bubble").forEach(c => {
    c.classList.remove("bubble-focused", "bubble-dimmed", "highlighted");
  });

  const layer = document.getElementById("metroOverlayLayer");
  if (layer) layer.innerHTML = "";

  const titleEl = document.getElementById("hudMetroTitle");
  const subEl = document.getElementById("hudMetroCounties");
  const resetBtn = document.getElementById("hudResetBtn");
  if (titleEl) titleEl.textContent = "United States";
  if (subEl) subEl.textContent = "National View";
  if (resetBtn) resetBtn.style.display = "inline-flex";


  if (state.currentAreaId && state.currentAreaId !== "99") {
    loadArea("99", false);
  } else {
    updateMapLegend();
  }
}

function populateMapJobDropdown() {
  filterMapJobDropdown("");
}

async function loadMapJob(soc) {
  const token = state._jobLoadToken = (state._jobLoadToken || 0) + 1;
  const previousSoc = state.activeJobPayload?.soc || '00-0000';
  state.activeMapSoc = soc;
  showDataNotice('');

  const occMeta = (state.mapData && state.mapData.occupations)
    ? (state.mapData.occupations.find(o => o.soc === soc) || { title: "All Occupations" })
    : { title: "All Occupations" };

  const jobInput = document.getElementById("mapJobSearchInput");
  const clearBtn = document.getElementById("mapJobClear");
  if (jobInput) {
    // The selection shows as a chip inside the field, so the input stays empty
    // and ready to type a new search.
    jobInput.value = "";
    jobInput.placeholder = soc === "00-0000"
      ? "Search occupation (e.g. Registered Nurses)…"
      : "Change occupation…";
    if (clearBtn) clearBtn.style.display = "none";
  }
  const sidebarJobTitle = document.getElementById("sidebarActiveJobTitle");
  if (sidebarJobTitle) {
    sidebarJobTitle.textContent = occMeta.title;
  }
  const sidebarStatsTitle = document.getElementById("sidebarStatsJobTitle");
  if (sidebarStatsTitle) {
    sidebarStatsTitle.textContent = occMeta.title;
  }

  if (soc === "00-0000") {
    // All occupations total: build payload from master map data
    state.jobDataYear = state.year;
    state.activeJobPayload = {
      soc: "00-0000",
      title: "All Occupations (Cross-Industry Total)",
      nat: state.mapData.nat,
      metros: {}
    };
    state.mapData.metros.forEach(m => {
      state.activeJobPayload.metros[m.id] = [
        m.emp,
        m.mean,
        m.median,
        m.p25,
        m.p75,
        1.0
      ];
    });
    renderMetroMap();
    renderHeroAndKPIs();
    return;
  }

  // Check cache for individual job
  if (state.jobCache.has(soc)) {
    const cached = state.jobCache.get(soc);
    state.activeJobPayload = cached.payload;
    state.jobDataYear = cached.dataYear;
    renderMetroMap();
    renderHeroAndKPIs();
    return;
  }

  const mapSummaryStatsEl = document.getElementById("mapSummaryStats");
  if (mapSummaryStatsEl) mapSummaryStatsEl.textContent = `Loading ${occMeta.title} across statistical areas...`;

  try {
    let payload = null;
    let dataYear = state.year;
    const res = await fetch(`data/${state.year}/jobs/${soc}.json`);
    if (res.ok) payload = await res.json();

    // If this occupation's wage data is missing/incomplete for the selected
    // year (e.g. Actors 2025 — BLS reports hourly only), fall back to the most
    // recent prior year that does have annual wages for it. Temporary: it only
    // holds while this occupation is the active job.
    if (!payloadHasWages(payload)) {
      for (let y = Number(state.year) - 1; y >= 2022; y--) {
        try {
          const r = await fetch(`data/${y}/jobs/${soc}.json`);
          if (!r.ok) continue;
          const p = await r.json();
          if (payloadHasWages(p)) { payload = p; dataYear = String(y); break; }
        } catch (e) { /* keep trying earlier years */ }
      }
    }

    if (!payload) throw new Error(`no job data for ${soc}`);
    state.jobCache.set(soc, { payload, dataYear });
    if (token !== state._jobLoadToken) return;
    showDataNotice('');
    state.activeJobPayload = payload;
    state.jobDataYear = dataYear;
    renderMetroMap();
    renderHeroAndKPIs();
  } catch (err) {
    if (token !== state._jobLoadToken) return;
    await loadMapJob(previousSoc);
    showDataNotice('Occupation data could not be loaded. The previous occupation is still displayed; select an occupation to retry.');
    console.error(`Failed to load job data for ${soc}:`, err);
  }
}

// True when a job payload carries usable annual wage data (national median/mean,
// or several metros with wages). Employment-only payloads return false.
function payloadHasWages(p) {
  if (!p) return false;
  if (p.nat && ((p.nat.median || 0) > 0 || (p.nat.mean || 0) > 0)) return true;
  if (p.metros) {
    let n = 0;
    for (const k in p.metros) {
      const r = p.metros[k];
      if (r && ((r[1] || 0) > 0 || (r[2] || 0) > 0) && ++n >= 3) return true;
    }
  }
  return false;
}

// Prior release years, newest first — used to backfill individual gaps.
const PRIOR_YEARS = () =>
  DATA_YEARS.filter(y => Number(y) < Number(state.year)).sort((a, b) => b - a);

// One occupation's stats for one area out of a job payload.
// Metro rows are [emp, mean, median, p25, p75, lq]; area 99 uses `nat`.
function occAreaStats(payload, areaId) {
  if (!payload) return null;
  if (areaId === "99") {
    const n = payload.nat || {};
    return { emp: n.emp, mean: n.mean, median: n.median, p25: n.p25, p75: n.p75, lq: 1.0, hourly: !!payload.hourly };
  }
  const r = payload.metros && payload.metros[areaId];
  if (!r) return null;
  return { emp: r[0], mean: r[1], median: r[2], p25: r[3], p75: r[4], lq: r[5], hourly: !!(payload.hourly || r[6]) };
}

// Lazily pull the prior years' job files for a SOC so gaps can be filled in.
async function ensurePriorJobYears(soc) {
  if (state.jobPrior.has(soc) || state._priorLoading.has(soc)) return;
  state._priorLoading.add(soc);
  const bag = {};
  await Promise.all(PRIOR_YEARS().map(async y => {
    try {
      const r = await fetch(`data/${y}/jobs/${soc}.json`);
      if (r.ok) bag[y] = await r.json();
    } catch (e) { /* a missing year just can't contribute */ }
  }));
  state.jobPrior.set(soc, bag);
  state._priorLoading.delete(soc);
  if (state.activeMapSoc === soc) {
    renderHeroAndKPIs();
    renderMetroMap();          // the choropleth fills its holes from these too
  }
}

// One metro's row for the active occupation, with every missing field filled
// from the most recent earlier release that has it (same rule the Area Summary
// uses). Returns the six-slot row plus `priorYear` = the newest release any
// filled figure came from, or null when nothing was borrowed.
function resolveMetroRow(soc, aid, curRow) {
  const row = (curRow ? curRow.slice(0, 6) : [null, null, null, null, null, null]);
  const bag = soc && state.jobPrior.get(soc);
  if (!bag) return { row, priorYear: null };
  let priorYear = null;
  const need = () => [0, 1, 2, 3, 4, 5].some(i => !(row[i] > 0));
  if (need()) {
    for (const y of PRIOR_YEARS()) {
      const s = occAreaStats(bag[y], aid);
      if (!s) continue;
      const vals = [s.emp, s.mean, s.median, s.p25, s.p75, s.lq];
      for (let i = 0; i < 6; i++) {
        if (!(row[i] > 0) && vals[i] > 0) { row[i] = vals[i]; if (!priorYear) priorYear = y; }
      }
      if (!need()) break;
    }
  }
  return { row, priorYear };
}

// Resolve one area's figures for the active occupation, filling any hole from
// the most recent earlier release that has it. Returns the values plus a
// { field: year } map of what was backfilled and whether any figure is an
// hourly-derived annual estimate.
function resolveOccAreaFigures(soc, areaId, currentStats) {
  // Every headline figure the Area Summary shows — including density (LQ),
  // which BLS drops whenever it suppresses the employment it's built from.
  const fields = ["emp", "mean", "median", "lq"];
  const out = Object.assign({ emp: null, mean: null, median: null, lq: null }, currentStats || {});
  const backfill = {};
  let hourly = !!(currentStats && currentStats.hourly);

  const holes = fields.filter(f => !(out[f] > 0));
  if (holes.length) {
    const bag = state.jobPrior.get(soc);
    if (!bag) {
      ensurePriorJobYears(soc);          // fire-and-forget; re-renders when ready
    } else {
      for (const y of PRIOR_YEARS()) {
        const s = occAreaStats(bag[y], areaId);
        if (!s) continue;
        for (const f of fields) {
          if (!(out[f] > 0) && s[f] > 0) { out[f] = s[f]; backfill[f] = y; if (s.hourly) hourly = true; }
        }
        if (fields.every(f => out[f] > 0)) break;
      }
    }
  }
  out.backfill = backfill;
  out.hourly = hourly;
  return out;
}

// =============================================================
// SEARCH — tolerant matching for occupations and areas
// =============================================================
const OCC_SYNONYMS = {
  rn: "registered nurses", nurse: "registered nurses", nursing: "registered nurses",
  "nurse practitioner": "nurse practitioners", lpn: "licensed practical",
  doctor: "physicians", doctors: "physicians", physician: "physicians", md: "physicians",
  dev: "software developers", developer: "software developers", developers: "software developers",
  programmer: "computer programmers", coder: "software developers", "software engineer": "software developers",
  swe: "software developers", "data scientist": "data scientists", "machine learning": "data scientists",
  "web developer": "web developers", designer: "graphic designers", ux: "web and digital interface designers",
  ui: "web and digital interface designers",
  teacher: "teachers", prof: "postsecondary teachers", professor: "postsecondary teachers",
  lawyer: "lawyers", attorney: "lawyers", paralegal: "paralegals and legal assistants",
  accountant: "accountants and auditors", cpa: "accountants and auditors", bookkeeper: "bookkeeping",
  hr: "human resources", recruiter: "human resources specialists",
  pm: "project management specialists", "product manager": "management",
  "truck driver": "heavy and tractor-trailer truck drivers", trucker: "heavy and tractor-trailer truck drivers",
  driver: "driver/sales workers", electrician: "electricians", plumber: "plumbers",
  welder: "welders", carpenter: "carpenters", mechanic: "mechanics",
  cook: "cooks", chef: "chefs and head cooks", bartender: "bartenders", server: "waiters and waitresses",
  waiter: "waiters and waitresses", cashier: "cashiers",
  barista: "fast food and counter workers", "coffee shop": "fast food and counter workers",
  pilot: "airline pilots", vet: "veterinarians", dentist: "dentists", pharmacist: "pharmacists",
  therapist: "therapists", counselor: "counselors", psychologist: "psychologists",
  "social worker": "social workers", cop: "police and sheriff", "police officer": "police and sheriff",
  firefighter: "firefighters", "flight attendant": "flight attendants",
  janitor: "janitors and cleaners", landscaper: "landscaping and groundskeeping",
  "real estate agent": "real estate sales agents", realtor: "real estate sales agents",
  "financial advisor": "personal financial advisors", "financial analyst": "financial and investment analysts",
  banker: "financial", teller: "tellers", plumbing: "plumbers", electrical: "electricians"
};

function normSearch(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function stemToken(w) {
  if (w.length <= 3) return w;
  return w.replace(/ies$/, "y").replace(/(ing|ers|er|ors|or|es|ed|s)$/, "") || w;
}
// small edit-distance, capped — enough to absorb one or two typos
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > cap) return cap + 1;
  }
  return prev[b.length];
}
function tokenMatches(queryTok, targetTok) {
  const q = stemToken(queryTok), t = stemToken(targetTok);
  if (q.length < 3 || t.length < 3) return q === t;
  if (t.startsWith(q) || q.startsWith(t)) return true;
  // one-typo tolerance, but only for tokens long enough that an edit can't
  // collapse two unrelated short words (e.g. "lawy" vs "lawn").
  if (q.length >= 5 && t.length >= 5 && editDistance(q, t, 1) <= 1) return true;
  return false;
}

// Score an occupation against a query. 0 = no match; higher = better.
function scoreOccupation(title, soc, rawQuery) {
  const q = normSearch(rawQuery);
  if (!q) return 1;
  const t = normSearch(title);
  const tTokAll = t.split(" ").filter(Boolean);
  // Shorter, more canonical titles win ties ("Software Developers" over
  // "Training and Development Specialists" for "dev").
  const brevity = Math.max(0, 40 - tTokAll.length * 6);
  const wholeWord = (" " + t + " ").includes(" " + q + " ");

  const syn = OCC_SYNONYMS[q] && normSearch(OCC_SYNONYMS[q]);

  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && soc && soc.replace(/\D/g, "").includes(digits)) return 950;
  if (t === q) return 1000;
  if (t.startsWith(q + " ") || t.startsWith(q + ",")) return 880 + brevity;
  if (t.startsWith(q)) return 780 + brevity;
  // A synonym whose target IS this title outranks a mere substring hit
  // elsewhere ("truck driver" -> the tractor-trailer role, not "Light Truck").
  if (syn && (t === syn || t.startsWith(syn + " "))) return 760 + brevity;
  if (wholeWord) return 700 + brevity;              // query is a standalone word in the title
  if (q.length >= 4 && t.includes(q)) return 520 + brevity;   // substring, but only for non-trivial queries

  if (syn) {
    if ((" " + t + " ").includes(" " + syn + " ")) return 560 + brevity;
    if (syn.split(" ").every(w => (" " + t + " ").includes(" " + w + " "))) return 460 + brevity;
  }

  const qTok = q.split(" ").filter(Boolean);
  let matched = 0;
  for (const w of qTok) if (tTokAll.some(tw => tokenMatches(w, tw))) matched++;
  // Every query word has to land somewhere in the title. (Partial credit is
  // how "lawyer" used to surface "...Landscaping..." — one loose word match
  // was enough.) Long titles get one word of slack for connective filler.
  if (qTok.length && matched === qTok.length) return 300 + matched * 12 + brevity;
  if (qTok.length >= 4 && matched >= qTok.length - 1) return 180 + matched * 10;
  return 0;
}

// -------------------------------------------------------------
// CLEAN AREA NAME FORMATTER
// Removes suffixes like "nonmetropolitan area", "metropolitan statistical area", etc.
// -------------------------------------------------------------
function formatAreaName(name) {
  if (!name) return "";
  return name
    .replace(/\s+nonmetropolitan\s+area.*$/gi, "")
    .replace(/\s+metropolitan\s+statistical\s+area.*$/gi, "")
    .replace(/\s+micropolitan\s+statistical\s+area.*$/gi, "")
    .trim();
}

// -------------------------------------------------------------
// DYNAMIC MAP LEGEND: TWO PUCKS (AREA ABOVE, US BELOW)
// -------------------------------------------------------------
function updateMapLegend() {
  const payload = state.activeJobPayload;
  if (!payload || !state.mapLegendScale) return;

  const { minVal, maxVal, natVal, isEmploymentMapping, metricKind = (isEmploymentMapping ? "emp" : "wage"), metricName, metricIdx, metric } = state.mapLegendScale;

  // 1. Min and Max labels on left and right edges
  const minEl = document.getElementById("legendMinLabel");
  const maxEl = document.getElementById("legendMaxLabel");
  if (minEl) minEl.textContent = fmtMetric(minVal, metricKind);
  if (maxEl) maxEl.textContent = fmtMetric(maxVal, metricKind);

  // 2. U.S. Puck (Below line, arrow points up ▲)
  const usPuck = document.getElementById("mapLegendUsPuck");
  const usNameEl = document.getElementById("puckUsName");
  const usValEl = document.getElementById("puckUsValue");
  const usArrow = document.getElementById("legendUsPuckArrow");

  if (usPuck && usNameEl && usValEl && natVal && natVal > 0 && maxVal > minVal) {
    const natPct = Math.max(0, Math.min(100, ((natVal - minVal) / (maxVal - minVal)) * 100));
    usPuck.style.left = `${natPct}%`;
    usPuck.style.display = "flex";

    const isAllJobs = !state.activeMapSoc || state.activeMapSoc === "00-0000";
    let occName = "";
    if (!isAllJobs) {
      occName = payload.title || (state.mapData && state.mapData.occupations ? (state.mapData.occupations.find(o => o.soc === state.activeMapSoc)?.title || "") : "");
      if (occName.length > 24) occName = occName.slice(0, 22) + "…";
    }

    const natWord = metricKind === "emp" ? "Total" : metricName;
    if (isAllJobs) {
      usNameEl.textContent = `U.S. National ${natWord}`;
    } else {
      usNameEl.textContent = `U.S. ${natWord} (${occName})`;
    }
    usValEl.textContent = fmtMetric(natVal, metricKind);

    // Edge clamping so badge does not clip off container boundaries
    if (natPct < 12) {
      usPuck.style.transform = "translateX(0%)";
      if (usArrow) {
        usArrow.style.alignSelf = "flex-start";
        usArrow.style.marginLeft = "12px";
        usArrow.style.marginRight = "0";
      }
    } else if (natPct > 88) {
      usPuck.style.transform = "translateX(-100%)";
      if (usArrow) {
        usArrow.style.alignSelf = "flex-end";
        usArrow.style.marginRight = "12px";
        usArrow.style.marginLeft = "0";
      }
    } else {
      usPuck.style.transform = "translateX(-50%)";
      if (usArrow) {
        usArrow.style.alignSelf = "center";
        usArrow.style.marginLeft = "0";
        usArrow.style.marginRight = "0";
      }
    }
  } else if (usPuck) {
    usPuck.style.display = "none";
  }

  // 3. Selected Area Puck (Above line, arrow points down ▼)
  const areaPuck = document.getElementById("mapLegendAreaPuck");
  const areaNameEl = document.getElementById("puckAreaName");
  const areaValEl = document.getElementById("puckAreaValue");
  const areaCompEl = document.getElementById("puckAreaComparison");
  const areaArrow = document.getElementById("legendAreaPuckArrow");

  if (!areaPuck || !areaNameEl || !areaValEl || !areaCompEl) return;

  const curAreaId = state.currentAreaId;
  const isSpecificArea = curAreaId && curAreaId !== "99";

  const curAreaRow = (state._mapJobRows && state._mapJobRows[curAreaId]) || (payload.metros && payload.metros[curAreaId]);
  if (isSpecificArea && curAreaRow) {
    const areaStats = curAreaRow;
    const displayVal = areaStats[metricIdx];
    const areaMeta = state.manifest ? state.manifest.find(a => a.id === curAreaId) : null;
    const rawName = areaMeta ? areaMeta.name : "Selected Area";
    const cleanName = formatAreaName(rawName);

    if (displayVal && displayVal > 0 && maxVal > minVal) {
      const pct = Math.max(0, Math.min(100, ((displayVal - minVal) / (maxVal - minVal)) * 100));
      areaPuck.style.left = `${pct}%`;
      areaPuck.style.display = "flex";

      areaNameEl.textContent = cleanName;
      areaValEl.textContent = fmtMetric(displayVal, metricKind);

      if (natVal && metricKind === "wage" && natVal > 0 && natVal !== 239200 && displayVal !== 239200) {
        const diffVal = displayVal - natVal;
        const diffPct = ((displayVal - natVal) / natVal) * 100;
        const sign = diffPct >= 0 ? "+" : "";
        areaCompEl.style.display = "inline-block";
        areaCompEl.textContent = `${sign}${diffPct.toFixed(1)}% vs U.S.`;
        areaCompEl.className = "puck-comparison tabular " + (Math.abs(diffPct) < 0.2 ? "neutral" : (diffPct > 0 ? "pos" : "neg"));
        areaCompEl.title = `U.S. ${metricName}: ${fmt.currency(natVal)} (Diff: ${sign}${fmt.currency(diffVal)})`;
      } else if (metricKind === "density" && displayVal > 0) {
        const pctv = (displayVal - 1) * 100;
        const sign = pctv >= 0 ? "+" : "";
        areaCompEl.style.display = "inline-block";
        areaCompEl.textContent = `${sign}${pctv.toFixed(0)}% vs U.S. avg`;
        areaCompEl.className = "puck-comparison tabular " + (Math.abs(pctv) < 1 ? "neutral" : (pctv > 0 ? "pos" : "neg"));
        areaCompEl.title = "";
      } else {
        areaCompEl.style.display = "none";
      }

      // Edge clamping so badge does not clip off container boundaries
      if (pct < 12) {
        areaPuck.style.transform = "translateX(0%)";
        if (areaArrow) {
          areaArrow.style.alignSelf = "flex-start";
          areaArrow.style.marginLeft = "12px";
          areaArrow.style.marginRight = "0";
        }
      } else if (pct > 88) {
        areaPuck.style.transform = "translateX(-100%)";
        if (areaArrow) {
          areaArrow.style.alignSelf = "flex-end";
          areaArrow.style.marginRight = "12px";
          areaArrow.style.marginLeft = "0";
        }
      } else {
        areaPuck.style.transform = "translateX(-50%)";
        if (areaArrow) {
          areaArrow.style.alignSelf = "center";
          areaArrow.style.marginLeft = "0";
          areaArrow.style.marginRight = "0";
        }
      }
    } else {
      // Area selected, but data suppressed
      const pct = natVal && maxVal > minVal ? Math.max(0, Math.min(100, ((natVal - minVal) / (maxVal - minVal)) * 100)) : 50;
      areaPuck.style.left = `${pct}%`;
      areaPuck.style.display = "flex";
      areaNameEl.textContent = cleanName;
      areaValEl.textContent = "Data Suppressed";
      areaCompEl.style.display = "none";
      areaPuck.style.transform = "translateX(-50%)";
    }
  } else {
    // When in National view (no area selected), hide the top area puck
    areaPuck.style.display = "none";
  }
}

// Bubble mode packs/unpacks its spider fans based on the current zoom, so a
// settled zoom change needs a re-render. Area mode is zoom-independent.
let _bubbleZoomTimer = null;
function refreshBubblesForZoom() {
  if (state.mapMode !== "bubble") return;
  clearTimeout(_bubbleZoomTimer);
  _bubbleZoomTimer = setTimeout(() => {
    if (state.mapMode === "bubble") renderMetroMap();
  }, 160);
}

// Format a map value by what the active metric represents.
function fmtMetric(v, kind) {
  kind = kind || (state.mapLegendScale && state.mapLegendScale.metricKind) || "wage";
  if (v === null || v === undefined || isNaN(v) || v <= 0) return "—";
  if (kind === "emp") return fmt.number(v);
  if (kind === "density") return v.toFixed(2) + "×";
  return fmt.currency(v);
}

function renderMetroMap() {
  const payload = state.activeJobPayload;
  if (!payload || !state.mapData) return;

  const metric = state.activeMapMetric; // 'median' | 'mean' | 'p25' | 'p75' | 'emp' | 'lq'
  const metros = state.mapData.metros;
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const soc = state.activeMapSoc;

  // Metric index map in row: [emp=0, mean=1, median=2, p25=3, p75=4, lq=5]
  let metricIdx = { emp: 0, mean: 1, median: 2, p25: 3, p75: 4, lq: 5 }[metric] ?? 2;
  let metricName = { median: "Median", mean: "Mean", p25: "Bottom 25%", p75: "Top 25%", emp: "Employment", lq: "Density" }[metric] || "Median";
  let metricKind = metric === "emp" ? "emp" : metric === "lq" ? "density" : "wage";

  // Every metro's row for this occupation, with holes filled from the most recent
  // earlier release that has the figure (mirrors the Area Summary). Kick the
  // prior-year fetch off if it hasn't run yet — ensurePriorJobYears re-renders.
  if (soc && soc !== "00-0000" && !state.jobPrior.has(soc)) ensurePriorJobYears(soc);
  // Resolving 500+ metro rows is pure function of (payload, soc, prior-years,
  // year) — cache it so rapid map clicks don't recompute every frame.
  const rowsKey = `${soc}|${state.jobPrior.has(soc) ? "p" : ""}|${state.year}`;
  let cache = state._jobRowsCache;
  if (!cache || cache.key !== rowsKey || cache.payload !== payload) {
    const jobRows = {};
    const priorYearByAid = {};
    metros.forEach(m => {
      const r = resolveMetroRow(soc, m.id, payload.metros[m.id]);
      if (r.row.some(v => v > 0)) jobRows[m.id] = r.row;
      if (r.priorYear) priorYearByAid[m.id] = r.priorYear;
    });
    cache = state._jobRowsCache = { key: rowsKey, payload, jobRows, priorYearByAid };
  }
  const jobRows = cache.jobRows;
  const priorYearByAid = cache.priorYearByAid;
  state._mapJobRows = jobRows;
  state._mapPriorYear = priorYearByAid;

  // Extract all valid values across statistical areas to calculate range and ranks
  let validMetros = [];
  metros.forEach(m => {
    const jobStats = jobRows[m.id];
    if (jobStats && jobStats[metricIdx] && jobStats[metricIdx] > 0) {
      validMetros.push({
        metro: m,
        val: jobStats[metricIdx],
        emp: jobStats[0] || 0,
        stats: jobStats
      });
    }
  });

  // isEmploymentMapping keeps its old meaning: "size/format as a count, not a
  // wage". True for the Employment metric and for the auto-fallback below.
  let isEmploymentMapping = (metric === "emp");
  if (validMetros.length === 0 && metricKind === "wage") {
    // No annual wage data for this occupation anywhere (Actors, Athletes…) —
    // fall back to mapping by employment so the map still says something.
    metricIdx = 0;
    metricName = "Employment";
    metricKind = "emp";
    isEmploymentMapping = true;
    metros.forEach(m => {
      const jobStats = jobRows[m.id];
      if (jobStats && jobStats[0] && jobStats[0] > 0) {
        validMetros.push({ metro: m, val: jobStats[0], emp: jobStats[0], stats: jobStats });
      }
    });
  }

  validMetros.sort((a, b) => b.val - a.val);

  const wageFallbackMax = metricKind === "density" ? 3 : 150000;
  const wageFallbackMin = metricKind === "density" ? 0.2 : 30000;
  const maxVal = validMetros.length ? validMetros[0].val : (isEmploymentMapping ? 10000 : wageFallbackMax);
  const minVal = validMetros.length ? validMetros[validMetros.length - 1].val : (isEmploymentMapping ? 10 : wageFallbackMin);
  const natVal = metricKind === "density" ? 1.0
    : (payload.nat ? (isEmploymentMapping ? payload.nat.emp : payload.nat[metric]) : null);

  // Store Legend Scale and Update Dynamic Puck & Min/Max Labels
  state.mapLegendScale = {
    minVal,
    maxVal,
    natVal,
    isEmploymentMapping,
    metricKind,
    metricName,
    metricIdx,
    metric
  };
  updateMapLegend();

  // -------------------------------------------------------------
  // RENDER ACTIVE MAP MODE LAYER (Area Map | Bubble Map)
  // -------------------------------------------------------------
  const mode = state.mapMode === "bubble" ? "bubble" : "area";
  const areasLayer = document.getElementById("areasLayer");
  const bubblesLayer = document.getElementById("bubblesLayer");

  if (areasLayer) areasLayer.style.display = mode === "area" ? "block" : "none";
  if (bubblesLayer) bubblesLayer.style.display = mode === "bubble" ? "block" : "none";

  if (mode === "area") {
    renderAreasLayer(payload, validMetros, metricIdx, metricName, minVal, maxVal, isDark, natVal, isEmploymentMapping, metricKind);
  } else {
    renderBubblesLayer(payload, validMetros, metricIdx, metricName, minVal, maxVal, isDark, natVal, isEmploymentMapping, metricKind);
  }
}

// -------------------------------------------------------------
// MODE 1: STATISTICAL AREAS LAYER (Polygons & Continuous Fill)
// -------------------------------------------------------------
// The ~510 area polygons and metro bubbles are built once and then only have
// their fill / state classes updated on each render. Hover, move and click are
// handled by a single delegated listener per layer rather than 4 per element.
function bindMapLayerDelegation(layer, selector, kind) {
  if (layer._delegated) return;
  layer._delegated = true;
  let hovered = null;

  layer.addEventListener("mouseover", (e) => {
    const el = e.target.closest(selector);
    if (!el || el === hovered) return;
    hovered = el;
    el.classList.add("hovered");
    const ctx = state._mapCtx;
    if (!ctx) return;
    const aid = el.dataset.id;
    const jobStats = (state._mapJobRows && state._mapJobRows[aid]) || ctx.payload.metros[aid];
    const val = jobStats ? jobStats[ctx.metricIdx] : null;
    const rank = ctx.rankByAid.get(aid);
    const rankText = rank ? `#${rank} of ${ctx.validCount}` : "Unreported";
    const meta = kind === "area"
      ? state.metroShapes[aid]
      : (state.mapData.metros.find(m => m.id === aid) || { name: aid });
    const priorYear = state._mapPriorYear && state._mapPriorYear[aid];
    showMetroTooltip(e, meta, ctx.payload, jobStats, ctx.metricName, val, rankText, ctx.natVal, ctx.isEmploymentMapping, ctx.metricKind, priorYear);
  });

  layer.addEventListener("mousemove", (e) => {
    if (e.target.closest(selector)) moveTooltip(e);
  });

  layer.addEventListener("mouseout", (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    el.classList.remove("hovered");
    if (hovered === el) hovered = null;
    hideTooltip();
  });

  layer.addEventListener("click", (e) => {
    const el = e.target.closest(selector);
    if (!el || state.dragSuppressedClick) return;
    e.stopPropagation();
    loadArea(el.dataset.id, true);
  });
}

function renderAreasLayer(payload, validMetros, metricIdx, metricName, minVal, maxVal, isDark, natVal, isEmploymentMapping = false, metricKind = "wage") {
  const areasLayer = document.getElementById("areasLayer");
  if (!areasLayer || !state.metroShapes) return;

  const rankByAid = new Map();
  validMetros.forEach((v, i) => rankByAid.set(v.metro.id, i + 1));
  state._mapCtx = { payload, metricIdx, metricName, natVal, isEmploymentMapping, metricKind, rankByAid, validCount: validMetros.length };
  bindMapLayerDelegation(areasLayer, ".area-boundary-shape", "area");

  // Build the polygon elements once; reuse thereafter.
  if (!state._areaEls) {
    state._areaEls = new Map();
    const frag = document.createDocumentFragment();
    Object.keys(state.metroShapes).forEach(aid => {
      const shape = state.metroShapes[aid];
      if (!shape || !shape.d) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "area-boundary-shape");
      path.setAttribute("d", shape.d);
      path.setAttribute("data-id", aid);
      path.setAttribute("data-state", shape.state || "");
      path.setAttribute("data-type", shape.type || "msa");
      frag.appendChild(path);
      state._areaEls.set(aid, path);
    });
    areasLayer.appendChild(frag);
  }

  const subAreaSelected = state.currentAreaId && String(state.currentAreaId).length > 2;
  state._areaEls.forEach((path, aid) => {
    const shape = state.metroShapes[aid];
    const jobStats = (state._mapJobRows && state._mapJobRows[aid]) || payload.metros[aid];
    const val = jobStats ? jobStats[metricIdx] : null;
    path.setAttribute("fill", getChoroplethFill(val, minVal, maxVal, isDark, isEmploymentMapping));
    path.classList.toggle("selected", state.currentAreaId === aid);
    if (state.focusedState) {
      const inState = shape.state === state.focusedState;
      path.classList.toggle("area-focused", inState && subAreaSelected && aid !== state.currentAreaId);
      path.classList.toggle("area-dimmed", !inState);
    } else if (path.classList.contains("area-focused") || path.classList.contains("area-dimmed")) {
      path.classList.remove("area-focused", "area-dimmed");
    }
  });
}

// -------------------------------------------------------------
// MODE 2: BUBBLE MAP LAYER (Centroid Circles)
// -------------------------------------------------------------
function renderBubblesLayer(payload, validMetros, metricIdx, metricName, minVal, maxVal, isDark, natVal, isEmploymentMapping = false, metricKind = "wage") {
  const bubblesLayer = document.getElementById("bubblesLayer");
  if (!bubblesLayer || !state.mapData) return;
  bubblesLayer.innerHTML = "";

  const rankByAid = new Map();
  validMetros.forEach((v, i) => rankByAid.set(v.metro.id, i + 1));
  state._mapCtx = { payload, metricIdx, metricName, natVal, isEmploymentMapping, metricKind, rankByAid, validCount: validMetros.length };
  bindMapLayerDelegation(bubblesLayer, ".metro-bubble", "bubble");

  const placed = []; // { circle, cx, cy, r } — positions finalised after spiderfy

  // Counter-scale the bubbles as the map zooms in so they hold a roughly
  // constant on-screen size instead of ballooning and overlapping. Value is
  // still encoded by relative size; the whole set just shrinks when zoomed.
  const zScale = (state.mapZoom && state.mapZoom.scale) || 1;
  // Counter-scale so bubbles stay a stable on-screen size across zoom levels.
  // A softer exponent lands between "no compensation" (first-click look) and
  // full compensation, so zoomed-in bubbles read a touch larger and match no
  // matter the click order.
  const zoomComp = 1 / Math.pow(zScale, 0.72);

  state.mapData.metros.forEach(m => {
    const shape = state.metroShapes ? state.metroShapes[m.id] : null;
    const cx = (shape && shape.cx) || m.cx;
    const cy = (shape && shape.cy) || m.cy;
    if (!cx || !cy) return;

    const jobStats = (state._mapJobRows && state._mapJobRows[m.id]) || payload.metros[m.id];
    const val = jobStats ? jobStats[metricIdx] : null;
    if (!val || val <= 0) return;

    const fill = getChoroplethColor(val, minVal, maxVal, isEmploymentMapping);

    let ratio;
    if (isEmploymentMapping) {
      const logVal = Math.log(val);
      const logMin = Math.log(minVal > 0 ? minVal : 1);
      const logMax = Math.log(maxVal > 0 ? maxVal : 1);
      ratio = (logMax > logMin) ? Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin))) : 0.5;
    } else {
      ratio = (maxVal > minVal) ? Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal))) : 0.4;
    }
    const r = Math.max(2, (3.5 + ratio * 14) * zoomComp);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "metro-bubble");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", fill);
    circle.setAttribute("data-id", m.id);
    circle.setAttribute("data-state", m.state || "");

    if (state.currentAreaId === m.id) {
      circle.classList.add("highlighted");
    }

    if (state.focusedState) {
      const inState = m.state === state.focusedState;
      circle.classList.toggle("bubble-focused", inState);
      circle.classList.toggle("bubble-dimmed", !inState);
    }

    placed.push({ circle, cx, cy, r });
  });

  // Spiderfy: once zoomed in, fan out bubbles that still overlap on screen so
  // each stays individually clickable. Legs are drawn under the circles.
  const scale = (state.mapZoom && state.mapZoom.scale) || 1;
  const legs = document.createDocumentFragment();
  const circles = document.createDocumentFragment();

  if (scale >= 1.4 && placed.length > 1) {
    const seen = new Set();
    for (let i = 0; i < placed.length; i++) {
      if (seen.has(i)) continue;
      const cluster = [i];
      const a = placed[i];
      for (let j = i + 1; j < placed.length; j++) {
        if (seen.has(j)) continue;
        const b = placed[j];
        const gapPx = (a.r + b.r + 3) ;
        const distPx = Math.hypot(a.cx - b.cx, a.cy - b.cy) * scale;
        if (distPx < gapPx) cluster.push(j);
      }
      if (cluster.length < 2) continue;
      cluster.forEach(k => seen.add(k));

      const gx = cluster.reduce((s, k) => s + placed[k].cx, 0) / cluster.length;
      const gy = cluster.reduce((s, k) => s + placed[k].cy, 0) / cluster.length;
      const n = cluster.length;
      const legPx = Math.max(16, 8 + n * 3.5);       // screen-space fan radius
      const legLen = legPx / scale;                  // convert to map units

      cluster.forEach((k, idx) => {
        const ang = (idx / n) * Math.PI * 2 - Math.PI / 2;
        const nx = gx + Math.cos(ang) * legLen;
        const ny = gy + Math.sin(ang) * legLen;
        const p = placed[k];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "bubble-leg");
        line.setAttribute("x1", gx);
        line.setAttribute("y1", gy);
        line.setAttribute("x2", nx);
        line.setAttribute("y2", ny);
        legs.appendChild(line);
        p.circle.setAttribute("cx", nx);
        p.circle.setAttribute("cy", ny);
      });
    }
  }

  placed.forEach(p => circles.appendChild(p.circle));
  bubblesLayer.appendChild(legs);
  bubblesLayer.appendChild(circles);
}

function showMetroTooltip(e, metro, jobPayload, stats, metricName, metricVal, rankText, natVal, isEmploymentMapping = false, metricKind = "wage", priorYear = null) {
  const [emp, mean, median, p25, p75, lq] = stats || [null, null, null, null, null, null];
  if (metricKind === "wage" && !(isEmploymentMapping)) metricKind = "wage";
  else if (isEmploymentMapping) metricKind = "emp";

  let deltaHtml = "";
  if (metricKind === "wage" && metricVal && natVal && natVal > 0 && metricVal !== 239200 && natVal !== 239200) {
    const diffPct = ((metricVal - natVal) / natVal) * 100;
    const sign = diffPct >= 0 ? "+" : "";
    const color = diffPct >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)";
    deltaHtml = `<span style="color: ${color}; font-weight: 600;">${sign}${diffPct.toFixed(1)}% vs U.S.</span>`;
  } else if (metricKind === "emp" && emp && natVal && natVal > 0) {
    const sharePct = ((emp / natVal) * 100).toFixed(1);
    deltaHtml = `<span style="color: var(--accent-cyan); font-weight: 600;">${sharePct}% of U.S. Total</span>`;
  } else if (metricKind === "density" && metricVal > 0) {
    const pct = ((metricVal - 1) * 100);
    const sign = pct >= 0 ? "+" : "";
    const color = pct >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)";
    deltaHtml = `<span style="color: ${color}; font-weight: 600;">${sign}${pct.toFixed(0)}% vs U.S. avg</span>`;
  }

  const primaryLabel = metricKind === "emp" ? "Metro Employment"
    : metricKind === "density" ? "Employment Density"
    : `${metricName} Wage`;
  const primaryValue = metricKind === "emp" ? `${fmt.number(metricVal)} Employed`
    : metricKind === "density" ? `${(metricVal || 0).toFixed(2)}×`
    : fmt.currency(metricVal);
  const priorTag = priorYear
    ? `<span style="font-family:var(--font-mono); font-size:10px; color:var(--accent-cyan); border:1px solid var(--accent-cyan); border-radius:4px; padding:0 4px;">${priorYear} data</span>`
    : "";

  tooltip.innerHTML = `
    <div style="display: flex; flex-wrap: wrap; gap: 5px 6px; margin: 0 0 8px; padding: 0;">
      <span class="pill-token">${jobPayload.title}</span>
      <span class="pill-token">${formatAreaName(metro.name)}</span>
    </div>

    <div style="background: var(--bg-elevated); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 11px; color: var(--text-muted);">${primaryLabel}</span>
        ${deltaHtml}
      </div>
      <div class="tabular" style="font-size: 20px; font-weight: 700; color: var(--text-primary); margin-top: 2px;">
        ${primaryValue}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 3px;">
        <span>National Rank: <strong style="color: var(--text-secondary);">${rankText}</strong></span>
        ${priorTag}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-family: var(--font-mono); font-size: 11.5px;">
      ${median !== null ? `
        <span style="color: var(--text-muted);">Median (P50):</span>
        <span style="text-align: right; font-weight: 600;">${fmt.currency(median)}</span>
      ` : ""}
      ${mean !== null ? `
        <span style="color: var(--text-muted);">Mean Wage:</span>
        <span style="text-align: right;">${fmt.currency(mean)}</span>
      ` : ""}
      ${p25 !== null ? `
        <span style="color: var(--text-muted);">Bottom 25%:</span>
        <span style="text-align: right;">${fmt.currency(p25)}</span>
      ` : ""}
      ${p75 !== null ? `
        <span style="color: var(--text-muted);">Top 25%:</span>
        <span style="text-align: right;">${fmt.currency(p75)}</span>
      ` : ""}
      ${emp ? `
        <span style="color: var(--text-muted);">Metro Employment:</span>
        <span style="text-align: right; font-weight: 600;">${fmt.number(emp)}</span>
      ` : ""}
      ${lq ? `
        <span style="color: var(--text-muted);">Location Quotient:</span>
        <span style="text-align: right; color: ${lq >= 1.25 ? 'var(--accent-emerald)' : 'var(--text-primary)'}; font-weight: 600;">${fmt.lq(lq)}</span>
      ` : ""}
    </div>

    ${(median === null && mean === null) ? `
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle); font-size: 12.5px; line-height: 1.5; color: var(--text-secondary);">
        BLS publishes only an hourly wage schedule for this occupation, so no
        annual wage is computed.
      </div>
    ` : ""}
  `;

  tooltip.style.display = "block";
  moveTooltip(e);
}

function setupMapControls() {
  // Metric selector buttons
  document.querySelectorAll("#mapMetricTabs .segmented-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mapMetricTabs .segmented-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeMapMetric = btn.dataset.metric;
      renderMetroMap();
    });
  });

  // Map Mode Tabs (Area Map, Bubble Map)
  const modeTabs = document.querySelectorAll("#mapModeTabs .segmented-btn");
  modeTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode || mode === state.mapMode) return;
      state.mapMode = mode;
      modeTabs.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      renderMetroMap();
    });
  });

  // Job Search Combobox
  const input = document.getElementById("mapJobSearchInput");
  const dropdown = document.getElementById("mapJobDropdown");
  const clearBtn = document.getElementById("mapJobClear");

  input.addEventListener("focus", () => {
    input.select();
    filterMapJobDropdown(input.value);
    dropdown.classList.add("open");
  });

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? "block" : "none";
    filterMapJobDropdown(q);
    dropdown.classList.add("open");
    // This box doubles as the Browse list filter now that the two searches merged.
    if (!state.drilldownSoc && typeof renderBrowseTable === "function") renderBrowseTable();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    filterMapJobDropdown("");
    loadMapJob("00-0000");
    if (!state.drilldownSoc && typeof renderBrowseTable === "function") renderBrowseTable();
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    const visibleOptions = Array.from(dropdown.querySelectorAll(".area-option"));
    if (!visibleOptions.length) return;

    let highlighted = dropdown.querySelector(".area-option.highlighted");
    let idx = visibleOptions.indexOf(highlighted);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!dropdown.classList.contains("open")) {
        dropdown.classList.add("open");
        return;
      }
      if (highlighted) highlighted.classList.remove("highlighted");
      idx = (idx + 1) % visibleOptions.length;
      visibleOptions[idx].classList.add("highlighted");
      visibleOptions[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (highlighted) highlighted.classList.remove("highlighted");
      idx = (idx - 1 + visibleOptions.length) % visibleOptions.length;
      visibleOptions[idx].classList.add("highlighted");
      visibleOptions[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = highlighted || visibleOptions[0];
      if (pick) {
        const pickName = pick.querySelector(".area-opt-name") ? pick.querySelector(".area-opt-name").textContent : (pick.dataset.title || "");
        input.value = "";
        if (clearBtn) clearBtn.style.display = "none";
        closeMapJobDropdown();
        openOccupationAreaBreakdown(pick.dataset.soc, pickName);
      }
    } else if (e.key === "Escape") {
      closeMapJobDropdown();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#jobPickerWrap")) {
      closeMapJobDropdown();
    }
  });

  // Map Zoom / Pan Handlers
  const zoomGroup = document.getElementById("mapZoomGroup");
  const svgContainer = document.getElementById("mapSvgContainer");
  let _lastZoomScale = state.mapZoom.scale;
  const updateTransform = () => {
    zoomGroup.setAttribute(
      "transform",
      `translate(${state.mapZoom.x}, ${state.mapZoom.y}) scale(${state.mapZoom.scale})`
    );
    if (state.mapZoom.scale !== _lastZoomScale) {
      _lastZoomScale = state.mapZoom.scale;
      refreshBubblesForZoom();
    }
  };

  // Click-Drag Pan Implementation (Works seamlessly even when zoomed in)
  let isPointerDown = false;
  let hasDragged = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  const onPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    isPointerDown = true;
    hasDragged = false;
    startX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    startY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    startTx = state.mapZoom.x;
    startTy = state.mapZoom.y;
  };

  const onPointerMove = (e) => {
    if (!isPointerDown) return;
    const isTouch = !!(e.touches && e.touches.length);
    const curX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const curY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const dx = curX - startX;
    const dy = curY - startY;

    if (!hasDragged) {
      if (Math.hypot(dx, dy) <= 8) return;
      // On touch, a vertical-dominant swipe is the page scrolling past the
      // map (touch-action: pan-y), not a map pan — release and let it through.
      if (isTouch && Math.abs(dy) > Math.abs(dx)) { isPointerDown = false; return; }
      hasDragged = true;
      svgContainer.classList.add("is-dragging");
      zoomGroup.style.transition = "none";
    }

    if (hasDragged) {
      const rect = svgContainer.getBoundingClientRect();
      const scaleRatioX = 975 / (rect.width || 975);
      const scaleRatioY = 610 / (rect.height || 610);

      const targetX = startTx + dx * scaleRatioX;
      const targetY = startTy + dy * scaleRatioY;

      // Bound pan limits to keep the US map in viewport
      const minTx = (1 - state.mapZoom.scale) * 975 - 250;
      const maxTx = 250;
      const minTy = (1 - state.mapZoom.scale) * 610 - 200;
      const maxTy = 200;

      state.mapZoom.x = Math.max(minTx, Math.min(maxTx, targetX));
      state.mapZoom.y = Math.max(minTy, Math.min(maxTy, targetY));
      updateTransform();
    }
  };

  const onPointerUp = () => {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (hasDragged) {
      svgContainer.classList.remove("is-dragging");
      zoomGroup.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
      state.dragSuppressedClick = true;
      setTimeout(() => {
        state.dragSuppressedClick = false;
      }, 140);
    }
  };

  svgContainer.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  svgContainer.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length === 1) onPointerDown(e);
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (e.touches && e.touches.length === 1 && isPointerDown) onPointerMove(e);
  }, { passive: true });
  window.addEventListener("touchend", onPointerUp, { passive: true });
  window.addEventListener("touchcancel", onPointerUp, { passive: true });

  // Mouse wheel zoom centered on cursor
  svgContainer.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = svgContainer.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (975 / (rect.width || 975));
    const mouseY = (e.clientY - rect.top) * (610 / (rect.height || 610));

    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const oldScale = state.mapZoom.scale;
    const newScale = Math.min(8, Math.max(1, oldScale * factor));
    if (newScale === oldScale) return;

    state.mapZoom.x = mouseX - (mouseX - state.mapZoom.x) * (newScale / oldScale);
    state.mapZoom.y = mouseY - (mouseY - state.mapZoom.y) * (newScale / oldScale);
    state.mapZoom.scale = newScale;

    if (newScale === 1) {
      state.mapZoom.x = 0;
      state.mapZoom.y = 0;
    }

    zoomGroup.style.transition = "none";
    updateTransform();
    clearTimeout(state._wheelTimer);
    state._wheelTimer = setTimeout(() => {
      zoomGroup.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
    }, 70);
  }, { passive: false });

  document.getElementById("mapZoomIn").addEventListener("click", () => {
    const cx = 975 / 2, cy = 610 / 2;
    const oldScale = state.mapZoom.scale;
    const newScale = Math.min(6, oldScale * 1.35);
    state.mapZoom.x = Math.round(cx - (cx - state.mapZoom.x) * (newScale / oldScale));
    state.mapZoom.y = Math.round(cy - (cy - state.mapZoom.y) * (newScale / oldScale));
    state.mapZoom.scale = newScale;
    updateTransform();
  });

  document.getElementById("mapZoomOut").addEventListener("click", () => {
    const cx = 975 / 2, cy = 610 / 2;
    const oldScale = state.mapZoom.scale;
    const newScale = Math.max(1, oldScale / 1.35);
    if (newScale === 1) {
      state.mapZoom = { scale: 1, x: 0, y: 0 };
    } else {
      state.mapZoom.x = Math.round(cx - (cx - state.mapZoom.x) * (newScale / oldScale));
      state.mapZoom.y = Math.round(cy - (cy - state.mapZoom.y) * (newScale / oldScale));
      state.mapZoom.scale = newScale;
    }
    updateTransform();
  });

  const mzr = document.getElementById("mapZoomReset");
  if (mzr) mzr.addEventListener("click", resetMapZoom);
  // #mapResetBtn (the ⟲ in the zoom stack) is wired in setupEventListeners.

  // -------------------------------------------------------------
  // Dynamic Splitter Puck between Map and Search/Browse
  // -------------------------------------------------------------
  setupSplitterPuck();
  setupSummaryResizer();
}

// Horizontal splitter: drag up/down to resize the Summary panel against the
// map + browse split above it. Bar is horizontal, motion is vertical.
function setupSummaryResizer() {
  const divider = document.getElementById("summaryDivider");
  const col = document.getElementById("mapCanvasColumn");
  const panel = document.getElementById("kpiBar");
  if (!divider || !col || !panel) return;

  let dragging = false, startY = 0, startH = 0, colH = 0;
  const clientY = (e) => e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

  const down = (e) => {
    if (e.button && e.button !== 0) return;
    dragging = true;
    divider.classList.add("is-dragging");
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    startY = clientY(e);
    startH = panel.getBoundingClientRect().height;
    colH = col.getBoundingClientRect().height;
    if (e.cancelable && e.type === "touchstart") e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    const dy = clientY(e) - startY;
    // drag down -> summary shrinks; drag up -> summary grows
    const minH = 120;
    const maxH = Math.max(minH, colH - 260);
    const h = Math.max(minH, Math.min(maxH, startH - dy));
    col.style.setProperty("--summary-h", `${h.toFixed(0)}px`);
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  divider.addEventListener("mousedown", down);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  divider.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("touchmove", move, { passive: true });
  window.addEventListener("touchend", up, { passive: true });
  window.addEventListener("touchcancel", up, { passive: true });
}

function setupSplitterPuck() {
  const divider = document.getElementById("mapBrowseDivider");
  const splitParent = document.getElementById("mapCenterSplit");
  if (!divider || !splitParent) return;

  let isDraggingSplitter = false;
  let startClientX = 0;
  let initialMapWidth = 0;
  let splitParentWidth = 0;

  const onSplitPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    isDraggingSplitter = true;
    divider.classList.add("is-dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    startClientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const splitRect = splitParent.getBoundingClientRect();
    splitParentWidth = splitRect.width;

    const mapCard = document.getElementById("mapCardContainer");
    if (mapCard) {
      initialMapWidth = mapCard.getBoundingClientRect().width;
    }

    if (e.cancelable && e.type === "touchstart") {
      e.preventDefault();
    }
  };

  const onSplitPointerMove = (e) => {
    if (!isDraggingSplitter) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const dx = clientX - startClientX;

    if (splitParentWidth > 0) {
      const newWidthPx = initialMapWidth + dx;
      // Clamp between 32% and 68% of the container width
      const minPx = Math.max(340, splitParentWidth * 0.32);
      const maxPx = Math.min(splitParentWidth - 340, splitParentWidth * 0.68);
      const clampedPx = Math.max(minPx, Math.min(maxPx, newWidthPx));
      const pct = (clampedPx / splitParentWidth) * 100;

      splitParent.style.setProperty("--map-split-width", `${pct.toFixed(2)}%`);
    }
  };

  const onSplitPointerUp = () => {
    if (!isDraggingSplitter) return;
    isDraggingSplitter = false;
    divider.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  divider.addEventListener("mousedown", onSplitPointerDown);
  window.addEventListener("mousemove", onSplitPointerMove);
  window.addEventListener("mouseup", onSplitPointerUp);

  divider.addEventListener("touchstart", onSplitPointerDown, { passive: false });
  window.addEventListener("touchmove", onSplitPointerMove, { passive: true });
  window.addEventListener("touchend", onSplitPointerUp, { passive: true });
  window.addEventListener("touchcancel", onSplitPointerUp, { passive: true });
}

function filterMapJobDropdown(query) {
  const dropdown = document.getElementById("mapJobDropdown");
  if (!dropdown || !state.mapData || !state.mapData.occupations) return;
  const q = (query || "").toLowerCase().trim();

  const matches = (q
    ? state.mapData.occupations
        .map(occ => ({ occ, s: scoreOccupation(occ.title, occ.soc, q) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || (b.occ.count || 0) - (a.occ.count || 0))
        .map(x => x.occ)
    : state.mapData.occupations
  ).slice(0, 35);

  dropdown.innerHTML = "";
  if (matches.length === 0) {
    dropdown.innerHTML = `<div style="padding: 12px 14px; color: var(--text-muted); font-size: 12px; text-align: center;">No matching occupations found</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach(occ => {
    const opt = document.createElement("div");
    opt.className = "area-option";
    opt.dataset.soc = occ.soc;
    opt.dataset.title = occ.title.toLowerCase();

    opt.innerHTML = `
      <span class="area-opt-name">${occ.title}</span>
      <span class="area-opt-meta">${occ.count} areas</span>
    `;

    opt.addEventListener("click", () => {
      const inp = document.getElementById("mapJobSearchInput");
      if (inp) inp.value = "";
      const clr = document.getElementById("mapJobClear");
      if (clr) clr.style.display = "none";
      closeMapJobDropdown();
      // Picking an occupation opens its per-area breakdown in the browse panel
      // and recolors the map (openOccupationAreaBreakdown calls loadMapJob).
      openOccupationAreaBreakdown(occ.soc, occ.title);
    });

    fragment.appendChild(opt);
  });
  dropdown.appendChild(fragment);
}

function closeMapJobDropdown() {
  const dropdown = document.getElementById("mapJobDropdown");
  if (dropdown) dropdown.classList.remove("open");
}

// Commit the zoom transform for an area up front (used before the map re-render
// so the bubble layer can size against the final scale). renderMetroShapeOverlay
// recomputes the same values when it runs — this just gets them in early.
function precommitAreaZoom(areaId) {
  const shape = state.metroShapes && state.metroShapes[areaId];
  if (!shape || !shape.bounds || shape.bounds.length !== 2) return;
  const [[x0, y0], [x1, y1]] = shape.bounds;
  const dx = Math.max(18, x1 - x0);
  const dy = Math.max(18, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const scale = Math.min(5.2, Math.max(1.6, 0.72 / Math.max(dx / 975, dy / 610)));
  const tx = Math.round(975 / 2 - scale * cx);
  const ty = Math.round(610 / 2 - scale * cy);
  // Only stage the zoom state so the bubble layer sizes correctly. The single
  // transform write (and its transition) is left to renderMetroShapeOverlay so
  // the map animates once, not twice.
  state.mapZoom = { scale, x: tx, y: ty };
}

// Which state the choropleth should focus/dim around, given the active area.
// A metro/nonmetro area focuses its parent state; a state focuses itself;
// national clears focus. zoomToState still manages this on its own path.
function syncFocusedStateForArea(areaId) {
  if (areaId === "99" || areaId == null) { state.focusedState = null; return; }
  const shape = state.metroShapes && state.metroShapes[areaId];
  if (shape) { state.focusedState = shape.state || null; return; }
  const st = state.statesById && state.statesById[areaId];
  if (st) { state.focusedState = st.state || null; }
}

// -------------------------------------------------------------
// METRO & STATISTICAL AREA BACKGROUND SHAPE OVERLAY
// -------------------------------------------------------------
function renderMetroShapeOverlay(areaId, shouldZoom = true) {
  const layer = document.getElementById("metroOverlayLayer");
  if (!layer) return;

  // renderAll normally sets this before the map renders, but on some paths
  // (init race, standalone calls) it hasn't — if it changes here, the map
  // layer needs one more pass to grey the siblings.
  const _prevFocus = state.focusedState;
  syncFocusedStateForArea(areaId);
  const _refocused = state.focusedState !== _prevFocus;

  layer.innerHTML = "";

  // 1. If MSA or Non-Metro Area
  if (state.metroShapes && state.metroShapes[areaId]) {
    const shape = state.metroShapes[areaId];
    const metroMeta = state.manifest.find(a => a.id === areaId) || { name: "Statistical Area" };

    // Update Toolbar Area Info
    const titleEl = document.getElementById("hudMetroTitle");
    const subEl = document.getElementById("hudMetroCounties");
    const resetBtn = document.getElementById("hudResetBtn");
    if (titleEl) titleEl.textContent = formatAreaName(metroMeta.name);
    if (subEl) {
      const typeLabel = shape.type === "nonmetro"
        ? "Nonmetropolitan Region"
        : (shape.type === "state" ? "Statewide Area" : "Metropolitan Statistical Area");
      subEl.textContent = typeLabel;
    }
    if (resetBtn) resetBtn.style.display = "inline-flex";

    // Parent-state perimeter highlight (~51 nodes). The area / bubble focus+dim
    // is done by renderAreasLayer / renderBubblesLayer off state.focusedState,
    // which syncFocusedStateForArea set before this ran.
    (state._stateEls || document.querySelectorAll(".state-boundary")).forEach(p => {
      const isParent = p.dataset.state === shape.state;
      p.classList.toggle("state-focused", !!shape.state && isParent);
      p.classList.toggle("state-dimmed", !!shape.state && !isParent);
    });

    // Render unified outer statistical wage area boundary polygon
    if (shape.d) {
      const outerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      outerPath.setAttribute("class", "metro-overlay-path");
      outerPath.setAttribute("d", shape.d);
      layer.appendChild(outerPath);
    }

    // Smooth Auto-Zoom to Metro Bounding Box
    if (shouldZoom && shape.bounds && shape.bounds.length === 2) {
      const [[x0, y0], [x1, y1]] = shape.bounds;
      const dx = Math.max(18, x1 - x0);
      const dy = Math.max(18, y1 - y0);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;

      const scale = Math.min(5.2, Math.max(1.6, 0.72 / Math.max(dx / 975, dy / 610)));
      const tx = Math.round(975 / 2 - scale * cx);
      const ty = Math.round(610 / 2 - scale * cy);

      state.mapZoom = { scale, x: tx, y: ty };
      const zoomGroup = document.getElementById("mapZoomGroup");
      if (zoomGroup) {
        zoomGroup.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
      }
    }
  }
  // 2. If U.S. State
  else if (state.statesById && state.statesById[areaId]) {
    const stateObj = state.statesById[areaId];
    const stateMeta = state.manifest.find(a => a.id === areaId) || { name: stateObj.name, state: "" };

    // Render outer state boundary path
    if (stateObj.d) {
      const outerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      outerPath.setAttribute("class", "metro-overlay-path");
      outerPath.setAttribute("d", stateObj.d);
      layer.appendChild(outerPath);
    }

    // Highlight all statistical areas, bubbles, and bars in this state
    let countInState = 0;
    document.querySelectorAll(".area-boundary-shape").forEach(p => {
      const inState = p.dataset.state === stateMeta.state;
      // Whole state selected — no sibling to grey out.
      p.classList.remove("area-focused");
      p.classList.toggle("area-dimmed", !inState);
      if (inState && p.dataset.type === "msa") countInState++;
    });
    document.querySelectorAll(".metro-bubble").forEach(c => {
      const inState = c.dataset.state === stateMeta.state;
      c.classList.toggle("bubble-focused", inState);
      c.classList.toggle("bubble-dimmed", !inState);
    });


    // Calculate state bounds
    const b = getPathBounds(stateObj.d);
    const minX = b.minX, maxX = b.maxX, minY = b.minY, maxY = b.maxY;

    if (shouldZoom && isFinite(minX) && isFinite(maxX)) {
      const dx = Math.max(30, maxX - minX);
      const dy = Math.max(30, maxY - minY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const scale = Math.min(4.5, Math.max(1.3, 0.76 / Math.max(dx / 975, dy / 610)));
      const tx = Math.round(975 / 2 - scale * cx);
      const ty = Math.round(610 / 2 - scale * cy);

      state.mapZoom = { scale, x: tx, y: ty };
      const zoomGroup = document.getElementById("mapZoomGroup");
      if (zoomGroup) {
        zoomGroup.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
      }
    }

    const titleEl = document.getElementById("hudMetroTitle");
    const subEl = document.getElementById("hudMetroCounties");
    const resetBtn = document.getElementById("hudResetBtn");
    if (titleEl) titleEl.textContent = stateMeta.name;
    if (subEl) subEl.textContent = `${countInState} Statistical Areas in ${stateMeta.name}`;
    if (resetBtn) resetBtn.style.display = "inline-flex";
  }
  // 3. National benchmark or reset
  else {
    const titleEl = document.getElementById("hudMetroTitle");
    const subEl = document.getElementById("hudMetroCounties");
    const resetBtn = document.getElementById("hudResetBtn");
    if (titleEl) titleEl.textContent = "United States";
    if (subEl) subEl.textContent = "National View";
    if (resetBtn) resetBtn.style.display = "inline-flex";

    (state._stateEls || document.querySelectorAll(".state-boundary")).forEach(p => {
      p.classList.remove("state-focused", "state-dimmed");
    });
    document.querySelectorAll(".area-boundary-shape").forEach(p => {
      p.classList.remove("area-focused", "area-dimmed", "selected");
    });
    document.querySelectorAll(".metro-bubble").forEach(c => {
      c.classList.remove("bubble-focused", "bubble-dimmed", "highlighted");
    });
    if (shouldZoom) {
      state.mapZoom = { scale: 1, x: 0, y: 0 };
      const zoomGroup = document.getElementById("mapZoomGroup");
      if (zoomGroup) {
        zoomGroup.setAttribute("transform", "translate(0, 0) scale(1)");
      }
    }
  }
  updateMapLegend();
  if (_refocused && state.activeJobPayload) renderMetroMap();
}

// -------------------------------------------------------------
// AREA DATA ENGINE
// -------------------------------------------------------------
function showDataNotice(message) {
  const notice = document.getElementById('dataNotice');
  notice.textContent = message;
  notice.hidden = !message;
}

async function loadArea(areaId, shouldZoom = true) {
  // Every selection invalidates earlier requests, including cache hits.
  const token = ++state._areaLoadToken;
  const commit = data => {
    if (token !== state._areaLoadToken) return;
    state.currentAreaId = areaId;
    state.areaData = data;
    const url = new URL(window.location);
    if (areaId === '99') url.searchParams.delete('area');
    else url.searchParams.set('area', areaId);
    window.history.replaceState({}, '', url);
    showDataNotice('');
    renderAll(shouldZoom);
  };
  if (state.areaCache.has(areaId)) { commit(state.areaCache.get(areaId)); return; }
  showDataNotice('Loading area data…');
  try {
    const res = await fetch(`${yb()}/areas/${encodeURIComponent(areaId)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (String(data.id) !== String(areaId) || !Array.isArray(data.occupations)) throw new Error('Invalid area data');
    state.areaCache.set(areaId, data);
    commit(data);
  } catch (err) {
    if (token !== state._areaLoadToken) return;
    showDataNotice('Area data could not be loaded. The previous area is still displayed; select an area to retry.');
    console.error(`Failed to load area ${areaId}:`, err);
  }
}

// Collapse bursts of renderAll() calls (rapid clicks) into one frame.
let _renderAllQueued = false;
let _renderAllZoom = false;
function renderAll(shouldZoom = false) {
  _renderAllZoom = _renderAllZoom || shouldZoom;
  if (_renderAllQueued) return;
  _renderAllQueued = true;
  requestAnimationFrame(() => {
    const zoom = _renderAllZoom;
    _renderAllQueued = false;
    _renderAllZoom = false;
    // Point the choropleth's focus/dim pass at the right state up front so the
    // map layer greys siblings itself — renderMetroShapeOverlay no longer walks
    // all ~510 area nodes a second time.
    syncFocusedStateForArea(state.currentAreaId);
    renderHeroAndKPIs();
    renderBrowseTable();
    // Commit the target zoom before the map renders so the bubble layer sizes
    // against the final scale. Otherwise the first click after a zoom draws
    // bubbles at the old (larger) scale until a later render corrects them.
    if (zoom) precommitAreaZoom(state.currentAreaId);
    if (state.activeJobPayload) renderMetroMap();
    renderMetroShapeOverlay(state.currentAreaId, zoom);
  });
}

function renderHeroAndKPIs() {
  const data = state.areaData;
  if (!data) return;

  const total = data.total || {};
  const isAllJobs = !state.activeMapSoc || state.activeMapSoc === "00-0000";
  const payload = state.activeJobPayload;

  // Find active occupation data if not all jobs
  let occEmp = null;
  let occMean = null;
  let occMedian = null;
  let occLq = null;
  let occTitle = "";
  let natJobEmp = null;
  let natJobMedian = null;
  let natJobMean = null;

  let occBackfill = {};        // { field: year } — figures pulled from an earlier release
  let occHourly = false;       // any figure is an hourly-derived annual estimate

  if (!isAllJobs) {
    let occRow = null;
    // 1. This area's own occupation row (richest: p10/p90/lq too)
    if (data.occupations) {
      occRow = data.occupations.find(r => r[0] === state.activeMapSoc) || null;
      if (occRow) {
        occTitle = occRow[1];
        occEmp = occRow[4];
        occMean = occRow[5];
        occMedian = occRow[6];
        occLq = occRow[11];
      }
    }
    // 2. The job payload (title, national figures, and this area's metro row)
    if (payload && payload.soc === state.activeMapSoc) {
      if (!occTitle) occTitle = payload.title;
      if (payload.nat) {
        natJobEmp = payload.nat.emp;
        natJobMedian = payload.nat.median;
        natJobMean = payload.nat.mean;
      }
      const cur = occAreaStats(payload, data.id);
      if (cur) {
        if (!(occEmp > 0)) occEmp = cur.emp;
        if (!(occMean > 0)) occMean = cur.mean;
        if (!(occMedian > 0)) occMedian = cur.median;
        if (occLq === null) occLq = cur.lq;
        if (cur.hourly) occHourly = true;
      }
    }
    // 3. Fill any remaining gap from the most recent earlier release.
    const resolved = resolveOccAreaFigures(state.activeMapSoc, data.id, {
      emp: occEmp, mean: occMean, median: occMedian, lq: occLq, hourly: occHourly
    });
    occEmp = resolved.emp; occMean = resolved.mean; occMedian = resolved.median;
    if (resolved.lq > 0) occLq = resolved.lq;
    occBackfill = resolved.backfill;
    occHourly = resolved.hourly;

    if (!occTitle && state.mapData && state.mapData.occupations) {
      const meta = state.mapData.occupations.find(o => o.soc === state.activeMapSoc);
      if (meta) occTitle = meta.title;
    }
    if (!occTitle) occTitle = "Selected Occupation";
  }

  // Update Page Title
  const cleanAreaTitle = formatAreaName(data.name);
  if (!isAllJobs) {
    document.title = `${occTitle} in ${cleanAreaTitle} · Wage Explorer · BLS OEWS ${state.year}`;
  } else {
    document.title = `${cleanAreaTitle} Wage Explorer · BLS OEWS ${state.year}`;
  }

  // Summary panel head: reads "Summary of <occupation> in <area>".
  const isSpecificArea = data.id !== "99";
  const kpiJobPill = document.getElementById("kpiJobPill");
  if (kpiJobPill) {
    kpiJobPill.textContent = occTitle;
    kpiJobPill.hidden = isAllJobs;
  }
  const kpiAreaPill = document.getElementById("kpiAreaPill");
  if (kpiAreaPill) {
    kpiAreaPill.textContent = cleanAreaTitle;
    kpiAreaPill.hidden = !isSpecificArea;
  }
  // Reads "Summary of <occupation | all occupations> in <area | all areas>"
  // whenever at least one is picked; just "Summary" + context line otherwise.
  const anySel = !isAllJobs || isSpecificArea;
  const setHidden = (id, hide) => { const el = document.getElementById(id); if (el) el.hidden = hide; };
  setHidden("kpiConnOf", !anySel);
  setHidden("kpiConnIn", !anySel);
  setHidden("kpiJobAll", !(anySel && isAllJobs));
  setHidden("kpiAreaAll", !(anySel && !isSpecificArea));
  const kpiContext = document.getElementById("kpiContext");
  if (kpiContext) {
    const scope = isAllJobs ? "All occupations" : occTitle;
    kpiContext.textContent = `${cleanAreaTitle}  ·  ${scope}`;
    kpiContext.hidden = anySel;
  }

  // Provenance flag in the Area Summary head. Three cases, most specific first:
  //  1. some figures are annualised from BLS hourly wages (actors, dancers…)
  //  2. some figures were filled from an earlier release (a hole this year)
  //  3. the whole occupation fell back to an earlier release
  const dataYearNote = document.getElementById("kpiDataYearNote");
  if (dataYearNote) {
    const backYears = Array.from(new Set(Object.values(occBackfill))).sort((a, b) => b - a);
    let text = "", tip = "";
    if (!isAllJobs && backYears.length) {
      const flds = Object.keys(occBackfill)
        .map(f => ({ emp: "employment", mean: "mean wage", median: "median wage", p25: "25th pct", p75: "75th pct", lq: "concentration" }[f] || f));
      text = `${backYears.join(" / ")} data`;
      tip = `BLS didn't publish ${flds.join(", ")} for ${occTitle} here in May ${state.year}. Those figures come from the most recent earlier release (${backYears.join(", ")}).`;
    } else if (!isAllJobs && state.jobDataYear && state.jobDataYear !== state.year) {
      text = `${state.jobDataYear} data · ${state.year} incomplete`;
      tip = `BLS has not published data for ${occTitle} in the May ${state.year} release. Showing the most recent year with data (${state.jobDataYear}).`;
    }
    dataYearNote.textContent = text;
    dataYearNote.title = tip;
    dataYearNote.hidden = !text;
  }

  // Hourly-wage disclosure, in plain readable text, inline in the Summary panel.
  const disclosure = document.getElementById("kpiDisclosure");
  if (disclosure) {
    if (!isAllJobs && occHourly) {
      disclosure.textContent =
        `BLS publishes only an hourly wage schedule for ${occTitle} — these workers don't ` +
        `typically work a standard full year. The annual figures above are those published ` +
        `hourly wages multiplied by 2,080 hours (40 hours a week for 52 weeks).`;
      disclosure.hidden = false;
    } else {
      disclosure.hidden = true;
    }
  }

  // Card header labels + "picked" highlight (search bars replaced the hero title).
  const hudTitleEl = document.getElementById("hudMetroTitle");
  if (hudTitleEl) hudTitleEl.textContent = cleanAreaTitle;
  const areaSelChipEl = document.getElementById("areaSelChip");
  if (areaSelChipEl) areaSelChipEl.classList.toggle("is-empty", data.id === "99");
  const browseHeadingEl = document.getElementById("browseCardHeading");
  if (browseHeadingEl) browseHeadingEl.textContent = isAllJobs ? "All occupations" : occTitle;
  const jobSelChipEl = document.getElementById("jobSelChip");
  if (jobSelChipEl) jobSelChipEl.classList.toggle("is-empty", isAllJobs);
  const areaInputEl = document.getElementById("areaSearchInput");
  if (areaInputEl && document.activeElement !== areaInputEl) {
    areaInputEl.value = "";
    areaInputEl.placeholder = data.id === "99" ? "Search state, metro area, or ZIP…" : "Change area…";
  }

  const statsJobTitle = document.getElementById("sidebarStatsJobTitle");
  if (statsJobTitle) {
    statsJobTitle.textContent = isAllJobs ? "All Occupations" : occTitle;
  }
  const sidebarJobTitle = document.getElementById("sidebarActiveJobTitle");
  if (sidebarJobTitle) {
    sidebarJobTitle.textContent = isAllJobs ? "All Occupations" : occTitle;
  }

  const shortOcc = (occTitle && occTitle.length > 28) ? occTitle.slice(0, 26) + "…" : occTitle;

  // -------------------------------------------------------------
  // KPI 1: Employment
  // -------------------------------------------------------------
  const kpiEmpLabel = document.getElementById("kpiEmpLabel");
  const kpiEmpVal = document.getElementById("kpiTotalEmp");
  const kpiEmpBadge = document.getElementById("kpiEmpShare");
  const kpiEmpFootnote = document.getElementById("kpiEmpFootnote");

  if (!isAllJobs) {
    if (kpiEmpLabel) {
      kpiEmpLabel.textContent = `${shortOcc} Employment`;
      kpiEmpLabel.title = `${occTitle} Employment`;
    }
    kpiEmpVal.textContent = (occEmp !== null && occEmp > 0) ? fmt.number(occEmp) : "N/A";

    if (occEmp && natJobEmp && natJobEmp > 0) {
      const shareOfUS = ((occEmp / natJobEmp) * 100).toFixed(1);
      kpiEmpBadge.textContent = data.id === "99" ? "100% of US" : `${shareOfUS}% of US Total`;
    } else if (occEmp && total.emp && total.emp > 0) {
      const shareOfArea = ((occEmp / total.emp) * 100).toFixed(2);
      kpiEmpBadge.textContent = `${shareOfArea}% of Area`;
    } else {
      kpiEmpBadge.textContent = "Unreported";
    }

    if (occEmp && occEmp > 0) {
      kpiEmpFootnote.textContent = natJobEmp ? `U.S. National: ${fmt.number(natJobEmp)} employed total` : `BLS OEWS occupation estimate`;
    } else {
      kpiEmpFootnote.textContent = `Employment estimate suppressed by BLS for ${data.name}`;
    }
  } else {
    if (kpiEmpLabel) kpiEmpLabel.textContent = "Total Employment";
    kpiEmpVal.textContent = fmt.number(total.emp);
    if (state.nationalTotals && state.nationalTotals.emp && total.emp) {
      const share = total.emp / state.nationalTotals.emp;
      kpiEmpBadge.textContent = data.id === "99" ? "100% US Workforce" : (share * 100).toFixed(2) + "% of US";
    } else {
      kpiEmpBadge.textContent = "Cross-industry";
    }
    kpiEmpFootnote.textContent = `${data.occupations ? data.occupations.length : 0} detailed occupations tracked`;
  }

  // -------------------------------------------------------------
  // KPI 2: Median Wage
  // -------------------------------------------------------------
  const kpiMedLabel = document.getElementById("kpiMedianLabel");
  const kpiMedVal = document.getElementById("kpiMedianWage");
  const kpiMedBadge = document.getElementById("kpiMedianDelta");
  const kpiMedFootnote = document.getElementById("kpiMedianFootnote");

  if (!isAllJobs) {
    if (kpiMedLabel) {
      kpiMedLabel.textContent = `${shortOcc} Median Wage`;
      kpiMedLabel.title = `${occTitle} Median Wage`;
    }
    if (occMedian !== null && occMedian > 0) {
      kpiMedVal.textContent = fmt.currency(occMedian);
      if (natJobMedian && data.id !== "99" && occMedian !== 239200 && natJobMedian !== 239200) {
        const diffPct = ((occMedian - natJobMedian) / natJobMedian) * 100;
        const sign = diffPct >= 0 ? "+" : "";
        kpiMedBadge.textContent = `${sign}${diffPct.toFixed(1)}% vs US`;
        kpiMedBadge.className = diffPct >= 0 ? "area-metric-chip pos" : "area-metric-chip neg";
      } else {
        kpiMedBadge.textContent = data.id === "99" ? "US Median" : "Local Benchmark";
        kpiMedBadge.className = "area-metric-chip";
      }
      if (kpiMedFootnote) {
        kpiMedFootnote.textContent = natJobMedian ? `U.S. Nat'l Median: ${fmt.currency(natJobMedian)}` : "50th percentile worker earnings";
      }
    } else {
      kpiMedVal.textContent = "N/A";
      kpiMedBadge.textContent = "Unreported";
      kpiMedBadge.className = "area-metric-chip";
      if (kpiMedFootnote) {
        kpiMedFootnote.textContent = natJobMedian ? `U.S. Nat'l Median: ${fmt.currency(natJobMedian)}` : "Annual wage suppressed by BLS";
      }
    }
  } else {
    if (kpiMedLabel) kpiMedLabel.textContent = "Annual Median Wage";
    kpiMedVal.textContent = fmt.currency(total.median);
    if (state.nationalTotals && state.nationalTotals.median && total.median && data.id !== "99" && total.median !== 239200 && state.nationalTotals.median !== 239200) {
      const diffPct = ((total.median - state.nationalTotals.median) / state.nationalTotals.median) * 100;
      const sign = diffPct >= 0 ? "+" : "";
      kpiMedBadge.textContent = `${sign}${diffPct.toFixed(1)}% vs US`;
      kpiMedBadge.className = diffPct >= 0 ? "area-metric-chip pos" : "area-metric-chip neg";
    } else {
      kpiMedBadge.textContent = "National Reference";
      kpiMedBadge.className = "area-metric-chip";
    }
    if (kpiMedFootnote) {
      kpiMedFootnote.textContent = "50th percentile worker earnings";
    }
  }

  // -------------------------------------------------------------
  // KPI 3: Mean Wage
  // -------------------------------------------------------------
  const kpiMeanLabel = document.getElementById("kpiMeanLabel");
  const kpiMeanVal = document.getElementById("kpiMeanWage");
  const kpiMeanBadge = document.getElementById("kpiMeanBadge");
  const kpiMeanFootnote = document.getElementById("kpiMeanFootnote");

  if (!isAllJobs) {
    if (kpiMeanLabel) {
      kpiMeanLabel.textContent = `${shortOcc} Mean Wage`;
      kpiMeanLabel.title = `${occTitle} Mean Wage`;
    }
    if (occMean !== null && occMean > 0) {
      kpiMeanVal.textContent = fmt.currency(occMean);
      if (kpiMeanBadge) {
        if (natJobMean && data.id !== "99" && occMean !== 239200 && natJobMean !== 239200) {
          const diffPct = ((occMean - natJobMean) / natJobMean) * 100;
          const sign = diffPct >= 0 ? "+" : "";
          kpiMeanBadge.textContent = `${sign}${diffPct.toFixed(1)}% vs US Mean`;
          kpiMeanBadge.className = diffPct >= 0 ? "area-metric-chip pos" : "area-metric-chip neg";
        } else {
          kpiMeanBadge.textContent = "Occupation Mean";
          kpiMeanBadge.className = "area-metric-chip";
        }
      }
      if (kpiMeanFootnote) {
        kpiMeanFootnote.textContent = natJobMean ? `U.S. Nat'l Mean: ${fmt.currency(natJobMean)}` : "Average annual compensation";
      }
    } else {
      kpiMeanVal.textContent = "N/A";
      if (kpiMeanBadge) {
        kpiMeanBadge.textContent = "Unreported";
        kpiMeanBadge.className = "area-metric-chip";
      }
      if (kpiMeanFootnote) {
        kpiMeanFootnote.textContent = natJobMean ? `U.S. Nat'l Mean: ${fmt.currency(natJobMean)}` : "Annual rate suppressed by BLS";
      }
    }
  } else {
    if (kpiMeanLabel) kpiMeanLabel.textContent = "Annual Mean Wage";
    kpiMeanVal.textContent = fmt.currency(total.mean);
    if (kpiMeanBadge) {
      kpiMeanBadge.textContent = "All Occupations";
      kpiMeanBadge.className = "area-metric-chip";
    }
    if (kpiMeanFootnote) {
      kpiMeanFootnote.textContent = "Average annual compensation";
    }
  }

  // -------------------------------------------------------------
  // KPI 4: Concentration / Density
  // -------------------------------------------------------------
  const kpiLqLabel = document.getElementById("kpiTopLqLabel");
  const kpiLqVal = document.getElementById("kpiTopLqSector");
  const kpiLqBadge = document.getElementById("kpiTopLqBadge");
  const kpiLqFootnote = document.getElementById("kpiTopLqFootnote");

  if (!isAllJobs) {
    if (kpiLqLabel) {
      kpiLqLabel.textContent = `${shortOcc} Density`;
      kpiLqLabel.title = `${occTitle} Density`;
    }
    if (data.id === "99") {
      kpiLqVal.textContent = "1.00× National Baseline";
      kpiLqBadge.textContent = "1.00× Baseline";
      kpiLqBadge.className = "area-metric-chip";
      kpiLqFootnote.textContent = "National benchmark density (1.00×)";
    } else if (occLq !== null && occLq > 0) {
      kpiLqVal.textContent = `${occLq.toFixed(2)}× Density`;
      if (occLq >= 1.25) {
        kpiLqBadge.textContent = "High Concentration";
        kpiLqBadge.className = "area-metric-chip pos";
      } else if (occLq < 0.8) {
        kpiLqBadge.textContent = "Below Average";
        kpiLqBadge.className = "area-metric-chip neg";
      } else {
        kpiLqBadge.textContent = "Average Density";
        kpiLqBadge.className = "area-metric-chip";
      }
      if (occLq > 1.0) {
        kpiLqFootnote.textContent = `${((occLq - 1) * 100).toFixed(0)}% more concentrated than U.S. average`;
      } else {
        kpiLqFootnote.textContent = `${((1 - occLq) * 100).toFixed(0)}% less concentrated than U.S. average`;
      }
    } else {
      kpiLqVal.textContent = "N/A";
      kpiLqBadge.textContent = "Unreported";
      kpiLqBadge.className = "area-metric-chip";
      kpiLqFootnote.textContent = `Concentration below BLS reporting threshold in ${data.name}`;
    }
  } else {
    if (kpiLqLabel) kpiLqLabel.textContent = "Top Sector Concentration";
    const topLqSector = findTopConcentrationSector(data);
    if (topLqSector) {
      kpiLqVal.textContent = topLqSector.title;
      if (topLqSector.isBaseline || data.id === "99") {
        kpiLqBadge.textContent = "1.00× Baseline";
        kpiLqBadge.className = "area-metric-chip";
        kpiLqFootnote.textContent = "Balanced national baseline";
      } else {
        kpiLqBadge.textContent = `${topLqSector.lq.toFixed(2)}× Density`;
        kpiLqBadge.className = topLqSector.lq >= 1.25 ? "area-metric-chip pos" : "area-metric-chip";
        const shareStr = topLqSector.areaShare ? ` (${fmt.pct(topLqSector.areaShare)} of workforce)` : "";
        kpiLqFootnote.textContent = `${fmt.number(topLqSector.emp)} employed${shareStr}`;
      }
    } else {
      kpiLqVal.textContent = "Cross-Industry";
      kpiLqBadge.textContent = "1.00×";
      kpiLqBadge.className = "area-metric-chip";
      kpiLqFootnote.textContent = "Balanced national baseline";
    }
  }
}

function findTopConcentrationSector(data) {
  if (!data.majors || data.majors.length === 0) return null;
  const areaEmp = (data.total && data.total.emp) ? data.total.emp : 0;

  if (!areaEmp || !state.nationalMajorShares || data.id === "99") {
    const sorted = [...data.majors].filter(m => m.emp > 0).sort((a, b) => b.emp - a.emp);
    return sorted[0] ? { ...sorted[0], lq: 1.0, isBaseline: true } : null;
  }

  const specialized = [];
  data.majors.forEach(m => {
    if (m.emp && m.emp > 0 && state.nationalMajorShares[m.soc]) {
      const areaShare = m.emp / areaEmp;
      const natShare = state.nationalMajorShares[m.soc];
      const lq = areaShare / (natShare || 1);
      specialized.push({ ...m, lq, areaShare, natShare });
    }
  });

  if (specialized.length === 0) {
    const sorted = [...data.majors].filter(m => m.emp > 0).sort((a, b) => b.emp - a.emp);
    return sorted[0] ? { ...sorted[0], lq: 1.0, isBaseline: true } : null;
  }

  specialized.sort((a, b) => b.lq - a.lq);
  return specialized[0];
}

function populateAreaDropdown() {
  const dropdown = document.getElementById("areaDropdown");
  dropdown.innerHTML = "";

  const groups = {
    national: { title: "National Benchmark", items: [] },
    state: { title: "U.S. States & Territories", items: [] },
    msa: { title: "Metropolitan Statistical Areas (MSAs)", items: [] },
    nonmetro: { title: "Non-Metropolitan Balance Areas", items: [] }
  };

  state.manifest.forEach(a => {
    if (a.type === "territory") {
      groups.state.items.push(a);
    } else if (groups[a.type]) {
      groups[a.type].items.push(a);
    }
  });

  Object.keys(groups).forEach(key => {
    const grp = groups[key];
    if (grp.items.length === 0) return;

    const groupHeader = document.createElement("div");
    groupHeader.className = "area-optgroup-title";
    groupHeader.textContent = grp.title;
    dropdown.appendChild(groupHeader);

    grp.items.forEach(item => {
      const opt = document.createElement("div");
      opt.className = "area-option";
      opt.dataset.id = item.id;
      opt.dataset.name = item.name.toLowerCase();
      opt.dataset.state = (item.state || "").toLowerCase();

      opt.innerHTML = `
        <span class="area-opt-name">${formatAreaName(item.name)}</span>
        <span class="area-opt-meta">${fmt.compact(item.emp)} jobs</span>
      `;

      opt.addEventListener("click", () => {
        loadArea(item.id, true);
        closeAreaDropdown();
      });

      dropdown.appendChild(opt);
    });
  });
}

function setupDropdowns() {
  const input = document.getElementById("areaSearchInput");
  const dropdown = document.getElementById("areaDropdown");
  const clearBtn = document.getElementById("areaSearchClear");

  input.addEventListener("focus", () => {
    filterAreaDropdown(input.value);
    dropdown.classList.add("open");
  });

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? "block" : "none";
    filterAreaDropdown(q);
    dropdown.classList.add("open");
  });

  input.addEventListener("keydown", (e) => {
    const visibleOptions = Array.from(document.querySelectorAll("#areaDropdown .area-option")).filter(o => o.style.display !== "none");
    if (!visibleOptions.length) return;

    let highlighted = document.querySelector("#areaDropdown .area-option.highlighted");
    let idx = visibleOptions.indexOf(highlighted);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!dropdown.classList.contains("open")) {
        dropdown.classList.add("open");
        return;
      }
      if (highlighted) highlighted.classList.remove("highlighted");
      idx = (idx + 1) % visibleOptions.length;
      visibleOptions[idx].classList.add("highlighted");
      visibleOptions[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (highlighted) highlighted.classList.remove("highlighted");
      idx = (idx - 1 + visibleOptions.length) % visibleOptions.length;
      visibleOptions[idx].classList.add("highlighted");
      visibleOptions[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = highlighted || visibleOptions[0];
      if (pick && pick.dataset.id) {
        loadArea(pick.dataset.id, true);
        closeAreaDropdown();
        return;
      }
      if (highlighted) {
        loadArea(highlighted.dataset.id, true);
        closeAreaDropdown();
      } else if (visibleOptions.length > 0) {
        loadArea(visibleOptions[0].dataset.id, true);
        closeAreaDropdown();
      }
    } else if (e.key === "Escape") {
      closeAreaDropdown();
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    filterAreaDropdown("");
    input.focus();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#areaPickerWrap")) {
      closeAreaDropdown();
    }
  });

  // Populate the Major Sector filter
  const browseGf = document.getElementById("browseGroupFilter");
  if (browseGf) GROUPS.forEach((name, idx) => browseGf.add(new Option(name, idx)));
}

// Resolve a free-text query to specific areas via ZIP, place name, or county.
// Returns [{ id, label, hint }] suggestions to surface above the plain list.
function resolveAreaQuery(rawQuery) {
  const q = (rawQuery || "").toLowerCase().trim();
  if (!q) return [];
  const out = [];
  const seen = new Set();
  const add = (id, hint) => {
    if (!id || seen.has(id)) return;
    const a = state.manifest && state.manifest.find(x => x.id === id);
    if (!a) return;
    seen.add(id);
    out.push({ id, label: formatAreaName(a.name), hint });
  };

  // ZIP / numeric
  if (/^\d{2,5}$/.test(q) && state.zipToArea && state.zipToArea[q]) {
    add(state.zipToArea[q], `ZIP ${q}`);
  }

  // Place name (exact, then prefix, then one-typo) against the city index
  if (state.placeIndex && q.length >= 3 && !/^\d/.test(q)) {
    const key = q.replace(/[^a-z0-9]+/g, "");
    let keys = [];
    if (state.placeIndex[key]) {
      keys = [key];
    } else {
      const cand = Object.keys(state.placeIndex);
      keys = cand.filter(k => k.startsWith(key)).slice(0, 6);
      if (keys.length === 0 && key.length >= 5) {
        keys = cand.filter(k => Math.abs(k.length - key.length) <= 1 && editDistance(k, key, 1) <= 1).slice(0, 4);
      }
    }
    for (const k of keys) {
      for (const [areaId, st] of state.placeIndex[k]) {
        const pretty = k.charAt(0).toUpperCase() + k.slice(1);
        add(areaId, `${pretty}, ${st}`);
      }
    }
  }

  return out.slice(0, 6);
}

function filterAreaDropdown(query) {
  const q = (query || "").toLowerCase().trim();
  const dropdown = document.getElementById("areaDropdown");
  const options = document.querySelectorAll("#areaDropdown .area-option:not(.area-suggestion)");
  const headers = document.querySelectorAll("#areaDropdown .area-optgroup-title");

  // Suggestion banners (ZIP / place / county) rendered above the plain list.
  let sugWrap = document.getElementById("areaDropdownSuggest");
  if (!sugWrap) {
    sugWrap = document.createElement("div");
    sugWrap.id = "areaDropdownSuggest";
    dropdown.prepend(sugWrap);
  }
  const suggestions = resolveAreaQuery(q);
  sugWrap.innerHTML = "";
  suggestions.forEach(s => {
    const el = document.createElement("div");
    el.className = "area-option area-suggestion";
    el.dataset.id = s.id;
    el.innerHTML = `
      <span class="area-opt-name" style="font-weight:600; color:var(--text-accent);">${s.hint} · ${s.label}</span>
      <span class="area-opt-meta" style="color:var(--text-muted);">Go to area</span>
    `;
    el.addEventListener("click", () => { loadArea(s.id, true); closeAreaDropdown(); });
    sugWrap.appendChild(el);
  });
  sugWrap.style.display = suggestions.length ? "block" : "none";

  const qTokens = normSearch(q).split(" ").filter(Boolean);
  options.forEach(opt => {
    const name = opt.dataset.name || "";
    const st = opt.dataset.state || "";
    let countyMatch = false;
    let matchingCountyName = "";

    if (q && state.metroShapes && state.metroShapes[opt.dataset.id]) {
      const counties = state.metroShapes[opt.dataset.id].counties;
      if (counties) {
        const found = counties.find(c => c.name.toLowerCase().includes(q));
        if (found) {
          countyMatch = true;
          matchingCountyName = found.name;
        }
      }
    }

    // typo-tolerant name match: every query token prefixes / is close to a name token
    const nameTokens = normSearch(name).split(" ").filter(Boolean);
    const fuzzyName = qTokens.length > 0 &&
      qTokens.every(qt => nameTokens.some(nt => nt.startsWith(qt) || (qt.length >= 4 && editDistance(qt, nt, 1) <= 1)));

    const matches = !q || name.includes(q) || st === q || countyMatch || fuzzyName;
    opt.style.display = matches ? "flex" : "none";

    let countyHint = opt.querySelector(".area-opt-county-hint");
    if (q && countyMatch && !name.includes(q)) {
      if (!countyHint) {
        countyHint = document.createElement("span");
        countyHint.className = "area-opt-county-hint";
        opt.appendChild(countyHint);
      }
      countyHint.textContent = `Includes ${matchingCountyName}`;
      countyHint.style.display = "inline-block";
    } else if (countyHint) {
      countyHint.style.display = "none";
    }
  });

  headers.forEach(h => {
    let next = h.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains("area-optgroup-title")) {
      if (next.style.display !== "none") {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    h.style.display = hasVisible ? "block" : "none";
  });
}

function closeAreaDropdown() {
  document.getElementById("areaDropdown").classList.remove("open");
}

// -------------------------------------------------------------
// BROWSE TABLE + OCCUPATION AREA DRILLDOWN
// -------------------------------------------------------------
// Set the first column's header text ("Sector" for the sectors overview,
// "Occupation Title" otherwise).
function setBrowseTitleHeader(text) {
  const th = document.querySelector('#occupationsTable th[data-col="title"]');
  if (th) th.textContent = text;
}

// The browse table opens on the 22 major sectors. Pick one (row click or the
// Sectors dropdown) to see its occupations; a search cuts across everything.
function renderSectorsList(data) {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  setBrowseTitleHeader("Sector");

  const majBy = {};
  (data.majors || []).forEach(m => {
    const gi = MAJOR_SOCS.indexOf(m.soc);
    if (gi >= 0) majBy[gi] = m;
  });
  const empByGrp = {};
  (data.occupations || []).forEach(r => {
    empByGrp[r[2]] = (empByGrp[r[2]] || 0) + (r[4] || 0);
  });
  const areaEmp = (data.total && data.total.emp) || 0;
  const useMean = wageMetric().v === "mean";

  const rows = GROUPS.map((name, gi) => {
    const m = majBy[gi];
    const emp = m ? m.emp : (empByGrp[gi] || 0);
    const wage = m ? (useMean ? m.mean : m.median) : null;
    let lq = null;
    if (m && areaEmp && data.id !== "99" &&
        state.nationalMajorShares && state.nationalMajorShares[m.soc]) {
      lq = (m.emp / areaEmp) / (state.nationalMajorShares[m.soc] || 1);
    }
    return { gi, name, emp, wage, lq };
  }).filter(r => r.emp > 0);

  const { col, asc } = state.tableSort;
  rows.sort((a, b) => {
    if (col === "title") return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const key = col === "emp" ? "emp" : (col === "lq" ? "lq" : "wage");
    return asc ? (a[key] || 0) - (b[key] || 0) : (b[key] || 0) - (a[key] || 0);
  });

  const frag = document.createDocumentFragment();
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.title = `View ${r.name} occupations`;
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-primary);">
        <span style="color: var(--accent-cyan); margin-right: 4px;">›</span>${r.name}
      </td>
      <td style="text-align: right;" class="tabular">${fmt.number(r.emp)}</td>
      <td style="text-align: right; font-weight: 600; color: var(--text-primary);" class="tabular">${r.wage ? fmt.currency(r.wage) : "—"}</td>
      <td style="text-align: right;"><span class="badge-density ${r.lq && r.lq >= 1.25 ? 'high' : ''}">${r.lq ? fmt.lq(r.lq) : "—"}</span></td>
    `;
    tr.addEventListener("click", () => {
      const sel = document.getElementById("browseGroupFilter");
      if (sel) sel.value = String(r.gi);
      state.tableSort = { col: "wage", asc: false };
      renderBrowseTable();
      const sc = document.getElementById("browseTableResponsive");
      if (sc) sc.scrollTop = 0;
    });
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
  updateTableSortHeaders();
}

function renderBrowseTable() {
  const data = state.areaData;
  if (!data || !data.occupations) return;

  // If currently viewing drilldown for a clicked occupation, keep drilldown active
  if (state.drilldownSoc) {
    renderOccupationAreasTable();
    return;
  }

  const jobSearchEl = document.getElementById("mapJobSearchInput");
  const q = (jobSearchEl ? jobSearchEl.value : "").toLowerCase().trim();
  const eduF = parseInt(document.getElementById("browseEduFilter").value);
  const grpF = parseInt(document.getElementById("browseGroupFilter").value);

  // No sector picked and nothing searched -> the sectors overview.
  if (!q && grpF === -1) {
    renderSectorsList(data);
    return;
  }
  setBrowseTitleHeader("Occupation Title");

  let filtered = data.occupations.filter(row => {
    const [soc, title, grpIdx, eduLvl] = row;
    if (q && scoreOccupation(title, soc, q) <= 0) return false;
    if (eduF !== -1 && eduLvl !== eduF) return false;
    if (grpF !== -1 && grpIdx !== grpF) return false;
    return true;
  });

  const { col, asc } = state.tableSort;
  const wIdx = wageMetric().occIdx;
  filtered.sort((a, b) => {
    let vA, vB;
    switch (col) {
      case "title": vA = a[1]; vB = b[1]; return asc ? vA.localeCompare(vB) : vB.localeCompare(vA);
      case "emp": vA = a[4] || 0; vB = b[4] || 0; break;
      case "lq": vA = a[11] || 0; vB = b[11] || 0; break;
      case "wage": vA = a[wIdx] || 0; vB = b[wIdx] || 0; break;
      default: vA = a[wIdx] || 0; vB = b[wIdx] || 0;
    }
    return asc ? vA - vB : vB - vA;
  });

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  const fragment = document.createDocumentFragment();

  // Inside a sector: a row to step back up to the sectors overview.
  if (grpF !== -1) {
    const back = document.createElement("tr");
    back.className = "clickable-row";
    back.innerHTML = `<td colspan="4" style="color: var(--accent-cyan); font-weight: 600; background: var(--bg-elevated);">‹ All sectors<span style="color: var(--text-muted); font-weight: 400;">  ·  ${GROUPS[grpF] || ""}</span></td>`;
    back.addEventListener("click", () => {
      const sel = document.getElementById("browseGroupFilter");
      if (sel) sel.value = "-1";
      state.tableSort = { col: "wage", asc: false };
      renderBrowseTable();
      const sc = document.getElementById("browseTableResponsive");
      if (sc) sc.scrollTop = 0;
    });
    fragment.appendChild(back);
  }

  const wIdx2 = wageMetric().occIdx;
  filtered.slice(0, 300).forEach(row => {
    const [soc, title, grpIdx, eduLvl, emp, mean, median, p10, p25, p75, p90, lq] = row;
    const wageVal = row[wIdx2];

    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.title = `Click to view regional area breakdown for ${title}`;
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-primary); max-width: 280px; overflow: hidden; text-overflow: ellipsis;">
        <span style="color: var(--accent-cyan); margin-right: 4px;">›</span>${title}
      </td>
      <td style="text-align: right;" class="tabular">${fmt.number(emp)}</td>
      <td style="text-align: right; font-weight: 600; color: var(--text-primary);" class="tabular">${fmt.currency(wageVal)}</td>
      <td style="text-align: right;">
        <span class="badge-density ${lq && lq >= 1.25 ? 'high' : ''}">
          ${fmt.lq(lq)}
        </span>
      </td>
    `;

    tr.addEventListener("click", () => {
      openOccupationAreaBreakdown(soc, title);
    });

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  updateTableSortHeaders();
}

function updateTableSortHeaders() {
  const { col, asc } = state.tableSort;
  document.querySelectorAll("#occupationsTable th[data-col]").forEach(th => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.col === col) {
      th.classList.add(asc ? "sorted-asc" : "sorted-desc");
    }
  });
}

function populateDrilldownRegionFilter() {
  const sel = document.getElementById("drilldownRegionFilter");
  const payload = state.activeJobPayload;
  if (!sel || !payload || !payload.metros) return;

  const stateMetaByCode = {};
  (state.mapData && state.mapData.metros ? state.mapData.metros : []).forEach(m => {
    if (m.state) stateMetaByCode[m.id] = m.state;
  });

  const codeToName = {};
  Object.values(state.statesById || {}).forEach(s => {
    if (s && s.state && s.name) codeToName[s.state] = s.name;
  });

  const present = new Set();
  Object.keys(payload.metros).forEach(areaId => {
    const code = stateMetaByCode[areaId];
    if (code) present.add(code);
  });

  const options = Array.from(present)
    .map(code => ({ code, name: codeToName[code] || code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  sel.innerHTML = '<option value="ALL">All Regions</option>' +
    options.map(o => `<option value="${o.code}">${o.name}</option>`).join("");
  sel.value = "ALL";
}

function closeOccupationAreaBreakdown() {
  state.drilldownSoc = null;
  state.drilldownTitle = "";
  state.drilldownRegion = "ALL";

  document.getElementById("browseDrilldownBar").style.display = "none";
  document.getElementById("occupationAreasTable").style.display = "none";

  document.getElementById("browseControlBar").style.display = "flex";
  document.getElementById("occupationsTable").style.display = "";

  renderBrowseTable();
}

function renderOccupationAreasTable() {
  if (!state.drilldownSoc || !state.activeJobPayload) return;

  const payload = state.activeJobPayload;
  const metrosMap = (state.mapData && state.mapData.metros) ? state.mapData.metros : [];
  const metroNamesById = {};
  const metroStateById = {};
  metrosMap.forEach(m => {
    metroNamesById[m.id] = m.name;
    if (m.state) metroStateById[m.id] = m.state;
  });

  const regionFilter = state.drilldownRegion && state.drilldownRegion !== "ALL" ? state.drilldownRegion : null;

  const rows = [];
  if (payload.metros) {
    Object.keys(payload.metros).forEach(areaId => {
      if (regionFilter && metroStateById[areaId] !== regionFilter) return;
      const stats = payload.metros[areaId]; // [emp, mean, median, p25, p75, lq]
      const rawName = metroNamesById[areaId] || (state.manifest ? (state.manifest.find(a => a.id === areaId)?.name) : areaId) || `Area ${areaId}`;
      const name = formatAreaName(rawName);

      rows.push({
        id: areaId,
        name: name,
        emp: stats[0] || 0,
        mean: stats[1] || 0,
        median: stats[2] || 0,
        p25: stats[3] || 0,
        p75: stats[4] || 0,
        lq: stats[5] || 0
      });
    });
  }

  const wKey = wageMetric().v === "mean" ? "mean"
             : wageMetric().v === "p25" ? "p25"
             : wageMetric().v === "p75" ? "p75" : "median";
  const { col, asc } = state.areaTableSort;
  rows.sort((a, b) => {
    let vA, vB;
    switch (col) {
      case "name": vA = a.name; vB = b.name; return asc ? vA.localeCompare(vB) : vB.localeCompare(vA);
      case "emp": vA = a.emp; vB = b.emp; break;
      case "lq": vA = a.lq; vB = b.lq; break;
      case "wage": vA = a[wKey]; vB = b[wKey]; break;
      default: vA = a[wKey]; vB = b[wKey];
    }
    return asc ? vA - vB : vB - vA;
  });


  const tbody = document.getElementById("occupationAreasTableBody");
  tbody.innerHTML = "";
  const fragment = document.createDocumentFragment();

  rows.forEach(r => {
    const isSelected = r.id === state.currentAreaId;
    const tr = document.createElement("tr");
    tr.className = `clickable-row ${isSelected ? 'active-area-row' : ''}`;
    tr.dataset.id = r.id;
    tr.title = `Click to select ${r.name} on the map`;

    tr.innerHTML = `
      <td style="font-weight: 500; color: ${isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)'}; max-width: 250px; overflow: hidden; text-overflow: ellipsis;">
        ${r.name}
      </td>
      <td style="text-align: right;" class="tabular">${fmt.number(r.emp)}</td>
      <td style="text-align: right; font-weight: 600; color: var(--text-primary);" class="tabular">${fmt.currency(r[wKey])}</td>
      <td style="text-align: right;">
        <span class="badge-density ${r.lq >= 1.25 ? 'high' : ''}">
          ${fmt.lq(r.lq)}
        </span>
      </td>
    `;

    tr.addEventListener("click", () => {
      loadArea(r.id, true);
      document.querySelectorAll("#occupationAreasTableBody tr").forEach(rowEl => {
        rowEl.classList.toggle("active-area-row", rowEl.dataset.id === r.id);
      });
    });

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);

  // Update sort headers for occupationAreasTable
  document.querySelectorAll("#occupationAreasTable th[data-col]").forEach(th => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.col === col) {
      th.classList.add(asc ? "sorted-asc" : "sorted-desc");
    }
  });
}


async function openOccupationAreaBreakdown(soc, title) {
  state.drilldownSoc = soc;
  state.drilldownTitle = title;

  // Sync with global Map job
  if (state.activeMapSoc !== soc) {
    await loadMapJob(soc);
  }

  // Switch display from Table A to Table B
  document.getElementById("occupationsTable").style.display = "none";
  document.getElementById("browseControlBar").style.display = "none";

  const drilldownBar = document.getElementById("browseDrilldownBar");
  drilldownBar.style.display = "flex";
  document.getElementById("browseDrilldownTitle").textContent = title;

  state.drilldownRegion = "ALL";
  populateDrilldownRegionFilter();

  const ddWage = document.getElementById("drilldownWageMetric");
  if (ddWage) ddWage.value = state.browseWageMetric;
  syncWageColHeaders();

  const tableAreas = document.getElementById("occupationAreasTable");
  tableAreas.style.display = "";

  renderOccupationAreasTable();
}

// On entry (touch devices), trace a thin line once around each search field.
function introTraceSearchBars() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Touch only — a hint for phones where the two fields aren't as obvious.
    if (!window.matchMedia("(pointer: coarse)").matches) return;
  } catch (e) { return; }
  ["areaPickerWrap", "jobPickerWrap"].forEach((id, i) => {
    const box = document.getElementById(id) && document.getElementById(id).querySelector(".combobox-input-box");
    if (!box) return;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "field-trace");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", "1"); rect.setAttribute("y", "1");
    rect.setAttribute("width", "98"); rect.setAttribute("height", "98");
    rect.setAttribute("rx", "6"); rect.setAttribute("pathLength", "100");
    svg.appendChild(rect);
    box.appendChild(svg);
    requestAnimationFrame(() => {
      svg.style.animationDelay = (i * 100) + "ms";
      rect.style.animationDelay = (i * 100) + "ms";
      svg.classList.add("run");
    });
    setTimeout(() => svg.remove(), 1400 + i * 100);
  });
}

function setupEventListeners() {
  // Selection chips — clear the active area / occupation.
  const areaChipX = document.getElementById("areaSelChipClear");
  if (areaChipX) areaChipX.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof resetMapZoom === "function") resetMapZoom();
    else loadArea("99", false);
  });
  const jobChipX = document.getElementById("jobSelChipClear");
  if (jobChipX) jobChipX.addEventListener("click", (e) => {
    e.stopPropagation();
    const ji = document.getElementById("mapJobSearchInput");
    if (ji) ji.value = "";
    const jc = document.getElementById("mapJobClear");
    if (jc) jc.style.display = "none";
    if (state.drilldownSoc) closeOccupationAreaBreakdown();
    loadMapJob("00-0000");
    renderBrowseTable();
  });

  // Browse Filters (the occupation text search now lives in #mapJobSearchInput,
  // wired in setupMapControls).
  document.getElementById("browseEduFilter").addEventListener("change", renderBrowseTable);
  document.getElementById("browseGroupFilter").addEventListener("change", renderBrowseTable);

  // Wage metric selector — two copies (filter bar + occupation drilldown bar)
  // kept in sync. Swaps which wage the single Wage column shows.
  const wageSels = ["browseWageMetric", "drilldownWageMetric"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  wageSels.forEach(sel => {
    sel.value = state.browseWageMetric;
    sel.addEventListener("change", () => {
      state.browseWageMetric = sel.value;
      wageSels.forEach(s => { if (s !== sel) s.value = sel.value; });
      syncWageColHeaders();
      if (state.drilldownSoc) renderOccupationAreasTable();
      else renderBrowseTable();
    });
  });
  syncWageColHeaders();

  // Browse Table Sort Headers
  document.querySelectorAll("#occupationsTable th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (state.tableSort.col === col) {
        state.tableSort.asc = !state.tableSort.asc;
      } else {
        state.tableSort.col = col;
        state.tableSort.asc = (col === "title");
      }
      updateTableSortHeaders();
      renderBrowseTable();
    });
  });

  // Area Breakdown Table Sort Headers
  document.querySelectorAll("#occupationAreasTable th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (state.areaTableSort.col === col) {
        state.areaTableSort.asc = !state.areaTableSort.asc;
      } else {
        state.areaTableSort.col = col;
        state.areaTableSort.asc = (col === "name");
      }
      renderOccupationAreasTable();
    });
  });

  // Back Button from Occupation Area Breakdown
  const backBtn = document.getElementById("browseDrilldownBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", closeOccupationAreaBreakdown);
  }

  // Region scope filter inside the occupation drilldown
  const drilldownRegion = document.getElementById("drilldownRegionFilter");
  if (drilldownRegion) {
    drilldownRegion.addEventListener("change", () => {
      state.drilldownRegion = drilldownRegion.value || "ALL";
      renderOccupationAreasTable();
    });
  }

  // The ⟲ button in the map's zoom stack is map-scoped: deselect the area,
  // drop the state focus, and zoom back out to the national view. It leaves
  // the chosen occupation and the browse filters alone.
  const resetBtn = document.getElementById("mapResetBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (typeof resetMapZoom === "function") resetMapZoom();
    else loadArea("99", false);
  });
}

function setupTheme() {
  let saved;
  try { saved = localStorage.getItem("bls-theme"); } catch {}
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldBeDark = saved ? (saved === "dark") : prefersDark;

  applyTheme(shouldBeDark);

  const toggleBtn = document.getElementById("themeToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isCurrentlyDark = document.documentElement.getAttribute("data-theme") !== "light";
      applyTheme(!isCurrentlyDark);
    });
  }
}

function applyTheme(isDark) {
  const sunIcon = document.getElementById("themeIconSun");
  const moonIcon = document.getElementById("themeIconMoon");
  const label = document.getElementById("themeLabel");

  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    if (label) label.textContent = "Light Mode";
    try { localStorage.setItem("bls-theme", "dark"); } catch {}
    if (sunIcon) sunIcon.style.display = "";
    if (moonIcon) moonIcon.style.display = "none";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    if (label) label.textContent = "Dark Mode";
    try { localStorage.setItem("bls-theme", "light"); } catch {}
    if (sunIcon) sunIcon.style.display = "none";
    if (moonIcon) moonIcon.style.display = "";
  }
  if (typeof renderMetroMap === "function" && state && state.activeJobPayload) {
    renderMetroMap();
  }
}
// Tooltip positioning & handlers
const tooltip = document.getElementById("chartTooltip");

function moveTooltip(e) {
  const pad = 10;
  const cx = e.clientX != null ? e.clientX : 0;
  const cy = e.clientY != null ? e.clientY : 0;
  const tw = tooltip.offsetWidth || 300;
  const th = tooltip.offsetHeight || 200;
  let x = cx + 16;
  let y = cy + 16;
  // Flip to the other side / clamp so the card never spills off any edge.
  if (x + tw + pad > window.innerWidth) x = cx - tw - 16;
  if (x < pad) x = pad;
  if (y + th + pad > window.innerHeight) y = window.innerHeight - th - pad;
  if (y < pad) y = pad;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideTooltip() {
  tooltip.style.display = "none";
}

window.addEventListener("DOMContentLoaded", init);

// SOC Major Occupational Groups
const GROUPS = [
  "Management",
  "Business & Financial",
  "Computer & Math",
  "Architecture & Eng",
  "Life & Social Science",
  "Community & Social Svc",
  "Legal",
  "Education & Library",
  "Arts, Design & Media",
  "Healthcare Practitioners",
  "Healthcare Support",
  "Protective Service",
  "Food Prep & Serving",
  "Building & Grounds",
  "Personal Care & Svc",
  "Sales",
  "Office & Admin Support",
  "Farming & Fishing",
  "Construction & Extraction",
  "Installation & Repair",
  "Production",
  "Transportation & Moving"
];

// Major SOC group codes, index-aligned with GROUPS and with the per-occupation
// group index stored in data.occupations[i][2].
const MAJOR_SOCS = [
  "11-0000", "13-0000", "15-0000", "17-0000", "19-0000", "21-0000", "23-0000",
  "25-0000", "27-0000", "29-0000", "31-0000", "33-0000", "35-0000", "37-0000",
  "39-0000", "41-0000", "43-0000", "45-0000", "47-0000", "49-0000", "51-0000",
  "53-0000"
];

// Wage metrics offered in the browse tables' single wage column — same set the
// map's metric control uses. `occIdx` indexes an occupations-table row
// [soc,title,grp,edu,emp,mean,median,p10,p25,p75,p90,lq]; `areaIdx` indexes a
// drilldown row [emp,mean,median,p25,p75,lq].
const WAGE_METRIC_OPTIONS = [
  { v: "median", label: "Typical Wage (Median)", occIdx: 6, areaIdx: 2 },
  { v: "mean",   label: "Average Wage (Mean)",   occIdx: 5, areaIdx: 1 },
  { v: "p25",    label: "Lower Range (P25)",     occIdx: 8, areaIdx: 3 },
  { v: "p75",    label: "Upper Range (P75)",     occIdx: 9, areaIdx: 4 }
];
function wageMetric() {
  return WAGE_METRIC_OPTIONS.find(o => o.v === state.browseWageMetric) || WAGE_METRIC_OPTIONS[0];
}
function syncWageColHeaders() {
  const label = wageMetric().label;
  const a = document.getElementById("occWageColHeader");
  const b = document.getElementById("areaWageColHeader");
  if (a) a.textContent = label;
  if (b) b.textContent = label;
}

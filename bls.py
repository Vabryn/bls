python3 << 'PYEOF'
html = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bay Area Wage Explorer</title>
<meta name="description" content="Interactive explorer for BLS Occupational Employment and Wage Statistics — SF Bay Area. Browse 600+ occupations with wage spreads, education requirements, and sector filters.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💼</text></svg>">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
       font-size: 13px; color: #1a1a1a; background: #fff; min-height: 100vh; }

.topbar { background: #0f1923; color: #fff; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between; height: 50px; }
.topbar-left { display: flex; align-items: center; gap: 10px; }
.topbar-title { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
.topbar-badge { font-size: 10px; background: rgba(255,255,255,.15); padding: 2px 8px;
                border-radius: 20px; font-weight: 500; letter-spacing: .04em; }
.topbar-right { font-size: 11px; color: rgba(255,255,255,.45); }

.page { max-width: 1140px; margin: 0 auto; padding: 24px 24px 60px; }

.hero { margin-bottom: 20px; }
.hero h1 { font-size: 24px; font-weight: 800; letter-spacing: -.025em; margin-bottom: 6px; }
.hero p  { font-size: 12px; color: #6b6b6b; line-height: 1.7; max-width: 680px; }

.metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
.metric  { background: #f5f5f3; border-radius: 10px; border: 1px solid #e2e2df; padding: 13px 15px; }
.ml { font-size: 10px; color: #9a9a97; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
.mv { font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
.ms { font-size: 11px; color: #9a9a97; margin-top: 2px; }

.tabs { display: flex; gap: 0; margin-bottom: 0; border-bottom: 2px solid #e2e2df; }
.tab  { padding: 9px 16px; font-size: 12px; font-weight: 500; cursor: pointer;
        border: none; background: transparent; color: #6b6b6b;
        border-bottom: 2px solid transparent; margin-bottom: -2px;
        transition: color .12s, border-color .12s; white-space: nowrap; }
.tab:hover { color: #1a1a1a; }
.tab.act  { color: #1a6fbb; border-bottom-color: #1a6fbb; font-weight: 700; }
.pnl { display: none; padding-top: 16px; } .pnl.act { display: block; }

.controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
input[type=text] { font-size: 12px; padding: 7px 11px; border: 1px solid #d5d5d1;
                   border-radius: 7px; background: #fff; color: #1a1a1a;
                   flex: 1; min-width: 160px; outline: none; transition: border-color .12s; }
input[type=text]:focus { border-color: #1a6fbb; box-shadow: 0 0 0 3px rgba(26,111,187,.1); }
input[type=text]::placeholder { color: #b0b0ac; }
select { font-size: 12px; padding: 7px 10px; border: 1px solid #d5d5d1;
         border-radius: 7px; background: #fff; color: #1a1a1a; cursor: pointer;
         outline: none; transition: border-color .12s; }
select:focus { border-color: #1a6fbb; }

.tbl-wrap { border: 1px solid #e2e2df; border-radius: 10px; overflow: hidden; }
.tbl-scroll { max-height: 460px; overflow-y: auto; }
.occ-table { width: 100%; border-collapse: collapse; }
.occ-table th { text-align: left; font-size: 10px; font-weight: 700; color: #9a9a97;
                padding: 9px 11px; border-bottom: 1px solid #e2e2df;
                position: sticky; top: 0; background: #f5f5f3; cursor: pointer;
                white-space: nowrap; text-transform: uppercase; letter-spacing: .05em; }
.occ-table th:hover { color: #1a1a1a; }
.occ-table td { padding: 6px 11px; border-bottom: 1px solid #ededea; vertical-align: middle; white-space: nowrap; }
.occ-table tr:last-child td { border-bottom: none; }
.occ-table tr:hover td { background: #f9f9f7; }
.edu-badge { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 600; letter-spacing: .02em; white-space: nowrap; }

.chart-card { border: 1px solid #e2e2df; border-radius: 10px; padding: 18px; background: #fff; }
.chart-wrap { position: relative; }
.stitle { font-size: 13px; font-weight: 700; margin-bottom: 10px; letter-spacing: -.01em; }
.subtitle { font-size: 11px; color: #6b6b6b; margin-bottom: 12px; margin-top: -6px; line-height: 1.5; }

.spread-legend { display: flex; gap: 18px; font-size: 11px; color: #6b6b6b; margin-bottom: 12px; flex-wrap: wrap; }
.leg-sw { width: 26px; height: 8px; display: inline-block; vertical-align: middle; border-radius: 2px; margin-right: 4px; }
.count-chip { font-size: 11px; color: #9a9a97; margin-bottom: 10px; }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.insight { background: #f5f5f3; border-radius: 10px; border: 1px solid #e2e2df; padding: 14px 16px; margin-bottom: 10px; }
.insight-t { font-size: 13px; font-weight: 700; margin-bottom: 4px; letter-spacing: -.01em; }
.insight-b { font-size: 12px; color: #5a5a57; line-height: 1.7; }

.footer { text-align: center; font-size: 11px; color: #b0b0ac;
          border-top: 1px solid #e2e2df; padding-top: 24px; margin-top: 32px; line-height: 1.8; }
.footer a { color: #1a6fbb; text-decoration: none; }

@media (max-width: 700px) {
  .metrics { grid-template-columns: repeat(2,1fr); }
  .topbar-right { display: none; }
  .hero h1 { font-size: 19px; }
  .grid2 { grid-template-columns: 1fr; }
  .tabs { overflow-x: auto; }
}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <span style="font-size:20px">💼</span>
    <span class="topbar-title">Bay Area Wage Explorer</span>
    <span class="topbar-badge">BLS OEWS</span>
  </div>
  <div class="topbar-right">San Francisco–Oakland–Hayward MSA · Occupational Employment &amp; Wage Statistics</div>
</div>

<div class="page">

  <div class="hero">
    <h1>Occupational Wages &amp; Education Requirements</h1>
    <p>Explore wage distributions (P10 → P90), minimum education requirements, and employment data for 600+ occupations in the San Francisco Bay Area. Data from the Bureau of Labor Statistics Occupational Employment and Wage Statistics (OEWS) program.</p>
  </div>

  <div class="metrics" id="metricBar"></div>

  <div class="tabs">
    <button class="tab act" onclick="sw('spread')">📊 Wage Spread by Job</button>
    <button class="tab" onclick="sw('browse')">🔍 Browse &amp; Filter</button>
    <button class="tab" onclick="sw('dist')">🎓 Education</button>
    <button class="tab" onclick="sw('toppay')">💰 Top Paying</button>
    <button class="tab" onclick="sw('findings')">💡 Key Findings</button>
  </div>

  <div id="spread" class="pnl act">
    <div class="controls">
      <input type="text" id="sq" placeholder="🔍  Search occupation…" oninput="renderSpread()">
      <select id="sef" onchange="renderSpread()">
        <option value="-1">All education levels</option>
        <option value="0">No formal requirement</option>
        <option value="1">High school / GED</option>
        <option value="2">Certificate / License</option>
        <option value="3">Associate's degree</option>
        <option value="4">Bachelor's degree</option>
        <option value="5">Master's degree</option>
        <option value="6">Doctoral / Professional</option>
      </select>
      <select id="sgf" onchange="renderSpread()"><option value="-1">All groups</option></select>
      <select id="ssort" onchange="renderSpread()">
        <option value="median">Sort: Median ↓</option>
        <option value="mean">Sort: Mean ↓</option>
        <option value="spread">Sort: Spread (P90−P10) ↓</option>
        <option value="p10">Sort: P10 floor ↓</option>
        <option value="edu">Sort: Education level ↓</option>
        <option value="name">Sort: Name A–Z</option>
      </select>
      <select id="slimit" onchange="renderSpread()">
        <option value="30">Show 30</option>
        <option value="50">Show 50</option>
        <option value="100">Show 100</option>
        <option value="9999">Show all</option>
      </select>
    </div>
    <div class="spread-legend">
      <span><span class="leg-sw" style="background:#c8dff4"></span>P10 – P25</span>
      <span><span class="leg-sw" style="background:#2878cc"></span>P25 – Median</span>
      <span><span class="leg-sw" style="background:#185fa5;opacity:.65"></span>Median – P75</span>
      <span><span class="leg-sw" style="background:#c8dff4"></span>P75 – P90</span>
      <span style="color:#b0b0ac">◆ = median &nbsp;·&nbsp; bar color = education level</span>
    </div>
    <div id="spread-count" class="count-chip"></div>
    <div class="chart-card" style="padding:12px 8px">
      <div id="spreadWrap" style="overflow-y:auto"><canvas id="spreadChart"></canvas></div>
    </div>
  </div>

  <div id="browse" class="pnl">
    <div class="controls">
      <input type="text" id="q" placeholder="🔍  Search occupation…" oninput="renderTable()">
      <select id="ef" onchange="renderTable()">
        <option value="-1">All education levels</option>
        <option value="0">No formal req.</option><option value="1">High school</option>
        <option value="2">Certificate</option><option value="3">Associate's</option>
        <option value="4">Bachelor's</option><option value="5">Master's</option>
        <option value="6">Doctoral / Prof.</option>
      </select>
      <select id="gf" onchange="renderTable()"><option value="-1">All groups</option></select>
      <select id="sf" onchange="renderTable()">
        <option value="name">Sort: Name A–Z</option>
        <option value="mean">Sort: Mean wage ↓</option>
        <option value="median">Sort: Median wage ↓</option>
        <option value="edu">Sort: Education level ↓</option>
      </select>
    </div>
    <div id="tbl-count" class="count-chip"></div>
    <div class="tbl-wrap">
      <div class="tbl-scroll">
        <table class="occ-table">
          <thead><tr>
            <th onclick="setSF('name')">Occupation</th>
            <th onclick="setSF('edu')">Min. Education</th>
            <th onclick="setSF('mean')">Mean</th>
            <th onclick="setSF('median')">Median</th>
            <th>P10</th><th>P25</th><th>P75</th><th>P90</th>
            <th>Sector</th>
          </tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="dist" class="pnl">
    <div class="grid2" style="margin-bottom:16px">
      <div class="chart-card">
        <div class="stitle">Occupations by education level</div>
        <div class="chart-wrap" style="height:260px"><canvas id="distChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="stitle">Count per education level</div>
        <div class="chart-wrap" style="height:260px"><canvas id="distBar"></canvas></div>
      </div>
    </div>
    <div class="chart-card">
      <div class="stitle">Median annual wage by education level</div>
      <div class="subtitle">Box spans P25–P75. White diamond = median of medians within each tier.</div>
      <div class="chart-wrap" style="height:250px"><canvas id="wageBox"></canvas></div>
    </div>
  </div>

  <div id="toppay" class="pnl">
    <div class="chart-card">
      <div class="stitle">25 highest-paying occupations — annual mean wage</div>
      <div class="subtitle">Bar color indicates minimum education level required.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;font-size:11px" id="topLegend"></div>
      <div class="chart-wrap" style="height:520px"><canvas id="topChart"></canvas></div>
    </div>
  </div>

  <div id="findings" class="pnl"><div id="findingsBody"></div></div>

  <div class="footer">
    Source: <a href="https://www.bls.gov/oes/" target="_blank">Bureau of Labor Statistics — Occupational Employment and Wage Statistics (OEWS)</a><br>
    San Francisco–Oakland–Hayward, CA Metropolitan Statistical Area &nbsp;·&nbsp;
    Wages are annual, in current dollars &nbsp;·&nbsp;
    (5) = suppressed (top-coded or insufficient observations)
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<script>
const GROUPS=['Management','Business & Financial','Computer & Math','Architecture & Eng','Life & Social Science','Community & Social Svc','Legal','Education & Library','Arts, Design & Media','Healthcare Practitioners','Healthcare Support','Protective Service','Food Prep & Serving','Building & Grounds','Personal Care & Svc','Sales','Office & Admin Support','Farming & Fishing','Construction & Extraction','Installation & Repair','Production','Transportation & Moving'];
const EDU_L=['No formal req.','High school / GED','Certificate / License',"Associate's degree","Bachelor's degree","Master's degree",'Doctoral / Professional'];
const EDU_S=['None','HS/GED','Certificate',"Associate's","Bachelor's","Master's",'Doctoral'];
const EC=['#888780','#d85a30','#c28a14','#4a9e3f','#2878cc','#7f6fdd','#c4437a'];
const EL=['#e8e7e4','#fbeae3','#faf0d5','#dff0da','#daeaf9','#e9e6f9','#fbe6f1'];

// [name, groupIdx, eduLevel, annMean, annMedian, p10, p25, p75, p90]
// 0 = suppressed / not available
const D=[
['Chief Executives',0,6,415630,0,155610,205780,0,0],
['General/Operations Managers',0,4,187140,149260,65100,96790,221830,0],
['Legislators',0,4,95980,81240,31470,43900,113630,171990],
['Advertising/Promotions Managers',0,4,231250,201120,122460,159960,0,0],
['Marketing Managers',0,4,199840,175560,102270,135710,227010,0],
['Sales Managers',0,4,244410,211670,112710,161010,0,0],
['Public Relations Managers',0,4,218170,184080,117910,140060,0,0],
['Fundraising Managers',0,4,180420,168020,105260,128230,212320,0],
['Administrative Services Managers',0,4,158900,138740,84990,109960,180790,0],
['Facilities Managers',0,4,143800,131190,79560,101420,169380,214730],
['Computer/Info Systems Managers',0,4,224020,212400,136030,168960,0,0],
['Financial Managers',0,4,247840,216520,131990,168800,0,0],
['Industrial Production Managers',0,4,156510,146270,95180,118710,176340,221270],
['Purchasing Managers',0,4,193270,173080,115180,141770,219590,0],
['Transportation/Distribution Managers',0,4,143160,127600,82300,100970,167480,212440],
['Compensation/Benefits Managers',0,4,200630,183770,123850,149550,227490,0],
['Human Resources Managers',0,4,199270,176290,102510,134630,231880,0],
['Training/Development Managers',0,4,181430,170150,100910,125040,216060,0],
['Farmers/Ranchers/Agri Managers',0,1,89380,77990,57530,70700,105910,131400],
['Construction Managers',0,4,152380,138000,79640,101000,179950,234650],
['Edu/Childcare Admin, Preschool',0,4,91640,79000,52340,60590,100610,158930],
['Education Admin, K-12',0,5,152320,157210,100910,127830,171930,203100],
['Education Admin, Postsecondary',0,6,159640,136880,93840,109380,177010,0],
['Education Admin, All Other',0,5,107620,87500,64730,74270,130290,172090],
['Architectural/Engineering Managers',0,4,195340,179110,131200,154430,216810,0],
['Food Service Managers',0,1,95390,82400,63460,74170,106180,151680],
['Entertainment/Recreation Managers',0,4,104080,88340,57580,72950,117340,165900],
['Lodging Managers',0,3,96700,78250,43410,66880,118530,166850],
['Medical/Health Services Managers',0,4,183580,157910,95990,120590,208550,0],
['Natural Sciences Managers',0,4,184880,171640,73570,132180,222930,0],
['Postmasters/Mail Superintendents',0,1,99000,98030,86920,91870,104920,111470],
['Property/Real Estate Managers',0,4,103400,79170,58760,67090,124280,169910],
['Social/Community Service Managers',0,4,107320,98300,66350,78990,125630,161510],
['Emergency Management Directors',0,4,120070,96650,65290,76680,129570,186110],
['Funeral Home Managers',0,3,108990,91930,64270,77240,124100,163320],
['Personal Service Managers',0,4,84770,72240,38890,49440,111740,127610],
['Managers, All Other',0,4,179690,168680,89390,127700,215140,0],
['Agents/Business Mgrs, Artists',1,4,161040,93400,51860,65000,130370,0],
['Buyers/Purchasing Agents',1,4,92170,83960,51260,66290,107910,136060],
['Claims Adjusters/Examiners',1,4,95630,95190,60420,76740,110800,134400],
['Insurance Appraisers, Auto',1,3,91830,90540,67960,82490,98490,117450],
['Compliance Officers',1,4,98560,93320,57570,72680,124470,137710],
['Cost Estimators',1,4,99570,86540,53990,66460,120840,156790],
['Human Resources Specialists',1,4,94500,83060,55850,64870,112130,150410],
['Labor Relations Specialists',1,4,116020,106180,60880,79830,152030,173650],
['Logisticians',1,4,99000,92830,61090,76340,115770,137430],
['Project Management Specialists',1,4,126860,121680,73360,91970,157670,184490],
['Management Analysts',1,4,129500,110950,66770,84660,162220,206590],
['Meeting/Event Planners',1,4,92550,77860,46480,60950,117440,167370],
['Fundraisers',1,4,85250,79000,53480,64660,99140,127430],
['Compensation/Benefits Specialists',1,4,97410,88390,62400,75140,110190,140380],
['Training/Development Specialists',1,4,83720,78720,37420,53990,102910,136100],
['Market Research Analysts',1,4,102680,97360,58100,72600,128600,164070],
['Business Operations Specialists',1,4,98450,89740,51810,67520,118230,153970],
['Accountants/Auditors',1,4,121970,105100,68790,81350,139840,186880],
['Property Appraisers/Assessors',1,4,95880,81790,50130,60850,123370,147480],
['Budget Analysts',1,4,100640,97740,65380,79320,118730,140930],
['Credit Analysts',1,4,148610,133180,78570,99800,181160,231560],
['Financial/Investment Analysts',1,4,148980,128490,80910,102400,171770,221110],
['Personal Financial Advisors',1,4,230810,168350,75690,102850,0,0],
['Insurance Underwriters',1,4,100220,87250,49850,67680,126960,164030],
['Financial Risk Specialists',1,4,157880,141960,86680,105960,181130,222390],
['Financial Examiners',1,4,142160,131670,79850,99420,173100,219040],
['Credit Counselors',1,4,71220,63330,50920,57960,80750,101280],
['Loan Officers',1,4,125440,102540,49690,72680,162570,216810],
['Tax Examiners/Collectors',1,4,88930,79300,48030,62000,119180,137680],
['Tax Preparers',1,3,74640,71990,38400,49670,86740,109210],
['Financial Specialists, All Other',1,4,152750,108970,65600,82460,174990,0],
['Computer Systems Analysts',2,4,127470,127150,75680,96660,159510,177280],
['Information Security Analysts',2,4,146810,138360,85770,106760,172050,212380],
['Computer/Info Research Scientists',2,6,186110,166080,98030,130340,211380,0],
['Computer Network Support Specialists',2,3,93730,88980,56290,70610,106640,135630],
['Computer User Support Specialists',2,3,73570,70010,41600,51390,88510,108500],
['Computer Network Architects',2,4,154900,153820,98350,119210,179920,212240],
['Database Administrators',2,4,125260,124550,68440,91330,158690,179830],
['Database Architects',2,4,143220,137290,84150,103160,172320,210130],
['Network/Computer Systems Admins',2,4,119240,113030,72600,91100,136470,167820],
['Computer Programmers',2,4,122110,109590,68630,85370,147280,187280],
['Software Developers',2,4,161090,161970,97420,126140,190320,220780],
['Software QA Analysts/Testers',2,4,125780,121520,68400,94980,153690,179990],
['Web Developers',2,3,84170,67400,33960,51370,107570,154490],
['Web/Digital Interface Designers',2,4,126060,120430,57340,78690,167290,208920],
['Computer Occupations, All Other',2,4,127150,115480,53490,77490,166500,206060],
['Actuaries',2,4,158540,140640,81500,105740,186000,0],
['Mathematicians',2,6,113320,91290,73380,86670,127160,172420],
['Operations Research Analysts',2,5,121230,118320,62800,79990,144000,180330],
['Statisticians',2,5,144690,140610,74940,93750,170720,202560],
['Data Scientists',2,4,139810,130710,73920,91990,169420,213130],
['Math Science Occupations, Other',2,5,111700,82910,54020,64130,150160,0],
['Architects',3,4,110700,98870,61810,76060,128460,165660],
['Landscape Architects',3,4,102270,89940,63490,76480,105610,137420],
['Cartographers/Photogrammetrists',3,4,91430,80240,60550,75380,105510,131480],
['Surveyors',3,4,94380,91840,50890,70050,111230,139270],
['Aerospace Engineers',3,4,145580,135530,98390,120610,166230,195500],
['Bioengineers/Biomedical Engineers',3,4,124550,115080,83550,96960,145540,177740],
['Chemical Engineers',3,4,123790,122660,79390,92980,141440,176130],
['Civil Engineers',3,4,121640,106130,77710,85530,140210,180720],
['Computer Hardware Engineers',3,4,140050,136330,85870,104740,164760,209710],
['Electrical Engineers',3,4,125440,127160,77500,97250,145150,169020],
['Electronics Engineers',3,4,152720,153820,94300,114360,198880,203000],
['Environmental Engineers',3,4,117020,105040,70370,76980,137810,180780],
['Health/Safety Engineers',3,4,126740,124330,81980,95480,155860,172470],
['Industrial Engineers',3,4,113340,107000,78010,88590,131230,156570],
['Marine Engineers',3,4,118320,109040,103380,109040,130550,130550],
['Materials Engineers',3,4,129830,137650,81300,89920,158200,164980],
['Mechanical Engineers',3,4,120550,111270,77230,90990,140340,168270],
['Engineers, All Other',3,4,131340,130260,76170,97960,164630,189770],
['Architectural/Civil Drafters',3,3,76170,74760,46660,60680,92040,103670],
['Electrical/Electronics Drafters',3,3,104730,104560,63670,77170,144370,150580],
['Mechanical Drafters',3,3,83260,78190,56020,63170,96230,120620],
['Drafters, All Other',3,3,75980,67300,54830,60280,86650,114070],
['Aerospace Eng Technicians',3,3,77220,75530,60250,63780,79810,96810],
['Civil Engineering Technicians',3,3,67280,62900,40150,48080,80330,96450],
['Electrical Engineering Technicians',3,3,88290,84530,59110,67210,106280,124460],
['Electro-Mechanical Technologists',3,3,83740,79060,54080,63530,101780,121630],
['Environmental Eng Technicians',3,3,64910,62100,51640,55110,71970,79430],
['Industrial Engineering Technicians',3,3,70590,66850,42810,55050,82240,103510],
['Mechanical Eng Technicians',3,3,77310,75610,42170,58740,95670,119030],
['Calibration Technologists',3,3,81330,78000,46800,59280,108100,118400],
['Engineering Technicians, Other',3,3,82540,76640,51360,61320,100420,123540],
['Surveying/Mapping Technicians',3,3,68310,61680,46490,52130,78610,103370],
['Food Scientists/Technologists',4,4,106560,102630,66030,82930,126090,159530],
['Soil/Plant Scientists',4,4,80890,75360,49050,66090,98230,103730],
['Biochemists/Biophysicists',4,6,104000,97100,75200,78600,126100,136720],
['Microbiologists',4,4,94200,83650,60430,70550,113950,142790],
['Zoologists/Wildlife Biologists',4,4,90480,80240,60920,67440,103340,138120],
['Biological Scientists, Other',4,4,117470,102150,67860,84720,126340,171480],
['Conservation Scientists',4,4,75980,60430,47310,48630,76180,101910],
['Foresters',4,4,73810,66630,66580,66630,76730,94860],
['Epidemiologists',4,5,106130,102920,76770,76940,134560,153900],
['Medical Scientists',4,6,116950,102440,66780,77870,134510,172340],
['Life Scientists, All Other',4,6,96150,89540,62390,67310,114400,132540],
['Physicists',4,6,187560,177490,84980,131800,218830,0],
['Atmospheric/Space Scientists',4,5,151780,85220,59040,59050,176870,0],
['Chemists',4,4,97900,84510,61660,73300,112380,153880],
['Materials Scientists',4,4,112100,100400,74990,78760,128540,162390],
['Environmental Scientists',4,4,93640,83510,50720,66380,107530,138950],
['Geoscientists',4,4,93820,84260,60950,67780,109280,139240],
['Hydrologists',4,4,93950,84320,64860,65770,110800,150070],
['Physical Scientists, Other',4,4,124790,131730,55540,95610,157850,181830],
['Economists',4,5,182320,168850,80240,107780,231090,0],
['Survey Researchers',4,5,87220,83000,42810,57680,122760,128120],
['Clinical/Counseling Psychologists',4,6,119340,101400,61110,78180,135810,195760],
['School Psychologists',4,6,108370,101790,73240,80540,130030,142730],
['Psychologists, All Other',4,6,107240,121470,47490,85220,127840,150450],
['Sociologists',4,6,114140,130180,88300,89570,130180,130180],
['Urban/Regional Planners',4,5,102480,98290,65400,79090,113700,134970],
['Anthropologists/Archeologists',4,5,70540,60620,44550,49780,96080,106680],
['Historians',4,5,84350,78550,45760,56450,102350,123740],
['Social Scientists, All Other',4,5,105020,102910,75220,80580,126260,133620],
['Agricultural Technicians',4,3,64040,44590,37350,43410,76480,149240],
['Food Science Technicians',4,3,59790,57790,38560,45000,62510,78970],
['Biological Technicians',4,3,62250,59520,38840,49870,74670,83150],
['Chemical Technicians',4,3,60920,59450,45880,49350,69860,79020],
['Environmental Science Technicians',4,3,65080,59540,39550,47010,77960,101730],
['Geological Technicians',4,3,61670,66080,43950,43950,70160,82750],
['Nuclear Technicians',4,3,106830,108670,57570,61930,130350,160920],
['Social Science Research Assistants',4,4,68160,62330,37410,48920,82100,104720],
['Forest/Conservation Technicians',4,3,61330,58430,46490,50480,74190,74190],
['Forensic Science Technicians',4,4,81740,78170,61220,61540,96010,101370],
['Life/Physical/Social Sci Techs',4,3,67760,63610,46200,51420,78740,94720],
['OHS Specialists',4,4,96610,91360,58500,67120,120310,141630],
['OHS Technicians',4,3,70950,72820,50990,60640,76940,91900],
['Educational/Guidance Counselors',5,5,84800,77970,48910,62220,101250,133010],
['Marriage/Family Therapists',5,5,83840,86120,57410,70660,97670,107240],
['Rehabilitation Counselors',5,5,57720,52330,38690,43930,65830,85730],
['Substance Abuse/MH Counselors',5,4,75500,64900,44100,52770,81680,112690],
['Counselors, All Other',5,5,73400,73260,39880,57220,84430,105190],
['Child/Family/School Social Workers',5,4,79960,72750,50080,59850,96010,116640],
['Healthcare Social Workers',5,5,79160,77210,49150,59840,96310,106540],
['MH/SA Social Workers',5,5,101390,83490,50030,64800,101840,148190],
['Social Workers, All Other',5,4,77380,68540,59650,61900,90920,110800],
['Health Education Specialists',5,4,73710,63000,46140,54050,80080,123840],
['Probation Officers',5,4,80550,78920,50450,59610,98240,104140],
['Social/Human Service Assistants',5,1,51150,47390,35880,41370,58270,69350],
['Community Health Workers',5,1,63500,57630,45420,49050,72340,90600],
['Community/Social Svc Specialists',5,2,67350,63580,49000,57960,77000,88450],
['Clergy',5,5,79150,59410,37380,44790,91170,127120],
['Directors, Religious Activities',5,4,76260,57820,36110,44140,85840,134540],
['Religious Workers, All Other',5,1,53590,58980,34580,35830,61300,71750],
['Lawyers',6,6,216120,203450,83650,125350,0,0],
['Judicial Law Clerks',6,6,73780,54040,54040,54040,79800,143330],
['Administrative Law Judges',6,6,124320,128500,85220,104930,130300,170280],
['Arbitrators/Mediators',6,4,95630,89660,68510,79260,108630,130260],
['Judges',6,6,171510,196190,60920,127780,210890,211310],
['Paralegals/Legal Assistants',6,3,77050,73470,49150,60040,90480,107520],
['Title Examiners/Abstractors',6,3,72970,69250,46490,53820,80850,106520],
['Legal Support Workers, Other',6,4,92450,80250,50110,63040,109550,161780],
['Business Teachers, Postsec',7,6,153180,130480,64010,94110,198710,0],
['Computer Science Teachers, Postsec',7,6,119010,103390,54220,77630,166000,195280],
['Math Science Teachers, Postsec',7,6,127900,117560,61920,82490,174720,215590],
['Architecture Teachers, Postsec',7,6,141200,128450,81780,111550,164020,214740],
['Engineering Teachers, Postsec',7,6,133180,124740,65260,88050,172180,221490],
['Agricultural Sciences Teachers',7,6,89110,82490,42060,68840,106390,134690],
['Biological Science Teachers, Postsec',7,6,129230,107070,51220,78870,171030,217940],
['Atmospheric/Space Sci Teachers',7,6,141160,130960,62140,95170,195660,216290],
['Chemistry Teachers, Postsec',7,6,127170,105440,64860,82090,171600,210650],
['Environmental Science Teachers',7,6,117050,103530,61720,77550,138750,178230],
['Physics Teachers, Postsec',7,6,122570,107470,62280,81760,157520,203720],
['Anthropology/Archeology Teachers',7,6,122840,104420,52030,77970,174490,207480],
['Area/Ethnic/Cultural Studies Teachers',7,6,114450,98800,65140,82830,131270,196780],
['Economics Teachers, Postsec',7,6,156140,157180,65110,102280,197530,225300],
['Geography Teachers, Postsec',7,6,100200,95510,47780,64480,124760,159610],
['Political Science Teachers, Postsec',7,6,147540,132700,62510,94510,180130,0],
['Psychology Teachers, Postsec',7,6,116750,102780,61800,79400,134190,202530],
['Sociology Teachers, Postsec',7,6,123660,103960,58270,80600,170250,206000],
['Social Sciences Teachers, Other',7,6,133480,107630,49330,80580,184640,219020],
['Health Specialties Teachers, Postsec',7,6,144590,125820,62770,99420,185600,223080],
['Nursing Instructors, Postsec',7,5,112750,103790,51070,76910,136560,175690],
['Education Teachers, Postsec',7,6,108060,95060,48900,65630,134170,197700],
['Library Science Teachers, Postsec',7,6,88120,82800,49720,64970,105870,122780],
['Criminal Justice Teachers, Postsec',7,5,101930,82600,49600,64470,130000,201190],
['Law Teachers, Postsec',7,6,157270,129440,65690,95000,200200,0],
['Social Work Teachers, Postsec',7,6,106830,101300,64220,81760,118310,174120],
['Art/Drama/Music Teachers, Postsec',7,6,154570,126100,60560,78210,212980,0],
['Communications Teachers, Postsec',7,6,121160,102970,58820,75910,160750,202460],
['English/Literature Teachers, Postsec',7,6,127570,105340,61380,79720,171300,213990],
['Foreign Language Teachers, Postsec',7,6,112230,98250,50780,73070,134770,201290],
['History Teachers, Postsec',7,6,119710,104300,55010,81790,152810,202160],
['Philosophy/Religion Teachers, Postsec',7,6,108000,98280,50730,63890,126760,198940],
['Recreation/Fitness Teachers, Postsec',7,5,109330,96760,50900,63160,138030,196530],
['Career/Tech Edu Teachers, Postsec',7,3,86930,78370,49660,61430,101840,130330],
['Postsecondary Teachers, Other',7,5,130170,112150,47900,77340,177710,215780],
['Preschool Teachers',7,3,52680,47430,35590,37510,60880,75790],
['Kindergarten Teachers',7,4,84940,75300,51910,61360,103410,135680],
['Elementary School Teachers',7,4,95140,95240,60510,72600,128720,133170],
['Middle School Teachers',7,4,92410,82870,60560,74290,112650,133380],
['CTE Teachers, Middle School',7,4,89550,83570,31200,65810,125480,135580],
['Secondary School Teachers',7,4,100630,99260,62780,77860,129650,133290],
['CTE Teachers, High School',7,4,98760,97490,65990,78170,125330,133120],
['Special Edu Teachers, Preschool',7,4,122240,132930,61880,78200,156610,163850],
['Special Edu Teachers, K & Elem',7,4,92760,82510,61230,73320,110550,132130],
['Special Edu Teachers, Middle School',7,4,92240,88380,62490,73780,111420,129820],
['Special Edu Teachers, Secondary',7,4,99240,99410,64230,77180,127200,130780],
['Special Edu Teachers, All Other',7,4,107710,98020,51100,63640,156300,163850],
['Adult Basic/ESL Instructors',7,4,89880,81770,44550,65630,100380,125680],
['Self-Enrichment Teachers',7,1,71420,59740,37330,43090,90020,124350],
['Substitute Teachers',7,4,47730,40770,31470,36750,47280,59520],
['Tutors',7,4,59030,42770,33160,36590,63660,105410],
['Teachers/Instructors, Other',7,4,84740,80580,31200,47830,108070,150660],
['Archivists',7,5,78240,74880,49530,60660,87680,117790],
['Curators',7,5,108080,86420,46750,63730,125540,217560],
['Museum Technicians/Conservators',7,4,72960,70370,45140,51130,92910,104970],
['Librarians/Media Specialists',7,5,87960,79630,58920,66030,101360,130170],
['Library Technicians',7,3,50170,47370,32940,36760,60020,71440],
['Farm/Home Mgmt Educators',7,4,51780,48610,34070,34070,59250,76200],
['Instructional Coordinators',7,5,86560,79340,50630,61870,102610,126090],
['Teaching Assistants, Postsecondary',7,4,54840,50010,33990,37440,68080,77800],
['Teaching Assistants, Except Postsec',7,1,40060,37070,31200,33520,45070,49230],
['Educational Workers, Other',7,3,57940,52710,33280,38100,57870,98070],
['Art Directors',8,4,156460,136850,80760,103080,184530,0],
['Craft Artists',8,1,83470,79410,48580,55020,104880,124780],
['Fine Artists/Painters/Sculptors',8,4,89870,80760,42960,61270,128350,142700],
['Special Effects Artists/Animators',8,4,115230,103940,59990,75680,145160,171880],
['Artists/Related Workers, Other',8,4,73310,54610,36360,48480,96600,119590],
['Commercial/Industrial Designers',8,4,95930,87860,60260,72830,119550,136760],
['Fashion Designers',8,4,107530,96620,60840,67580,127020,172420],
['Floral Designers',8,1,45930,43640,36310,39060,45990,61140],
['Graphic Designers',8,4,83490,75850,49710,61300,99420,128230],
['Interior Designers',8,4,79880,76880,46450,60600,98560,110260],
['Merchandise Displayers',8,1,48870,43490,34200,37610,54050,73090],
['Set/Exhibit Designers',8,4,106180,96090,57810,69760,136240,166410],
['Designers, All Other',8,4,83860,75880,47180,60260,97500,132000],
['Actors',8,4,0,0,0,0,0,0],
['Producers/Directors',8,4,138960,106730,60260,78050,163740,214590],
['Athletes/Sports Competitors',8,1,209330,214630,85770,86890,0,0],
['Coaches/Scouts',8,4,76940,58400,36910,45280,81090,122910],
['Dancers',8,1,0,0,0,0,0,0],
['Choreographers',8,4,109750,94090,38100,55800,167850,182020],
['Music Directors/Composers',8,5,124070,97980,36890,58780,174180,0],
['Musicians/Singers',8,4,0,0,0,0,0,0],
['Broadcast Announcers/Radio DJs',8,4,211430,102300,36900,46670,206590,0],
['News Analysts/Reporters/Journalists',8,4,300200,104270,55330,78620,168190,0],
['Public Relations Specialists',8,4,95730,79990,51080,61720,105190,153010],
['Editors',8,4,117790,99220,58540,77470,133890,175960],
['Technical Writers',8,4,90230,83580,38930,57180,111380,145180],
['Writers/Authors',8,4,0,0,0,0,0,0],
['Interpreters/Translators',8,4,86460,83740,31590,52050,105260,133900],
['Court Reporters',8,2,106640,108720,73990,82020,135100,139600],
['Audio/Video Technicians',8,3,78280,73140,41550,55030,98160,125250],
['Broadcast Technicians',8,3,92790,97100,39350,53760,124980,133700],
['Sound Engineering Technicians',8,3,97120,92630,41930,61990,129830,152470],
['Lighting Technicians',8,3,92270,86510,57790,70000,106100,129950],
['Photographers',8,1,71850,60270,36440,39690,93200,123540],
['Camera Operators',8,3,95240,89960,51330,67610,120720,126020],
['Film/Video Editors',8,4,110720,102060,53510,76720,136350,164340],
['Chiropractors',9,6,123870,104690,76140,78390,159080,207430],
['Dentists, General',9,6,185780,159990,68900,80080,215740,0],
['Oral/Maxillofacial Surgeons',9,6,0,0,0,0,0,0],
['Orthodontists',9,6,350960,0,77160,156320,0,0],
['Dietitians/Nutritionists',9,4,85140,80970,60660,72680,97490,114680],
['Optometrists',9,6,154620,160520,105100,145600,166840,195670],
['Pharmacists',9,6,137130,135720,100630,126610,156600,167900],
['Physician Assistants',9,5,158510,163540,104000,135840,177170,208000],
['Podiatrists',9,6,132580,107500,62430,69360,175830,220820],
['Occupational Therapists',9,5,109520,102750,71640,84910,129370,156410],
['Physical Therapists',9,6,109280,105470,76590,88450,125860,137320],
['Radiation Therapists',9,3,142900,131490,104880,111880,141630,161110],
['Recreational Therapists',9,4,68590,64680,48750,54880,79040,90920],
['Respiratory Therapists',9,3,109720,104840,84560,98250,122460,128340],
['Speech-Language Pathologists',9,5,119030,126330,74720,86300,137320,165540],
['Exercise Physiologists',9,4,76870,74840,58390,60870,80810,110800],
['Therapists, All Other',9,5,92860,82320,58180,68950,102640,130640],
['Veterinarians',9,6,161160,154350,81110,108240,206880,0],
['Registered Nurses',9,3,115650,113490,83900,100530,128430,154440],
['Nurse Anesthetists',9,6,263220,0,197060,229990,0,0],
['Nurse Midwives',9,5,143540,138980,114650,130020,158030,179700],
['Nurse Practitioners',9,5,151510,152790,107230,135120,167870,194740],
['Audiologists',9,6,112040,107260,87830,98750,129830,129830],
['Anesthesiologists',9,6,322570,0,82070,98180,0,0],
['Cardiologists',9,6,389860,0,103110,216850,0,0],
['Dermatologists',9,6,311490,0,89840,178780,0,0],
['Emergency Medicine Physicians',9,6,230620,0,77470,85330,0,0],
['Family Medicine Physicians',9,6,243050,0,86310,173430,0,0],
['General Internal Medicine Physicians',9,6,195970,155570,78310,85320,0,0],
['Neurologists',9,6,219180,214820,83060,92870,0,0],
['Obstetricians/Gynecologists',9,6,267380,0,85140,206040,0,0],
['Pediatricians, General',9,6,172310,155570,80080,97300,214340,0],
['Physicians, Pathologists',9,6,232490,216420,83430,95950,0,0],
['Psychiatrists',9,6,234820,229630,83360,95760,0,0],
['Radiologists',9,6,325750,219900,85780,98540,0,0],
['Physicians, All Other',9,6,260160,0,77180,110700,0,0],
['Ophthalmologists',9,6,362770,0,85330,214140,0,0],
['Orthopedic Surgeons',9,6,283960,230130,82850,107850,0,0],
['Pediatric Surgeons',9,6,371890,0,140650,215740,0,0],
['Surgeons, All Other',9,6,319280,215640,83760,85210,0,0],
['Acupuncturists',9,5,98380,97360,55730,83170,100640,124120],
['Dental Hygienists',9,3,100910,103640,75490,97580,108730,123000],
['Healthcare Diagnosing Practitioners, Other',9,6,139750,132790,70430,96600,181830,218270],
['Clinical Laboratory Technologists',9,4,84430,80580,45820,58240,109070,127240],
['Cardiovascular Technologists',9,3,85140,84720,48460,59120,104210,124010],
['Diagnostic Medical Sonographers',9,3,104880,104000,81890,96000,119010,125230],
['Nuclear Medicine Technologists',9,3,116140,117560,98910,105980,124880,132270],
['Radiologic Technologists',9,3,96930,98490,69790,82010,105380,125430],
['MRI Technologists',9,3,108050,109480,82310,99970,122970,129420],
['Medical Dosimetrists',9,4,166610,166540,136120,142360,174720,201190],
['Emergency Medical Technicians',9,2,52940,48000,40160,44930,61110,64860],
['Paramedics',9,3,76600,76060,62060,66680,81950,96740],
['Dietetic Technicians',9,3,47200,46030,34780,36800,54400,62540],
['Pharmacy Technicians',9,1,45710,43470,35680,36580,50720,62350],
['Psychiatric Technicians',9,2,59030,59150,43170,49790,63300,72660],
['Surgical Technologists',9,3,79060,78710,53190,64330,91240,102420],
['Veterinary Technologists',9,3,57800,55860,39980,49080,64180,79010],
['Ophthalmic Medical Technicians',9,2,50100,47370,37400,43070,58210,66090],
['Licensed Practical/Vocational Nurses',9,2,72150,72800,59340,64270,77650,84380],
['Medical Records Specialists',9,2,65680,60610,37520,46490,79700,99470],
['Opticians, Dispensing',9,3,64870,62780,47160,58240,74990,80540],
['Orthotists/Prosthetists',9,4,103970,103660,63920,77070,129020,130800],
['Hearing Aid Specialists',9,3,67500,59720,39700,45540,92000,107730],
['Health Technologists, Other',9,3,66360,58940,45340,48870,72010,95720],
['Health Information Technologists',9,3,84290,74900,48220,55830,106570,130850],
['Athletic Trainers',9,4,80250,73650,51520,63510,90150,109270],
['Genetic Counselors',9,5,108070,103060,75000,98780,122260,136050],
['Surgical Assistants',9,3,74930,61500,52370,53580,83340,137950],
['Healthcare Practitioners, Other',9,3,92510,80510,52960,64650,118210,143120],
['Home Health/Personal Care Aides',10,1,39550,37990,35280,36700,42710,45340],
['Nursing Assistants',10,2,49100,47810,39490,45570,52980,59350],
['Orderlies',10,1,44370,43940,35900,37630,49330,52590],
['Psychiatric Aides',10,1,49630,49180,39530,42430,54300,55510],
['Occupational Therapy Assistants',10,3,70440,71850,47640,64370,78400,86790],
['Occupational Therapy Aides',10,1,43550,40550,31410,31420,49670,60820],
['Physical Therapist Assistants',10,3,68500,72230,33390,61450,78640,86870],
['Physical Therapist Aides',10,1,41100,35440,31440,31580,49570,52000],
['Massage Therapists',10,2,66070,57660,35360,46700,75300,98030],
['Dental Assistants',10,2,51070,47810,36970,44580,59370,62400],
['Medical Assistants',10,2,48320,46890,36020,44190,54600,58610],
['Medical Equipment Preparers',10,1,55790,56780,39770,47870,60920,69690],
['Medical Transcriptionists',10,2,44780,43190,32520,40500,45790,57310],
['Pharmacy Aides',10,1,40460,37150,33960,35580,39010,54990],
['Veterinary Assistants',10,1,46030,44790,38220,40020,47080,57160],
['Phlebotomists',10,2,51670,48840,40860,46810,57610,62130],
['Healthcare Support Workers, Other',10,2,53850,52880,37140,40320,60700,70960],
['First-Line Supvrs, Correctional Officers',11,1,121720,120270,97130,110850,127890,140400],
['First-Line Supvrs, Police',11,1,141670,137520,98530,122610,163120,192870],
['First-Line Supvrs, Firefighting',11,1,140150,131740,109590,131060,153020,176240],
['First-Line Supvrs, Security Workers',11,1,66470,59130,45200,48810,79020,95500],
['First-Line Supvrs, Protective Svc Other',11,1,79620,84310,45800,52000,98640,107950],
['Firefighters',11,1,92290,105250,56610,74780,105260,119650],
['Fire Inspectors/Investigators',11,3,78450,74550,51910,61020,93040,120880],
['Forest Fire Inspectors',11,1,65630,61820,46120,50060,80450,96040],
['Bailiffs',11,3,80960,87440,54760,71160,93950,93950],
['Correctional Officers/Jailers',11,1,83800,92190,55170,72410,92230,100650],
['Detectives/Criminal Investigators',11,1,114030,106540,62290,77350,151840,177150],
['Fish/Game Wardens',11,4,69030,66750,44990,59290,78730,99960],
['Parking Enforcement Workers',11,1,49310,45150,36090,41600,57930,65640],
['Police/Sheriff Patrol Officers',11,1,92620,105790,55770,56550,106510,131400],
['Transit/Railroad Police',11,1,105930,108490,65920,65920,141870,141870],
['Animal Control Workers',11,1,62290,56090,39070,43200,67280,91320],
['Private Detectives/Investigators',11,1,73340,59840,44200,52450,83410,113220],
['Security Guards',11,1,45680,42030,35380,36890,49660,60580],
['Crossing Guards/Flaggers',11,1,46680,44190,35840,37680,53400,58990],
['Lifeguards/Ski Patrol',11,1,37900,36620,31800,34370,40290,44460],
['Transportation Security Screeners',11,1,66560,70430,46490,57570,75130,77480],
['School Bus Monitors',11,1,38960,37650,33420,36100,41720,43470],
['Protective Service Workers, Other',11,1,58380,56620,34830,39770,68950,81680],
['Chefs/Head Cooks',12,2,72440,66550,44310,53250,82860,100730],
['First-Line Supvrs, Food Prep',12,1,53890,48540,37560,43110,61490,78070],
['Cooks, Fast Food',12,0,35090,34180,31470,31950,35600,39700],
['Cooks, Institution/Cafeteria',12,1,47500,46370,36300,39970,51210,59390],
['Cooks, Restaurant',12,1,43310,41980,33610,36400,46600,56630],
['Cooks, Short Order',12,1,38490,38210,31950,33790,39990,48280],
['Cooks, All Other',12,1,42780,42680,34940,37140,44490,48770],
['Food Preparation Workers',12,0,38960,36330,31940,33900,43060,48540],
['Bartenders',12,1,63960,59030,34350,42290,79250,94180],
['Fast Food/Counter Workers',12,0,36400,35420,31470,33540,36910,42560],
['Waiters/Waitresses',12,1,53360,45010,31950,34130,62590,94680],
['Food Servers, Nonrestaurant',12,1,40910,37950,32770,35190,45840,50270],
['Dining Room/Cafeteria Attendants',12,1,44020,37250,31660,33280,47170,75710],
['Dishwashers',12,0,37570,36000,31980,34340,37690,42590],
['Hosts/Hostesses, Restaurant',12,1,40630,36780,31470,33540,44680,52690],
['Food Prep/Serving Workers, Other',12,0,37370,33380,31600,31950,38340,44890],
['First-Line Supvrs, Housekeeping',13,1,61450,58630,40700,49070,72330,82780],
['First-Line Supvrs, Landscaping',13,1,74610,75100,53900,57150,83190,98760],
['Janitors/Cleaners',13,0,44950,40350,33750,36090,50450,62330],
['Maids/Housekeeping Cleaners',13,0,50110,43090,34780,36690,55760,81010],
['Building Cleaning Workers, Other',13,0,56070,48840,31470,38260,81320,81320],
['Pest Control Workers',13,1,54400,48430,44510,46140,61330,70970],
['Landscaping/Groundskeeping Workers',13,0,45560,45150,34550,37160,47680,59240],
['Pesticide Handlers/Sprayers',13,2,55450,55680,49390,55680,55680,55680],
['Tree Trimmers/Pruners',13,1,64790,63130,40840,57620,76900,84310],
['First-Line Supvrs, Entertainment/Rec',14,1,55750,50500,35180,44100,64380,78410],
['First-Line Supvrs, Personal Svc',14,1,60820,56320,39210,45700,70450,85940],
['Animal Trainers',14,1,54950,45470,36370,39520,61460,90930],
['Animal Caretakers',14,1,40040,36670,32020,34550,43470,50340],
['Motion Picture Projectionists',14,1,73620,79860,42730,65630,82040,82050],
['Ushers/Lobby Attendants',14,1,38850,36440,32050,34850,42030,45300],
['Amusement/Recreation Attendants',14,1,37050,35510,31470,31710,37580,45470],
['Costume Attendants',14,2,80280,80550,45240,57780,92220,128260],
['Locker Room Attendants',14,1,40600,35200,31920,31930,42010,56320],
['Crematory Operators',14,2,59270,54810,46960,49090,68370,68370],
['Funeral Attendants',14,1,46690,43350,36110,37980,54080,61750],
['Morticians/Undertakers',14,3,67190,65350,31470,44080,79200,104130],
['Barbers',14,2,48930,39270,31470,32050,59960,84850],
['Hairdressers/Cosmetologists',14,2,51650,36390,31470,33760,54780,91200],
['Makeup Artists, Theatrical',14,2,121610,99650,69730,85660,154430,205030],
['Manicurists/Pedicurists',14,2,35030,33740,31470,31630,35260,37620],
['Shampooers',14,2,33730,32050,31470,31470,35650,36530],
['Skincare Specialists',14,2,56090,46560,32050,37080,56190,80900],
['Baggage Porters/Bellhops',14,1,48710,43830,38460,38460,56460,60560],
['Concierges',14,1,49290,46960,34740,37290,59240,61020],
['Tour/Travel Guides',14,1,46780,38650,32060,34630,47060,52020],
['Childcare Workers',14,1,38370,36540,31510,34300,42080,45600],
['Exercise Trainers/Group Fitness',14,2,65700,58220,33630,36460,83200,106930],
['Recreation Workers',14,4,42440,37390,32050,35530,46910,57150],
['Residential Advisors',14,4,47530,44540,35770,39900,53900,63000],
['First-Line Supvrs, Retail Sales',15,1,63830,58320,39060,45810,73830,92290],
['First-Line Supvrs, Non-Retail Sales',15,4,124210,109770,64590,84510,153040,191820],
['Cashiers',15,1,37250,35440,31470,32940,37360,45010],
['Counter/Rental Clerks',15,1,50340,45260,34920,38640,56240,71570],
['Parts Salespersons',15,1,49980,45650,33500,35880,59820,72950],
['Retail Salespersons',15,1,43740,37350,33150,35480,44200,60560],
['Advertising Sales Agents',15,4,113120,97810,49340,66760,132660,199990],
['Insurance Sales Agents',15,4,110260,78130,45450,59580,125840,208970],
['Securities/Commodities/Financial Sales',15,4,191710,166170,60730,101280,0,0],
['Travel Agents',15,3,59590,57070,37530,47240,71070,77310],
['Sales Reps, Services',15,4,105660,85650,45400,60610,132490,187590],
['Sales Reps, Wholesale/Mfg, Technical',15,4,148040,138240,62770,95100,176710,222230],
['Sales Reps, Wholesale/Mfg, Non-Technical',15,4,93410,78060,45710,57700,104960,156930],
['Real Estate Brokers',15,4,120760,97500,61770,72790,173980,199990],
['Real Estate Sales Agents',15,4,105920,100440,41600,53230,129050,168590],
['Sales Engineers',15,4,155460,156170,92300,118260,195820,223720],
['Telemarketers',15,1,41100,38420,32420,34070,43860,54430],
['Sales Workers, All Other',15,3,67990,62060,39040,42700,80610,104270],
['First-Line Supvrs, Office/Admin',16,1,83040,78310,51590,62500,98670,123900],
['Switchboard Operators',16,1,51060,46030,37090,38850,56030,81000],
['Telephone Operators',16,1,52950,51390,36040,44350,57250,76780],
['Bill/Account Collectors',16,1,57960,52250,40370,45520,64490,82210],
['Billing/Posting Clerks',16,1,58670,55830,41390,47770,64200,78490],
['Bookkeeping/Accounting/Auditing Clerks',16,1,60540,59170,40320,47500,70460,81490],
['Payroll/Timekeeping Clerks',16,1,65760,63710,44410,51540,76090,88650],
['Procurement Clerks',16,1,54880,54490,39280,45030,62370,71080],
['Tellers',16,1,46200,46200,37310,41660,47590,57630],
['Financial Clerks, Other',16,1,60070,57740,42360,47820,63730,81980],
['Brokerage Clerks',16,4,85390,77090,62110,64990,100090,127050],
['Court/Municipal/License Clerks',16,1,64480,58480,41500,47690,76700,100130],
['Customer Service Representatives',16,1,53670,48890,36060,40270,61270,78000],
['Eligibility Interviewers',16,1,57460,51810,45990,48040,65230,78640],
['File Clerks',16,1,46750,44780,34600,38890,53220,59500],
['Hotel/Motel/Resort Desk Clerks',16,1,49090,42110,36830,38170,55880,81470],
['Library Assistants, Clerical',16,1,41740,37370,32870,34600,47130,55590],
['Loan Interviewers/Clerks',16,1,60640,58860,45980,48690,68390,79680],
['New Accounts Clerks',16,1,57190,56120,48580,49190,59190,74620],
['Order Clerks',16,1,48070,46160,32240,38980,55370,66160],
['HR Assistants, Except Payroll',16,3,55710,53650,38240,45370,63790,74510],
['Receptionists/Information Clerks',16,1,43680,43070,34070,36830,47150,56330],
['Reservation/Ticket Agents',16,1,44400,39630,36450,37360,43550,61470],
['Cargo/Freight Agents',16,1,65660,62590,43490,51080,76390,87510],
['Couriers/Messengers',16,1,45950,42230,36670,37300,51170,59960],
['Public Safety Telecommunicators',16,1,61350,59440,44600,47050,72580,80910],
['Dispatchers, Except Police/Fire',16,1,61290,55240,37590,43060,74890,102780],
['Meter Readers, Utilities',16,1,73230,69810,46100,56270,85040,114910],
['Postal Service Clerks',16,1,63610,63670,53350,56450,74050,75380],
['Postal Service Mail Carriers',16,1,60260,58390,40210,48090,75300,75300],
['Postal Service Mail Sorters',16,1,59850,57490,42600,47380,72970,74150],
['Production/Planning/Expediting Clerks',16,1,65430,61930,44190,50890,76010,89740],
['Shipping/Receiving/Inventory Clerks',16,1,48740,46450,35400,38930,55140,67770],
['Executive Secretaries/Admin Assts',16,3,88610,83270,62040,70040,102030,124500],
['Legal Secretaries/Admin Assts',16,3,74520,74400,45940,57140,85240,104270],
['Medical Secretaries/Admin Assts',16,2,51230,49180,39000,43860,58200,64390],
['Secretaries/Admin Assts, Other',16,1,52910,50990,37440,44780,60610,67950],
['Data Entry Keyers',16,1,46400,44610,32470,36440,51410,62810],
['Word Processors/Typists',16,1,56030,51100,38420,46020,62410,80740],
['Desktop Publishers',16,4,78460,70500,51120,51180,95540,114390],
['Insurance Claims/Policy Processing',16,1,61990,60040,47030,49520,68140,79560],
['Mail Clerks/Mail Machine Operators',16,1,45320,42940,33690,36340,50190,61220],
['Office Clerks, General',16,1,50070,46930,33720,38000,58470,71040],
['Proofreaders/Copy Markers',16,3,62820,60130,35560,49920,72260,86720],
['Statistical Assistants',16,3,71790,71030,50380,56150,85690,94160],
['First-Line Supvrs, Farming',17,1,65050,59290,45180,48170,70250,95150],
['Agricultural Inspectors',17,1,69480,70430,40830,54490,80240,91560],
['Animal Breeders',17,1,54780,50440,47580,47680,59550,69420],
['Farmworkers, Crop/Nursery',17,0,42610,39410,36880,37630,45870,54260],
['Farmworkers, Farm/Ranch',17,0,46110,46010,38710,38890,46350,61220],
['First-Line Supvrs, Construction',18,1,107450,104870,60640,78060,136500,150830],
['Boilermakers',18,2,85380,80560,52130,80560,85290,127830],
['Brickmasons/Blockmasons',18,1,84370,77270,51400,63400,101100,124890],
['Stonemasons',18,1,69610,55010,49050,51990,81280,99200],
['Carpenters',18,1,77620,69680,44200,56300,95710,125280],
['Carpet Installers',18,1,70240,51140,34780,45820,81620,121870],
['Floor Layers',18,1,72070,58760,40590,56250,91810,123350],
['Tile/Stone Setters',18,1,76390,72840,39240,50570,96530,123400],
['Cement Masons/Concrete Finishers',18,1,75910,65880,48620,55430,95250,115650],
['Construction Laborers',18,0,71600,61870,41600,49050,96300,105170],
['Operating Engineers/Equip Operators',18,1,104940,98610,59420,75050,128560,157700],
['Drywall/Ceiling Tile Installers',18,1,69370,65840,32610,56910,79460,112040],
['Electricians',18,2,85440,76450,47100,60910,119740,132580],
['Glaziers',18,2,72180,62750,42740,47240,100020,108790],
['Insulation Workers',18,1,79080,64510,43120,46890,109090,145620],
['Painters, Construction',18,1,62560,58450,36050,47810,71970,98310],
['Plumbers/Pipefitters/Steamfitters',18,2,91060,79420,49180,64810,107000,138100],
['Plasterers/Stucco Masons',18,1,89650,78360,49920,62400,105930,165420],
['Reinforcing Iron/Rebar Workers',18,1,84460,92980,53290,72210,95530,98800],
['Roofers',18,1,77450,74470,37950,52000,99690,114330],
['Sheet Metal Workers',18,2,84950,77350,46150,59890,107550,133020],
['Structural Iron/Steel Workers',18,1,102260,104850,61000,81780,126910,129940],
['Solar PV Installers',18,2,65180,61140,47270,48360,77640,96300],
['Construction/Building Inspectors',18,3,91960,85960,51880,67700,109390,133710],
['Elevator/Escalator Installers',18,2,121810,127040,69730,102440,138150,170160],
['Hazardous Materials Removal Workers',18,1,71880,62280,44810,50380,85900,105090],
['Highway Maintenance Workers',18,1,61910,58960,38240,46870,76160,88090],
['Rail-Track Laying/Maintenance',18,1,77340,84840,57030,68210,84840,84840],
['First-Line Supvrs, Mechanics',19,1,94960,91970,52880,72350,119550,138440],
['Computer/ATM/Office Machine Repairers',19,3,61840,62520,38800,46470,73840,78210],
['Radio/Cellular/Tower Equipment Installers',19,3,93290,101390,58810,76920,111640,115890],
['Telecom Equipment Installers',19,3,72310,65250,45120,52020,89560,110040],
['Avionics Technicians',19,3,91300,97870,45300,79320,117780,127520],
['Security/Fire Alarm Installers',19,2,69560,71550,46860,54460,81660,93850],
['Aircraft Mechanics/Service Technicians',19,3,106180,98730,66900,80670,127790,130540],
['Automotive Body/Related Repairers',19,2,61340,57910,33280,45390,75590,99950],
['Automotive Service Technicians/Mechanics',19,2,61890,59110,35340,42590,76750,94630],
['Bus/Truck Mechanics/Diesel Engine',19,2,73390,73920,50570,60470,86650,92140],
['Farm Equipment Mechanics',19,2,63900,67010,42950,54820,73780,76230],
['Mobile Heavy Equipment Mechanics',19,2,77310,75610,49470,61650,91040,98220],
['HVAC/Refrigeration Mechanics',19,2,74560,74090,48800,55700,89750,102870],
['Home Appliance Repairers',19,2,64850,61710,39720,44900,80830,98080],
['Industrial Machinery Mechanics',19,2,75490,72710,48810,59790,89450,103020],
['Millwrights',19,2,84900,86020,47500,70920,94360,117260],
['Electrical Power-Line Installers',19,2,109360,119760,60560,87550,132820,138790],
['Telecom Line Installers/Repairers',19,2,94110,107690,47800,81690,109370,116250],
['Medical Equipment Repairers',19,3,71040,66720,44310,57010,82400,102000],
['Maintenance/Repair Workers, General',19,1,60220,58900,37820,45660,71950,85950],
['Locksmiths/Safe Repairers',19,2,61160,59880,37770,46300,67500,90800],
['Riggers',19,2,103070,103050,58780,80320,117650,134580],
['Signal/Track Switch Repairers',19,1,93610,92280,92280,92280,92280,104860],
['Electrical/Electronics Repairers, Powerhouse',19,3,102570,99360,80940,86260,124260,130240],
['Control/Valve Installers/Repairers',19,3,98280,104520,60890,83890,115070,126570],
['Commercial Divers',19,3,138990,154000,67220,153970,154010,154010],
['Helpers, Installation/Maintenance',19,0,47570,46290,34790,37690,52450,64530],
['First-Line Supvrs, Production',20,1,84790,79560,49530,62980,99970,124660],
['Electrical/Electronic Assemblers',20,1,47090,45130,33480,37310,55240,64920],
['Miscellaneous Assemblers/Fabricators',20,1,43730,39520,32310,35790,47480,59450],
['Bakers',20,1,42770,39200,33450,36440,46340,57800],
['Butchers/Meat Cutters',20,1,47130,41860,31730,36340,59150,66260],
['Food Batchmakers',20,1,39910,37190,32680,34310,43460,51710],
['Machinists',20,2,65900,62320,44680,49760,77900,93330],
['Tool/Die Makers',20,2,76290,76110,49450,60220,91040,102440],
['Welders/Cutters/Solderers',20,2,67830,60840,41550,51270,76270,96590],
['Prepress Technicians/Workers',20,3,58070,56160,36470,43720,73460,81010],
['Printing Press Operators',20,2,54890,50130,37160,44240,62110,75910],
['Laundry/Dry-Cleaning Workers',20,1,37350,34320,31470,33290,37410,45910],
['Sewing Machine Operators',20,1,40020,36510,31470,35110,44530,50840],
['Tailors/Dressmakers/Custom Sewers',20,1,61180,60320,34510,44040,73420,91500],
['Fabric/Apparel Patternmakers',20,3,99400,101620,56990,75590,123980,144240],
['Cabinetmakers/Bench Carpenters',20,1,61010,59340,45780,47920,71000,82280],
['Power Plant Operators',20,3,122870,128340,84260,106730,135690,155010],
['Stationary Engineers/Boiler Operators',20,2,105590,103880,64350,78820,139030,144740],
['Water/Wastewater Treatment Operators',20,3,79170,82830,49800,61760,98390,99180],
['Chemical Equipment Operators',20,1,53820,48210,34880,38290,63550,76980],
['Inspectors/Testers/Sorters/Weighers',20,1,54530,49620,36070,39870,62400,78250],
['Jewelers/Precious Stone Workers',20,1,60850,49020,35990,35990,78320,98400],
['Dental Laboratory Technicians',20,3,60220,56800,36810,42800,65080,96660],
['Ophthalmic Laboratory Technicians',20,1,39410,37020,32090,36210,40240,48380],
['Packaging/Filling Machine Operators',20,1,43160,38810,34100,35940,47070,56930],
['CNC Tool Operators',20,2,58350,58070,37500,48180,64600,78410],
['CNC Tool Programmers',20,2,70370,68760,36100,53230,82940,99330],
['Production Workers, Other',20,1,43270,38710,32380,35940,46050,59600],
['First-Line Supvrs, Transportation',21,1,71830,67090,45890,53750,84990,104000],
['Airline Pilots/Copilots/Flight Engineers',21,4,291240,0,119040,174430,0,0],
['Commercial Pilots',21,3,231160,224840,79820,154690,0,0],
['Air Traffic Controllers',21,3,162160,180090,70050,121180,212580,221890],
['Airfield Operations Specialists',21,3,50310,41450,40980,40980,62690,66060],
['Flight Attendants',21,1,128190,128050,61480,84920,162690,162690],
['Driver/Sales Workers',21,1,45150,43480,31950,34960,51140,60060],
['Heavy/Tractor-Trailer Truck Drivers',21,1,69180,65220,48560,58920,77670,91570],
['Light Truck Drivers',21,1,52020,46870,35980,43330,58020,75460],
['Bus Drivers, School',21,1,59010,59600,46140,50760,65020,75470],
['Bus Drivers, Transit/Intercity',21,1,71410,70700,53020,63020,82640,82640],
['Shuttle Drivers/Chauffeurs',21,1,48480,44600,34110,36980,52910,69580],
['Locomotive Engineers',21,1,64950,63750,59560,63290,63860,63860],
['Railroad Conductors/Yardmasters',21,1,72850,78050,54170,64010,78050,78050],
['Subway/Streetcar Operators',21,1,87620,87940,87940,87940,87940,87940],
['Sailors/Marine Oilers',21,1,63130,61090,42960,47660,71810,83420],
['Captains/Mates of Water Vessels',21,2,106820,106590,47150,75450,133530,166080],
['Ship Engineers',21,3,124990,131650,79810,105620,139370,173590],
['Parking Attendants',21,1,36700,35300,31950,34230,38230,43730],
['Automotive/Watercraft Service Attendants',21,1,37280,36000,31470,32500,39090,45280],
['Aircraft Service Attendants',21,1,47200,45380,39050,40710,53350,57150],
['Transportation Inspectors',21,3,86400,91150,55230,85750,91150,95460],
['Industrial Truck/Tractor Operators',21,1,52800,47780,37340,42600,61880,72980],
['Cleaners of Vehicles/Equipment',21,1,44150,39490,33650,35220,45760,70420],
['Laborers/Freight/Material Movers',21,0,44880,41270,32900,36310,48060,62070],
['Packers/Packagers, Hand',21,0,40040,42290,31480,34500,43170,45240],
['Stockers/Order Fillers',21,0,41550,38210,33280,35480,45070,55660],
['Refuse/Recyclable Material Collectors',21,1,63930,63670,38490,45710,83990,84390],
['Crane/Tower Operators',21,2,132880,94370,64330,83760,149620,213660]
];

let sortField='name';
let charts={};

['sgf','gf'].forEach(id=>{
  const s=document.getElementById(id);
  GROUPS.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=g;s.appendChild(o);});
});

const fmt  = n => n ? '$'+(n>=1000 ? Math.round(n/1000)+'K' : n) : '—';
const fmtF = n => n ? '$'+n.toLocaleString() : '—';
const setSF = f => { sortField=f; renderTable(); };

function getFiltered(qId, efId, gfId) {
  const q  = (document.getElementById(qId).value||'').toLowerCase();
  const ef = parseInt(document.getElementById(efId).value);
  const gf = parseInt(document.getElementById(gfId).value);
  return D.filter(d=>{
    if(ef>=0 && d[2]!==ef) return false;
    if(gf>=0 && d[1]!==gf) return false;
    if(q && !d[0].toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderMetrics(){
  const cnt=Array(7).fill(0); D.forEach(d=>cnt[d[2]]++);
  const wm=D.filter(d=>d[3]>0);
  const avg=Math.round(wm.reduce((s,d)=>s+d[3],0)/wm.length);
  const med=D.filter(d=>d[4]>0).sort((a,b)=>a[4]-b[4]);
  const mmed=med[Math.floor(med.length/2)][4];
  document.getElementById('metricBar').innerHTML=`
    <div class="metric"><div class="ml">occupations</div><div class="mv">${D.length}</div><div class="ms">across 22 major groups</div></div>
    <div class="metric"><div class="ml">avg mean wage</div><div class="mv">${fmt(avg)}</div><div class="ms">all occupations</div></div>
    <div class="metric"><div class="ml">median of medians</div><div class="mv">${fmt(mmed)}</div><div class="ms">middle occupation</div></div>
    <div class="metric"><div class="ml">require bachelor's+</div><div class="mv">${cnt[4]+cnt[5]+cnt[6]}</div><div class="ms">${Math.round((cnt[4]+cnt[5]+cnt[6])/D.length*100)}% of all jobs</div></div>`;
}

function renderSpread(){
  const ssort = document.getElementById('ssort').value;
  const limit = parseInt(document.getElementById('slimit').value);
  let rows = getFiltered('sq','sef','sgf');
  if(ssort==='mean')   rows.sort((a,b)=>(b[3]||0)-(a[3]||0));
  else if(ssort==='median') rows.sort((a,b)=>(b[4]||0)-(a[4]||0));
  else if(ssort==='p10')    rows.sort((a,b)=>(b[5]||0)-(a[5]||0));
  else if(ssort==='spread') rows.sort((a,b)=>{
    const sa=(a[8]||a[7]||0)-(a[5]||0), sb=(b[8]||b[7]||0)-(b[5]||0); return sb-sa;
  });
  else if(ssort==='edu') rows.sort((a,b)=>b[2]-a[2]);
  else rows.sort((a,b)=>a[0].localeCompare(b[0]));

  const display = rows.filter(d=>d[5]>0).slice(0,limit);
  document.getElementById('spread-count').textContent =
    `Showing ${display.length} of ${rows.filter(d=>d[5]>0).length} occupations with full percentile data`;

  const h = Math.max(380, display.length*22+60);
  document.getElementById('spreadWrap').style.height = h+'px';

  if(charts.spread) charts.spread.destroy();
  charts.spread = new Chart(document.getElementById('spreadChart'),{
    type:'bar',
    data:{
      labels: display.map(d=>d[0]),
      datasets:[
        {label:'P10–P25', data:display.map(d=>d[5]&&d[6]?[d[5],d[6]]:[0,0]),
          backgroundColor:display.map(d=>EL[d[2]]), borderWidth:0, barPercentage:.6, categoryPercentage:.85},
        {label:'P25–Median', data:display.map(d=>d[6]&&d[4]?[d[6],d[4]]:[0,0]),
          backgroundColor:display.map(d=>EC[d[2]]), borderWidth:0, barPercentage:.6, categoryPercentage:.85},
        {label:'Median–P75', data:display.map(d=>d[4]&&d[7]?[d[4],d[7]]:[0,0]),
          backgroundColor:display.map(d=>EC[d[2]]+'99'), borderWidth:0, barPercentage:.6, categoryPercentage:.85},
        {label:'P75–P90', data:display.map(d=>d[7]&&d[8]?[d[7],d[8]]:[0,0]),
          backgroundColor:display.map(d=>EL[d[2]]), borderWidth:0, borderRadius:{topRight:3,bottomRight:3}, barPercentage:.6, categoryPercentage:.85},
        {label:'Median', type:'scatter', data:display.map((d,i)=>({x:d[4]||d[3]||0,y:i})),
          pointStyle:'rectRot', pointRadius:5, pointBorderWidth:0,
          backgroundColor:display.map(d=>'#fff'), borderColor:display.map(d=>EC[d[2]]), showLine:false, order:0}
      ]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          title: ctx => {
            const d=display[ctx[0].dataIndex];
            return `${d[0]}  ·  ${GROUPS[d[1]]}`;
          },
          label: ctx => {
            const d=display[ctx.dataIndex];
            const names=['P10–P25','P25–Median','Median–P75','P75–P90','Median'];
            if(ctx.datasetIndex===4) return `Median: ${fmtF(d[4])}   Education: ${EDU_L[d[2]]}`;
            const v=ctx.raw;
            return Array.isArray(v) ? `${names[ctx.datasetIndex]}: ${fmtF(v[0])} → ${fmtF(v[1])}` : '';
          }
        }}
      },
      scales:{
        x:{ticks:{callback:v=>'$'+v/1000+'K', color:'#9a9a97', font:{size:10}}, grid:{color:'rgba(0,0,0,.06)'}},
        y:{ticks:{color:'#6b6b6b', font:{size:10}}, grid:{display:false}}
      }
    }
  });
}

function renderTable(){
  let rows = getFiltered('q','ef','gf');
  if(sortField==='mean')   rows.sort((a,b)=>(b[3]||0)-(a[3]||0));
  else if(sortField==='median') rows.sort((a,b)=>(b[4]||0)-(a[4]||0));
  else if(sortField==='edu')    rows.sort((a,b)=>b[2]-a[2]);
  else rows.sort((a,b)=>a[0].localeCompare(b[0]));
  const mx = Math.max(...D.filter(d=>d[3]).map(d=>d[3]));
  document.getElementById('tbl-count').textContent = `Showing ${rows.length} of ${D.length} occupations`;
  document.getElementById('tbody').innerHTML = rows.map(d=>`<tr>
    <td style="white-space:normal;min-width:200px">${d[0]}</td>
    <td><span class="edu-badge" style="background:${EL[d[2]]};color:${EC[d[2]]}">${EDU_S[d[2]]}</span></td>
    <td>${d[3]?`<b>${fmtF(d[3])}</b>`:'—'}</td>
    <td>${fmtF(d[4])}</td>
    <td style="color:#9a9a97">${fmt(d[5])}</td>
    <td style="color:#9a9a97">${fmt(d[6])}</td>
    <td style="color:#9a9a97">${fmt(d[7])}</td>
    <td style="color:#9a9a97">${fmt(d[8])}</td>
    <td style="color:#b0b0ac;font-size:11px;white-space:normal">${GROUPS[d[1]]}</td>
  </tr>`).join('');
}

function renderDist(){
  const cnt=Array(7).fill(0); D.forEach(d=>cnt[d[2]]++);
  if(charts.dnut) charts.dnut.destroy();
  charts.dnut = new Chart(document.getElementById('distChart'),{
    type:'doughnut',
    data:{labels:EDU_L.map((l,i)=>`${l} (${cnt[i]})`), datasets:[{data:cnt, backgroundColor:EC, borderWidth:3, borderColor:'#fff'}]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'right', labels:{font:{size:11}, boxWidth:12, padding:8}}}}
  });
  if(charts.dbar) charts.dbar.destroy();
  charts.dbar = new Chart(document.getElementById('distBar'),{
    type:'bar',
    data:{labels:EDU_S, datasets:[{data:cnt, backgroundColor:EC, borderRadius:5}]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#9a9a97',font:{size:11}}}, y:{ticks:{color:'#9a9a97',font:{size:11}}, grid:{color:'rgba(0,0,0,.06)'}}}}
  });
  // wage box
  const byEdu=Array.from({length:7},()=>[]);
  D.forEach(d=>{ if(d[4]>0) byEdu[d[2]].push(d[4]); });
  byEdu.forEach(a=>a.sort((x,y)=>x-y));
  const pct=(a,p)=>{ if(!a.length)return 0; const i=(p/100)*(a.length-1),lo=Math.floor(i),hi=Math.ceil(i); return Math.round(a[lo]+(a[hi]-a[lo])*(i-lo)); };
  const p25=byEdu.map(a=>pct(a,25)), meds=byEdu.map(a=>pct(a,50)), p75=byEdu.map(a=>pct(a,75));
  if(charts.wbox) charts.wbox.destroy();
  charts.wbox = new Chart(document.getElementById('wageBox'),{
    type:'bar',
    data:{labels:EDU_S, datasets:[
      {label:'base', data:p25, backgroundColor:'transparent', borderWidth:0, stack:'s'},
      {label:'IQR', data:p75.map((v,i)=>v-p25[i]), backgroundColor:EC, borderRadius:5, stack:'s'},
      {label:'Median', type:'scatter', data:meds.map((v,i)=>({x:i,y:v})),
        pointStyle:'rectRot', pointRadius:7, backgroundColor:'#fff', borderColor:EC, borderWidth:2, showLine:false}
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>{
        if(ctx.datasetIndex===2) return `Median of medians: ${fmtF(meds[ctx.dataIndex])}`;
        if(ctx.datasetIndex===1) return `P25–P75: ${fmtF(p25[ctx.dataIndex])} → ${fmtF(p25[ctx.dataIndex]+ctx.raw)}`;
        return '';
      }}}},
      scales:{x:{stacked:true,ticks:{color:'#9a9a97',font:{size:11}}}, y:{stacked:true,ticks:{callback:v=>'$'+v/1000+'K',color:'#9a9a97',font:{size:11}}, grid:{color:'rgba(0,0,0,.06)'}}}}
  });
}

function renderTopPay(){
  const top=D.filter(d=>d[3]>0).sort((a,b)=>b[3]-a[3]).slice(0,25);
  document.getElementById('topLegend').innerHTML=EDU_L.map((l,i)=>
    `<span style="display:flex;align-items:center;gap:5px;background:${EL[i]};color:${EC[i]};padding:3px 9px;border-radius:20px;font-weight:600">
      <span style="width:8px;height:8px;background:${EC[i]};border-radius:50%;flex-shrink:0"></span>${l}
    </span>`).join('');
  if(charts.top) charts.top.destroy();
  charts.top = new Chart(document.getElementById('topChart'),{
    type:'bar',
    data:{labels:top.map(d=>d[0]),
      datasets:[{label:'Annual Mean', data:top.map(d=>d[3]),
        backgroundColor:top.map(d=>EC[d[2]]), borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>`${fmtF(ctx.raw)}  ·  ${EDU_L[top[ctx.dataIndex][2]]}`}}},
      scales:{x:{ticks:{callback:v=>'$'+v/1000+'K',color:'#9a9a97',font:{size:11}}, grid:{color:'rgba(0,0,0,.06)'}},
               y:{ticks:{color:'#6b6b6b',font:{size:11}}, grid:{display:false}}}}
  });
}

function renderFindings(){
  const cnt=Array(7).fill(0); D.forEach(d=>cnt[d[2]]++);
  document.getElementById('findingsBody').innerHTML=`
  <div class="insight"><div class="insight-t">🎓 Bachelor's degree is the most common requirement — but spans the widest wage range</div>
  <div class="insight-b">${cnt[4]} occupations require a bachelor's as the minimum. It covers tutors earning $43K and software developers at $162K median. A bachelor's is necessary but far from sufficient in this labor market.</div></div>
  <div class="insight"><div class="insight-t">📊 The Wage Spread tab reveals hidden inequality within occupations</div>
  <div class="insight-b">Lawyers: P25 starts at $125K but P90 is suppressed (too high to report). Personal Financial Advisors: P10 of $76K to uncapped P90. Contrast with Postal Service Mail Carriers: P10 $40K, P90 $75K — an extremely tight, stable band reflecting federal pay scales.</div></div>
  <div class="insight"><div class="insight-t">🔧 Certificates outperform many bachelor's-required jobs on wage floor</div>
  <div class="insight-b">Elevator Installers (certificate): P10 $70K, median $127K. Electrical Power-Line Installers: P10 $61K, median $120K. These roles beat most bachelor's-required office jobs on the low end, reflecting strong union contracts and persistent demand.</div></div>
  <div class="insight"><div class="insight-t">💊 Healthcare Support has the most compressed wage spreads of any sector</div>
  <div class="insight-b">Home Health Aides: P10 $35K to P90 $45K — a $10K range across the entire distribution. These roles show almost no upside from experience or seniority, making wage growth nearly impossible without changing occupations.</div></div>
  <div class="insight"><div class="insight-t">🎭 Arts & Media show winner-take-most economics in their wage structure</div>
  <div class="insight-b">News Reporters: mean $300K but median only $104K. Broadcast Announcers: P25 $47K but mean $211K. A handful of highly paid stars distort the average dramatically — the median tells the real story for most people in these fields.</div></div>
  <div class="insight"><div class="insight-t">🚌 Bay Area transit wages are compressed at a high level by union contracts</div>
  <div class="insight-b">Subway/Streetcar Operators show P10 through P90 all at exactly $87,940 — BART/MUNI's rigid step-based pay scale. Bus Drivers Transit: P10 $53K, P90 $83K. Exceptional stability compared to private-sector equivalents nationally.</div></div>
  <div class="insight"><div class="insight-t">📍 This dataset is almost certainly the SF Bay Area</div>
  <div class="insight-b">High location quotients for Software Developers, Financial Risk Specialists (3.32×), Fashion Designers (5×), and Subway/Streetcar Operators (7×) all point to the SF–Oakland–Hayward MSA — a tech hub with a major financial sector, apparel industry, and the BART/MUNI transit systems.</div></div>`;
}

function sw(id){
  document.querySelectorAll('.tab,.pnl').forEach(e=>e.classList.remove('act'));
  document.querySelector(`[onclick="sw('${id}')"]`).classList.add('act');
  document.getElementById(id).classList.add('act');
  if(id==='spread') renderSpread();
  if(id==='dist')   renderDist();
  if(id==='toppay') renderTopPay();
  if(id==='findings') renderFindings();
}

renderMetrics();
renderSpread();
</script>
</body>
</html>"""

with open('/mnt/user-data/outputs/wage-explorer.html', 'w') as f:
    f.write(html)
print("Done — file written")
PYEOF
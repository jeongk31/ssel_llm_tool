"""Multi-page admin dashboard (served at /admin). Data is injected as JSON where
the /*__DATA__*/ placeholder appears; all rendering happens client-side."""

ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ChAT — Admin</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsvectormap@1.5.3/dist/css/jsvectormap.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsvectormap@1.5.3/dist/js/jsvectormap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsvectormap@1.5.3/dist/maps/world.js"></script>
<style>
  :root{--pur:#7c3aed;--pur2:#a78bfa;--bg:#f4f5f7;--ink:#18181b;--mut:#71717a;--line:#e3e5ea}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);display:flex;min-height:100vh}
  a{color:var(--pur);text-decoration:none}
  /* sidebar */
  .side{width:210px;background:#1b1030;color:#e9e3f5;padding:20px 12px;flex-shrink:0;position:sticky;top:0;height:100vh}
  .side h2{font-size:15px;margin:0 0 2px;color:#fff}
  .side .tag{font-size:10px;color:#b9a7e6;text-transform:uppercase;letter-spacing:.08em;margin-bottom:20px}
  .nav{display:flex;flex-direction:column;gap:3px}
  .nav button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;
    color:#cdc2e8;font-size:13px;padding:9px 11px;border-radius:7px;cursor:pointer;font-family:inherit}
  .nav button:hover{background:#2a1b45}
  .nav button.active{background:var(--pur);color:#fff}
  .nav .badge{margin-left:auto;background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px}
  /* main */
  .main{flex:1;padding:26px 30px;overflow:auto}
  .view{display:none} .view.active{display:block}
  h1{font-size:19px;margin:0 0 3px} .sub{color:var(--mut);font-size:12px;margin-bottom:20px}
  h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--pur);margin:20px 0 8px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
  .card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px}
  .card .v{font-size:28px;font-weight:700;line-height:1.1} .card .l{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin-top:4px}
  .panel{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px}
  .charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:8px}
  .chart-box{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .chart-box h4{margin:0 0 10px;font-size:12px;color:var(--mut);font-weight:600}
  #worldmap{height:460px;width:100%}
  table{border-collapse:collapse;width:100%;font-size:12.5px;background:#fff}
  .tbl-wrap{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:auto}
  td,th{padding:7px 12px;border-bottom:1px solid #f1f1f4;text-align:left;white-space:nowrap}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa;background:#fafafa;position:sticky;top:0}
  .mono{font-family:ui-monospace,Menlo,monospace} .muted{color:#a1a1aa}
  .ev{font-size:10px;font-weight:600;padding:1px 8px;border-radius:10px}
  .ev-visit{background:#e0e7ff;color:#3730a3} .ev-run{background:#dcfce7;color:#166534}
  .small{font-size:10.5px;max-width:230px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:bottom}
  /* messages */
  #msg-list{max-width:820px}
  .msg{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:12px}
  .msg-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:10px}
  .msg-who{display:flex;flex-direction:column;gap:2px;min-width:0}
  .msg-name{font-weight:700;font-size:14px;color:var(--ink)}
  .msg-email{font-size:12.5px;color:var(--mut);word-break:break-all}
  .msg-meta{display:flex;align-items:center;gap:10px;flex-shrink:0}
  .msg-when{font-size:11px;color:#a1a1aa;white-space:nowrap}
  .msg-title{font-weight:600;font-size:13.5px;color:var(--ink);margin:0 0 6px;padding-top:10px;border-top:1px solid #f1f1f4}
  .msg-body{font-size:13px;color:#3f3f46;line-height:1.6;white-space:pre-wrap;word-wrap:break-word}
  .msg-actions{display:flex;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid #f1f1f4}
  .st{font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:10px;text-transform:uppercase;letter-spacing:.03em}
  .st-unresolved{background:#fef3c7;color:#b45309} .st-resolved{background:#dcfce7;color:#166534}
  .btn{font-family:inherit;font-size:12px;font-weight:600;border-radius:7px;padding:6px 12px;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink)}
  .btn:hover{border-color:#c9a8e6}
  .btn-p{background:var(--pur);color:#fff;border-color:var(--pur)}
  .filter{display:flex;gap:6px;margin-bottom:14px}
  .filter button{font-size:12px;padding:5px 12px;border-radius:20px;border:1px solid var(--line);background:#fff;color:var(--mut);cursor:pointer}
  .filter button.active{background:var(--pur);color:#fff;border-color:var(--pur)}
  .empty{color:#a1a1aa;padding:30px;text-align:center}
</style></head>
<body>
<div class="side">
  <h2>ChAT Admin</h2>
  <div class="tag">Usage &amp; messages</div>
  <div class="nav">
    <button data-view="home" class="active">🏠 Home</button>
    <button data-view="analytics">📊 Analytics</button>
    <button data-view="map">🌍 Map</button>
    <button data-view="logs">📜 Event logs</button>
    <button data-view="messages">✉️ Messages <span class="badge" id="msg-badge" style="display:none"></span></button>
  </div>
</div>
<div class="main">
  <!-- HOME -->
  <section class="view active" id="view-home">
    <h1>Overview</h1>
    <div class="sub">Metadata only — no API keys or dataset content is stored. Times in UAE (GST, UTC+4).</div>
    <div class="cards" id="home-cards"></div>
    <h3>Activity over time</h3>
    <div class="chart-box"><canvas id="c-home-day" height="90"></canvas></div>
  </section>
  <!-- ANALYTICS -->
  <section class="view" id="view-analytics">
    <h1>Analytics</h1>
    <div class="sub">Coding runs broken down by configuration.</div>
    <div class="charts">
      <div class="chart-box"><h4>Events by day</h4><canvas id="c-day"></canvas></div>
      <div class="chart-box"><h4>Runs by provider</h4><canvas id="c-provider"></canvas></div>
      <div class="chart-box"><h4>Runs by model</h4><canvas id="c-model"></canvas></div>
      <div class="chart-box"><h4>Runs by aggregation</h4><canvas id="c-agg"></canvas></div>
      <div class="chart-box"><h4>Runs per model (count)</h4><canvas id="c-rpm"></canvas></div>
      <div class="chart-box"><h4>Top countries</h4><canvas id="c-country"></canvas></div>
    </div>
  </section>
  <!-- MAP -->
  <section class="view" id="view-map">
    <h1>Where it's used</h1>
    <div class="sub">Events by country (best-effort from visitor IP).</div>
    <div class="panel"><div id="worldmap"></div></div>
    <h3>By country</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Country</th><th>Events</th></tr></thead><tbody id="country-rows"></tbody></table></div>
  </section>
  <!-- LOGS -->
  <section class="view" id="view-logs">
    <h1>Event log</h1>
    <div class="sub" id="logs-sub"></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>When (UAE)</th><th>Event</th><th>Session</th><th>Location</th><th>IP</th><th>Models</th><th>Runs</th><th>Agg</th><th>Vars</th><th>Rows</th><th>Episodes</th><th>Per-sender</th><th>User agent</th></tr></thead>
      <tbody id="log-rows"></tbody>
    </table></div>
  </section>
  <!-- MESSAGES -->
  <section class="view" id="view-messages">
    <h1>Questions &amp; concerns</h1>
    <div class="sub">Submissions from the contact form. Mark them resolved once handled; use “Reply” to email the sender.</div>
    <div class="filter">
      <button data-filter="all" class="active">All</button>
      <button data-filter="unresolved">Unresolved</button>
      <button data-filter="resolved">Resolved</button>
    </div>
    <div id="msg-list"></div>
  </section>
</div>

<script id="chat-data" type="application/json">/*__DATA__*/</script>
<script>
const DATA = JSON.parse(document.getElementById('chat-data').textContent);
const S = DATA.stats, MSGS = DATA.messages;
const PUR = '#7c3aed', PALETTE = ['#7c3aed','#a78bfa','#c4b5fd','#f0abfc','#60a5fa','#34d399','#fbbf24','#f87171'];

// ---- nav ----
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + b.dataset.view).classList.add('active');
  if (b.dataset.view === 'map') setTimeout(initMap, 30);  // init once the tab is visible & sized
}));

// ---- helpers ----
function el(tag, cls, txt){ const e = document.createElement(tag); if(cls) e.className = cls; if(txt!=null) e.textContent = txt; return e; }
function card(v, l){ const c = el('div','card'); c.appendChild(el('div','v', v)); c.appendChild(el('div','l', l)); return c; }
function entries(o){ return Object.entries(o || {}); }

// ---- home ----
const counts = DATA.counts;
const homeStats = [
  [S.visits,'Visits'], [S.unique_visitors,'Unique visitors'], [S.countries,'Countries'],
  [S.runs,'Coding runs'], [S.sessions_that_ran,'Sessions that ran'], [counts.unresolved,'Open messages'],
];
const hc = document.getElementById('home-cards');
homeStats.forEach(([v,l]) => hc.appendChild(card(v, l)));

// ---- charts ----
function mkChart(id, type, labels, data, opts){
  const c = document.getElementById(id); if(!c || !window.Chart) return;
  new Chart(c, { type, data: { labels, datasets: [{ data,
    backgroundColor: type==='line' ? 'rgba(124,58,237,.12)' : labels.map((_,i)=>PALETTE[i%PALETTE.length]),
    borderColor: PUR, borderWidth: type==='line'?2:0, fill: type==='line', tension:.3,
    pointRadius: type==='line'?2:0 }] },
    options: Object.assign({ responsive:true, plugins:{legend:{display:type==='doughnut', position:'bottom', labels:{boxWidth:10,font:{size:10}}}},
      scales: type==='doughnut'?{}:{ y:{beginAtZero:true,ticks:{precision:0}} } }, opts||{}) });
}
try {
  const days = entries(S.by_day);
  mkChart('c-home-day','line', days.map(d=>d[0]), days.map(d=>d[1]));
  mkChart('c-day','line', days.map(d=>d[0]), days.map(d=>d[1]));
  const prov = entries(S.by_provider); mkChart('c-provider','doughnut', prov.map(x=>x[0]), prov.map(x=>x[1]));
  const mod = entries(S.by_model); mkChart('c-model','bar', mod.map(x=>x[0]), mod.map(x=>x[1]));
  const agg = entries(S.by_aggregation); mkChart('c-agg','doughnut', agg.map(x=>x[0]), agg.map(x=>x[1]));
  const rpm = entries(S.by_runs_per_model); mkChart('c-rpm','bar', rpm.map(x=>x[0]), rpm.map(x=>x[1]));
  const ctry = entries(S.by_country).slice(0,10); mkChart('c-country','bar', ctry.map(x=>x[0]), ctry.map(x=>x[1]));
} catch(e){ console.warn('charts', e); }

// ---- map (init lazily when the tab is visible so it can measure its size) ----
let mapInited = false;
function initMap(){
  if (mapInited) return; mapInited = true;
  try {
    if (!window.jsVectorMap) { console.warn('jsVectorMap not loaded'); return; }
    const cc = S.by_country_code || {}; const values = {};
    Object.keys(cc).forEach(k => { values[k.toUpperCase()] = cc[k]; values[k.toLowerCase()] = cc[k]; });
    new jsVectorMap({ selector:'#worldmap', map:'world', zoomButtons:true,
      regionStyle:{ initial:{ fill:'#e5e7eb', stroke:'#fff', strokeWidth:.4 } },
      series:{ regions:[{ attribute:'fill', scale:['#ddd6fe', PUR], normalizeFunction:'polynomial', values }] },
      onRegionTooltipShow(ev, tooltip, code){
        try { tooltip.text(tooltip.text() + ' — ' + (values[code] || 0) + ' events'); } catch(e){}
      } });
  } catch(e){ console.warn('map', e); mapInited = false; }
}
const crows = document.getElementById('country-rows');
entries(S.by_country).forEach(([k,v]) => { const tr = el('tr'); tr.appendChild(el('td',null,k)); tr.appendChild(el('td',null,String(v))); crows.appendChild(tr); });
if(!entries(S.by_country).length) crows.innerHTML = '<tr><td colspan="2" class="muted">No data yet</td></tr>';

// ---- logs ----
document.getElementById('logs-sub').textContent = 'Latest ' + S.events.length + ' events.';
const lrows = document.getElementById('log-rows');
S.events.forEach(r => {
  const tr = el('tr');
  const loc = (r.country || '') + (r.city ? ' · ' + r.city : '') || '—';
  const badge = el('span', 'ev ev-' + r.event, r.event);
  [r.at, null, r.session, loc, r.ip, (r.models||[]).join(', ')||'—', r.runs_per_model||'', r.aggregation||'',
   r.variables||'', r.rows||'', r.episodes||'', r.per_sender?'yes':''].forEach((val,i) => {
    const td = el('td'); if(i===1){ td.appendChild(badge); } else if(i===4){ td.className='mono'; td.textContent=val; } else { td.textContent = val; } tr.appendChild(td);
  });
  const ua = el('td'); const s = el('span','small', r.user_agent||''); ua.appendChild(s); tr.appendChild(ua);
  lrows.appendChild(tr);
});
if(!S.events.length) lrows.innerHTML = '<tr><td colspan="13" class="muted">No events yet</td></tr>';

// ---- messages ----
let msgFilter = 'all';
document.querySelectorAll('.filter button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.filter button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); msgFilter = b.dataset.filter; renderMessages();
}));
function updateBadge(){
  const n = MSGS.filter(m => m.status==='unresolved').length;
  const b = document.getElementById('msg-badge');
  if(n>0){ b.style.display='inline-block'; b.textContent = n; } else { b.style.display='none'; }
}
async function toggleStatus(m, btn){
  const next = m.status==='resolved' ? 'unresolved' : 'resolved';
  btn.disabled = true;
  try {
    const res = await fetch('/admin/messages/' + encodeURIComponent(m.id) + '/status',
      { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status: next}) });
    if(!res.ok) throw new Error('failed');
    m.status = next; renderMessages(); updateBadge();
  } catch(e){ alert('Could not update status.'); btn.disabled=false; }
}
function renderMessages(){
  const list = document.getElementById('msg-list'); list.innerHTML = '';
  const items = MSGS.filter(m => msgFilter==='all' || m.status===msgFilter);
  if(!items.length){ list.appendChild(el('div','empty','No messages.')); return; }
  items.forEach(m => {
    const box = el('div','msg');
    const top = el('div','msg-top');
    const who = el('div','msg-who');
    who.appendChild(el('span','msg-name', m.name || 'Anonymous'));
    who.appendChild(el('span','msg-email', m.email || ''));
    const meta = el('div','msg-meta');
    meta.appendChild(el('span', 'st st-' + m.status, m.status));
    meta.appendChild(el('span','msg-when', m.at || ''));
    top.appendChild(who); top.appendChild(meta);
    box.appendChild(top);
    if(m.title){ box.appendChild(el('div','msg-title', m.title)); }
    box.appendChild(el('div','msg-body', m.body || ''));
    const actions = el('div','msg-actions');
    const reply = el('a','btn btn-p','↩ Reply by email');
    reply.href = 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + (m.title || 'Your message to ChAT'));
    actions.appendChild(reply);
    const tog = el('button','btn', m.status==='resolved' ? 'Mark unresolved' : 'Mark resolved');
    tog.addEventListener('click', () => toggleStatus(m, tog));
    actions.appendChild(tog);
    box.appendChild(actions);
    list.appendChild(box);
  });
}
renderMessages(); updateBadge();
</script>
</body></html>"""

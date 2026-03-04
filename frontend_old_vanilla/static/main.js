/* ============================================================
   Lead-Lag Signal Platform — Main Application JS
   Attijariwafa Bank | Quant Research Division
   ============================================================ */

const API = '';  // same origin

// ── State ──────────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  pairs: [], hub: [], grangerScores: [],
  corrMatrix: null, regimes: [],
  stationarity: [], summary: {},
  sortCol: null, sortDir: 1,
  filterText: '', filterCat: 'all'
};

// ── Color helpers ───────────────────────────────────────────
const CAT_COLORS = {
  Indices: '#3b82f6', FX_G10: '#8b5cf6', Commodites: '#f97316',
  Bonds: '#10b981', Cryptos: '#f5a623'
};
function catColor(cat) { return CAT_COLORS[cat] || '#8890a8'; }
function scoreColor(s) {
  if (s >= 0.75) return '#00d68f';
  if (s >= 0.55) return '#f5a623';
  return '#C8102E';
}
function corrColor(v) {
  if (v === null) return '#0a0e1a';
  const abs = Math.abs(v);
  if (v > 0) return `rgba(59,130,246,${Math.min(abs,1)*0.9})`;
  return `rgba(200,16,46,${Math.min(abs,1)*0.9})`;
}
function fmtNum(n, dec=4) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(dec);
}
function fmtPct(n) {
  if (n === null || isNaN(n)) return '—';
  return (Number(n)*100).toFixed(2)+'%';
}

// ── Navigation ──────────────────────────────────────────────
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  // Update topbar title
  const titles = {
    dashboard: 'Dashboard', pairs: 'Leader/Follower Pairs',
    network: 'Leadership Network', granger: 'Granger Scorecard',
    correlation: 'Correlation Matrix', regimes: 'Market Regimes',
    signals: 'Signal Scanner', stationarity: 'Statistical Tests'
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  loadPage(page);
}

// ── Data loading ────────────────────────────────────────────
async function fetchJSON(url) {
  try {
    const r = await fetch(API + url);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  } catch(e) { console.error('Fetch error:', url, e); return null; }
}

async function loadAll() {
  const [summary, pairs, hub, granger] = await Promise.all([
    fetchJSON('/api/summary_stats'),
    fetchJSON('/api/pairs'),
    fetchJSON('/api/hub'),
    fetchJSON('/api/granger_scores')
  ]);
  state.summary = summary || {};
  state.pairs   = pairs || [];
  state.hub     = hub || [];
  state.grangerScores = granger || [];
  renderSummaryKPIs();
  updateRegimeBadge(state.summary.current_regime);
}

async function loadPage(page) {
  if (page === 'dashboard') renderDashboard();
  else if (page === 'pairs') renderPairsPage();
  else if (page === 'network') renderNetwork();
  else if (page === 'granger') renderGranger();
  else if (page === 'correlation') await renderCorrelation();
  else if (page === 'regimes') await renderRegimes();
  else if (page === 'signals') renderSignals();
  else if (page === 'stationarity') await renderStationarity();
}

// ── Regime badge ─────────────────────────────────────────────
function updateRegimeBadge(regime) {
  const dot = document.getElementById('regime-dot');
  const txt = document.getElementById('regime-txt');
  if (!dot || !txt) return;
  if (!regime) { txt.textContent = 'Loading...'; return; }
  txt.textContent = regime;
  dot.className = 'regime-dot';
  if (regime.includes('Bull')) dot.classList.add('bull');
  else if (regime.includes('Bear')) dot.classList.add('bear');
  else dot.classList.add('trans');
}

// ── DASHBOARD ───────────────────────────────────────────────
function renderSummaryKPIs() {
  const s = state.summary;
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-pairs', s.official_pairs ?? '—');
  set('kpi-hub', s.hub_relationships ?? '—');
  set('kpi-granger', s.granger_significant ?? '—');
  set('kpi-assets', s.assets_covered ?? '—');
  set('kpi-leader', s.top_leader ?? '—');
  set('kpi-regime', s.current_regime ?? '—');
}

function renderDashboard() {
  renderTopPairsChart();
  renderLeaderRankingChart();
}

function renderTopPairsChart() {
  const canvas = document.getElementById('chart-top-pairs');
  if (!canvas || !state.pairs.length) return;
  if (canvas._chart) canvas._chart.destroy();

  const sorted = [...state.pairs].sort((a,b)=>b.Score_Final-a.Score_Final);
  const labels = sorted.map(p=>`${p.Leader}→${p.Follower}`);
  const scores = sorted.map(p=>p.Score_Final);
  const colors = sorted.map(p=>catColor(p.Cat_Leader));

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Composite Score',
        data: scores,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{
        callbacks:{label: ctx=>' Score: '+ctx.raw.toFixed(4)}
      }},
      scales: {
        x: { grid:{color:'rgba(255,255,255,0.03)'}, ticks:{color:'#8890a8',font:{size:11}} },
        y: { grid:{display:false}, ticks:{color:'#e8eaf0',font:{size:11,weight:'600'}} }
      }
    }
  });
}

function renderLeaderRankingChart() {
  const el = document.getElementById('leader-ranking');
  if (!el || !state.grangerScores.length) return;
  const top = state.grangerScores.slice(0,12);
  const maxNet = Math.max(...top.map(r=>Math.abs(r.Net||0)));
  el.innerHTML = top.map((r,i)=>{
    const net = r.Net || 0;
    const pct = maxNet>0 ? Math.abs(net)/maxNet*100 : 0;
    const clr = net>0 ? '#00d68f' : '#C8102E';
    return `<div class="ranking-item">
      <span class="ranking-rank">${i+1}</span>
      <span class="ranking-label">${r.Asset||'—'}</span>
      <div class="ranking-bar-wrap">
        <div class="ranking-bar" style="width:${pct}%;background:${clr}">
          <span>${net > 0 ? '+'+net : net}</span>
        </div>
      </div>
      <span class="ranking-val" style="color:${clr}">${net>0?'+':''+(net||0)}</span>
    </div>`;
  }).join('');
}

// ── PAIRS PAGE ───────────────────────────────────────────────
function renderPairsPage() {
  renderPairsTable(state.pairs);
}

function renderPairsTable(data) {
  const tbody = document.getElementById('pairs-tbody');
  if (!tbody) return;
  if (!data.length) { tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:40px;color:#4a5168">No data</td></tr>'; return; }

  tbody.innerHTML = data.map(r=>{
    const score = r.Score_Final||0;
    return `<tr>
      <td><strong>${r.Leader}</strong></td>
      <td><span class="badge badge-blue">${r.Cat_Leader}</span></td>
      <td>${r.Follower}</td>
      <td><span class="badge badge-purple">${r.Cat_Follower}</span></td>
      <td>${(r.Best_AbsCorr||0).toFixed(4)}</td>
      <td><span class="badge badge-gold">${r.Lead_Days}d</span></td>
      <td>${(r.Lag_Gain||0).toFixed(4)}</td>
      <td>${r.Granger_Significant ? '<span class="badge badge-green">✓ Sig</span>' : '<span class="badge badge-red">✗</span>'}</td>
      <td>${r.VAR_Confirmed ? '<span class="badge badge-green">✓ VAR</span>' : '<span class="badge badge-red">✗</span>'}</td>
      <td>
        <div class="score-bar-wrap">
          <div class="score-bar">
            <div class="score-bar-fill" style="width:${score*100}%;background:${scoreColor(score)}"></div>
          </div>
          <span class="score-val" style="color:${scoreColor(score)}">${score.toFixed(3)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── NETWORK GRAPH ─────────────────────────────────────────────
function renderNetwork() {
  const svg = document.getElementById('network-svg');
  if (!svg) return;
  svg.innerHTML = '';

  // Use hub data (pairs with score > 0 = true lead-lag)
  const links = state.hub.filter(r=>r.Optimal_Lag>0 && r.Leadership_Score>0)
    .slice(0,80);
  if (!links.length) {
    svg.innerHTML='<text x="50%" y="50%" fill="#4a5168" text-anchor="middle">No network data</text>';
    return;
  }

  const nodesMap = {};
  links.forEach(l=>{
    if(!nodesMap[l.Leader]) nodesMap[l.Leader]={id:l.Leader,type:'leader',cnt:0};
    if(!nodesMap[l.Follower]) nodesMap[l.Follower]={id:l.Follower,type:'follower',cnt:0};
    nodesMap[l.Leader].cnt++;
  });
  const nodes = Object.values(nodesMap);

  const W = svg.parentElement.offsetWidth || 800;
  const H = 520;

  const svgEl = d3.select(svg)
    .attr('width', W).attr('height', H);

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(90))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(W/2, H/2))
    .force('collision', d3.forceCollide(28));

  const link = svgEl.append('g')
    .selectAll('line').data(links).enter().append('line')
    .attr('class','link')
    .attr('stroke', d=>d.Cross_Corr>0?'rgba(59,130,246,0.5)':'rgba(200,16,46,0.5)')
    .attr('stroke-width', d=>Math.max(1, d.Leadership_Score*4));

  const arrowId = 'arrowhead';
  svgEl.append('defs').append('marker')
    .attr('id',arrowId).attr('viewBox','0 -5 10 10')
    .attr('refX',22).attr('refY',0)
    .attr('markerWidth',4).attr('markerHeight',4)
    .attr('orient','auto')
    .append('path').attr('d','M0,-5L10,0L0,5').attr('fill','rgba(200,16,46,0.7)');
  link.attr('marker-end','url(#'+arrowId+')');

  const node = svgEl.append('g')
    .selectAll('g').data(nodes).enter().append('g').attr('class','node')
    .call(d3.drag()
      .on('start',(event,d)=>{ if(!event.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',(event,d)=>{ d.fx=event.x; d.fy=event.y; })
      .on('end',(event,d)=>{ if(!event.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }));

  node.append('circle')
    .attr('r', d=>d.type==='leader'?16+d.cnt*2:11)
    .attr('fill', d=>d.type==='leader'?'rgba(200,16,46,0.85)':'rgba(59,130,246,0.7)')
    .attr('stroke', d=>d.type==='leader'?'#e83050':'rgba(59,130,246,0.9)')
    .attr('stroke-width', 2);

  node.append('text')
    .text(d=>d.id)
    .attr('dy','0.35em')
    .attr('text-anchor','middle')
    .attr('font-size', d=>d.type==='leader'?'9px':'8px')
    .attr('fill','#fff')
    .attr('font-weight', d=>d.type==='leader'?'700':'400');

  sim.on('tick', ()=>{
    link
      .attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
      .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node.attr('transform',d=>`translate(${d.x},${d.y})`);
  });
}

// ── GRANGER SCORECARD ─────────────────────────────────────────
function renderGranger() {
  const canvas  = document.getElementById('chart-granger');
  const tbody   = document.getElementById('granger-tbody');
  const data    = state.grangerScores;

  if (canvas && data.length) {
    if (canvas._chart) canvas._chart.destroy();
    const sorted = [...data].sort((a,b)=>b.Net-a.Net);
    canvas._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map(r=>r.Asset),
        datasets: [{
          label: 'Net Leadership (Granger)',
          data: sorted.map(r=>r.Net),
          backgroundColor: sorted.map(r=>r.Net>0?'rgba(0,214,143,0.7)':'rgba(200,16,46,0.7)'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#8890a8',font:{size:10},maxRotation:45}},
          y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8890a8'},title:{display:true,text:'Net (Cause - Caused by)',color:'#8890a8'}}
        }
      }
    });
  }

  if (tbody && data.length) {
    tbody.innerHTML = data.map((r,i)=>{
      const net = r.Net||0;
      return `<tr>
        <td>${i+1}</td>
        <td><strong>${r.Asset||'—'}</strong></td>
        <td>${r.Cause||0}</td>
        <td>${r.Cause_par||0}</td>
        <td><span class="${net>0?'positive':'negative'} " style="font-weight:700">${net>0?'+':''+(net)}</span></td>
        <td>${net>5?'<span class="badge badge-green">Strong Leader</span>':net>0?'<span class="badge badge-gold">Leader</span>':net<-5?'<span class="badge badge-red">Strong Follower</span>':'<span class="badge">Neutral</span>'}</td>
      </tr>`;
    }).join('');
  }
}

// ── CORRELATION MATRIX ─────────────────────────────────────────
async function renderCorrelation() {
  const wrap = document.getElementById('corr-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="spinner"></div>';

  const data = await fetchJSON('/api/correlation_matrix');
  if (!data) { wrap.innerHTML='<div class="empty-state"><div class="icon">⚠️</div>Failed to load</div>'; return; }

  const assets = data.assets;
  const n = assets.length;
  const byKey = {};
  data.data.forEach(d=>{ byKey[d.y+'|'+d.x]=d.v; });

  // Build canvas-based heatmap
  const cellSize = Math.floor(Math.min(600, wrap.offsetWidth-40) / n);
  const pad = 80;
  const size = n*cellSize+pad*2;

  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  canvas.style.cssText='max-width:100%;display:block;margin:0 auto;cursor:crosshair';
  wrap.innerHTML=''; wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0,0,size,size);

  // Draw cells
  assets.forEach((row,i)=>{
    assets.forEach((col,j)=>{
      const v = byKey[row+'|'+col];
      ctx.fillStyle = corrColor(v??0);
      ctx.fillRect(pad+j*cellSize, pad+i*cellSize, cellSize-1, cellSize-1);
    });
    // Labels
    ctx.fillStyle='#8890a8'; ctx.font=`${Math.max(8,cellSize-2)}px Inter,sans-serif`;
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText(row.length>7?row.slice(0,6)+'…':row, pad-4, pad+i*cellSize+cellSize/2);
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.save(); ctx.translate(pad+j*cellSize+cellSize/2, pad-4);
    ctx.rotate(-Math.PI/2); ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(col.length>7?col.slice(0,6)+'…':col, 0, 0);
    ctx.restore();
  });

  // Tooltip
  const tooltip = document.getElementById('heatmap-tooltip');
  canvas.addEventListener('mousemove', e=>{
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
    const mx=(e.clientX-rect.left)*scaleX, my=(e.clientY-rect.top)*scaleY;
    const j=Math.floor((mx-pad)/cellSize), i=Math.floor((my-pad)/cellSize);
    if(i>=0&&i<n&&j>=0&&j<n&&tooltip){
      const v=byKey[assets[i]+'|'+assets[j]];
      tooltip.style.display='block';
      tooltip.style.left=e.clientX+14+'px'; tooltip.style.top=e.clientY-8+'px';
      tooltip.innerHTML=`<strong>${assets[i]}</strong> → <strong>${assets[j]}</strong><br>ρ = <span style="color:${v>0?'#3b82f6':'#e8263f'};font-weight:800">${v!=null?v.toFixed(4):'—'}</span>`;
    } else if(tooltip){ tooltip.style.display='none'; }
  });
  canvas.addEventListener('mouseleave',()=>{ if(tooltip) tooltip.style.display='none'; });
}

// ── MARKET REGIMES ─────────────────────────────────────────────
async function renderRegimes() {
  const canvas = document.getElementById('chart-regimes');
  if (!canvas) return;
  if (canvas._chart) canvas._chart.destroy();

  const data = await fetchJSON('/api/market_regimes');
  if (!data || !data.length) return;

  const REGIME_COLORS = ['rgba(200,16,46,0.8)','rgba(0,214,143,0.8)','rgba(245,166,35,0.8)'];
  const REGIME_LABELS = ['Bear / Stress','Bull / Trend','Transition'];

  const labels = data.map(r=>r.Date.slice(0,10));
  const regimeData = data.map(r=>r.Regime);

  // Create background color per point
  const pointColors = regimeData.map(r=>REGIME_COLORS[r]||'#888');

  canvas._chart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [0,1,2].map(regime=>({
        label: REGIME_LABELS[regime],
        data: data.filter(r=>r.Regime===regime).map(r=>({x:r.Date.slice(0,10), y:regime})),
        backgroundColor: REGIME_COLORS[regime],
        pointRadius: 3, pointHoverRadius:5
      }))
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#e8eaf0',font:{size:12}}}},
      scales:{
        x:{type:'category', grid:{color:'rgba(255,255,255,0.03)'}, ticks:{color:'#8890a8',maxTicksLimit:20,font:{size:10}}},
        y:{grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8890a8',stepSize:1,callback:v=>REGIME_LABELS[v]||v}}
      }
    }
  });

  // Stats
  const el = document.getElementById('regime-stats');
  if (el) {
    const counts = [0,1,2].map(r=>data.filter(d=>d.Regime===r).length);
    const total = data.length;
    el.innerHTML = [0,1,2].map(r=>`
      <div class="kpi-card" style="padding:14px">
        <div class="kpi-label">${REGIME_LABELS[r]}</div>
        <div class="kpi-value" style="font-size:22px;color:${REGIME_COLORS[r].replace('0.8','1')}">${counts[r]}</div>
        <div class="kpi-sub">${((counts[r]/total)*100).toFixed(1)}% of time</div>
      </div>`).join('');
  }
}

// ── SIGNAL SCANNER ─────────────────────────────────────────────
function renderSignals() {
  const grid = document.getElementById('signal-grid');
  if (!grid) return;
  const data = state.pairs;
  if (!data.length) { grid.innerHTML='<div class="empty-state"><div class="icon">📡</div><p>No signals</p></div>'; return; }

  grid.innerHTML = data.map(p=>{
    const score = p.Score_Final||0;
    const strong = score>=0.75;
    return `<div class="signal-card fade-in">
      <div class="signal-strength ${strong?'strength-forte':'strength-moderate'}"></div>
      <div class="top">
        <div>
          <span class="badge ${strong?'badge-green':'badge-gold'}">${strong?'🔥 Fort Signal':'📶 Signal'}</span>
          <div class="pair" style="margin-top:8px">
            <span style="color:#3b82f6">${p.Leader}</span>
            <span class="arrow">→</span>
            <span style="color:#8b5cf6">${p.Follower}</span>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:800;color:${scoreColor(score)}">${score.toFixed(3)}</div>
          <div style="font-size:10px;color:#4a5168">Score Final</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <span class="badge badge-blue">${p.Cat_Leader}</span>
        <span class="badge badge-purple">${p.Cat_Follower}</span>
        <span class="badge badge-gold">Lag: ${p.Lead_Days}j</span>
        ${p.Intra_Inter==='Inter'?'<span class="badge badge-green">Inter-catégorie</span>':'<span class="badge">Intra</span>'}
      </div>
      <div class="stats">
        <div class="stat-item">
          <div class="stat-label">Corrélation max</div>
          <div class="stat-value">${fmtNum(p.Best_AbsCorr)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Gain de lag</div>
          <div class="stat-value positive">${fmtNum(p.Lag_Gain)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Score Granger</div>
          <div class="stat-value">${fmtNum(p.Score_Granger)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Score VAR</div>
          <div class="stat-value">${fmtNum(p.Score_VAR)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── STATIONARITY ──────────────────────────────────────────────
async function renderStationarity() {
  const tbody = document.getElementById('stat-tbody');
  const canvas = document.getElementById('chart-stat');
  if (!tbody) return;

  const data = await fetchJSON('/api/stationarity');
  if (!data) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#4a5168">No data</td></tr>'; return; }

  tbody.innerHTML = data.map(r=>{
    const stat = r.Is_Stationary||r.ADF_P<0.05;
    return `<tr>
      <td><strong>${r.Asset||r[Object.keys(r)[0]]}</strong></td>
      <td>${fmtNum(r.ADF_Stat??r.adf_stat,4)}</td>
      <td>${fmtNum(r.ADF_P??r.adf_p,6)}</td>
      <td>${fmtNum(r.KPSS_Stat??r.kpss_stat,4)}</td>
      <td>${fmtNum(r.KPSS_P??r.kpss_p,4)}</td>
      <td>${stat?'<span class="badge badge-green">✓ Stationary</span>':'<span class="badge badge-red">✗ Non-stationary</span>'}</td>
    </tr>`;
  }).join('');

  // Pie chart of stationary vs not
  if (canvas) {
    if (canvas._chart) canvas._chart.destroy();
    const statCount = data.filter(r=>r.Is_Stationary||r.ADF_P<0.05).length;
    canvas._chart = new Chart(canvas, {
      type:'doughnut',
      data:{labels:['Stationary','Non-stationary'],datasets:[{
        data:[statCount, data.length-statCount],
        backgroundColor:['rgba(0,214,143,0.8)','rgba(200,16,46,0.8)'],
        borderWidth:0
      }]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#e8eaf0'}}}}
    });
  }
}

// ── Init ─────────────────────────────────────────────────────
function initClock() {
  const el = document.getElementById('topbar-time');
  if (!el) return;
  const update = ()=>{ el.textContent = new Date().toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'short',year:'numeric'}); };
  update(); setInterval(update,1000);
}

function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item=>{
    item.addEventListener('click', ()=>navigate(item.dataset.page));
  });
}

function initFilters() {
  const searchEl = document.getElementById('pairs-search');
  const catEl    = document.getElementById('pairs-cat');
  const applyFilter = ()=>{
    const q   = (searchEl?.value||'').toLowerCase();
    const cat = catEl?.value||'all';
    const filtered = state.pairs.filter(p=>{
      const matchQ = !q || p.Leader.toLowerCase().includes(q)||p.Follower.toLowerCase().includes(q);
      const matchC = cat==='all'||p.Cat_Leader===cat||p.Cat_Follower===cat;
      return matchQ && matchC;
    });
    renderPairsTable(filtered);
  };
  searchEl?.addEventListener('input', applyFilter);
  catEl?.addEventListener('change', applyFilter);
}

document.addEventListener('DOMContentLoaded', async ()=>{
  initClock();
  initNav();
  initFilters();
  navigate('dashboard');
  await loadAll();
  renderDashboard();
});

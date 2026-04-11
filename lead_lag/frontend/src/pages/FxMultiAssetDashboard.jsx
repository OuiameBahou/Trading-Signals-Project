import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import {
  Play, Loader2, AlertCircle, BarChart3, CheckSquare, Square,
  Trophy, TrendingUp, TrendingDown, Target, Scan, Layers, Info
} from 'lucide-react';

const fmt = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';
const signed = n => (typeof n === 'number' && !isNaN(n)) ? (n >= 0 ? `+${fmt(n)}` : fmt(n)) : '—';
const fmtPair = s => (s || '').replace(/_B$/, '').replace(/_B1$/, '').replace(/_/g, '/');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

const COLORS = ['#FFB81C','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#f59e0b','#ec4899',
  '#84cc16','#f97316','#14b8a6','#a855f7','#6366f1','#22d3ee','#fb923c','#e879f9','#4ade80',
  '#f87171','#60a5fa','#fbbf24'];

const OPTIMAL_INFO = {
  FX: {
    'EUR': { theta: 0.1, eps: 0.0165 },
    'AUD': { theta: 0.1, eps: 0.00336 },
    'GBP': { theta: 0.2, eps: 0.0005 },
    'NZD': { theta: 0.1, eps: 0.0027 },
    'CAD': { theta: 0.4, eps: 0.0168 },
    'CHF': { theta: 0.2, eps: 0.005 },
    'JPY': { theta: 0.1, eps: 1.967 },
  },
  Indices: {
    'CAC40':       { theta: 0.1, eps: 0.01 },
    'DAX':         { theta: 0.1, eps: 3.165263 },
    'EUROSTOXX50': { theta: 0.1, eps: 6.320526 },
    'FTSE100':     { theta: 0.1, eps: 3.165263 },
    'NASDAQ100':   { theta: 0.1, eps: 0.01 },
    'NIKKEI225':   { theta: 0.2, eps: 0.01 },
    'SP500':       { theta: 0.1, eps: 12.0 },
  },
};

/* ── Tooltip — reads ONLY from Recharts payload (= actual rendered Lines) ── */
const ScanChartTip = ({ active, payload, label, colorMap }) => {
  if (!active || !payload?.length) return null;
  // payload entries come from rendered <Line> components ONLY — no phantom data possible
  const entries = payload
    .filter(p => typeof p.value === 'number' && !isNaN(p.value))
    .map(p => ({ name: p.name || p.dataKey, value: p.value, color: p.stroke || colorMap?.[p.name] || '#666' }));
  if (!entries.length) return null;
  return (
    <div className="t-card border t-border-s rounded-xl px-3 py-2 shadow-2xl" style={{ minWidth: 160, maxWidth: 240, maxHeight: 300, overflowY: 'auto' }}>
      <div className="text-[9px] font-black uppercase tracking-widest t-text-m mb-1.5 border-b t-border-s pb-1">
        {fmtDate(label)}
      </div>
      {entries.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.color }} />
            <span className="text-[8px] t-text-m font-bold truncate">{e.name}</span>
          </div>
          <span className={`text-[9px] font-black font-mono ${e.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${fmt(e.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── Mini chart for regime mode ──────────────────────────────────────── */
const MiniChart = ({ data, color }) => {
  if (!data?.length) return <div className="h-[80px]" />;
  const gradId = `grad_${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}
        style={{ background: 'transparent' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5}
          fill={`url(#${gradId})`} dot={false} isAnimationActive={false}
          strokeLinejoin="round" strokeLinecap="round" />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/* ── Asset card for regime mode ─────────────────────────────────────── */
const AssetCard = ({ asset, color, rank }) => {
  if (asset.error) {
    return (
      <div className="t-card rounded-xl border border-red-500/20 p-4">
        <div className="font-black text-[11px] t-text font-mono">{fmtPair(asset.name)}</div>
        <div className="text-[10px] text-red-400 mt-1">{asset.error}</div>
      </div>
    );
  }
  const m = asset.metrics || {};
  const lastPnl = asset.pnl_series?.slice(-1)[0]?.value ?? 0;
  return (
    <div className="t-card rounded-xl border t-border-s p-4 flex flex-col gap-3 hover:border-[#FFB81C]/20 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black"
            style={{ background: `${color}20`, color }}>{rank}</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="font-black text-[13px] t-text font-mono">{fmtPair(asset.name)}</span>
          </div>
        </div>
        <div className={`text-[11px] font-black font-mono flex items-center gap-1 ${lastPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {lastPnl >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}${fmt(lastPnl)}
        </div>
      </div>
      <MiniChart data={asset.pnl_series} color={color} />
      <div className="grid grid-cols-3 gap-2 pt-2 border-t t-border-s">
        {[
          { label: 'Return', value: `${signed(m.total_return)}%`, accent: (m.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Sharpe', value: fmt(m.sharpe_ratio, 2), accent: (m.sharpe_ratio ?? 0) >= 1 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'MaxDD',  value: `${fmt(m.max_drawdown)}%`, accent: 'text-red-400' },
          { label: 'Trades', value: m.nb_trades ?? '—', accent: 't-text' },
          { label: 'Win%',   value: `${fmt(m.win_rate)}%`, accent: (m.win_rate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'B&H',    value: `${signed(m.buy_hold_return)}%`, accent: (m.buy_hold_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(({ label, value, accent }) => (
          <div key={label}>
            <div className="text-[7px] t-text-m font-black uppercase tracking-widest">{label}</div>
            <div className={`text-[10px] font-black font-mono ${accent}`}>{value}</div>
          </div>
        ))}
      </div>
      {asset.theta != null && (
        <div className="flex items-center gap-2 text-[8px] t-text-m font-mono pt-1 border-t t-border-s">
          <span>θ=<span className="text-[#FFB81C] font-black">{asset.theta?.toFixed(3)}</span></span>
          <span>ε=<span className="text-[#FFB81C] font-black">{asset.eps?.toFixed(5)}</span></span>
        </div>
      )}
    </div>
  );
};

/* ── Strategy Scan subplot per asset ───────────────────────────────── */
const AssetStrategyChart = ({ asset, colorMap, activeStrategy }) => {
  if (!asset.strategies?.length) {
    return (
      <div className="t-card rounded-xl border t-border-s p-4">
        <div className="text-[11px] font-black font-mono t-text mb-2">{fmtPair(asset.pair)}</div>
        <div className="text-[9px] text-red-400">{asset.error || 'No data'}</div>
      </div>
    );
  }

  const pairStrategyNames = asset.strategies.map(s => s.name);
  const hasActiveInChart = !activeStrategy || pairStrategyNames.includes(activeStrategy);

  // ONLY render Lines for strategies we actually want visible
  // When isolated: render ONLY the active strategy (others are completely removed from the chart)
  // When not isolated: render all strategies for this pair
  const visibleStrategies = activeStrategy
    ? asset.strategies.filter(s => s.name === activeStrategy)
    : asset.strategies;

  const dateMap = {};
  asset.strategies.forEach(s => {
    s.pnl_series.forEach(pt => {
      if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date };
      dateMap[pt.date][s.name] = pt.value;
    });
  });
  const chartData = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  const bestStrategy = asset.strategies[0];
  const bestPnl = bestStrategy?.final_pnl ?? 0;

  return (
    <div className={`t-card rounded-xl border t-border-s p-4 transition-all
                     ${!hasActiveInChart ? 'opacity-30' : 'hover:border-[#FFB81C]/20'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-black text-[13px] t-text font-mono">{fmtPair(asset.pair)}</span>
          <span className="text-[8px] t-text-m font-bold uppercase tracking-widest">{asset.total_strategies} combos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy size={10} className="text-[#FFB81C]" />
          <span className={`text-[10px] font-black font-mono ${bestPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${fmt(bestPnl)}
          </span>
          <span className="text-[8px] t-text-m font-mono truncate max-w-[80px]">{bestStrategy?.name}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
          <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false}
            tickFormatter={fmtDate} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} width={45}
            tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
          <Tooltip content={(props) => <ScanChartTip {...props} colorMap={colorMap} />} />
          {visibleStrategies.map((s) => (
            <Line key={s.name} type="monotone" dataKey={s.name} name={s.name}
              stroke={colorMap[s.name] || '#666'}
              dot={false} connectNulls
              activeDot={{ r: 3, strokeWidth: 1 }}
              strokeWidth={activeStrategy ? 2.5 : 1}
              strokeOpacity={0.9} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {activeStrategy && !hasActiveInChart && (
        <div className="text-center text-[9px] t-text-m mt-2 italic">
          {activeStrategy} not in top {asset.strategies.length} for this pair
        </div>
      )}
    </div>
  );
};

/* ── MAIN COMPONENT ───────────────────────────────────────────────────── */
const FxMultiAssetDashboard = () => {
  const [allPairs, setAllPairs] = useState([]);
  const [selectedPairs, setSelectedPairs] = useState(new Set());
  const [presetMode, setPresetMode] = useState('ALL_FX');
  const [tab, setTab] = useState('regime');

  // Regime state
  const [capital, setCapital] = useState(10000);
  const [useOptimal, setUseOptimal] = useState(true);
  const [theta, setTheta] = useState(0.1);
  const [epsilon, setEpsilon] = useState(0.0165);
  const [stpMult, setStpMult] = useState(3);
  const [tpMult, setTpMult] = useState(3);
  const [running, setRunning] = useState(false);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);

  // Strategy scan state
  const [scanTopN, setScanTopN] = useState(20);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [activeStrategy, setActiveStrategy] = useState(null); // click to highlight

  useEffect(() => {
    axios.get('/api/fx/data-pairs').then(r => {
      const data = r.data || [];
      setAllPairs(data);
      // Default: all FX pairs selected
      setSelectedPairs(new Set(data.filter(p => p.category === 'FX').map(p => p.name)));
      setPresetMode('ALL_FX');
    }).catch(() => {});
  }, []);

  const handlePreset = (mode) => {
    setPresetMode(mode);
    if (mode === 'ALL_FX') {
      setSelectedPairs(new Set(allPairs.filter(p => p.category === 'FX').map(p => p.name)));
    } else if (mode === 'ALL_INDICES') {
      setSelectedPairs(new Set(allPairs.filter(p => p.category === 'Indices').map(p => p.name)));
    }
    // CUSTOM: user picks individually — don't reset selectedPairs
  };

  const togglePair = (name) => {
    setPresetMode('CUSTOM');
    setSelectedPairs(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectedList = allPairs.filter(p => selectedPairs.has(p.name));

  /* ── Regime run ──────────────────────────────────────────────────── */
  const handleRegimeRun = async () => {
    if (!selectedList.length) { setError('Select at least one asset.'); return; }
    setRunning(true); setError(null); setAssets([]);
    try {
      const r = await axios.post('/api/fx/backtest/multi-asset', {
        file_paths: selectedList.map(p => p.file_path),
        file_types: selectedList.map(p => p.file_type),
        initial_capital: Number(capital),
        use_optimal_params: useOptimal,
        theta_enter: Number(theta),
        eps_trend: Number(epsilon),
        stp_multiplier: Number(stpMult),
        tp_multiplier: Number(tpMult),
      });
      setAssets(r.data.assets || []);
    } catch (err) {
      setError(err.response?.data?.detail?.message || 'Multi-asset backtest failed');
    } finally { setRunning(false); }
  };

  /* ── Strategy scan run ───────────────────────────────────────────── */
  const handleScanRun = async () => {
    if (!selectedList.length) { setScanError('Select at least one asset.'); return; }
    setScanRunning(true); setScanError(null); setScanResults(null); setActiveStrategy(null);
    try {
      const r = await axios.post('/api/fx/backtest/multi-asset-scan', {
        file_paths: selectedList.map(p => p.file_path),
        file_types: selectedList.map(p => p.file_type),
        initial_capital: Number(capital),
        top_n: Number(scanTopN),
      });
      setScanResults(r.data);
    } catch (err) {
      setScanError(err.response?.data?.detail?.message || 'Strategy scan failed');
    } finally { setScanRunning(false); }
  };

  const handleStrategyClick = (name) => {
    setActiveStrategy(prev => prev === name ? null : name);
  };

  /* ── Build color map for scan ────────────────────────────────────── */
  const colorMap = {};
  if (scanResults?.all_strategy_names) {
    scanResults.all_strategy_names.forEach((name, i) => {
      colorMap[name] = COLORS[i % COLORS.length];
    });
  }

  /* ── Regime summary stats ────────────────────────────────────────── */
  const successAssets = assets.filter(a => !a.error);
  const totalPnl = successAssets.reduce((s, a) => s + (a.pnl_series?.slice(-1)[0]?.value ?? 0), 0);
  const bestAsset = successAssets.length
    ? successAssets.reduce((best, a) => (a.metrics?.total_return ?? -Infinity) > (best.metrics?.total_return ?? -Infinity) ? a : best)
    : null;
  const bestReturn = bestAsset?.metrics?.total_return ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FFB81C] mb-1">Indicators Engine</div>
        <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
          <BarChart3 className="text-[#FFB81C]" size={22} />
          Multi-Asset Dashboard
        </h1>
        <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
          {tab === 'regime' ? 'Regime strategy' : 'Strategy scan'} · {selectedPairs.size} assets selected
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-xl t-card border t-border-s w-fit">
        {[
          { key: 'regime', icon: Target, label: 'Regime Backtest' },
          { key: 'scan', icon: Scan, label: 'Strategy Scan' },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                        ${tab === key ? 'bg-[#FFB81C] text-black shadow-lg shadow-[#FFB81C]/20' : 't-text-m hover:t-text'}`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Config */}
      <div className="t-card rounded-xl border t-border-s p-5 space-y-4">
        {/* Asset selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em]">Select Assets</div>
            <span className="text-[9px] t-text-m font-bold">{selectedPairs.size} selected</span>
          </div>

          {/* Preset buttons */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[9px] font-black uppercase tracking-widest t-text-m">Quick:</span>
            {[
              { mode: 'ALL_FX',      label: `All FX (${allPairs.filter(p => p.category === 'FX').length})` },
              { mode: 'ALL_INDICES', label: `All Indices (${allPairs.filter(p => p.category === 'Indices').length})` },
              { mode: 'CUSTOM',      label: 'Custom' },
            ].map(({ mode, label }) => (
              <button key={mode} onClick={() => handlePreset(mode)}
                className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all
                  ${presetMode === mode
                    ? 'bg-[#FFB81C] text-black shadow-lg shadow-[#FFB81C]/20'
                    : 't-elevated border t-border-s t-text-m hover:t-text'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Category-grouped toggles */}
          <div className="flex gap-8 flex-wrap">
            {['FX', 'Indices'].map(cat => {
              const catPairs = allPairs.filter(p => p.category === cat);
              if (!catPairs.length) return null;
              const isIdx = cat === 'Indices';
              const accentColor = isIdx ? '#10b981' : '#FFB81C';
              return (
                <div key={cat}>
                  <div
                    className="text-[9px] font-black uppercase tracking-widest mb-2"
                    style={{ color: accentColor }}
                  >
                    {isIdx ? 'Equity Indices' : 'FX Pairs'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catPairs.map(p => {
                      const isSelected = selectedPairs.has(p.name);
                      return (
                        <button
                          key={p.name}
                          onClick={() => togglePair(p.name)}
                          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-all text-[11px] font-black font-mono active:scale-[0.97]
                            ${isSelected
                              ? isIdx
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm'
                                : 'bg-[#FFB81C]/10 border-[#FFB81C]/40 text-[#FFB81C] shadow-sm'
                              : 't-border-s t-text-m hover:t-text'}`}
                        >
                          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                          {fmtPair(p.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div className="flex flex-wrap gap-4 items-end pt-3 border-t t-border-s">
          <div>
            <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">Capital ($)</div>
            <input type="number" value={capital} step={1000} onChange={e => setCapital(e.target.value)}
              className="w-28 t-elevated border t-border-s rounded-xl px-2.5 py-2 text-[11px] font-mono t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
          </div>

          {tab === 'regime' && (
            <>
              {[['SL ×', stpMult, setStpMult, 0.5, 'w-16'], ['TP ×', tpMult, setTpMult, 0.5, 'w-16']].map(([lbl, val, set, step, cls]) => (
                <div key={lbl}>
                  <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">{lbl}</div>
                  <input type="number" value={val} step={step} onChange={e => set(e.target.value)}
                    className={`${cls} t-elevated border t-border-s rounded-xl px-2.5 py-2 text-[11px] font-mono t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent`} />
                </div>
              ))}

              {/* Optimal vs Custom with explanation */}
              <div>
                <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  θ / ε Mode
                </div>
                <div className="flex gap-1 p-1 rounded-xl border t-border-s t-elevated">
                  <button onClick={() => setUseOptimal(true)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all
                                ${useOptimal ? 'bg-[#FFB81C] text-black shadow-lg shadow-[#FFB81C]/20' : 't-text-m hover:t-text'}`}>
                    Per-Asset Best
                  </button>
                  <button onClick={() => setUseOptimal(false)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all
                                ${!useOptimal ? 'bg-[#FFB81C] text-black shadow-lg shadow-[#FFB81C]/20' : 't-text-m hover:t-text'}`}>
                    Custom
                  </button>
                </div>
              </div>

              {useOptimal ? (
                /* Show the per-asset optimal params — scoped to which categories are actually selected */
                (() => {
                  const selectedCats = new Set(selectedList.map(p => p.category));
                  const catsToShow = ['FX', 'Indices'].filter(c => selectedCats.has(c));
                  if (!catsToShow.length) return null;
                  return (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-xl t-elevated border t-border-s">
                      <Info size={12} className="text-[#FFB81C] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-[8px] font-black t-text-m uppercase tracking-widest">Each asset uses its own tuned θ/ε</div>
                        {catsToShow.map(cat => (
                          <div key={cat} className="flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: cat === 'Indices' ? '#10b981' : '#FFB81C' }}>{cat === 'Indices' ? 'Indices' : 'FX'}</span>
                            {Object.entries(OPTIMAL_INFO[cat]).map(([asset, { theta: t, eps: e }]) => (
                              <span key={asset} className="text-[8px] font-mono t-text-m">
                                <span className="font-black t-text">{asset}</span> θ={t} ε={e}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Custom fields */
                <>
                  <div>
                    <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">θ (all pairs)</div>
                    <input type="number" value={theta} step={0.05} onChange={e => setTheta(e.target.value)}
                      className="w-20 t-elevated border t-border-s rounded-xl px-2.5 py-2 text-[11px] font-mono t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
                  </div>
                  <div>
                    <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">ε (all pairs)</div>
                    <input type="number" value={epsilon} step={0.001} onChange={e => setEpsilon(e.target.value)}
                      className="w-24 t-elevated border t-border-s rounded-xl px-2.5 py-2 text-[11px] font-mono t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'scan' && (
            <div>
              <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">Top N per Asset</div>
              <input type="number" value={scanTopN} step={5} min={1} max={50} onChange={e => setScanTopN(e.target.value)}
                className="w-20 t-elevated border t-border-s rounded-xl px-2.5 py-2 text-[11px] font-mono t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
            </div>
          )}
        </div>

        {/* Run button */}
        <button
          onClick={tab === 'regime' ? handleRegimeRun : handleScanRun}
          disabled={(tab === 'regime' ? running : scanRunning) || selectedPairs.size === 0}
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest
                     bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90 disabled:opacity-40 transition-all
                     shadow-lg shadow-[#FFB81C]/20 w-full justify-center active:scale-[0.98]">
          {tab === 'regime' ? (
            running
              ? <><Loader2 size={14} className="animate-spin" />Running across {selectedPairs.size} pairs…</>
              : <><Play size={14} />Run Regime Backtest</>
          ) : (
            scanRunning
              ? <><Loader2 size={14} className="animate-spin" />Scanning {selectedPairs.size} pairs × all combos…</>
              : <><Scan size={14} />Run Strategy Scan (Top {scanTopN})</>
          )}
        </button>
      </div>

      {/* Errors */}
      {(tab === 'regime' ? error : scanError) && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2">
          <AlertCircle size={13} className="text-red-400" />
          <span className="text-[10px] text-red-400">{tab === 'regime' ? error : scanError}</span>
        </div>
      )}

      {/* Loading */}
      {(tab === 'regime' ? running : scanRunning) && (
        <div className="flex items-center justify-center h-48 t-card rounded-xl border t-border-s">
          <div className="text-center">
            <Loader2 size={36} className="animate-spin mx-auto mb-3 text-[#FFB81C]" />
            <p className="text-[11px] t-text-m font-black uppercase tracking-widest">
              {tab === 'regime' ? 'Processing all pairs…' : `Scanning all combos across ${selectedPairs.size} pairs…`}
            </p>
            <p className="text-[9px] t-text-m mt-1">
              {tab === 'scan' ? 'This will take several minutes for many pairs.' : 'Please wait.'}
            </p>
          </div>
        </div>
      )}

      {/* ── REGIME RESULTS ─────────────────────────────────────────────── */}
      {tab === 'regime' && assets.length > 0 && !running && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-[#FFB81C]/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Assets</div>
              <div className="text-xl font-black font-mono text-[#FFB81C]">{successAssets.length}<span className="text-[10px] t-text-m">/{assets.length}</span></div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1"><TrendingUp size={10} />Total P&L</div>
              <div className={`text-xl font-black font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(totalPnl)}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1"><Target size={10} />Best Return</div>
              <div className="text-xl font-black font-mono text-emerald-400">{bestReturn >= 0 ? '+' : ''}{fmt(bestReturn, 2)}%</div>
              <div className="text-[8px] t-text-m mt-0.5">{bestAsset ? fmtPair(bestAsset.name) : '—'}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1"><Trophy size={10} />Best</div>
              <div className="text-lg font-black font-mono text-emerald-400">{bestAsset ? fmtPair(bestAsset.name) : '—'}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {assets.map((a, i) => (
              <AssetCard key={a.name} asset={a} color={COLORS[i % COLORS.length]} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {/* ── STRATEGY SCAN RESULTS ──────────────────────────────────────── */}
      {tab === 'scan' && scanResults && !scanRunning && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-[#FFB81C]/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Assets Scanned</div>
              <div className="text-xl font-black font-mono text-[#FFB81C]">{scanResults.per_asset?.length}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-blue-500/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Unique Strategies</div>
              <div className="text-xl font-black font-mono text-blue-400">{scanResults.all_strategy_names?.length}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Showing Per Asset</div>
              <div className="text-xl font-black font-mono text-emerald-400">Top {scanTopN}</div>
            </div>
          </div>

          {/* Shared legend — CLICK to highlight */}
          <div className="t-card rounded-xl border t-border-s p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">
                Strategy Legend — click to isolate
              </div>
              {activeStrategy && (
                <button onClick={() => setActiveStrategy(null)}
                  className="px-3 py-1 rounded-lg border t-border-s text-[9px] font-black uppercase tracking-wider
                             t-text-m hover:t-text transition-all">
                  ✕ Show All
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1.5">
              {scanResults.all_strategy_names?.map(name => {
                const isActive = activeStrategy === name;
                const isDimmed = activeStrategy && !isActive;
                return (
                  <button key={name}
                    onClick={() => handleStrategyClick(name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold font-mono border transition-all cursor-pointer
                                active:scale-[0.97]
                                ${isActive
                                  ? 'border-[#FFB81C]/50 bg-[#FFB81C]/10 t-text shadow-sm'
                                  : isDimmed
                                    ? 'opacity-20 t-border-s t-text-m'
                                    : 't-border-s t-text-m hover:t-text hover:border-[var(--border-hover)]'}`}>
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorMap[name] }} />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart grid: 2 columns */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {scanResults.per_asset?.map(asset => (
              <AssetStrategyChart
                key={asset.pair}
                asset={asset}
                colorMap={colorMap}
                activeStrategy={activeStrategy}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!running && !scanRunning && (tab === 'regime' ? assets.length === 0 : !scanResults) && (
        <div className="flex items-center justify-center h-48 t-card rounded-xl border t-border-s">
          <div className="text-center t-text-m">
            {tab === 'regime'
              ? <BarChart3 size={40} className="mx-auto mb-3 opacity-20" />
              : <Scan size={40} className="mx-auto mb-3 opacity-20" />}
            <p className="text-[11px] font-black uppercase tracking-widest opacity-40">
              {tab === 'regime' ? 'Select assets and run regime backtest' : 'Select assets and run strategy scan'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FxMultiAssetDashboard;

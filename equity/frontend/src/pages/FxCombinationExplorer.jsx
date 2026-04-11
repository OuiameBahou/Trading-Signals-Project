import React, { useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { Play, Loader2, AlertCircle, Layers, Trophy, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import PairSelector from '../components/PairSelector';

const fmt = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

const COLORS = [
  '#FFB81C','#10b981','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4',
  '#84cc16','#f97316','#ec4899','#14b8a6','#a855f7','#6366f1','#22d3ee',
  '#fb923c','#e879f9','#4ade80','#f87171','#60a5fa','#fbbf24',
];

/* ── Tooltip — reads ONLY from Recharts payload (= actual rendered Lines) ── */
const ComboChartTip = ({ active, payload, label, colorMap }) => {
  if (!active || !payload?.length) return null;
  // payload entries come from rendered <Line> components ONLY — no phantom data possible
  const entries = payload
    .filter(p => typeof p.value === 'number' && !isNaN(p.value))
    .map(p => ({ name: p.name || p.dataKey, value: p.value, color: p.stroke || colorMap?.[p.name] || '#666' }));
  if (!entries.length) return null;
  return (
    <div className="t-card border t-border-s rounded-xl px-4 py-3 shadow-2xl" style={{ minWidth: 180, maxWidth: 280 }}>
      <div className="text-[10px] font-black uppercase tracking-widest t-text-m mb-2 border-b t-border-s pb-1.5">
        {fmtDate(label)}
      </div>
      {entries.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
            <span className="text-[9px] t-text-m font-bold truncate">{e.name}</span>
          </div>
          <span className={`text-[10px] font-black font-mono shrink-0 ${e.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${fmt(e.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const SORT_OPTS = [
  { key: 'final_pnl', label: 'P&L' },
  { key: 'nb_trades', label: 'Trades' },
  { key: 'sharpe_ratio', label: 'SR' },
  { key: 'win_rate', label: 'WIN%' },
];

const FxCombinationExplorer = () => {
  const [selectedPair, setSelectedPair] = useState(null);
  const [capital, setCapital] = useState(10000);
  const [running, setRunning] = useState(false);
  const [strategies, setStrategies] = useState([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('final_pnl');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState(null);

  const handleRun = async () => {
    if (!selectedPair) { setError('Select a pair first.'); return; }
    setRunning(true); setError(null); setStrategies([]); setActiveStrategy(null);
    try {
      const r = await axios.post('/api/fx/backtest/combination-test', {
        file_path: selectedPair.file_path,
        file_type: selectedPair.file_type,
        initial_capital: Number(capital),
      });
      setStrategies(r.data.strategies || []);
      setCount(r.data.count || 0);
    } catch (err) {
      setError(err.response?.data?.detail?.message || 'Combination test failed');
    } finally { setRunning(false); }
  };

  const sorted = [...strategies].sort((a, b) => {
    const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  const top10 = sorted.slice(0, 10);
  const comboColorMap = {};
  top10.forEach((s, i) => { comboColorMap[s.name] = COLORS[i % COLORS.length]; });
  const allDates = top10.length ? top10[0].pnl_series.map(p => p.date) : [];
  const chartData = allDates.map((date, i) => {
    const pt = { date };
    top10.forEach((s) => { pt[s.name] = s.pnl_series[i]?.value ?? null; });
    return pt;
  });

  // When isolated, only render the active strategy's Line (others completely removed)
  const visibleTop10 = activeStrategy
    ? top10.filter(s => s.name === activeStrategy)
    : top10;

  const toggleSort = (k) => {
    if (sortKey === k) setSortAsc(p => !p);
    else { setSortKey(k); setSortAsc(false); }
  };

  const handleStrategyClick = (name) => {
    setActiveStrategy(prev => prev === name ? null : name);
  };

  const bestStrategy = sorted[0];
  const avgPnl = sorted.length ? sorted.reduce((s, x) => s + (x.final_pnl || 0), 0) / sorted.length : 0;
  const profitableCount = sorted.filter(s => (s.final_pnl ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FFB81C] mb-1">FX Technical Engine</div>
        <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
          <Layers className="text-[#FFB81C]" size={22} />
          Combination Explorer
        </h1>
        <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
          Exhaustive test · All primary+confirmer combos · {selectedPair ? selectedPair.name.replace(/_/g, '/') : 'No pair'}
        </p>
      </div>

      {/* Config row */}
      <div className="t-card rounded-xl border t-border-s p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-4 items-end">
          <PairSelector value={selectedPair} onChange={setSelectedPair} />
          <div>
            <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5">Initial Capital</div>
            <input type="number" value={capital} min={100} step={1000} onChange={e => setCapital(e.target.value)}
              className="w-full t-elevated border t-border-s rounded-xl px-3 py-2.5 text-[11px] font-mono t-text
                         focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
          </div>
          <button onClick={handleRun} disabled={running || !selectedPair}
            className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest
                       bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90 disabled:opacity-40 transition-all
                       shadow-lg shadow-[#FFB81C]/20 active:scale-[0.98] whitespace-nowrap">
            {running ? <><Loader2 size={13} className="animate-spin" />Running…</> : <><Play size={13} />Run All</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2">
          <AlertCircle size={13} className="text-red-400" />
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {running && (
        <div className="flex items-center justify-center h-48 t-card rounded-xl border t-border-s">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-[#FFB81C]" />
            <p className="text-[11px] t-text-m font-black uppercase tracking-widest">Testing all combinations…</p>
          </div>
        </div>
      )}

      {strategies.length > 0 && !running && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-[#FFB81C]/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Strategies Tested</div>
              <div className="text-xl font-black font-mono text-[#FFB81C]">{count}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1 flex items-center gap-1">
                <Trophy size={10} /> Best
              </div>
              <div className="text-lg font-black font-mono text-emerald-400">${fmt(bestStrategy?.final_pnl)}</div>
              <div className="text-[8px] t-text-m mt-0.5 truncate">{bestStrategy?.name}</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-blue-500/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Avg P&L</div>
              <div className={`text-lg font-black font-mono ${avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${fmt(avgPnl)}
              </div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">Profitable</div>
              <div className="text-lg font-black font-mono text-emerald-400">
                {profitableCount}<span className="text-[10px] t-text-m">/{count}</span>
              </div>
              <div className="text-[8px] t-text-m mt-0.5">{count > 0 ? `${((profitableCount / count) * 100).toFixed(0)}%` : ''}</div>
            </div>
          </div>

          {/* Strategy selector boxes — click to isolate */}
          <div className="t-card rounded-xl border t-border-s p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C] mb-3">
              Top 10 Strategies — click to isolate
            </div>
            <div className="flex flex-wrap gap-2">
              {top10.map((s, i) => {
                const isActive = activeStrategy === s.name;
                const isDimmed = activeStrategy && !isActive;
                return (
                  <button key={s.name} onClick={() => handleStrategyClick(s.name)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-[10px] font-bold font-mono
                                active:scale-[0.97]
                                ${isActive
                                  ? 'border-[#FFB81C]/50 bg-[#FFB81C]/10 t-text shadow-sm'
                                  : isDimmed
                                    ? 'opacity-25 t-border-s t-text-m'
                                    : 't-border-s t-text-m hover:t-text hover:border-[var(--border-hover)]'}`}>
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="truncate max-w-[120px]">{s.name}</span>
                    <span className={`text-[9px] font-black ${(s.final_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${fmt(s.final_pnl)}
                    </span>
                  </button>
                );
              })}
              {activeStrategy && (
                <button onClick={() => setActiveStrategy(null)}
                  className="px-3 py-2 rounded-xl border t-border-s text-[10px] font-black uppercase tracking-wider
                             t-text-m hover:t-text transition-all">
                  ✕ Show All
                </button>
              )}
            </div>
          </div>

          {/* Multi-line P&L chart */}
          <div className="t-card rounded-xl border t-border-s p-5">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C] mb-4">
              Top 10 Strategies — Cumulative P&L
              {activeStrategy && <span className="ml-2 text-[8px] t-text-m font-bold">· Showing: {activeStrategy}</span>}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                  tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
                  tickFormatter={v => `$${v.toFixed(0)}`} />
                <Tooltip content={(props) => <ComboChartTip {...props} colorMap={comboColorMap} />} />
                {visibleTop10.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} name={s.name}
                    stroke={comboColorMap[s.name] || '#666'} dot={false}
                    activeDot={{ r: 3, strokeWidth: 1 }}
                    strokeWidth={activeStrategy ? 2.5 : 1.2}
                    strokeOpacity={1}
                    connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="t-card rounded-xl border t-border-s overflow-hidden">
            <div className="px-5 py-3 border-b t-border-s flex items-center justify-between">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">All Strategies</div>
              <div className="flex items-center gap-2">
                {SORT_OPTS.map(opt => (
                  <button key={opt.key} onClick={() => toggleSort(opt.key)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider
                                border transition-all
                                ${sortKey === opt.key
                                  ? 'bg-[#FFB81C]/10 text-[#FFB81C] border-[#FFB81C]/30'
                                  : 't-border-s t-text-m hover:t-text'}`}>
                    <ArrowUpDown size={9} />
                    {opt.label}
                    {sortKey === opt.key && <span>{sortAsc ? '↑' : '↓'}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 t-card border-b t-border-s">
                  <tr>
                    {['#','Strategy','Final P&L','Trades','SR','WIN%'].map(lbl => (
                      <th key={lbl} className="px-4 py-2.5 text-[8px] font-black uppercase tracking-widest t-text-m">{lbl}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => {
                    const sr = s.sharpe_ratio ?? null;
                    const wr = s.win_rate ?? null;
                    const srColor = sr === null ? 't-text-m' : sr >= 1 ? 'text-emerald-400' : sr >= 0 ? 'text-orange-400' : 'text-red-400';
                    const wrColor = wr === null ? 't-text-m' : wr >= 55 ? 'text-emerald-400' : wr >= 45 ? 'text-orange-400' : 'text-red-400';
                    return (
                    <tr key={s.name} className="border-b t-border-s hover:bg-[var(--table-row-hover)] transition-colors">
                      <td className="px-4 py-2.5 text-[9px] t-text-m font-bold">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {i < 10 && <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />}
                          <span className="text-[10px] font-mono t-text font-bold">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] font-black font-mono ${(s.final_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(s.final_pnl ?? 0) >= 0 ? '+' : ''}${fmt(s.final_pnl)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[10px] font-mono t-text-m font-bold">{s.nb_trades}</td>
                      <td className={`px-4 py-2.5 text-[10px] font-black font-mono ${srColor}`}>
                        {sr !== null ? fmt(sr, 2) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-[10px] font-black font-mono ${wrColor}`}>
                        {wr !== null ? `${fmt(wr, 1)}%` : '—'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!running && strategies.length === 0 && (
        <div className="flex items-center justify-center h-48 t-card rounded-xl border t-border-s">
          <div className="text-center t-text-m">
            <Layers size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Select a pair and run to explore</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FxCombinationExplorer;

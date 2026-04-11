import React, { useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { Play, Loader2, AlertCircle, SlidersHorizontal, Trophy, Hash, TrendingUp, ArrowUpDown } from 'lucide-react';
import PairSelector from '../components/PairSelector';

const fmt = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';

/* ── Parse raw params string into structured readable format ──────────── */
const parseParams = (raw) => {
  if (!raw || typeof raw !== 'string') return [];
  const indicators = [];
  // Match: RSI: {'period': 9, ...} or RSI {'period': 9, ...}
  const regex = /([A-Z_]+)\s*:?\s*\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const name = match[1].trim();
    const paramsStr = match[2];
    const params = {};
    const kvRegex = /['"]?(\w+)['"]?\s*:\s*([^,}]+)/g;
    let kvMatch;
    while ((kvMatch = kvRegex.exec(paramsStr)) !== null) {
      const key = kvMatch[1].trim();
      let val = kvMatch[2].trim().replace(/['"]/g, '');
      params[key] = val;
    }
    indicators.push({ name, params });
  }
  return indicators;
};

const INDICATOR_LABELS = {
  RSI: 'Relative Strength Index',
  MACD: 'MACD',
  BB: 'Bollinger Bands',
  SAR: 'Parabolic SAR',
  SO: 'Stochastic Oscillator',
  EMA: 'EMA Crossover',
};

/* ── Premium params display — indicator cards ─────────────────────────── */
const ParamDisplay = ({ params }) => {
  const parsed = parseParams(params);
  if (!parsed.length) return <span className="text-[9px] t-text-m font-mono">{params || '—'}</span>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {parsed.map((ind, i) => (
        <div key={i} className="rounded-xl border t-border-s t-elevated px-3 py-2.5">
          <div className="flex items-center gap-2 mb-2 pb-1.5 border-b t-border-s">
            <div className="w-1.5 h-1.5 rounded-full bg-[#FFB81C]" />
            <span className="text-[10px] font-black text-[#FFB81C]">{ind.name}</span>
            <span className="text-[7px] t-text-m font-bold uppercase tracking-widest">{INDICATOR_LABELS[ind.name] || ''}</span>
          </div>
          <div className="space-y-1">
            {Object.entries(ind.params).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[9px] t-text-m font-mono">{key.replace(/_/g, ' ')}</span>
                <span className="text-[10px] font-black font-mono t-text">{val}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const BarTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="t-card border t-border-s rounded-xl px-4 py-3 shadow-2xl" style={{ minWidth: 160 }}>
      <div className="text-[10px] font-black t-text mb-1">{d?.indicator}.{d?.parameter}</div>
      <div className="text-[11px] font-mono font-black text-[#FFB81C]">
        Sensitivity: {fmt(d?.score_sensitivity, 4)}
      </div>
    </div>
  );
};

const SORT_OPTS = [
  { key: 'pnl', label: 'P&L' },
  { key: 'sharpe_ratio', label: 'Sharpe' },
  { key: 'total_score', label: 'Score' },
  { key: 'max_drawdown', label: 'Drawdown' },
];

const FxParamOptimizer = () => {
  const [selectedPair, setSelectedPair] = useState(null);
  const [capital, setCapital] = useState(10000);
  const [topN, setTopN] = useState(20);
  const [maxCombinations, setMaxCombinations] = useState(1000);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [sensitivity, setSensitivity] = useState([]);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('total_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  const handleRun = async () => {
    if (!selectedPair) { setError('Select an asset first.'); return; }
    setRunning(true); setError(null); setResults([]); setSensitivity([]);
    try {
      const r = await axios.post('/api/fx/backtest/optimize', {
        file_path: selectedPair.file_path,
        file_type: selectedPair.file_type,
        initial_capital: Number(capital),
        top_n: Number(topN),
        max_combinations: Number(maxCombinations),
      });
      setResults(r.data.results || []);
      setSensitivity(r.data.sensitivity || []);
    } catch (err) {
      setError(err.response?.data?.detail?.message || 'Optimization failed');
    } finally { setRunning(false); }
  };

  const sorted = [...results].sort((a, b) => {
    const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    return sortAsc ? av - bv : bv - av;
  });

  const toggleSort = (k) => {
    if (sortKey === k) setSortAsc(p => !p);
    else { setSortKey(k); setSortAsc(false); }
  };

  const bestResult = sorted[0];
  const bestPnl = bestResult?.pnl ?? 0;
  const bestSharpe = bestResult?.sharpe_ratio ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FFB81C] mb-1">Indicators Engine</div>
        <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
          <SlidersHorizontal className="text-[#FFB81C]" size={22} />
          Parameter Optimizer
        </h1>
        <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
          Grid search · Ranks by composite score · {selectedPair ? selectedPair.name.replace(/_/g, '/') : 'No asset'}
        </p>
      </div>

      {/* Config panel */}
      <div className="t-card rounded-xl border t-border-s p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_130px_100px_130px_auto] gap-4 items-end">
          <PairSelector value={selectedPair} onChange={setSelectedPair} />
          {[['Capital ($)', capital, setCapital, 1000, 100],
            ['Top N', topN, setTopN, 5, 1],
            ['Max Combos', maxCombinations, setMaxCombinations, 100, 10]
          ].map(([lbl, val, set, step, min]) => (
            <div key={lbl}>
              <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5">{lbl}</div>
              <input type="number" value={val} step={step} min={min} onChange={e => set(e.target.value)}
                className="w-full t-elevated border t-border-s rounded-xl px-3 py-2.5 text-[11px] font-mono t-text
                           focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
            </div>
          ))}
          <button onClick={handleRun} disabled={running || !selectedPair}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest
                       bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90 disabled:opacity-40 transition-all
                       shadow-lg shadow-[#FFB81C]/20 active:scale-[0.98] whitespace-nowrap">
            {running ? <><Loader2 size={13} className="animate-spin" />Optimizing…</> : <><Play size={13} />Optimize</>}
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
            <p className="text-[11px] t-text-m font-black uppercase tracking-widest">
              Optimizing… testing up to {maxCombinations} parameter sets
            </p>
          </div>
        </div>
      )}

      {results.length > 0 && !running && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-[#FFB81C]/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">
                <Hash size={10} /> Results
              </div>
              <div className="text-xl font-black font-mono text-[#FFB81C]">{results.length}</div>
              <div className="text-[8px] t-text-m mt-0.5">parameter sets</div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-emerald-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">
                <Trophy size={10} /> Best P&L
              </div>
              <div className={`text-xl font-black font-mono ${bestPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${fmt(bestPnl)}
              </div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-blue-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">
                <TrendingUp size={10} /> Best Sharpe
              </div>
              <div className={`text-xl font-black font-mono ${bestSharpe >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {fmt(bestSharpe, 3)}
              </div>
            </div>
            <div className="t-card rounded-xl border t-border-s p-4 hover:border-blue-500/20 transition-all">
              <div className="flex items-center gap-1 text-[8px] font-black t-text-m uppercase tracking-[0.18em] mb-1">
                <SlidersHorizontal size={10} /> Sensitivity
              </div>
              <div className="text-xl font-black font-mono text-blue-400">{sensitivity.length}</div>
              <div className="text-[8px] t-text-m mt-0.5">parameters analyzed</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
            {/* Results list */}
            <div className="t-card rounded-xl border t-border-s overflow-hidden">
              <div className="px-5 py-3 border-b t-border-s flex items-center justify-between">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">
                  Top {results.length} Parameter Sets
                </div>
                <div className="flex items-center gap-1.5">
                  {SORT_OPTS.map(opt => (
                    <button key={opt.key} onClick={() => toggleSort(opt.key)}
                      className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider
                                  border transition-all
                                  ${sortKey === opt.key
                                    ? 'bg-[#FFB81C]/10 text-[#FFB81C] border-[#FFB81C]/30'
                                    : 't-border-s t-text-m hover:t-text'}`}>
                      {opt.label}
                      {sortKey === opt.key && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-auto max-h-[500px]">
                {sorted.map((r, i) => (
                  <div key={i}
                    className={`border-b t-border-s px-5 py-3 hover:bg-[var(--table-row-hover)] transition-colors cursor-pointer
                                ${i === 0 ? 'border-l-2 border-l-[#FFB81C]' : ''}`}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black
                                        ${i === 0 ? 'bg-[#FFB81C]/15 text-[#FFB81C]' : 't-elevated t-text-m'}`}>
                          {i + 1}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[12px] font-black font-mono ${(r.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${fmt(r.pnl)}
                          </span>
                          <span className={`text-[10px] font-mono ${(r.sharpe_ratio ?? 0) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            SR {fmt(r.sharpe_ratio, 3)}
                          </span>
                          <span className="text-[10px] font-mono text-red-400">
                            DD {fmt((r.max_drawdown ?? 0) * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black font-mono text-blue-400">
                          Score: {fmt(r.total_score, 3)}
                        </div>
                        <span className="text-[10px] t-text-m">{expandedRow === i ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {/* Expanded: readable parameters */}
                    {expandedRow === i && (
                      <div className="mt-3 pt-3 border-t t-border-s">
                        <div className="text-[8px] font-black t-text-m uppercase tracking-widest mb-2">Indicator Parameters</div>
                        <ParamDisplay params={r.params} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Sensitivity chart */}
            {sensitivity.length > 0 && (
              <div className="t-card rounded-xl border t-border-s p-5">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C] mb-4">
                  Parameter Sensitivity
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, sensitivity.length * 30)}>
                  <BarChart data={sensitivity} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-secondary)" />
                    <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} />
                    <YAxis type="category" dataKey="parameter" tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                      tickLine={false} width={80}
                      tickFormatter={v => `${sensitivity.find(s => s.parameter === v)?.indicator || ''}.${v}`} />
                    <Tooltip content={<BarTip />} />
                    <Bar dataKey="score_sensitivity" radius={[0, 6, 6, 0]}>
                      {sensitivity.map((_, i) => (
                        <Cell key={i} fill={`hsl(${38 + (i / sensitivity.length) * 160}, 70%, 55%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      {!running && results.length === 0 && (
        <div className="flex items-center justify-center h-48 t-card rounded-xl border t-border-s">
          <div className="text-center t-text-m">
            <SlidersHorizontal size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Select an asset and optimise</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FxParamOptimizer;

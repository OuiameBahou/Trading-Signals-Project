import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Trophy, Play, Loader2, AlertCircle, ChevronDown,
  TrendingUp, TrendingDown, Minus, BarChart2, ArrowUpDown
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════════════════════════ */
const fmt     = (n, d = 2) => typeof n === 'number' ? n.toFixed(d) : '—';
const signed  = n => typeof n === 'number' ? (n >= 0 ? `+${fmt(n)}` : fmt(n)) : '—';
const fmtPair = s => (s || '').replace(/_B$/, '').replace(/_/g, '/');

const ALL_INDICATORS = [
  { code: 'RSI',  label: 'RSI'  },
  { code: 'MACD', label: 'MACD' },
  { code: 'BB',   label: 'BB'   },
  { code: 'SO',   label: 'STOCH'},
  { code: 'SAR',  label: 'PSAR' },
];

/* ═══════════════════════════════════════════════════════════════════════════════
   Mini sparkline (SVG)
═══════════════════════════════════════════════════════════════════════════════ */
const Sparkline = ({ data, positive }) => {
  if (!data || data.length < 2) return <div className="w-24 h-8 opacity-20 t-text-m text-[9px]">no data</div>;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  const W = 96, H = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = positive ? '#34d399' : '#f87171';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Rank badge
═══════════════════════════════════════════════════════════════════════════════ */
const RankBadge = ({ rank }) => {
  if (rank === 1) return <span className="text-[#FFB81C] font-black text-sm">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-black text-sm">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm">🥉</span>;
  return <span className="text-[11px] font-black t-text-m font-mono w-5 text-center">#{rank}</span>;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Sort indicator
═══════════════════════════════════════════════════════════════════════════════ */
const SortBtn = ({ label, col, sort, setSort }) => {
  const active = sort.col === col;
  return (
    <button
      onClick={() => setSort(prev => ({ col, dir: prev.col === col ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc' }))}
      className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest
                  transition-colors ${active ? 'text-[#FFB81C]' : 't-text-m hover:t-text'}`}
    >
      {label}
      <ArrowUpDown size={10} className={active ? 'text-[#FFB81C]' : ''} />
    </button>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Row
═══════════════════════════════════════════════════════════════════════════════ */
const LeaderboardRow = ({ row, rank, isTopN }) => {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!row.error;
  const positive = (row.total_return ?? 0) >= 0;

  return (
    <>
      <tr
        onClick={() => !hasError && setExpanded(p => !p)}
        className={`border-b t-border-s text-[11px] font-mono transition-colors cursor-pointer
                    ${isTopN ? 'bg-[#FFB81C]/3' : ''}
                    ${hasError ? 'opacity-40' : 'hover:bg-white/3'}`}
      >
        {/* Rank */}
        <td className="px-4 py-3">
          <RankBadge rank={rank} />
        </td>

        {/* Pair */}
        <td className="px-4 py-3">
          <div className="font-black t-text text-[13px]">{fmtPair(row.pair)}</div>
        </td>

        {/* Sparkline */}
        <td className="px-4 py-3">
          {!hasError && <Sparkline data={row.equity_curve} positive={positive} />}
          {hasError && <span className="text-red-400 text-[9px]">Error</span>}
        </td>

        {/* Sharpe */}
        <td className="px-4 py-3">
          <span className={`font-black ${
            (row.sharpe_ratio ?? 0) >= 1 ? 'text-emerald-400'
            : (row.sharpe_ratio ?? 0) >= 0 ? 'text-amber-400'
            : 'text-red-400'}`}>
            {fmt(row.sharpe_ratio, 3)}
          </span>
        </td>

        {/* Total return */}
        <td className="px-4 py-3">
          <span className={`font-black ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {signed(row.total_return)}%
          </span>
        </td>

        {/* Max DD */}
        <td className="px-4 py-3 text-red-400 font-bold">
          {fmt(row.max_drawdown)}%
        </td>

        {/* Win Rate */}
        <td className="px-4 py-3">
          <span className={`font-bold ${(row.win_rate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {fmt(row.win_rate)}%
          </span>
        </td>

        {/* Trades */}
        <td className="px-4 py-3 t-text-m font-bold">{row.nb_trades ?? '—'}</td>

        {/* Expand */}
        <td className="px-4 py-3">
          {!hasError && (
            <ChevronDown size={14} className={`t-text-m transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && !hasError && (
        <tr className="border-b t-border-s">
          <td colSpan={9} className="px-6 py-4 bg-white/2">
            <div className="flex items-center gap-8 text-[10px]">
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Pair · </span>
                <span className="t-text font-black">{fmtPair(row.pair)}</span>
              </div>
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Sharpe · </span>
                <span className={`font-black ${(row.sharpe_ratio ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(row.sharpe_ratio, 3)}
                </span>
              </div>
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Return · </span>
                <span className={`font-black ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {signed(row.total_return)}%
                </span>
              </div>
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Max DD · </span>
                <span className="text-red-400 font-black">{fmt(row.max_drawdown)}%</span>
              </div>
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Win Rate · </span>
                <span className="font-black t-text">{fmt(row.win_rate)}%</span>
              </div>
              <div>
                <span className="t-text-m uppercase tracking-widest font-bold">Trades · </span>
                <span className="font-black t-text">{row.nb_trades}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Summary strip
═══════════════════════════════════════════════════════════════════════════════ */
const SummaryStrip = ({ rows }) => {
  const valid = rows.filter(r => !r.error && typeof r.sharpe_ratio === 'number');
  if (!valid.length) return null;
  const bestSharpe  = Math.max(...valid.map(r => r.sharpe_ratio));
  const bestReturn  = Math.max(...valid.map(r => r.total_return ?? -999));
  const avgWinRate  = valid.reduce((s, r) => s + (r.win_rate ?? 0), 0) / valid.length;
  const profitable  = valid.filter(r => (r.total_return ?? 0) > 0).length;
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: 'Best Sharpe',    value: fmt(bestSharpe, 3), accent: 'text-[#FFB81C]' },
        { label: 'Best Return',    value: `${signed(bestReturn)}%`, accent: bestReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
        { label: 'Avg Win Rate',   value: `${fmt(avgWinRate)}%`, accent: avgWinRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
        { label: 'Profitable Pairs', value: `${profitable} / ${valid.length}`, accent: 'text-blue-400' },
      ].map(({ label, value, accent }) => (
        <div key={label} className="t-card rounded-xl border t-border-s p-4">
          <div className="text-[9px] t-text-m font-black uppercase tracking-[0.18em] mb-1">{label}</div>
          <div className={`text-2xl font-black font-mono ${accent}`}>{value}</div>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Main
═══════════════════════════════════════════════════════════════════════════════ */
const FxPairLeaderboard = () => {
  const [indicators, setIndicators] = useState(['RSI', 'MACD', 'BB']);
  const [tp,  setTp]  = useState(1.5);
  const [stp, setStp] = useState(2.0);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [sort, setSort]       = useState({ col: 'sharpe_ratio', dir: 'desc' });
  const [hasRun, setHasRun]   = useState(false);

  const toggleIndicator = code =>
    setIndicators(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const run = async () => {
    if (indicators.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const r = await axios.post('/api/fx/compare_all', {
        indicators,
        tp_multiplier:  parseFloat(tp),
        stp_multiplier: parseFloat(stp),
      });
      setRows(r.data);
      setHasRun(true);
    } catch (e) {
      setError(e.response?.data?.error ?? 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  /* Sort rows */
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
    const bv = b[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
          <Trophy className="text-[#FFB81C]" size={24} />
          Pair Performance Leaderboard
        </h1>
        <p className="text-[10px] t-text-m mt-1.5 uppercase tracking-widest font-bold">
          Run the same strategy across all FX pairs · Rank by Sharpe · Compare side-by-side
        </p>
      </div>

      {/* ── Config bar ── */}
      <div className="t-card rounded-2xl border t-border-s p-5 flex flex-wrap items-end gap-6">

        {/* Indicators */}
        <div>
          <div className="text-[9px] t-text-m font-black uppercase tracking-[0.2em] mb-2">Signal Indicators</div>
          <div className="flex flex-wrap gap-2">
            {ALL_INDICATORS.map(({ code, label }) => {
              const active = indicators.includes(code);
              return (
                <button
                  key={code}
                  onClick={() => toggleIndicator(code)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest
                              border transition-all ${active
                    ? 'bg-[#FFB81C]/10 border-[#FFB81C]/40 text-[#FFB81C]'
                    : 't-elevated t-border-s t-text-m hover:t-text'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TP / SL */}
        <div className="flex items-end gap-4">
          {[
            { label: 'Take Profit ×ATR', val: tp, set: setTp, accent: 'text-emerald-400' },
            { label: 'Stop Loss ×ATR',   val: stp, set: setStp, accent: 'text-red-400'    },
          ].map(({ label, val, set, accent }) => (
            <div key={label}>
              <div className="text-[9px] t-text-m font-black uppercase tracking-[0.2em] mb-1">{label}</div>
              <input
                type="number" min="0.5" max="5" step="0.5"
                value={val}
                onChange={e => set(e.target.value)}
                className="w-20 t-elevated border t-border-s rounded-lg px-3 py-1.5 font-mono
                           text-sm font-black focus:outline-none focus:border-[#FFB81C]/60 bg-transparent text-right"
              />
              <span className={`ml-1 text-sm font-black font-mono ${accent}`}>×</span>
            </div>
          ))}
        </div>

        {/* Run */}
        <button
          onClick={run}
          disabled={loading || indicators.length === 0}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[11px]
                      uppercase tracking-widest ml-auto transition-all ${loading || indicators.length === 0
            ? 'bg-white/5 t-text-m border t-border-s cursor-not-allowed'
            : 'bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90 shadow-lg shadow-[#FFB81C]/20 active:scale-[0.98]'}`}
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Analyzing All Pairs…</>
            : <><Play size={15} /> Analyze All Pairs</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 font-bold bg-red-500/10
                        border border-red-500/20 rounded-xl p-4">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="h-48 flex items-center justify-center t-card rounded-2xl border t-border-s">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-[#FFB81C] animate-spin" />
            <div className="text-[10px] t-text-m font-black uppercase tracking-widest">
              Running backtest on all FX pairs…
            </div>
            <div className="text-[9px] t-text-m">Using {indicators.join(' · ')} · TP {tp}× · SL {stp}×</div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !hasRun && (
        <div className="h-48 flex items-center justify-center t-card rounded-2xl border t-border-s">
          <div className="text-center space-y-2">
            <Trophy size={36} className="text-[#FFB81C]/20 mx-auto" />
            <div className="text-[11px] t-text-m font-black uppercase tracking-widest">
              Select indicators · press Analyze All Pairs
            </div>
            <div className="text-[9px] t-text-m">
              Runs the same strategy on every FX pair simultaneously and ranks by Sharpe ratio
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && hasRun && rows.length > 0 && (
        <>
          <SummaryStrip rows={sorted} />

          {/* Table */}
          <div className="t-card rounded-2xl border t-border-s overflow-hidden">
            <div className="px-5 py-4 border-b t-border-s flex items-center justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest t-text">Strategy Rankings</div>
                <div className="text-[9px] t-text-m mt-0.5 font-semibold">
                  {sorted.length} pairs · {indicators.join(' · ')} · TP {parseFloat(tp).toFixed(1)}× · SL {parseFloat(stp).toFixed(1)}× · Click row to expand
                </div>
              </div>
              <BarChart2 size={16} className="text-[#FFB81C]/60" />
            </div>

            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest t-text-m border-b t-border-s bg-white/2">
                    <th className="px-4 py-3">RANK</th>
                    <th className="px-4 py-3">PAIR</th>
                    <th className="px-4 py-3">EQUITY CURVE</th>
                    <th className="px-4 py-3">
                      <SortBtn label="SHARPE" col="sharpe_ratio" sort={sort} setSort={setSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortBtn label="RETURN" col="total_return" sort={sort} setSort={setSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortBtn label="MAX DD" col="max_drawdown" sort={sort} setSort={setSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortBtn label="WIN RATE" col="win_rate" sort={sort} setSort={setSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortBtn label="TRADES" col="nb_trades" sort={sort} setSort={setSort} />
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <LeaderboardRow
                      key={row.pair}
                      row={row}
                      rank={i + 1}
                      isTopN={i < 3}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interpretation note */}
          <div className="text-[9px] t-text-m font-semibold p-4 t-card rounded-xl border t-border-s leading-relaxed">
            <span className="text-[#FFB81C] font-black">INTERPRETATION · </span>
            Sharpe ratio ≥ 1.0 = good risk-adjusted return. Sharpe ≥ 2.0 = excellent.
            Negative Sharpe = strategy lost money on a risk-adjusted basis.
            Click any row to inspect its metrics. All results are out-of-sample where data permits.
            Past performance does not guarantee future results.
          </div>
        </>
      )}
    </div>
  );
};

export default FxPairLeaderboard;

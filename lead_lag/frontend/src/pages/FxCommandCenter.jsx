import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart2, TrendingUp, TrendingDown, RefreshCw,
  AlertCircle, Loader2, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────────── */
const fmtPair = s => {
  if (!s) return '—';
  // EUR_USD_B1 → EUR/USD·B1,  EUR_USD_B → EUR/USD,  AUD_USD → AUD/USD
  return s.replace(/_B1$/, '/B1').replace(/_B$/, '').replace(/_/g, '/');
};
const fmt = (n, d = 5) => typeof n === 'number' ? n.toFixed(d) : '—';

/* ─── Regime config ─────────────────────────────────────────────────────────────*/
const REGIME_META = {
  Bull:              { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-400' },
  Bear:              { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     dot: 'bg-red-400'     },
  'High Volatility': { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  dot: 'bg-violet-400'  },
  Range:             { color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/25',   dot: 'bg-slate-400'   },
};

/* ─── Indicator chip ──────────────────────────────────────────────────────────── */
const Chip = ({ label, bull }) => {
  if (bull === null || bull === undefined)
    return <span className="px-1.5 py-0.5 rounded border border-white/8 text-[8px] font-black text-slate-500 uppercase">{label} —</span>;
  return bull
    ? <span className="px-1.5 py-0.5 rounded border border-emerald-500/25 bg-emerald-500/8 text-[8px] font-black text-emerald-400 uppercase flex items-center gap-0.5"><ArrowUpRight size={9}/>{label}</span>
    : <span className="px-1.5 py-0.5 rounded border border-red-500/25 bg-red-500/8 text-[8px] font-black text-red-400 uppercase flex items-center gap-0.5"><ArrowDownRight size={9}/>{label}</span>;
};

/* ─── PairCard ───────────────────────────────────────────────────────────────── */
const PairCard = ({ row }) => {
  const reg    = REGIME_META[row.hmm_regime] ?? REGIME_META.Range;
  const isBull = row.trend === 'Bullish';
  const slopePos = (row.slope ?? 0) > 0;

  const rsiColor = row.rsi != null
    ? (row.rsi > 70 ? 'text-red-400' : row.rsi < 30 ? 'text-emerald-400' : 'text-[#FFB81C]')
    : 'text-slate-500';
  const rsiLabel = row.rsi != null
    ? (row.rsi > 70 ? 'OB' : row.rsi < 30 ? 'OS' : 'NEU')
    : '—';

  return (
    <div className="t-card rounded-xl border t-border-s p-4 hover:border-[#FFB81C]/20
                    hover:shadow-md transition-all duration-200 flex flex-col gap-3">

      {/* Pair + regime */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-black font-mono t-text">{fmtPair(row.pair)}</span>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black
                          uppercase tracking-widest border ${reg.bg} ${reg.border} ${reg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${reg.dot}`}/>
          {row.hmm_regime ?? 'Range'}
        </span>
      </div>

      {/* Price + trend */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-0.5">Price</div>
          <div className="text-xl font-black font-mono t-text">{fmt(row.price)}</div>
        </div>
        <span className={`flex items-center gap-0.5 text-[10px] font-black
                          ${isBull ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBull ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
          {row.trend ?? '—'}
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t t-border-s text-[9px]">
        <div>
          <div className="t-text-m font-bold uppercase tracking-widest mb-0.5">RSI</div>
          <div className="font-black font-mono flex items-center gap-1">
            <span className={rsiColor}>{row.rsi != null ? row.rsi.toFixed(1) : '—'}</span>
            <span className={`text-[7px] font-black ${rsiColor}`}>{rsiLabel}</span>
          </div>
        </div>
        <div>
          <div className="t-text-m font-bold uppercase tracking-widest mb-0.5">ATR</div>
          <div className="font-black font-mono text-blue-400">{fmt(row.atr, 4)}</div>
        </div>
        <div>
          <div className="t-text-m font-bold uppercase tracking-widest mb-0.5">Slope</div>
          <div className={`font-black font-mono ${slopePos ? 'text-emerald-400' : 'text-red-400'}`}>
            {slopePos ? '+' : ''}{fmt(row.slope, 2)}
          </div>
        </div>
      </div>

      {/* Indicator chips */}
      <div className="flex gap-1.5 flex-wrap">
        <Chip label="MACD"  bull={row.macd_bull}    />
        <Chip label="SMA×" bull={row.golden_cross} />
      </div>
    </div>
  );
};

/* ─── KPI card ───────────────────────────────────────────────────────────────── */
const KPI = ({ label, value, accent, sub }) => (
  <div className="t-card rounded-xl border t-border-s p-4">
    <div className="text-[8px] font-black uppercase tracking-[0.18em] t-text-m mb-1">{label}</div>
    <div className={`text-2xl font-black font-mono ${accent}`}>{value}</div>
    {sub && <div className="text-[8px] t-text-m mt-0.5">{sub}</div>}
  </div>
);

/* ─── Main ───────────────────────────────────────────────────────────────────── */
const FxCommandCenter = () => {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, sigRes] = await Promise.all([
        axios.get('/api/fx/dashboard'),
        axios.get('/api/fx/live_signals'),
      ]);

      const sigMap = {};
      for (const s of sigRes.data) sigMap[s.pair] = s;

      const merged = dashRes.data.map(d => ({
        ...d,
        action:       sigMap[d.pair]?.action       ?? 'FLAT',
        rsi:          sigMap[d.pair]?.rsi          ?? null,
        rsi_state:    sigMap[d.pair]?.rsi_state    ?? 'N/A',
        macd_bull:    sigMap[d.pair]?.macd_bull    ?? null,
        golden_cross: sigMap[d.pair]?.golden_cross ?? null,
      }));

      const regOrder = { Bull: 0, Bear: 1, Range: 2, 'High Volatility': 3 };
      merged.sort((a, b) => (regOrder[a.hmm_regime] ?? 4) - (regOrder[b.hmm_regime] ?? 4));

      setRows(merged);
    } catch (e) {
      setError('Failed to load FX market data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const nBull     = rows.filter(r => r.hmm_regime === 'Bull').length;
  const nBear     = rows.filter(r => r.hmm_regime === 'Bear').length;
  const nRange    = rows.filter(r => r.hmm_regime === 'Range').length;
  const nVolatile = rows.filter(r => r.hmm_regime === 'High Volatility').length;
  const nOB       = rows.filter(r => r.rsi != null && r.rsi > 70).length;
  const nOS       = rows.filter(r => r.rsi != null && r.rsi < 30).length;

  const visible = filter === 'BULL'  ? rows.filter(r => r.hmm_regime === 'Bull')
                : filter === 'BEAR'  ? rows.filter(r => r.hmm_regime === 'Bear')
                : filter === 'RANGE' ? rows.filter(r => r.hmm_regime === 'Range' || r.hmm_regime === 'High Volatility')
                : rows;

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={28} className="text-[#FFB81C] animate-spin" />
        <div className="text-[10px] font-black t-text-m uppercase tracking-widest">Loading FX Market Data…</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="h-full flex items-center justify-center text-red-400 gap-2">
      <AlertCircle size={18} /> <span>{error}</span>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
            <BarChart2 className="text-[#FFB81C]" size={22} />
            FX Market Monitor
          </h1>
          <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
            HMM Regime · RSI · MACD · SMA Cross · {rows.length} Pairs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border t-border-s t-elevated
                       t-text-m hover:t-text hover:border-[#FFB81C]/50 transition-all text-[10px]
                       font-black uppercase tracking-widest">
            <RefreshCw size={12}/> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI bar ── */}
      <div className="grid grid-cols-6 gap-3">
        <KPI label="Bull"        value={nBull}     accent="text-emerald-400" sub="uptrend" />
        <KPI label="Bear"        value={nBear}      accent="text-red-400"     sub="downtrend" />
        <KPI label="Range"       value={nRange}     accent="text-slate-400"   sub="no trend" />
        <KPI label="High Vol"    value={nVolatile}  accent="text-violet-400"  sub="elevated ATR" />
        <KPI label="RSI > 70"    value={nOB}        accent="text-red-400"     sub="overbought" />
        <KPI label="RSI < 30"    value={nOS}        accent="text-emerald-400" sub="oversold" />
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-2">
        {[
          { key: 'ALL',   label: `All (${rows.length})` },
          { key: 'BULL',  label: `Bull (${nBull})` },
          { key: 'BEAR',  label: `Bear (${nBear})` },
          { key: 'RANGE', label: `Range/Vol (${nRange + nVolatile})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest border transition-all
                        ${filter === key
                          ? 'bg-[#FFB81C]/10 text-[#FFB81C] border-[#FFB81C]/30'
                          : 't-elevated t-text-m t-border-s hover:t-text'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Pair grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {visible.map((row, i) => <PairCard key={row.pair + i} row={row} />)}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-5 text-[8px] t-text-m font-bold uppercase tracking-widest">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/> Bull · positive slope</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400"/> Bear · negative slope</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"/> Range · flat</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400"/> High Vol · ATR spike</span>
        <span className="ml-auto">OB = RSI &gt; 70 · OS = RSI &lt; 30 · SMA× = 50/200 cross</span>
      </div>
    </div>
  );
};

export default FxCommandCenter;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Area, AreaChart
} from 'recharts';
import {
  Play, Loader2, AlertCircle, TrendingUp, TrendingDown,
  ChevronDown, BarChart2, DollarSign, Activity, Zap, Target,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import PairSelector from '../components/PairSelector';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';
const signed = n => (typeof n === 'number' && !isNaN(n)) ? (n >= 0 ? `+${fmt(n)}` : fmt(n)) : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

const ALL_IND = ['BB', 'RSI', 'MACD', 'SO', 'SAR', 'EMA'];
const CONFIRMER_MAP = {
  BB: ['RSI','MACD','SO','SAR','EMA'], RSI: ['MACD','BB','SO','SAR','EMA'],
  MACD: ['RSI','BB','SO','SAR','EMA'], SO: ['BB','MACD','RSI','SAR','EMA'],
  SAR: ['MACD','RSI','SO','BB','EMA'], EMA: ['MACD','RSI','SO','BB','SAR'],
};

const PAIR_DEFAULTS = {
  EUR_USD_B: { theta: 0.1,  epsilon: 0.0165  },
  AUD_USD:   { theta: 0.1,  epsilon: 0.00336 },
  GBP_USD:   { theta: 0.2,  epsilon: 0.0005  },
  NZD_USD:   { theta: 0.1,  epsilon: 0.0027  },
  USD_CAD:   { theta: 0.4,  epsilon: 0.0168  },
  USD_CHF:   { theta: 0.2,  epsilon: 0.005   },
  USD_JPY:   { theta: 0.1,  epsilon: 1.967   },
};

/* ── theme-aware tooltip ─────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="t-card border t-border-s rounded-xl px-4 py-3 shadow-2xl" style={{ minWidth: 160 }}>
      <div className="text-[10px] font-black uppercase tracking-widest t-text-m mb-2 border-b t-border-s pb-1.5">
        {fmtDate(label || payload[0]?.payload?.date)}
      </div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
            <span className="text-[10px] t-text-m font-bold">{p.name || 'Value'}</span>
          </div>
          <span className="text-[11px] font-black font-mono t-text">
            {formatter ? formatter(p.value) : `$${fmt(p.value)}`}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── small sub-components ──────────────────────────────────────────────────── */
const Label = ({ children }) => (
  <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5">{children}</div>
);

const MetricCard = ({ label, value, accent = 't-text', icon: Icon, sub }) => (
  <div className="t-card rounded-xl border t-border-s p-4 flex flex-col gap-1.5 hover:border-[#FFB81C]/20 transition-all">
    <div className="flex items-center justify-between">
      <div className="text-[8px] font-black t-text-m uppercase tracking-[0.18em]">{label}</div>
      {Icon && <Icon size={13} className="t-text-m" />}
    </div>
    <div className={`text-xl font-black font-mono ${accent}`}>{value}</div>
    {sub && <div className="text-[8px] t-text-m">{sub}</div>}
  </div>
);

/* ── position chart ──────────────────────────────────────────────────────── */
const PositionChart = ({ equity, positions }) => {
  if (!equity?.length) return null;
  const lastDate = equity[equity.length - 1].date;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={equity} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
          tickFormatter={fmtDate} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
          tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
        <Tooltip content={<ChartTip />} />
        {positions.map((p, i) => (
          <ReferenceArea key={i}
            x1={p.entry_date} x2={p.exit_date ?? lastDate}
            fill={p.direction === 1 ? '#22c55e' : '#ef4444'}
            fillOpacity={0.15} strokeOpacity={0} />
        ))}
        {positions.map((p, i) => (
          <ReferenceLine key={`sep-${i}`} x={p.entry_date}
            stroke="#ffffff" strokeWidth={1.5} />
        ))}
        <Line type="monotone" dataKey="value" stroke="#FFB81C" dot={false} strokeWidth={1.5} name="Equity" />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* ── main component ─────────────────────────────────────────────────────── */
const FxBacktestRunner = ({ prefill }) => {
  const [mode, setMode] = useState('combination');
  const [selectedPair, setSelectedPair] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tradeSortKey, setTradeSortKey] = useState(null);
  const [tradeSortAsc, setTradeSortAsc] = useState(false);

  const [primary, setPrimary] = useState('RSI');
  const [confirmers, setConfirmers] = useState(['MACD', 'SO']);
  const [stpMult, setStpMult] = useState(3);
  const [tpMult, setTpMult] = useState(3);
  const [capital, setCapital] = useState(10000);

  const [theta, setTheta] = useState(0.1);
  const [epsilon, setEpsilon] = useState(0.0165);
  const [regimeInds, setRegimeInds] = useState(['RSI','MACD','SO','SAR','BB','EMA']);
  const [weights, setWeights] = useState({ EMA:0.2, MACD:0.2, RSI:0.2, SO:0.2, PSAR:0.1, BB:0.1 });

  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0);

  useEffect(() => {
    if (prefill?.mode === 'regime') {
      setMode('regime');
      if (prefill.theta != null) setTheta(prefill.theta);
      if (prefill.epsilon != null) setEpsilon(prefill.epsilon);
    }
  }, [prefill]);

  const handlePairChange = (pair) => {
    setSelectedPair(pair);
    const defaults = PAIR_DEFAULTS[pair.name];
    if (defaults) { setTheta(defaults.theta); setEpsilon(defaults.epsilon); }
  };

  const toggleConfirmer = (ind) =>
    setConfirmers(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);
  const toggleRegimeInd = (ind) =>
    setRegimeInds(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);

  const handleRun = async () => {
    if (!selectedPair) { setError('Select an index first.'); return; }
    setRunning(true); setError(null); setResult(null);
    try {
      const payload = {
        file_path: selectedPair.file_path,
        file_type: selectedPair.file_type,
        initial_capital: Number(capital),
        strategy: mode,
        stp_multiplier: Number(stpMult),
        tp_multiplier: Number(tpMult),
        indicator_config: mode === 'combination'
          ? { primary, confirmers }
          : { weights, theta_enter: Number(theta), eps_trend: Number(epsilon), confirmed_indicators: regimeInds },
      };
      const r = await axios.post('/api/fx/backtest/run', payload);
      setResult(r.data);
    } catch (err) {
      setError(err.response?.data?.detail?.message || err.message || 'Backtest failed');
    } finally { setRunning(false); }
  };

  const m = result?.metrics;
  const validConfirmers = CONFIRMER_MAP[primary] || [];

  const toggleTradeSort = (key) => {
    if (tradeSortKey === key) setTradeSortAsc(p => !p);
    else { setTradeSortKey(key); setTradeSortAsc(false); }
  };

  const sortedTrades = (() => {
    if (!result?.positions?.length) return [];
    const trades = result.positions.map(t => ({
      ...t,
      _dur: t.entry_date && t.exit_date
        ? Math.round((new Date(t.exit_date) - new Date(t.entry_date)) / 86400000)
        : null,
    }));
    if (!tradeSortKey) return trades;
    return [...trades].sort((a, b) => {
      const av = a[tradeSortKey] ?? '';
      const bv = b[tradeSortKey] ?? '';
      if (typeof av === 'string') return tradeSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return tradeSortAsc ? av - bv : bv - av;
    });
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FFB81C] mb-1">Equity Indices Platform</div>
          <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
            <BarChart2 className="text-[#FFB81C]" size={22} />
            Backtest Runner
          </h1>
          <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
            Single-asset · {mode === 'combination' ? 'Confirmation' : 'Regime'} strategy · {selectedPair ? selectedPair.name.replace(/_/g, '/') : 'No Index'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* ── Left panel: config ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="t-card rounded-xl border t-border-s p-4">
            <PairSelector value={selectedPair} onChange={handlePairChange} />
          </div>

          {/* Capital + multipliers */}
          <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
            <Label>Position & Risk</Label>
            <div className="grid grid-cols-3 gap-3">
              {[['Capital ($)', capital, setCapital, 1000], ['Stop Loss ×', stpMult, setStpMult, 0.1], ['Take Profit ×', tpMult, setTpMult, 0.1]].map(([lbl, val, set, step]) => (
                <div key={lbl}>
                  <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">{lbl}</div>
                  <input type="number" value={val} step={step} min={0}
                    onChange={e => set(e.target.value)}
                    className="w-full t-elevated border t-border-s rounded-lg px-2.5 py-2 text-[11px] font-mono
                               t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent transition-colors" />
                </div>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
            <Label>Strategy Mode</Label>
            <div className="flex gap-1 p-1 rounded-xl t-elevated border t-border-s">
              {['combination','regime'].map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all
                              ${mode === m ? 'bg-[#FFB81C] text-black shadow-lg shadow-[#FFB81C]/20' : 't-text-m hover:t-text'}`}>
                  {m === 'combination' ? '⚡ Confirmation' : '🎯 Regime'}
                </button>
              ))}
            </div>
          </div>

          {/* Combination config */}
          {mode === 'combination' && (
            <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
              <Label>Primary Indicator</Label>
              <div className="relative">
                <select value={primary} onChange={e => { setPrimary(e.target.value); setConfirmers([]); }}
                  className="w-full t-elevated border t-border-s rounded-xl px-3 py-2.5 text-[11px] font-mono
                             t-text appearance-none focus:outline-none focus:border-[#FFB81C]/60 bg-transparent cursor-pointer"
                  style={{ colorScheme: 'dark' }}>
                  {ALL_IND.map(i => <option key={i} value={i} style={{ background: 'var(--surface-card)' }}>{i}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 t-text-m pointer-events-none" />
              </div>
              <Label>Confirming Indicators</Label>
              <div className="flex flex-wrap gap-1.5">
                {validConfirmers.map(ind => (
                  <button key={ind} onClick={() => toggleConfirmer(ind)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                ${confirmers.includes(ind)
                                  ? 'bg-[#FFB81C]/15 border-[#FFB81C]/50 text-[#FFB81C] shadow-sm'
                                  : 't-border-s t-text-m hover:t-text'}`}>
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Regime config */}
          {mode === 'regime' && (
            <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">θ Vote Threshold</div>
                  <input type="range" min={0.05} max={0.6} step={0.05} value={theta}
                    onChange={e => setTheta(parseFloat(e.target.value))}
                    className="w-full accent-[#FFB81C]" />
                  <div className="text-[11px] font-mono text-[#FFB81C] font-black mt-0.5">{theta}</div>
                </div>
                <div>
                  <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">ε Trend Slope</div>
                  <input type="number" value={epsilon} step={0.001} min={0}
                    onChange={e => setEpsilon(parseFloat(e.target.value))}
                    className="w-full t-elevated border t-border-s rounded-lg px-2.5 py-2 text-[11px] font-mono
                               t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
                </div>
              </div>
              <Label>Indicator Weights</Label>
              <div className="space-y-1.5">
                {Object.entries(weights).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-[9px] font-black t-text w-10">{k}</span>
                    <input type="range" min={0} max={1} step={0.05} value={v}
                      onChange={e => setWeights(prev => ({ ...prev, [k]: parseFloat(e.target.value) }))}
                      className="flex-1 accent-[#FFB81C]" />
                    <span className="text-[10px] font-mono text-[#FFB81C] w-8 text-right font-black">{v.toFixed(2)}</span>
                  </div>
                ))}
                <div className={`text-[9px] font-black ${Math.abs(weightSum - 1) > 0.01 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  Σ = {weightSum.toFixed(2)} {Math.abs(weightSum - 1) > 0.01 ? '⚠ should equal 1.0' : '✓'}
                </div>
              </div>
              <Label>Active Indicators</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_IND.map(ind => (
                  <button key={ind} onClick={() => toggleRegimeInd(ind)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                ${regimeInds.includes(ind)
                                  ? 'bg-[#FFB81C]/15 border-[#FFB81C]/50 text-[#FFB81C] shadow-sm'
                                  : 't-border-s t-text-m hover:t-text'}`}>
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Run button */}
          <button onClick={handleRun} disabled={running || !selectedPair}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-[11px]
                       uppercase tracking-widest transition-all bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90
                       disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#FFB81C]/20
                       active:scale-[0.98]">
            {running ? <><Loader2 size={14} className="animate-spin" /> Running backtest…</> : <><Play size={14} /> Run Backtest</>}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2.5">
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-[10px] text-red-400">{error}</span>
            </div>
          )}
        </div>

        {/* ── Right panel: results ───────────────────────────────────────── */}
        <div className="space-y-4">
          {!result && !running && (
            <div className="flex items-center justify-center h-64 t-card rounded-xl border t-border-s">
              <div className="text-center t-text-m">
                <BarChart2 size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Select an index and run</p>
                <p className="text-[9px] mt-1 opacity-30">Results will appear here</p>
              </div>
            </div>
          )}

          {running && (
            <div className="flex items-center justify-center h-64 t-card rounded-xl border t-border-s">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-[#FFB81C]" />
                <p className="text-[11px] t-text-m font-black uppercase tracking-widest">Executing backtest…</p>
              </div>
            </div>
          )}

          {result && !running && (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Total Return" icon={TrendingUp}
                  value={`${signed(m?.total_return)}%`}
                  accent={(m?.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  sub={`Annual: ${signed(m?.annual_return)}%`} />
                <MetricCard label="Sharpe Ratio" icon={Target}
                  value={fmt(m?.sharpe_ratio, 3)}
                  accent={(m?.sharpe_ratio ?? 0) >= 1 ? 'text-emerald-400' : 'text-amber-400'}
                  sub={`Risk-adjusted performance`} />
                <MetricCard label="Max Drawdown" icon={TrendingDown}
                  value={`${fmt(m?.max_drawdown)}%`} accent="text-red-400"
                  sub="Largest peak-to-trough" />
                <MetricCard label="Trade Count" icon={Zap}
                  value={m?.nb_trades ?? '—'} accent="text-blue-400"
                  sub="Total executed" />
                <MetricCard label="Buy & Hold" icon={DollarSign}
                  value={`${signed(m?.buy_hold_return)}%`}
                  accent={(m?.buy_hold_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  sub="Benchmark return" />
                <MetricCard label="Alpha" icon={ArrowUpRight}
                  value={`${signed((m?.total_return ?? 0) - (m?.buy_hold_return ?? 0))}%`}
                  accent={((m?.total_return ?? 0) - (m?.buy_hold_return ?? 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  sub="Strategy vs B&H" />
              </div>

              {/* Equity curve */}
              <div className="t-card rounded-xl border t-border-s p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">Equity Curve</div>
                  <div className="flex items-center gap-3 text-[8px] t-text-m font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded bg-[#FFB81C]" /> Portfolio</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={result.equity} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFB81C" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#FFB81C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                      tickFormatter={fmtDate} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
                      tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="value" stroke="#FFB81C" strokeWidth={1.5}
                      fill="url(#eqGrad)" name="Portfolio" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* P&L curve */}
              <div className="t-card rounded-xl border t-border-s p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">Cumulative P&L</div>
                  <div className="flex items-center gap-3 text-[8px] font-bold">
                    <span className="font-mono t-text">
                      Final: <span className={`font-black ${(m?.last_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${fmt(m?.last_pnl)}
                      </span>
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={result.pnl} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                      tickFormatter={fmtDate} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
                      tickFormatter={v => `$${v.toFixed(0)}`} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={0} stroke="var(--border-primary)" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5}
                      fill="url(#pnlGrad)" name="P&L" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Position chart */}
              <div className="t-card rounded-xl border t-border-s p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">Trade Positions</div>
                  <div className="flex items-center gap-4 text-[8px] t-text-m font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm bg-emerald-400 opacity-50" /> Long Position</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm bg-red-400 opacity-50" /> Short Position</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded bg-[#FFB81C]" /> Equity</span>
                  </div>
                </div>
                <PositionChart equity={result.equity} positions={result.positions} />
              </div>

              {/* Trade log */}
              {sortedTrades.length > 0 && (
                <div className="t-card rounded-xl border t-border-s overflow-hidden">
                  <div className="px-5 py-3 border-b t-border-s flex items-center justify-between">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C]">
                      Trade Log
                      <span className="text-[8px] t-text-m font-bold ml-2">({sortedTrades.length} trades)</span>
                    </div>
                    <div className="text-[8px] t-text-m font-bold uppercase tracking-widest">Click column to sort</div>
                  </div>
                  <div className="overflow-auto max-h-[360px]">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 t-card border-b t-border-s">
                        <tr>
                          {[
                            { lbl: '#',         key: null },
                            { lbl: 'DIR',        key: 'direction' },
                            { lbl: 'ENTRY DATE', key: 'entry_date' },
                            { lbl: 'EXIT DATE',  key: 'exit_date' },
                            { lbl: 'DAYS',       key: '_dur' },
                            { lbl: 'ENTRY PX',   key: 'entry_price' },
                            { lbl: 'EXIT PX',    key: 'exit_price' },
                            { lbl: 'SIZE',       key: 'size' },
                            { lbl: 'STOP',       key: 'stop' },
                            { lbl: 'TP',         key: 'take_profit' },
                            { lbl: 'PnL',        key: 'pnl' },
                          ].map(({ lbl, key }) => (
                            <th key={lbl}
                              onClick={() => key && toggleTradeSort(key)}
                              className={`px-3 py-2.5 text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-colors
                                          ${key ? 'cursor-pointer hover:text-[#FFB81C]' : 't-text-m'}
                                          ${tradeSortKey === key ? 'text-[#FFB81C]' : 't-text-m'}`}>
                              {lbl}{tradeSortKey === key ? (tradeSortAsc ? ' ↑' : ' ↓') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTrades.map((t, i) => (
                          <tr key={i} className={`border-b t-border-s transition-colors hover:bg-[var(--table-row-hover)]
                                                   ${i % 2 !== 0 ? 'bg-white/[0.02]' : ''}`}>
                            <td className="px-3 py-2 text-[9px] t-text-m font-bold">{i + 1}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[9px] font-black ${t.direction === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {t.direction === 1 ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text whitespace-nowrap">{fmtDate(t.entry_date)}</td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text whitespace-nowrap">
                              {t.exit_date
                                ? fmtDate(t.exit_date)
                                : <span className="text-amber-400 font-black text-[8px]">Open</span>}
                            </td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text-m">{t._dur ?? '—'}</td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text">{fmt(t.entry_price, 5)}</td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text">
                              {t.exit_price != null ? fmt(t.exit_price, 5) : '—'}
                            </td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text-m">{t.size}</td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text-m">{fmt(t.stop, 5)}</td>
                            <td className="px-3 py-2 text-[9px] font-mono t-text-m">{fmt(t.take_profit, 5)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-black font-mono
                                                ${t.pnl != null ? ((t.pnl >= 0) ? 'text-emerald-400' : 'text-red-400') : 't-text-m'}`}>
                                {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FxBacktestRunner;

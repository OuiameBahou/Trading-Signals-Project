import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Radio, RefreshCw, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Minus, Clock, Filter
} from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const REFRESH_INTERVAL = 30; // seconds

const SIGNAL_META = {
  LONG:  { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', glow: 'bg-emerald-500', Icon: TrendingUp  },
  SHORT: { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     glow: 'bg-red-500',     Icon: TrendingDown },
  FLAT:  { color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/25',   glow: 'bg-slate-500',   Icon: Minus        },
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const fmt     = (n, d = 5) => typeof n === 'number' ? n.toFixed(d) : '—';
const fmtPair = s => (s || '').replace(/_B$/, '').replace(/_/g, '/');

/* ─── CountdownRing ──────────────────────────────────────────────────────────── */
const CountdownRing = ({ seconds, total }) => {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const progress = (seconds / total) * circ;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="rotate-[-90deg]">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke="#FFB81C"
        strokeWidth="2.5"
        strokeDasharray={`${progress} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s linear' }}
      />
      <text x="18" y="22" textAnchor="middle" fill="#FFB81C"
            fontSize="9" fontWeight="900" fontFamily="monospace"
            style={{ transform: 'rotate(90deg)', transformOrigin: '18px 18px' }}>
        {seconds}s
      </text>
    </svg>
  );
};

/* ─── SignalCard ─────────────────────────────────────────────────────────────── */
const SignalCard = ({ sig }) => {
  const meta    = SIGNAL_META[sig.action] ?? SIGNAL_META.FLAT;
  const SigIcon = meta.Icon;
  const isActive = sig.action !== 'FLAT';

  return (
    <div className={`t-card rounded-2xl border ${meta.border} p-5 relative overflow-hidden
                     group hover:shadow-xl hover:shadow-black/30 transition-all duration-300`}>

      {/* Glow */}
      <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-[48px]
                       opacity-10 group-hover:opacity-25 pointer-events-none transition-opacity
                       ${meta.glow}`} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="text-lg font-black t-text tracking-widest font-mono">
          {fmtPair(sig.pair)}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black
                         uppercase tracking-widest border ${meta.bg} ${meta.color} ${meta.border}`}>
          {isActive && <span className={`w-1.5 h-1.5 rounded-full ${meta.glow} animate-pulse`} />}
          <SigIcon size={11} />
          {sig.action}
        </div>
      </div>

      {/* Price */}
      <div className="relative z-10 mb-4">
        <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-0.5">Current Price</div>
        <div className="text-2xl font-black font-mono t-text">{fmt(sig.price)}</div>
      </div>

      {/* TP / SL */}
      {isActive ? (
        <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
          <div className="t-elevated rounded-xl p-3 border border-emerald-500/15">
            <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 mb-1">Take Profit</div>
            <div className="text-sm font-black font-mono text-emerald-400">{fmt(sig.tp)}</div>
          </div>
          <div className="t-elevated rounded-xl p-3 border border-red-500/15">
            <div className="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-1">Stop Loss</div>
            <div className="text-sm font-black font-mono text-red-400">{fmt(sig.sl)}</div>
          </div>
        </div>
      ) : (
        <div className="mb-4 t-elevated rounded-xl p-3 border t-border-s relative z-10">
          <div className="text-[9px] t-text-m font-bold uppercase tracking-widest">Status</div>
          <div className="text-sm font-bold t-text-m mt-0.5">No active setup — monitoring</div>
        </div>
      )}

      {/* Footer */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t t-border-s relative z-10 text-[11px]">
        <div>
          <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-0.5">Daily ATR</div>
          <div className="font-black font-mono text-blue-400">{fmt(sig.atr, 4)}</div>
        </div>
        <div>
          <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-0.5">Signal Date</div>
          <div className="font-bold font-mono t-text-m">{sig.date ?? '—'}</div>
        </div>
        <div>
          <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-0.5">Conviction</div>
          <div className={`font-black ${sig.conviction === 'High' ? 'text-[#FFB81C]' : 't-text-m'}`}>
            {sig.conviction ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-0.5">Risk:Reward</div>
          <div className="font-black font-mono t-text">
            {isActive && sig.tp && sig.sl && sig.price
              ? (() => {
                  const reward = Math.abs(sig.tp - sig.price);
                  const risk   = Math.abs(sig.sl - sig.price);
                  return risk > 0 ? `1 : ${(reward / risk).toFixed(2)}` : '—';
                })()
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── StatBadge ─────────────────────────────────────────────────────────────── */
const StatBadge = ({ label, value, accent }) => (
  <div className="t-card rounded-xl border t-border-s px-5 py-3 flex items-center gap-4">
    <div className={`text-3xl font-black font-mono ${accent}`}>{value}</div>
    <div className="text-[9px] t-text-m font-black uppercase tracking-[0.18em] leading-tight">{label}</div>
  </div>
);

/* ─── Main ───────────────────────────────────────────────────────────────────── */
const FxSignalMonitor = () => {
  const [signals, setSignals]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastTime, setLastTime]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get('/api/fx/live_signals');
      // Sort: LONG first, SHORT, then FLAT; within each by pair name
      const sorted = [...r.data].sort((a, b) => {
        const order = { LONG: 0, SHORT: 1, FLAT: 2 };
        const od = (order[a.action] ?? 2) - (order[b.action] ?? 2);
        return od !== 0 ? od : a.pair.localeCompare(b.pair);
      });
      setSignals(sorted);
      setLastTime(new Date().toLocaleTimeString());
      setCountdown(REFRESH_INTERVAL);
    } catch (e) {
      setError('Failed to fetch live signals.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Countdown and auto-refresh */
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          load();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  /* Derived */
  const nLong  = signals.filter(s => s.action === 'LONG').length;
  const nShort = signals.filter(s => s.action === 'SHORT').length;
  const nFlat  = signals.filter(s => s.action === 'FLAT').length;
  const nActive = nLong + nShort;

  const visible = filter === 'ALL' ? signals : signals.filter(s => s.action === filter);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
            <Radio className="text-[#FFB81C]" size={24} />
            Live Signal Monitor
          </h1>
          <p className="text-[10px] t-text-m mt-1.5 uppercase tracking-widest font-bold">
            MACD · RSI · BB consensus · {signals.length} pairs · Auto-refresh every {REFRESH_INTERVAL}s
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastTime && (
            <div className="flex items-center gap-2 text-[9px] t-text-m font-bold">
              <Clock size={11} />
              {lastTime}
            </div>
          )}
          <CountdownRing seconds={countdown} total={REFRESH_INTERVAL} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border t-border-s t-elevated
                       t-text-m hover:t-text hover:border-[#FFB81C]/50 transition-all text-[11px]
                       font-black uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 gap-3">
        <StatBadge label="Long Setups"  value={nLong}  accent="text-emerald-400" />
        <StatBadge label="Short Setups" value={nShort} accent="text-red-400"     />
        <StatBadge label="Flat / Wait"  value={nFlat}  accent="text-slate-400"   />
        <StatBadge label="Active Pos."  value={nActive} accent="text-[#FFB81C]"  />
      </div>

      {/* ── Pulse bar for active signals ── */}
      {nActive > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#FFB81C]/5 border border-[#FFB81C]/20">
          <div className="w-2 h-2 rounded-full bg-[#FFB81C] animate-ping absolute" />
          <div className="w-2 h-2 rounded-full bg-[#FFB81C]" />
          <span className="text-[11px] font-black text-[#FFB81C] uppercase tracking-widest">
            {nActive} active signal{nActive !== 1 ? 's' : ''} — {nLong > 0 && `${nLong} LONG`}{nLong > 0 && nShort > 0 && ', '}{nShort > 0 && `${nShort} SHORT`}
          </span>
          <span className="ml-auto text-[9px] t-text-m font-bold">Indicators: MACD · RSI · Bollinger Bands</span>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-2">
        <Filter size={13} className="t-text-m" />
        {['ALL', 'LONG', 'SHORT', 'FLAT'].map(f => {
          const meta   = SIGNAL_META[f] ?? {};
          const active = filter === f;
          const count  = f === 'ALL' ? signals.length : signals.filter(s => s.action === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest
                          border transition-all ${active && f !== 'ALL'
                ? `${meta.bg} ${meta.color} ${meta.border}`
                : active
                ? 'bg-white/5 t-text border-white/20'
                : 't-elevated t-text-m t-border-s hover:t-text'}`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 font-bold bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && signals.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-[#FFB81C] animate-spin" />
            <div className="text-[10px] t-text-m font-black uppercase tracking-widest">
              Computing live signals…
            </div>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex items-center justify-center h-40 t-text-m text-sm">
          No signals match filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {visible.map((sig, i) => <SignalCard key={i} sig={sig} />)}
        </div>
      )}

      {/* ── Methodology note ── */}
      <div className="flex items-start gap-3 p-4 t-card rounded-xl border t-border-s text-[9px] t-text-m font-semibold leading-relaxed">
        <span className="text-[#FFB81C] font-black flex-shrink-0">NOTE</span>
        Signals are generated by a multi-indicator consensus engine (MACD crossover · RSI threshold · Bollinger Band breakout).
        A signal fires when the primary indicator triggers AND at least one confirmer agrees.
        TP and SL are set at 1.5× and 2.0× the 56-day ATR respectively.
        This is a backtested signal engine — not financial advice.
      </div>
    </div>
  );
};

export default FxSignalMonitor;

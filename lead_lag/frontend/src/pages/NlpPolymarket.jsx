import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus, Target, BarChart3 } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const sentColor = (s) => {
  if (s == null) return 'text-slate-500';
  if (s > 0.15) return 'text-emerald-400';
  if (s < -0.15) return 'text-red-400';
  return 'text-slate-400';
};
const probColor = (p) => {
  if (p == null) return 'text-slate-500';
  if (p > 0.65) return 'text-emerald-400';
  if (p < 0.35) return 'text-red-400';
  return 'text-amber-400';
};
const fmtDate = (ts) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ts; }
};
const fmt = (n, d = 3) => typeof n === 'number' ? (n > 0 ? '+' : '') + n.toFixed(d) : n ?? '—';

/* ─── Signal card ─────────────────────────────────────────────────────────── */
const SignalCard = ({ sig }) => {
  const sent = sig.sentiment ?? sig.composite_score ?? sig.score ?? null;
  const prob = sig.probability ?? sig.yes_price ?? sig.price ?? null;

  return (
    <div className="t-card rounded-xl border t-border-s p-5 hover:border-emerald-500/20 transition-all duration-200 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] t-text font-semibold leading-snug flex-1">{sig.title ?? sig.question ?? sig.event ?? '—'}</p>
        {sig.ticker && (
          <span className="flex-shrink-0 text-[9px] font-black text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            {sig.ticker}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {prob != null && (
          <div className="flex items-center gap-1.5">
            <Target size={12} className={probColor(prob)} />
            <span className={`text-[11px] font-black font-mono ${probColor(prob)}`}>
              {(prob * (prob <= 1 ? 100 : 1)).toFixed(1)}%
            </span>
            <span className="text-[9px] t-text-m">probability</span>
          </div>
        )}
        {sent != null && (
          <div className={`flex items-center gap-1 text-[11px] font-black ${sentColor(sent)}`}>
            {sent > 0.15 ? <TrendingUp size={11}/> : sent < -0.15 ? <TrendingDown size={11}/> : <Minus size={11}/>}
            <span className="font-mono">{fmt(sent)}</span>
            <span className="text-[9px] opacity-70">sentiment</span>
          </div>
        )}
        {sig.volume != null && (
          <span className="text-[10px] t-text-m">Vol: <span className="font-bold t-text">{(sig.volume / 1000).toFixed(0)}K</span></span>
        )}
      </div>

      {(sig.close_date ?? sig.end_date ?? sig.expiry) && (
        <div className="text-[9px] t-text-m">Closes: {fmtDate(sig.close_date ?? sig.end_date ?? sig.expiry)}</div>
      )}

      {sig.signal && (
        <div className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border
          ${sig.signal === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : sig.signal === 'SELL' ? 'border-red-500/30 bg-red-500/10 text-red-400'
          : 'border-slate-500/20 bg-slate-500/5 text-slate-400'}`}>
          {sig.signal}
        </div>
      )}
    </div>
  );
};

/* ─── Market row ──────────────────────────────────────────────────────────── */
const MarketRow = ({ mkt }) => {
  const prob = mkt.probability ?? mkt.yes_price ?? mkt.price ?? null;
  const vol  = mkt.volume ?? mkt.total_volume ?? null;

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b t-border-s hover:bg-white/[0.02] transition-colors last:border-b-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${probColor(prob).replace('text-', 'bg-')}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] t-text font-semibold leading-snug truncate">{mkt.title ?? mkt.question ?? mkt.event ?? '—'}</p>
        {mkt.category && <span className="text-[9px] t-text-m">{mkt.category}</span>}
      </div>
      {prob != null && (
        <div className={`flex-shrink-0 text-[12px] font-black font-mono ${probColor(prob)}`}>
          {(prob * (prob <= 1 ? 100 : 1)).toFixed(1)}%
        </div>
      )}
      {vol != null && (
        <div className="flex-shrink-0 text-[10px] t-text-m font-bold">
          ${(vol / 1000).toFixed(0)}K
        </div>
      )}
      <div className="text-[9px] t-text-m flex-shrink-0">{fmtDate(mkt.close_date ?? mkt.end_date)}</div>
    </div>
  );
};

/* ─── Main ─────────────────────────────────────────────────────────────── */
const NlpPolymarket = () => {
  const [signals, setSignals]   = useState([]);
  const [markets, setMarkets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState('signals'); // 'signals' | 'markets'

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [sigRes, mktRes] = await Promise.all([
        axios.get('/api/nlp/polymarket/signals').catch(() => ({ data: [] })),
        axios.get('/api/nlp/polymarket/markets').catch(() => ({ data: [] })),
      ]);
      const normList = (d) => Array.isArray(d) ? d : d?.signals ?? d?.markets ?? d?.items ?? d?.results ?? [];
      setSignals(normList(sigRes.data));
      setMarkets(normList(mktRes.data));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 t-text-m">
      <Loader2 size={20} className="animate-spin text-emerald-500" />
      <span className="text-[13px] font-bold uppercase tracking-widest">Loading Polymarket data...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 gap-3 text-red-400">
      <AlertCircle size={20} />
      <span className="text-[13px] font-bold">Backend unreachable — start NLP server on port 8002</span>
    </div>
  );

  const bullishSigs = signals.filter(s => (s.signal === 'BUY' || (s.sentiment ?? s.composite_score ?? 0) > 0.15));
  const bearishSigs = signals.filter(s => (s.signal === 'SELL' || (s.sentiment ?? s.composite_score ?? 0) < -0.15));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black t-text uppercase tracking-widest">Polymarket Intelligence</h1>
          <p className="text-[11px] t-text-m mt-1">Prediction market signals fused with NLP sentiment scoring</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-black uppercase tracking-widest transition-all"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="t-card rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-emerald-400/70">Signals</div>
          <div className="text-2xl font-black font-mono text-emerald-400">{signals.length}</div>
        </div>
        <div className="t-card rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-emerald-400/70">Bullish Signals</div>
          <div className="text-2xl font-black font-mono text-emerald-400">{bullishSigs.length}</div>
        </div>
        <div className="t-card rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-red-400/70">Bearish Signals</div>
          <div className="text-2xl font-black font-mono text-red-400">{bearishSigs.length}</div>
        </div>
        <div className="t-card rounded-xl border border-slate-500/20 bg-slate-500/5 p-5">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-slate-400/70">Open Markets</div>
          <div className="text-2xl font-black font-mono t-text">{markets.length}</div>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('signals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
            ${view === 'signals' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 't-text-m border-transparent hover:bg-white/5'}`}
        >
          <Target size={13} /> Trading Signals ({signals.length})
        </button>
        <button
          onClick={() => setView('markets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
            ${view === 'markets' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 't-text-m border-transparent hover:bg-white/5'}`}
        >
          <BarChart3 size={13} /> Markets ({markets.length})
        </button>
      </div>

      {/* Content */}
      {view === 'signals' ? (
        signals.length === 0 ? (
          <div className="t-card rounded-2xl border t-border-s p-12 text-center t-text-m text-[12px]">
            No signals available — run the Polymarket scraper to populate data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {signals.map((sig, i) => <SignalCard key={i} sig={sig} />)}
          </div>
        )
      ) : (
        <div className="t-card rounded-2xl border t-border-s overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b t-border-s">
            <span className="text-[12px] font-black t-text uppercase tracking-widest">Open Prediction Markets</span>
            <span className="text-[10px] t-text-m">{markets.length} markets</span>
          </div>
          {markets.length === 0 ? (
            <div className="p-12 text-center t-text-m text-[12px]">No markets data — run the Polymarket scraper.</div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {markets.map((m, i) => <MarketRow key={i} mkt={m} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NlpPolymarket;

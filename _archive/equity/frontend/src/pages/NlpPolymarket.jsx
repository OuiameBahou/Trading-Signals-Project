import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus,
  Target, BarChart3, Brain, Zap, Shield, Activity, ExternalLink, Filter
} from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const sentColor = (s) => {
  if (s == null) return 'text-slate-500';
  if (s > 0.15) return 'text-emerald-400';
  if (s < -0.15) return 'text-red-400';
  return 'text-amber-400';
};
const sentBg = (s) => {
  if (s == null) return 'bg-slate-500/10 border-slate-500/20';
  if (s > 0.15) return 'bg-emerald-500/10 border-emerald-500/20';
  if (s < -0.15) return 'bg-red-500/10 border-red-500/20';
  return 'bg-amber-500/10 border-amber-500/20';
};
const probColor = (p) => {
  if (p == null) return 'text-slate-500';
  if (p > 0.65) return 'text-emerald-400';
  if (p < 0.35) return 'text-red-400';
  return 'text-amber-400';
};
const impactBadge = (level) => {
  if (level === 'high') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (level === 'medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
};
const biasIcon = (bias) => {
  if (bias === 'risk-on') return <TrendingUp size={10} className="text-emerald-400" />;
  if (bias === 'risk-off') return <Shield size={10} className="text-red-400" />;
  return <Minus size={10} className="text-slate-400" />;
};
const fmtDate = (ts) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ts; }
};
const fmtVol = (v) => {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'economics', label: 'Economics' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'politics', label: 'Politics' },
  { key: 'business', label: 'Business' },
];

/* ─── Probability Bar ─────────────────────────────────────────────────────── */
const ProbBar = ({ prob }) => {
  const pct = (prob * 100).toFixed(0);
  const color = prob > 0.65 ? 'bg-emerald-500' : prob < 0.35 ? 'bg-red-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] font-black font-mono ${probColor(prob)} min-w-[36px] text-right`}>{pct}%</span>
    </div>
  );
};

/* ─── Signal Card (enriched with AI) ──────────────────────────────────────── */
const SignalCard = ({ mkt }) => {
  const prob = mkt.yes_probability ?? 0.5;
  const aiSent = mkt.ai_sentiment ?? 0;
  const tickers = mkt.tickers ?? [];

  return (
    <div className="t-card rounded-xl border t-border-s p-5 hover:border-emerald-500/30 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[12px] t-text font-semibold leading-snug flex-1">{mkt.question || '—'}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {mkt.ai_impact && (
            <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${impactBadge(mkt.ai_impact)}`}>
              {mkt.ai_impact}
            </span>
          )}
        </div>
      </div>

      {/* Ticker badges */}
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tickers.map((t) => (
            <span key={t} className="text-[9px] font-black text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Probability bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] t-text-m font-bold uppercase tracking-wider">Crowd Probability</span>
          <span className={`text-[9px] font-black uppercase tracking-wider ${
            mkt.crowd_signal === 'bullish' ? 'text-emerald-400' : mkt.crowd_signal === 'bearish' ? 'text-red-400' : 'text-amber-400'
          }`}>{mkt.crowd_signal}</span>
        </div>
        <ProbBar prob={prob} />
      </div>

      {/* AI Sentiment + Bias row */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${sentBg(aiSent)}`}>
          {aiSent > 0.15 ? <TrendingUp size={10} /> : aiSent < -0.15 ? <TrendingDown size={10} /> : <Minus size={10} />}
          <span className={`text-[10px] font-black font-mono ${sentColor(aiSent)}`}>
            {aiSent > 0 ? '+' : ''}{aiSent.toFixed(2)}
          </span>
          <span className="text-[8px] opacity-60">AI</span>
        </div>
        {mkt.ai_bias && (
          <div className="flex items-center gap-1 text-[9px] t-text-m">
            {biasIcon(mkt.ai_bias)}
            <span className="font-bold uppercase tracking-wider">{mkt.ai_bias}</span>
          </div>
        )}
        {mkt.volume > 0 && (
          <span className="text-[9px] t-text-m ml-auto">
            Vol: <span className="font-bold t-text">{fmtVol(mkt.volume)}</span>
          </span>
        )}
      </div>

      {/* AI Interpretation */}
      {mkt.ai_interpretation && (
        <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/15 mb-3">
          <Brain size={11} className="text-violet-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-violet-300/90 leading-relaxed italic">{mkt.ai_interpretation}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] t-text-m">
          {mkt.primary_category && (
            <span className="font-bold uppercase tracking-wider">{mkt.primary_category}</span>
          )}
          {mkt.end_date && <span> · Closes {fmtDate(mkt.end_date)}</span>}
        </span>
        {mkt.url && (
          <a href={mkt.url} target="_blank" rel="noopener noreferrer"
            className="text-[9px] text-emerald-400/60 hover:text-emerald-400 transition-colors flex items-center gap-1">
            <ExternalLink size={9} /> View
          </a>
        )}
      </div>
    </div>
  );
};

/* ─── Ticker Heatmap ──────────────────────────────────────────────────────── */
const TickerHeatmap = ({ tickers }) => {
  if (!tickers || tickers.length === 0) return null;
  const maxCount = Math.max(...tickers.map(t => t.count));
  return (
    <div className="flex flex-wrap gap-1.5">
      {tickers.map(({ ticker, count }) => {
        const intensity = Math.max(0.2, count / maxCount);
        return (
          <div key={ticker}
            className="px-2 py-1 rounded border border-emerald-500/20 text-center"
            style={{ backgroundColor: `rgba(16, 185, 129, ${intensity * 0.2})` }}>
            <div className="text-[10px] font-black text-emerald-400">{ticker}</div>
            <div className="text-[8px] t-text-m">{count} mkt{count !== 1 ? 's' : ''}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Main ─────────────────────────────────────────────────────────────── */
const NlpPolymarket = () => {
  const [signals, setSignals] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('signals');
  const [activeCat, setActiveCat] = useState('all');

  const normList = (d) => Array.isArray(d) ? d : d?.signals ?? d?.markets ?? d?.items ?? d?.results ?? [];

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [sigRes, mktRes, sumRes] = await Promise.all([
        axios.get('/api/nlp/polymarket/signals').catch(() => ({ data: [] })),
        axios.get(`/api/nlp/polymarket/markets?category=${activeCat}&limit=80`).catch(() => ({ data: [] })),
        axios.get('/api/nlp/polymarket/summary').catch(() => ({ data: null })),
      ]);
      setSignals(normList(sigRes.data));
      setMarkets(normList(mktRes.data));
      setSummary(sumRes.data && sumRes.data.total_markets ? sumRes.data : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCat]);

  useEffect(() => { load(); }, [load]);

  // Reload markets when category changes
  const switchCategory = async (cat) => {
    setActiveCat(cat);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 t-text-m">
      <Loader2 size={20} className="animate-spin text-emerald-500" />
      <span className="text-[13px] font-bold uppercase tracking-widest">Loading Polymarket Intelligence...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 gap-3 text-red-400">
      <AlertCircle size={20} />
      <span className="text-[13px] font-bold">Backend unreachable — start NLP server on port 8002</span>
    </div>
  );

  const bullishCount = signals.filter(s => s.crowd_signal === 'bullish').length;
  const bearishCount = signals.filter(s => s.crowd_signal === 'bearish').length;
  const highImpact = signals.filter(s => s.ai_impact === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black t-text uppercase tracking-widest flex items-center gap-3">
            <Activity size={24} className="text-emerald-500" />
            Polymarket Sentiment
          </h1>
          <p className="text-[11px] t-text-m mt-1">
            Prediction market probabilities + AI-powered sentiment interpretation · Economies · Crypto · Politics · Business
          </p>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="t-card rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-emerald-400/70">Total Markets</div>
          <div className="text-2xl font-black font-mono text-emerald-400">{summary?.total_markets ?? signals.length}</div>
        </div>
        <div className="t-card rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-emerald-400/70">Bullish</div>
          <div className="text-2xl font-black font-mono text-emerald-400">{bullishCount}</div>
          {summary?.bullish_pct != null && <div className="text-[9px] t-text-m">{summary.bullish_pct}% of markets</div>}
        </div>
        <div className="t-card rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-red-400/70">Bearish</div>
          <div className="text-2xl font-black font-mono text-red-400">{bearishCount}</div>
          {summary?.bearish_pct != null && <div className="text-[9px] t-text-m">{summary.bearish_pct}% of markets</div>}
        </div>
        <div className="t-card rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 text-amber-400/70">High Impact</div>
          <div className="text-2xl font-black font-mono text-amber-400">{highImpact}</div>
        </div>
        <div className={`t-card rounded-xl border p-4 ${
          (summary?.overall_bias ?? 'neutral') === 'bullish' ? 'border-emerald-500/20 bg-emerald-500/5' :
          (summary?.overall_bias ?? 'neutral') === 'bearish' ? 'border-red-500/20 bg-red-500/5' :
          'border-slate-500/20 bg-slate-500/5'
        }`}>
          <div className="text-[9px] font-black uppercase tracking-widest mb-1 t-text-m">Overall Bias</div>
          <div className={`text-lg font-black uppercase tracking-widest ${
            (summary?.overall_bias ?? 'neutral') === 'bullish' ? 'text-emerald-400' :
            (summary?.overall_bias ?? 'neutral') === 'bearish' ? 'text-red-400' : 'text-amber-400'
          }`}>
            {summary?.overall_bias ?? 'neutral'}
          </div>
          {summary?.avg_sentiment != null && (
            <div className={`text-[10px] font-mono font-bold ${sentColor(summary.avg_sentiment)}`}>
              {summary.avg_sentiment > 0 ? '+' : ''}{summary.avg_sentiment.toFixed(3)} avg
            </div>
          )}
        </div>
      </div>

      {/* Affected Tickers Heatmap */}
      {summary?.top_tickers?.length > 0 && (
        <div className="t-card rounded-xl border t-border-s p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-emerald-400" />
            <span className="text-[11px] font-black t-text uppercase tracking-widest">Most Affected Tickers</span>
            <span className="text-[9px] t-text-m">— by number of prediction markets mentioning them</span>
          </div>
          <TickerHeatmap tickers={summary.top_tickers} />
        </div>
      )}

      {/* Tab toggle + Category filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('signals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
              ${activeTab === 'signals' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 't-text-m border-transparent hover:bg-white/5'}`}
          >
            <Target size={13} /> Top Signals ({signals.length})
          </button>
          <button
            onClick={() => setActiveTab('markets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
              ${activeTab === 'markets' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 't-text-m border-transparent hover:bg-white/5'}`}
          >
            <BarChart3 size={13} /> All Markets ({markets.length})
          </button>
        </div>

        {activeTab === 'markets' && (
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="t-text-m" />
            {CATEGORIES.map(c => (
              <button key={c.key}
                onClick={() => switchCategory(c.key)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border
                  ${activeCat === c.key ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 't-text-m border-transparent hover:bg-white/5'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {activeTab === 'signals' ? (
        signals.length === 0 ? (
          <div className="t-card rounded-2xl border t-border-s p-12 text-center t-text-m text-[12px]">
            No signals available — the Polymarket API may be temporarily unavailable. Try refreshing.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {signals.map((mkt, i) => <SignalCard key={mkt.id || i} mkt={mkt} />)}
          </div>
        )
      ) : (
        markets.length === 0 ? (
          <div className="t-card rounded-2xl border t-border-s p-12 text-center t-text-m text-[12px]">
            No markets found for this category. Try refreshing or selecting a different category.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {markets.map((mkt, i) => <SignalCard key={mkt.id || i} mkt={mkt} />)}
          </div>
        )
      )}
    </div>
  );
};

export default NlpPolymarket;

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, Newspaper, BarChart3, Brain, ExternalLink, Filter } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const sentColor = (score) => {
  if (score == null) return 'text-slate-500';
  if (score > 0.2) return 'text-emerald-400';
  if (score < -0.2) return 'text-red-400';
  return 'text-slate-400';
};
const sentLabel = (score) => {
  if (score == null) return '—';
  if (score > 0.2) return 'Bullish';
  if (score < -0.2) return 'Bearish';
  return 'Neutral';
};
const sentIcon = (score) => {
  if (score > 0.2) return <TrendingUp size={12} />;
  if (score < -0.2) return <TrendingDown size={12} />;
  return <Minus size={12} />;
};
const fmtDate = (ts) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
};

/* ─── StatCard ──────────────────────────────────────────────────────────── */
const StatCard = ({ label, value, sub, accent = 'emerald' }) => {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    red:     'border-red-500/20     bg-red-500/5     text-red-400',
    amber:   'border-amber-500/20   bg-amber-500/5   text-amber-400',
    slate:   'border-slate-500/20   bg-slate-500/5   text-slate-400',
  };
  return (
    <div className={`t-card rounded-xl border p-5 ${colors[accent]}`}>
      <div className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">{label}</div>
      <div className="text-2xl font-black font-mono">{value ?? '—'}</div>
      {sub && <div className="text-[9px] mt-1 opacity-60 font-bold">{sub}</div>}
    </div>
  );
};

/* ─── HeadlineRow ──────────────────────────────────────────────────────── */
const HeadlineRow = ({ item }) => {
  const sentMap = { positive: 0.5, negative: -0.5, neutral: 0 };
  const sentScore = item.composite_score ?? item.finbert_score ?? sentMap[item.sentiment] ?? null;
  const impactScore = item.impact_score ?? null;
  const impactLevel = item.impact_level ?? null;
  const impactColor = impactLevel === 'HIGH' ? 'text-red-400' : impactLevel === 'MEDIUM' ? 'text-amber-400' : 'text-slate-400';
  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b t-border-s hover:bg-white/[0.02] transition-colors last:border-b-0">
      <div className={`mt-0.5 flex-shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${sentColor(sentScore)}`}>
        {sentScore != null && sentIcon(sentScore)}
        {sentLabel(sentScore)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] t-text font-semibold leading-snug line-clamp-2">{item.title ?? item.headline ?? item.text ?? '(no title)'}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {item.ticker && <span className="text-[9px] font-black text-emerald-400/80 uppercase">{item.ticker}</span>}
          {item.sources && item.sources.length > 0 ? (
            item.sources.map((src, idx) => (
              src.url ? (
                <a key={idx} href={src.url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-0.5 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline transition-colors">
                  {src.name || 'Source'}<ExternalLink size={8} />
                </a>
              ) : (
                <span key={idx} className="text-[9px] t-text-m">{src.name || 'Source'}</span>
              )
            ))
          ) : item.source ? (
            <span className="text-[9px] t-text-m">{item.source}</span>
          ) : null}
          <span className="text-[9px] t-text-m">{fmtDate(item.created_at ?? item.published_at ?? item.timestamp ?? item.date)}</span>
          {item.article_count > 1 && (
            <span className="text-[9px] font-bold text-cyan-400/80">{item.article_count} sources</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {impactScore != null && (
          <div className={`text-[11px] font-black font-mono ${impactColor}`}>
            {(impactScore * 100).toFixed(0)}%
          </div>
        )}
        {impactLevel && (
          <div className={`text-[8px] font-black uppercase tracking-widest ${impactColor}`}>
            {impactLevel}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main ─────────────────────────────────────────────────────────────── */
const NlpCommandCenter = () => {
  const [summary, setSummary] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [impactFilter, setImpactFilter] = useState('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [sumRes, hdlRes] = await Promise.all([
        axios.get('/api/nlp/summary').catch(() => ({ data: null })),
        axios.get('/api/nlp/headlines').catch(() => ({ data: [] })),
      ]);
      setSummary(sumRes.data);
      const hdl = hdlRes.data;
      setHeadlines(Array.isArray(hdl) ? hdl : (hdl?.headlines ?? hdl?.items ?? []));
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
      <span className="text-[13px] font-bold uppercase tracking-widest">Loading NLP Engine...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 gap-3 text-red-400">
      <AlertCircle size={20} />
      <span className="text-[13px] font-bold">Backend unreachable — start the NLP server on port 8002</span>
    </div>
  );

  /* summary stats — /api/summary returns an array of per-ticker records */
  const tickers = Array.isArray(summary) ? summary : [];
  const activeTickers = tickers.filter(t => (t.total_mentions ?? 0) > 0);
  const totalNews = activeTickers.reduce((s, t) => s + (t.total_mentions ?? 0), 0) || headlines.length || '—';
  const avgSent = activeTickers.length > 0
    ? activeTickers.reduce((s, t) => s + (t.net_sentiment ?? 0), 0) / activeTickers.length
    : null;
  const bullPct = activeTickers.length > 0
    ? activeTickers.reduce((s, t) => s + (t.pct_bullish ?? 0), 0) / activeTickers.length
    : null;
  const bearPct = activeTickers.length > 0
    ? activeTickers.reduce((s, t) => s + (t.pct_bearish ?? 0), 0) / activeTickers.length
    : null;
  const tickerCount = activeTickers.length || null;

  const bullAccent = bullPct != null ? (bullPct > 50 ? 'emerald' : 'slate') : 'slate';
  const avgAccent  = avgSent != null ? (avgSent > 0.1 ? 'emerald' : avgSent < -0.1 ? 'red' : 'slate') : 'slate';

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="flex items-center justify-between pb-8 t-border border-b transition-colors"
      >
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center">
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black t-text uppercase transition-colors">
              Sentiment <span className="text-emerald-400">Hub</span>
            </h2>
            <p className="text-[11px] font-bold t-text-m uppercase tracking-[0.3em] mt-1 transition-colors">
              FinBERT + GPT-4o News Intelligence Platform
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border t-border-s t-elevated t-text-m hover:t-text hover:border-emerald-500/50 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Headlines" value={totalNews} accent="emerald" />
        <StatCard label="Avg Sentiment" value={avgSent != null ? (avgSent > 0 ? '+' : '') + avgSent.toFixed(3) : '—'} accent={avgAccent} />
        <StatCard label="Bullish" value={bullPct != null ? bullPct.toFixed(1) + '%' : '—'} sub={bearPct != null ? `Bearish: ${bearPct.toFixed(1)}%` : undefined} accent={bullAccent} />
        <StatCard label="Tickers Covered" value={tickerCount ?? '—'} accent="slate" />
      </div>

      {/* Headlines feed */}
      <div className="t-card rounded-2xl border t-border-s overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b t-border-s flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Newspaper size={15} className="text-emerald-400" />
            <span className="text-[12px] font-black t-text uppercase tracking-widest">Live Headlines Feed</span>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={12} className="t-text-m" />
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(level => (
              <button
                key={level}
                onClick={() => setImpactFilter(level)}
                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border
                  ${impactFilter === level
                    ? level === 'HIGH' ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : level === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : level === 'LOW' ? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 't-text-m border-transparent hover:bg-white/5'}`}
              >
                {level}
              </button>
            ))}
            <span className="text-[10px] t-text-m font-bold ml-2">
              {(impactFilter === 'ALL' ? headlines : headlines.filter(h => (h.impact_level ?? 'LOW') === impactFilter)).length} items
            </span>
          </div>
        </div>
        {headlines.length === 0 ? (
          <div className="flex items-center justify-center h-32 t-text-m text-[12px]">No headlines loaded</div>
        ) : (
          <div className="divide-y t-border-s max-h-[520px] overflow-y-auto custom-scrollbar">
            {headlines
              .filter(h => impactFilter === 'ALL' || (h.impact_level ?? 'LOW') === impactFilter)
              .slice(0, 100)
              .map((h, i) => <HeadlineRow key={i} item={h} />)}
          </div>
        )}
      </div>

      {/* Sentiment breakdown by ticker */}
      {activeTickers.length > 0 && (
        <div className="t-card rounded-2xl border t-border-s overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b t-border-s">
            <BarChart3 size={15} className="text-emerald-400" />
            <span className="text-[12px] font-black t-text uppercase tracking-widest">Sentiment by Ticker</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-5">
            {activeTickers.slice(0, 24).map((t) => {
              const s = t.net_sentiment ?? null;
              const mentions = t.total_mentions ?? 0;
              return (
                <div key={t.ticker} className="t-card border t-border-s rounded-xl p-3 text-center">
                  <div className="text-[13px] font-black font-mono t-text">{t.ticker}</div>
                  <div className={`text-[11px] font-black mt-1 flex items-center justify-center gap-1 ${sentColor(s)}`}>
                    {s != null && sentIcon(s)}
                    {s != null ? (s > 0 ? '+' : '') + s.toFixed(3) : '—'}
                  </div>
                  <div className={`text-[9px] font-bold mt-0.5 ${sentColor(s)}`}>{sentLabel(s)}</div>
                  <div className="text-[8px] t-text-m mt-1">{mentions} mentions</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NlpCommandCenter;

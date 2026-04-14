import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Search, Filter, TrendingUp, TrendingDown,
  Minus, BarChart3, ChevronDown, ChevronUp, Newspaper, Hash, Activity,
  ArrowUpRight, ArrowDownRight, ExternalLink, Flame, Shield, X
} from 'lucide-react';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const sentColor = (s) => {
  if (s == null) return 'text-slate-500';
  if (s > 0.2) return 'text-emerald-400';
  if (s < -0.2) return 'text-red-400';
  return 'text-slate-400';
};
const sentBg = (s) => {
  if (s == null) return 'bg-slate-500/10 border-slate-500/20';
  if (s > 0.2) return 'bg-emerald-500/10 border-emerald-500/20';
  if (s < -0.2) return 'bg-red-500/10 border-red-500/20';
  return 'bg-slate-500/10 border-slate-500/20';
};
const sentLabel = (s) => {
  if (s == null) return 'N/A';
  if (s > 0.2) return 'Bullish';
  if (s < -0.2) return 'Bearish';
  return 'Neutral';
};
const sentIcon = (s, size = 14) => {
  if (s > 0.2) return <TrendingUp size={size} />;
  if (s < -0.2) return <TrendingDown size={size} />;
  return <Minus size={size} />;
};
const fmtPct = (v) => v != null ? v.toFixed(1) + '%' : '—';
const fmtScore = (v) => v != null ? (v > 0 ? '+' : '') + v.toFixed(3) : '—';
const fmtDate = (ts) => {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
};

const ASSET_CLASSES = ['All', 'Stock', 'Forex', 'Commodity', 'Bond'];
const SORT_OPTIONS = [
  { key: 'mentions', label: 'Mentions', desc: true },
  { key: 'sentiment', label: 'Net Sentiment', desc: true },
  { key: 'bullish', label: 'Bullish %', desc: true },
  { key: 'bearish', label: 'Bearish %', desc: true },
  { key: 'alpha', label: 'A-Z', desc: false },
];

/* ─── SentimentBar: visual bullish/neutral/bearish proportion ─────────────── */
const SentimentBar = ({ bullish, neutral, bearish }) => {
  const total = (bullish || 0) + (neutral || 0) + (bearish || 0);
  if (total === 0) return <div className="h-2 rounded-full bg-slate-700/50 w-full" />;
  const bw = ((bullish || 0) / total) * 100;
  const nw = ((neutral || 0) / total) * 100;
  const rw = ((bearish || 0) / total) * 100;
  return (
    <div className="h-2 rounded-full overflow-hidden flex w-full bg-slate-700/30">
      {bw > 0 && <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${bw}%` }} />}
      {nw > 0 && <div className="bg-slate-500 transition-all duration-500" style={{ width: `${nw}%` }} />}
      {rw > 0 && <div className="bg-red-500 transition-all duration-500" style={{ width: `${rw}%` }} />}
    </div>
  );
};

/* ─── MiniRing: small ring chart for sentiment split ─────────────────────── */
const MiniRing = ({ bullish, bearish, neutral, size = 48 }) => {
  const total = (bullish || 0) + (bearish || 0) + (neutral || 0);
  if (total === 0) return (
    <svg width={size} height={size} viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-700/40" />
    </svg>
  );
  const r = 14, C = 2 * Math.PI * r;
  const bPct = (bullish || 0) / total, nPct = (neutral || 0) / total, rPct = (bearish || 0) / total;
  const bLen = bPct * C, nLen = nPct * C, rLen = rPct * C;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="transform -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#334155" strokeWidth="3" opacity="0.3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="#10b981" strokeWidth="3"
        strokeDasharray={`${bLen} ${C - bLen}`} strokeDashoffset="0" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="#64748b" strokeWidth="3"
        strokeDasharray={`${nLen} ${C - nLen}`} strokeDashoffset={`${-bLen}`} />
      <circle cx="18" cy="18" r={r} fill="none" stroke="#ef4444" strokeWidth="3"
        strokeDasharray={`${rLen} ${C - rLen}`} strokeDashoffset={`${-(bLen + nLen)}`} />
    </svg>
  );
};

/* ─── NewsArticle: single article in expanded view ───────────────────────── */
const NewsArticle = ({ article, rank }) => {
  const scoreSent = article.score_positive > article.score_negative ? 'positive' : 'negative';
  const bestScore = Math.max(article.score_positive || 0, article.score_negative || 0, article.score_neutral || 0);
  const barColor = scoreSent === 'positive' ? 'bg-emerald-500' : 'bg-red-500';
  const textColor = scoreSent === 'positive' ? 'text-emerald-400' : 'text-red-400';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="flex gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition-colors"
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
        rank === 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
      }`}>
        {rank + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] t-text font-semibold leading-snug line-clamp-2">{article.text || '(no text)'}</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wide ${textColor}`}>
            {article.sentiment || scoreSent}
          </span>
          {article.source && article.source !== 'news' && (
            <span className="text-[9px] t-text-m font-bold">{article.source}</span>
          )}
          {article.date && <span className="text-[9px] t-text-m">{fmtDate(article.date)}</span>}
        </div>
        {/* Score bars */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-emerald-400/70 w-6">BUL</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-700/30 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(article.score_positive || 0) * 100}%` }} />
            </div>
            <span className="text-[9px] font-mono font-bold text-emerald-400/80 w-10 text-right">{((article.score_positive || 0) * 100).toFixed(0)}%</span>
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-red-400/70 w-6">BER</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-700/30 overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(article.score_negative || 0) * 100}%` }} />
            </div>
            <span className="text-[9px] font-mono font-bold text-red-400/80 w-10 text-right">{((article.score_negative || 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
      <div className={`flex-shrink-0 text-[13px] font-black font-mono ${textColor}`}>
        {(bestScore * 100).toFixed(0)}%
      </div>
    </motion.div>
  );
};

/* ─── TickerCard: main per-ticker card ───────────────────────────────────── */
const TickerCard = ({ ticker, onExpand, isExpanded, articles, loadingArticles }) => {
  const s = ticker.net_sentiment ?? null;
  const mentions = ticker.total_mentions ?? 0;
  const bullish = ticker.pct_bullish ?? 0;
  const bearish = ticker.pct_bearish ?? 0;
  const neutral = ticker.pct_neutral ?? 0;
  const strength = ticker.signal_strength ?? 0;
  const assetType = ticker.asset_class || ticker.asset_type || 'Stock';

  const assetColors = {
    Stock: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Forex: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    Commodity: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Bond: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={`t-card rounded-2xl border t-border-s overflow-hidden transition-all duration-300 ${
        isExpanded ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''
      }`}
    >
      {/* Card header — always visible */}
      <button
        onClick={() => onExpand(ticker.ticker)}
        className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${sentBg(s)}`}>
              <span className={`font-black text-[11px] ${sentColor(s)}`}>{sentIcon(s, 18)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-black font-mono t-text">{ticker.ticker}</span>
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${assetColors[assetType] || assetColors.Stock}`}>
                  {assetType}
                </span>
              </div>
              <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${sentColor(s)}`}>
                {sentLabel(s)}
                <span className="font-mono">{fmtScore(s)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] t-text-m">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Mentions</div>
            <div className="text-[14px] font-black font-mono t-text flex items-center justify-center gap-1">
              <Hash size={10} className="t-text-m" />{mentions}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Bullish</div>
            <div className="text-[14px] font-black font-mono text-emerald-400 flex items-center justify-center gap-1">
              <ArrowUpRight size={10} />{fmtPct(bullish)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Bearish</div>
            <div className="text-[14px] font-black font-mono text-red-400 flex items-center justify-center gap-1">
              <ArrowDownRight size={10} />{fmtPct(bearish)}
            </div>
          </div>
        </div>

        {/* Sentiment bar */}
        <SentimentBar bullish={bullish} neutral={neutral} bearish={bearish} />
        <div className="flex justify-between mt-1">
          <span className="text-[8px] font-bold text-emerald-400/60">{fmtPct(bullish)}</span>
          <span className="text-[8px] font-bold text-slate-400/60">{fmtPct(neutral)}</span>
          <span className="text-[8px] font-bold text-red-400/60">{fmtPct(bearish)}</span>
        </div>

        {/* Signal strength */}
        {strength > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <Activity size={10} className="t-text-m" />
            <span className="text-[8px] font-bold t-text-m uppercase tracking-widest">Signal</span>
            <div className="flex-1 h-1 rounded-full bg-slate-700/30 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                strength > 0.6 ? 'bg-emerald-500' : strength > 0.3 ? 'bg-amber-500' : 'bg-slate-500'
              }`} style={{ width: `${Math.min(strength * 100, 100)}%` }} />
            </div>
            <span className="text-[9px] font-mono font-bold t-text-m">{(strength * 100).toFixed(0)}%</span>
          </div>
        )}
      </button>

      {/* Expanded: top articles */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t t-border-s overflow-hidden"
          >
            <div className="px-4 py-3 flex items-center gap-2 border-b t-border-s bg-white/[0.01]">
              <Flame size={12} className="text-amber-400" />
              <span className="text-[10px] font-black t-text uppercase tracking-widest">Top FinBERT-Scored News</span>
            </div>
            {loadingArticles ? (
              <div className="flex items-center justify-center py-8 gap-2 t-text-m">
                <Loader2 size={14} className="animate-spin text-emerald-500" />
                <span className="text-[11px] font-bold">Loading articles...</span>
              </div>
            ) : articles && articles.length > 0 ? (
              <div className="divide-y t-border-s">
                {articles.map((a, i) => <NewsArticle key={i} article={a} rank={i} />)}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 t-text-m text-[11px]">
                No articles found for this ticker
              </div>
            )}

            {/* Detailed score breakdown */}
            {ticker.avg_positive != null && (
              <div className="px-4 py-3 border-t t-border-s bg-white/[0.01]">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={12} className="t-text-m" />
                  <span className="text-[10px] font-black t-text uppercase tracking-widest">Avg FinBERT Scores</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg p-2 bg-emerald-500/5 border border-emerald-500/15 text-center">
                    <div className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">Positive</div>
                    <div className="text-[13px] font-black font-mono text-emerald-400">{((ticker.avg_positive || 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg p-2 bg-slate-500/5 border border-slate-500/15 text-center">
                    <div className="text-[8px] font-bold text-slate-400/70 uppercase tracking-widest">Neutral</div>
                    <div className="text-[13px] font-black font-mono text-slate-400">{((ticker.avg_neutral || 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg p-2 bg-red-500/5 border border-red-500/15 text-center">
                    <div className="text-[8px] font-bold text-red-400/70 uppercase tracking-widest">Negative</div>
                    <div className="text-[13px] font-black font-mono text-red-400">{((ticker.avg_negative || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ─── MarketMood: top-level aggregate mood indicator ─────────────────────── */
const MarketMood = ({ tickers }) => {
  const active = tickers.filter(t => (t.total_mentions ?? 0) > 0);
  if (active.length === 0) return null;

  const totalMentions = active.reduce((s, t) => s + (t.total_mentions ?? 0), 0);
  const avgSent = active.reduce((s, t) => s + (t.net_sentiment ?? 0), 0) / active.length;
  const avgBull = active.reduce((s, t) => s + (t.pct_bullish ?? 0), 0) / active.length;
  const avgBear = active.reduce((s, t) => s + (t.pct_bearish ?? 0), 0) / active.length;
  const avgNeut = 100 - avgBull - avgBear;

  const mostBullish = [...active].sort((a, b) => (b.net_sentiment ?? 0) - (a.net_sentiment ?? 0))[0];
  const mostBearish = [...active].sort((a, b) => (a.net_sentiment ?? 0) - (b.net_sentiment ?? 0))[0];
  const mostMentioned = [...active].sort((a, b) => (b.total_mentions ?? 0) - (a.total_mentions ?? 0))[0];

  return (
    <div className="t-card rounded-2xl border t-border-s p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${sentBg(avgSent)}`}>
          <span className={sentColor(avgSent)}>{sentIcon(avgSent, 20)}</span>
        </div>
        <div>
          <div className="text-[10px] font-black t-text-m uppercase tracking-widest">Market Mood</div>
          <div className={`text-[16px] font-black ${sentColor(avgSent)}`}>
            {sentLabel(avgSent)} <span className="font-mono text-[13px]">{fmtScore(avgSent)}</span>
          </div>
        </div>
        <div className="ml-auto">
          <MiniRing bullish={avgBull} bearish={avgBear} neutral={avgNeut > 0 ? avgNeut : 0} size={52} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/15">
          <div className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">Total Mentions</div>
          <div className="text-[18px] font-black font-mono text-emerald-400">{totalMentions.toLocaleString()}</div>
          <div className="text-[9px] font-bold t-text-m">{active.length} tickers active</div>
        </div>
        <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/15">
          <div className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">Most Bullish</div>
          <div className="text-[18px] font-black font-mono text-emerald-400">{mostBullish?.ticker}</div>
          <div className="text-[9px] font-bold text-emerald-400/60">{fmtScore(mostBullish?.net_sentiment)}</div>
        </div>
        <div className="rounded-xl p-3 bg-red-500/5 border border-red-500/15">
          <div className="text-[8px] font-bold text-red-400/70 uppercase tracking-widest">Most Bearish</div>
          <div className="text-[18px] font-black font-mono text-red-400">{mostBearish?.ticker}</div>
          <div className="text-[9px] font-bold text-red-400/60">{fmtScore(mostBearish?.net_sentiment)}</div>
        </div>
        <div className="rounded-xl p-3 bg-amber-500/5 border border-amber-500/15">
          <div className="text-[8px] font-bold text-amber-400/70 uppercase tracking-widest">Most Discussed</div>
          <div className="text-[18px] font-black font-mono text-amber-400">{mostMentioned?.ticker}</div>
          <div className="text-[9px] font-bold text-amber-400/60">{mostMentioned?.total_mentions} mentions</div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── Main Page ────────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */
const NlpTickerSentiment = () => {
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & sort
  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('All');
  const [sortBy, setSortBy] = useState('mentions');
  const [hideEmpty, setHideEmpty] = useState(true);

  // Expanded ticker & its articles
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [articles, setArticles] = useState({});
  const [loadingArticles, setLoadingArticles] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/nlp/summary');
      setTickers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load articles when expanding a ticker
  const handleExpand = useCallback(async (ticker) => {
    if (expandedTicker === ticker) {
      setExpandedTicker(null);
      return;
    }
    setExpandedTicker(ticker);
    if (articles[ticker]) return; // already loaded

    setLoadingArticles(prev => ({ ...prev, [ticker]: true }));
    try {
      const res = await axios.get(`/api/nlp/top_tweets/${encodeURIComponent(ticker)}`);
      setArticles(prev => ({ ...prev, [ticker]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      setArticles(prev => ({ ...prev, [ticker]: [] }));
    } finally {
      setLoadingArticles(prev => ({ ...prev, [ticker]: false }));
    }
  }, [expandedTicker, articles]);

  // Filtered & sorted tickers
  const filtered = useMemo(() => {
    let list = [...tickers];

    // Hide zero-mention tickers
    if (hideEmpty) list = list.filter(t => (t.total_mentions ?? 0) > 0);

    // Asset class filter
    if (assetFilter !== 'All') list = list.filter(t => (t.asset_class || t.asset_type || 'Stock') === assetFilter);

    // Search
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(t => t.ticker.toUpperCase().includes(q));
    }

    // Sort
    const opt = SORT_OPTIONS.find(o => o.key === sortBy) || SORT_OPTIONS[0];
    list.sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case 'mentions': va = a.total_mentions ?? 0; vb = b.total_mentions ?? 0; break;
        case 'sentiment': va = a.net_sentiment ?? 0; vb = b.net_sentiment ?? 0; break;
        case 'bullish': va = a.pct_bullish ?? 0; vb = b.pct_bullish ?? 0; break;
        case 'bearish': va = a.pct_bearish ?? 0; vb = b.pct_bearish ?? 0; break;
        case 'alpha': return a.ticker.localeCompare(b.ticker);
        default: va = a.total_mentions ?? 0; vb = b.total_mentions ?? 0;
      }
      return opt.desc ? vb - va : va - vb;
    });

    return list;
  }, [tickers, search, assetFilter, sortBy, hideEmpty]);

  /* ─── Render states ──────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 t-text-m">
      <Loader2 size={20} className="animate-spin text-emerald-500" />
      <span className="text-[13px] font-bold uppercase tracking-widest">Loading Ticker Sentiment...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 gap-3 text-red-400">
      <AlertCircle size={20} />
      <span className="text-[13px] font-bold">Backend unreachable — start the NLP server on port 8002</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="flex items-center justify-between pb-6 t-border border-b transition-colors"
      >
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center">
            <BarChart3 size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black t-text uppercase transition-colors">
              Sentiment <span className="text-emerald-400">by Ticker</span>
            </h2>
            <p className="text-[11px] font-bold t-text-m uppercase tracking-[0.3em] mt-1 transition-colors">
              Per-Asset FinBERT Sentiment Breakdown
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

      {/* ── Market Mood ────────────────────────────────────────────────────── */}
      <MarketMood tickers={tickers} />

      {/* ── Filters Bar ────────────────────────────────────────────────────── */}
      <div className="t-card rounded-2xl border t-border-s p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 t-text-m" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tickers..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border t-border-s bg-transparent t-text text-[12px] font-semibold placeholder:t-text-m focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 t-text-m hover:t-text">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Asset class pills */}
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="t-text-m mr-1" />
            {ASSET_CLASSES.map(cls => (
              <button
                key={cls}
                onClick={() => setAssetFilter(cls)}
                className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                  assetFilter === cls
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 't-text-m border-transparent hover:bg-white/5'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black t-text-m uppercase tracking-widest mr-1">Sort</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`px-2 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                  sortBy === opt.key
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 't-text-m border-transparent hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Hide empty toggle */}
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border ${
              hideEmpty
                ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                : 't-text-m border-transparent hover:bg-white/5'
            }`}
          >
            {hideEmpty ? 'Active Only' : 'Show All'}
          </button>
        </div>

        <div className="mt-2 text-[10px] t-text-m font-bold">
          Showing {filtered.length} of {tickers.length} tickers
        </div>
      </div>

      {/* ── Ticker Grid ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="t-card rounded-2xl border t-border-s flex items-center justify-center h-40 t-text-m text-[12px] font-bold">
          No tickers match your filters
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map(t => (
              <TickerCard
                key={t.ticker}
                ticker={t}
                isExpanded={expandedTicker === t.ticker}
                onExpand={handleExpand}
                articles={articles[t.ticker] || []}
                loadingArticles={loadingArticles[t.ticker] || false}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default NlpTickerSentiment;

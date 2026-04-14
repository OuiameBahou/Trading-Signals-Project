/**
 * SentimentCorrelation.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Macro view page: "Global Leaderboard & Scatter Plot Heatmap"
 *
 * Visualises the relationship between News Sentiment and Asset Prices across
 * the entire tracked universe.  Two main UI blocks:
 *   1. Leaderboard cards  – Top 5 / Bottom 5 by Information Coefficient (IC)
 *   2. Scatter Plot Heatmap – Net Sentiment (X) vs Daily Return proxy (Y),
 *      dots coloured by quadrant.
 *
 * Data pipeline:
 *   Step A  → GET /api/nlp/tickers          (list of tracked assets)
 *   Step B  → GET /api/nlp/summary          (net_sentiment per ticker, batch)
 *   Step C  → GET /api/nlp/ic/{ticker}      (IC score per ticker, parallel)
 *
 * NOTE: The NLP backend's /api/ic/{ticker} endpoint returns:
 *   { mean_ic, icir, ic_ts: [{date, value}], n_obs, ticker }
 *
 * For the scatter-plot Y-axis ("Daily Return"), we use the latest value in
 * the rolling IC time series (ic_ts) as a proxy for recent sentiment-return
 * correlation.  If your backend gains a dedicated daily-return field, swap
 * the extraction in the `buildScatterData` helper below.
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Activity,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ZAxis,
} from 'recharts';


// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT     = '#22c55e';       // NLP section accent (emerald)
const GREEN      = '#22c55e';       // Bullish / top-right quadrant
const RED        = '#ef4444';       // Bearish / bottom-left quadrant
const YELLOW     = '#eab308';       // Divergence quadrants
const GRID_COLOR = 'rgba(148,163,184,0.08)';
const LEADERBOARD_SIZE = 5;         // Top N / Bottom N


// ═══════════════════════════════════════════════════════════════════════════
// Helper: pick quadrant colour based on (x, y)
// ═══════════════════════════════════════════════════════════════════════════

const quadrantColor = (netSentiment, dailyReturn) => {
  if (netSentiment >= 0 && dailyReturn >= 0) return GREEN;   // ↗ Top-Right
  if (netSentiment <  0 && dailyReturn <  0) return RED;     // ↙ Bottom-Left
  return YELLOW;                                              // ↘↖ Divergence
};


// ═══════════════════════════════════════════════════════════════════════════
// Sub-component: Custom Scatter Tooltip
// ═══════════════════════════════════════════════════════════════════════════

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="t-elevated t-border border rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md"
         style={{ minWidth: 180 }}>
      <div className="flex items-center gap-2 mb-2">
        <Activity size={14} className="text-emerald-400" />
        <span className="text-sm font-black t-text tracking-wide">{d.ticker}</span>
      </div>
      <div className="space-y-1 text-[11px]">
        <Row label="IC Score"       value={fmt(d.icScore, 4)} />
        <Row label="Net Sentiment"  value={fmt(d.netSentiment, 4)} />
        <Row label="Daily Return"   value={`${fmt(d.dailyReturn, 4)}%`} />
        {d.reliability != null && <Row label="Reliability" value={`${(d.reliability * 100).toFixed(0)}%`} />}
        {d.nObs != null && <Row label="Observations" value={d.nObs} />}
        {d.assetType && <Row label="Asset Type" value={d.assetType} />}
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <span className="t-text-m">{label}</span>
    <span className="t-text font-bold">{value}</span>
  </div>
);

const fmt = (v, decimals = 2) =>
  v != null && !isNaN(v) ? Number(v).toFixed(decimals) : '—';


// ═══════════════════════════════════════════════════════════════════════════
// Sub-component: Skeleton loader rows (matches dark-mode card style)
// ═══════════════════════════════════════════════════════════════════════════

const SkeletonCard = ({ rows = 5 }) => (
  <div className="t-card t-border border rounded-xl p-5 flex-1 min-w-[280px]">
    <div className="h-4 w-40 rounded bg-white/5 mb-5 animate-pulse" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center justify-between py-2.5">
        <div className="h-3 w-20 rounded bg-white/5 animate-pulse" />
        <div className="h-3 w-14 rounded bg-white/5 animate-pulse" />
      </div>
    ))}
  </div>
);


// ═══════════════════════════════════════════════════════════════════════════
// Sub-component: Empty State
// ═══════════════════════════════════════════════════════════════════════════

const EmptyState = ({ message = 'No active tickers available for analysis.' }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-32 gap-4"
  >
    <BarChart3 size={48} className="t-text-m opacity-40" />
    <p className="text-sm t-text-m">{message}</p>
  </motion.div>
);


// ═══════════════════════════════════════════════════════════════════════════
// Sub-component: Error State with Retry
// ═══════════════════════════════════════════════════════════════════════════

const ErrorState = ({ message, onRetry }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-32 gap-4"
  >
    <AlertCircle size={48} className="text-red-400 opacity-60" />
    <p className="text-sm t-text-m max-w-md text-center">{message}</p>
    <button
      onClick={onRetry}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold
                 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20
                 transition-colors"
    >
      <RefreshCw size={14} /> Retry
    </button>
  </motion.div>
);


// ═══════════════════════════════════════════════════════════════════════════
// Sub-component: Leaderboard Card
// ═══════════════════════════════════════════════════════════════════════════

const LeaderboardCard = ({ title, icon: Icon, items, accentColor, direction, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="t-card t-border border rounded-xl p-5 flex-1 min-w-[280px]
               hover:shadow-lg hover:shadow-black/10 transition-shadow duration-300"
  >
    {/* Card header */}
    <div className="flex items-center gap-2.5 mb-4">
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}15` }}>
        <Icon size={16} style={{ color: accentColor }} />
      </div>
      <h3 className="text-[13px] font-black t-text uppercase tracking-wider">{title}</h3>
    </div>

    {/* Rows */}
    <div className="space-y-0.5">
      {items.map((item, idx) => (
        <motion.div
          key={item.ticker}
          initial={{ opacity: 0, x: direction === 'up' ? -12 : 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: delay + idx * 0.06 }}
          className="flex items-center justify-between px-3 py-2.5 rounded-lg
                     hover:bg-white/[0.03] transition-colors group"
        >
          <div className="flex items-center gap-3">
            {/* Rank badge */}
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black"
              style={{
                backgroundColor: `${accentColor}15`,
                color: accentColor,
              }}
            >
              {idx + 1}
            </span>
            <span className="text-[12px] font-bold t-text tracking-wide">{item.ticker}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Reliability dot: green ≥60%, yellow ≥30%, red <30% */}
            {item.reliability != null && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                title={`Reliability: ${(item.reliability * 100).toFixed(0)}%`}
                style={{
                  backgroundColor: item.reliability >= 0.6 ? '#22c55e'
                    : item.reliability >= 0.3 ? '#eab308' : '#ef4444',
                }}
              />
            )}
            <span
              className="text-[12px] font-black tabular-nums"
              style={{ color: accentColor }}
            >
              {fmt(item.icScore, 3)}
            </span>
            {direction === 'up'
              ? <ArrowUpRight size={13} style={{ color: accentColor }} />
              : <ArrowDownRight size={13} style={{ color: accentColor }} />}
          </div>
        </motion.div>
      ))}

      {items.length === 0 && (
        <p className="text-[11px] t-text-m text-center py-6">Insufficient data</p>
      )}
    </div>
  </motion.div>
);


// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SentimentCorrelation = () => {
  // ── State ──────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading]           = useState(true);
  const [error, setError]                   = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [scatterData, setScatterData]       = useState([]);
  const [usingFallback, setUsingFallback]   = useState(false);

  // ── Data-fetching pipeline ─────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // ── Step A: Fetch active tickers ──────────────────────────────────
      const tickersRes = await axios.get('/api/nlp/tickers');
      const rawTickers = tickersRes.data;
      const tickersList = Array.isArray(rawTickers)
        ? rawTickers
        : Array.isArray(rawTickers?.tickers) ? rawTickers.tickers : [];
      // Normalise: ensure every item is an object with a .ticker property
      const tickers = tickersList.map(t =>
        typeof t === 'string' ? { ticker: t, asset_type: 'Stock', n_obs: 0 } : t
      );

      if (tickers.length === 0) {
        // Graceful empty-state: the backend has no tickers configured
        setLeaderboardData([]);
        setScatterData([]);
        setIsLoading(false);
        return;
      }

      // ── Step B: Fetch the summary (batch — one call for all tickers) ──
      // The summary provides `net_sentiment` per ticker which we use for
      // the scatter-plot X-axis.
      let summaryMap = {};
      try {
        const summaryRes = await axios.get('/api/nlp/summary');
        const summaryArr = Array.isArray(summaryRes.data)
          ? summaryRes.data
          : summaryRes.data?.value || [];
        summaryArr.forEach((rec) => {
          const key = rec.ticker?.toUpperCase().replace('/', '');
          if (key) summaryMap[key] = rec;
        });
      } catch (_) {
        // Non-critical: scatter plot will just lack net_sentiment values
        console.warn('Summary fetch failed — scatter plot may be partial.');
      }

      // ── Step C: Fetch IC for every ticker (parallel, fault-tolerant) ──
      // Promise.allSettled ensures one bad ticker can't crash the page.
      const icPromises = tickers.map((t) =>
        axios.get(`/api/nlp/ic/${encodeURIComponent(t.ticker)}`)
      );
      const icResults = await Promise.allSettled(icPromises);

      // ── Step D: Parse successful responses ────────────────────────────
      const leaderboard = [];   // { ticker, icScore, assetType }
      const scatter     = [];   // { ticker, netSentiment, dailyReturn, icScore, assetType }

      icResults.forEach((result, idx) => {
        if (result.status !== 'fulfilled') return;

        const icData  = result.value?.data;
        const ticker  = tickers[idx]?.ticker;
        const normKey = ticker?.toUpperCase().replace('/', '');

        // Skip tickers where IC computation returned an error
        if (!icData || icData.error || icData.mean_ic == null) return;

        const icScore     = icData.mean_ic;
        const assetType   = tickers[idx]?.asset_type || 'Stock';
        const reliability = icData.reliability ?? 0;
        const nObs        = icData.n_obs ?? 0;

        // ── Leaderboard entry ───────────────────────────────────────────
        leaderboard.push({ ticker, icScore, assetType, reliability, nObs });

        // ── Scatter entry ───────────────────────────────────────────────
        // X = net_sentiment  (from summary)
        // Y = dailyReturn    (latest rolling-IC value from ic_ts — see
        //     header comment for details; swap this if your backend adds
        //     a dedicated daily_return field)
        const summaryRow    = summaryMap[normKey];
        const netSentiment  = summaryRow?.net_sentiment;

        // Extract the most-recent rolling IC value as a return proxy
        const icTs       = icData.ic_ts;
        const lastIcVal  = Array.isArray(icTs) && icTs.length > 0
          ? icTs[icTs.length - 1]?.value
          : null;

        // Only include in scatter if we have complete data for both axes
        if (netSentiment != null && lastIcVal != null) {
          scatter.push({
            ticker,
            netSentiment:  Number(netSentiment),
            dailyReturn:   Number(lastIcVal) * 100,   // scale to percentage for display
            icScore:       Number(icScore),
            assetType,
            reliability,
            nObs,
          });
        }
      });

      // ── Fallback: if IC failed for all tickers, use net_sentiment ───
      // This ensures the page still shows useful data instead of
      // "No active tickers available for analysis."
      if (leaderboard.length === 0 && Object.keys(summaryMap).length > 0) {
        for (const t of tickers) {
          const normKey = t.ticker?.toUpperCase().replace('/', '');
          const summaryRow = summaryMap[normKey];
          if (!summaryRow) continue;

          const netSent = summaryRow.net_sentiment;
          if (netSent == null) continue;

          leaderboard.push({
            ticker: t.ticker,
            icScore: Number(netSent),
            assetType: t.asset_type || 'Stock',
            reliability: 0,
            nObs: summaryRow.total_mentions ?? 0,
            isFallback: true,
          });

          scatter.push({
            ticker: t.ticker,
            netSentiment: Number(netSent),
            dailyReturn: Number(netSent) * 100,
            icScore: Number(netSent),
            assetType: t.asset_type || 'Stock',
            reliability: 0,
            nObs: summaryRow.total_mentions ?? 0,
          });
        }
      }

      // ── Sort leaderboard descending by IC ─────────────────────────────
      leaderboard.sort((a, b) => b.icScore - a.icScore);

      const isFallback = leaderboard.length > 0 && leaderboard[0]?.isFallback;
      setLeaderboardData(leaderboard);
      setScatterData(scatter);
      setUsingFallback(isFallback);
    } catch (err) {
      console.error('SentimentCorrelation fetch error:', err);
      setError(err.message || 'Failed to load data. Please check that the NLP backend is running.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger fetch on mount
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────

  const topAssets = useMemo(
    () => leaderboardData.slice(0, LEADERBOARD_SIZE),
    [leaderboardData],
  );

  const bottomAssets = useMemo(
    () => leaderboardData.slice(-LEADERBOARD_SIZE).reverse(),
    [leaderboardData],
  );

  // ── Render: Loading ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-2">
          <Loader2 size={20} className="text-emerald-400 animate-spin" />
          <span className="text-sm t-text-m animate-pulse">Loading Sentiment Correlation data…</span>
        </div>

        {/* Leaderboard skeletons */}
        <div className="flex flex-col lg:flex-row gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Chart skeleton */}
        <div className="t-card t-border border rounded-xl p-6">
          <div className="h-4 w-56 rounded bg-white/5 animate-pulse mb-6" />
          <div className="h-[420px] rounded-lg bg-white/[0.02] animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  // ── Render: Empty ──────────────────────────────────────────────────────

  if (leaderboardData.length === 0) {
    return (
      <div className="p-6">
        <EmptyState />
      </div>
    );
  }

  // ── Render: Main ───────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Activity size={20} className="text-emerald-400" />
            <h1 className="text-lg font-black t-text uppercase tracking-wider">
              Sentiment Correlation
            </h1>
          </div>
          <p className="text-[11px] t-text-m leading-relaxed max-w-lg">
            Information Coefficient (IC) leaderboard and scatter heatmap — how well does
            news sentiment predict asset price moves across the tracked universe.
          </p>
        </div>

        {/* Stats pill */}
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold t-text-m t-card t-border border">
            {leaderboardData.length} assets analysed
          </span>
          <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold t-text-m t-card t-border border">
            {scatterData.length} with scatter data
          </span>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg t-card t-border border hover:bg-emerald-500/10
                       transition-colors group"
            title="Refresh data"
          >
            <RefreshCw size={14} className="t-text-m group-hover:text-emerald-400 transition-colors" />
          </button>
        </div>
      </motion.div>

      {/* ── Fallback notice ────────────────────────────────────────────── */}
      {usingFallback && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-[11px] font-bold">
          <Info size={14} className="flex-shrink-0" />
          <span>IC data unavailable — showing Net Sentiment scores as a fallback. Collect more articles to enable full IC analysis.</span>
        </div>
      )}

      {/* ── Leaderboard Cards ───────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4">
        <LeaderboardCard
          title="Highest Sentiment Correlation"
          icon={TrendingUp}
          items={topAssets}
          accentColor={GREEN}
          direction="up"
          delay={0.1}
        />
        <LeaderboardCard
          title="Lowest / Negative Correlation"
          icon={TrendingDown}
          items={bottomAssets}
          accentColor={RED}
          direction="down"
          delay={0.25}
        />
      </div>

      {/* ── Scatter Plot Heatmap ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="t-card t-border border rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <BarChart3 size={16} className="text-emerald-400" />
            <h2 className="text-[13px] font-black t-text uppercase tracking-wider">
              Scatter Plot Heatmap
            </h2>
          </div>

          {/* Quadrant legend */}
          <div className="hidden sm:flex items-center gap-4 text-[10px] t-text-m">
            <LegendDot color={GREEN}  label="Aligned Bullish" />
            <LegendDot color={RED}    label="Aligned Bearish" />
            <LegendDot color={YELLOW} label="Divergence" />
          </div>
        </div>

        {scatterData.length === 0 ? (
          <EmptyState message="No tickers have sufficient data for the scatter plot." />
        ) : (
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_COLOR}
              />

              {/* X-Axis: Net Sentiment */}
              <XAxis
                type="number"
                dataKey="netSentiment"
                name="Net Sentiment"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
                label={{
                  value: 'Net Sentiment',
                  position: 'insideBottom',
                  offset: -18,
                  fill: '#9ca3af',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />

              {/* Y-Axis: Daily Return (%) */}
              <YAxis
                type="number"
                dataKey="dailyReturn"
                name="Daily Return (%)"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
                label={{
                  value: 'Daily Return (%)',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 4,
                  fill: '#9ca3af',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />

              {/* Bubble size based on |IC Score| */}
              <ZAxis
                type="number"
                dataKey="icScore"
                range={[60, 400]}
                name="IC Score"
              />

              {/* Reference lines at 0 for quadrant separation */}
              <ReferenceLine x={0} stroke="#475569" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />

              {/* Custom tooltip */}
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
              />

              {/* Scatter dots — coloured per quadrant */}
              <Scatter data={scatterData} shape="circle">
                {scatterData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={quadrantColor(entry.netSentiment, entry.dailyReturn)}
                    fillOpacity={0.75}
                    stroke={quadrantColor(entry.netSentiment, entry.dailyReturn)}
                    strokeOpacity={0.3}
                    strokeWidth={3}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}

        {/* Methodology note */}
        <div className="flex items-start gap-2 mt-4 px-1">
          <Info size={12} className="t-text-f mt-0.5 flex-shrink-0" />
          <p className="text-[10px] t-text-f leading-relaxed">
            <strong>Methodology:</strong> IC = rolling Spearman rank correlation between
            lagged sentiment and forward returns, with Bayesian shrinkage (low-data tickers
            are pulled toward 0). Coloured dots indicate reliability — green (≥60%), yellow
            (≥30%), red (&lt;30%). Tickers with fewer than 8 articles or insufficient unique
            sentiment values are excluded to avoid degenerate IC = ±1.
          </p>
        </div>
      </motion.div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
// Tiny helper: legend dot
// ═══════════════════════════════════════════════════════════════════════════

const LegendDot = ({ color, label }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
    <span>{label}</span>
  </div>
);


export default SentimentCorrelation;

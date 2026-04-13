import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart, Area, BarChart, Bar, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
    ResponsiveContainer,
} from 'recharts';
import {
    Zap, Clock, TrendingUp, AlertTriangle, ShieldCheck, Activity,
    ChevronRight, Crown, Loader2, BarChart3, Target, DollarSign,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import useFetch from '../hooks/useFetch';

/* ── helpers ──────────────────────────────────────────────────────────── */
const fmt   = (n, d = 2) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';
const fmtPct = n => (typeof n === 'number' && !isNaN(n))
    ? `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const formatAsset = n => n ? String(n).replace(/_/g, ' ') : '—';

const CAT_COLORS = {
    'Indices':     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-500' },
    'FX G10':      { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500' },
    'Commodities': { bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-500' },
    'Rates':       { bg: 'bg-emerald-500/10',text: 'text-emerald-400',dot: 'bg-emerald-500' },
    'Other':       { bg: 'bg-gray-500/10',   text: 'text-gray-400',   dot: 'bg-gray-500' },
};
const getCat = cat => CAT_COLORS[cat] || CAT_COLORS['Other'];
const srColor  = v => v >= 0.5 ? 'text-emerald-400' : v >= 0.2 ? 'text-green-400' : v >= 0 ? 'text-yellow-400' : 'text-red-400';
const wrColor  = v => v >= 0.6 ? 'text-emerald-400' : v >= 0.5 ? 'text-green-400' : v >= 0.45 ? 'text-yellow-400' : 'text-red-400';
const retColor = v => v >= 0 ? 'text-emerald-400' : 'text-red-400';

const EXIT_LABELS = { Leader_Reversal: 'Leader Rev.', EndOfPeriod: 'End of Period' };

/* ── custom tooltip ───────────────────────────────────────────────────── */
// mode: 'dollar' → $1,234  |  'pct' → +1.23%  |  'pnl' → +$1,234
const ChartTip = ({ active, payload, label, mode = 'dollar' }) => {
    if (!active || !payload?.length) return null;
    const fmtVal = v => {
        if (mode === 'pct')    return `${v >= 0 ? '+' : ''}${fmt(v, 2)}%`;
        if (mode === 'pnl')    return `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        /* dollar */           return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };
    return (
        <div className="t-card border t-border-s rounded-xl px-3 py-2.5 shadow-2xl" style={{ minWidth: 150 }}>
            <div className="text-[9px] font-black uppercase tracking-widest t-text-m mb-1.5 border-b t-border-s pb-1">
                {fmtDate(label || payload[0]?.payload?.date)}
            </div>
            {payload.filter(p => p.value != null).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
                        <span className="text-[9px] t-text-m font-bold">{p.name}</span>
                    </div>
                    <span className={`text-[10px] font-black font-mono ${p.value >= 0 ? 't-text' : 'text-red-400'}`}>
                        {fmtVal(p.value)}
                    </span>
                </div>
            ))}
        </div>
    );
};

/* ── stat card ────────────────────────────────────────────────────────── */
const StatCard = ({ label, value, accent = 't-text', icon: Icon, sub }) => (
    <div className="t-card rounded-xl border t-border-s p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between">
            <span className="text-[8px] font-black t-text-m uppercase tracking-[0.18em]">{label}</span>
            {Icon && <Icon size={12} className="t-text-m" />}
        </div>
        <div className={`text-xl font-black font-mono ${accent}`}>{value}</div>
        {sub && <div className="text-[8px] t-text-m">{sub}</div>}
    </div>
);

/* ── unavailable freq message ─────────────────────────────────────────── */
const FREQ_UNAVAILABLE = {
    '1h': { title: 'Hourly — Not Available', reason: 'Hourly lead-lag discovery requires ≥5 years of training data separate from the evaluation period. Current hourly data covers only 2023–2026 (3 years). This would result in pure in-sample overfitting with no walk-forward validation.', icon: '⏰' },
    '1w': { title: 'Weekly — Not Applicable', reason: 'Cross-correlation at weekly frequency shows all pairs at lag-0 (same week). No genuine week-to-week predictive relationship exists in this dataset.', icon: '🗓️' },
};

const FREQ_BUTTONS = [
    { code: '1d', label: 'Daily',  icon: '📅' },
    { code: '1h', label: 'Hourly', icon: '⏰' },
    { code: '1w', label: 'Weekly', icon: '🗓️' },
];

/* ══════════════════════════════════════════════════════════════════════ */
const TradingSignals = () => {
    const [activeFreq, setActiveFreq]           = useState('1d');
    const [selectedLeader, setSelectedLeader]   = useState(null);
    const [selectedFollower, setSelectedFollower] = useState(null);
    const [pairDetail, setPairDetail]           = useState(null);
    const [pairLoading, setPairLoading]         = useState(false);
    const [showTradeLog, setShowTradeLog]       = useState(false);
    const [capital, setCapital]                 = useState(10000);

    const { data: rawData, loading } = useFetch(`/api/trading_signals/${activeFreq}`);

    const data = useMemo(() => rawData || { leaders: {}, total_pairs: 0, frequency: activeFreq, label: '' }, [rawData, activeFreq]);

    const leadersList = useMemo(() =>
        Object.values(data.leaders || {}).sort((a, b) => b.best_sharpe - a.best_sharpe),
    [data]);

    // auto-select first leader
    useEffect(() => {
        if (leadersList.length > 0 && !selectedLeader) setSelectedLeader(leadersList[0].leader);
    }, [leadersList]);

    // reset on freq change
    useEffect(() => { setSelectedLeader(null); setSelectedFollower(null); setPairDetail(null); }, [activeFreq]);

    const activeLeaderData = useMemo(() =>
        selectedLeader && data.leaders ? (data.leaders[selectedLeader] || null) : null,
    [selectedLeader, data]);

    const sortedFollowers = useMemo(() => {
        if (!activeLeaderData) return [];
        return [...activeLeaderData.followers].sort((a, b) => (b.Sharpe_Ratio || 0) - (a.Sharpe_Ratio || 0));
    }, [activeLeaderData]);

    // auto-select first follower when leader changes
    useEffect(() => {
        if (sortedFollowers.length > 0) {
            setSelectedFollower(sortedFollowers[0].Follower);
            setPairDetail(null);
            setShowTradeLog(false);
        }
    }, [activeLeaderData]);

    // fetch equity curve when follower selected
    useEffect(() => {
        if (!selectedFollower || !selectedLeader) return;
        const ctrl = new AbortController();
        setPairLoading(true);
        setPairDetail(null);
        setShowTradeLog(false);
        fetch(`/api/signals/equity/${selectedLeader}/${selectedFollower}`, { signal: ctrl.signal })
            .then(r => r.json())
            .then(d => {
                // only store if the response is valid (has equity data)
                if (d?.equity?.length) setPairDetail(d);
            })
            .catch(() => {})
            .finally(() => setPairLoading(false));
        return () => ctrl.abort();
    }, [selectedFollower, selectedLeader]);

    const selectedFollowerData = useMemo(() =>
        sortedFollowers.find(f => f.Follower === selectedFollower) || null,
    [sortedFollowers, selectedFollower]);

    /* final equity multiplier */
    const finalEquity = useMemo(() => {
        if (!pairDetail?.equity?.length) return null;
        return pairDetail.equity[pairDetail.equity.length - 1].value;
    }, [pairDetail]);

    /* dollar equity and P&L series derived from capital */
    const equityDollar = useMemo(() => {
        if (!pairDetail?.equity?.length) return [];
        return pairDetail.equity.map(p => ({ date: p.date, value: Math.round(p.value * capital * 100) / 100 }));
    }, [pairDetail, capital]);

    const pnlDollar = useMemo(() => {
        if (!pairDetail?.equity?.length) return [];
        return pairDetail.equity.map(p => ({ date: p.date, value: Math.round((p.value - 1) * capital * 100) / 100 }));
    }, [pairDetail, capital]);

    const finalPnl = useMemo(() => pnlDollar.length ? pnlDollar[pnlDollar.length - 1].value : null, [pnlDollar]);

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 t-border border-b mt-8 md:mt-0">
                <div>
                    <h2 className="text-2xl font-black t-text flex items-center gap-3">
                        <Zap className="text-awb-gold" size={24} />
                        Trading <span className="text-awb-red">Signals</span>
                    </h2>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest mt-1">
                        Institutional Backtest · Walk-Forward Validation · Leader-Reversal Exit
                    </p>
                </div>
            </div>

            {/* Frequency toggle */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-2">
                    <Activity size={14} className="text-awb-gold" />
                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Frequency:</span>
                </div>
                {FREQ_BUTTONS.map(fb => {
                    const isActive = activeFreq === fb.code;
                    return (
                        <button key={fb.code} onClick={() => setActiveFreq(fb.code)}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all flex items-center gap-2
                                ${isActive ? 'bg-awb-red text-white border-awb-red/30 shadow-lg shadow-awb-red/20' : 't-text-m border-white/10 hover:border-white/20 t-card'}`}>
                            <span>{fb.icon}</span><span>{fb.label}</span>
                        </button>
                    );
                })}
                {data.total_pairs > 0 && (
                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest ml-2">{data.total_pairs} pairs</span>
                )}
            </div>

            {/* Unavailable */}
            {FREQ_UNAVAILABLE[activeFreq] && (
                <div className="flex flex-col items-center justify-center py-20 t-card t-border border rounded-2xl gap-6 max-w-2xl mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-awb-red/10 border border-awb-red/20 flex items-center justify-center text-3xl">
                        {FREQ_UNAVAILABLE[activeFreq].icon}
                    </div>
                    <div className="text-center px-8">
                        <h3 className="font-black t-text text-lg mb-4 uppercase tracking-widest">{FREQ_UNAVAILABLE[activeFreq].title}</h3>
                        <p className="t-text-m text-sm leading-relaxed">{FREQ_UNAVAILABLE[activeFreq].reason}</p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {!FREQ_UNAVAILABLE[activeFreq] && loading && (
                <div className="flex items-center justify-center py-24">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                        <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Loading...</span>
                    </div>
                </div>
            )}

            {/* Main grid */}
            {!FREQ_UNAVAILABLE[activeFreq] && !loading && leadersList.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* ── Left: Leaders ── */}
                    <div className="lg:col-span-3 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Crown size={13} className="text-awb-gold" />
                            <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Leaders ({leadersList.length})</span>
                        </div>
                        <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                            {leadersList.map(leader => {
                                const isActive = selectedLeader === leader.leader;
                                const cs = getCat(leader.category);
                                return (
                                    <button key={leader.leader} onClick={() => setSelectedLeader(leader.leader)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all group
                                            ${isActive ? 'bg-awb-red/10 border-awb-red/30' : 't-card t-border hover:border-awb-red/20'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${cs.dot}`} />
                                                <span className={`text-sm font-bold uppercase truncate ${isActive ? 'text-awb-red' : 't-text group-hover:text-awb-red'} transition-colors`}>
                                                    {formatAsset(leader.leader)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${cs.bg} ${cs.text}`}>{leader.follower_count}</span>
                                                <ChevronRight size={11} className={isActive ? 'text-awb-red' : 't-text-m'} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 ml-4">
                                            <span className="text-[9px] font-bold t-text-m uppercase tracking-wider">
                                                WR: <span className={wrColor(leader.avg_win_rate)}>{(leader.avg_win_rate * 100).toFixed(0)}%</span>
                                            </span>
                                            <span className="text-[9px] font-bold t-text-m uppercase tracking-wider">
                                                SR: <span className="text-awb-gold">{leader.best_sharpe.toFixed(2)}</span>
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Right: Detail ── */}
                    <div className="lg:col-span-9 space-y-4">
                        {activeLeaderData ? (
                            <>
                                {/* Leader header */}
                                <div className="t-card t-border border rounded-xl p-4 flex flex-col gap-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-awb-red/10 border border-awb-red/20 flex items-center justify-center">
                                                <Crown size={20} className="text-awb-red" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black t-text uppercase">{formatAsset(selectedLeader)}</h3>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${getCat(activeLeaderData.category).text}`}>
                                                    {activeLeaderData.category} · Daily
                                                </span>
                                            </div>
                                        </div>
                                        {/* Capital input */}
                                        <div className="flex items-center gap-2 t-elevated border t-border-s rounded-xl px-3 py-2">
                                            <DollarSign size={13} className="text-awb-gold shrink-0" />
                                            <span className="text-[9px] font-bold t-text-m uppercase tracking-widest whitespace-nowrap">Capital</span>
                                            <input
                                                type="number"
                                                value={capital}
                                                onChange={e => setCapital(Math.max(1, Number(e.target.value) || 10000))}
                                                className="w-24 bg-transparent text-right text-sm font-black font-mono t-text outline-none"
                                                step={1000}
                                                min={100}
                                            />
                                        </div>
                                    </div>
                                    {/* Strategy params strip */}
                                    <div className="flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-widest">
                                        {[
                                            { l: 'Entry', v: '1.5σ', c: 'text-blue-400' },
                                            { l: 'Exit', v: 'Leader Reversal', c: 'text-emerald-400' },
                                            { l: 'Regime', v: 'Bull+Range', c: 'text-cyan-400' },
                                        ].map(x => (
                                            <div key={x.l} className="flex items-center gap-1 t-card border t-border-s rounded-lg px-2 py-1">
                                                <span className="t-text-m">{x.l}:</span>
                                                <span className={x.c}>{x.v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Follower selector tabs */}
                                <div className="flex flex-wrap gap-2">
                                    {sortedFollowers.map(f => {
                                        const isActive = selectedFollower === f.Follower;
                                        const cs = getCat(f.Cat_Follower || 'Other');
                                        return (
                                            <button key={f.Follower} onClick={() => setSelectedFollower(f.Follower)}
                                                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all
                                                    ${isActive ? 'bg-awb-red/10 border-awb-red/40 text-awb-red shadow-lg' : 't-card t-border hover:border-awb-red/20 t-text'}`}>
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${cs.dot}`} />
                                                <span>{formatAsset(f.Follower)}</span>
                                                <span className={`text-[10px] font-black ${srColor(f.Sharpe_Ratio || 0)}`}>
                                                    SR {fmt(f.Sharpe_Ratio)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Selected pair detail */}
                                <AnimatePresence mode="wait">
                                    {selectedFollowerData && (
                                        <motion.div key={selectedFollower}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4">

                                            {/* 6 metric cards */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                                <StatCard label="Sharpe"      icon={ShieldCheck}  value={fmt(selectedFollowerData.Sharpe_Ratio)} accent={srColor(selectedFollowerData.Sharpe_Ratio || 0)} sub="Trade-level" />
                                                <StatCard label="Win Rate"    icon={Target}       value={`${((selectedFollowerData.Win_Rate || 0) * 100).toFixed(1)}%`} accent={wrColor(selectedFollowerData.Win_Rate || 0)} sub={`${selectedFollowerData.Winning_Trades}W / ${selectedFollowerData.Losing_Trades}L`} />
                                                <StatCard label="Annual Ret"  icon={TrendingUp}   value={fmtPct(selectedFollowerData.Annual_Return)} accent={retColor(selectedFollowerData.Annual_Return || 0)} sub="OOS 2023–2026" />
                                                <StatCard label="Max DD"      icon={AlertTriangle} value={`${((selectedFollowerData.Max_Drawdown || 0) * 100).toFixed(1)}%`} accent="text-red-400" sub="Test period" />
                                                <StatCard label="Trades"      icon={BarChart3}    value={selectedFollowerData.N_Trades || 0} sub={`~${fmt(selectedFollowerData.Trades_Per_Year, 1)}/yr`} />
                                                <StatCard label="Avg Hold"    icon={Clock}        value={`${fmt(selectedFollowerData.Avg_Hold_Days, 1)}d`} sub={`Lag: ${selectedFollowerData.Lead_Days_Used || selectedFollowerData.Lead_Days || '?'}d`} />
                                            </div>

                                            {/* Charts or loading */}
                                            {pairLoading ? (
                                                <div className="t-card border t-border-s rounded-xl flex items-center justify-center h-56">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="w-7 h-7 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                                                        <span className="text-[9px] font-bold t-text-m uppercase tracking-widest">Loading curves...</span>
                                                    </div>
                                                </div>
                                            ) : pairDetail ? (
                                                <>
                                                    {/* Equity Curve — dollar */}
                                                    <div className="t-card border t-border-s rounded-xl p-5">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-awb-gold">Equity Curve</div>
                                                            <div className="flex items-center gap-4 text-[8px] font-bold">
                                                                <span className="flex items-center gap-1.5 t-text-m uppercase tracking-widest">
                                                                    <span className="w-2.5 h-0.5 rounded bg-awb-gold" />
                                                                    {formatAsset(selectedFollower)}
                                                                </span>
                                                                {finalEquity != null && (
                                                                    <span className={`font-black font-mono ${finalEquity >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        Final: ${(finalEquity * capital).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <ResponsiveContainer width="100%" height={200}>
                                                            <AreaChart data={equityDollar} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                                                <defs>
                                                                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%"  stopColor="#FFB81C" stopOpacity={0.15} />
                                                                        <stop offset="95%" stopColor="#FFB81C" stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                                                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                                                                    tickFormatter={fmtDate} interval="preserveStartEnd" />
                                                                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
                                                                    tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                                                                <Tooltip content={<ChartTip mode="dollar" />} />
                                                                <ReferenceLine y={capital} stroke="var(--border-primary)" strokeDasharray="4 4" />
                                                                <Area type="monotone" dataKey="value" stroke="#FFB81C" strokeWidth={1.5}
                                                                    fill="url(#eqGrad)" name="Portfolio" />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Cumulative P&L — dollar */}
                                                    <div className="t-card border t-border-s rounded-xl p-5">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-awb-gold">Cumulative P&L</div>
                                                            <div className="text-[8px] font-bold">
                                                                {finalPnl != null && (
                                                                    <span className={`font-black font-mono ${finalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        Final: {finalPnl >= 0 ? '+' : ''}${Math.abs(finalPnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <ResponsiveContainer width="100%" height={180}>
                                                            <AreaChart data={pnlDollar} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                                                <defs>
                                                                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                                                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                                                                    tickFormatter={fmtDate} interval="preserveStartEnd" />
                                                                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={60}
                                                                    tickFormatter={v => `$${v.toFixed(0)}`} />
                                                                <Tooltip content={<ChartTip mode="pnl" />} />
                                                                <ReferenceLine y={0} stroke="var(--border-primary)" strokeDasharray="4 4" />
                                                                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5}
                                                                    fill="url(#pnlGrad)" name="P&L" />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Monthly P&L */}
                                                    <div className="t-card border t-border-s rounded-xl p-5">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-awb-gold">Monthly P&L</div>
                                                            <div className="flex items-center gap-4 text-[8px] t-text-m font-bold uppercase tracking-widest">
                                                                <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-emerald-400 opacity-70" /> Positive month</span>
                                                                <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-red-400 opacity-70" /> Negative month</span>
                                                            </div>
                                                        </div>
                                                        <ResponsiveContainer width="100%" height={160}>
                                                            <BarChart data={pairDetail.monthly_pnl || []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" vertical={false} />
                                                                <XAxis dataKey="month" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} interval={1} />
                                                                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} width={44}
                                                                    tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
                                                                <Tooltip content={<ChartTip mode="pct" />} />
                                                                <ReferenceLine y={0} stroke="var(--border-primary)" strokeDasharray="4 4" />
                                                                <Bar dataKey="return" name="Monthly P&L" radius={[2, 2, 0, 0]}>
                                                                    {(pairDetail.monthly_pnl || []).map((entry, i) => (
                                                                        <Cell key={i} fill={entry.return >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.75} />
                                                                    ))}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Trade log (collapsible) */}
                                                    <div className="t-card border t-border-s rounded-xl overflow-hidden">
                                                        <button
                                                            onClick={() => setShowTradeLog(p => !p)}
                                                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-awb-gold flex items-center gap-2">
                                                                Trade Log
                                                                <span className="text-[8px] t-text-m font-bold">({(pairDetail.trades || []).length} trades)</span>
                                                            </div>
                                                            {showTradeLog ? <ChevronUp size={13} className="t-text-m" /> : <ChevronDown size={13} className="t-text-m" />}
                                                        </button>

                                                        <AnimatePresence>
                                                            {showTradeLog && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="overflow-hidden">
                                                                    <div className="overflow-auto max-h-80 border-t t-border-s">
                                                                        <table className="w-full text-left">
                                                                            <thead className="sticky top-0 t-card border-b t-border-s">
                                                                                <tr>
                                                                                    {['#', 'Dir', 'Entry', 'Exit', 'Hold', 'Return', 'Exit Reason', 'Size'].map(h => (
                                                                                        <th key={h} className="px-3 py-2.5 text-[8px] font-black uppercase tracking-widest t-text-m whitespace-nowrap">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {(pairDetail.trades || []).map((t, i) => (
                                                                                    <tr key={i} className={`border-b t-border-s hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                                                                                        <td className="px-3 py-2 text-[9px] t-text-m font-bold">{i + 1}</td>
                                                                                        <td className="px-3 py-2">
                                                                                            <span className={`text-[9px] font-black ${t.direction === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                                                {t.direction === 1 ? 'LONG' : 'SHORT'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-[9px] font-mono t-text whitespace-nowrap">{fmtDate(t.entry_date)}</td>
                                                                                        <td className="px-3 py-2 text-[9px] font-mono t-text whitespace-nowrap">{fmtDate(t.exit_date)}</td>
                                                                                        <td className="px-3 py-2 text-[9px] font-mono t-text-m">{t.hold_days}d</td>
                                                                                        <td className="px-3 py-2">
                                                                                            <span className={`text-[10px] font-black font-mono ${t.net_ret >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                                                {t.net_ret >= 0 ? '+' : ''}{fmt(t.net_ret, 2)}%
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-3 py-2">
                                                                                            <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wide
                                                                                                ${t.exit_reason === 'Leader_Reversal' ? 'bg-blue-500/10 text-blue-400' :
                                                                                                  'bg-gray-500/10 text-gray-400'}`}>
                                                                                                {EXIT_LABELS[t.exit_reason] || t.exit_reason}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-[9px] font-mono t-text-m">{fmt(t.pos_size, 2)}×</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* Exit breakdown */}
                                                    <div className="t-card border t-border-s rounded-xl p-4">
                                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-awb-gold mb-3">Exit Breakdown</div>
                                                        <div className="flex flex-wrap gap-3">
                                                            {[
                                                                { key: 'Leader_Rev_Exits',  label: 'Leader Reversal', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
                                                                { key: 'EndOfPeriod_Exits', label: 'End of Period',   color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
                                                            ].map(x => (
                                                                <div key={x.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold ${x.color}`}>
                                                                    <span className="t-text-m font-bold uppercase tracking-wider text-[8px]">{x.label}</span>
                                                                    <span className="font-black text-sm">{selectedFollowerData[x.key] ?? 0}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            ) : null}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-24 t-card t-border border rounded-2xl gap-4">
                                <Crown size={36} className="t-text-m opacity-30" />
                                <p className="t-text-m text-sm font-bold uppercase tracking-widest">Select a leader from the left panel</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!FREQ_UNAVAILABLE[activeFreq] && !loading && leadersList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 t-card t-border border rounded-2xl gap-6">
                    <Zap size={28} className="text-awb-gold" />
                    <p className="t-text-m text-sm font-bold uppercase tracking-widest">No data available</p>
                </div>
            )}
        </div>
    );
};

export default TradingSignals;

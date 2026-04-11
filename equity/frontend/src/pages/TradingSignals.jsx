import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, TrendingUp, AlertTriangle, ShieldCheck, DollarSign, Activity, Filter, ChevronRight, BarChart3, Target, Crown, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import useFetch from '../hooks/useFetch';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

const FREQ_BUTTONS = [
    { code: '1d',  label: 'Daily',   icon: '📅' },
    { code: '1h',  label: 'Hourly',  icon: '⏰' },
    { code: '1w',  label: 'Weekly',  icon: '🗓️' },
];

const CAT_COLORS = {
    'Indices':     { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    dot: 'bg-blue-500' },
    'FX G10':      { bg: 'bg-purple-500/10',   text: 'text-purple-400',  border: 'border-purple-500/20',  dot: 'bg-purple-500' },
    'Commodities': { bg: 'bg-amber-500/10',    text: 'text-amber-400',   border: 'border-amber-500/20',   dot: 'bg-amber-500' },
    'Rates':       { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
    'Other':       { bg: 'bg-gray-500/10',     text: 'text-gray-400',    border: 'border-gray-500/20',    dot: 'bg-gray-500' },
};

const getCatStyle = (cat) => CAT_COLORS[cat] || CAT_COLORS['Other'];

const FREQ_UNAVAILABLE = {
    '1h': {
        title: 'Hourly Analysis — Not Available',
        reason: 'Hourly lead-lag discovery requires a minimum of 5 years of training data separate from the evaluation period. Current hourly data covers only 2023–2026 (3 years) with ~53% coverage on equity indices due to market trading hours. Applying the discovery pipeline on this data would result in pure in-sample overfitting with no walk-forward validation. Hourly analysis is planned as a next phase requiring dedicated intraday data acquisition.',
        icon: '⏰'
    },
    '1w': {
        title: 'Weekly Analysis — Not Applicable',
        reason: 'Cross-correlation analysis on weekly returns shows all validated pairs exhibit their strongest correlation at lag 0 (same week). Lag-1 weekly correlations are near zero across all pairs — for example SP500→NASDAQ100: lag-1 = -0.08, DAX→CAC40: lag-1 = 0.005. A genuine week-to-week predictive relationship does not exist in this dataset at the weekly frequency.',
        icon: '🗓️'
    }
};

const TradingSignals = () => {
    const [activeFreq, setActiveFreq] = useState('1d');
    const [selectedLeader, setSelectedLeader] = useState(null);
    const [sortBy, setSortBy] = useState('sharpe');

    const { data: rawData, loading, error } = useFetch(`/api/trading_signals/${activeFreq}`);

    const data = useMemo(() => {
        if (!rawData) return { leaders: {}, total_pairs: 0, frequency: activeFreq, label: '' };
        return rawData;
    }, [rawData, activeFreq]);

    const leadersList = useMemo(() => {
        if (!data.leaders) return [];
        return Object.values(data.leaders)
            .sort((a, b) => b.best_sharpe - a.best_sharpe);
    }, [data]);

    useEffect(() => {
        if (leadersList.length > 0 && !selectedLeader) {
            setSelectedLeader(leadersList[0].leader);
        }
    }, [leadersList]);

    useEffect(() => {
        setSelectedLeader(null);
    }, [activeFreq]);

    const activeLeaderData = useMemo(() => {
        if (!selectedLeader || !data.leaders) return null;
        return data.leaders[selectedLeader] || null;
    }, [selectedLeader, data]);

    const sortedFollowers = useMemo(() => {
        if (!activeLeaderData) return [];
        let followers = [...activeLeaderData.followers];
        switch (sortBy) {
            case 'sharpe':
                followers.sort((a, b) => (b.Sharpe_Ratio || 0) - (a.Sharpe_Ratio || 0));
                break;
            case 'winrate':
                followers.sort((a, b) => (b.Win_Rate || 0) - (a.Win_Rate || 0));
                break;
            case 'trades':
                followers.sort((a, b) => (b.N_Trades || 0) - (a.N_Trades || 0));
                break;
            case 'return':
                followers.sort((a, b) => (b.Annual_Return || 0) - (a.Annual_Return || 0));
                break;
            default:
                break;
        }
        return followers;
    }, [activeLeaderData, sortBy]);

    const stats = useMemo(() => {
        if (!sortedFollowers.length) return { avgWin: 0, bestSharpe: 0, totalFollowers: 0, avgReturn: 0 };
        return {
            avgWin: sortedFollowers.reduce((a, f) => a + (f.Win_Rate || 0), 0) / sortedFollowers.length,
            bestSharpe: Math.max(...sortedFollowers.map(f => f.Sharpe_Ratio || 0)),
            totalFollowers: sortedFollowers.length,
            avgReturn: sortedFollowers.reduce((a, f) => a + (f.Annual_Return || 0), 0) / sortedFollowers.length,
        };
    }, [sortedFollowers]);

    const getLagLabel = (f) => {
        if (f.Reaction_Time) return f.Reaction_Time;
        const lag = f.Optimal_Lag || f.Lead_Days || 0;
        const unit = f.Lag_Unit || (activeFreq === '1h' ? 'hour' : 'day');
        return `${lag} ${unit}${lag !== 1 ? 's' : ''}`;
    };

    const winRateColor = (wr) => {
        if (wr >= 0.60) return 'text-emerald-400';
        if (wr >= 0.55) return 'text-green-400';
        if (wr >= 0.50) return 'text-yellow-400';
        return 'text-red-400';
    };

    const sharpeColor = (s) => {
        if (s >= 1.0) return 'text-emerald-400';
        if (s >= 0.5) return 'text-green-400';
        if (s >= 0) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 t-border border-b transition-colors mt-8 md:mt-0">
                <div>
                    <h2 className="text-2xl font-black t-text transition-colors flex items-center gap-3">
                        <Zap className="text-awb-gold" size={24} />
                        Trading <span className="text-awb-red">Signals</span>
                    </h2>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest mt-1 transition-colors">
                        Institutional Backtest • Walk-Forward Validation • Dynamic Exit Strategy (TP/SL + Leader Reversal)
                    </p>
                </div>
            </div>

            {/* Frequency Toggle */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-2">
                    <Activity size={14} className="text-awb-gold" />
                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Frequency:</span>
                </div>
                {FREQ_BUTTONS.map(fb => {
                    const isActive = activeFreq === fb.code;
                    return (
                        <button
                            key={fb.code}
                            onClick={() => setActiveFreq(fb.code)}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 flex items-center gap-2
                                ${isActive
                                    ? 'bg-awb-red text-white border-awb-red/30 shadow-lg shadow-awb-red/20'
                                    : 't-text-m border-white/10 hover:border-white/20 hover:t-text t-card'
                                }`}
                        >
                            <span>{fb.icon}</span>
                            <span>{fb.label}</span>
                        </button>
                    );
                })}
                {data.total_pairs > 0 && (
                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest ml-2">
                        {data.total_pairs} pairs found
                    </span>
                )}
            </div>

            {/* Strategy description card */}
            {activeFreq === '1d' && !FREQ_UNAVAILABLE[activeFreq] && leadersList.length > 0 && (
                <div className="t-card t-border border rounded-xl p-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold t-text uppercase tracking-widest">
                            Strategy: Dynamic Exit
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        {[
                            { label: 'Signal Threshold', value: '1.5\u03c3 leader move', color: 'text-blue-400' },
                            { label: 'Take Profit', value: '+2.0\u03c3 follower', color: 'text-emerald-400' },
                            { label: 'Stop Loss', value: '-1.0\u03c3 follower', color: 'text-red-400' },
                            { label: 'Leader Reversal', value: 'Opposite 1.5\u03c3', color: 'text-purple-400' },
                            { label: 'Max Hold', value: '10 days', color: 'text-awb-gold' },
                            { label: 'Regime Gate', value: 'Bull + Range only', color: 'text-cyan-400' },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold t-text-m uppercase tracking-widest">
                                    {item.label}:
                                </span>
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${item.color}`}>
                                    {item.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Unavailable frequency message */}
            {FREQ_UNAVAILABLE[activeFreq] && (
                <div className="flex flex-col items-center justify-center py-20 t-card t-border border rounded-2xl gap-6 max-w-2xl mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-awb-red/10 border border-awb-red/20 flex items-center justify-center text-3xl">
                        {FREQ_UNAVAILABLE[activeFreq].icon}
                    </div>
                    <div className="text-center px-8">
                        <h3 className="font-black t-text text-lg mb-4 uppercase tracking-widest">
                            {FREQ_UNAVAILABLE[activeFreq].title}
                        </h3>
                        <p className="t-text-m text-sm leading-relaxed">
                            {FREQ_UNAVAILABLE[activeFreq].reason}
                        </p>
                    </div>
                </div>
            )}

            {/* Loading / Empty State */}
            {!FREQ_UNAVAILABLE[activeFreq] && (loading ? (
                <div className="flex items-center justify-center py-24">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                        <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Loading {FREQ_BUTTONS.find(f => f.code === activeFreq)?.label} Data...</span>
                    </div>
                </div>
            ) : leadersList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 t-card t-border border rounded-2xl gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-awb-gold/10 border border-awb-gold/20 flex items-center justify-center">
                        <Zap size={28} className="text-awb-gold" />
                    </div>
                    <div className="text-center max-w-md">
                        <h3 className="font-bold t-text text-lg mb-2">No {FREQ_BUTTONS.find(f => f.code === activeFreq)?.label} Data Available</h3>
                        <p className="t-text-m text-sm">
                            Run the institutional backtest to generate {FREQ_BUTTONS.find(f => f.code === activeFreq)?.label?.toLowerCase()} trading signals.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Left Panel: Leader Selection */}
                    <div className="lg:col-span-4 xl:col-span-3 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Crown size={14} className="text-awb-gold" />
                            <span className="text-[10px] font-bold t-text-m uppercase tracking-widest">Leaders ({leadersList.length})</span>
                        </div>
                        <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar pr-1">
                            {leadersList.map(leader => {
                                const isActive = selectedLeader === leader.leader;
                                const catStyle = getCatStyle(leader.category);
                                return (
                                    <button
                                        key={leader.leader}
                                        onClick={() => setSelectedLeader(leader.leader)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all duration-200 group
                                            ${isActive
                                                ? 'bg-awb-red/10 border-awb-red/30 shadow-lg'
                                                : 't-card t-border hover:border-awb-red/20'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${catStyle.dot}`} />
                                                <span className={`text-sm font-bold uppercase tracking-tight truncate ${isActive ? 'text-awb-red' : 't-text group-hover:text-awb-red'} transition-colors`}>
                                                    {formatAsset(leader.leader)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${catStyle.bg} ${catStyle.text}`}>
                                                    {leader.follower_count}
                                                </span>
                                                <ChevronRight size={12} className={`${isActive ? 'text-awb-red' : 't-text-m'} transition-colors`} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 ml-4">
                                            <span className="text-[9px] font-bold t-text-m uppercase tracking-wider">
                                                WR: <span className={winRateColor(leader.avg_win_rate)}>{(leader.avg_win_rate * 100).toFixed(0)}%</span>
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

                    {/* Right Panel: Followers Detail */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-4">

                        {activeLeaderData ? (
                            <>
                                {/* Leader Summary Header */}
                                <div className="t-card t-border border rounded-xl p-5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-awb-red/10 border border-awb-red/20 flex items-center justify-center">
                                                <Crown size={20} className="text-awb-red" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black t-text uppercase tracking-tight">{formatAsset(selectedLeader)}</h3>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${getCatStyle(activeLeaderData.category).text}`}>
                                                    {activeLeaderData.category} • {data.label} Frequency
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="t-elevated t-border border rounded-lg px-4 py-2 text-center">
                                                <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Followers</div>
                                                <div className="text-xl font-black text-blue-400">{stats.totalFollowers}</div>
                                            </div>
                                            <div className="t-elevated t-border border rounded-lg px-4 py-2 text-center">
                                                <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Avg Win Rate</div>
                                                <div className={`text-xl font-black ${winRateColor(stats.avgWin)}`}>{(stats.avgWin * 100).toFixed(0)}%</div>
                                            </div>
                                            <div className="t-elevated t-border border rounded-lg px-4 py-2 text-center">
                                                <div className="text-[8px] font-bold t-text-m uppercase tracking-widest">Best Sharpe</div>
                                                <div className="text-xl font-black text-awb-gold">{stats.bestSharpe.toFixed(2)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sort Controls */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <Filter size={12} className="t-text-m" />
                                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest mr-1">Sort by:</span>
                                    {[
                                        { key: 'sharpe', label: 'Sharpe', icon: ShieldCheck },
                                        { key: 'winrate', label: 'Win Rate', icon: Target },
                                        { key: 'return', label: 'Return', icon: TrendingUp },
                                        { key: 'trades', label: 'Trades', icon: BarChart3 },
                                    ].map(s => (
                                        <button
                                            key={s.key}
                                            onClick={() => setSortBy(s.key)}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5
                                                ${sortBy === s.key
                                                    ? 'bg-awb-red text-white border-awb-red/30'
                                                    : 't-text-m border-white/10 hover:border-white/20'
                                                }`}
                                        >
                                            <s.icon size={10} />
                                            {s.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Followers Table */}
                                <div className="t-card rounded-2xl t-border border overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="t-text-m text-[9px] font-bold uppercase tracking-widest t-border border-b">
                                                    <th className="px-4 py-3">#</th>
                                                    <th className="px-4 py-3">Follower</th>
                                                    <th className="px-4 py-3 text-left">Strategy</th>
                                                    <th className="px-4 py-3 text-center">Lag</th>
                                                    <th className="px-4 py-3 text-right">Sharpe</th>
                                                    <th className="px-4 py-3 text-right">Ann. Return</th>
                                                    <th className="px-4 py-3 text-right">Max DD</th>
                                                    <th className="px-4 py-3 text-right">Win Rate</th>
                                                    <th className="px-4 py-3 text-right">Trades</th>
                                                    <th className="px-4 py-3 text-right">Won</th>
                                                    <th className="px-4 py-3 text-right">Lost</th>
                                                    <th className="px-4 py-3 text-right">Avg Hold</th>
                                                    <th className="px-4 py-3 text-right">Exit Breakdown</th>
                                                </tr>
                                            </thead>
                                            <tbody className="t-text text-xs divide-y divide-[var(--border-color)]">
                                                <AnimatePresence mode="popLayout">
                                                    {sortedFollowers.map((f, i) => {
                                                        const wr = f.Win_Rate || 0;
                                                        const sr = f.Sharpe_Ratio || 0;
                                                        const catStyle = getCatStyle(f.Cat_Follower || 'Other');
                                                        return (
                                                            <motion.tr
                                                                key={f.Follower}
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: i * 0.03 }}
                                                                className="hover:bg-[var(--surface-hover)] transition-colors"
                                                            >
                                                                <td className="px-4 py-3 font-mono text-[10px] t-text-m">{i + 1}</td>
                                                                <td className="px-4 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
                                                                        <span className="font-bold uppercase tracking-tight">{formatAsset(f.Follower)}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-left">
                                                                    <span className={`inline-flex px-1.5 py-0.5 tracking-widest text-[8px] font-black rounded ${f.Strategy === 'Stat-Arb' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                                                        {f.Strategy || 'Directional'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider t-elevated t-border border">
                                                                        <Clock size={10} />
                                                                        {getLagLabel(f)}
                                                                    </span>
                                                                </td>
                                                                <td className={`px-4 py-3 text-right font-mono font-bold ${sharpeColor(sr)}`}>
                                                                    {sr.toFixed(2)}
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-green-400">
                                                                    {((f.Annual_Return || 0) * 100).toFixed(1)}%
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono text-red-400 font-bold">
                                                                    <span className="flex items-center justify-end gap-1">
                                                                        <AlertTriangle size={10} />
                                                                        {((f.Max_Drawdown || 0) * 100).toFixed(1)}%
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <span className={`font-mono font-black ${winRateColor(wr)}`}>
                                                                        {(wr * 100).toFixed(1)}%
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-blue-400">{f.N_Trades || 0}</td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{f.Winning_Trades || 0}</td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-red-400">{f.Losing_Trades || 0}</td>
                                                                <td className="px-4 py-3 text-right font-mono text-xs t-text-m">
                                                                    {f.Avg_Hold_Days ? `${f.Avg_Hold_Days}d` : '—'}
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <div className="flex items-center justify-end gap-1 text-[9px] font-bold">
                                                                        <span title="Take Profit exits"
                                                                              className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 cursor-help">
                                                                            TP:{f.TP_Exits || 0}
                                                                        </span>
                                                                        <span title="Stop Loss exits"
                                                                              className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 cursor-help">
                                                                            SL:{f.SL_Exits || 0}
                                                                        </span>
                                                                        <span title="Leader Reversal exits"
                                                                              className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 cursor-help">
                                                                            LR:{f.Leader_Rev_Exits || 0}
                                                                        </span>
                                                                        <span title="Max Hold days reached"
                                                                              className="px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 cursor-help">
                                                                            MH:{f.MaxHold_Exits || 0}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </motion.tr>
                                                        );
                                                    })}
                                                </AnimatePresence>
                                            </tbody>
                                        </table>
                                        {sortedFollowers.length === 0 && (
                                            <div className="text-center py-16 t-text-m text-sm font-medium">
                                                No followers found for this leader at {data.label} frequency.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-24 t-card t-border border rounded-2xl gap-4">
                                <Crown size={36} className="t-text-m opacity-30" />
                                <p className="t-text-m text-sm font-bold uppercase tracking-widest">Select a leader from the left panel</p>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default TradingSignals;

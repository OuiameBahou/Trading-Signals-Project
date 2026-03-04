import React, { useState, useMemo } from 'react';
import {
    Database, TrendingUp, TrendingDown, Activity,
    X, ArrowUpRight, ArrowDownRight, Zap, BarChart3,
    ShieldCheck, Clock, Binary, ChevronRight, Search,
    Filter, Star
} from 'lucide-react';
import useFetch from '../hooks/useFetch';

/* ─────────────────────────────────────── helpers ─────────────────────── */

const CATEGORY_META = (isDark) => ({
    'Rates': { color: isDark ? 'text-sky-400' : 'text-sky-600', bg: isDark ? 'bg-sky-500/10' : 'bg-sky-500/10', border: isDark ? 'border-sky-500/20' : 'border-sky-500/20', dot: isDark ? '#38bdf8' : '#0284c7' },
    'Bonds': { color: isDark ? 'text-sky-400' : 'text-sky-600', bg: isDark ? 'bg-sky-500/10' : 'bg-sky-500/10', border: isDark ? 'border-sky-500/20' : 'border-sky-500/20', dot: isDark ? '#38bdf8' : '#0284c7' },
    'Commodities': { color: isDark ? 'text-amber-400' : 'text-amber-600', bg: isDark ? 'bg-amber-500/10' : 'bg-amber-500/10', border: isDark ? 'border-amber-500/20' : 'border-amber-500/20', dot: isDark ? '#fbbf24' : '#d97706' },
    'Commodites': { color: isDark ? 'text-amber-400' : 'text-amber-600', bg: isDark ? 'bg-amber-500/10' : 'bg-amber-500/10', border: isDark ? 'border-amber-500/20' : 'border-amber-500/20', dot: isDark ? '#fbbf24' : '#d97706' },
    'FX G10': { color: isDark ? 'text-violet-400' : 'text-violet-600', bg: isDark ? 'bg-violet-500/10' : 'bg-violet-500/10', border: isDark ? 'border-violet-500/20' : 'border-violet-500/20', dot: isDark ? '#a78bfa' : '#7c3aed' },
    'FX_G10': { color: isDark ? 'text-violet-400' : 'text-violet-600', bg: isDark ? 'bg-violet-500/10' : 'bg-violet-500/10', border: isDark ? 'border-violet-500/20' : 'border-violet-500/20', dot: isDark ? '#a78bfa' : '#7c3aed' },
    'Indices': { color: isDark ? 'text-emerald-400' : 'text-emerald-600', bg: isDark ? 'bg-emerald-500/10' : 'bg-emerald-500/10', border: isDark ? 'border-emerald-500/20' : 'border-emerald-500/20', dot: isDark ? '#34d399' : '#059669' },
    'Other': { color: isDark ? 'text-gray-400' : 'text-slate-500', bg: isDark ? 'bg-gray-500/10' : 'bg-slate-500/10', border: isDark ? 'border-gray-500/20' : 'border-slate-500/20', dot: isDark ? '#9ca3af' : '#64748b' },
});

const catStyle = (cat) => {
    const isDark = document.body.classList.contains('dark');
    const meta = CATEGORY_META(isDark);
    return meta[cat] || meta['Other'];
};

const RobustesseBadge = ({ r }) => {
    const isDark = !document.body.classList.contains('light-mode');
    const map = {
        'Forte': 'bg-awb-red text-white border-awb-red/20 shadow-awb-red/20',
        'Modérée': 'bg-awb-gold text-navy-900 border-awb-gold/20 shadow-awb-gold/10',
        'Faible': 'bg-gray-700 dark:bg-gray-700 light-mode:bg-slate-100 text-gray-300 dark:text-gray-300 light-mode:text-slate-500 border-white/5 dark:border-white/5 light-mode:border-slate-200',
    };
    return (
        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-lg border shadow-lg transition-all ${map[r] || map['Faible']}`}>
            {r}
        </span>
    );
};

const ScoreBar = ({ value }) => {
    const pct = Math.min(100, Math.round((value || 0) * 100));
    const isDark = !document.body.classList.contains('light-mode');
    const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f59e0b' : (isDark ? '#4b5563' : '#94a3b8');
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1.5 rounded-full bg-navy-900/60 dark:bg-white/5 light-mode:bg-slate-100 overflow-hidden shadow-inner border border-white/5 light-mode:border-slate-200">
                <div className="h-full rounded-full transition-all duration-[1500ms]" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-black font-mono w-8 text-right text-gray-500 dark:text-gray-500 light-mode:text-slate-400 transition-colors">{pct}%</span>
        </div>
    );
};

/* ─────────────────────────────────── Asset Detail Modal ──────────────── */

const formatAsset = (name) => {
    if (!name) return '—';
    return name.replace(/_/g, ' ');
};

const AssetModal = ({ asset, onClose }) => {
    const { data, loading } = useFetch(asset ? `/api/asset/${encodeURIComponent(asset.Asset)}` : null);
    const [tab, setTab] = useState('leaders');

    const list = tab === 'leaders' ? (data?.leaders || []) : (data?.followers || []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-3xl bg-black/70 dark:bg-black/90 light-mode:bg-slate-900/60 transition-all duration-700 animate-in fade-in"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div
                className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-[3.5rem] border border-white/10 dark:border-white/10 light-mode:border-slate-300 shadow-[0_80px_160px_-40px_rgba(0,0,0,0.9)] overflow-hidden bg-[#0c1219]/80 backdrop-blur-2xl transition-all duration-700 animate-in zoom-in-95"
            >
                {/* Modal Header */}
                <div className="flex items-start justify-between p-14 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-100 bg-white/[0.02] dark:bg-white/[0.01] light-mode:bg-white/95 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-awb-red/40 to-transparent" />

                    <div className="flex flex-col gap-4 relative z-10">
                        <div className="flex items-center gap-4 mb-2">
                            <div
                                className="w-4 h-4 rounded-full animate-pulse shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20"
                                style={{ backgroundColor: catStyle(asset.Category).dot }}
                            />
                            <span className={`text-[12px] font-black uppercase tracking-[0.5em] ${catStyle(asset.Category).color} opacity-80`}>
                                {asset.Category} Institutional Universe
                            </span>
                        </div>
                        <h3 className="text-6xl font-black tracking-tighter text-white dark:text-white light-mode:text-slate-900 transition-colors drop-shadow-2xl uppercase font-mono">{formatAsset(asset.Asset)}</h3>
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 mt-8">
                            <span className="flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.3em] text-emerald-400 bg-emerald-500/10 px-6 py-3 rounded-2xl border border-emerald-500/20 shadow-2xl transition-all hover:scale-105 hover:bg-emerald-500/20 cursor-default">
                                <TrendingUp size={20} className="animate-bounce-slow" /> Alpha Vector: {asset.Leader_Count}
                            </span>
                            <span className="flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.3em] text-blue-400 bg-blue-500/10 px-6 py-3 rounded-2xl border border-blue-500/20 shadow-2xl transition-all hover:scale-105 hover:bg-blue-500/20 cursor-default">
                                <TrendingDown size={20} className="rotate-180 animate-bounce-slow" /> Dependency: {asset.Follower_Count}
                            </span>
                            <div className="w-[1px] h-8 bg-white/10 mx-2" />
                            <span className="flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.3em] text-awb-gold bg-awb-gold/10 px-6 py-3 rounded-2xl border border-awb-gold/20 shadow-2xl transition-all hover:scale-105 hover:bg-awb-gold/20 cursor-default">
                                <Activity size={20} className="animate-pulse" /> {asset.Total_Relations} active
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-5 rounded-3xl bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 hover:bg-awb-red/10 dark:hover:bg-awb-red/10 light-mode:hover:bg-awb-red/5 border border-white/10 dark:border-white/10 light-mode:border-slate-200 text-gray-500 dark:text-gray-500 light-mode:text-slate-400 hover:text-awb-red transition-all shadow-3xl active:scale-95 group"
                    >
                        <X size={32} className="group-hover:rotate-90 transition-transform duration-700" />
                    </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-2 p-4 pb-0 bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50/50 border-b border-white/5 dark:border-white/5 light-mode:border-slate-100 transition-colors">
                    {[
                        { key: 'leaders', label: 'Predictions (Leading)', icon: <Zap size={14} />, count: data?.leaders?.length, active: 'bg-awb-red/10 border-awb-red/30 text-awb-red' },
                        { key: 'followers', label: 'Dependencies (Following)', icon: <ChevronRight size={14} />, count: data?.followers?.length, active: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-3 px-6 py-3 rounded-t-2xl text-[11px] font-black uppercase tracking-widest border-t border-x transition-all duration-300 ${tab === t.key
                                ? (t.key === 'leaders' ? 'bg-awb-red/10 border-awb-red/30 text-awb-red' : 'bg-blue-500/10 border-blue-500/30 text-blue-400')
                                : 'bg-transparent border-transparent text-gray-500 dark:text-gray-600 light-mode:text-slate-400 hover:text-gray-300 dark:hover:text-gray-300 light-mode:hover:text-slate-600'
                                }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.count !== undefined && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono transition-colors ${tab === t.key ? 'bg-white/10' : 'bg-navy-900/40 dark:bg-white/5 light-mode:bg-slate-200 text-gray-600'}`}>
                                    {t.count.toString().padStart(2, '0')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-16 bg-white/5 light-mode:bg-slate-100 rounded-2xl animate-pulse" />
                        ))
                    ) : list.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-gray-600 dark:text-gray-600 light-mode:text-slate-300 gap-3 transition-colors">
                            <Database size={28} className="opacity-20" />
                            <span className="text-[11px] font-black uppercase tracking-widest">
                                No {tab} found in official pairs
                            </span>
                        </div>
                    ) : (
                        list.map((item, idx) => {
                            const cs = catStyle(item.Category);
                            const isLeader = tab === 'leaders';
                            const isFaible = item.Robustesse === 'Faible';

                            /* Per-method chip configs */
                            const methods = [
                                {
                                    key: 'LAG',
                                    validated: item.Lag_Validated,
                                    icon: '～',
                                    label: 'Lag',
                                    hint: 'Cross-correlation',
                                    value: item.Best_AbsCorr
                                        ? (item.Best_AbsCorr * 100).toFixed(0) + '% corr'
                                        : 'no data',
                                    score: item.Score_Lag,
                                    activeCol: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 dark:text-emerald-300 light-mode:text-emerald-600',
                                    inactCol: 'bg-white/3 dark:bg-white/3 light-mode:bg-slate-100 border-white/5 dark:border-white/5 light-mode:border-slate-200 text-gray-700 dark:text-gray-700 light-mode:text-slate-300',
                                },
                                {
                                    key: 'GRANGER',
                                    validated: item.Granger_Validated,
                                    icon: 'G',
                                    label: 'Granger',
                                    hint: 'Granger causality',
                                    value: item.Granger_Fstat
                                        ? 'F=' + item.Granger_Fstat.toFixed(0)
                                        : '—',
                                    score: item.Score_Granger,
                                    activeCol: 'bg-blue-500/15 border-blue-500/40 text-blue-300 dark:text-blue-300 light-mode:text-blue-600',
                                    inactCol: 'bg-white/3 dark:bg-white/3 light-mode:bg-slate-100 border-white/5 dark:border-white/5 light-mode:border-slate-200 text-gray-700 dark:text-gray-700 light-mode:text-slate-300',
                                },
                                {
                                    key: 'VAR',
                                    validated: item.VAR_Validated,
                                    icon: 'V',
                                    label: 'VAR',
                                    hint: 'VAR impulse response',
                                    value: item.VAR_Impact
                                        ? item.VAR_Impact.toFixed(2) + ' IRF'
                                        : '—',
                                    score: item.Score_VAR,
                                    activeCol: 'bg-violet-500/15 border-violet-500/40 text-violet-300 dark:text-violet-300 light-mode:text-violet-600',
                                    inactCol: 'bg-white/3 dark:bg-white/3 light-mode:bg-slate-100 border-white/5 dark:border-white/5 light-mode:border-slate-200 text-gray-700 dark:text-gray-700 light-mode:text-slate-300',
                                },
                            ];

                            return (
                                <div
                                    key={idx}
                                    className={`flex flex-col gap-4 p-5 rounded-3xl border transition-all duration-300 group shadow-lg
                                        ${isFaible
                                            ? 'border-amber-500/15 bg-amber-500/[0.03] dark:bg-amber-500/[0.03] light-mode:bg-amber-500/[0.05] hover:border-amber-500/30'
                                            : 'border-white/5 dark:border-white/5 light-mode:border-slate-100 bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-white/40 hover:border-white/10 dark:hover:border-white/10 light-mode:hover:border-slate-200'}`}
                                >
                                    {/* ── top row: rank + asset + category + lag + overall score ── */}
                                    <div className="flex items-center gap-3">
                                        {/* Rank */}
                                        <div className="w-6 shrink-0 text-[10px] font-black font-mono text-gray-700 dark:text-gray-700 light-mode:text-slate-300 text-center transition-colors">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>

                                        {/* Direction icon */}
                                        <div className={`p-1.5 rounded-lg shrink-0 ${isLeader ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                            {isLeader ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                                        </div>

                                        {/* Name + badges */}
                                        <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="font-black text-white dark:text-white light-mode:text-slate-900 text-sm font-mono tracking-tight transition-colors">{formatAsset(item.Asset)}</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider border ${cs.bg} ${cs.color} ${cs.border} transition-colors`}>
                                                {item.Category}
                                            </span>
                                            <RobustesseBadge r={item.Robustesse} />
                                        </div>

                                        {/* Lag + overall score */}
                                        <div className="hidden sm:flex items-center gap-3 shrink-0">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-[8px] font-black text-gray-600 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.15em] transition-colors">Time Lag</span>
                                                <div className="flex items-center gap-1 text-awb-gold font-mono text-xs font-black drop-shadow-sm">
                                                    <Clock size={9} />
                                                    +{item.Lead_Days}d
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-[8px] font-black text-gray-600 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.15em] transition-colors">Score</span>
                                                <div className="flex items-center gap-1">
                                                    <ShieldCheck size={9} className={isFaible ? 'text-amber-500' : 'text-awb-red'} />
                                                    <span className={`text-xs font-black font-mono transition-colors ${isFaible ? 'text-amber-400' : 'text-white dark:text-white light-mode:text-slate-900'}`}>
                                                        {item.Score_Final ? (item.Score_Final * 100).toFixed(1) + '%' : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── method validation strip ── */}
                                    <div className="flex gap-2 pl-9">
                                        {methods.map(m => (
                                            <div
                                                key={m.key}
                                                title={m.hint}
                                                className={`flex-1 flex flex-col gap-1 px-3 py-2 rounded-xl border transition-all
                                                    ${m.validated ? m.activeCol : m.inactCol}`}
                                            >
                                                {/* Method name + checkmark */}
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${m.validated ? '' : 'opacity-40'}`}>
                                                        {m.key}
                                                    </span>
                                                    <span className={`text-[10px] font-black ${m.validated ? 'opacity-100' : 'opacity-20'}`}>
                                                        {m.validated ? '✓' : '✗'}
                                                    </span>
                                                </div>
                                                {/* Metric value */}
                                                <span className={`text-[10px] font-black font-mono ${m.validated ? 'text-white dark:text-white light-mode:text-slate-800' : 'text-gray-700 dark:text-gray-700 light-mode:text-slate-300'}`}>
                                                    {m.validated ? m.value : '—'}
                                                </span>
                                                {/* Individual score bar */}
                                                {m.validated && m.score != null && (
                                                    <div className="h-0.5 w-full rounded-full bg-white/10 light-mode:bg-slate-200 overflow-hidden mt-0.5">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${Math.min(100, (m.score * 100)).toFixed(0)}%`,
                                                                background: m.validated
                                                                    ? (m.key === 'LAG' ? '#34d399'
                                                                        : m.key === 'GRANGER' ? '#60a5fa'
                                                                            : '#a78bfa')
                                                                    : '#374151'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* ── Faible warning ── */}
                                    {isFaible && (
                                        <div className="pl-9 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/5 light-mode:bg-amber-500/10 border border-amber-500/15 light-mode:border-amber-500/20">
                                            <span className="text-amber-500 text-[10px] mt-0.5">⚠</span>
                                            <p className="text-[10px] text-amber-400/80 light-mode:text-amber-700/80 leading-relaxed transition-colors">
                                                <strong>Single-method signal</strong> — this relationship was confirmed only by {item.Lag_Validated ? 'Lag Correlation' : item.Granger_Validated ? 'Granger Causality' : 'VAR Analysis'}.
                                                Other statistical tests were executed but did not meet the required significance thresholds for a robust validation.
                                                Trade with extra caution.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer note */}
                <div className="px-6 py-3 border-t border-white/5 light-mode:border-slate-100 text-[9px] text-gray-600 dark:text-gray-600 light-mode:text-slate-400 font-bold uppercase tracking-wider transition-colors">
                    Source: official_leader_follower_pairs.csv · Sorted by Score_Final ↓ · Only statistically validated pairs
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────────────────── Main Page ───────────────────────── */

const CategoryPill = ({ cat, active, onClick }) => {
    const cs = catStyle(cat);
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${active
                ? `${cs.bg} ${cs.border} ${cs.color}`
                : 'bg-white/3 dark:bg-white/3 light-mode:bg-slate-100 border-white/5 dark:border-white/5 light-mode:border-slate-200 text-gray-600 dark:text-gray-600 light-mode:text-slate-400 hover:bg-white/8 dark:hover:bg-white/8 light-mode:hover:bg-slate-200 hover:text-gray-400 dark:hover:text-gray-400 light-mode:hover:text-slate-600'
                }`}
        >
            <span className="w-1.5 h-1.5 rounded-full transition-colors" style={{ backgroundColor: active ? cs.dot : '#4b5563' }} />
            {cat}
        </button>
    );
};

const AssetDirectory = () => {
    const { data: assets, loading, error } = useFetch('/api/assets');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    const categories = ['All', 'Rates', 'Commodities', 'FX G10', 'Indices'];

    const filtered = useMemo(() => {
        if (!assets) return [];
        const catMap = {
            'Rates': ['Rates', 'Bonds'],
            'Commodities': ['Commodities', 'Commodites'],
            'FX G10': ['FX G10', 'FX_G10'],
            'Indices': ['Indices']
        };
        return assets.filter(a => {
            const matchSearch = a.Asset.toLowerCase().includes(search.toLowerCase());
            let matchCat = activeCategory === 'All';
            if (activeCategory !== 'All') {
                const targets = catMap[activeCategory] || [activeCategory];
                matchCat = targets.includes(a.Category);
            }
            return matchSearch && matchCat;
        });
    }, [assets, search, activeCategory]);

    const stats = useMemo(() => {
        if (!assets) return {};
        const bycat = {};
        const catMap = {
            'Rates': ['Rates', 'Bonds'],
            'Commodities': ['Commodities', 'Commodites'],
            'FX G10': ['FX G10', 'FX_G10'],
            'Indices': ['Indices']
        };
        categories.slice(1).forEach(c => {
            const targets = catMap[c] || [c];
            bycat[c] = assets.filter(a => targets.includes(a.Category)).length;
        });
        return bycat;
    }, [assets]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-6">
            <div className="relative">
                <div className="w-12 h-12 border-2 border-slate-700 dark:border-slate-800 rounded-full" />
                <div className="absolute top-0 left-0 w-12 h-12 border-2 border-awb-red border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="text-gray-500 dark:text-gray-500 light-mode:text-slate-400 uppercase tracking-[0.3em] text-[10px] font-black animate-pulse transition-colors">
                Scanning Asset Universe
            </span>
        </div>
    );
    if (error) return (
        <div className="p-8 text-center text-awb-red font-bold">Error loading asset directory.</div>
    );

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* ── Header Section ── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 pb-14 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-100 transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 w-48 h-48 bg-awb-red/5 blur-[100px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

                <div className="flex flex-col gap-4 relative z-10">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.75rem] bg-awb-red/10 flex items-center justify-center shadow-[0_32px_64px_-16px_rgba(200,16,46,0.3)] border border-awb-red/20 group hover:scale-110 transition-transform duration-700">
                            <Database size={32} className="text-awb-red group-hover:rotate-12 transition-transform" />
                        </div>
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter text-white dark:text-white light-mode:text-slate-900 transition-all">
                                Asset <span className="text-awb-red">Universe</span> Directory
                            </h2>
                            <p className="text-gray-500 dark:text-gray-600 light-mode:text-slate-500 text-[11px] font-black uppercase tracking-[0.4em] leading-relaxed transition-all flex items-center gap-3 mt-2 opacity-80">
                                <ShieldCheck size={14} className="text-emerald-500 animate-pulse" /> institutional cross-asset ledger · {assets?.length || 39} Active Instruments Registered
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6 relative z-10">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-700 dark:text-gray-800 uppercase tracking-[0.3em] mb-1">Global Registry</span>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-white dark:text-white light-mode:text-slate-900 uppercase tracking-widest bg-white/5 dark:bg-white/5 light-mode:bg-slate-100 px-3 py-1 rounded-lg border border-white/5">v4.2.0-ELITE</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Category KPI Strip ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {categories.slice(1).map(cat => {
                    const cs = catStyle(cat);
                    const count = stats[cat] || 0;

                    const catMap = {
                        'Rates': ['Rates', 'Bonds'],
                        'Commodities': ['Commodities', 'Commodites'],
                        'FX G10': ['FX G10', 'FX_G10'],
                        'Indices': ['Indices']
                    };
                    const targets = catMap[cat] || [cat];
                    const active = assets?.filter(a => targets.includes(a.Category)) || [];

                    const totalLeader = active.reduce((s, a) => s + (a.Leader_Count || 0), 0);
                    const totalFollower = active.reduce((s, a) => s + (a.Follower_Count || 0), 0);
                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(activeCategory === cat ? 'All' : cat)}
                            className={`text-left p-10 rounded-[3rem] border transition-all hover:-translate-y-3 active:scale-98 relative overflow-hidden group/kpi ${activeCategory === cat
                                ? `${cs.bg} ${cs.border} shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)]`
                                : 'bg-[#0c1219]/20 dark:bg-[#0c1219]/20 light-mode:bg-white border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 hover:border-white/20 hover:bg-[#0c1219]/40 shadow-2xl'
                                }`}
                        >
                            <div className="absolute top-0 right-0 w-48 h-48 bg-current opacity-[0.03] blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover/kpi:opacity-10 transition-opacity duration-1000" style={{ color: cs.dot }} />

                            <div className="flex items-center justify-between mb-8 relative z-10">
                                <div className="p-4 rounded-[1.25rem] transition-all shadow-3xl bg-opacity-20 border border-current/10 group-hover/kpi:scale-110 group-hover/kpi:rotate-6 duration-500" style={{ backgroundColor: cs.bg, color: cs.dot }}>
                                    <Database size={24} />
                                </div>
                                <div className={`text-[10px] font-black uppercase tracking-[0.5em] transition-all ${cs.color} opacity-60 group-hover/kpi:opacity-100 group-hover/kpi:tracking-[0.6em]`}>{cat}</div>
                            </div>

                            <div className="text-6xl font-black text-white dark:text-white light-mode:text-slate-900 font-mono transition-all drop-shadow-3xl mb-6 group-hover/kpi:scale-105 origin-left">
                                {count.toString().padStart(2, '0')}
                            </div>

                            <div className="flex items-center gap-6 text-[11px] font-black text-gray-500 dark:text-gray-700 light-mode:text-slate-500 transition-all uppercase tracking-[0.3em] relative z-10">
                                <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/5 px-3 py-1.5 rounded-xl border border-emerald-500/10 transition-colors group-hover/kpi:bg-emerald-500/20">
                                    <TrendingUp size={14} /> {totalLeader}
                                </div>
                                <div className="flex items-center gap-2 text-blue-500 bg-blue-500/5 px-3 py-1.5 rounded-xl border border-blue-500/10 transition-colors group-hover/kpi:bg-blue-500/20">
                                    <TrendingDown size={14} /> {totalFollower}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Search + Filter Bar ── */}
            <div className="flex flex-col xl:flex-row gap-8 items-center">
                <div className="relative flex-1 group/search w-full">
                    <Search size={24} className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-700 light-mode:text-slate-400 group-focus-within/search:text-awb-red transition-all duration-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Institutional Database Query (e.g. SP500, GOLD, USDJPY)..."
                        className="w-full pl-20 pr-10 py-7 bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white border border-white/[0.1] dark:border-white/[0.1] light-mode:border-slate-200 rounded-[2.5rem] text-white dark:text-white light-mode:text-slate-900 text-base font-black placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-awb-red/20 transition-all shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] tracking-widest uppercase outline-none"
                    />
                </div>
                <div className="flex items-center gap-6 bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white border border-white/[0.1] dark:border-white/[0.1] light-mode:border-slate-200 p-3.5 rounded-[2.5rem] shadow-3xl backdrop-blur-3xl shrink-0">
                    <div className="px-6 border-r border-white/10">
                        <Filter size={22} className="text-gray-600 dark:text-gray-800 light-mode:text-slate-400 group-hover:rotate-12 transition-transform" />
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto max-w-[500px] scrollbar-hide py-1">
                        {categories.map(c => (
                            <CategoryPill
                                key={c}
                                cat={c}
                                active={activeCategory === c}
                                onClick={() => setActiveCategory(c)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="card overflow-hidden shadow-[0_128px_256px_-64px_rgba(0,0,0,0.9)] border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 transition-all rounded-[3.5rem] bg-[#0c1219]/10 backdrop-blur-3xl">
                <div className="px-14 py-12 bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white/50 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 flex items-center justify-between transition-all relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-awb-red/20 to-transparent" />
                    <div className="flex flex-col gap-3 relative z-10">
                        <span className="text-[12px] font-black text-gray-500 dark:text-gray-700 light-mode:text-slate-400 uppercase tracking-[0.5em] transition-all">
                            Institutional Alpha Matrix
                        </span>
                        <span className="text-gray-600 dark:text-gray-800 light-mode:text-slate-500 text-[11px] font-black uppercase tracking-[0.3em] opacity-60 flex items-center gap-4">
                            <span className="w-2 h-2 rounded-full bg-awb-red shadow-[0_0_12px_rgba(200,16,46,0.6)] animate-pulse" /> Analyzed {filtered.length} Live Global Vectors
                        </span>
                    </div>
                    <div className="flex items-center gap-10 relative z-10">
                        <div className="flex flex-col items-end gap-1.5 border-r border-white/10 pr-8">
                            <span className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em]">Elite Registry</span>
                            <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em] opacity-40">System-State Verified</span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[11px] font-black text-blue-500 uppercase tracking-[0.4em]">v4.2-GOLD</span>
                            <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em] opacity-40">Real-time Feed Active</span>
                        </div>
                    </div>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead className="text-[11px] text-gray-500 dark:text-gray-800 light-mode:text-slate-500 uppercase tracking-[0.5em] bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50/50 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 transition-colors">
                        <tr>
                            <th className="px-14 py-9 font-black w-24 text-center">Rank</th>
                            <th className="px-14 py-9 font-black">Instrument</th>
                            <th className="px-14 py-9 font-black">Market Family</th>
                            <th className="px-14 py-9 font-black text-center">Dominance</th>
                            <th className="px-14 py-9 font-black text-center">Dependency</th>
                            <th className="px-14 py-9 font-black text-right">Alpha Centrality</th>
                            <th className="px-14 py-9 font-black text-center w-24"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] dark:divide-white/[0.04] light-mode:divide-slate-100">
                        {filtered.map((asset, idx) => {
                            const cs = catStyle(asset.Category);
                            const netPositive = asset.Leader_Count >= asset.Follower_Count;
                            const hasConnections = asset.Total_Relations > 0;
                            return (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedAsset(asset)}
                                    className="hover:bg-white/[0.03] dark:hover:bg-white/[0.03] light-mode:hover:bg-slate-50 transition-all group cursor-pointer border-b border-white/[0.02] dark:border-white/[0.02] light-mode:border-slate-50 last:border-0 relative overflow-hidden"
                                >
                                    <td className="px-14 py-10 relative">
                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-awb-red scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                                        <div className="text-[13px] font-black text-gray-700 dark:text-gray-800 light-mode:text-slate-400 font-mono transition-all text-center group-hover:text-awb-red group-hover:scale-125">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>
                                    </td>
                                    <td className="px-14 py-10">
                                        <div className="flex items-center gap-8">
                                            <div className={`p-4.5 rounded-[1.25rem] ${cs.bg} ${cs.color} group-hover:scale-110 group-hover:rotate-12 transition-all shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] bg-opacity-30 border border-current/10 relative overflow-hidden`}>
                                                <Database size={28} />
                                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <span className="font-black text-white dark:text-white light-mode:text-slate-900 tracking-tight font-mono text-xl transition-all group-hover:text-awb-red uppercase">{formatAsset(asset.Asset)}</span>
                                                <span className="text-[11px] font-black text-gray-500 dark:text-gray-800 uppercase tracking-[0.4em] opacity-40 group-hover:opacity-100 transition-opacity">Global Instrument Ledger</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-14 py-10">
                                        <span className={`text-[11px] font-black px-5 py-2.5 rounded-2xl uppercase tracking-[0.3em] ${cs.bg} ${cs.color} ${cs.border} border shadow-2xl backdrop-blur-3xl group-hover:tracking-[0.4em] transition-all`}>
                                            {asset.Category}
                                        </span>
                                    </td>
                                    <td className="px-14 py-10 text-center">
                                        {asset.Leader_Count > 0 ? (
                                            <div className="inline-flex items-center gap-4 px-6 py-3 rounded-[1.25rem] bg-emerald-500/5 border border-emerald-500/10 text-emerald-500 font-mono text-lg font-black shadow-3xl group-hover:scale-110 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/30 transition-all">
                                                <TrendingUp size={20} className="animate-bounce-slow" />
                                                {asset.Leader_Count}
                                            </div>
                                        ) : (
                                            <span className="text-gray-800 dark:text-gray-900 font-mono text-sm font-black opacity-10 group-hover:opacity-20 transition-opacity uppercase tracking-widest">No Leader</span>
                                        )}
                                    </td>
                                    <td className="px-14 py-10 text-center">
                                        {asset.Follower_Count > 0 ? (
                                            <div className="inline-flex items-center gap-4 px-6 py-3 rounded-[1.25rem] bg-blue-500/5 border border-blue-500/10 text-blue-500 font-mono text-lg font-black shadow-3xl group-hover:scale-110 group-hover:bg-blue-500/15 group-hover:border-blue-500/30 transition-all">
                                                <TrendingDown size={20} className="rotate-180 animate-bounce-slow" />
                                                {asset.Follower_Count}
                                            </div>
                                        ) : (
                                            <span className="text-gray-800 dark:text-gray-900 font-mono text-sm font-black opacity-10 group-hover:opacity-20 transition-opacity uppercase tracking-widest">No Follower</span>
                                        )}
                                    </td>
                                    <td className="px-14 py-10 text-right">
                                        {hasConnections ? (
                                            <div className="flex items-center justify-end gap-8">
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className="font-black text-awb-gold text-3xl font-mono drop-shadow-[0_0_20px_rgba(255,184,28,0.4)] group-hover:scale-110 transition-transform">{asset.Total_Relations}</span>
                                                    <span className={`text-[10px] font-black uppercase tracking-[0.4em] px-3 py-1 rounded-lg ${netPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'} group-hover:tracking-[0.5em] transition-all`}>
                                                        {netPositive ? 'Alpha Leader' : 'Beta Follower'}
                                                    </span>
                                                </div>
                                                <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 opacity-40 group-hover:opacity-100 group-hover:scale-110 group-hover:border-awb-gold/30 transition-all shadow-3xl">
                                                    <Activity size={24} className="text-awb-gold animate-pulse" />
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-800 dark:text-gray-900 font-mono text-sm font-black opacity-10 group-hover:opacity-20 transition-opacity uppercase tracking-[0.3em]">Isolated</span>
                                        )}
                                    </td>
                                    <td className="px-14 py-10 text-center">
                                        <div className="p-4 rounded-full bg-white/[0.01] border border-white/[0.05] group-hover:bg-awb-red/10 group-hover:border-awb-red/30 transition-all group-hover:rotate-45 shadow-3xl">
                                            <ChevronRight size={28} className="text-gray-800 dark:text-gray-900 light-mode:text-slate-300 group-hover:text-awb-red transition-all" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filtered.length === 0 && (
                    <div className="p-12 flex flex-col items-center gap-3 text-gray-600">
                        <Search size={28} className="opacity-20" />
                        <span className="text-[10px] font-black uppercase tracking-widest">No instruments match your search</span>
                    </div>
                )}
            </div>

            {/* ── Asset Detail Modal ── */}
            {selectedAsset && (
                <AssetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
            )}
        </div>
    );
};

export default AssetDirectory;

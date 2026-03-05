import React, { useState, useMemo } from 'react';
import {
    Database, TrendingUp, TrendingDown, Activity,
    X, ArrowUpRight, ArrowDownRight, Zap, BarChart3,
    ShieldCheck, Clock, Binary, ChevronRight, Search,
    Filter, Star
} from 'lucide-react';
import useFetch from '../hooks/useFetch';

/* ─────────────────────────────────────── helpers ─────────────────────── */

const CATEGORY_META = {
    'Rates': { color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20', dot: '#0ea5e9' },
    'Bonds': { color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20', dot: '#0ea5e9' },
    'Commodities': { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: '#f59e0b' },
    'Commodites': { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: '#f59e0b' },
    'FX G10': { color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: '#8b5cf6' },
    'FX_G10': { color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: '#8b5cf6' },
    'Indices': { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: '#10b981' },
    'Other': { color: 't-text-m', bg: 't-card', border: 't-border border', dot: '#64748b' },
};

const catStyle = (cat) => CATEGORY_META[cat] || CATEGORY_META['Other'];

const RobustesseBadge = ({ r }) => {
    const map = {
        'Forte': 'bg-awb-red text-white border-awb-red/20 shadow-awb-red/20',
        'Modérée': 'bg-awb-gold text-white border-awb-gold/20 shadow-awb-gold/10',
        'Faible': 't-card t-text-m t-border border',
    };
    return (
        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-lg border shadow-lg transition-all ${map[r] || map['Faible']}`}>
            {r}
        </span>
    );
};

const ScoreBar = ({ value }) => {
    const pct = Math.min(100, Math.round((value || 0) * 100));
    const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f59e0b' : 'var(--text-muted)';
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1.5 rounded-full t-card overflow-hidden shadow-inner t-border border">
                <div className="h-full rounded-full transition-all duration-[1500ms]" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-black font-mono w-8 text-right t-text-m transition-colors">{pct}%</span>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm transition-colors"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div
                className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl t-border border overflow-hidden t-bg shadow-2xl transition-colors"
            >
                {/* Modal Header */}
                <div className="flex items-start justify-between p-10 t-border border-b t-elevated transition-colors">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4 mb-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: catStyle(asset.Category).dot }}
                            />
                            <span className={`text-[12px] font-bold uppercase tracking-widest ${catStyle(asset.Category).color}`}>
                                {asset.Category} Institutional Universe
                            </span>
                        </div>
                        <h3 className="text-3xl font-black t-text uppercase font-mono transition-colors">{formatAsset(asset.Asset)}</h3>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
                            <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                                <TrendingUp size={16} /> Alpha Vector: {asset.Leader_Count}
                            </span>
                            <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-blue-500 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20">
                                <TrendingDown size={16} className="rotate-180" /> Dependency: {asset.Follower_Count}
                            </span>
                            <div className="w-px h-6 t-border-s border-r mx-2" />
                            <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-awb-gold bg-awb-gold/10 px-4 py-2 rounded-xl border border-awb-gold/20">
                                <Activity size={16} /> {asset.Total_Relations} active
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-xl t-card hover:bg-[var(--surface-hover)] t-border border t-text-m hover:t-text transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-2 p-4 pb-0 t-bg t-border border-b transition-colors">
                    {[
                        { key: 'leaders', label: 'Predictions (Leading)', icon: <Zap size={14} />, count: data?.leaders?.length },
                        { key: 'followers', label: 'Dependencies (Following)', icon: <ChevronRight size={14} />, count: data?.followers?.length },
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-3 px-6 py-3 rounded-t-xl text-[11px] font-bold uppercase tracking-widest border-t border-x transition-colors ${tab === t.key
                                ? (t.key === 'leaders' ? 'bg-awb-red/10 border-awb-red/30 text-awb-red' : 'bg-blue-500/10 border-blue-500/30 text-blue-500')
                                : 'bg-transparent border-transparent t-text-m hover:t-text'
                                }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.count !== undefined && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${tab === t.key ? 'bg-white/10' : 't-border border t-text-m'}`}>
                                    {t.count.toString().padStart(2, '0')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 t-bg transition-colors">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-16 t-card rounded-xl animate-pulse t-border border transition-colors" />
                        ))
                    ) : list.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center t-text-m gap-3 transition-colors">
                            <Database size={28} className="opacity-20" />
                            <span className="text-[11px] font-bold uppercase tracking-widest">
                                No {tab} found in official pairs
                            </span>
                        </div>
                    ) : (
                        list.map((item, idx) => {
                            const cs = catStyle(item.Category);
                            const isLeader = tab === 'leaders';
                            const isFaible = item.Robustesse === 'Faible';

                            const methods = [
                                {
                                    key: 'LAG',
                                    validated: item.Lag_Validated,
                                    hint: 'Cross-correlation',
                                    value: item.Best_AbsCorr ? (item.Best_AbsCorr * 100).toFixed(0) + '% corr' : 'no data',
                                    score: item.Score_Lag,
                                    activeCol: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500',
                                    inactCol: 't-card t-border t-text-m',
                                },
                                {
                                    key: 'GRANGER',
                                    validated: item.Granger_Validated,
                                    hint: 'Granger causality',
                                    value: item.Granger_Fstat ? 'F=' + item.Granger_Fstat.toFixed(0) : '—',
                                    score: item.Score_Granger,
                                    activeCol: 'bg-blue-500/15 border-blue-500/40 text-blue-500',
                                    inactCol: 't-card t-border t-text-m',
                                },
                                {
                                    key: 'VAR',
                                    validated: item.VAR_Validated,
                                    hint: 'VAR impulse response',
                                    value: item.VAR_Impact ? item.VAR_Impact.toFixed(2) + ' IRF' : '—',
                                    score: item.Score_VAR,
                                    activeCol: 'bg-violet-500/15 border-violet-500/40 text-violet-500',
                                    inactCol: 't-card t-border t-text-m',
                                },
                            ];

                            return (
                                <div
                                    key={idx}
                                    className={`flex flex-col gap-4 p-5 rounded-xl border transition-colors ${isFaible ? 'border-amber-500/30 bg-amber-500/5' : 't-border t-elevated'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 shrink-0 text-[10px] font-bold font-mono t-text-m text-center transition-colors">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>
                                        <div className={`p-1.5 rounded-lg shrink-0 ${isLeader ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                            {isLeader ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                                        </div>
                                        <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="font-bold t-text text-sm font-mono tracking-tight transition-colors">{formatAsset(item.Asset)}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider border ${cs.bg} ${cs.color} ${cs.border}`}>
                                                {item.Category}
                                            </span>
                                            <RobustesseBadge r={item.Robustesse} />
                                        </div>
                                        <div className="hidden sm:flex items-center gap-3 shrink-0">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-[8px] font-bold t-text-s uppercase tracking-widest transition-colors">Lag</span>
                                                <div className="flex items-center gap-1 text-awb-gold font-mono text-xs font-bold">
                                                    <Clock size={9} />+{item.Lead_Days}d
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-[8px] font-bold t-text-s uppercase tracking-widest transition-colors">Score</span>
                                                <span className={`text-xs font-bold font-mono transition-colors ${isFaible ? 'text-amber-500' : 't-text'}`}>
                                                    {item.Score_Final ? (item.Score_Final * 100).toFixed(1) + '%' : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pl-9">
                                        {methods.map(m => (
                                            <div key={m.key} title={m.hint} className={`flex-1 flex flex-col gap-1 px-3 py-2 rounded-xl border ${m.validated ? m.activeCol : m.inactCol} transition-colors`}>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${m.validated ? '' : 'opacity-40'}`}>{m.key}</span>
                                                    <span className={`text-[10px] font-bold ${m.validated ? 'opacity-100' : 'opacity-20'}`}>{m.validated ? '✓' : '✗'}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold font-mono ${m.validated ? 't-text' : 't-text-m'} transition-colors`}>
                                                    {m.validated ? m.value : '—'}
                                                </span>
                                                {m.validated && m.score != null && (
                                                    <div className="h-0.5 w-full rounded-full t-border-s overflow-hidden mt-0.5 transition-colors">
                                                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.score * 100)).toFixed(0)}%`, background: m.key === 'LAG' ? '#34d399' : m.key === 'GRANGER' ? '#60a5fa' : '#a78bfa' }} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {isFaible && (
                                        <div className="pl-9 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                            <span className="text-amber-500 text-[10px] mt-0.5">⚠</span>
                                            <p className="text-[10px] text-amber-500/80 leading-relaxed font-bold">
                                                <strong>Single-method signal</strong> — confirmed only by {item.Lag_Validated ? 'Lag Correlation' : item.Granger_Validated ? 'Granger Causality' : 'VAR Analysis'}. Trade with extra caution.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer note */}
                <div className="px-6 py-3 t-border border-t text-[9px] t-text-m font-bold uppercase tracking-wider transition-colors">
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
                : 't-card t-border t-text-m hover:bg-[var(--surface-hover)] hover:t-text'
                }`}
        >
            <span className="w-1.5 h-1.5 rounded-full transition-colors" style={{ backgroundColor: active ? cs.dot : 'var(--text-muted)' }} />
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
                <div className="w-12 h-12 border-2 t-border rounded-full transition-colors" />
                <div className="absolute top-0 left-0 w-12 h-12 border-2 border-awb-red border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="t-text-m uppercase tracking-widest text-[10px] font-bold transition-colors">
                Scanning Asset Universe
            </span>
        </div>
    );
    if (error) return (
        <div className="p-8 text-center text-awb-red font-bold">Error loading asset directory.</div>
    );

    return (
        <div className="space-y-10 t-bg transition-colors">
            {/* ── Header Section ── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-8 t-border border-b transition-colors">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-xl bg-awb-red/10 flex items-center justify-center border border-awb-red/20">
                            <Database size={24} className="text-awb-red" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black t-text uppercase transition-colors">
                                Asset <span className="text-awb-red">Universe</span> Directory
                            </h2>
                            <p className="t-text-m text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 mt-1 transition-colors">
                                <ShieldCheck size={14} className="text-emerald-500" /> {assets?.length || 39} Active Instruments Registered
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold t-text-m uppercase tracking-widest t-card px-3 py-1 rounded-lg t-border border transition-colors">v4.2.0-ELITE</span>
                </div>
            </div>

            {/* ── Category KPI Strip ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                            className={`text-left p-4 rounded-xl border transition-colors ${activeCategory === cat
                                ? `${cs.bg} ${cs.border}`
                                : 't-card t-border hover:border-[var(--text-muted)]'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className={`p-2 rounded-lg border ${cs.bg} ${cs.border}`} style={{ color: cs.dot }}>
                                    <Database size={14} />
                                </div>
                                <div className={`text-[9px] font-bold uppercase tracking-widest ${cs.color}`}>{cat}</div>
                            </div>

                            <div className={`text-2xl font-black t-text font-mono mb-2 transition-colors`}>
                                {count.toString().padStart(2, '0')}
                            </div>

                            <div className="flex items-center gap-3 text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors">
                                <div className="flex items-center gap-1 text-emerald-500">
                                    <TrendingUp size={10} /> {totalLeader}
                                </div>
                                <div className="flex items-center gap-1 text-blue-500">
                                    <TrendingDown size={10} /> {totalFollower}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Search + Filter Bar ── */}
            <div className="flex flex-col xl:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 t-text-m group-focus-within:text-awb-red transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search instruments..."
                        className="w-full pl-14 pr-6 py-4 t-elevated t-border border rounded-xl t-text text-sm font-bold placeholder:t-text-m focus:outline-none focus:border-awb-red/30 transition-colors tracking-widest uppercase"
                    />
                </div>
                <div className="flex items-center gap-3 t-elevated t-border border p-2.5 rounded-xl shrink-0 transition-colors">
                    <div className="px-3 t-border-s border-r transition-colors">
                        <Filter size={16} className="t-text-m transition-colors" />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto max-w-[500px] py-1">
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

            <div className="t-card rounded-2xl overflow-hidden t-border border transition-colors">
                <div className="px-8 py-6 t-elevated t-border border-b flex items-center justify-between transition-colors">
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold t-text-m uppercase tracking-widest transition-colors">
                            Institutional Alpha Matrix
                        </span>
                        <span className="t-text-s text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full bg-awb-red" /> {filtered.length} Active Global Vectors
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end gap-1 t-border-s border-r pr-6 transition-colors">
                            <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest">Elite Registry</span>
                            <span className="text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors">System-State Verified</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">v4.2-GOLD</span>
                            <span className="text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors">Real-time Feed Active</span>
                        </div>
                    </div>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead className="text-[10px] t-text-m uppercase tracking-widest t-elevated t-border border-b font-bold transition-colors">
                        <tr>
                            <th className="px-5 py-3 text-center w-16">Rank</th>
                            <th className="px-5 py-3">Instrument</th>
                            <th className="px-5 py-3">Market Family</th>
                            <th className="px-5 py-3 text-center">Dominance</th>
                            <th className="px-5 py-3 text-center">Dependency</th>
                            <th className="px-5 py-3 text-right">Alpha Centrality</th>
                            <th className="px-5 py-3 text-center w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y t-border divide-y t-card transition-colors">
                        {filtered.map((asset, idx) => {
                            const cs = catStyle(asset.Category);
                            const netPositive = asset.Leader_Count >= asset.Follower_Count;
                            const hasConnections = asset.Total_Relations > 0;
                            return (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedAsset(asset)}
                                    className="hover:bg-[var(--surface-hover)] transition-colors group cursor-pointer last:border-0"
                                >
                                    <td className="px-5 py-3">
                                        <div className="text-[11px] font-bold t-text-m font-mono text-center group-hover:text-awb-red transition-colors">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg ${cs.bg} ${cs.color} border border-current/10`}>
                                                <Database size={13} />
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold t-text tracking-tight font-mono text-sm transition-colors group-hover:text-awb-red uppercase">{formatAsset(asset.Asset)}</span>
                                                <span className="text-[9px] font-bold t-text-m uppercase tracking-widest transition-colors">Global Instrument</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-widest ${cs.bg} ${cs.color} ${cs.border} border`}>
                                            {asset.Category}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {asset.Leader_Count > 0 ? (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-mono text-xs font-bold">
                                                <TrendingUp size={11} />
                                                {asset.Leader_Count}
                                            </div>
                                        ) : (
                                            <span className="t-text-s font-mono text-xs font-bold transition-colors">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {asset.Follower_Count > 0 ? (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 font-mono text-xs font-bold">
                                                <TrendingDown size={11} />
                                                {asset.Follower_Count}
                                            </div>
                                        ) : (
                                            <span className="t-text-s font-mono text-xs font-bold transition-colors">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {hasConnections ? (
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="font-bold text-awb-gold text-lg font-mono">{asset.Total_Relations}</span>
                                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${netPositive ? 'text-emerald-500' : 'text-blue-500'}`}>
                                                        {netPositive ? 'Alpha Leader' : 'Beta Follower'}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="t-text-s font-mono text-xs font-bold transition-colors">Isolated</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <div className="p-1.5 rounded-lg t-card t-border border group-hover:bg-awb-red/10 group-hover:border-awb-red/30 transition-colors inline-flex">
                                            <ChevronRight size={14} className="t-text-m group-hover:text-awb-red transition-colors" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filtered.length === 0 && (
                    <div className="p-12 flex flex-col items-center gap-3 t-text-m transition-colors">
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

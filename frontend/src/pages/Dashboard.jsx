import React, { useState, useMemo, useRef } from 'react';
import {
    Target, Layers, Zap, Award, Globe,
    ChevronRight, ArrowRight,
    ShieldCheck, Activity, BarChart2, Search,
    TrendingUp, GitBranch, FlaskConical, Target as TargetIcon, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useFetch from '../hooks/useFetch';
import PairDetailModal from '../components/PairDetailModal';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

// ─── Animated counter ──────────────────────────────────────────────────────────
const Counter = ({ value, duration = 1200 }) => {
    const [display, setDisplay] = React.useState(0);
    React.useEffect(() => {
        if (!value && value !== 0) return;
        const numeric = typeof value === 'number' ? value : null;
        if (numeric === null) { setDisplay(value); return; }
        let start = 0;
        const steps = 40;
        const increment = numeric / steps;
        const stepTime = duration / steps;
        const timer = setInterval(() => {
            start += increment;
            if (start >= numeric) { setDisplay(numeric); clearInterval(timer); }
            else setDisplay(Math.floor(start));
        }, stepTime);
        return () => clearInterval(timer);
    }, [value, duration]);
    return <>{display}</>;
};

// ─── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, accent, onClick, delay = 0 }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            onClick={onClick}
            className={`card p-6 flex flex-col gap-4 relative group transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-awb-red/30 hover:shadow-xl' : ''}`}
        >
            <div className="flex items-start justify-between">
                <div className="p-3 bg-navy-900/50 dark:bg-navy-900/50 light-mode:bg-slate-50 rounded-xl border border-white/5 light-mode:border-slate-100">
                    <Icon size={24} style={{ color: accent }} />
                </div>
                {onClick && (
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-awb-red/50 group-hover:bg-awb-red/5 transition-all">
                        <ArrowRight size={16} className="text-gray-500 group-hover:text-awb-red transition-all" />
                    </div>
                )}
            </div>

            <div>
                <div className="text-[10px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-widest mb-1.5">
                    {label}
                </div>
                <div className="text-3xl font-black text-white dark:text-white light-mode:text-slate-900 tracking-tight font-mono">
                    {value !== null && value !== undefined
                        ? <Counter value={value} />
                        : <span className="animate-pulse opacity-50">...</span>}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-700 light-mode:text-slate-500 mt-3 font-bold uppercase tracking-wider opacity-60">
                    {sub}
                </div>
            </div>
        </motion.div>
    );
};

// ─── Category badge ────────────────────────────────────────────────────────────
const CatBadge = ({ cat }) => {
    const isCrypto = cat?.toLowerCase() === 'crypto';
    return (
        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.25em] border shadow-2xl transition-all duration-700 hover:scale-110 active:scale-95 cursor-default flex items-center gap-3 backdrop-blur-3xl group/badge relative overflow-hidden ${isCrypto
            ? 'bg-awb-red/10 border-awb-red/30 text-awb-red shadow-awb-red/10'
            : 'bg-white/5 border-white/10 text-gray-400'
            }`}>
            <div className={`absolute inset-0 opacity-0 group-hover/badge:opacity-20 transition-opacity duration-700 ${isCrypto ? 'bg-awb-red' : 'bg-white'}`} />
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse-slow relative z-10 ${isCrypto ? 'bg-awb-red shadow-[0_0_10px_rgba(200,16,46,0.8)]' : 'bg-gray-500'}`} />
            <span className="relative z-10 drop-shadow-sm">{cat || 'Asset Class'}</span>
        </div>
    );
};

// ─── Robustness badge ──────────────────────────────────────────────────────────
const RobustnessBadge = ({ n }) => {
    const isTriple = n >= 3;
    const isDouble = n === 2;

    const colors = isTriple
        ? 'bg-awb-red/10 text-awb-red border-awb-red/20'
        : isDouble
            ? 'bg-awb-gold/10 text-awb-gold border-awb-gold/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

    const label = isTriple ? 'Triple Tier' : isDouble ? 'Double Layer' : 'Validated';
    const Icon = isTriple ? ShieldCheck : Activity;

    return (
        <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border flex items-center gap-2 ${colors}`}>
            <Icon size={12} />
            <span>{label}</span>
        </div>
    );
};

// ─── Live Signal Feed Component ──────────────────────────────────────────
const LiveSignalFeed = ({ onSelectPair }) => {
    const { data: topSignals, loading } = useFetch('/api/top_signals');
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = useMemo(() => {
        if (!topSignals) return [];
        if (!searchTerm) return topSignals;
        const q = searchTerm.toLowerCase();
        return topSignals.filter(p =>
            p.Leader?.toLowerCase().includes(q) ||
            p.Follower?.toLowerCase().includes(q)
        );
    }, [topSignals, searchTerm]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="card overflow-hidden"
        >
            <div className="px-6 py-5 border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-awb-red/10 rounded-xl border border-awb-red/20">
                        <Target size={18} className="text-awb-red" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white dark:text-white light-mode:text-slate-900 tracking-tight">Alpha Predictions</h3>
                        <p className="text-[9px] text-gray-600 dark:text-gray-600 light-mode:text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                            Real-time predictive intelligence · Top {filtered.length} triple-validated signals
                        </p>
                    </div>
                </div>
                <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search assets..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="bg-navy-900 dark:bg-navy-900 light-mode:bg-slate-50 border border-navy-700 dark:border-navy-700 light-mode:border-slate-200 rounded-full py-2.5 pl-10 pr-6 text-[11px] text-white dark:text-white light-mode:text-slate-900 w-64 focus:w-80 outline-none focus:ring-1 focus:ring-awb-red/30 transition-all font-bold uppercase tracking-widest"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-navy-900/50 dark:bg-navy-900/50 light-mode:bg-slate-50 border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-100 uppercase tracking-widest font-black text-[10px] text-gray-500 dark:text-gray-600 light-mode:text-slate-400">
                            <th className="px-6 py-4 w-12 text-center">#</th>
                            <th className="px-6 py-4">Vector Lead</th>
                            <th className="px-6 py-4">Follower</th>
                            <th className="px-6 py-4 text-center">Horizon</th>
                            <th className="px-6 py-4 text-center">Proof</th>
                            <th className="px-6 py-4">Composite</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [...Array(6)].map((_, i) => (
                                <tr key={i} className="border-b border-white/[0.03] light-mode:border-slate-50">
                                    <td colSpan={6} className="px-8 py-8">
                                        <div className="h-4 bg-white/[0.03] light-mode:bg-slate-100 rounded-full w-full animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : filtered.map((pair, idx) => (
                            <tr
                                key={idx}
                                onClick={() => onSelectPair(pair)}
                                className="border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-50 hover:bg-white/[0.02] dark:hover:bg-white/[0.02] light-mode:hover:bg-slate-50 transition-all group cursor-pointer"
                            >
                                <td className="px-6 py-4 text-[10px] font-black text-gray-700 dark:text-gray-800 light-mode:text-slate-300 font-mono text-center">{(idx + 1).toString().padStart(2, '0')}</td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-black text-white dark:text-white light-mode:text-slate-900 group-hover:text-awb-red transition-all">{formatAsset(pair.Leader)}</span>
                                        <CatBadge cat={pair.Cat_Leader} />
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold text-gray-300 dark:text-gray-400 light-mode:text-slate-600 transition-colors uppercase tracking-tight">{formatAsset(pair.Follower)}</span>
                                        <CatBadge cat={pair.Cat_Follower} />
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="inline-flex flex-col items-center">
                                        <span className="text-xs font-black text-awb-gold font-mono">+{pair.Lead_Days}d</span>
                                        <span className="text-[8px] text-gray-600 uppercase tracking-widest font-black">Horizon</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex justify-center">
                                        <RobustnessBadge n={pair.N_Methods} />
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-navy-900 dark:bg-navy-900 light-mode:bg-slate-100 rounded-full overflow-hidden border border-white/5 light-mode:border-slate-200">
                                            <div className="h-full bg-awb-red rounded-full transition-all duration-1000" style={{ width: `${(pair.Score_Final || 0) * 100}%` }} />
                                        </div>
                                        <span className="text-[11px] font-black text-awb-red font-mono">{((pair.Score_Final || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

const METHODS = [
    {
        id: 'lag',
        label: 'Cross-Corr',
        sublabel: 'Optimal lag cross-correlation',
        icon: TrendingUp,
        color: '#3b82f6',
        field: 'Lag_Significant',
        scoreField: 'Score_Lag',
    },
    {
        id: 'granger',
        label: 'Granger',
        sublabel: 'Granger causality test p < 0.05',
        icon: FlaskConical,
        color: '#a855f7',
        field: 'Granger_Significant',
        scoreField: 'Score_Granger',
    },
    {
        id: 'var',
        label: 'VAR / FEVD',
        sublabel: 'Vector autoregression decomposition',
        icon: GitBranch,
        color: '#10b981',
        field: 'VAR_Confirmed',
        scoreField: 'Score_VAR',
    },
];

// ─── Main Dashboard ────────────────────────────────────────────────────────────
const Dashboard = ({ summary, isLoading, onNavigate }) => {
    const { data: allPairs, loading: pairsLoading } = useFetch('/api/all_pairs');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPair, setSelectedPair] = useState(null);

    const elitePairs = useMemo(() => {
        if (!allPairs) return [];
        let hub = allPairs.filter(p => Number(p.N_Methods) === 3);
        if (!searchTerm) return hub;
        const q = searchTerm.toLowerCase();
        return hub.filter(p =>
            p.Leader?.toLowerCase().includes(q) ||
            p.Follower?.toLowerCase().includes(q)
        );
    }, [allPairs, searchTerm]);

    const kpis = [
        { label: 'Lead-Lag Universe', value: 1482, sub: 'Studied directional relations', icon: Layers, accent: '#3b82f6', onClick: () => onNavigate('asset-directory'), delay: 0.05 },
        { label: 'Granger Precedence', value: summary?.granger_significant ?? null, sub: 'Significant GC relations', icon: Zap, accent: '#a855f7', onClick: () => onNavigate('granger'), delay: 0.1 },
        { label: 'Triple Validated Vectors', value: summary?.official_pairs ?? null, sub: 'Passed Lag + GC + VAR', icon: Target, accent: '#C8102E', delay: 0.15 },
        { label: 'Top Leader', value: formatAsset(summary?.top_leader) ?? null, sub: summary?.top_leader_count ? `Dominance: Leads ${summary.top_leader_count} assets` : 'Highest market centrality', icon: Award, accent: '#FFB81C', onClick: () => onNavigate('network'), delay: 0.2 },
        { label: 'Coverage', value: summary?.assets_covered ?? null, sub: 'Cross-asset instruments', icon: Globe, accent: '#10b981', onClick: () => onNavigate('asset-directory'), delay: 0.25 },
    ];

    return (
        <div className="space-y-12 pb-24">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-navy-700 light-mode:border-slate-100 transition-colors"
            >
                <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-awb-red flex items-center justify-center shadow-lg shadow-awb-red/20 border border-white/20">
                        <Share2 size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black tracking-tight text-white dark:text-white light-mode:text-slate-900 transition-colors uppercase">
                            Intelligence <span className="text-awb-red">Center</span>
                        </h2>
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.4em] mt-1 opacity-60">Systemic Nexus v8.4</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Node Sync: 100%</span>
                        </div>
                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest opacity-40">Last Matrix Update: Just Now</p>
                    </div>
                </div>
            </motion.div>

            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="card p-6 h-32 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
                </div>
            )}

            {/* Elite Signal Hub */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="card overflow-hidden"
            >
                <div className="px-8 py-6 border-b border-navy-700 light-mode:border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-navy-900/30 dark:bg-navy-900/30 light-mode:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-6">
                        <div className="p-4 bg-awb-red/10 rounded-2xl border border-awb-red/20">
                            <Target size={28} className="text-awb-red" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-black text-white dark:text-white light-mode:text-slate-900 tracking-tight uppercase">Intelligence <span className="text-awb-red">Hub</span></h3>
                                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Active</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-700 light-mode:text-slate-500 font-black uppercase tracking-[0.3em] mt-2 opacity-80" >
                                Triple-Validated Institutional Lead-Lag Sequence
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-600" />
                            <input
                                type="text"
                                placeholder="Institutional Query..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="bg-navy-950 dark:bg-navy-950 light-mode:bg-white border border-navy-700 light-mode:border-slate-200 rounded-full py-3.5 pl-12 pr-6 text-[11px] text-white dark:text-white light-mode:text-slate-900 w-64 focus:w-80 outline-none focus:ring-1 focus:ring-awb-red/40 transition-all font-bold uppercase tracking-widest"
                            />
                        </div>
                        <div className="hidden lg:flex items-center gap-3 px-5 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                            <ShieldCheck size={18} className="text-emerald-500 opacity-60" />
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Elite Registry v4.2</span>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-[10px] text-gray-600 dark:text-gray-800 light-mode:text-slate-500 uppercase tracking-[0.4em] bg-navy-900/50 dark:bg-navy-900/50 light-mode:bg-slate-50 border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-100 transition-all font-black">
                            <tr>
                                <th className="px-8 py-6 text-center w-20">SEQ</th>
                                <th className="px-8 py-6">Alpha Prime</th>
                                <th className="px-8 py-6">Target Vector</th>
                                <th className="px-8 py-6 text-center">LAG/HORIZ</th>
                                <th className="px-8 py-6 text-center">PEARSON</th>
                                <th className="px-8 py-6 text-center">GRNG F</th>
                                <th className="px-8 py-6 text-center">VAR IMP</th>
                                <th className="px-8 py-6">QUALITATIVE SCORE</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] dark:divide-white/[0.04] light-mode:divide-slate-100">
                            {pairsLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="border-b border-white/[0.03] light-mode:border-slate-50">
                                        <td colSpan={8} className="px-5 py-14">
                                            <div className="h-6 bg-white/[0.03] light-mode:bg-slate-100 rounded-full animate-pulse mx-auto opacity-20" style={{ width: '80%' }} />
                                        </td>
                                    </tr>
                                ))
                            ) : elitePairs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-6 opacity-40">
                                            <FlaskConical size={48} className="text-gray-600 animate-pulse" />
                                            <div>
                                                <p className="text-gray-400 dark:text-gray-400 light-mode:text-slate-500 text-sm font-black uppercase tracking-[0.3em]">No Elite Vectors Detected</p>
                                                <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-2">Institutional parameters strictly enforced</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : elitePairs.map((pair, idx) => (
                                <motion.tr
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.05 * Math.min(idx, 10), duration: 0.5 }}
                                    onClick={() => setSelectedPair(pair)}
                                    className="border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-50 hover:bg-white/[0.02] dark:hover:bg-white/[0.02] light-mode:hover:bg-slate-50 transition-all group cursor-pointer last:border-0"
                                >
                                    <td className="px-8 py-6 text-[11px] font-black text-gray-700 dark:text-gray-800 light-mode:text-slate-400 font-mono text-center">
                                        <span className="bg-navy-900 dark:bg-navy-900 light-mode:bg-slate-50 px-3 py-1.5 rounded-lg border border-white/5 dark:border-white/5 light-mode:border-slate-200 group-hover:text-awb-red transition-all">{(idx + 1).toString().padStart(3, '0')}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-lg font-black text-white dark:text-white light-mode:text-slate-900 group-hover:text-awb-red transition-all uppercase font-mono tracking-tighter">{formatAsset(pair.Leader)}</span>
                                            <CatBadge cat={pair.Cat_Leader} />
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-base font-bold text-gray-400 dark:text-gray-600 light-mode:text-slate-500 transition-colors uppercase font-mono">{formatAsset(pair.Follower)}</span>
                                            <CatBadge cat={pair.Cat_Follower} />
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="inline-flex flex-col items-center">
                                            <span className="text-base font-black text-awb-gold font-mono">+{pair.Lead_Days}D</span>
                                            <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest mt-1">Horizon</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center font-mono text-blue-400 font-black">{(pair.Best_AbsCorr * 100).toFixed(1)}%</td>
                                    <td className="px-8 py-6 text-center font-mono text-purple-400 font-black">{(pair.Granger_Fstat || 0).toFixed(1)}</td>
                                    <td className="px-8 py-6 text-center font-mono text-emerald-400 font-black">{(pair.VAR_Impact || 0).toFixed(3)}</td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 h-2 bg-navy-950 dark:bg-navy-950 light-mode:bg-slate-100 rounded-full overflow-hidden border border-white/5 light-mode:border-slate-200 relative">
                                                <div className="h-full bg-awb-red rounded-full transition-all duration-[2000ms]"
                                                    style={{ width: `${(pair.Score_Final || 0) * 100}%` }} />
                                            </div>
                                            <span className="text-[14px] font-black text-awb-red font-mono w-12 text-right">
                                                {((pair.Score_Final || 0) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-8 py-6 bg-navy-900/50 dark:bg-navy-900/50 light-mode:bg-slate-50/50 border-t border-navy-700 dark:border-navy-700 light-mode:border-slate-100 flex flex-wrap items-center gap-x-12 gap-y-4 transition-colors">
                    <div className="flex items-center gap-3">
                        <Activity size={14} className="text-blue-400 opacity-60" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-700 light-mode:text-slate-500" >Lag Correlation &gt; 0.35</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Zap size={14} className="text-purple-400 opacity-60" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-700 light-mode:text-slate-500" >Granger F-Stat &gt; 20.0</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <GitBranch size={14} className="text-emerald-400 opacity-60" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-700 light-mode:text-slate-500" >VAR FEVD Impact &gt; 0.20</span>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                    { id: 'correlation', title: 'Correlation Matrix', desc: 'Cross-asset rolling heatmaps', icon: BarChart2, color: '#3b82f6' },
                    { id: 'network', title: 'Leadership Network', desc: 'D3 Vector influence topology', icon: Activity, color: '#a855f7' },
                ].map((item, i) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        onClick={() => onNavigate(item.id)}
                        className="card p-8 flex items-center justify-between cursor-pointer group transition-all duration-300 hover:border-awb-red/30 hover:shadow-2xl"
                    >
                        <div className="flex items-center gap-8">
                            <div className="p-5 rounded-2xl bg-navy-900/50 dark:bg-navy-900/50 light-mode:bg-slate-50 border border-white/5 dark:border-white/5 light-mode:border-slate-100 group-hover:scale-110 transition-transform">
                                <item.icon size={32} style={{ color: item.color }} />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900 transition-colors uppercase tracking-tight">{item.title}</h4>
                                <p className="text-[11px] text-gray-600 dark:text-gray-600 light-mode:text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-60">{item.desc}</p>
                            </div>
                        </div>

                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-awb-red/50 group-hover:bg-awb-red/5 transition-all">
                            <ArrowRight size={20} className="text-gray-700 group-hover:text-awb-red transition-all" />
                        </div>
                    </motion.div>
                ))}
            </div>

            <PairDetailModal pair={selectedPair} onClose={() => setSelectedPair(null)} />
        </div>
    );
};

export default Dashboard;

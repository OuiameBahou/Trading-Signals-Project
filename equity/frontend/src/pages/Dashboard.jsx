import React, { useState, useMemo } from 'react';
import {
    Target, Layers, Zap, Award, Globe,
    ArrowRight, ShieldCheck, Activity, BarChart2, Search,
    TrendingUp, GitBranch, FlaskConical, Share2, ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import useFetch from '../hooks/useFetch';
import PairDetailModal from '../components/PairDetailModal';

const CATEGORY_COLORS = {
    'Rates': { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    'Bonds': { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    'Commodities': { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    'Commodites': { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    'FX G10': { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    'FX_G10': { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    'Indices': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Other': { text: 't-text-m', bg: 't-elevated', border: 't-border' }
};
const getCategoryStyles = (cat) => CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other'];
const formatAsset = (name) => { if (!name) return '—'; return String(name).replace(/_/g, ' '); };

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

const KpiCard = ({ label, value, sub, icon: Icon, accent, onClick, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        onClick={onClick}
        className={`card p-6 flex flex-col gap-4 relative group transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-awb-red/30 hover:shadow-xl' : ''}`}
    >
        <div className="flex items-start justify-between">
            <div className="p-3 t-elevated rounded-xl t-border-s border">
                <Icon size={24} style={{ color: accent }} />
            </div>
            {onClick && (
                <div className="w-8 h-8 rounded-lg t-border-s border flex items-center justify-center group-hover:border-awb-red/50 group-hover:bg-awb-red/5 transition-all">
                    <ArrowRight size={16} className="t-text-m group-hover:text-awb-red transition-all" />
                </div>
            )}
        </div>
        <div>
            <div className="text-[10px] font-black t-text-m uppercase tracking-widest mb-1.5 transition-colors">{label}</div>
            <div className="text-3xl font-black tracking-tight font-mono transition-colors" style={{ color: accent }}>
                {value !== null && value !== undefined
                    ? <Counter value={value} />
                    : <span className="animate-pulse opacity-50">...</span>}
            </div>
            <div className="text-[11px] t-text-m mt-3 font-bold uppercase tracking-wider opacity-60 transition-colors">{sub}</div>
        </div>
    </motion.div>
);

const CatBadge = ({ cat }) => {
    const styles = getCategoryStyles(cat);
    return (
        <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border flex items-center gap-1.5 transition-colors ${styles.bg} ${styles.border} ${styles.text}`}>
            {cat || 'Asset Class'}
        </div>
    );
};

const Dashboard = ({ summary, isLoading, onNavigate }) => {
    const { data: rawAllPairs, loading: pairsLoading } = useFetch('/api/all_pairs');
    
    const allPairs = useMemo(() => {
        if (!rawAllPairs) return [];
        return Array.isArray(rawAllPairs) ? rawAllPairs : (rawAllPairs.value || []);
    }, [rawAllPairs]);
    
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
        {
            label: 'Lead-Lag Universe',
            value: 1482,
            sub: 'Studied directional relations',
            icon: Layers,
            accent: '#3b82f6',
            onClick: () => onNavigate('asset-directory'),
            delay: 0.05
        },
        {
            label: 'Validated Pairs',
            value: summary?.total_validated ?? null,
            sub: 'Across all validation tiers',
            icon: ShieldCheck,
            accent: '#a855f7',
            onClick: () => onNavigate('signals'),
            delay: 0.1
        },
        {
            label: 'Triple Validated',
            value: summary?.official_pairs ?? null,
            sub: 'Confirmed by Lag + Granger + VAR',
            icon: Target,
            accent: '#C8102E',
            onClick: () => onNavigate('signals'),
            delay: 0.15
        },
        {
            label: 'Top Leader',
            value: formatAsset(summary?.top_leader) ?? null,
            sub: summary?.top_leader_count ? `Leads ${summary.top_leader_count} validated assets` : 'Highest causal centrality',
            icon: Award,
            accent: '#FFB81C',
            onClick: () => onNavigate('asset-directory'),
            delay: 0.2
        },
        {
            label: 'Coverage',
            value: summary?.assets_covered ?? null,
            sub: 'Cross-asset instruments',
            icon: Globe,
            accent: '#10b981',
            onClick: () => onNavigate('asset-directory'),
            delay: 0.25
        },
    ];

    return (
        <div className="space-y-12 pb-24 t-bg transition-colors">

            {/* ── Header ── */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="flex items-center justify-between pb-8 t-border border-b transition-colors"
            >
                <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-awb-red flex items-center justify-center">
                        <Share2 size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black t-text uppercase transition-colors">
                            Intelligence <span className="text-awb-red">Center</span>
                        </h2>
                        <p className="text-[11px] font-bold t-text-m uppercase tracking-[0.3em] mt-1 transition-colors">
                            Cross-Asset Lead-Lag Analytics Platform
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                </div>
            </motion.div>

            {/* ── KPIs ── */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => <div key={i} className="card p-6 h-32 animate-pulse" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
                </div>
            )}

            {/* ── Triple Validated Pairs Table ── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="card overflow-hidden t-border border transition-colors"
            >
                {/* Table header */}
                <div className="px-8 py-6 t-border border-b flex flex-col md:flex-row md:items-center justify-between gap-6 t-elevated transition-colors">
                    <div className="flex items-center gap-6">
                        <div className="p-4 bg-awb-red/10 rounded-2xl border border-awb-red/20">
                            <ShieldCheck size={28} className="text-awb-red" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-black t-text uppercase transition-colors">
                                    Triple Validated <span className="text-awb-red">Pairs</span>
                                </h3>
                                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                                </div>
                            </div>
                            <p className="text-[10px] t-text-m font-bold uppercase tracking-[0.3em] mt-2 transition-colors">
                                Confirmed by Lag Correlation · Granger Causality · VAR/FEVD
                            </p>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 t-text-m transition-colors" />
                        <input
                            type="text"
                            placeholder="Search leader or follower..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="t-input t-border border rounded-lg py-3 pl-12 pr-6 text-[11px] t-text w-80 focus:outline-none focus:border-awb-red/40 transition-colors font-bold uppercase tracking-widest placeholder:t-text-m"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-[10px] t-text-m uppercase tracking-widest t-elevated t-border border-b font-bold transition-colors">
                            <tr>
                                <th className="px-4 py-3 text-center w-16">Seq</th>
                                <th className="px-4 py-3">Leader</th>
                                <th className="px-4 py-3">Follower</th>
                                <th className="px-4 py-3 text-center">Lag</th>
                                <th className="px-4 py-3 text-center">Pearson</th>
                                <th className="px-4 py-3 text-center">
                                    <div className="flex flex-col items-center">
                                        <span>GRANGER</span>
                                        <span className="text-[8px] font-normal normal-case tracking-normal t-text-s">p &lt; 0.05 = significant</span>
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-center">VAR Imp</th>
                                <th className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span>SCORE</span>
                                        <span className="text-[8px] t-text-s font-normal normal-case tracking-normal">Lag + Granger + VAR</span>
                                    </div>
                                </th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y t-border divide-y t-card transition-colors">
                            {pairsLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="t-border border-b transition-colors">
                                        <td colSpan={9} className="px-5 py-14">
                                            <div className="h-4 t-elevated rounded-full mx-auto transition-colors" style={{ width: '80%' }} />
                                        </td>
                                    </tr>
                                ))
                            ) : elitePairs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-6 opacity-60">
                                            <FlaskConical size={48} className="t-text-m transition-colors" />
                                            <p className="t-text-m text-sm font-bold uppercase tracking-[0.3em] transition-colors">No pairs match your search</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : elitePairs.map((pair, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedPair(pair)}
                                    className="t-border border-b hover:bg-[var(--surface-hover)] transition-colors group cursor-pointer last:border-0"
                                >
                                    <td className="px-4 py-3 text-[11px] font-bold t-text-m font-mono text-center transition-colors">
                                        <span className="t-elevated px-2 py-1 rounded-lg t-border border group-hover:text-awb-red transition-colors">
                                            {(idx + 1).toString().padStart(3, '0')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-sm font-bold t-text group-hover:text-awb-red transition-colors uppercase font-mono tracking-tight">
                                                {formatAsset(pair.Leader)}
                                            </span>
                                            <CatBadge cat={pair.Cat_Leader} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-sm font-bold t-text-m uppercase font-mono tracking-tight transition-colors">
                                                {formatAsset(pair.Follower)}
                                            </span>
                                            <CatBadge cat={pair.Cat_Follower} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="inline-flex flex-col items-center">
                                            <span className="text-sm font-bold text-awb-gold font-mono">+{pair.Lead_Days}D</span>
                                            <span className="text-[9px] t-text-m font-bold uppercase tracking-widest transition-colors">Horizon</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono text-blue-400 font-bold text-sm">
                                        {(pair.Best_AbsCorr * 100).toFixed(1)}%
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`font-mono font-bold text-sm ${
                                            (pair.Granger_P_Corrected || 1) < 0.05
                                                ? 'text-emerald-400'
                                                : 'text-red-400'
                                        }`}>
                                            {(pair.Granger_P_Corrected || 1) < 0.001
                                                ? 'p < 0.001'
                                                : `p = ${(pair.Granger_P_Corrected || 1).toFixed(3)}`}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono text-emerald-400 font-bold text-sm">
                                        {(pair.VAR_Impact || 0).toFixed(3)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-1.5 t-elevated rounded-full overflow-hidden t-border border transition-colors">
                                                <div className="h-full bg-awb-red rounded-full transition-all" style={{ width: `${(pair.Score_Final || 0) * 100}%` }} />
                                            </div>
                                            <span className="text-sm font-bold text-awb-red font-mono w-12 text-right">
                                                {((pair.Score_Final || 0) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </td>
                                    {/* Arrow on hover */}
                                    <td className="px-2 py-3">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-awb-red/10 border border-awb-red/20">
                                            <ChevronRight size={14} className="text-awb-red" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-8 py-5 t-elevated t-border border-t flex flex-wrap items-center gap-x-10 gap-y-3 transition-colors">
                    <div className="flex items-center gap-2.5">
                        <Activity size={13} className="text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest t-text-m transition-colors">Pearson Correlation &ge; 0.55</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Zap size={13} className="text-purple-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest t-text-m transition-colors">Granger P-Value &lt; 0.05</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <GitBranch size={13} className="text-emerald-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest t-text-m transition-colors">VAR Asymmetry Verified</span>
                    </div>
                </div>
            </motion.div>

            {/* ── Quick nav cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                    { id: 'correlation', title: 'Correlation Matrix', desc: 'Cross-asset Pearson heatmap', icon: BarChart2, color: '#3b82f6' },
                    { id: 'network', title: 'Leadership Network', desc: 'Asset influence topology graph', icon: Activity, color: '#a855f7' },
                ].map((item, i) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        onClick={() => onNavigate(item.id)}
                        className="card p-5 flex items-center justify-between cursor-pointer group hover:border-awb-red/30 transition-colors"
                    >
                        <div className="flex items-center gap-5">
                            <div className="p-3.5 rounded-xl t-elevated t-border-s border group-hover:scale-105 transition-all">
                                <item.icon size={24} style={{ color: item.color }} />
                            </div>
                            <div>
                                <h4 className="text-lg font-black t-text uppercase tracking-tight transition-colors">{item.title}</h4>
                                <p className="text-[10px] t-text-m font-bold uppercase tracking-widest mt-0.5 opacity-60 transition-colors">{item.desc}</p>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-lg t-border border border-white/10 group-hover:border-awb-red/50 group-hover:bg-awb-red/5 transition-all flex items-center justify-center">
                            <ArrowRight size={18} className="t-text-m group-hover:text-awb-red transition-all" />
                        </div>
                    </motion.div>
                ))}
            </div>

            <PairDetailModal pair={selectedPair} onClose={() => setSelectedPair(null)} />
        </div>
    );
};

export default Dashboard;

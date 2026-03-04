import React, { useState, useMemo } from 'react';
import {
    Search,
    ChevronUp,
    ChevronDown,
    ArrowRight,
    Target,
    ShieldCheck,
    BarChart2,
    Filter,
    TrendingUp
} from 'lucide-react';
import useFetch from '../hooks/useFetch';
import PairDetailModal from '../components/PairDetailModal';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

const OfficialPairs = () => {
    const { data: pairs, loading, error } = useFetch('/api/pairs');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'Score_Final', direction: 'desc' });
    const [selectedPair, setSelectedPair] = useState(null);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedPairs = useMemo(() => {
        if (!pairs) return [];

        let result = pairs.filter(p =>
            p.Leader.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.Follower.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (sortConfig.key) {
            result.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return result;
    }, [pairs, searchTerm, sortConfig]);

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ChevronDown size={14} className="opacity-20" />;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-awb-red" /> : <ChevronDown size={14} className="text-awb-red" />;
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* ── Header Section ── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 pb-14 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-100 transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 w-48 h-48 bg-awb-red/5 blur-[100px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

                <div className="flex flex-col gap-4 relative z-10">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.75rem] bg-awb-red/10 flex items-center justify-center shadow-[0_32px_64px_-16px_rgba(200,16,46,0.3)] border border-awb-red/20 group hover:scale-110 transition-transform duration-700">
                            <Target size={32} className="text-awb-red group-hover:rotate-12 transition-transform" />
                        </div>
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter text-white dark:text-white light-mode:text-slate-900 transition-all">
                                Institutional <span className="text-awb-red">Vector</span> Registry
                            </h2>
                            <p className="text-gray-500 dark:text-gray-600 light-mode:text-slate-500 text-[11px] font-black uppercase tracking-[0.4em] leading-relaxed transition-all flex items-center gap-3 mt-2 opacity-80">
                                <ShieldCheck size={14} className="text-emerald-500 animate-pulse" /> Certified Alpha Mappings · {filteredAndSortedPairs.length} Active Pair Matrices
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 relative z-10">
                    <div className="relative group/search">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-700 light-mode:text-slate-400 group-focus-within/search:text-awb-red transition-all duration-500" size={20} />
                        <input
                            type="text"
                            placeholder="Institutional Alpha Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white border border-white/[0.1] dark:border-white/[0.1] light-mode:border-slate-200 rounded-[2rem] py-5.5 pl-16 pr-10 text-sm text-white dark:text-white light-mode:text-slate-900 w-[450px] focus:outline-none focus:ring-2 focus:ring-awb-red/30 focus:border-awb-red/30 transition-all shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] font-black placeholder-gray-600 tracking-widest uppercase outline-none"
                        />
                    </div>
                    <button className="p-5.5 rounded-[2rem] bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white border border-white/[0.1] dark:border-white/[0.1] light-mode:border-slate-200 text-gray-500 dark:text-gray-700 light-mode:text-slate-400 hover:text-white dark:hover:text-white light-mode:hover:text-slate-900 transition-all shadow-3xl active:scale-90 group backdrop-blur-xl">
                        <Filter size={24} className="group-hover:rotate-12 transition-transform duration-500" />
                    </button>
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-gray-600 dark:text-gray-700 px-4 py-2 border-l border-white/5 opacity-40">
                        Top {Math.min(filteredAndSortedPairs.length, 100)} Elite Nodes
                    </div>
                </div>
            </div>

            <div className="card shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-[3.5rem] border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 bg-[#0c1219]/20 backdrop-blur-3xl transition-all">
                <div className="overflow-x-auto relative z-10">
                    <table className="w-full text-left border-collapse">
                        <thead className="text-[11px] text-gray-500 dark:text-gray-700 light-mode:text-slate-500 uppercase tracking-[0.4em] bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50/50 border-b border-white/[0.08] dark:border-white/[0.08] light-mode:border-slate-200 transition-colors">
                            <tr>
                                <th className="px-12 py-8 font-black">Instrument Leader</th>
                                <th className="px-12 py-8 font-black text-center w-24">Vector</th>
                                <th className="px-12 py-8 font-black">Target Receiver</th>
                                <th
                                    className="px-12 py-8 font-black cursor-pointer hover:text-awb-red transition-all group/th"
                                    onClick={() => requestSort('Best_AbsCorr')}
                                >
                                    <div className="flex items-center gap-4 transition-transform group-hover/th:translate-x-1">Correlation <SortIcon column="Best_AbsCorr" /></div>
                                </th>
                                <th
                                    className="px-12 py-8 font-black cursor-pointer hover:text-awb-red transition-all text-center group/th"
                                    onClick={() => requestSort('Lead_Days')}
                                >
                                    <div className="flex items-center justify-center gap-4 transition-transform group-hover/th:scale-105">Lag Horizon <SortIcon column="Lead_Days" /></div>
                                </th>
                                <th
                                    className="px-12 py-8 font-black cursor-pointer hover:text-awb-red transition-all group/th"
                                    onClick={() => requestSort('Lag_Gain')}
                                >
                                    <div className="flex items-center gap-4 transition-transform group-hover/th:translate-x-1">Alpha Gain <SortIcon column="Lag_Gain" /></div>
                                </th>
                                <th
                                    className="px-12 py-8 font-black cursor-pointer hover:text-awb-red transition-all group/th"
                                    onClick={() => requestSort('Score_Final')}
                                >
                                    <div className="flex items-center gap-4 transition-transform group-hover/th:translate-x-1">Elite Alpha Score <SortIcon column="Score_Final" /></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] dark:divide-white/[0.04] light-mode:divide-slate-100">
                            {loading ? (
                                [1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                    <tr key={i} className="border-b border-white/[0.02] animate-pulse">
                                        <td className="px-12 py-10"><div className="h-4 bg-white/5 rounded-full w-48 opacity-20"></div></td>
                                        <td className="px-12 py-10"><div className="h-6 w-6 bg-white/5 rounded-full mx-auto opacity-10"></div></td>
                                        <td className="px-12 py-10"><div className="h-4 bg-white/5 rounded-full w-48 opacity-20"></div></td>
                                        <td className="px-12 py-10"><div className="h-4 bg-white/5 rounded-full w-24 opacity-10"></div></td>
                                        <td className="px-12 py-10"><div className="h-8 bg-white/5 rounded-2xl w-32 mx-auto opacity-10"></div></td>
                                        <td className="px-12 py-10"><div className="h-4 bg-white/5 rounded-full w-24 opacity-10"></div></td>
                                        <td className="px-12 py-10"><div className="h-4 bg-white/5 rounded-full w-full opacity-10"></div></td>
                                    </tr>
                                ))
                            ) : filteredAndSortedPairs.map((pair, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedPair(pair)}
                                    className="border-b border-white/[0.02] dark:border-white/[0.02] light-mode:border-slate-50 hover:bg-white/[0.04] dark:hover:bg-white/[0.04] light-mode:hover:bg-slate-50/80 transition-all cursor-pointer group last:border-0 relative overflow-hidden"
                                >
                                    <td className="px-12 py-10 relative">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-awb-red scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xl font-black text-white dark:text-white light-mode:text-slate-900 group-hover:text-awb-red transition-all font-mono tracking-tighter uppercase">{formatAsset(pair.Leader)}</span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-800 light-mode:text-slate-400 font-black uppercase tracking-[0.4em] transition-colors opacity-50 group-hover:opacity-100">{pair.Cat_Leader}</span>
                                        </div>
                                    </td>
                                    <td className="px-12 py-10 text-center">
                                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-[1.25rem] bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50 border border-white/[0.08] light-mode:border-slate-200 group-hover:border-awb-red/50 group-hover:bg-awb-red/10 transition-all shadow-[0_12px_24px_-8px_rgba(0,0,0,0.5)] overflow-hidden relative">
                                            <ArrowRight size={22} className="text-gray-700 dark:text-gray-800 light-mode:text-slate-400 group-hover:text-awb-red transition-all group-hover:translate-x-1 group-hover:scale-110 duration-500" />
                                            <div className="absolute inset-0 bg-awb-red/5 -translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
                                        </div>
                                    </td>
                                    <td className="px-12 py-10">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xl font-black text-gray-400 dark:text-gray-300 light-mode:text-slate-700 transition-all font-mono tracking-tighter group-hover:text-slate-100 dark:group-hover:text-white light-mode:group-hover:text-slate-900 uppercase">{formatAsset(pair.Follower)}</span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-800 light-mode:text-slate-400 font-black uppercase tracking-[0.4em] transition-colors opacity-50 group-hover:opacity-100">{pair.Cat_Follower}</span>
                                        </div>
                                    </td>
                                    <td className="px-12 py-10">
                                        <div className="flex flex-col gap-3">
                                            <span className="text-lg font-mono font-black text-blue-400 dark:text-blue-500 light-mode:text-blue-600 tracking-tighter drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">{(pair.Best_AbsCorr || 0).toFixed(4)}</span>
                                            <div className="w-12 h-1 bg-blue-500/10 rounded-full group-hover:w-full transition-all duration-1000 ease-in-out relative overflow-hidden">
                                                <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: `${(pair.Best_AbsCorr || 0) * 100}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-12 py-10 text-center">
                                        <div className="inline-flex flex-col items-center gap-2 px-6 py-4 rounded-3xl bg-awb-gold/5 border border-white/[0.06] text-awb-gold text-[11px] font-black uppercase tracking-[0.3em] shadow-[0_16px_32px_-12px_rgba(0,0,0,0.4)] transition-all group-hover:scale-110 group-hover:bg-awb-gold/10 group-hover:border-awb-gold/30">
                                            <div className="flex items-center gap-3">
                                                <Activity size={18} className="animate-pulse" />
                                                {pair.Lead_Days} <span className="text-[9px] opacity-60">Periods</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-12 py-10">
                                        <div className="flex items-center gap-4 text-emerald-500 dark:text-emerald-500 light-mode:text-emerald-600">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-125 transition-transform duration-500">
                                                <TrendingUp size={20} className="animate-bounce-slow" />
                                            </div>
                                            <span className="text-lg font-mono font-black tracking-tighter drop-shadow-xl">+{(pair.Lag_Gain || 0).toFixed(4)}</span>
                                        </div>
                                    </td>
                                    <td className="px-12 py-10">
                                        <div className="flex items-center gap-8">
                                            <div className="flex-1 h-3.5 bg-white/[0.05] dark:bg-white/[0.05] light-mode:bg-slate-100 rounded-full overflow-hidden min-w-[140px] transition-all shadow-inner border border-white/[0.05] relative group/progress">
                                                <div
                                                    className="h-full bg-gradient-to-r from-awb-red/60 via-awb-red to-awb-red transition-all duration-[2500ms] ease-out origin-left shadow-[0_0_20px_rgba(200,16,46,0.6)] rounded-full"
                                                    style={{ width: `${(pair.Score_Final || 0) * 100}%` }}
                                                ></div>
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1500ms] ease-in-out" />
                                            </div>
                                            <span className="text-xl font-black text-awb-red font-mono drop-shadow-[0_0_20px_rgba(200,16,46,0.4)] transition-all group-hover:scale-125">{(pair.Score_Final || 0).toFixed(3)}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <PairDetailModal
                pair={selectedPair}
                onClose={() => setSelectedPair(null)}
            />
        </div>
    );
};

export default OfficialPairs;

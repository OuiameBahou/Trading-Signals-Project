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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-100">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-awb-red/10 flex items-center justify-center border border-awb-red/20">
                            <Target size={22} className="text-awb-red" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900">
                                Institutional <span className="text-awb-red">Vector</span> Registry
                            </h2>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                                <ShieldCheck size={12} className="text-emerald-500" /> Certified Alpha Mappings · {filteredAndSortedPairs.length} Active Pair Matrices
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative group/search">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Institutional Alpha Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-navy-900 dark:bg-navy-900 light-mode:bg-white border border-navy-700 dark:border-navy-700 light-mode:border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs text-white dark:text-white light-mode:text-slate-900 w-72 focus:outline-none focus:border-awb-red/50 transition-colors font-bold placeholder-gray-600 tracking-wider uppercase"
                        />
                    </div>
                    <button className="p-2 rounded-xl bg-navy-900 border border-navy-700 text-gray-500 hover:text-white transition-colors">
                        <Filter size={18} />
                    </button>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-600 px-3 py-1 border-l border-navy-700">
                        Top {Math.min(filteredAndSortedPairs.length, 100)} Elite Nodes
                    </div>
                </div>
            </div>

            <div className="card border border-navy-700 bg-navy-800 rounded-2xl overflow-hidden mt-6">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="text-[10px] text-gray-500 dark:text-gray-500 light-mode:text-slate-500 uppercase tracking-widest bg-navy-900 dark:bg-navy-900 light-mode:bg-slate-50 border-b border-navy-700 dark:border-navy-700 light-mode:border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-bold">Instrument Leader</th>
                                <th className="px-6 py-4 font-bold text-center w-20">Vector</th>
                                <th className="px-6 py-4 font-bold">Target Receiver</th>
                                <th
                                    className="px-6 py-4 font-bold cursor-pointer hover:text-awb-red transition-colors"
                                    onClick={() => requestSort('Best_AbsCorr')}
                                >
                                    <div className="flex items-center gap-2">Correlation <SortIcon column="Best_AbsCorr" /></div>
                                </th>
                                <th
                                    className="px-6 py-4 font-bold cursor-pointer hover:text-awb-red transition-colors text-center"
                                    onClick={() => requestSort('Lead_Days')}
                                >
                                    <div className="flex items-center justify-center gap-2">Lag Horizon <SortIcon column="Lead_Days" /></div>
                                </th>
                                <th
                                    className="px-6 py-4 font-bold cursor-pointer hover:text-awb-red transition-colors"
                                    onClick={() => requestSort('Lag_Gain')}
                                >
                                    <div className="flex items-center gap-2">Alpha Gain <SortIcon column="Lag_Gain" /></div>
                                </th>
                                <th
                                    className="px-6 py-4 font-bold cursor-pointer hover:text-awb-red transition-colors"
                                    onClick={() => requestSort('Score_Final')}
                                >
                                    <div className="flex items-center gap-2">Elite Alpha Score <SortIcon column="Score_Final" /></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-navy-700">
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
                                    className="border-b border-navy-700 bg-navy-800 hover:bg-navy-700 transition-colors cursor-pointer group last:border-0"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white font-mono uppercase tracking-tight">{formatAsset(pair.Leader)}</span>
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{pair.Cat_Leader}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-navy-900 border border-navy-600 group-hover:bg-awb-red/10 group-hover:border-awb-red/20 transition-colors">
                                            <ArrowRight size={14} className="text-gray-500 group-hover:text-awb-red transition-colors" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-400 group-hover:text-white font-mono uppercase tracking-tight transition-colors">{formatAsset(pair.Follower)}</span>
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{pair.Cat_Follower}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-mono font-bold text-blue-400">{(pair.Best_AbsCorr || 0).toFixed(4)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex flex-col items-center gap-1 bg-awb-gold/10 border border-awb-gold/20 rounded-lg px-3 py-1.5 text-awb-gold text-[9px] font-bold uppercase tracking-widest">
                                            <div className="flex items-center gap-1.5">
                                                <Activity size={12} />
                                                {pair.Lead_Days} <span className="opacity-70 lowercase text-[8px]">days</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-emerald-500">
                                            <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                                                <TrendingUp size={14} />
                                            </div>
                                            <span className="text-xs font-mono font-bold">+{(pair.Lag_Gain || 0).toFixed(4)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 h-1.5 bg-navy-900 rounded-full overflow-hidden w-24 border border-navy-700">
                                                <div
                                                    className="h-full bg-awb-red rounded-full"
                                                    style={{ width: `${(pair.Score_Final || 0) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-sm font-black text-awb-red font-mono">{(pair.Score_Final || 0).toFixed(3)}</span>
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

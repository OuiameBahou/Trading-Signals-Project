import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap, AlertCircle, ArrowUpRight, Clock, Filter, RefreshCw, BarChart3, Binary, Activity, ShieldCheck, X, Target } from 'lucide-react';
import useFetch from '../hooks/useFetch';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

const SignalScanner = () => {
    const { data: rawPairs, loading, refetch } = useFetch('/api/pairs');
    
    const pairs = useMemo(() => {
        if (!rawPairs) return [];
        return Array.isArray(rawPairs) ? rawPairs : (rawPairs.value || []);
    }, [rawPairs]);

    // Exact Stack Selection
    const [activeTier, setActiveTier] = useState('Any'); // 'Any', 'Triple', 'Double', 'Single'

    // Normalize a CSV boolean field (handles "True"/"False" strings AND actual booleans)
    const isTrue = (v) => v === true || v === 'True';

    // Filter Logic: EXACT MATCHING
    // Only show pairs whose validation tiers match the selection
    const filteredPairs = useMemo(() => {
        if (!pairs) return [];
        return pairs.filter(p => {
            const numMethods = Number(p.N_Methods);
            if (activeTier === 'Any') return true;
            if (activeTier === 'Triple' && numMethods === 3) return true;
            if (activeTier === 'Double' && numMethods === 2) return true;
            if (activeTier === 'Single' && numMethods === 1) return true;
            return false;
        });
    }, [pairs, activeTier]);

    // Population Stats (Total available in DB per tier)
    const population = useMemo(() => {
        if (!pairs) return { h: 0, m: 0, w: 0 };
        return {
            h: pairs.filter(p => Number(p.N_Methods) === 3).length,
            m: pairs.filter(p => Number(p.N_Methods) === 2).length,
            w: pairs.filter(p => Number(p.N_Methods) === 1).length
        };
    }, [pairs]);

    // Current View Stats (What survives the filter)
    const currentView = useMemo(() => {
        return {
            h: filteredPairs.filter(p => Number(p.N_Methods) === 3).length,
            m: filteredPairs.filter(p => Number(p.N_Methods) === 2).length,
            w: filteredPairs.filter(p => Number(p.N_Methods) === 1).length,
            total: filteredPairs.length
        };
    }, [filteredPairs]);

    return (
        <div className="space-y-8 t-bg transition-colors">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 t-border border-b transition-colors">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-awb-red/10 flex items-center justify-center border border-awb-red/20 transition-colors">
                            <Zap size={22} className="text-awb-red" />
                        </div>
                        <h2 className="text-2xl font-black t-text transition-colors">
                            Pair <span className="text-awb-red">Analysis</span>
                        </h2>
                    </div>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-colors">
                        <Activity size={12} className="text-emerald-500" /> Institutional Lead-Lag Discovery Engine Alpha Active
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center t-card t-border border rounded-xl p-1.5 transition-colors">
                        <div className="px-4 py-1.5 text-[10px] font-black t-text-m uppercase flex items-center gap-2 t-border-s border-r mr-2 transition-colors">
                            <Target size={12} className="text-awb-red" /> Tier Select
                        </div>
                        <div className="flex gap-1.5">
                            {['Any', 'Triple', 'Double', 'Single'].map(tier => (
                                <button
                                    key={tier}
                                    onClick={() => setActiveTier(tier)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${activeTier === tier
                                        ? 'bg-awb-red text-white border-awb-red/20'
                                        : 'bg-transparent t-text-m border-transparent hover:t-text'
                                        }`}
                                >
                                    {tier}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Precision Counters (Visible / Total Population) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                    { label: 'Triple Top-Tier', count: currentView.h, total: population.h, color: '#C8102E', active: currentView.h > 0 },
                    { label: 'Double Validated', count: currentView.m, total: population.m, color: '#3b82f6', active: currentView.m > 0 },
                    { label: 'Single Proof', count: currentView.w, total: population.w, color: '#FFB81C', active: currentView.w > 0 },
                ].map((stat, i) => (
                    <div
                        key={i}
                        className={`rounded-lg px-4 py-3 flex items-center justify-between border transition-colors ${stat.active
                            ? `t-card t-border`
                            : 't-elevated t-border opacity-50 grayscale pointer-events-none'
                            }`}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stat.color }}>{stat.label}</span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black font-mono tracking-tight" style={{ color: stat.color }}>{stat.count}</span>
                            <span className="text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors">/ {stat.total}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Grid of Results */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {loading ? (
                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                        <div key={i} className="t-card h-[280px] t-border border rounded-xl animate-pulse transition-colors"></div>
                    ))
                ) : filteredPairs.length === 0 ? (
                    <div className="col-span-full h-80 flex flex-col items-center justify-center t-text-m font-black tracking-[0.3em] uppercase border t-border border-dashed rounded-[3rem] gap-6 t-card transition-colors">
                        <div className="p-6 rounded-full bg-awb-red/10 border border-awb-red/20">
                            <AlertCircle size={40} className="text-awb-red" />
                        </div>
                        <div className="flex flex-col items-center gap-3 text-center">
                            <span className="text-sm">No Signal Correlation Detected</span>
                            <span className="text-[10px] font-bold opacity-60 max-w-sm tracking-widest leading-relaxed">
                                Adjusted validation profile parameters did not isolate any institutional-grade vectors.
                            </span>
                        </div>
                    </div>
                ) : (
                    filteredPairs.map((pair, idx) => (
                        <div
                            key={idx}
                            className="t-card group hover:border-awb-red/20 transition-all cursor-pointer relative p-3 rounded-xl t-border border"
                        >

                            <div className="flex flex-col gap-1 mb-3">
                                <div className="flex justify-between items-start">
                                    <span className="text-[8px] font-bold t-text-s uppercase tracking-[0.1em] font-mono transition-colors">
                                        Seq #{(idx + 1).toString().padStart(3, '0')}
                                    </span>
                                    <div className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded border transition-colors
                                        ${Number(pair.N_Methods) === 3 ? 'bg-awb-red text-white border-awb-red/20' :
                                            Number(pair.N_Methods) === 2 ? 'bg-blue-500 text-white border-blue-500/20' :
                                                'bg-awb-gold text-white border-awb-gold/20'}`}>
                                        {pair.Robustesse}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 font-mono mt-1">
                                    <span className="text-sm font-black t-text group-hover:text-awb-red transition-all uppercase tracking-tight truncate max-w-[40%]">{formatAsset(pair.Leader)}</span>
                                    <div className="w-4 h-4 rounded-full t-elevated flex items-center justify-center t-border border transition-all shrink-0">
                                        <ArrowUpRight size={10} className="text-awb-red" />
                                    </div>
                                    <span className="text-sm font-bold t-text-s transition-colors uppercase tracking-tight truncate max-w-[40%]">{formatAsset(pair.Follower)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="t-elevated p-2 rounded-lg t-border border flex flex-col justify-center transition-colors">
                                    <div className="text-[8px] font-bold t-text-s uppercase tracking-widest mb-1 transition-colors">Alpha</div>
                                    <div className="text-sm font-black t-text flex items-center gap-1.5 transition-colors">
                                        <ShieldCheck size={12} className="text-awb-red" />
                                        <span className="font-mono tracking-tight">{(pair.Score_Final * 100).toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="t-elevated p-2 rounded-lg t-border border flex flex-col justify-center transition-colors">
                                    <div className="text-[8px] font-bold t-text-s uppercase tracking-widest mb-1 transition-colors">Horizon</div>
                                    <div className="text-sm font-black t-text flex items-center gap-1.5 font-mono transition-colors">
                                        <Clock size={12} className="text-awb-gold" />
                                        <span className="font-mono tracking-tight">+{pair.Lead_Days}d</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 t-border border-t pt-3 transition-colors">
                                <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors font-mono">
                                    <Binary size={12} className="text-awb-red" /> Validation
                                </div>

                                <div className="flex flex-col gap-1.5 font-mono">
                                    {[
                                        { label: 'Pearson', val: pair.Best_AbsCorr ? (pair.Best_AbsCorr * 100).toFixed(1) + '%' : 'Fail', active: isTrue(pair.Lag_Validated), color: '#3b82f6', icon: Activity },
                                        { label: 'Granger', val: pair.Granger_P_Corrected ? 'p < ' + Math.max(0.001, pair.Granger_P_Corrected).toFixed(3) : 'Fail', active: isTrue(pair.Granger_Validated), color: '#a855f7', icon: Binary },
                                        { label: 'VAR Impact', val: pair.VAR_Impact ? (pair.VAR_Impact * 100).toFixed(1) + '%' : 'Fail', active: isTrue(pair.VAR_Validated), color: '#10b981', icon: BarChart3 }
                                    ].map((proof, i) => (
                                        <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors ${proof.active ? 't-elevated t-border border t-text' : 'bg-transparent border-transparent opacity-40 grayscale'}`}>
                                            <div className="flex items-center gap-1.5">
                                                <proof.icon size={10} style={{ color: proof.active ? proof.color : 'inherit' }} />
                                                <span className="text-[9px] font-bold uppercase tracking-widest transition-colors" style={{ color: proof.active ? proof.color : 'inherit' }}>{proof.label}</span>
                                            </div>
                                            <span className="text-[10px] font-black tracking-tight transition-colors" style={{ color: proof.active ? proof.color : 'inherit' }}>{proof.val}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SignalScanner;

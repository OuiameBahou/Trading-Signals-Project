import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap, AlertCircle, ArrowUpRight, Clock, Filter, RefreshCw, BarChart3, Binary, Activity, ShieldCheck, X, Target } from 'lucide-react';
import useFetch from '../hooks/useFetch';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

const SignalScanner = () => {
    const { data: pairs, loading, refetch } = useFetch('/api/pairs');

    // Exact Stack Selection
    const [activeStack, setActiveStack] = useState({
        lag: true,
        granger: true,
        var: true
    });

    const toggleStack = (key) => {
        setActiveStack(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const clearStack = () => {
        setActiveStack({ lag: false, granger: false, var: false });
    };

    // Normalize a CSV boolean field (handles "True"/"False" strings AND actual booleans)
    const isTrue = (v) => v === true || v === 'True';

    // Filter Logic: EXACT MATCHING
    // Only show pairs whose validation flags match EXACTLY what's selected
    const filteredPairs = useMemo(() => {
        if (!pairs) return [];
        if (!activeStack.lag && !activeStack.granger && !activeStack.var) return [];

        return pairs.filter(p => {
            return isTrue(p.Lag_Validated) === activeStack.lag &&
                isTrue(p.Granger_Validated) === activeStack.granger &&
                isTrue(p.VAR_Validated) === activeStack.var;
        });
    }, [pairs, activeStack]);

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
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-10 border-b border-white/5 dark:border-white/5 light-mode:border-slate-100 transition-colors">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[1.25rem] bg-awb-red/10 flex items-center justify-center shadow-inner transition-colors border border-awb-red/15">
                            <Zap size={26} className="text-awb-red" />
                        </div>
                        <h2 className="text-4xl font-black tracking-tighter text-white dark:text-white light-mode:text-slate-900 transition-colors">
                            Signal <span className="text-awb-red">Scanner</span>
                        </h2>
                    </div>
                    <p className="text-gray-500 dark:text-gray-500 light-mode:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] leading-relaxed transition-colors flex items-center gap-3">
                        <Activity size={14} className="text-emerald-500" /> Institutional Lead-Lag Discovery Engine Alpha Active
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-white border border-white/10 dark:border-white/10 light-mode:border-slate-200 rounded-[1.5rem] p-2 shadow-2xl transition-all">
                        <div className="px-5 py-2 text-[10px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase flex items-center gap-3 border-r border-white/5 dark:border-white/5 light-mode:border-slate-100 mr-2 transition-colors tracking-[0.2em] font-mono">
                            <Target size={14} className="text-awb-red" /> Profile
                        </div>
                        <div className="flex gap-1.5">
                            {['lag', 'granger', 'var'].map(method => (
                                <button
                                    key={method}
                                    onClick={() => toggleStack(method)}
                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 border ${activeStack[method]
                                        ? 'bg-awb-red text-white border-white/20 shadow-xl shadow-awb-red/20 scale-105'
                                        : 'bg-white/5 dark:bg-white/[0.02] light-mode:bg-slate-50 border border-transparent hover:border-white/10 dark:hover:border-white/10 light-mode:hover:border-slate-200 text-gray-600 dark:text-gray-700 light-mode:text-slate-500 hover:text-white dark:hover:text-white light-mode:hover:text-slate-900'
                                        }`}
                                >
                                    {method}
                                </button>
                            ))}
                            <button
                                onClick={clearStack}
                                className="w-11 h-11 rounded-xl bg-white/5 dark:bg-white/[0.02] light-mode:bg-slate-50 flex items-center justify-center text-gray-500 hover:text-awb-red hover:bg-awb-red/5 transition-all border border-transparent hover:border-awb-red/20 active:rotate-180 duration-500 shadow-xl group"
                                title="Reset Profile"
                            >
                                <RefreshCw size={18} className={`transition-all duration-500 ${loading ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Precision Counters (Visible / Total Population) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    { label: 'Triple Top-Tier', count: currentView.h, total: population.h, color: '#C8102E', active: currentView.h > 0 },
                    { label: 'Double Validated', count: currentView.m, total: population.m, color: '#FFB81C', active: currentView.m > 0 },
                    { label: 'Single Proof', count: currentView.w, total: population.w, color: '#3b82f6', active: currentView.w > 0 },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.1 * i, type: 'spring', damping: 20, stiffness: 100 }}
                        className={`rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-5 border transition-all duration-700 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] relative overflow-hidden group ${stat.active
                            ? `bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-white border-white/10 dark:border-white/10 light-mode:border-slate-200 scale-100 hover:border-white/20 dark:hover:border-white/20 light-mode:hover:border-slate-300`
                            : 'bg-white/[0.01] border-white/5 opacity-30 grayscale pointer-events-none'
                            }`}
                    >
                        <div className="absolute top-0 left-0 w-full h-1 opacity-40 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] transition-colors opacity-60 group-hover:opacity-100 group-hover:tracking-[0.5em] duration-500" style={{ color: stat.color }}>{stat.label}</span>
                        <div className="flex items-baseline gap-5">
                            <span className="text-7xl font-black font-mono tracking-tighter drop-shadow-[0_0_25px_rgba(200,16,46,0.3)] transition-all group-hover:scale-110 duration-700" style={{ color: stat.color === '#ffffff' ? 'white' : stat.color }}>{stat.count}</span>
                            <span className="text-sm font-black text-gray-500 dark:text-gray-700 light-mode:text-slate-400 uppercase tracking-widest transition-colors">/ {stat.total} Total</span>
                        </div>
                        <div className="absolute -bottom-16 -right-16 w-40 h-40 blur-[100px] rounded-full opacity-10 group-hover:opacity-40 transition-all duration-1000" style={{ backgroundColor: stat.color }} />
                    </motion.div>
                ))}
            </div>

            {/* Grid of Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {loading ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="card h-[420px] animate-pulse bg-white/[0.02] light-mode:bg-slate-50 border border-white/5 rounded-[2.5rem]"></div>
                    ))
                ) : filteredPairs.length === 0 ? (
                    <div className="col-span-full h-80 flex flex-col items-center justify-center text-gray-500 font-black tracking-[0.3em] uppercase border border-white/5 border-dashed rounded-[3rem] gap-6 bg-white/[0.01]">
                        <div className="p-6 rounded-full bg-awb-red/5 border border-awb-red/10 animate-bounce-slow">
                            <AlertCircle size={40} className="text-awb-red/40" />
                        </div>
                        <div className="flex flex-col items-center gap-3 text-center">
                            <span className="text-sm">No Signal Correlation Detected</span>
                            <span className="text-[10px] font-bold opacity-40 max-w-sm tracking-widest leading-relaxed">
                                Adjusted validation profile parameters did not isolate any institutional-grade vectors.
                            </span>
                        </div>
                    </div>
                ) : (
                    filteredPairs.map((pair, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 * (idx % 12) }}
                            className="card group hover:border-awb-red/40 transition-all cursor-pointer relative overflow-hidden p-8 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] hover:-translate-y-2 duration-500 rounded-[2.5rem] border-white/[0.06] shadow-2xl"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-awb-red opacity-0 group-hover:opacity-[0.03] blur-3xl transition-opacity duration-700" />

                            <div className="flex justify-between items-start mb-8">
                                <div className="flex flex-col gap-2">
                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.3em] transition-colors font-mono opacity-60">
                                        Vector Seq #{(idx + 1).toString().padStart(3, '0')}
                                    </span>
                                    <div className="flex items-center gap-4 font-mono">
                                        <span className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900 group-hover:text-awb-red transition-all uppercase tracking-tighter">{formatAsset(pair.Leader)}</span>
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-awb-red/30 transition-all">
                                            <ArrowUpRight size={20} className="text-awb-red group-hover:scale-125 transition-transform" />
                                        </div>
                                        <span className="text-2xl font-black text-gray-400 dark:text-gray-500 light-mode:text-slate-500 transition-colors uppercase tracking-tighter">{formatAsset(pair.Follower)}</span>
                                    </div>
                                </div>
                                <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1rem] border shadow-2xl transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3
                                    ${Number(pair.N_Methods) === 3 ? 'bg-awb-red text-white border-white/20' :
                                        Number(pair.N_Methods) === 2 ? 'bg-awb-gold text-navy-950 border-white/20' :
                                            'bg-white/5 text-gray-400 border-white/10 opacity-60'}`}>
                                    {pair.Robustesse}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-5 mb-10">
                                <div className="bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-slate-50 p-5 rounded-[1.5rem] border border-white/5 dark:border-white/5 light-mode:border-slate-100 flex flex-col justify-center transition-all group-hover:border-awb-red/20 shadow-inner group-hover:bg-awb-red/[0.02]">
                                    <div className="text-[9px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-500 uppercase tracking-[0.25em] mb-2 transition-colors">Alpha Power</div>
                                    <div className="text-xl font-black text-white dark:text-white light-mode:text-slate-900 flex items-center gap-2.5 transition-colors">
                                        <ShieldCheck size={16} className="text-awb-red" />
                                        <span className="font-mono tracking-tighter">{(pair.Score_Final * 100).toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-slate-50 p-5 rounded-[1.5rem] border border-white/5 dark:border-white/5 light-mode:border-slate-100 flex flex-col justify-center transition-all group-hover:border-awb-gold/20 shadow-inner group-hover:bg-awb-gold/[0.02]">
                                    <div className="text-[9px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-500 uppercase tracking-[0.25em] mb-2 transition-colors">Time Horizon</div>
                                    <div className="text-xl font-black text-white dark:text-white light-mode:text-slate-900 flex items-center gap-2.5 font-mono transition-colors">
                                        <Clock size={16} className="text-awb-gold" />
                                        <span className="font-mono tracking-tighter">+{pair.Lead_Days}d</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 border-t border-white/[0.06] pt-8 transition-colors">
                                <div className="text-[10px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3 mb-6 transition-colors font-mono">
                                    <Binary size={14} className="text-awb-red" /> Validation Proofs
                                </div>

                                <div className="flex flex-col gap-3 font-mono">
                                    {[
                                        { label: 'Pearson Corr', val: pair.Best_AbsCorr ? (pair.Best_AbsCorr * 100).toFixed(1) + '%' : 'Fail', active: isTrue(pair.Lag_Validated), color: '#3b82f6', icon: Activity },
                                        { label: 'Granger F', val: pair.Granger_Fstat ? pair.Granger_Fstat.toFixed(1) : 'Fail', active: isTrue(pair.Granger_Validated), color: '#a855f7', icon: Binary },
                                        { label: 'VAR Impact', val: pair.VAR_Impact ? pair.VAR_Impact.toFixed(3) : 'Fail', active: isTrue(pair.VAR_Validated), color: '#10b981', icon: BarChart3 }
                                    ].map((proof, i) => (
                                        <div key={i} className={`flex items-center justify-between px-5 py-3.5 rounded-2xl border transition-all duration-500 ${proof.active ? 'bg-white/[0.03] border-white/10 text-white' : 'bg-black/10 opacity-20 border-transparent grayscale scale-95'}`}>
                                            <div className="flex items-center gap-3">
                                                <proof.icon size={12} style={{ color: proof.active ? proof.color : 'inherit' }} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">{proof.label}</span>
                                            </div>
                                            <span className="text-[12px] font-black tracking-tighter" style={{ color: proof.active ? proof.color : 'inherit' }}>{proof.val}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SignalScanner;

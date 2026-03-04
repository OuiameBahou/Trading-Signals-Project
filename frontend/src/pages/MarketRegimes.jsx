import React, { useMemo } from 'react';
import { TrendingUp, Activity, AlertTriangle, ShieldCheck, Info, BarChart, Calendar, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import useFetch from '../hooks/useFetch';

const MarketRegimes = () => {
    const { data: regimes, loading } = useFetch('/api/market_regimes');
    const isDarkMode = !document.body.classList.contains('light-mode');

    // Map regime numbers to labels and colors
    const regimeMeta = {
        0: { label: 'Bear / High Vol', color: '#C8102E', description: 'Institutional stress regime. High volatility and downward pressure on standard benchmarks.' },
        1: { label: 'Bull / Low Vol', color: '#22c55e', description: 'Stable growth environment. Low volatility and clear trend persistence.' },
        2: { label: 'Trans / Mid Vol', color: '#FFB81C', description: 'Regime transition or uncertainty. Moderate volatility and mean-reversion focus.' }
    };

    const chartData = useMemo(() => {
        if (!regimes) return [];
        return regimes.map(r => ({
            ...r,
            val: r.Regime,
            label: regimeMeta[r.Regime]?.label || 'Unknown'
        }));
    }, [regimes]);

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const meta = regimeMeta[data.Regime];
            return (
                <div className="glass p-6 rounded-[1.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] z-[9999] pointer-events-none transition-opacity duration-150 border border-white/10 dark:border-white/10 light-mode:border-slate-200 bg-[#080c10]/95 dark:bg-[#080c10]/95 light-mode:bg-white/98 backdrop-blur-xl transition-colors min-w-[220px]">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 border border-white/10 light-mode:border-slate-200">
                            <Calendar size={14} className="text-awb-red" />
                        </div>
                        <div>
                            <div className="text-[11px] font-black text-gray-400 dark:text-gray-500 light-mode:text-slate-500 uppercase tracking-widest leading-none mb-1">Time Horizon</div>
                            <div className="text-[12px] font-black text-white dark:text-white light-mode:text-slate-900 font-mono">{data.Date}</div>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-white/5 dark:border-white/5 light-mode:border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.4)]" style={{ backgroundColor: meta?.color, boxShadow: `0 0 10px ${meta?.color}44` }}></div>
                            <div>
                                <div className="text-[9px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.2em] mb-1">Structural Regime</div>
                                <div className="text-sm font-black text-white dark:text-white light-mode:text-slate-900 uppercase tracking-tight transition-colors">{meta?.label}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-10 border-b border-white/5 dark:border-white/5 light-mode:border-slate-100 transition-colors">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[1.25rem] bg-awb-red/10 flex items-center justify-center shadow-inner transition-colors border border-awb-red/15">
                            <TrendingUp size={26} className="text-awb-red" />
                        </div>
                        <h2 className="text-4xl font-black tracking-tighter text-white dark:text-white light-mode:text-slate-900 transition-colors">
                            Market <span className="text-awb-red">Regimes</span>
                        </h2>
                    </div>
                    <p className="text-gray-500 dark:text-gray-500 light-mode:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] leading-relaxed transition-colors flex items-center gap-3">
                        <Activity size={14} className="text-awb-gold" /> Latent State Analysis · Institutional Structural Mapping Active
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {Object.entries(regimeMeta).map(([id, meta]) => (
                    <div key={id} className="card p-10 transition-all hover:-translate-y-3 hover:shadow-[0_48px_80px_-16px_rgba(0,0,0,0.6)] duration-500 relative overflow-hidden group rounded-[2.5rem] border-white/5">
                        <div className="absolute top-0 left-0 w-2 h-full opacity-60 transition-transform duration-500 origin-left group-hover:scale-x-150" style={{ backgroundColor: meta.color }} />
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-[11px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.4em] transition-colors font-mono opacity-60">State Vector 0{id}</span>
                            <div className={`p-4 rounded-2xl transition-all shadow-2xl relative ${id === '0' ? 'bg-awb-red/10 text-awb-red' : id === '1' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-awb-gold/10 text-awb-gold'}`}>
                                <div className="absolute inset-0 bg-current opacity-5 animate-pulse rounded-2xl" />
                                {id === '0' ? <AlertTriangle size={20} /> :
                                    id === '1' ? <ShieldCheck size={20} /> :
                                        <Activity size={20} />}
                            </div>
                        </div>
                        <h4 className="text-3xl font-black text-white dark:text-white light-mode:text-slate-900 mb-6 transition-colors uppercase tracking-tight font-mono">{meta.label}</h4>
                        <p className="text-[12px] text-gray-500 dark:text-gray-500 light-mode:text-slate-600 leading-relaxed font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity duration-500">
                            {meta.description}
                        </p>
                    </div>
                ))}

                <div className="card p-10 flex flex-col justify-center bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50 border-white/[0.1] border-dashed relative overflow-hidden group rounded-[2.5rem] shadow-none hover:shadow-2xl transition-all duration-700">
                    <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:scale-110 group-hover:rotate-12 transition-all duration-1000 grayscale">
                        <BarChart size={180} className="text-awb-gold" />
                    </div>
                    <div className="flex items-center gap-4 text-awb-gold mb-6 relative z-10">
                        <div className="p-3 rounded-2xl bg-awb-gold/10 border border-awb-gold/20 shadow-xl">
                            <Zap size={18} className="animate-pulse" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.3em]">Institutional Guardrails</span>
                    </div>
                    <p className="text-[12px] text-gray-500 dark:text-gray-600 light-mode:text-slate-500 leading-relaxed font-black uppercase tracking-widest transition-colors relative z-10 opacity-70 group-hover:opacity-100">
                        Lead-Lag signals are most robust during States 0 and 1. State 2 identifies structural shifts or noise in the network topology.
                    </p>
                </div>
            </div>

            <div className="flex-1 card p-10 relative overflow-hidden min-h-[500px] group rounded-[2.5rem] shadow-2xl border-white/[0.06]">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-white/90 z-20 backdrop-blur-md transition-colors">
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-awb-red/10 rounded-full" />
                                <div className="absolute inset-0 w-20 h-20 border-4 border-awb-red border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(200,16,46,0.3)]" />
                            </div>
                            <span className="mt-6 text-[12px] font-black text-white dark:text-white light-mode:text-slate-900 uppercase tracking-[0.4em] animate-pulse transition-colors">Synchronizing States</span>
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full flex flex-col">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 border border-white/10 light-mode:border-slate-200 shadow-xl">
                                    <BarChart size={20} className="text-awb-red" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-[11px] font-black text-gray-500 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-[0.3em] transition-colors">
                                        Structural Topology
                                    </h3>
                                    <span className="text-[9px] font-black text-gray-600 dark:text-gray-700 light-mode:text-slate-300 uppercase tracking-widest">HMM Latent State Sequence</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-white border border-white/10 dark:border-white/10 light-mode:border-slate-200 p-2 rounded-2xl transition-all shadow-2xl">
                                <div className="flex items-center gap-3 px-5 py-2 rounded-xl bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 border border-white/5 light-mode:border-slate-100 transition-all hover:scale-105">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]"></div>
                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-500 light-mode:text-slate-700 tracking-[0.2em] uppercase">Bull Universe</span>
                                </div>
                                <div className="flex items-center gap-3 px-5 py-2 rounded-xl bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 border border-white/5 light-mode:border-slate-100 transition-all hover:scale-105">
                                    <div className="w-2.5 h-2.5 rounded-full bg-awb-gold shadow-[0_0_12px_rgba(255,184,28,0.4)]"></div>
                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-500 light-mode:text-slate-700 tracking-[0.2em] uppercase">Transition</span>
                                </div>
                                <div className="flex items-center gap-3 px-5 py-2 rounded-xl bg-white/5 dark:bg-white/5 light-mode:bg-slate-50 border border-white/5 light-mode:border-slate-100 transition-all hover:scale-105">
                                    <div className="w-2.5 h-2.5 rounded-full bg-awb-red shadow-[0_0_12px_rgba(200,16,46,0.4)]"></div>
                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-500 light-mode:text-slate-700 tracking-[0.2em] uppercase">Bear Stress</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRegime" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#C8102E" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.05)"} vertical={false} />
                                    <XAxis
                                        dataKey="Date"
                                        stroke={isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.3)"}
                                        fontSize={9}
                                        tickFormatter={(val) => val.split('-')[0]}
                                        tick={{ fontWeight: '900', letterSpacing: '0.1em' }}
                                        axisLine={false}
                                        tickLine={false}
                                        minTickGap={100}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke={isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.3)"}
                                        fontSize={9}
                                        domain={[0, 2]}
                                        ticks={[0, 1, 2]}
                                        tickFormatter={(val) => `V${val}`}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontWeight: '900' }}
                                        dx={-5}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="stepAfter"
                                        dataKey="val"
                                        stroke="#C8102E"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorRegime)"
                                        animationDuration={2500}
                                        activeDot={{ r: 6, stroke: '#C8102E', strokeWidth: 2, fill: '#fff', shadow: '0 0 10px rgba(0,0,0,0.5)' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketRegimes;

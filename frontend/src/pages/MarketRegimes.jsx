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
                <div className="card p-4 z-[9999] pointer-events-none transition-opacity bg-navy-900 border border-navy-700 min-w-[200px]">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-1.5 rounded-lg border border-navy-600 bg-navy-800">
                            <Calendar size={14} className="text-awb-red" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">Time Horizon</div>
                            <div className="text-xs font-black text-white font-mono">{data.Date}</div>
                        </div>
                    </div>
                    <div className="pt-3 border-t border-navy-700">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta?.color }}></div>
                            <div>
                                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Structural Regime</div>
                                <div className="text-sm font-black text-white uppercase tracking-tight">{meta?.label}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-navy-700">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-awb-red/10 flex items-center justify-center border border-awb-red/20">
                            <TrendingUp size={22} className="text-awb-red" />
                        </div>
                        <h2 className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900">
                            Market <span className="text-awb-red">Regimes</span>
                        </h2>
                    </div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Activity size={12} className="text-awb-gold" /> Latent State Analysis · Institutional Structural Mapping Active
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {Object.entries(regimeMeta).map(([id, meta]) => (
                    <div key={id} className="card p-6 bg-navy-800 border-navy-700 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">State Vector 0{id}</span>
                            <div className={`w-8 h-8 flex flex-col justify-center items-center rounded-lg border ${id === '0' ? 'bg-awb-red/10 border-awb-red/20 text-awb-red' : id === '1' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-awb-gold/10 border-awb-gold/20 text-awb-gold'}`}>
                                {id === '0' ? <AlertTriangle size={16} /> :
                                    id === '1' ? <ShieldCheck size={16} /> :
                                        <Activity size={16} />}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xl font-black text-white mb-2 uppercase tracking-tight">{meta.label}</h4>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                {meta.description}
                            </p>
                        </div>
                    </div>
                ))}

                <div className="card p-6 flex flex-col justify-center bg-navy-900 border-navy-700 relative overflow-hidden group">
                    <div className="flex items-center gap-3 text-awb-gold mb-4">
                        <div className="p-2 rounded-lg bg-awb-gold/10 border border-awb-gold/20">
                            <Zap size={14} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Institutional Guardrails</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed font-bold uppercase tracking-widest">
                        Lead-Lag signals are most robust during States 0 and 1. State 2 identifies structural shifts or noise in the network topology.
                    </p>
                </div>
            </div>

            <div className="flex-1 card p-10 relative overflow-hidden min-h-[500px] border-navy-700">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-navy-800 z-20">
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-awb-red/10 rounded-full" />
                                <div className="absolute inset-0 w-16 h-16 border-4 border-awb-red border-t-transparent rounded-full animate-spin" />
                            </div>
                            <span className="mt-6 text-[12px] font-bold text-gray-400 uppercase tracking-widest">Loading...</span>
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full flex flex-col">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-navy-900 border border-navy-700">
                                    <BarChart size={16} className="text-awb-red" />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">
                                        Structural Topology
                                    </h3>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">HMM Latent State Sequence</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 bg-navy-900 border border-navy-700 p-1.5 rounded-xl">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-navy-600 bg-navy-800">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">Bull Universe</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-navy-600 bg-navy-800">
                                    <div className="w-2 h-2 rounded-full bg-awb-red"></div>
                                    <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">Bear Stress</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-navy-600 bg-navy-800">
                                    <div className="w-2 h-2 rounded-full bg-awb-gold"></div>
                                    <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">Transition</span>
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

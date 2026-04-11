import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart2, TrendingUp, TrendingDown, ArrowRightLeft, Target, Shield, Clock, AlertCircle, Loader2 } from 'lucide-react';

const FxLiveSignals = () => {
    const [signals, setSignals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSignals = async () => {
            try {
                const response = await axios.get('/api/fx/live_signals');
                setSignals(response.data);
            } catch (err) {
                setError('Failed to load live FX trading signals.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSignals();
    }, []);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="text-[#FFB81C] animate-spin" />
                    <div className="text-[10px] font-black t-text-m uppercase tracking-widest">Compiling Live Trade Matrices...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-red-500">
                <AlertCircle size={24} className="mr-2" />
                <span>{error}</span>
            </div>
        );
    }

    const activeSignals = signals.filter(s => s.action === 'LONG' || s.action === 'SHORT');
    const flatSignals = signals.filter(s => s.action === 'FLAT');
    
    // Sort active signals: LONGs first, then SHORTs
    activeSignals.sort((a, b) => {
        if (a.action === b.action) return 0;
        return a.action === 'LONG' ? -1 : 1;
    });

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b t-border-s pb-4">
                <div>
                    <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
                        <BarChart2 className="text-[#FFB81C]" />
                        Live Trading Signals
                    </h1>
                    <p className="text-xs t-text-m mt-2 uppercase tracking-widest font-bold">Actionable Daily Output from Technical Engine</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-[#12141A] border t-border-s rounded-lg text-[9px] font-black uppercase tracking-widest">
                        Model: MACD + RSI + BB
                    </div>
                </div>
            </div>

            {/* Active Actionable Signals */}
            <div className="space-y-4">
                <h3 className="text-[10px] font-black t-text-m uppercase tracking-[0.2em] flex items-center gap-2">
                    <Target size={14} className="text-[#FFB81C]" /> 
                    Live Open Opportunities <span className="text-white">({activeSignals.length})</span>
                </h3>
                
                {activeSignals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {activeSignals.map((sig, idx) => (
                            <div key={idx} className="t-card border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-xl hover:border-[#FFB81C]/50 transition-colors group">
                                <div className={`absolute top-0 left-0 w-2 h-full ${sig.action === 'LONG' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                
                                <div className="flex justify-between items-start mb-6 pl-4">
                                    <div>
                                        <div className="text-[10px] t-text-m font-bold uppercase tracking-widest mb-1">{sig.date}</div>
                                        <h3 className="text-2xl font-black t-text tracking-wider">{sig.pair.replace(/_B|_/g, (m) => m === '_' ? '/' : '')}</h3>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                        sig.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                                    }`}>
                                        {sig.action === 'LONG' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        {sig.action}
                                    </div>
                                </div>

                                <div className="space-y-4 pl-4">
                                    <div className="flex items-center justify-between border-b t-border-s pb-4">
                                        <div>
                                            <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-1">Entry Price</div>
                                            <div className="text-lg font-black">{sig.price.toFixed(5)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-1">Conviction</div>
                                            <div className="text-xs font-black text-[#FFB81C] uppercase">{sig.conviction} Match</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-[9px] text-emerald-500/70 font-bold uppercase tracking-widest mb-1">
                                                <Target size={12} /> Target (TP)
                                            </div>
                                            <div className="text-sm font-black text-emerald-500">{sig.tp ? sig.tp.toFixed(5) : '—'}</div>
                                        </div>
                                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-[9px] text-red-500/70 font-bold uppercase tracking-widest mb-1">
                                                <Shield size={12} /> Stop (SL)
                                            </div>
                                            <div className="text-sm font-black text-red-500">{sig.sl ? sig.sl.toFixed(5) : '—'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="t-card border t-border-s rounded-2xl p-10 flex flex-col items-center justify-center text-gray-500 min-h-[250px] shadow-sm">
                        <Clock size={32} className="mb-4 opacity-50" />
                        <h4 className="text-sm font-black uppercase tracking-widest t-text">No Active Signals</h4>
                        <p className="text-xs mt-2 uppercase tracking-widest opacity-70">The designated indicator matrix has not triggered any entries today.</p>
                    </div>
                )}
            </div>

            {/* Flat Standby Assets */}
            <div className="space-y-4">
                <h3 className="text-[10px] font-black t-text-m uppercase tracking-[0.2em] flex items-center gap-2">
                    <ArrowRightLeft size={14} className="text-gray-400" /> 
                    Monitoring (Flat Position) <span className="text-gray-500">({flatSignals.length})</span>
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {flatSignals.map((sig, idx) => (
                        <div key={idx} className="t-card border t-border-s rounded-xl p-4 flex flex-col text-center opacity-70 hover:opacity-100 transition-opacity">
                            <span className="text-sm font-black t-text tracking-wider mb-2">
                                {sig.pair.replace(/_B|_/g, (m) => m === '_' ? '/' : '')}
                            </span>
                            <span className="text-[10px] t-text-m font-bold uppercase tracking-widest">
                                {sig.price.toFixed(5)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default FxLiveSignals;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle, Loader2 } from 'lucide-react';

const FxDashboard = () => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await axios.get('/api/fx/dashboard');
                setData(response.data);
            } catch (err) {
                setError('Failed to load FX market data.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="text-[#FFB81C] animate-spin" />
                    <div className="text-[10px] font-black t-text-m uppercase tracking-widest">Scanning FX Ecosystem...</div>
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

    // Sort by regime (Trend first)
    const sortedData = [...data].sort((a, b) => {
        if (a.regime === b.regime) return 0;
        return a.regime === 'Trend' ? -1 : 1;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
                        <Activity className="text-[#FFB81C]" />
                        FX Market Overview
                    </h1>
                    <p className="text-xs t-text-m mt-2 uppercase tracking-widest font-bold">G10 Currency Pair Regime Monitor</p>
                </div>
                <div className="bg-[#FFB81C]/10 border border-[#FFB81C]/30 text-[#FFB81C] px-4 py-2 rounded-xl flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#FFB81C] animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Live Engine Active</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {sortedData.map((pair, idx) => {
                    const isTrend = pair.regime === 'Trend';
                    const isBull = pair.trend === 'Bullish';
                    
                    return (
                        <div key={idx} className="t-card border t-border-s rounded-2xl p-5 relative overflow-hidden group hover:border-[#FFB81C]/50 transition-colors">
                            
                            {/* Background glow based on regime */}
                            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[50px] opacity-20 transition-all group-hover:opacity-40 pointer-events-none ${
                                isTrend ? (isBull ? 'bg-emerald-500' : 'bg-red-500') : 'bg-gray-500'
                            }`} />

                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <h3 className="text-xl font-black t-text tracking-wider">
                                    {pair.pair.replace(/_B|_/g, (m) => m === '_' ? '/' : '')}
                                </h3>
                                
                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border ${
                                    isTrend 
                                        ? 'bg-[#FFB81C]/10 text-[#FFB81C] border-[#FFB81C]/30' 
                                        : 'bg-white/5 text-gray-400 border-white/10'
                                }`}>
                                    {isTrend ? (isBull ? <TrendingUp size={10} /> : <TrendingDown size={10} />) : <ArrowRightLeft size={10} />}
                                    {pair.regime}
                                </span>
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div>
                                    <div className="text-[10px] t-text-m font-bold uppercase tracking-widest mb-1">Current Price</div>
                                    <div className="text-2xl font-black t-text">
                                        {pair.price.toFixed(5)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t t-border-s">
                                    <div>
                                        <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-1">Trend Slope</div>
                                        <div className={`text-sm font-black ${isBull ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {pair.slope > 0 ? '+' : ''}{pair.slope.toFixed(2)} bps
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mb-1">Daily ATR</div>
                                        <div className="text-sm font-black text-blue-400">
                                            {pair.atr.toFixed(4)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
        </div>
    );
};

export default FxDashboard;

import React, { useState, useEffect } from 'react';
import { Clock, Search, Activity } from 'lucide-react';

const Topbar = ({ activePage, summary }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedDate = time.toLocaleDateString('en-US', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });

    // 24h format
    const h = String(time.getHours()).padStart(2, '0');
    const m = String(time.getMinutes()).padStart(2, '0');
    const s = String(time.getSeconds()).padStart(2, '0');
    const formattedTime = `${h}:${m}:${s}`;

    const pageLabels = {
        dashboard: 'Intelligence Hub',
        'asset-directory': 'Asset Universe',
        signals: 'Signal Scanner',
        pairs: 'Lead-Lag Registry',
        network: 'Leadership Network',
        granger: 'Granger Scorecard',
        correlation: 'Correlation Matrix',
        research: 'Research Vault',
        stationarity: 'Statistical Tests',
    };

    return (
        <header className="h-16 bg-[#080c10]/80 backdrop-blur-xl border-b border-white/[0.05] flex items-center justify-between px-8 sticky top-0 z-10">
            {/* Left: breadcrumb */}
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">AWB Quant</span>
                <span className="text-gray-700">/</span>
                <span className="text-[11px] font-black text-white uppercase tracking-widest">
                    {pageLabels[activePage] || activePage}
                </span>
            </div>

            {/* Center: search */}
            <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#C8102E] transition-colors" size={14} />
                <input
                    type="text"
                    placeholder="Search assets, signals, metrics..."
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl py-2 pl-10 pr-4 text-sm text-gray-400 w-72 focus:outline-none focus:ring-1 focus:ring-[#C8102E]/20 focus:border-[#C8102E]/20 transition-all font-medium placeholder:text-gray-700"
                />
            </div>

            {/* Right: stats + clock */}
            <div className="flex items-center gap-5">
                {summary?.official_pairs && (
                    <div className="flex items-center gap-2">
                        <Activity size={13} className="text-[#C8102E]" />
                        <span className="text-[11px] font-black text-white">{summary.official_pairs}</span>
                        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Validated Pairs</span>
                    </div>
                )}

                <div className="w-px h-5 bg-white/[0.06]" />

                <div className="flex items-center gap-2.5 text-[11px] font-mono">
                    <Clock size={13} className="text-[#C8102E]" />
                    <span className="text-gray-500 font-bold">{formattedDate}</span>
                    <span className="text-white font-black">{formattedTime}</span>
                </div>
            </div>
        </header>
    );
};

export default Topbar;

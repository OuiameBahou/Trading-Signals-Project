import React, { useState } from 'react';
import { Grid, Eye, AlertCircle, RefreshCw } from 'lucide-react';

const FxParameterOptimizer = () => {
    const [isSimulating, setIsSimulating] = useState(false);
    
    // Mocked heatmap metrics
    // X = RSI Period (10, 14, 21, 28)
    // Y = MACD Fast (8, 12, 16, 20)
    const gridSize = 4;
    const xAxisLabel = "RSI Period";
    const xValues = [10, 14, 21, 28];
    const yAxisLabel = "MACD Fast Period";
    const yValues = [8, 12, 16, 20];
    
    // Mock win rates from 45.0% to 62.1%
    const winRateMatrix = [
        [46.1, 48.0, 50.1, 51.5],
        [45.0, 49.3, 54.2, 53.0],
        [48.1, 52.5, 61.2, 59.1],
        [49.5, 53.0, 58.0, 56.4]
    ];
    
    // Create an array mapping for the grid
    const heatMapData = [];
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            heatMapData.push({
                x: xValues[c],
                y: yValues[r],
                val: winRateMatrix[r][c]
            });
        }
    }
    
    const maxVal = 62;
    const minVal = 45;
    
    const getColor = (val) => {
        // Range 45% -> 60%+
        const t = (val - minVal) / (maxVal - minVal);
        // interpolate from deep red to emerald green
        if (t < 0.3) return 'bg-[#C8102E]';
        if (t < 0.6) return 'bg-[#FFB81C]';
        return 'bg-emerald-500';
    };

    const runMPI = () => {
        setIsSimulating(true);
        setTimeout(() => setIsSimulating(false), 2000);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between border-b t-border-s pb-4">
                <div>
                    <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
                        <Grid className="text-[#FFB81C]" />
                        Parameter Optimizer
                    </h1>
                    <p className="text-xs t-text-m mt-2 uppercase tracking-widest font-bold">MPI Grid Search Topology</p>
                </div>
            </div>

            <div className="t-card border t-border-s rounded-2xl p-8 flex flex-col lg:flex-row gap-12">
                
                {/* Control Panel */}
                <div className="w-full lg:w-1/3 flex flex-col space-y-8">
                    <div className="flex bg-[#12141A] border t-border-s p-4 rounded-xl gap-4 items-start shadow-inner">
                        <AlertCircle className="text-[#FFB81C] flex-shrink-0" />
                        <div className="text-xs t-text-m leading-relaxed">
                            <span className="font-bold text-white block mb-1 uppercase tracking-widest text-[10px]">Processing Heavy Node</span>
                            The sensitivity analysis requires calculating thousands of combinations utilizing the AWB Engine via MPI threading. Live optimization is throttled in the UX.
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black t-text-m uppercase tracking-widest">Base Strategy Parameters</label>
                        <select disabled className="w-full bg-[#1A1D24] text-gray-500 border border-white/5 rounded-xl px-4 py-3 text-sm font-black tracking-wider cursor-not-allowed">
                            <option>MACD + RSI Confirm. Strategy</option>
                        </select>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{xAxisLabel} Search Range</label>
                                <input disabled value="10 - 30" className="w-full bg-[#1A1D24] text-gray-500 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold text-center cursor-not-allowed"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{yAxisLabel} Search Range</label>
                                <input disabled value="8 - 20" className="w-full bg-[#1A1D24] text-gray-500 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold text-center cursor-not-allowed"/>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={runMPI}
                        disabled={isSimulating}
                        className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest rounded-xl py-3 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-md disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={isSimulating ? "animate-spin" : ""} />
                        {isSimulating ? "Re-simulating Grid..." : "Refresh Sensitivity Matrix"}
                    </button>
                </div>

                {/* Heatmap Area */}
                <div className="flex-1 flex flex-col items-center">
                    <h3 className="text-sm font-black t-text uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                        <Eye className="text-[#FFB81C]" size={16}/> Optimization Win Rate Topology
                    </h3>

                    {/* Chart Frame */}
                    <div className="relative pl-12 pb-12">
                        
                        {/* Y-Axis Label */}
                        <div className="absolute top-1/2 left-0 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-black uppercase tracking-widest t-text-m whitespace-nowrap">
                            {yAxisLabel}
                        </div>

                        {/* Y-Axis Ticks */}
                        <div className="absolute top-0 left-6 h-full flex flex-col justify-between py-1 text-[10px] font-bold text-gray-400">
                            {[...yValues].reverse().map(v => <span key={v}>{v}</span>)}
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-4 grid-rows-4 gap-1 w-80 h-80">
                            {[...winRateMatrix].reverse().map((row, rIdx) => 
                                row.map((val, cIdx) => (
                                    <div 
                                        key={`${rIdx}-${cIdx}`}
                                        className={`w-full h-full rounded shadow flex items-center justify-center text-xs font-black ${getColor(val)} transition-opacity hover:opacity-80 cursor-crosshair text-black border border-black/10`}
                                        title={`Win Rate: ${val}%`}
                                    >
                                        {val.toFixed(1)}%
                                    </div>
                                ))
                            )}
                        </div>

                        {/* X-Axis Ticks */}
                        <div className="absolute bottom-6 left-12 w-80 flex justify-between px-6 text-[10px] font-bold text-gray-400">
                            {xValues.map(v => <span key={v}>{v}</span>)}
                        </div>

                        {/* X-Axis Label */}
                        <div className="absolute bottom-0 left-12 w-80 text-center text-[10px] font-black uppercase tracking-widest t-text-m">
                            {xAxisLabel}
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
};

export default FxParameterOptimizer;

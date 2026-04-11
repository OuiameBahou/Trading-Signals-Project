import React, { useState } from 'react';
import { 
    Settings2, Play, Activity, AlertCircle, Loader2, Plus, 
    Trash2, Cpu, BarChart2, TrendingUp, Layers, Sliders, Globe, Clock, Banknote
} from 'lucide-react';

const ASSETS = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY', 'USD/NOK'];
const TIMEFRAMES = ['1H', '4H', '1D'];

const INDICATOR_LIBRARY = [
    { id: 'rsi', name: 'RSI', desc: 'Relative Strength Index', color: 'border-blue-500/50', bg: 'bg-blue-500/10' },
    { id: 'macd', name: 'MACD', desc: 'Moving Average Conv/Div', color: 'border-purple-500/50', bg: 'bg-purple-500/10' },
    { id: 'psar', name: 'PSAR', desc: 'Parabolic SAR', color: 'border-emerald-500/50', bg: 'bg-emerald-500/10' },
    { id: 'bb', name: 'Bollinger Bands', desc: 'Volatility Bands', color: 'border-[#FFB81C]/50', bg: 'bg-[#FFB81C]/10' },
];

const FxStrategyBuilder = () => {
    // Top Bar State
    const [asset, setAsset] = useState('EUR/USD');
    const [timeframe, setTimeframe] = useState('1D');
    const [capital, setCapital] = useState(10000);

    // Workspace State
    const [activeIndicators, setActiveIndicators] = useState([
        { id: Date.now().toString() + '1', type: 'rsi', name: 'RSI', params: { window: 14 }, weight: 50, color: 'border-blue-500/50' },
        { id: Date.now().toString() + '2', type: 'macd', name: 'MACD', params: { fast: 12, slow: 26, signal: 9 }, weight: 80, color: 'border-purple-500/50' }
    ]);

    // Regime State
    const [volLow, setVolLow] = useState(0.5);
    const [volHigh, setVolHigh] = useState(1.5);
    const [trendBehavior, setTrendBehavior] = useState('Trend-Following');
    const [rangeBehavior, setRangeBehavior] = useState('Mean-Reversion');

    const [isOptimizing, setIsOptimizing] = useState(false);

    const addIndicator = (ind) => {
        const baseParams = 
            ind.id === 'rsi' ? { window: 14 } :
            ind.id === 'macd' ? { fast: 12, slow: 26, signal: 9 } :
            ind.id === 'psar' ? { step: 0.02, max_step: 0.2 } :
            { window: 20, std_dev: 2 };
            
        setActiveIndicators([...activeIndicators, {
            id: Date.now().toString(),
            type: ind.id,
            name: ind.name,
            params: baseParams,
            weight: 50,
            color: ind.color
        }]);
    };

    const removeIndicator = (id) => {
        setActiveIndicators(activeIndicators.filter(i => i.id !== id));
    };

    const updateIndicatorParam = (id, paramKey, val) => {
        setActiveIndicators(activeIndicators.map(ind => {
            if (ind.id === id) {
                return { ...ind, params: { ...ind.params, [paramKey]: parseFloat(val) || 0 }};
            }
            return ind;
        }));
    };

    const updateIndicatorWeight = (id, val) => {
        setActiveIndicators(activeIndicators.map(ind => {
            if (ind.id === id) {
                return { ...ind, weight: parseInt(val) };
            }
            return ind;
        }));
    };

    const runOptimization = () => {
        setIsOptimizing(true);
        setTimeout(() => setIsOptimizing(false), 3000);
    };

    return (
        <div className="h-full flex flex-col space-y-6 max-w-[1600px] mx-auto">
            
            {/* Header */}
            <div>
                <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
                    <Cpu className="text-[#FFB81C]" />
                    Strategy Architect
                </h1>
                <p className="text-xs t-text-m mt-2 uppercase tracking-widest font-bold">Deploy Regime-Aware Ensemble Algorithms</p>
            </div>

            {/* 1. Command Center (Top Bar) */}
            <div className="bg-[#12141A] border t-border-s rounded-xl p-4 flex flex-wrap items-center justify-between gap-6 shadow-md relative z-20">
                <div className="flex items-center gap-8">
                    {/* Asset Selector */}
                    <div className="flex items-center gap-3">
                        <Globe size={16} className="text-[#FFB81C] opacity-80" />
                        <div>
                            <div className="text-[9px] font-black t-text-m uppercase tracking-widest mb-1">Target Asset</div>
                            <select 
                                value={asset} onChange={(e) => setAsset(e.target.value)}
                                className="bg-transparent text-sm font-black text-white focus:outline-none cursor-pointer appearance-none pr-4"
                            >
                                {ASSETS.map(a => <option key={a} value={a} className="bg-[#12141A]">{a}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Timeframe Picker */}
                    <div className="flex items-center gap-3 border-l t-border-s pl-8">
                        <Clock size={16} className="text-[#FFB81C] opacity-80" />
                        <div>
                            <div className="text-[9px] font-black t-text-m uppercase tracking-widest mb-1">Granularity</div>
                            <div className="flex items-center gap-1">
                                {TIMEFRAMES.map(tf => (
                                    <button 
                                        key={tf}
                                        onClick={() => setTimeframe(tf)}
                                        className={`px-3 py-1 text-xs font-black rounded-md transition-colors ${timeframe === tf ? 'bg-[#FFB81C] text-black' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Capital Input */}
                    <div className="flex items-center gap-3 border-l t-border-s pl-8">
                        <Banknote size={16} className="text-[#FFB81C] opacity-80" />
                        <div>
                            <div className="text-[9px] font-black t-text-m uppercase tracking-widest mb-1">Initial Capital ($)</div>
                            <input 
                                type="number" 
                                value={capital}
                                onChange={(e) => setCapital(e.target.value)}
                                className="bg-transparent text-sm font-black text-emerald-400 focus:outline-none w-24"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFB81C]/10 border border-[#FFB81C]/20 text-[#FFB81C] text-[10px] uppercase font-black tracking-widest">
                    <Activity size={12} className="animate-pulse" />
                    Engine Active
                </div>
            </div>

            {/* Main Content Split */}
            <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
                
                {/* 2. Indicator Workspace (Left & Center) */}
                <div className="flex-1 flex gap-6 bg-[#0E1015] border t-border-s rounded-2xl p-6 overflow-hidden">
                    
                    {/* The Library (Sidebar) */}
                    <div className="w-64 flex flex-col border-r t-border-s pr-6">
                        <div className="text-[10px] font-black t-text-m uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Layers size={14} /> Indicator Library
                        </div>
                        <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-2">
                            {INDICATOR_LIBRARY.map(ind => (
                                <div 
                                    key={ind.id} 
                                    onClick={() => addIndicator(ind)}
                                    className={`p-4 rounded-xl border border-white/5 bg-[#12141A] hover:border-white/20 cursor-pointer transition-all hover:-translate-y-0.5 group`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-xs font-black text-white ${ind.bg} px-2 py-0.5 rounded`}>{ind.name}</span>
                                        <Plus size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                                    </div>
                                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{ind.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* The Canvas (Builder) */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="text-[10px] font-black t-text-m uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Sliders size={14} /> Assembly Canvas
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 pb-4">
                            {activeIndicators.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-2xl opacity-50">
                                    <Layers size={32} className="mb-3" />
                                    <span className="text-xs font-black uppercase tracking-widest">Canvas Empty</span>
                                    <span className="text-[10px] font-bold mt-1">Add indicators from the library</span>
                                </div>
                            ) : (
                                activeIndicators.map((ind, index) => (
                                    <div key={ind.id} className={`bg-[#12141A] border-l-4 ${ind.color} rounded-xl p-5 border-y border-r border-white/5 relative group shadow-lg`}>
                                        <button 
                                            onClick={() => removeIndicator(ind.id)}
                                            className="absolute top-4 right-4 text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        
                                        <div className="flex items-center gap-3 mb-5">
                                            <span className="text-lg font-black text-white bg-black/50 px-3 py-1 rounded-lg border border-white/10 shadow-inner">
                                                {ind.name}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Signal Node {index + 1}</span>
                                        </div>

                                        <div className="grid grid-cols-12 gap-6 items-end">
                                            {/* Parameters */}
                                            <div className="col-span-8 flex flex-wrap gap-4">
                                                {Object.entries(ind.params).map(([key, val]) => (
                                                    <div key={key} className="flex-1 min-w-[80px]">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">{key}</label>
                                                        <input 
                                                            type="number" step="any"
                                                            value={val}
                                                            onChange={(e) => updateIndicatorParam(ind.id, key, e.target.value)}
                                                            className="w-full bg-[#0A0C10] border border-white/10 rounded-lg px-3 py-2 text-sm font-black text-white focus:border-[#FFB81C]/50 focus:outline-none transition-colors shadow-inner"
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Weight Slider */}
                                            <div className="col-span-4 pl-6 border-l border-white/5">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <label className="text-[9px] font-black text-[#FFB81C] uppercase tracking-widest">Voting Weight</label>
                                                    <span className="text-xs font-black text-white">{ind.weight}%</span>
                                                </div>
                                                <input 
                                                    type="range" min="0" max="100" 
                                                    value={ind.weight}
                                                    onChange={(e) => updateIndicatorWeight(ind.id, e.target.value)}
                                                    className="w-full accent-[#FFB81C]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. Regime & Optimization Panel (Right Side) */}
                <div className="w-full xl:w-80 flex flex-col gap-6">
                    <div className="flex-1 t-card border t-border-s rounded-2xl p-6 flex flex-col relative overflow-hidden">
                        
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFB81C]/5 blur-[50px] pointer-events-none" />

                        <div className="text-[11px] font-black t-text uppercase tracking-[0.2em] mb-8 flex items-center gap-2 pb-4 border-b t-border-s relative z-10">
                            <TrendingUp size={16} className="text-[#FFB81C]" />
                            Regime Matrix
                        </div>

                        <div className="flex-1 space-y-8 relative z-10">
                            
                            {/* Volatility Thresholds */}
                            <div className="space-y-5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Volatility Boundaries (ATR)</label>
                                
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                        <span>Low Vol Boundary</span>
                                        <span className="text-white">{volLow.toFixed(1)}x</span>
                                    </div>
                                    <input 
                                        type="range" min="0.1" max="1.0" step="0.1" 
                                        value={volLow} onChange={e => setVolLow(parseFloat(e.target.value))}
                                        className="w-full accent-blue-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                        <span>High Vol Boundary</span>
                                        <span className="text-[#C8102E]">{volHigh.toFixed(1)}x</span>
                                    </div>
                                    <input 
                                        type="range" min="1.1" max="3.0" step="0.1" 
                                        value={volHigh} onChange={e => setVolHigh(parseFloat(e.target.value))}
                                        className="w-full accent-[#C8102E]"
                                    />
                                </div>
                            </div>

                            {/* Regime Behaviors */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Algorithmic Behavior</label>
                                
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Trend Regime</div>
                                    <select 
                                        value={trendBehavior} onChange={e => setTrendBehavior(e.target.value)}
                                        className="w-full bg-[#0A0C10] border border-white/10 rounded-lg px-3 py-2.5 text-xs font-black text-emerald-400 focus:outline-none appearance-none shadow-inner"
                                    >
                                        <option>Trend-Following</option>
                                        <option>Mean-Reversion</option>
                                        <option>Standby (Flat)</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Range Regime</div>
                                    <select 
                                        value={rangeBehavior} onChange={e => setRangeBehavior(e.target.value)}
                                        className="w-full bg-[#0A0C10] border border-white/10 rounded-lg px-3 py-2.5 text-xs font-black text-blue-400 focus:outline-none appearance-none shadow-inner"
                                    >
                                        <option>Mean-Reversion</option>
                                        <option>Trend-Following</option>
                                        <option>Standby (Flat)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Launch Button */}
                        <div className="mt-8 relative z-10 pt-6 border-t t-border-s">
                            <button 
                                onClick={runOptimization}
                                disabled={isOptimizing || activeIndicators.length === 0}
                                className={`w-full py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all shadow-[0_0_20px_rgba(255,184,28,0.15)] active:scale-[0.98] ${
                                    isOptimizing 
                                        ? 'bg-[#FFB81C]/80 pointer-events-none' 
                                        : 'bg-gradient-to-b from-[#FFB81C] to-[#e5a519] hover:brightness-110'
                                }`}
                            >
                                <div className="flex items-center gap-2 text-black font-black uppercase tracking-[0.15em]">
                                    {isOptimizing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-black" />}
                                    {isOptimizing ? 'Compiling Nodes...' : 'Run Optimization'}
                                </div>
                                <span className="text-[9px] font-bold text-black/60 uppercase tracking-wider">
                                    Using MPI Parallel Processing: [8] Ranks detected
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default FxStrategyBuilder;


import { useState, useEffect } from 'react';
import { LayoutDashboard, Share2, Thermometer, Zap, Globe, Info, Activity, ChevronDown, Play, Layers, SlidersHorizontal, Compass, BarChart3, Newspaper, Target, Brain, PieChart, Sparkles } from 'lucide-react';

const Sidebar = ({ activePage, onNavigate }) => {
    // Determine which accordion should be open by default based on the active page
    const isFxPage  = activePage.startsWith('fx-');
    const isNlpPage = activePage.startsWith('nlp-');
    const [openProject, setOpenProject] = useState(isNlpPage ? 'nlp' : isFxPage ? 'fx' : 'lead-lag');
    useEffect(() => {
        if (isNlpPage) setOpenProject('nlp');
        else if (isFxPage) setOpenProject('fx');
    }, [isFxPage, isNlpPage]);

    const leadLagItems = [
        { id: 'dashboard', label: 'Intelligence Hub', icon: LayoutDashboard },
        { id: 'asset-directory', label: 'Asset Universe', icon: Globe },
        { id: 'signals', label: 'Pair Analysis', icon: Zap },
        { id: 'network', label: 'Leadership Network', icon: Share2 },
        { id: 'correlation', label: 'Correlation Matrix', icon: Thermometer },
        { id: 'market-regimes', label: 'Market Regimes', icon: Thermometer },
        { id: 'trading-signals', label: 'Trading Signals', icon: Zap },
    ];

    const fxItems = [
        { id: 'fx-command',    label: 'Asset Overview',       icon: Activity          },
        { id: 'fx-backtest',   label: 'Backtest Runner',      icon: Play              },
        { id: 'fx-combination',label: 'Combo Explorer',       icon: Layers            },
        { id: 'fx-param-opt',  label: 'Param Optimizer',      icon: SlidersHorizontal },
        { id: 'fx-regime-opt', label: 'Regime Optimizer',     icon: Compass           },
        { id: 'fx-multi-asset',label: 'Multi-Asset View',     icon: BarChart3         },
    ];

    const nlpItems = [
        { id: 'nlp-command',    label: 'Sentiment Hub',       icon: Brain             },
        { id: 'nlp-sentiment',  label: 'Sentiment by Ticker', icon: PieChart          },
        { id: 'nlp-ticker',     label: 'Ticker Deep Dive',    icon: Newspaper         },
        { id: 'nlp-polymarket', label: 'Polymarket Intel',    icon: Target            },
        { id: 'nlp-correlation',label: 'Sentiment Correl.',   icon: Sparkles          },
    ];

    return (
        <aside className="w-64 h-screen t-bg t-border-s border-r flex flex-col flex-shrink-0 relative z-20 transition-colors duration-500" style={{ backgroundColor: 'var(--sidebar-bg)' }}>

            {/* Logo */}
            <div className="px-6 py-6 t-border-s border-b transition-colors">
                <div className="text-[13px] font-black t-text tracking-[0.12em] uppercase leading-tight transition-colors">Trading Bot</div>
                <div className="text-[8px] text-[#C8102E] font-black uppercase tracking-[0.2em] mt-0.5">Quant Platform</div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
                
                {/* Project 1: Lead-Lag Signals */}
                <div className="mb-2">
                    <button 
                        onClick={() => setOpenProject(openProject === 'lead-lag' ? null : 'lead-lag')}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors hover:bg-[var(--surface-hover)] group mb-1"
                    >
                        <div className="text-[10px] font-black t-text-m group-hover:t-text uppercase tracking-[0.2em] transition-colors">Lead-Lag Analytics</div>
                        <ChevronDown size={14} className={`t-text-m transition-transform duration-300 ${openProject === 'lead-lag' ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <div className={`space-y-0.5 overflow-hidden transition-all duration-300 ${openProject === 'lead-lag' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        {leadLagItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activePage === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-[#C8102E]/10 text-[#C8102E]' : 't-text-s hover:t-text hover:bg-[var(--surface-hover)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Icon size={16} className={isActive ? 'text-[#C8102E]' : 't-text-m group-hover:t-text transition-colors'} />
                                        <span className={`text-[12px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Project 2: Indicators Engine */}
                <div className="mb-2">
                    <button
                        onClick={() => setOpenProject(openProject === 'fx' ? null : 'fx')}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors hover:bg-[var(--surface-hover)] group mb-1"
                    >
                        <div className="text-[10px] font-black t-text-m group-hover:t-text uppercase tracking-[0.2em] transition-colors">Indicators Engine</div>
                        <ChevronDown size={14} className={`t-text-m transition-transform duration-300 ${openProject === 'fx' ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <div className={`space-y-0.5 overflow-hidden transition-all duration-300 ${openProject === 'fx' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        {fxItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activePage === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-[#FFB81C]/10 text-[#FFB81C]' : 't-text-s hover:t-text hover:bg-[var(--surface-hover)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Icon size={16} className={isActive ? 'text-[#FFB81C]' : 't-text-m group-hover:t-text transition-colors'} />
                                        <span className={`text-[12px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Project 3: NLP Sentiment Engine */}
                <div className="mb-2">
                    <button
                        onClick={() => setOpenProject(openProject === 'nlp' ? null : 'nlp')}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors hover:bg-[var(--surface-hover)] group mb-1"
                    >
                        <div className="text-[10px] font-black t-text-m group-hover:t-text uppercase tracking-[0.2em] transition-colors">NLP Sentiment Engine</div>
                        <ChevronDown size={14} className={`t-text-m transition-transform duration-300 ${openProject === 'nlp' ? 'rotate-180' : ''}`} />
                    </button>

                    <div className={`space-y-0.5 overflow-hidden transition-all duration-300 ${openProject === 'nlp' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        {nlpItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activePage === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 't-text-s hover:t-text hover:bg-[var(--surface-hover)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Icon size={16} className={isActive ? 'text-emerald-400' : 't-text-m group-hover:t-text transition-colors'} />
                                        <span className={`text-[12px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="px-4 py-4 t-border-s border-t transition-colors">
                <div className="t-card rounded-xl p-3.5 t-border-s border shadow-sm transition-colors">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Info size={11} className={openProject === 'nlp' ? 'text-emerald-400' : openProject === 'fx' ? 'text-[#FFB81C]' : 'text-[#C8102E]'} />
                        <span className="text-[9px] font-black t-text-m uppercase tracking-widest transition-colors">Engine Status</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] t-text-m transition-colors">Coverage</span>
                            <span className="text-[10px] t-text font-black transition-colors">{openProject === 'nlp' ? 'NLP Pipeline' : openProject === 'fx' ? '14 Assets' : '39 Assets'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] t-text-m transition-colors">Data Feed</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-[8px] text-center t-text-m font-bold uppercase tracking-[0.15em] leading-relaxed transition-colors">
                    © 2026 Trading Bot Platform<br />Quant Research Division
                </p>
            </div>
        </aside>
    );
};

export default Sidebar;



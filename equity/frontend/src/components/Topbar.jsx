import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Clock, Search, Activity, X, ArrowUpRight, Globe, Zap, Share2, Thermometer, LayoutDashboard, Moon, Sun, Menu } from 'lucide-react';
import useFetch from '../hooks/useFetch';
import { useTheme } from '../context/ThemeContext';

const formatAsset = (name) => {
    if (!name) return '—';
    return String(name).replace(/_/g, ' ');
};

/* ─── Page catalog for navigation results ─────────────────────── */
const PAGE_CATALOG = [
    { id: 'dashboard', label: 'Intelligence Hub', desc: 'KPIs, overview, Elite Signal Hub', icon: LayoutDashboard, keywords: ['dashboard', 'hub', 'kpi', 'overview', 'elite', 'summary', 'home'] },
    { id: 'asset-directory', label: 'Asset Universe', desc: 'All assets, categories, leader/follower counts', icon: Globe, keywords: ['asset', 'universe', 'directory', 'category', 'fx', 'rates', 'commodities', 'indices'] },
    { id: 'signals', label: 'Pair Analysis', desc: 'Validated lead-lag pairs by validation profile', icon: Zap, keywords: ['pair', 'analysis', 'signal', 'scanner', 'lag', 'granger', 'var', 'validation', 'proof', 'alpha'] },
    { id: 'network', label: 'Leadership Network', desc: 'D3 force graph of leader-follower ecosystem', icon: Share2, keywords: ['network', 'leadership', 'graph', 'influence', 'ecosystem', 'force'] },
    { id: 'correlation', label: 'Correlation Matrix', desc: 'Pearson cross-asset heatmap', icon: Thermometer, keywords: ['correlation', 'matrix', 'pearson', 'heatmap'] },
    { id: 'fx-dashboard', label: 'FX Market Overview', desc: 'Overview of G10 FX pair regimes', icon: Activity, keywords: ['fx', 'market', 'overview', 'regime', 'g10'] },
    { id: 'fx-builder', label: 'Strategy Builder', desc: 'Backtest custom technical indicator signals', icon: Zap, keywords: ['fx', 'strategy', 'backtest', 'builder', 'indicators'] },
    { id: 'fx-command', label: 'Market Overview', desc: 'Overall FX market command center', icon: Activity, keywords: ['fx', 'command', 'center', 'market', 'overview'] },
    { id: 'fx-backtest', label: 'Backtest Runner', desc: 'Run custom FX backtests', icon: Activity, keywords: ['fx', 'backtest', 'runner', 'engine'] },
    { id: 'fx-combination', label: 'Combo Explorer', desc: 'Explore combinations of technical indicators', icon: Zap, keywords: ['fx', 'combination', 'explorer', 'indicators', 'combo'] },
    { id: 'fx-param-opt', label: 'Param Optimizer', desc: 'Optimize strategy parameters', icon: Activity, keywords: ['fx', 'param', 'optimizer', 'optimization'] },
    { id: 'fx-regime-opt', label: 'Regime Optimizer', desc: 'Optimize regime strategies', icon: Activity, keywords: ['fx', 'regime', 'optimizer', 'market'] },
    { id: 'fx-multi-asset', label: 'Multi-Asset View', desc: 'Compare multiple FX pairs', icon: LayoutDashboard, keywords: ['fx', 'multi-asset', 'compare', 'multiple'] }
];

const Topbar = ({ activePage, summary, onNavigate, onMenuToggle }) => {
    const [time, setTime] = useState(new Date());
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const { theme, toggleTheme } = useTheme();

    // Fetch data for searching
    const { data: assetsData } = useFetch('/api/assets');
    const { data: pairsData } = useFetch('/api/pairs');
    const { data: fxPairsData } = useFetch('/api/fx/data-pairs');

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Close search dropdown on click outside
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Keyboard shortcut: Ctrl+K to focus search
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const formattedDate = time.toLocaleDateString('en-US', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
    const h = String(time.getHours()).padStart(2, '0');
    const m = String(time.getMinutes()).padStart(2, '0');
    const s = String(time.getSeconds()).padStart(2, '0');
    const formattedTime = `${h}:${m}:${s}`;

    const pageLabels = {
        'dashboard': 'Intelligence Hub',
        'asset-directory': 'Asset Universe',
        'signals': 'Pair Analysis',
        'network': 'Leadership Network',
        'correlation': 'Correlation Matrix',
        'market-regimes': 'Market Regimes',
        'trading-signals': 'Trading Signals',
        'fx-dashboard':  'FX Market Overview',
        'fx-builder':    'Strategy Builder',
        'fx-signals':    'Live Trading Signals',
        'fx-command':    'Market Overview',
        'fx-backtest':   'Backtest Runner',
        'fx-combination':'Combo Explorer',
        'fx-param-opt':  'Param Optimizer',
        'fx-regime-opt': 'Regime Optimizer',
        'fx-multi-asset':'Multi-Asset View',
    };

    /* ─── Search logic ─────────────────────────────────────────── */
    const results = useMemo(() => {
        if (!query.trim()) return { pages: [], assets: [], pairs: [], fxPairs: [] };
        const q = query.toLowerCase().trim();

        // Pages
        const pages = PAGE_CATALOG.filter(p =>
            p.label.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q) ||
            p.keywords.some(k => k.includes(q))
        ).slice(0, 3);

        // Assets
        const assets = (assetsData || []).filter(a =>
            a.Asset?.toLowerCase().includes(q) ||
            a.Category?.toLowerCase().includes(q)
        ).slice(0, 3);

        // Pairs (leader → follower)
        const pairs = (pairsData || []).filter(p =>
            p.Leader?.toLowerCase().includes(q) ||
            p.Follower?.toLowerCase().includes(q)
        ).slice(0, 3);

        // FX Pairs
        const fxPairs = (fxPairsData || []).filter(p =>
            p.name?.toLowerCase().includes(q)
        ).slice(0, 3);

        return { pages, assets, pairs, fxPairs };
    }, [query, assetsData, pairsData, fxPairsData]);

    const hasResults = results.pages.length > 0 || results.assets.length > 0 || results.pairs.length > 0 || (results.fxPairs && results.fxPairs.length > 0);

    const handleNavigate = useCallback((pageId) => {
        if (onNavigate) onNavigate(pageId);
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
    }, [onNavigate]);

    return (
        <header className="h-16 t-bg t-border border-b flex items-center justify-between px-8 sticky top-0 z-30 transition-colors">
            {/* Left: burger menu + page name */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuToggle}
                    className="p-2 rounded-xl t-elevated t-border border transition-all hover:border-white/20 hover:bg-white/6"
                    title="Open navigation"
                >
                    <Menu size={16} className="t-text" />
                </button>

                <div className="w-px h-5 t-border-s border-r transition-colors" />

                <span className="text-[13px] font-black t-text uppercase tracking-widest transition-colors">
                    {pageLabels[activePage] || activePage}
                </span>
            </div>

            {/* Center: global search */}

            <div className="relative" ref={dropdownRef}>
                <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-awb-red transition-colors" size={14} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search assets, signals, metrics..."
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                        onFocus={() => { if (query.trim()) setIsOpen(true); }}
                        className="t-input t-border border rounded-xl py-2 pl-10 pr-10 text-sm t-text w-64 focus:outline-none focus:border-awb-red/30 transition-colors font-medium placeholder:text-gray-500"
                    />
                    {query && (
                        <button
                            onClick={() => { setQuery(''); setIsOpen(false); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Dropdown results */}
                {isOpen && query.trim() && (
                    <div className="absolute top-full mt-2 left-0 w-[480px] t-card t-border border rounded-2xl shadow-2xl overflow-hidden z-50 transition-colors"
                        style={{ maxHeight: '70vh', overflowY: 'auto' }}>

                        {!hasResults && (
                            <div className="px-6 py-8 text-center">
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">No results for "{query}"</p>
                                <p className="text-[9px] text-gray-600 mt-1">Try searching for an asset name, pair, or page</p>
                            </div>
                        )}

                        {/* Pages section */}
                        {results.pages.length > 0 && (
                            <div className="px-2 pt-2">
                                <div className="px-3 py-2">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Pages</span>
                                </div>
                                {results.pages.map(page => {
                                    const Icon = page.icon;
                                    return (
                                        <button
                                            key={page.id}
                                            onClick={() => handleNavigate(page.id)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-awb-red/10 flex items-center justify-center flex-shrink-0 border border-awb-red/10">
                                                <Icon size={14} className="text-awb-red" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold text-white group-hover:text-awb-red transition-colors">{page.label}</div>
                                                <div className="text-[9px] text-gray-500 truncate">{page.desc}</div>
                                            </div>
                                            <span className="text-[8px] font-bold text-gray-700 uppercase tracking-widest flex-shrink-0">Navigate</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Assets section */}
                        {results.assets.length > 0 && (
                            <div className="px-2 pt-1">
                                <div className="px-3 py-2 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Assets</span>
                                    <span className="text-[8px] text-gray-700 font-bold">{results.assets.length} found</span>
                                </div>
                                {results.assets.map((asset, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleNavigate('asset-directory')}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0 border border-navy-700">
                                            <Globe size={13} className="text-gray-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-white group-hover:text-awb-red transition-colors font-mono uppercase tracking-tight">
                                                {formatAsset(asset.Asset)}
                                            </div>
                                            <div className="text-[9px] text-gray-500">
                                                {asset.Category || 'Unknown'} · Leaders: {asset.Leader_Count ?? '—'} · Followers: {asset.Follower_Count ?? '—'}
                                            </div>
                                        </div>
                                        <span className="text-[8px] font-bold text-gray-700 uppercase tracking-widest flex-shrink-0">Asset</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Pairs section */}
                        {results.pairs.length > 0 && (
                            <div className="px-2 pt-1 pb-2">
                                <div className="px-3 py-2 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Signal Pairs</span>
                                    <span className="text-[8px] text-gray-700 font-bold">{results.pairs.length} found</span>
                                </div>
                                {results.pairs.map((pair, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleNavigate('signals')}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0 border border-navy-700">
                                            <ArrowUpRight size={13} className="text-awb-red" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-white group-hover:text-awb-red transition-colors font-mono uppercase tracking-tight">
                                                {formatAsset(pair.Leader)} → {formatAsset(pair.Follower)}
                                            </div>
                                            <div className="text-[9px] text-gray-500">
                                                {pair.Robustesse || '—'} · Score: {pair.Score_Final ? (pair.Score_Final * 100).toFixed(1) + '%' : '—'} · +{pair.Lead_Days || '?'}d
                                            </div>
                                        </div>
                                        <span className={`text-[8px] font-black uppercase tracking-widest flex-shrink-0 px-1.5 py-0.5 rounded ${Number(pair.N_Methods) === 3 ? 'text-awb-red bg-awb-red/10' : Number(pair.N_Methods) === 2 ? 'text-awb-gold bg-awb-gold/10' : 'text-gray-500 bg-navy-800'
                                            }`}>
                                            {pair.N_Methods}x
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* FX Pairs section */}
                        {results.fxPairs && results.fxPairs.length > 0 && (
                            <div className="px-2 pt-1 pb-2">
                                <div className="px-3 py-2 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">FX Data Pairs</span>
                                    <span className="text-[8px] text-gray-700 font-bold">{results.fxPairs.length} found</span>
                                </div>
                                {results.fxPairs.map((pair, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleNavigate('fx-command')}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0 border border-navy-700">
                                            <Activity size={13} className="text-gray-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-white group-hover:text-awb-red transition-colors font-mono uppercase tracking-tight">
                                                {formatAsset(pair.name)}
                                            </div>
                                            <div className="text-[9px] text-gray-500 truncate">
                                                FX Dataset
                                            </div>
                                        </div>
                                        <span className="text-[8px] font-bold text-gray-700 uppercase tracking-widest flex-shrink-0">FX Asset</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right: stats + clock + theme toggle */}
            <div className="flex items-center gap-5">
                {summary?.official_pairs && (
                    <div className="flex items-center gap-2">
                        <Activity size={13} className="text-awb-red" />
                        <span className="text-[11px] font-bold t-text transition-colors">{summary.official_pairs}</span>
                        <span className="text-[10px] t-text-m font-bold uppercase tracking-widest transition-colors">Validated Pairs</span>
                    </div>
                )}

                <div className="w-px h-5 t-border-s border-r transition-colors" />

                <div className="flex items-center gap-2.5 text-[11px] font-mono">
                    <Clock size={13} className="text-awb-red" />
                    <span className="t-text-m font-bold transition-colors">{formattedDate}</span>
                    <span className="t-text font-bold transition-colors">{formattedTime}</span>
                </div>

                <div className="w-px h-5 t-border-s border-r transition-colors" />

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl t-elevated t-border border flex items-center justify-center t-text-s hover:text-awb-red transition-all group"
                    title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                >
                    {theme === 'dark' ? (
                        <Sun size={15} className="group-hover:rotate-45 transition-transform duration-300" />
                    ) : (
                        <Moon size={15} className="group-hover:-rotate-12 transition-transform duration-300" />
                    )}
                </button>
            </div>
        </header>
    );
};

export default Topbar;

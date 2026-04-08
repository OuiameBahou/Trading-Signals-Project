import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Activity, BarChart2, ShieldAlert, Target, Info, X, ChevronRight } from 'lucide-react';
import useFetch from '../hooks/useFetch';

// ── Regime colors ──────────────────────────────────────────────────────────
const REGIME_COLOR = {
    'Bull':            '#22c55e',
    'Bear':            '#ef4444',
    'High Volatility': '#a855f7',
    'Range':           '#9ca3af',
    'Unknown':         '#374151',
};

const regimeMeta = {
    'Bull':            { color: 'bg-green-500',  text: 'text-green-500',  desc: 'Trend Up, Low Vol' },
    'Bear':            { color: 'bg-red-500',    text: 'text-red-500',    desc: 'Trend Down, Med Vol' },
    'High Volatility': { color: 'bg-purple-500', text: 'text-purple-500', desc: 'Market Stress / Shocks' },
    'Range':           { color: 'bg-gray-400',   text: 'text-gray-400',   desc: 'Consolidation' },
    'Unknown':         { color: 'bg-gray-700',   text: 'text-gray-500',   desc: 'Detecting...' },
};

// ── Icons ──────────────────────────────────────────────────────────────────
function TrendingUpIcon({ className, size = 24 }) {
    return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>;
}
function TrendingDownIcon({ className, size = 24 }) {
    return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg>;
}

const ICON_MAP = {
    'Bull': TrendingUpIcon,
    'Bear': TrendingDownIcon,
    'High Volatility': ShieldAlert,
    'Range': Target,
    'Unknown': Activity,
};

// ── Regime Timeline Chart ──────────────────────────────────────────────────
function RegimeTimeline({ leader, follower, onClose }) {
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState(null);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/regime_history/${leader}`)
            .then(r => r.json())
            .then(data => {
                setHistory(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => { setHistory([]); setLoading(false); });
    }, [leader]);

    // Group consecutive same-regime segments for block rendering
    const segments = useMemo(() => {
        if (!history || history.length === 0) return [];
        const segs = [];
        let cur = { regime: history[0].Regime, start: 0, end: 0, startDate: history[0].Date, endDate: history[0].Date };
        for (let i = 1; i < history.length; i++) {
            if (history[i].Regime === cur.regime) {
                cur.end = i;
                cur.endDate = history[i].Date;
            } else {
                segs.push({ ...cur });
                cur = { regime: history[i].Regime, start: i, end: i, startDate: history[i].Date, endDate: history[i].Date };
            }
        }
        segs.push({ ...cur });
        return segs;
    }, [history]);

    // Year tick positions
    const yearTicks = useMemo(() => {
        if (!history || history.length === 0) return [];
        const ticks = [];
        let prevYear = null;
        history.forEach((row, i) => {
            const year = row.Date.slice(0, 4);
            if (year !== prevYear) { ticks.push({ year, idx: i }); prevYear = year; }
        });
        return ticks;
    }, [history]);

    const n = history ? history.length : 1;

    // Summary counts
    const summary = useMemo(() => {
        if (!history) return {};
        return history.reduce((acc, row) => {
            acc[row.Regime] = (acc[row.Regime] || 0) + 1;
            return acc;
        }, {});
    }, [history]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <div className="t-card t-border border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden" style={{ maxHeight: '90vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 t-border border-b">
                    <div>
                        <h3 className="text-sm font-black t-text uppercase tracking-widest flex items-center gap-2">
                            <span className="text-awb-red">{leader.replace(/_/g, ' ')}</span>
                            <ChevronRight size={14} className="text-awb-red" />
                            <span className="t-text-m">{follower.replace(/_/g, ' ')}</span>
                        </h3>
                        <p className="text-[10px] t-text-m font-bold uppercase tracking-widest mt-0.5">
                            Regime History — Out-of-Sample 2023–2026 · {n} trading days
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl t-border border hover:bg-[var(--surface-hover)] t-text-m hover:t-text transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="py-16 text-center t-text-m text-sm font-bold">No regime data available for {leader}</div>
                    ) : (
                        <>
                            {/* Distribution pills */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                {Object.entries(summary).sort((a, b) => b[1] - a[1]).map(([regime, count]) => (
                                    <div key={regime} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border t-border t-card">
                                        <span className="w-2 h-2 rounded-full" style={{ background: REGIME_COLOR[regime] || '#9ca3af' }} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest t-text">{regime}</span>
                                        <span className="text-[10px] font-bold t-text-m">{((count / n) * 100).toFixed(0)}%</span>
                                        <span className="text-[9px] t-text-s">({count}d)</span>
                                    </div>
                                ))}
                            </div>

                            {/* Timeline bar */}
                            <div className="mb-2">
                                <p className="text-[9px] font-bold uppercase tracking-widest t-text-m mb-3">Regime Transitions</p>

                                {/* Main bar */}
                                <div className="relative h-10 rounded-xl overflow-hidden flex" style={{ border: '1px solid var(--border-color)' }}>
                                    {segments.map((seg, si) => {
                                        const width = ((seg.end - seg.start + 1) / n) * 100;
                                        return (
                                            <div
                                                key={si}
                                                className="h-full transition-opacity relative group"
                                                style={{
                                                    width: `${width}%`,
                                                    background: REGIME_COLOR[seg.regime] || '#9ca3af',
                                                    opacity: 0.85,
                                                }}
                                                onMouseEnter={e => setTooltip({ seg, x: e.clientX, y: e.clientY })}
                                                onMouseLeave={() => setTooltip(null)}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Year ticks */}
                                <div className="relative h-5 mt-1">
                                    {yearTicks.map(({ year, idx }) => (
                                        <div
                                            key={year}
                                            className="absolute flex flex-col items-center"
                                            style={{ left: `${(idx / n) * 100}%`, transform: 'translateX(-50%)' }}
                                        >
                                            <div className="w-px h-2 bg-[var(--border-color)]" />
                                            <span className="text-[9px] font-bold t-text-s">{year}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>



                            {/* Legend */}
                            <div className="flex flex-wrap gap-4 mt-6 pt-4 t-border border-t">
                                {Object.entries(REGIME_COLOR).filter(([k]) => k !== 'Unknown').map(([regime, color]) => (
                                    <div key={regime} className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded" style={{ background: color }} />
                                        <span className="text-[9px] font-bold uppercase tracking-widest t-text-m">{regime}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-[60] t-card t-border border rounded-xl px-3 py-2 text-[10px] font-bold shadow-xl pointer-events-none"
                    style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
                >
                    <p style={{ color: REGIME_COLOR[tooltip.seg.regime] }} className="uppercase tracking-widest">{tooltip.seg.regime}</p>
                    <p className="t-text-m font-mono mt-0.5">{tooltip.seg.startDate} → {tooltip.seg.endDate}</p>
                    <p className="t-text-s mt-0.5">{tooltip.seg.end - tooltip.seg.start + 1} days</p>
                </div>
            )}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
const MarketRegimes = () => {
    const { data: regimesData, loading, error } = useFetch('/api/market_regimes');
    const [filterRegime, setFilterRegime] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPair, setSelectedPair] = useState(null); // { leader, follower }

    const processedData = useMemo(() => {
        if (!regimesData) return [];
        const arr = regimesData.value || regimesData;
        if (!Array.isArray(arr)) return [];
        return arr;
    }, [regimesData]);

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
        </div>
    );
    if (error) return <div className="text-red-500 font-bold p-8">Error loading market regimes data.</div>;

    // Calculate distribution
    const distribution = processedData.reduce((acc, row) => {
        const regime = row.Current_Regime || 'Unknown';
        acc[regime] = (acc[regime] || 0) + 1;
        return acc;
    }, {});

    const totalPairs = processedData.length;

    const filteredPairs = processedData.filter(p => {
        const matchesRegime = filterRegime === 'All' || p.Current_Regime === filterRegime;
        const matchesSearch = !searchQuery ||
            String(p.Leader).toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(p.Follower).toLowerCase().includes(searchQuery.toLowerCase());
        return matchesRegime && matchesSearch;
    });

    return (
        <div className="space-y-6">

            {/* Regime History Modal */}
            {selectedPair && (
                <RegimeTimeline
                    leader={selectedPair.leader}
                    follower={selectedPair.follower}
                    onClose={() => setSelectedPair(null)}
                />
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 t-border border-b transition-colors mt-8 md:mt-0">
                <div>
                    <h2 className="text-2xl font-black t-text transition-colors flex items-center gap-3">
                        <BarChart2 className="text-awb-red" />
                        Regime <span className="text-awb-red">Scanner</span>
                    </h2>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest mt-1 transition-colors flex items-center gap-2">
                        <Info size={12} /> Specific HMM Detection per Leader · Click a pair to see its regime timeline
                    </p>
                </div>
            </div>

            {/* Distribution Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {Object.keys(regimeMeta).filter(k => k !== 'Unknown').map(regime => {
                    const count = distribution[regime] || 0;
                    const pct = totalPairs > 0 ? ((count / totalPairs) * 100).toFixed(1) : 0;
                    const meta = regimeMeta[regime];
                    return (
                        <div key={regime} className="t-card p-6 rounded-xl t-border border flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${meta.color}`}></span>
                                <span className="text-xs font-bold uppercase tracking-widest t-text">{regime}</span>
                            </div>
                            <div className="flex items-end justify-between mt-2">
                                <span className="text-3xl font-black t-text">{pct}%</span>
                                <span className="text-xs t-text-m font-bold uppercase mb-1">{count} Pairs</span>
                            </div>
                            <p className="text-[9px] t-text-s uppercase tracking-widest font-bold">{meta.desc}</p>
                        </div>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                <button
                    onClick={() => setFilterRegime('All')}
                    className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all shrink-0
                            ${filterRegime === 'All' ? 'bg-awb-red text-white border-transparent' : 'bg-transparent t-border t-text hover:bg-black/5'}`}
                >
                    All Regimes ({totalPairs})
                </button>
                {Object.keys(regimeMeta).map(regime => {
                    const count = distribution[regime] || 0;
                    if (count === 0 && regime !== 'Unknown') return null;
                    const meta = regimeMeta[regime] || regimeMeta['Unknown'];
                    return (
                        <button
                            key={regime}
                            onClick={() => setFilterRegime(regime)}
                            className={`px-4 py-2 text-[10px] items-center flex gap-2 font-bold uppercase tracking-widest rounded-lg border transition-all shrink-0
                                    ${filterRegime === regime ? 'bg-black/10 t-border t-text' : 'bg-transparent t-border t-text-m hover:t-text hover:bg-black/5'}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${meta.color}`}></span>
                            {regime} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Asset Search */}
            <div className="mb-6 relative">
                <input
                    type="text"
                    placeholder="Filter by Asset (ex: SP500, EURUSD) ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent t-border border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-awb-red transition-colors t-text"
                />
            </div>

            {/* List of Pairs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
                {filteredPairs.length === 0 ? (
                    <div className="col-span-full h-32 flex flex-col items-center justify-center t-text-m font-bold uppercase tracking-widest border t-border border-dashed rounded-xl t-card transition-colors">
                        No pairs found matching criteria.
                    </div>
                ) : (
                    filteredPairs.map((pair, i) => {
                        const regime = pair.Current_Regime || 'Unknown';
                        const meta = regimeMeta[regime] || regimeMeta['Unknown'];
                        const Icon = ICON_MAP[regime] || Activity;

                        return (
                            <div
                                key={i}
                                onClick={() => setSelectedPair({ leader: pair.Leader, follower: pair.Follower })}
                                className="t-card p-4 rounded-xl t-border border flex flex-col justify-between transition-all hover:border-awb-red/30 group cursor-pointer hover:shadow-lg"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1.5 transition-colors border ${meta.color.replace('bg-', 'bg-').replace('-500', '-500/20').replace('-400', '-400/20')} ${meta.text}`}>
                                        <Icon size={10} />
                                        {regime}
                                    </div>
                                    <span className="text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors font-mono opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                        <Activity size={9} /> Timeline
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                    <span className="text-sm font-black t-text uppercase tracking-tight truncate max-w-[45%] group-hover:text-awb-red transition-colors">{String(pair.Leader).replace(/_/g, ' ')}</span>
                                    <div className="w-4 h-4 rounded-full t-elevated flex items-center justify-center t-border border transition-colors shrink-0">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-awb-red"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                                    </div>
                                    <span className="text-sm font-bold t-text-m uppercase tracking-tight truncate max-w-[45%] transition-colors">{String(pair.Follower).replace(/_/g, ' ')}</span>
                                </div>

                                {/* Mini regime bar preview */}
                                <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: `${REGIME_COLOR[regime]}33` }}>
                                    <div className="h-full rounded-full" style={{ background: REGIME_COLOR[regime], width: '100%' }} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

        </div>
    );
};

export default MarketRegimes;

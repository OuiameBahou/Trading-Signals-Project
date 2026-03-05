import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { RefreshCw, Zap, Filter, X, ChevronDown, Search } from 'lucide-react';
import useFetch from '../hooks/useFetch';

// ─── Category color map ────────────────────────────────────────────────────────
const CAT_COLORS = {
    'Rates': '#06b6d4',  // cyan
    'FX G10': '#3b82f6',  // blue
    'Commodities': '#f59e0b',  // amber
    'Indices': '#f43f5e',  // rose
    'FX_G10': '#3b82f6',
    'FX': '#3b82f6',
    'Bonds': '#06b6d4',
    'Bond': '#06b6d4',
    'Commodites': '#f59e0b',
    'Commodity': '#f59e0b',
    'Index': '#f43f5e',
    'Equities': '#a855f7',
    'Equity': '#a855f7',
};

const CAT_LABELS = {
    'FX_G10': 'FX / G10',
    'FX': 'FX / G10',
    'Indices': 'Indices',
    'Index': 'Indices',
    'Bonds': 'Bonds',
    'Bond': 'Bonds',
    'Commodites': 'Commodities',
    'Commodity': 'Commodities',
    'Equities': 'Equities',
    'Equity': 'Equities',
};

function getColor(cat) {
    if (!cat) return '#6b7280';
    for (const key of Object.keys(CAT_COLORS)) {
        if (cat.includes(key) || key.includes(cat)) return CAT_COLORS[key];
    }
    return '#6b7280';
}

function getLabel(cat) {
    if (!cat) return 'Other';
    for (const key of Object.keys(CAT_LABELS)) {
        if (cat.includes(key) || key.includes(cat)) return CAT_LABELS[key];
    }
    return cat;
}

// ─── Unique categories for legend/filter ──────────────────────────────────────
const DISPLAY_CATS = [
    { key: 'Indices', label: 'Indices', color: '#f43f5e' },
    { key: 'FX G10', label: 'FX / G10', color: '#3b82f6' },
    { key: 'Rates', label: 'Rates', color: '#06b6d4' },
    { key: 'Commodities', label: 'Commodities', color: '#f59e0b' },
    { key: 'Equities', label: 'Equities', color: '#a855f7' },
];

// ─── Main component ────────────────────────────────────────────────────────────
const LeadershipNetwork = () => {
    const { data: allPairs, loading } = useFetch('/api/all_pairs');
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const simRef = useRef(null);

    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [activeCats, setActiveCats] = useState(() => Object.fromEntries(DISPLAY_CATS.map(c => [c.key, true])));
    const [minMethods, setMinMethods] = useState(1);   // 1 = any, 2 = double+, 3 = triple only
    const [searchAsset, setSearchAsset] = useState('');
    const [selectedAssets, setSelectedAssets] = useState(new Set()); // empty = all
    const [filterOpen, setFilterOpen] = useState(false);
    const [hoveredNode, setHoveredNode] = useState(null);

    // Resize observer
    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };
        update();
        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // All unique assets from data
    const allAssets = useMemo(() => {
        if (!allPairs) return [];
        const map = {};
        allPairs.forEach(p => {
            if (p.Leader) map[p.Leader] = p.Cat_Leader;
            if (p.Follower) map[p.Follower] = p.Cat_Follower;
        });
        return Object.entries(map).map(([id, cat]) => ({ id, cat })).sort((a, b) => a.id.localeCompare(b.id));
    }, [allPairs]);

    // Filtered pairs based on controls
    const { nodes, links } = useMemo(() => {
        if (!allPairs) return { nodes: [], links: [] };

        // Filter pairs by N_Methods
        let filtered = allPairs.filter(p => (p.N_Methods || 0) >= minMethods);

        // Filter by selected assets (if any selected specifically)
        if (selectedAssets.size > 0) {
            filtered = filtered.filter(p =>
                selectedAssets.has(p.Leader) || selectedAssets.has(p.Follower)
            );
        }

        // Filter by active categories
        filtered = filtered.filter(p => {
            const lcKey = Object.keys(activeCats).find(k => p.Cat_Leader?.includes(k) || k.includes(p.Cat_Leader));
            const fcKey = Object.keys(activeCats).find(k => p.Cat_Follower?.includes(k) || k.includes(p.Cat_Follower));
            return activeCats[lcKey] !== false && activeCats[fcKey] !== false;
        });

        // Build node map
        const nodeMap = {};
        filtered.forEach(p => {
            if (p.Leader && !nodeMap[p.Leader]) {
                nodeMap[p.Leader] = { id: p.Leader, cat: p.Cat_Leader, leaderCount: 0, followerCount: 0 };
            }
            if (p.Follower && !nodeMap[p.Follower]) {
                nodeMap[p.Follower] = { id: p.Follower, cat: p.Cat_Follower, leaderCount: 0, followerCount: 0 };
            }
            if (nodeMap[p.Leader]) nodeMap[p.Leader].leaderCount++;
            if (nodeMap[p.Follower]) nodeMap[p.Follower].followerCount++;
        });

        const nodes = Object.values(nodeMap);
        const links = filtered.map(p => ({
            source: p.Leader,
            target: p.Follower,
            nMethods: p.N_Methods || 1,
            score: p.Score_Final || 0,
            lag: p.Lead_Days,
        }));

        return { nodes, links };
    }, [allPairs, minMethods, activeCats, selectedAssets]);

    // D3 render
    useEffect(() => {
        if (!nodes.length || dimensions.width === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('viewBox', [0, 0, dimensions.width, dimensions.height]);

        const container = svg.append('g');

        // Zoom
        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on('zoom', e => container.attr('transform', e.transform));
        svg.call(zoom);

        // Defs: arrowheads per method count
        const defs = svg.append('defs');
        [1, 2, 3].forEach(n => {
            const col = n === 3 ? '#C8102E' : n === 2 ? '#3b82f6' : '#FFB81C';
            defs.append('marker')
                .attr('id', `arrow-${n}`)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 28)
                .attr('refY', 0)
                .attr('markerWidth', 5)
                .attr('markerHeight', 5)
                .attr('orient', 'auto')
                .append('path')
                .attr('fill', col)
                .attr('d', 'M0,-5L10,0L0,5');
        });

        // Links
        const linkColor = n => n === 3 ? '#C8102E' : n === 2 ? '#3b82f6' : '#FFB81C';
        const link = container.append('g')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', d => linkColor(d.nMethods))
            .attr('stroke-width', d => d.nMethods === 3 ? 2 : d.nMethods === 2 ? 1.5 : 1)
            .attr('stroke-opacity', d => d.nMethods === 3 ? 0.8 : d.nMethods === 2 ? 0.5 : 0.25)
            .attr('marker-end', d => `url(#arrow-${d.nMethods})`);

        // Nodes - uniform radius
        const NODE_R = 12;

        const node = container.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .style('cursor', 'grab')
            .call(d3.drag()
                .on('start', (e, d) => {
                    if (!e.active) sim.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => {
                    if (!e.active) sim.alphaTarget(0);
                    d.fx = null; d.fy = null;
                })
            );

        // Outer ring for leaders
        node.filter(d => d.leaderCount > 0)
            .append('circle')
            .attr('r', NODE_R + 4)
            .attr('fill', 'none')
            .attr('stroke', d => getColor(d.cat))
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.35);

        // Main circle
        node.append('circle')
            .attr('r', NODE_R)
            .attr('fill', d => getColor(d.cat) + '22')
            .attr('stroke', d => getColor(d.cat))
            .attr('stroke-width', 1.5);

        // Label
        node.append('text')
            .text(d => d.id)
            .attr('text-anchor', 'middle')
            .attr('dy', NODE_R + 12)
            .attr('fill', 'var(--text)')
            .attr('font-size', '9px')
            .attr('font-weight', 'bold')
            .attr('font-family', 'monospace');

        // Leader count badge
        node.filter(d => d.leaderCount > 0)
            .append('text')
            .text(d => d.leaderCount)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', d => getColor(d.cat))
            .attr('font-size', '8px')
            .attr('font-weight', 'bold');

        // Simulation
        const sim = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
            .force('collision', d3.forceCollide().radius(NODE_R + 14));

        simRef.current = sim;

        sim.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        return () => sim.stop();
    }, [nodes, links, dimensions]);

    const toggleCat = (key) => setActiveCats(prev => {
        const next = { ...prev, [key]: !prev[key] };
        if (!Object.values(next).some(Boolean)) return prev;
        return next;
    });

    const toggleAsset = (id) => setSelectedAssets(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const resetSim = () => {
        if (simRef.current) simRef.current.alpha(1).restart();
    };

    const filteredAssetList = allAssets.filter(a =>
        a.id.toLowerCase().includes(searchAsset.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col gap-4">

            {/* Header */}
            <div className="flex items-end justify-between flex-shrink-0">
                <div>
                    <h2 className="text-2xl font-black t-text transition-colors">
                        Leadership <span className="text-awb-red">Network</span>
                    </h2>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest mt-1">
                        Systemic influence ecosystem · {nodes.length} assets · {links.length} relationships
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Min methods filter */}
                    <div className="flex items-center gap-1 t-card t-border border rounded-xl p-1 transition-colors">
                        {[
                            { v: 1, label: 'Any' },
                            { v: 2, label: '2+' },
                            { v: 3, label: 'Triple' },
                        ].map(opt => (
                            <button
                                key={opt.v}
                                onClick={() => setMinMethods(opt.v)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${minMethods === opt.v
                                    ? 'bg-awb-red text-white'
                                    : 't-text-m hover:t-text'
                                    }`}
                            >{opt.label}</button>
                        ))}
                    </div>
                    <button onClick={resetSim}
                        className="p-2.5 t-card hover:bg-[var(--surface-hover)] t-border border rounded-xl t-text-m hover:t-text transition-colors">
                        <RefreshCw size={16} />
                    </button>
                    <button onClick={() => setFilterOpen(o => !o)}
                        className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${filterOpen || selectedAssets.size > 0
                            ? 'bg-awb-red/10 border-awb-red/30 text-awb-red'
                            : 't-card t-border t-text-m hover:t-text'
                            }`}>
                        <Filter size={13} />
                        Assets {selectedAssets.size > 0 && `(${selectedAssets.size})`}
                        <ChevronDown size={11} className={filterOpen ? 'rotate-180' : ''} />
                    </button>
                </div>
            </div>

            {/* Asset filter dropdown */}
            {filterOpen && (
                <div className="flex-shrink-0 t-elevated t-border border rounded-2xl p-4 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold t-text-m uppercase tracking-widest transition-colors">
                            Filter by asset — select specific assets or leave empty for all
                        </span>
                        {selectedAssets.size > 0 && (
                            <button onClick={() => setSelectedAssets(new Set())}
                                className="text-[9px] font-bold text-awb-red uppercase tracking-widest hover:underline">
                                Clear all
                            </button>
                        )}
                    </div>
                    <div className="relative mb-3">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 t-text-m transition-colors" />
                        <input
                            type="text"
                            placeholder="Search asset..."
                            value={searchAsset}
                            onChange={e => setSearchAsset(e.target.value)}
                            className="w-full t-card t-border border rounded-xl py-2 pl-8 pr-4 text-xs t-text focus:outline-none focus:border-awb-red/30 focus:shadow-sm transition-colors"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                        {filteredAssetList.map(a => (
                            <button
                                key={a.id}
                                onClick={() => toggleAsset(a.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all"
                                style={selectedAssets.has(a.id) ? {
                                    background: `${getColor(a.cat)}20`,
                                    borderColor: `${getColor(a.cat)}50`,
                                    color: getColor(a.cat),
                                } : {
                                    background: 'transparent',
                                    borderColor: 'var(--border-strong)',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: getColor(a.cat) }} />
                                {a.id}
                                {selectedAssets.has(a.id) && <X size={9} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Main graph area */}
            <div className="t-card flex-1 relative t-border border rounded-2xl overflow-hidden min-h-0 transition-colors"
                ref={containerRef}>

                {/* Category legend */}
                <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
                    {DISPLAY_CATS.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => toggleCat(cat.key)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-colors ${activeCats[cat.key]
                                ? 't-elevated t-border'
                                : 'bg-transparent border-transparent opacity-50 t-text-s'
                                }`}
                        >
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: activeCats[cat.key] ? cat.color : 'var(--text-muted)' }} />
                            <span style={{ color: activeCats[cat.key] ? cat.color : 'var(--text-muted)' }}>
                                {cat.label}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Link strength legend */}
                <div className="absolute top-4 right-4 z-10 t-elevated t-border border rounded-xl p-3 transition-colors">
                    <p className="text-[8px] font-bold t-text-m uppercase tracking-widest mb-2 transition-colors">Validation</p>
                    {[
                        { n: 3, label: 'Triple validated', color: '#C8102E' },
                        { n: 2, label: 'Double validated', color: '#3b82f6' },
                        { n: 1, label: 'Single validated', color: '#FFB81C' },
                    ].map(row => (
                        <div key={row.n} className="flex items-center gap-2 mb-1.5">
                            <div className="w-4 h-[2px] rounded-full" style={{ background: row.color }} />
                            <span className="text-[9px] font-bold t-text-m transition-colors">{row.label}</span>
                        </div>
                    ))}
                </div>

                {/* Interpretation */}
                <div className="absolute bottom-4 left-4 z-10 max-w-xs t-elevated t-border border rounded-xl p-3 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Zap size={11} className="text-awb-red" />
                        <span className="text-[9px] font-bold t-text-m uppercase tracking-widest transition-colors">How to read</span>
                    </div>
                    <p className="text-[9px] t-text-s leading-relaxed transition-colors">
                        Arrow = predictive direction (Leader → Follower).
                        Number inside node = assets led.
                        Use toggles to filter by validation level.
                    </p>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-20 transition-colors">
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                            <span className="mt-3 text-[10px] font-bold t-text uppercase tracking-widest transition-colors">Building influence graph...</span>
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!loading && nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="t-text-m text-sm font-black uppercase tracking-widest transition-colors">
                            No pairs match the current filters
                        </p>
                    </div>
                )}

                <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            </div>
        </div>
    );
};

export default LeadershipNetwork;

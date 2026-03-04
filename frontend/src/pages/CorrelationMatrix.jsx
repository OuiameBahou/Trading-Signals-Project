import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, ArrowRightLeft, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import useFetch from '../hooks/useFetch';

const CorrelationMatrix = () => {
    const { data, loading }        = useFetch('/api/correlation_matrix');
    const { data: assetsMeta }     = useFetch('/api/assets');
    const canvasRef                = useRef(null);
    const containerRef             = useRef(null);
    const transformRef             = useRef(d3.zoomIdentity);
    const [tooltip, setTooltip]    = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('Global');
    const [dimensions, setDimensions] = useState({ width: 800, height: 700 });

    const LABEL_SIZE = 72;  // px reserved for row/col labels
    const PAD        = 4;   // gap between cells

    const categories = useMemo(() =>
        ['Global', ...new Set(assetsMeta?.map(a => a.Category) || [])].filter(Boolean),
    [assetsMeta]);

    const assets = data?.assets || [];
    const matrixData = data?.data || [];

    const filteredAssets = useMemo(() => {
        let list = assets;
        if (activeCategory !== 'Global') {
            const catAssets = assetsMeta?.filter(a => a.Category === activeCategory).map(a => a.Asset) || [];
            list = assets.filter(a => catAssets.includes(a));
        }
        if (searchTerm) list = list.filter(a => a.toLowerCase().includes(searchTerm.toLowerCase()));
        return list;
    }, [assets, assetsMeta, searchTerm, activeCategory]);

    // Build lookup map for fast access
    const cellMap = useMemo(() => {
        const map = {};
        matrixData.forEach(c => { map[`${c.y}__${c.x}`] = c.v; });
        return map;
    }, [matrixData]);

    const getColor = (val) => {
        if (val === null || val === undefined) return '#0d1117';
        if (val >= 0.99) return '#1e293b'; // diagonal
        const abs = Math.abs(val);
        if (val > 0) return d3.interpolateRgb('#1e293b', '#C8102E')(abs);
        return d3.interpolateRgb('#1e293b', '#3b82f6')(abs);
    };

    // Resize observer
    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                setDimensions({
                    width:  containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };
        update();
        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Draw canvas
    const draw = (transform) => {
        const canvas = canvasRef.current;
        if (!canvas || !filteredAssets.length) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = dimensions;
        const n = filteredAssets.length;

        canvas.width  = width  * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#080c10';
        ctx.fillRect(0, 0, width, height);

        const availW = width  - LABEL_SIZE;
        const availH = height - LABEL_SIZE;
        const cellBase = Math.min(availW, availH) / n;
        const cell = cellBase * transform.k;
        const offsetX = LABEL_SIZE + transform.x;
        const offsetY = LABEL_SIZE + transform.y;

        // ── Draw cells ──
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const x = offsetX + c * cell;
                const y = offsetY + r * cell;
                if (x + cell < LABEL_SIZE || y + cell < LABEL_SIZE) continue;
                if (x > width || y > height) continue;

                const val = cellMap[`${filteredAssets[r]}__${filteredAssets[c]}`];
                ctx.fillStyle = getColor(val);
                ctx.fillRect(x + PAD/2, y + PAD/2, cell - PAD, cell - PAD);

                // Value text — only if cell is big enough
                if (cell > 28 && val !== null && val !== undefined && Math.abs(val) > 0.3) {
                    ctx.font = `bold ${Math.min(cell * 0.22, 11)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = Math.abs(val) > 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
                    ctx.fillText(val.toFixed(2), x + cell / 2, y + cell / 2);
                }
            }
        }

        // ── Column labels (top) ──
        ctx.save();
        ctx.fillStyle = '#080c10';
        ctx.fillRect(0, 0, width, LABEL_SIZE);
        for (let c = 0; c < n; c++) {
            const x = offsetX + c * cell + cell / 2;
            if (x < LABEL_SIZE || x > width) continue;
            ctx.save();
            ctx.translate(x, LABEL_SIZE - 6);
            ctx.rotate(-Math.PI / 4);
            ctx.font = `bold ${Math.min(cell * 0.22, 10)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#9ca3af';
            ctx.fillText(filteredAssets[c], 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // ── Row labels (left) ──
        ctx.save();
        ctx.fillStyle = '#080c10';
        ctx.fillRect(0, LABEL_SIZE, LABEL_SIZE, height);
        for (let r = 0; r < n; r++) {
            const y = offsetY + r * cell + cell / 2;
            if (y < LABEL_SIZE || y > height) continue;
            ctx.font = `bold ${Math.min(cell * 0.22, 10)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#9ca3af';
            ctx.fillText(filteredAssets[r], LABEL_SIZE - 6, y);
        }
        ctx.restore();

        // ── Corner block ──
        ctx.fillStyle = '#080c10';
        ctx.fillRect(0, 0, LABEL_SIZE, LABEL_SIZE);
    };

    // Zoom setup
    useEffect(() => {
        if (!filteredAssets.length || !canvasRef.current) return;
        const canvas = canvasRef.current;

        const zoom = d3.zoom()
            .scaleExtent([0.3, 10])
            .on('zoom', (e) => {
                transformRef.current = e.transform;
                draw(e.transform);
            });

        d3.select(canvas).call(zoom);

        // Initial draw
        draw(transformRef.current);

        return () => d3.select(canvas).on('.zoom', null);
    }, [filteredAssets, cellMap, dimensions]);

    // Reset zoom
    const resetZoom = () => {
        transformRef.current = d3.zoomIdentity;
        draw(d3.zoomIdentity);
        d3.select(canvasRef.current).call(
            d3.zoom().transform, d3.zoomIdentity
        );
    };

    // Mouse hover for tooltip
    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        if (!canvas || !filteredAssets.length) return;
        const rect  = canvas.getBoundingClientRect();
        const mx    = e.clientX - rect.left;
        const my    = e.clientY - rect.top;
        const t     = transformRef.current;
        const n     = filteredAssets.length;
        const availW = dimensions.width  - LABEL_SIZE;
        const availH = dimensions.height - LABEL_SIZE;
        const cellBase = Math.min(availW, availH) / n;
        const cell  = cellBase * t.k;
        const col   = Math.floor((mx - LABEL_SIZE - t.x) / cell);
        const row   = Math.floor((my - LABEL_SIZE - t.y) / cell);

        if (col >= 0 && col < n && row >= 0 && row < n) {
            const val = cellMap[`${filteredAssets[row]}__${filteredAssets[col]}`];
            setTooltip({
                x: e.clientX, y: e.clientY,
                row: filteredAssets[row],
                col: filteredAssets[col],
                val,
            });
        } else {
            setTooltip(null);
        }
    };

    return (
        <div className="h-full flex flex-col gap-4 animate-in fade-in duration-700">

            {/* Header */}
            <div className="flex items-end justify-between flex-shrink-0">
                <div>
                    <h2 className="text-3xl font-black tracking-tight">
                        Correlation <span className="text-[#C8102E]">Matrix</span>
                    </h2>
                    <p className="text-gray-500 text-sm font-black uppercase tracking-widest mt-1">
                        Scroll to zoom · Drag to pan · Hover for values
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Category filter */}
                    <div className="flex items-center bg-[#0d1117] border border-white/[0.06] rounded-xl p-1">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveCategory(cat)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    activeCategory === cat ? 'bg-[#C8102E] text-white' : 'text-gray-500 hover:text-gray-300'
                                }`}>{cat}</button>
                        ))}
                    </div>
                    {/* Search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input type="text" placeholder="Filter..." value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-[#0d1117] border border-white/[0.06] rounded-xl py-2 pl-8 pr-4 text-xs text-gray-300 w-36 focus:outline-none focus:ring-1 focus:ring-[#C8102E]/30" />
                    </div>
                    {/* Reset zoom */}
                    <button onClick={resetZoom}
                        className="p-2.5 bg-[#0d1117] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl text-gray-500 hover:text-white transition-all">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative bg-[#080c10] border border-white/[0.06] rounded-2xl overflow-hidden min-h-0" ref={containerRef}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
                            <span className="mt-3 text-[10px] font-black text-gray-600 uppercase tracking-widest">Loading matrix...</span>
                        </div>
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        style={{ width: dimensions.width, height: dimensions.height, cursor: 'crosshair' }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setTooltip(null)}
                    />
                )}

                {/* Legend */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/50 backdrop-blur px-4 py-2 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">-1.0</span>
                    <div className="w-32 h-2 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #1e293b, #C8102E)' }} />
                    <span className="text-[9px] font-black text-[#C8102E] uppercase tracking-widest">+1.0</span>
                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest ml-2">{filteredAssets.length} assets</span>
                </div>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div className="fixed z-50 pointer-events-none"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                    <div className="bg-[#0d1117] border border-white/10 rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
                        <div className="text-[10px] font-black text-white mb-1">{tooltip.row} × {tooltip.col}</div>
                        <div className={`text-xl font-black font-mono ${tooltip.val > 0 ? 'text-[#C8102E]' : 'text-blue-400'}`}>
                            {tooltip.val != null ? tooltip.val.toFixed(4) : '—'}
                        </div>
                        <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-1">Pearson Coefficient</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorrelationMatrix;

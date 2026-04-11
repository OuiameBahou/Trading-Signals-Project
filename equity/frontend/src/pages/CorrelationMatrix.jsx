import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Search, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import useFetch from '../hooks/useFetch';

const CorrelationMatrix = () => {
    const { data: rawData, loading } = useFetch('/api/correlation_matrix');
    const { data: rawAssetsMeta } = useFetch('/api/assets');
    const data = useMemo(() => rawData?.value || rawData, [rawData]);
    const assetsMeta = useMemo(() => Array.isArray(rawAssetsMeta) ? rawAssetsMeta : (rawAssetsMeta?.value || []), [rawAssetsMeta]);
    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('Global');
    const [wrapperWidth, setWrapperWidth] = useState(800);
    const [zoomLevel, setZoomLevel] = useState(1);

    const LABEL_SIZE = 80;
    const MIN_CELL = 22;   // minimum cell size in px at zoom 1
    const PAD = 2;

    const categories = useMemo(() =>
        ['Global', ...new Set(assetsMeta?.map(a => a.Category) || [])].filter(Boolean),
        [assetsMeta]);

    const assets = data?.assets || [];
    const matrixData = data?.data || [];

    // Columns: All assets in the current category
    const colAssets = useMemo(() => {
        let list = assets;
        if (activeCategory !== 'Global') {
            const catAssets = assetsMeta?.filter(a => a.Category === activeCategory).map(a => a.Asset) || [];
            list = assets.filter(a => catAssets.includes(a));
        }
        return list;
    }, [assets, assetsMeta, activeCategory]);

    // Rows: Only assets matching the search term (from the current category)
    const rowAssets = useMemo(() => {
        if (!searchTerm) return colAssets;
        return colAssets.filter(a => a.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [colAssets, searchTerm]);

    const cellMap = useMemo(() => {
        const map = {};
        matrixData.forEach(c => { map[`${c.y}__${c.x}`] = c.v; });
        return map;
    }, [matrixData]);

    const getThemeColors = () => {
        const isDark = !document.body.classList.contains('light-mode');
        return {
            bg: isDark ? '#080c10' : '#ffffff',
            baseCell: isDark ? '#1e293b' : '#f1f5f9',
            text: isDark ? '#9ca3af' : '#64748b',
        };
    };

    const getColor = (val, isDark) => {
        const colors = getThemeColors();
        if (val === null || val === undefined) return isDark ? '#0d1117' : '#f8fafc';
        if (val >= 0.99) return colors.baseCell;
        const abs = Math.abs(val);
        if (val > 0) return d3.interpolateRgb(colors.baseCell, '#C8102E')(abs);
        return d3.interpolateRgb(colors.baseCell, '#3b82f6')(abs);
    };

    // Track wrapper width
    useEffect(() => {
        const update = () => {
            if (wrapperRef.current) {
                setWrapperWidth(wrapperRef.current.clientWidth);
            }
        };
        update();
        const ro = new ResizeObserver(update);
        if (wrapperRef.current) ro.observe(wrapperRef.current);
        return () => ro.disconnect();
    }, []);

    // Computed canvas dimensions — width tracks columns, height tracks rows
    const canvasDims = useMemo(() => {
        const numCols = colAssets.length;
        const numRows = rowAssets.length;
        if (numCols === 0 || numRows === 0) return { width: wrapperWidth, height: 400, cell: 0, numCols: 0, numRows: 0 };
        const availW = wrapperWidth - LABEL_SIZE;
        const cellFromWidth = availW / numCols;
        const cell = Math.max(cellFromWidth, MIN_CELL) * zoomLevel;
        const totalW = LABEL_SIZE + numCols * cell;
        const totalH = LABEL_SIZE + numRows * cell;
        return { width: Math.ceil(totalW), height: Math.ceil(totalH), cell, numCols, numRows };
    }, [colAssets.length, rowAssets.length, wrapperWidth, zoomLevel]);

    // Draw canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !rowAssets.length || !colAssets.length) return;
        const ctx = canvas.getContext('2d');
        const { width, height, cell, numCols, numRows } = canvasDims;
        const isDark = !document.body.classList.contains('light-mode');
        const colors = {
            bg: isDark ? '#080c10' : '#ffffff',
            baseCell: isDark ? '#1e293b' : '#f1f5f9',
            text: isDark ? '#9ca3af' : '#64748b',
        };

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, width, height);

        const offsetX = LABEL_SIZE;
        const offsetY = LABEL_SIZE;

        // ── Draw cells ──
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const x = offsetX + c * cell;
                const y = offsetY + r * cell;

                const val = cellMap[`${rowAssets[r]}__${colAssets[c]}`];
                ctx.fillStyle = getColor(val, isDark);
                ctx.fillRect(x + PAD / 2, y + PAD / 2, cell - PAD, cell - PAD);

                // Value text — only if cell is big enough
                if (cell > 28 && val !== null && val !== undefined && Math.abs(val) > 0.3) {
                    ctx.font = `bold ${Math.min(cell * 0.28, 11)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = Math.abs(val) > 0.6 ? 'rgba(255,255,255,0.9)' : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.5)');
                    ctx.fillText(val.toFixed(2), x + cell / 2, y + cell / 2);
                }
            }
        }

        // ── Column labels (top) ──
        ctx.save();
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, width, LABEL_SIZE);
        for (let c = 0; c < numCols; c++) {
            const x = offsetX + c * cell + cell / 2;
            ctx.save();
            ctx.translate(x, LABEL_SIZE - 6);
            ctx.rotate(-Math.PI / 4);
            ctx.font = `bold ${Math.min(cell * 0.32, 10)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = colors.text;
            ctx.fillText(colAssets[c], 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // ── Row labels (left) ──
        ctx.save();
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, LABEL_SIZE, LABEL_SIZE, height);
        for (let r = 0; r < numRows; r++) {
            const y = offsetY + r * cell + cell / 2;
            ctx.font = `bold ${Math.min(cell * 0.32, 10)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = colors.text;
            ctx.fillText(rowAssets[r], LABEL_SIZE - 6, y);
        }
        ctx.restore();

        // ── Corner block ──
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, LABEL_SIZE, LABEL_SIZE);
    }, [colAssets, rowAssets, cellMap, canvasDims]);

    // Redraw on any change
    useEffect(() => {
        draw();
    }, [draw]);

    // Add listener to re-draw when theme changes, so D3 canvas catches up dynamically
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    draw();
                }
            });
        });
        observer.observe(document.body, { attributes: true });
        return () => observer.disconnect();
    }, [draw]);

    // Mouse hover for tooltip
    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        if (!canvas || !rowAssets.length || !colAssets.length) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvasDims.width / rect.width;
        const scaleY = canvasDims.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const { cell, numCols, numRows } = canvasDims;
        const col = Math.floor((mx - LABEL_SIZE) / cell);
        const row = Math.floor((my - LABEL_SIZE) / cell);

        if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
            const val = cellMap[`${rowAssets[row]}__${colAssets[col]}`];
            setTooltip({
                x: e.clientX, y: e.clientY,
                row: rowAssets[row],
                col: colAssets[col],
                val,
            });
        } else {
            setTooltip(null);
        }
    };

    const zoomIn = () => setZoomLevel(z => Math.min(z * 1.3, 4));
    const zoomOut = () => setZoomLevel(z => Math.max(z / 1.3, 0.3));
    const resetZoom = () => setZoomLevel(1);
    const isDarkGlobal = !document.body.classList.contains('light-mode');

    return (
        <div className="space-y-6" ref={wrapperRef}>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 t-border border-b transition-colors">
                <div>
                    <h2 className="text-2xl font-black t-text transition-colors">
                        Correlation <span className="text-awb-red">Matrix</span>
                    </h2>
                    <p className="t-text-m text-xs font-bold uppercase tracking-widest mt-1 transition-colors">
                        Hover for values · Use zoom controls or scroll page to explore
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Category filter */}
                    <div className="flex items-center t-elevated t-border border rounded-xl p-1 transition-colors">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveCategory(cat)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${activeCategory === cat ? 'bg-awb-red text-white' : 't-text-m hover:t-text'
                                    }`}>{cat}</button>
                        ))}
                    </div>
                    {/* Search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 t-text-m transition-colors" />
                        <input type="text" placeholder="Filter rows..." value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="t-elevated t-border border rounded-xl py-2 pl-8 pr-4 text-xs t-text w-36 focus:outline-none focus:border-awb-red/30 transition-colors" />
                    </div>
                    {/* Zoom controls */}
                    <div className="flex items-center gap-1 t-elevated t-border border rounded-xl p-1 transition-colors">
                        <button onClick={zoomOut}
                            className="p-2 rounded-lg t-text-m hover:hover:bg-[var(--surface-hover)] hover:t-text transition-colors">
                            <ZoomOut size={15} />
                        </button>
                        <span className="text-[10px] font-bold t-text-m w-10 text-center font-mono transition-colors">{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={zoomIn}
                            className="p-2 rounded-lg t-text-m hover:hover:bg-[var(--surface-hover)] hover:t-text transition-colors">
                            <ZoomIn size={15} />
                        </button>
                    </div>
                    <button onClick={resetZoom}
                        className="p-2.5 t-card hover:hover:bg-[var(--surface-hover)] t-border border rounded-xl t-text-m hover:t-text transition-colors">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* Legend bar */}
            <div className="flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">-1.0</span>
                    <div className="w-32 h-2 rounded-full" style={{ background: `linear-gradient(to right, #3b82f6, ${isDarkGlobal ? '#1e293b' : '#f1f5f9'}, #C8102E)` }} />
                    <span className="text-[9px] font-bold text-awb-red uppercase tracking-widest">+1.0</span>
                </div>
                <div className="flex gap-4">
                    <span className="text-[9px] t-text-m font-bold uppercase tracking-widest transition-colors">{rowAssets.length} rows</span>
                    <span className="text-[9px] t-text-m font-bold uppercase tracking-widest transition-colors">{colAssets.length} cols</span>
                </div>
            </div>

            {/* Matrix canvas — full width, scrollable via page */}
            <div className="relative t-card t-border border rounded-2xl overflow-x-auto custom-scrollbar transition-colors">
                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 border-4 border-awb-red/20 border-t-awb-red rounded-full animate-spin" />
                            <span className="mt-3 text-[10px] font-bold t-text uppercase tracking-widest transition-colors">Loading matrix...</span>
                        </div>
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: canvasDims.width,
                            height: canvasDims.height,
                            cursor: 'crosshair',
                            display: 'block',
                        }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setTooltip(null)}
                    />
                )}
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div className="fixed z-50 pointer-events-none"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                    <div className="t-elevated t-border border rounded-xl px-4 py-3 shadow-lg min-w-[160px] transition-colors">
                        <div className="text-[10px] font-bold t-text mb-1 transition-colors">{tooltip.row} × {tooltip.col}</div>
                        <div className={`text-xl font-bold font-mono ${tooltip.val > 0 ? 'text-awb-red' : 'text-blue-500'}`}>
                            {tooltip.val != null ? tooltip.val.toFixed(4) : '—'}
                        </div>
                        <div className="text-[9px] t-text-m font-bold uppercase tracking-widest mt-1 transition-colors">Pearson Coefficient</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorrelationMatrix;

import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { ChevronDown, Search, Activity } from 'lucide-react';

const fmtPair = s => (s || '').replace(/_B$/, '').replace(/_B1$/, '').replace(/_/g, '/');

/**
 * Searchable asset dropdown — FX pairs + Equity Indices, grouped by category.
 * Props:
 *   value    — selected asset object { name, file_path, file_type, category }
 *   onChange — callback receiving the selected asset object
 *   label    — optional label text (default: 'Target Asset')
 */
const PairSelector = ({ value, onChange, label = 'Target Asset' }) => {
  const [assets, setAssets] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All'); // 'All' | 'FX' | 'Indices'
  const ref = useRef(null);

  useEffect(() => {
    axios.get('/api/fx/data-pairs').then(r => {
      const data = r.data || [];
      setAssets(data);
      if (!value && data.length) {
        // Default to first FX asset
        const defaultAsset = data.find(p => p.category === 'FX') || data[0];
        onChange(defaultAsset);
      }
    }).catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const categoryFiltered = useMemo(() => {
    if (categoryFilter === 'All') return assets;
    return assets.filter(p => p.category === categoryFilter);
  }, [assets, categoryFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return categoryFiltered;
    const q = search.toLowerCase();
    return categoryFiltered.filter(p =>
      p.name.toLowerCase().includes(q) || fmtPair(p.name).toLowerCase().includes(q)
    );
  }, [categoryFiltered, search]);

  // Group filtered assets by category for display
  const groups = useMemo(() => {
    const fx = filtered.filter(p => p.category === 'FX');
    const idx = filtered.filter(p => p.category === 'Indices');
    return [
      { label: 'FX Pairs', items: fx, color: '#FFB81C' },
      { label: 'Equity Indices', items: idx, color: '#10b981' },
    ].filter(g => g.items.length > 0);
  }, [filtered]);

  const accentColor = value?.category === 'Indices' ? '#10b981' : '#FFB81C';

  return (
    <div ref={ref} className="relative">
      {label && (
        <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5">{label}</div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 border t-border-s rounded-xl px-4 py-2.5
                   transition-all t-elevated group"
        style={{ '--hover-color': accentColor }}
        onMouseEnter={e => e.currentTarget.style.borderColor = `${accentColor}40`}
        onMouseLeave={e => e.currentTarget.style.borderColor = ''}
      >
        <div className="flex items-center gap-2.5">
          <Activity size={14} style={{ color: accentColor }} />
          <span className="text-[12px] font-black font-mono t-text tracking-wide">
            {value ? fmtPair(value.name) : 'Select asset…'}
          </span>
          {value?.category && (
            <span
              className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{
                color: accentColor,
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}30`,
              }}
            >
              {value.category === 'Indices' ? 'IDX' : 'FX'}
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`t-text-m transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1.5 left-0 w-full t-card border t-border-s rounded-xl shadow-2xl overflow-hidden"
          style={{ maxHeight: 340 }}
        >
          {/* Category filter buttons */}
          <div className="flex gap-1.5 px-3 pt-2.5 pb-2 border-b t-border-s">
            {['All', 'FX', 'Indices'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all
                  ${categoryFilter === cat
                    ? cat === 'Indices'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : cat === 'FX'
                        ? 'bg-[#FFB81C]/20 text-[#FFB81C] border border-[#FFB81C]/40'
                        : 'bg-white/10 t-text border border-white/20'
                    : 'bg-transparent t-text-m border border-transparent hover:t-text'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="px-3 py-2 border-b t-border-s">
            <div className="flex items-center gap-2 t-elevated border t-border-s rounded-lg px-2.5 py-1.5">
              <Search size={12} className="t-text-m shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter assets…"
                className="flex-1 bg-transparent text-[11px] t-text focus:outline-none placeholder:t-text-m font-mono"
                autoFocus
              />
            </div>
          </div>

          {/* Grouped asset list */}
          <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 240 }}>
            {groups.map(group => (
              <div key={group.label}>
                <div
                  className="px-4 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] border-b t-border-s"
                  style={{ color: group.color, background: `${group.color}08` }}
                >
                  {group.label}
                </div>
                {group.items.map(p => (
                  <button
                    key={p.name}
                    onClick={() => { onChange(p); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                               ${value?.name === p.name
                                 ? 'border-l-2'
                                 : 'border-l-2 border-transparent'}`}
                    style={
                      value?.name === p.name
                        ? { borderLeftColor: group.color, background: `${group.color}0d` }
                        : {}
                    }
                    onMouseEnter={e => { if (value?.name !== p.name) e.currentTarget.style.background = `${group.color}06`; }}
                    onMouseLeave={e => { if (value?.name !== p.name) e.currentTarget.style.background = ''; }}
                  >
                    <div
                      className={`w-2 h-2 rounded-full`}
                      style={{ background: value?.name === p.name ? group.color : 'rgba(255,255,255,0.15)' }}
                    />
                    <span className="text-[11px] font-black font-mono t-text">{fmtPair(p.name)}</span>
                    <span className="text-[9px] t-text-m ml-auto uppercase tracking-widest font-bold">{p.file_type}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="px-4 py-6 text-center text-[10px] t-text-m">No assets match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export { fmtPair };
export default PairSelector;

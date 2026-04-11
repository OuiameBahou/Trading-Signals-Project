import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { ChevronDown, Search, Activity } from 'lucide-react';

const fmtPair = s => (s || '').replace(/_B$/, '').replace(/_B1$/, '').replace(/_/g, '/');

/**
 * Searchable equity index dropdown that fetches available data files from the backend.
 * Props:
 *   value    — selected index object { name, file_path, file_type }
 *   onChange — callback receiving the selected index object
 *   label    — optional label text (default: 'Target Index')
 */
const PairSelector = ({ value, onChange, label = 'Target Index' }) => {
  const [pairs, setPairs] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    axios.get('/api/fx/data-pairs').then(r => {
      const data = r.data || [];
      setPairs(data);
      if (!value && data.length) {
        const defaultPair = data.find(p => p.name.toUpperCase().includes('SP500')) || data[0];
        onChange(defaultPair);
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

  const filtered = useMemo(() => {
    if (!search.trim()) return pairs;
    const q = search.toLowerCase();
    return pairs.filter(p =>
      p.name.toLowerCase().includes(q) || fmtPair(p.name).toLowerCase().includes(q)
    );
  }, [pairs, search]);

  return (
    <div ref={ref} className="relative">
      {label && (
        <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5">{label}</div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 border t-border-s rounded-xl px-4 py-2.5
                   hover:border-[#FFB81C]/40 transition-all t-elevated group"
      >
        <div className="flex items-center gap-2.5">
          <Activity size={14} className="text-[#FFB81C]" />
          <span className="text-[12px] font-black font-mono t-text tracking-wide">
            {value ? fmtPair(value.name) : 'Select index…'}
          </span>
        </div>
        <ChevronDown size={14} className={`t-text-m transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 w-full t-card border t-border-s rounded-xl shadow-2xl overflow-hidden"
          style={{ maxHeight: 300 }}>
          {/* Search input */}
          <div className="px-3 py-2.5 border-b t-border-s">
            <div className="flex items-center gap-2 t-elevated border t-border-s rounded-lg px-2.5 py-1.5">
              <Search size={12} className="t-text-m shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter indices…"
                className="flex-1 bg-transparent text-[11px] t-text focus:outline-none placeholder:t-text-m font-mono"
                autoFocus
              />
            </div>
          </div>
          {/* Index list */}
          <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 230 }}>
            {filtered.map(p => (
              <button
                key={p.name}
                onClick={() => { onChange(p); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                           hover:bg-[#FFB81C]/5
                           ${value?.name === p.name
                             ? 'bg-[#FFB81C]/10 border-l-2 border-[#FFB81C]'
                             : 'border-l-2 border-transparent'}`}
              >
                <div className={`w-2 h-2 rounded-full ${value?.name === p.name ? 'bg-[#FFB81C]' : 'bg-white/15'}`} />
                <span className="text-[11px] font-black font-mono t-text">{fmtPair(p.name)}</span>
                <span className="text-[9px] t-text-m ml-auto uppercase tracking-widest font-bold">{p.file_type}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[10px] t-text-m">No indices match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export { fmtPair };
export default PairSelector;

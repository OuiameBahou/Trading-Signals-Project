import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, AlertCircle, ChevronDown, RefreshCw, FileText, Activity, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const sentColor = (s) => {
  if (s == null) return 'text-slate-500';
  if (s > 0.2) return 'text-emerald-400';
  if (s < -0.2) return 'text-red-400';
  return 'text-slate-400';
};
const sentLabel = (s) => {
  if (s == null) return 'N/A';
  if (s > 0.2) return 'Bullish';
  if (s < -0.2) return 'Bearish';
  return 'Neutral';
};
const fmt = (n, d = 3) => (typeof n === 'number' ? (n > 0 ? '+' : '') + n.toFixed(d) : n ?? '—');

/* ─── Tab button ──────────────────────────────────────────────────────────── */
const Tab = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all
      ${active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
               : 't-text-m border border-transparent hover:bg-white/5'}`}
  >
    {label}
  </button>
);

/* ─── Section card ────────────────────────────────────────────────────────── */
const Section = ({ title, icon: Icon, children }) => (
  <div className="t-card rounded-2xl border t-border-s overflow-hidden">
    <div className="flex items-center gap-2 px-5 py-4 border-b t-border-s">
      <Icon size={15} className="text-emerald-400" />
      <span className="text-[12px] font-black t-text uppercase tracking-widest">{title}</span>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

/* ─── LLM Report view ─────────────────────────────────────────────────────── */
const LlmReport = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No LLM report available.</div>;
  const text = typeof data === 'string' ? data : data.report ?? data.summary ?? data.text ?? JSON.stringify(data, null, 2);
  const score = data.composite_score ?? data.score ?? null;
  return (
    <div className="space-y-4">
      {score != null && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black ${sentColor(score)} border-current/20`}>
          {score > 0.2 ? <TrendingUp size={13}/> : score < -0.2 ? <TrendingDown size={13}/> : <Minus size={13}/>}
          Composite Score: {fmt(score)}
          <span className="opacity-70">— {sentLabel(score)}</span>
        </div>
      )}
      <pre className="whitespace-pre-wrap t-text text-[12px] leading-relaxed font-sans">{text}</pre>
    </div>
  );
};

/* ─── TE Analysis view ────────────────────────────────────────────────────── */
const TeAnalysis = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No transfer entropy data.</div>;
  const items = Array.isArray(data) ? data : data.results ?? data.te_results ?? [];
  if (items.length === 0) return <pre className="text-[11px] t-text-m">{JSON.stringify(data, null, 2)}</pre>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b t-border-s text-left">
            {Object.keys(items[0]).map(k => (
              <th key={k} className="px-3 py-2 text-[9px] font-black t-text-m uppercase tracking-widest">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b t-border-s hover:bg-white/[0.02]">
              {Object.values(row).map((v, j) => (
                <td key={j} className="px-3 py-2.5 font-mono t-text">
                  {typeof v === 'number' ? v.toFixed(4) : String(v ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─── IC Analysis view ────────────────────────────────────────────────────── */
const IcAnalysis = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No IC data.</div>;
  const entries = typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : [];
  if (entries.length === 0) return <pre className="text-[11px] t-text whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {entries.map(([k, v]) => (
        <div key={k} className="t-card border t-border-s rounded-xl p-4">
          <div className="text-[9px] font-black t-text-m uppercase tracking-widest mb-1">{k.replace(/_/g, ' ')}</div>
          <div className={`text-lg font-black font-mono ${typeof v === 'number' ? sentColor(v) : 't-text'}`}>
            {typeof v === 'number' ? fmt(v) : String(v ?? '—')}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Event Study view ────────────────────────────────────────────────────── */
const EventStudy = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No event study data.</div>;
  const events = Array.isArray(data) ? data : data.events ?? data.results ?? [];
  if (events.length === 0) return <pre className="text-[11px] t-text-m whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
      {events.map((ev, i) => {
        const ret = ev.abnormal_return ?? ev.return ?? ev.cumulative_return ?? null;
        return (
          <div key={i} className="flex items-start gap-4 p-3 rounded-xl border t-border-s t-card">
            <div className={`flex-shrink-0 text-[12px] font-black font-mono ${sentColor(ret)}`}>
              {ret != null ? fmt(ret) : '—'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] t-text font-semibold leading-snug line-clamp-2">{ev.headline ?? ev.title ?? ev.event ?? '—'}</p>
              <div className="text-[9px] t-text-m mt-0.5">{ev.date ?? ev.timestamp ?? ''}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Advanced Analysis view ─────────────────────────────────────────────── */
const AdvancedAnalysis = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No advanced analysis data.</div>;
  return <pre className="whitespace-pre-wrap text-[11px] t-text leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">{JSON.stringify(data, null, 2)}</pre>;
};

/* ─── Main ─────────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'llm',      label: 'LLM Report',     icon: FileText   },
  { id: 'te',       label: 'Transfer Entropy', icon: Activity  },
  { id: 'ic',       label: 'IC Analysis',    icon: BarChart3  },
  { id: 'event',    label: 'Event Study',    icon: TrendingUp },
  { id: 'advanced', label: 'Advanced',       icon: Activity   },
];

const NlpTickerAnalysis = () => {
  const [tickers, setTickers] = useState([]);
  const [selected, setSelected] = useState('');
  const [activeTab, setActiveTab] = useState('llm');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [tickersLoading, setTickersLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  // Load ticker list
  useEffect(() => {
    axios.get('/api/nlp/api/tickers')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : r.data?.tickers ?? [];
        setTickers(list.map(t => typeof t === 'string' ? t : t.ticker ?? t.symbol ?? String(t)));
        if (list.length > 0) setSelected(typeof list[0] === 'string' ? list[0] : list[0].ticker ?? list[0].symbol);
      })
      .catch(() => setError('Could not load tickers — is the NLP backend running on port 8002?'))
      .finally(() => setTickersLoading(false));
  }, []);

  // Load data for selected ticker + active tab
  const loadTab = useCallback(async (ticker, tab) => {
    if (!ticker) return;
    const key = `${ticker}_${tab}`;
    if (data[key] !== undefined) return; // already cached
    setLoading(true);
    try {
      const urlMap = {
        llm:      `/api/nlp/api/llm_report/${ticker}`,
        te:       `/api/nlp/api/te_analysis/${ticker}`,
        ic:       `/api/nlp/api/ic/${ticker}`,
        event:    `/api/nlp/api/event_study/${ticker}`,
        advanced: `/api/nlp/api/advanced_analysis/${ticker}`,
      };
      const res = await axios.get(urlMap[tab]);
      setData(d => ({ ...d, [key]: res.data }));
    } catch {
      setData(d => ({ ...d, [key]: null }));
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { if (selected) loadTab(selected, activeTab); }, [selected, activeTab]);

  const currentData = data[`${selected}_${activeTab}`];

  if (tickersLoading) return (
    <div className="flex items-center justify-center h-64 gap-3 t-text-m">
      <Loader2 size={20} className="animate-spin text-emerald-500" />
      <span className="text-[13px] font-bold uppercase tracking-widest">Loading tickers...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 gap-3 text-red-400">
      <AlertCircle size={20} />
      <span className="text-[13px] font-bold">{error}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black t-text uppercase tracking-widest">Ticker Deep Dive</h1>
        <p className="text-[11px] t-text-m mt-1">Per-asset NLP analysis — LLM reports, transfer entropy, IC &amp; event study</p>
      </div>

      {/* Ticker selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 t-text text-[13px] font-black uppercase tracking-widest hover:bg-emerald-500/10 transition-all min-w-[140px] justify-between"
          >
            {selected || 'Select Ticker'}
            <ChevronDown size={14} className={`text-emerald-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute top-full left-0 mt-1 w-48 t-card border t-border-s rounded-xl overflow-hidden z-30 shadow-xl max-h-64 overflow-y-auto custom-scrollbar">
              {tickers.map(t => (
                <button
                  key={t}
                  onClick={() => { setSelected(t); setOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-[12px] font-bold hover:bg-emerald-500/10 transition-colors
                    ${t === selected ? 'text-emerald-400 bg-emerald-500/10' : 't-text'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(tab => (
            <Tab key={tab.id} label={tab.label} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>

        {loading && <Loader2 size={16} className="animate-spin text-emerald-500" />}
      </div>

      {/* Content */}
      {selected && (
        <Section title={`${selected} — ${TABS.find(t => t.id === activeTab)?.label}`} icon={TABS.find(t => t.id === activeTab)?.icon ?? Activity}>
          {loading && !currentData ? (
            <div className="flex items-center gap-2 t-text-m text-[12px]">
              <Loader2 size={14} className="animate-spin text-emerald-500" /> Loading...
            </div>
          ) : activeTab === 'llm'      ? <LlmReport    data={currentData} />
            : activeTab === 'te'       ? <TeAnalysis   data={currentData} />
            : activeTab === 'ic'       ? <IcAnalysis   data={currentData} />
            : activeTab === 'event'    ? <EventStudy   data={currentData} />
            :                            <AdvancedAnalysis data={currentData} />
          }
        </Section>
      )}
    </div>
  );
};

export default NlpTickerAnalysis;

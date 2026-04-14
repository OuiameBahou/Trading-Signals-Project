import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, AlertCircle, ChevronDown, FileText, Activity,
  TrendingUp, TrendingDown, Minus, ArrowRight, BarChart3,
  Shield, Zap, GitBranch, Info,
} from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const sentColor = (s) => {
  if (s == null) return 'text-slate-500';
  const str = typeof s === 'string' ? s.toLowerCase() : '';
  if (str === 'bullish' || s > 0.2) return 'text-emerald-400';
  if (str === 'bearish' || s < -0.2) return 'text-red-400';
  return 'text-slate-400';
};
const sentBg = (s) => {
  const str = typeof s === 'string' ? s.toLowerCase() : '';
  if (str === 'bullish') return 'bg-emerald-500/10 border-emerald-500/30';
  if (str === 'bearish') return 'bg-red-500/10 border-red-500/30';
  return 'bg-slate-500/10 border-slate-500/30';
};
const sentIcon = (s) => {
  const str = typeof s === 'string' ? s.toLowerCase() : '';
  if (str === 'bullish') return <TrendingUp size={16} />;
  if (str === 'bearish') return <TrendingDown size={16} />;
  return <Minus size={16} />;
};
const fmt = (n, d = 4) => (typeof n === 'number' ? n.toFixed(d) : '—');
const pctFmt = (n) => (typeof n === 'number' ? (n * 100).toFixed(1) + '%' : '—');

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

/* ─── Stat card ───────────────────────────────────────────────────────────── */
const StatCard = ({ label, value, sub, accent = 'emerald', icon: Icon }) => {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    red:     'border-red-500/20     bg-red-500/5     text-red-400',
    amber:   'border-amber-500/20   bg-amber-500/5   text-amber-400',
    sky:     'border-sky-500/20     bg-sky-500/5     text-sky-400',
    slate:   'border-slate-500/20   bg-slate-500/5   text-slate-400',
    violet:  'border-violet-500/20  bg-violet-500/5  text-violet-400',
  };
  return (
    <div className={`t-card rounded-xl border p-4 ${colors[accent]}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={11} className="opacity-60" />}
        <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</span>
      </div>
      <div className="text-xl font-black font-mono">{value ?? '—'}</div>
      {sub && <div className="text-[9px] mt-1 opacity-60 font-bold">{sub}</div>}
    </div>
  );
};

/* ─── Section card ────────────────────────────────────────────────────────── */
const Section = ({ title, icon: Icon, children, className = '' }) => (
  <div className={`t-card rounded-2xl border t-border-s overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 px-5 py-4 border-b t-border-s">
      <Icon size={15} className="text-emerald-400" />
      <span className="text-[12px] font-black t-text uppercase tracking-widest">{title}</span>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

/* ─── Quality badge ───────────────────────────────────────────────────────── */
const QualityBadge = ({ quality }) => {
  const map = {
    HIGH:   { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'High' },
    MEDIUM: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Medium' },
    LOW:    { color: 'text-red-400 bg-red-500/10 border-red-500/30', label: 'Low' },
  };
  const cfg = map[quality] || map.LOW;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

/* ─── Direction badge ─────────────────────────────────────────────────────── */
const DirectionBadge = ({ direction }) => {
  const map = {
    sentiment_leads: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Sentiment Leads Price', icon: TrendingUp },
    returns_lead:    { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Price Leads Sentiment', icon: TrendingDown },
    bidirectional:   { color: 'text-sky-400 bg-sky-500/10 border-sky-500/30', label: 'Bidirectional', icon: GitBranch },
    none:            { color: 'text-slate-400 bg-slate-500/10 border-slate-500/30', label: 'No Clear Direction', icon: Minus },
  };
  const cfg = map[direction] || map.none;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LLM Report — structured card layout                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
const LlmReport = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No LLM report available.</div>;
  if (data.error) return <div className="text-red-400 text-[12px]">{data.error}</div>;

  const { asset, overall_sentiment_direction, key_drivers, trader_summary, risk_warning } = data;
  const direction = overall_sentiment_direction || 'Neutral';

  return (
    <div className="space-y-5">
      {/* Sentiment direction hero */}
      <div className={`flex items-center gap-4 px-5 py-4 rounded-xl border ${sentBg(direction)}`}>
        <div className={`p-3 rounded-xl bg-black/20 ${sentColor(direction)}`}>
          {sentIcon(direction)}
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest t-text-m mb-0.5">Overall Sentiment</div>
          <div className={`text-lg font-black uppercase tracking-wide ${sentColor(direction)}`}>{direction}</div>
        </div>
        {asset && (
          <div className="ml-auto text-[11px] font-bold t-text-m uppercase tracking-wider opacity-60">{asset}</div>
        )}
      </div>

      {/* Key drivers */}
      {key_drivers && key_drivers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-amber-400" />
            <span className="text-[10px] font-black t-text uppercase tracking-widest">Key Drivers</span>
          </div>
          <div className="space-y-2">
            {key_drivers.map((driver, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border t-border-s">
                <ArrowRight size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-[12px] t-text leading-relaxed">{driver}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trader summary */}
      {trader_summary && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={13} className="text-sky-400" />
            <span className="text-[10px] font-black t-text uppercase tracking-widest">Trader Summary</span>
          </div>
          <div className="px-4 py-3.5 rounded-xl bg-white/[0.02] border t-border-s">
            <p className="text-[12px] t-text leading-relaxed">{trader_summary}</p>
          </div>
        </div>
      )}

      {/* Risk warning */}
      {risk_warning && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={13} className="text-red-400" />
            <span className="text-[10px] font-black t-text uppercase tracking-widest">Risk Warning</span>
          </div>
          <div className="px-4 py-3.5 rounded-xl bg-red-500/[0.04] border border-red-500/20">
            <p className="text-[12px] text-red-300/90 leading-relaxed">{risk_warning}</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TE Analysis — structured multi-section layout                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TeAnalysis = ({ data }) => {
  if (!data) return <div className="t-text-m text-[12px]">No transfer entropy data.</div>;
  if (data.error) return <div className="text-red-400 text-[12px]">{data.error}</div>;

  const te = data.te_analysis || {};
  const quality = data.data_quality;
  const nDays = data.n_real_days;

  const lagHours = te.optimal_lag != null ? te.optimal_lag * 4 : null;
  const lagLabel = lagHours != null
    ? (lagHours < 24 ? `${lagHours}h` : `${(lagHours / 24).toFixed(1)}d`)
    : '—';

  return (
    <div className="space-y-6">
      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Data Quality" value={quality || '—'} icon={Info}
          accent={quality === 'HIGH' ? 'emerald' : quality === 'MEDIUM' ? 'amber' : 'red'}
          sub={nDays != null ? `${nDays} days of data` : undefined}
        />
        <StatCard
          label="Observations" value={te.n_obs ?? '—'} icon={BarChart3}
          accent="sky"
          sub={te.n_bins_used ? `${te.n_bins_used} bins` : undefined}
        />
        <StatCard
          label="Peak TE" value={fmt(te.peak_te, 6)} icon={Zap}
          accent={te.significant ? 'emerald' : 'slate'}
          sub={te.peak_pvalue != null ? `p = ${te.peak_pvalue.toFixed(3)}` : undefined}
        />
        <StatCard
          label="Optimal Lag" value={lagLabel} icon={Activity}
          accent="violet"
          sub={te.optimal_lag != null ? `Lag ${te.optimal_lag}` : undefined}
        />
        <StatCard
          label="Significant" value={te.significant ? 'Yes' : 'No'} icon={Shield}
          accent={te.significant ? 'emerald' : 'red'}
        />
      </div>

      {/* Directionality + interpretation */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <DirectionBadge direction={te.net_directionality} />
          {te.directionality_score != null && (
            <span className="text-[10px] font-mono t-text-m">
              Score: {te.directionality_score > 0 ? '+' : ''}{te.directionality_score.toFixed(6)}
            </span>
          )}
        </div>
        {te.interpretation && (
          <div className="px-4 py-3.5 rounded-xl bg-white/[0.02] border t-border-s">
            <p className="text-[12px] t-text leading-relaxed">{te.interpretation}</p>
          </div>
        )}
      </div>

      {/* Lag profiles side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LagProfileTable title="Sentiment → Returns" lags={te.lag_profile_s2r} />
        <LagProfileTable title="Returns → Sentiment" lags={te.lag_profile_r2s} />
      </div>

    </div>
  );
};

/* ─── Lag profile table ───────────────────────────────────────────────────── */
const LagProfileTable = ({ title, lags }) => {
  if (!lags || lags.length === 0) return null;
  return (
    <div className="t-card rounded-xl border t-border-s overflow-hidden">
      <div className="px-4 py-3 border-b t-border-s">
        <span className="text-[10px] font-black t-text-m uppercase tracking-widest">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b t-border-s">
              <th className="px-3 py-2 text-left text-[9px] font-black t-text-m uppercase tracking-widest">Lag</th>
              <th className="px-3 py-2 text-left text-[9px] font-black t-text-m uppercase tracking-widest">TE (bits)</th>
              <th className="px-3 py-2 text-left text-[9px] font-black t-text-m uppercase tracking-widest">p-value</th>
              <th className="px-3 py-2 text-left text-[9px] font-black t-text-m uppercase tracking-widest">Sig.</th>
            </tr>
          </thead>
          <tbody>
            {lags.map((row, i) => (
              <tr key={i} className={`border-b t-border-s ${row.significant ? 'bg-emerald-500/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                <td className="px-3 py-2 font-mono t-text">{row.lag}</td>
                <td className="px-3 py-2 font-mono t-text">{fmt(row.te, 6)}</td>
                <td className="px-3 py-2 font-mono t-text">{fmt(row.p_value, 3)}</td>
                <td className="px-3 py-2">
                  {row.significant
                    ? <span className="text-emerald-400 font-black text-[10px]">YES</span>
                    : <span className="t-text-m text-[10px]">no</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main page                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'llm', label: 'LLM Report',      icon: FileText },
  { id: 'te',  label: 'Transfer Entropy', icon: Activity },
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

  useEffect(() => {
    axios.get('/api/nlp/tickers')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : r.data?.tickers ?? [];
        setTickers(list.map(t => typeof t === 'string' ? t : t.ticker ?? t.symbol ?? String(t)));
        if (list.length > 0) setSelected(typeof list[0] === 'string' ? list[0] : list[0].ticker ?? list[0].symbol);
      })
      .catch(() => setError('Could not load tickers — is the NLP backend running on port 8002?'))
      .finally(() => setTickersLoading(false));
  }, []);

  const loadTab = useCallback(async (ticker, tab) => {
    if (!ticker) return;
    const key = `${ticker}_${tab}`;
    if (data[key] !== undefined) return;
    setLoading(true);
    try {
      const urlMap = {
        llm: `/api/nlp/llm_report/${ticker}`,
        te:  `/api/nlp/te_analysis/${ticker}`,
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
        <p className="text-[11px] t-text-m mt-1">Per-asset NLP analysis — LLM reports &amp; transfer entropy</p>
      </div>

      {/* Ticker selector + tabs */}
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

        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(tab => (
            <Tab key={tab.id} label={tab.label} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>

        {loading && <Loader2 size={16} className="animate-spin text-emerald-500" />}
      </div>

      {/* Content */}
      {selected && (
        <Section
          title={`${selected} — ${TABS.find(t => t.id === activeTab)?.label}`}
          icon={TABS.find(t => t.id === activeTab)?.icon ?? Activity}
        >
          {loading && !currentData ? (
            <div className="flex items-center gap-2 t-text-m text-[12px]">
              <Loader2 size={14} className="animate-spin text-emerald-500" /> Loading...
            </div>
          ) : activeTab === 'llm' ? <LlmReport data={currentData} />
            :                       <TeAnalysis data={currentData} />
          }
        </Section>
      )}
    </div>
  );
};

export default NlpTickerAnalysis;

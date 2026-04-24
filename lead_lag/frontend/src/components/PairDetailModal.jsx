import React from 'react';
import { X, TrendingUp, BarChart2, Hash, ShieldCheck, Link2, FlaskConical, GitBranch, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MethodBadge = ({ confirmed, label, icon: Icon, color }) => {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all duration-300 shadow-sm ${confirmed
            ? 'border-opacity-30 bg-opacity-10'
            : 't-elevated t-border t-text-m opacity-40'
            }`}
            style={confirmed ? { borderColor: color, backgroundColor: `${color}15`, color } : {}}>
            <Icon size={12} className={confirmed ? 'animate-pulse-subtle' : ''} />
            {label}
            {confirmed
                ? <ShieldCheck size={10} className="ml-0.5 opacity-80" />
                : <span className="ml-0.5 t-text-m transition-colors">✕</span>
            }
        </div>
    );
};

const PairDetailModal = ({ pair, onClose }) => {
    if (!pair) return null;

    // Support both old column names and new unified names
    const grangerConfirmed = pair.Granger_Validated != null ? pair.Granger_Validated : (pair.Granger_Significant === true || pair.Granger_Significant === 'True');
    const varConfirmed = pair.VAR_Validated != null ? pair.VAR_Validated : (pair.VAR_Confirmed === true || pair.VAR_Confirmed === 'True');
    const lagConfirmed = pair.Lag_Validated != null ? pair.Lag_Validated : (pair.Lag_Significant === true || pair.Lag_Significant === 'True');

    const stats = [
        { label: 'Final Score', value: pair.Score_Final != null ? Number(pair.Score_Final).toFixed(4) : '—', icon: TrendingUp, color: 'text-[#C8102E]' },
        { label: 'Optimal Lag', value: pair.Lead_Days != null ? `${pair.Lead_Days} Days` : '—', icon: Hash, color: 'text-[#FFB81C]' },
        { label: 'Max Corr', value: pair.Best_AbsCorr != null ? Number(pair.Best_AbsCorr).toFixed(4) : '—', icon: BarChart2, color: 'text-blue-500' },
        { label: 'N Methods', value: pair.N_Methods != null ? `${pair.N_Methods} / 3` : '—', icon: ShieldCheck, color: 'text-emerald-500' },
    ];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-colors"
                />
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="t-bg t-border border w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden relative flex flex-col transition-all duration-500"
                >
                    {/* Header */}
                    <div className="p-8 t-border border-b flex items-center justify-between t-elevated transition-colors">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-black t-text transition-colors uppercase tracking-tighter drop-shadow-sm">{pair.Leader}</span>
                                <div className="p-2 bg-awb-red/10 rounded-full">
                                    <Link2 size={20} className="text-awb-red rotate-45" />
                                </div>
                                <span className="text-2xl font-black t-text transition-colors uppercase tracking-tighter drop-shadow-sm">{pair.Follower}</span>
                            </div>
                            {/* Method badges */}
                            <div className="hidden md:flex items-center gap-2">
                                <MethodBadge confirmed={lagConfirmed} label="Cross-Corr" icon={TrendingUp} color="#3b82f6" />
                                <MethodBadge confirmed={grangerConfirmed} label="Granger" icon={FlaskConical} color="#a855f7" />
                                <MethodBadge confirmed={varConfirmed} label="VAR" icon={GitBranch} color="#10b981" />
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 t-card hover:hover:bg-[var(--surface-hover)] rounded-2xl t-border border t-text-m hover:t-text transition-all shadow-sm active:scale-95">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {/* KPI row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            {stats.map((s, i) => (
                                <div key={i} className="t-card t-border border rounded-xl p-4 shadow-sm transition-colors">
                                    <div className="flex items-center gap-2 t-text-m mb-1 text-[9px] font-bold uppercase tracking-wider transition-colors">
                                        <s.icon size={12} /> {s.label}
                                    </div>
                                    <div className={`text-lg font-black ${s.color} transition-colors`}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Rolling correlation chart */}
                        <section className="mb-8">
                            <h3 className="text-xs font-bold t-text-s uppercase tracking-widest mb-3 flex items-center gap-2 transition-colors">
                                <div className="w-1 h-3 bg-[#C8102E] rounded-full"></div>
                                Dynamic Rolling Correlations (30d · 60d · 90d)
                            </h3>
                            <div className="aspect-video t-elevated rounded-2xl overflow-hidden t-border border relative transition-colors">
                                <img
                                    src={`/api/plot/rolling/${pair.Leader}/${pair.Follower}`}
                                    alt={`Rolling Correlation ${pair.Leader} vs ${pair.Follower}`}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div className="absolute inset-0 hidden items-center justify-center bg-black/10 backdrop-blur-sm transition-colors">
                                    <div className="text-center">
                                        <BarChart2 size={40} className="t-text-s mx-auto mb-3 transition-colors" />
                                        <p className="t-text-m text-[10px] font-bold uppercase tracking-widest transition-colors">Plot unavailable</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Method scores */}
                            <section>
                                <h3 className="text-xs font-bold t-text-s uppercase tracking-widest mb-3 transition-colors">Method Scores</h3>
                                <div className="space-y-2">
                                    {[
                                        { label: 'Cross-Corr Score', value: pair.Score_Lag, color: '#3b82f6', confirmed: lagConfirmed },
                                        {
                                            label: 'Granger Score', value: pair.Score_Granger, color: '#a855f7', confirmed: grangerConfirmed,
                                            extra: pair.Granger_Fstat ? `F-stat: ${Number(pair.Granger_Fstat).toFixed(2)}` : null
                                        },
                                        {
                                            label: 'VAR Score', value: pair.Score_VAR, color: '#10b981', confirmed: varConfirmed,
                                            extra: pair.VAR_Impact ? `Impact: ${Number(pair.VAR_Impact).toFixed(4)}` : null
                                        },
                                    ].map((row, i) => (
                                        <div key={i} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${row.confirmed ? 't-elevated t-border' : 'bg-transparent border-transparent opacity-40'}`}>
                                            <span className="text-[10px] t-text-m font-bold uppercase tracking-tight transition-colors">{row.label}</span>
                                            <div className="flex items-center gap-2">
                                                {row.extra && <span className="text-[9px] t-text-s font-mono transition-colors">{row.extra}</span>}
                                                <span className="text-[11px] font-mono font-black" style={{ color: row.confirmed ? row.color : 'var(--text-muted)' }}>
                                                    {row.confirmed && row.value != null ? Number(row.value).toFixed(4) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Interpretation */}
                            <section>
                                <h3 className="text-xs font-bold t-text-s uppercase tracking-widest mb-3 transition-colors">Interpretation</h3>
                                <p className="text-[11px] t-text-m leading-relaxed italic transition-colors">
                                    <span className="t-text font-bold transition-colors">{pair.Leader}</span>'s movements
                                    systematically precede <span className="t-text font-bold transition-colors">{pair.Follower}</span>
                                    {pair.Lead_Days ? ` with an average delay of ${pair.Lead_Days} day(s)` : ''}.
                                    This relationship is validated by <span className="t-text font-bold transition-colors">{pair.N_Methods != null ? pair.N_Methods : '—'} out of 3</span> statistical methods
                                    {pair.N_Methods === 3 ? ', conferring maximum confidence for systematic trading.' :
                                        pair.N_Methods === 2 ? ', conferring moderate confidence.' :
                                            ', representing a preliminary signal requiring further validation.'}
                                </p>
                                <div className="mt-4 p-3 rounded-lg t-border border t-elevated transition-colors">
                                    <div className="text-[9px] font-black t-text-m uppercase tracking-widest mb-1 transition-colors">Robustness</div>
                                    <div className={`text-sm font-black uppercase tracking-widest transition-colors ${Number(pair.N_Methods) === 3 ? 'text-awb-red' :
                                        Number(pair.N_Methods) === 2 ? 'text-blue-500' : 'text-awb-gold'
                                        }`}>
                                        {Number(pair.N_Methods) === 3 ? 'Triple Validated' :
                                            Number(pair.N_Methods) === 2 ? 'Double Validated' : 'Single Validated'}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default PairDetailModal;

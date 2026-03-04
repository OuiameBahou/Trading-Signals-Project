import React from 'react';
import { X, TrendingUp, BarChart2, Hash, ShieldCheck, Link2, FlaskConical, GitBranch, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MethodBadge = ({ confirmed, label, icon: Icon, color }) => {
    const isDark = !document.body.classList.contains('light-mode');
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all duration-300 shadow-sm ${confirmed
            ? 'border-opacity-30 bg-opacity-10'
            : 'border-white/5 dark:border-white/5 light-mode:border-slate-100 bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-slate-50 opacity-40'
            }`}
            style={confirmed ? { borderColor: color, backgroundColor: `${color}15`, color } : {}}>
            <Icon size={12} className={confirmed ? 'animate-pulse-subtle' : ''} />
            {label}
            {confirmed
                ? <ShieldCheck size={10} className="ml-0.5 opacity-80" />
                : <span className="ml-0.5 text-gray-600 dark:text-gray-600 light-mode:text-slate-400 transition-colors">✕</span>
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
        { label: 'Max Corr', value: pair.Best_AbsCorr != null ? Number(pair.Best_AbsCorr).toFixed(4) : '—', icon: BarChart2, color: 'text-blue-400' },
        { label: 'N Methods', value: pair.N_Methods != null ? `${pair.N_Methods} / 3` : '—', icon: ShieldCheck, color: 'text-emerald-400' },
    ];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-navy-900/90 dark:bg-navy-900/90 light-mode:bg-white/80 backdrop-blur-sm transition-colors"
                />
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="glass border border-white/10 dark:border-white/10 light-mode:border-white/20 w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden relative flex flex-col transition-all duration-500"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-white/5 dark:border-white/5 light-mode:border-slate-100 flex items-center justify-between bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-white/80 transition-colors">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900 transition-colors uppercase tracking-tighter drop-shadow-sm">{pair.Leader}</span>
                                <div className="p-2 bg-awb-red/10 rounded-full">
                                    <Link2 size={20} className="text-awb-red rotate-45" />
                                </div>
                                <span className="text-2xl font-black text-white dark:text-white light-mode:text-slate-900 transition-colors uppercase tracking-tighter drop-shadow-sm">{pair.Follower}</span>
                            </div>
                            {/* Method badges */}
                            <div className="hidden md:flex items-center gap-2">
                                <MethodBadge confirmed={lagConfirmed} label="Cross-Corr" icon={TrendingUp} color="#3b82f6" />
                                <MethodBadge confirmed={grangerConfirmed} label="Granger" icon={FlaskConical} color="#a855f7" />
                                <MethodBadge confirmed={varConfirmed} label="VAR" icon={GitBranch} color="#10b981" />
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 bg-white/5 dark:bg-white/5 light-mode:bg-white rounded-2xl hover:bg-white/10 dark:hover:bg-white/10 light-mode:hover:bg-slate-100 border border-white/10 dark:border-white/10 light-mode:border-slate-200 text-gray-500 transition-all shadow-sm active:scale-95">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {/* KPI row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            {stats.map((s, i) => (
                                <div key={i} className="card p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-500 light-mode:text-slate-400 mb-1 text-[9px] font-bold uppercase tracking-wider transition-colors">
                                        <s.icon size={12} /> {s.label}
                                    </div>
                                    <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Rolling correlation chart */}
                        <section className="mb-8">
                            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-400 light-mode:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 transition-colors">
                                <div className="w-1 h-3 bg-[#C8102E] rounded-full"></div>
                                Dynamic Rolling Correlations (30d · 60d · 90d)
                            </h3>
                            <div className="aspect-video bg-[#080c10] dark:bg-[#080c10] light-mode:bg-slate-50/50 rounded-2xl overflow-hidden border border-white/5 dark:border-white/5 light-mode:border-slate-100 relative transition-colors">
                                <img
                                    src={`/api/plot/rolling/${pair.Leader}/${pair.Follower}`}
                                    alt={`Rolling Correlation ${pair.Leader} vs ${pair.Follower}`}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div className="absolute inset-0 hidden items-center justify-center bg-[#080c10]/80 dark:bg-[#080c10]/80 light-mode:bg-slate-50/80 transition-colors">
                                    <div className="text-center">
                                        <BarChart2 size={40} className="text-gray-700 dark:text-gray-700 light-mode:text-slate-300 mx-auto mb-3 transition-colors" />
                                        <p className="text-gray-600 dark:text-gray-600 light-mode:text-slate-400 text-[10px] font-bold uppercase tracking-widest transition-colors">Plot unavailable</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Method scores */}
                            <section>
                                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-400 light-mode:text-slate-400 uppercase tracking-widest mb-3 transition-colors">Method Scores</h3>
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
                                        <div key={i} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${row.confirmed ? 'bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-slate-50 border-white/5 dark:border-white/5 light-mode:border-slate-100' : 'bg-transparent border-white/[0.02] dark:border-white/[0.02] light-mode:border-slate-50/50 opacity-40'}`}>
                                            <span className="text-[10px] text-gray-500 dark:text-gray-500 light-mode:text-slate-400 font-bold uppercase tracking-tight transition-colors">{row.label}</span>
                                            <div className="flex items-center gap-2">
                                                {row.extra && <span className="text-[9px] text-gray-600 dark:text-gray-600 light-mode:text-slate-400 font-mono transition-colors">{row.extra}</span>}
                                                <span className="text-[11px] font-mono font-black" style={{ color: row.confirmed ? row.color : '#374151' }}>
                                                    {row.confirmed && row.value != null ? Number(row.value).toFixed(4) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {pair.Lag_Gain != null && (
                                        <div className="flex justify-between items-center p-3 bg-white/[0.02] dark:bg-white/[0.02] light-mode:bg-slate-50 rounded-lg border border-white/5 dark:border-white/5 light-mode:border-slate-100 transition-colors">
                                            <span className="text-[10px] text-gray-500 dark:text-gray-500 light-mode:text-slate-400 font-bold uppercase tracking-tight transition-colors">Lag Gain</span>
                                            <span className="text-[11px] font-mono font-black text-emerald-400">+{Number(pair.Lag_Gain).toFixed(4)}</span>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Interpretation */}
                            <section>
                                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-400 light-mode:text-slate-400 uppercase tracking-widest mb-3 transition-colors">Interpretation</h3>
                                <p className="text-[11px] text-gray-500 dark:text-gray-500 light-mode:text-slate-400 leading-relaxed italic transition-colors">
                                    <span className="text-white dark:text-white light-mode:text-slate-900 font-bold transition-colors">{pair.Leader}</span>'s movements
                                    systematically precede <span className="text-white dark:text-white light-mode:text-slate-900 font-bold transition-colors">{pair.Follower}</span>
                                    {pair.Lead_Days ? ` with an average delay of ${pair.Lead_Days} day(s)` : ''}.
                                    This relationship is validated by <span className="text-white dark:text-white light-mode:text-slate-900 font-bold transition-colors">{pair.N_Methods != null ? pair.N_Methods : '—'} out of 3</span> statistical methods
                                    {pair.N_Methods === 3 ? ', conferring maximum confidence for systematic trading.' :
                                        pair.N_Methods === 2 ? ', conferring moderate confidence.' :
                                            ', representing a preliminary signal requiring further validation.'}
                                </p>
                                <div className="mt-4 p-3 rounded-lg border border-white/5 dark:border-white/5 light-mode:border-slate-100 bg-white/[0.01] dark:bg-white/[0.01] light-mode:bg-slate-50 transition-colors">
                                    <div className="text-[9px] font-black text-gray-600 dark:text-gray-600 light-mode:text-slate-400 uppercase tracking-widest mb-1 transition-colors">Robustness</div>
                                    <div className={`text-sm font-black uppercase tracking-widest transition-colors ${pair.N_Methods === 3 ? 'text-emerald-400' :
                                        pair.N_Methods === 2 ? 'text-blue-400' : 'text-amber-400'
                                        }`}>
                                        {pair.N_Methods === 3 ? 'Triple Validated' :
                                            pair.N_Methods === 2 ? 'Double Validated' : 'Single Validated'}
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

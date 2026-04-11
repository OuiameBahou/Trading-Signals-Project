import React, { useState } from 'react';
import { Info, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const StatCard = ({ label, value, sub, icon: Icon, colorClass, tooltip, onClick }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`t-card t-border border relative p-6 flex flex-col justify-between transition-all group ${onClick ? 'cursor-pointer hover:border-awb-red/30' : ''}`}
            onClick={onClick}
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-opacity-10 dark:bg-opacity-10 light-mode:bg-opacity-20 ${colorClass.bg} ${colorClass.text} transition-colors`}>
                    <Icon size={20} />
                </div>

                <div className="relative">
                    <button
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        className="t-text-m hover:text-awb-red-light transition-colors"
                    >
                        <Info size={16} />
                    </button>

                    <AnimatePresence>
                        {showTooltip && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                className="absolute right-0 top-8 w-64 p-4 t-elevated t-border border rounded-xl shadow-2xl z-50 pointer-events-none transition-colors"
                            >
                                <p className="text-[11px] t-text leading-relaxed font-medium transition-colors">
                                    {tooltip}
                                </p>
                                <div className="absolute right-3 -top-1.5 w-3 h-3 t-elevated t-border-s border-l border-t rotate-45 transition-colors"></div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div>
                <div className="text-[11px] font-bold t-text-m uppercase tracking-widest mb-1 flex items-center gap-1.5 transition-colors">
                    {label}
                </div>
                <div className={`text-2xl font-black tracking-tight ${colorClass.text} transition-colors`}>
                    {value || '—'}
                </div>
                <div className="text-[10px] t-text-s font-medium mt-1 uppercase tracking-tight transition-colors">
                    {sub}
                </div>
            </div>

            {onClick && (
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink size={14} className="text-awb-red-light" />
                </div>
            )}
        </motion.div>
    );
};

export default StatCard;

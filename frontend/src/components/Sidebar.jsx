import React from 'react';
import { LayoutDashboard, Share2, Thermometer, Zap, Globe, Info } from 'lucide-react';

const Sidebar = ({ activePage, onNavigate }) => {
    const navItems = [
        { id: 'dashboard', label: 'Intelligence Hub', icon: LayoutDashboard, section: 'Overview' },
        { id: 'asset-directory', label: 'Asset Universe', icon: Globe, section: 'Overview' },
        { id: 'signals', label: 'Signal Scanner', icon: Zap, section: 'Overview' },
        { id: 'network', label: 'Leadership Network', icon: Share2, section: 'Analytics' },
        { id: 'correlation', label: 'Correlation Matrix', icon: Thermometer, section: 'Analytics' },
    ];

    const sections = [...new Set(navItems.map(item => item.section))];

    return (
        <aside className="w-64 h-screen t-bg t-border-s border-r flex flex-col flex-shrink-0 relative z-20 transition-colors duration-500" style={{ backgroundColor: 'var(--sidebar-bg)' }}>

            {/* Logo */}
            <div className="px-6 py-6 t-border-s border-b transition-colors">
                <div className="text-[13px] font-black t-text tracking-[0.12em] uppercase leading-tight transition-colors">Attijariwafa</div>
                <div className="text-[8px] text-[#FFB81C] font-black uppercase tracking-[0.2em] mt-0.5">Quant Platform</div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
                {sections.map(section => (
                    <div key={section} className="mb-5">
                        <h3 className="px-3 text-[9px] font-black t-text-m uppercase tracking-[0.2em] mb-1.5 transition-colors">{section}</h3>
                        <div className="space-y-0.5">
                            {navItems.filter(item => item.section === section).map(item => {
                                const Icon = item.icon;
                                const isActive = activePage === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onNavigate(item.id)}
                                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-[#C8102E]/10 text-[#C8102E]' : 't-text-s hover:t-text hover:bg-[var(--surface-hover)]'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Icon size={16} className={isActive ? 'text-[#C8102E]' : 't-text-m group-hover:t-text transition-colors'} />
                                            <span className={`text-[12px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 t-border-s border-t transition-colors">
                <div className="t-card rounded-xl p-3.5 t-border-s border shadow-sm transition-colors">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Info size={11} className="text-[#FFB81C]" />
                        <span className="text-[9px] font-black t-text-m uppercase tracking-widest transition-colors">System Status</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] t-text-m transition-colors">Coverage</span>
                            <span className="text-[10px] t-text font-black transition-colors">39 Assets</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] t-text-m transition-colors">Data Feed</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-[8px] text-center t-text-m font-bold uppercase tracking-[0.15em] leading-relaxed transition-colors">
                    © 2026 Attijariwafa Bank<br />Quant Research Division
                </p>
            </div>
        </aside>
    );
};

export default Sidebar;

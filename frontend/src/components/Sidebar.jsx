import React from 'react';
import { LayoutDashboard, Share2, Thermometer, Zap, Globe, Info } from 'lucide-react';

const Sidebar = ({ activePage, onNavigate }) => {
    const navItems = [
        { id: 'dashboard',       label: 'Intelligence Hub',   icon: LayoutDashboard, section: 'Overview' },
        { id: 'asset-directory', label: 'Asset Universe',     icon: Globe,           section: 'Overview' },
        { id: 'signals',         label: 'Signal Scanner',     icon: Zap,             section: 'Overview', badge: '13' },
        { id: 'network',         label: 'Leadership Network', icon: Share2,          section: 'Analytics' },
        { id: 'correlation',     label: 'Correlation Matrix', icon: Thermometer,     section: 'Analytics' },
    ];

    const sections = [...new Set(navItems.map(item => item.section))];

    return (
        <aside className="w-64 h-screen bg-[#080c10] border-r border-white/[0.05] flex flex-col flex-shrink-0 relative z-20">

            {/* Logo */}
            <div className="px-6 py-6 border-b border-white/[0.05]">
                <div className="text-[13px] font-black text-white tracking-[0.12em] uppercase leading-tight">Attijariwafa</div>
                <div className="text-[8px] text-[#FFB81C] font-black uppercase tracking-[0.2em] mt-0.5">Quant Platform</div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
                {sections.map(section => (
                    <div key={section} className="mb-5">
                        <h3 className="px-3 text-[9px] font-black text-gray-700 uppercase tracking-[0.2em] mb-1.5">{section}</h3>
                        <div className="space-y-0.5">
                            {navItems.filter(item => item.section === section).map(item => {
                                const Icon = item.icon;
                                const isActive = activePage === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onNavigate(item.id)}
                                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 ${
                                            isActive ? 'bg-[#C8102E]/10 text-[#C8102E]' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Icon size={16} className={isActive ? 'text-[#C8102E]' : 'text-gray-600 group-hover:text-gray-300 transition-colors'} />
                                            <span className={`text-[12px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                                        </div>
                                        {item.badge && (
                                            <span className="bg-[#C8102E] text-white text-[9px] font-black px-1.5 py-0.5 rounded min-w-[18px] text-center">{item.badge}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-white/[0.05]">
                <div className="bg-white/[0.02] rounded-xl p-3.5 border border-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Info size={11} className="text-[#FFB81C]" />
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">System Status</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-600">Coverage</span>
                            <span className="text-[10px] text-white font-black">39 Assets</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-600">Data Feed</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-[8px] text-center text-gray-700 font-bold uppercase tracking-[0.15em] leading-relaxed">
                    © 2026 Attijariwafa Bank<br />Quant Research Division
                </p>
            </div>
        </aside>
    );
};

export default Sidebar;

import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = ({ children, activePage, onNavigate, summary }) => {
    return (
        <div className="flex h-screen t-bg overflow-hidden transition-colors duration-500">
            <Sidebar activePage={activePage} onNavigate={onNavigate} />
            <div className="flex-1 flex flex-col min-w-0">
                <Topbar activePage={activePage} summary={summary} onNavigate={onNavigate} />
                <main className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar relative">
                    {children}
                    <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-awb-red/5 blur-[120px] rounded-full pointer-events-none -z-10 transition-colors"></div>
                    <div className="fixed bottom-0 left-0 w-[300px] h-[300px] bg-awb-gold/5 blur-[100px] rounded-full pointer-events-none -z-10 transition-colors"></div>
                </main>
            </div>
        </div>
    );
};

export default Layout;

import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = ({ children, activePage, onNavigate, summary }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleNavigate = (id) => {
        onNavigate(id);
        setSidebarOpen(false);
    };

    return (
        <div className="flex h-screen t-bg overflow-hidden transition-colors duration-500">
            {/* Main area — full width, no sidebar in flow */}
            <div className="flex-1 flex flex-col min-w-0">
                <Topbar
                    activePage={activePage}
                    summary={summary}
                    onNavigate={onNavigate}
                    onMenuToggle={() => setSidebarOpen(o => !o)}
                />
                <main className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar relative">
                    {children}
                    <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-awb-red/5 blur-[120px] rounded-full pointer-events-none -z-10 transition-colors" />
                    <div className="fixed bottom-0 left-0 w-[300px] h-[300px] bg-awb-gold/5 blur-[100px] rounded-full pointer-events-none -z-10 transition-colors" />
                </main>
            </div>

            {/* Backdrop — closes drawer on click */}
            <div
                className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300
                            ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sliding drawer — overlays content from the left */}
            <div className={`fixed left-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out
                             ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar activePage={activePage} onNavigate={handleNavigate} />
            </div>
        </div>
    );
};

export default Layout;

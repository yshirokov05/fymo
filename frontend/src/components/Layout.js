import React, { useState } from 'react';
import { LayoutDashboard, Wallet, CreditCard, PiggyBank, Settings, DollarSign, Shield, PieChart, Sparkles, Menu, X, Lock, MessageSquare, TrendingDown, BarChart3, TrendingUp } from 'lucide-react';

const Layout = ({ children, activeView, setActiveView, isPremium, onOpenFeedback }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { id: 'advisor', label: 'AI Analyst', icon: <Sparkles size={20} /> },
        { id: 'budget', label: 'Expenditures', icon: <PieChart size={20} /> },
        { id: 'income', label: 'Income', icon: <TrendingUp size={20} /> },
        { id: 'taxes', label: 'Tax Projection', icon: <DollarSign size={20} /> },
        { id: 'investments', label: 'Investments', icon: <PiggyBank size={20} /> },
        { id: 'insurance', label: 'Insurance', icon: <Shield size={20} /> },
        { id: 'debts', label: 'Debts', icon: <CreditCard size={20} /> },
        { id: 'checks', label: 'Check Tracker', icon: <DollarSign size={20} /> },
        { id: 'visualizations', label: 'Visualizations', icon: <BarChart3 size={20} /> },
        { id: 'faq', label: 'Security FAQ', icon: <Lock size={20} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
    ];

    const quickNavItems = [
        { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={24} /> },
        { id: 'advisor', label: 'AI', icon: <Sparkles size={24} /> },
        { id: 'budget', label: 'Spending', icon: <PieChart size={24} /> },
        { id: 'investments', label: 'Vault', icon: <PiggyBank size={24} /> },
        { id: 'menu', label: 'More', icon: <Menu size={24} /> },
    ];

    const handleNavClick = (id) => {
        setActiveView(id);
        setIsMobileMenuOpen(false);
    };

    const activeNavStyle = {
        backgroundColor: 'var(--accent)',
    };

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-slate-950 overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden md:flex md:w-64 bg-gray-900 text-white flex-shrink-0 flex-col">
                <div className="p-6 flex items-center justify-between">
                    <span className="text-2xl font-black tracking-tighter" style={{ color: 'var(--accent-sidebar)' }}>FHQ</span>
                    {isPremium ? (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-[10px] font-black uppercase tracking-widest">Premium</span>
                    ) : (
                        <span className="px-2 py-0.5 bg-gray-700/50 text-gray-400 border border-gray-600/50 rounded text-[10px] font-black uppercase tracking-widest">Free</span>
                    )}
                </div>
                <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto pb-4 custom-scrollbar">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            style={activeView === item.id ? activeNavStyle : {}}
                            className={`
                                w-full flex items-center space-x-3 py-3 px-4 rounded-lg transition duration-200
                                ${activeView === item.id
                                    ? 'text-white shadow-lg'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'}
                            `}
                        >
                            {item.icon}
                            <span className="font-medium">{item.label}</span>
                        </button>
                    ))}
                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <button
                            onClick={onOpenFeedback}
                            className="w-full flex items-center space-x-3 py-3 px-4 rounded-lg text-gray-400 hover:bg-blue-600/10 hover:text-blue-400 transition duration-200 group"
                        >
                            <MessageSquare size={20} className="group-hover:scale-110 transition-transform" />
                            <span className="font-medium">Feedback</span>
                        </button>
                    </div>
                </nav>
                <div className="p-4 text-[10px] text-gray-500 border-t border-gray-800 leading-tight">
                    <p className="italic mb-2">All rights reserved. Built as a solo project by Yury Shirokov.</p>
                    <div className="flex space-x-3">
                        <button onClick={() => setActiveView('privacy')} className="hover:text-gray-300 underline">Privacy Policy</button>
                        <span>·</span>
                        <button onClick={() => setActiveView('terms')} className="hover:text-gray-300 underline">Terms of Service</button>
                    </div>
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)}></div>
                    <div className="relative w-full max-w-xs bg-gray-900 text-white flex flex-col h-full shadow-xl">
                        <div className="p-6 flex items-center justify-between border-b border-gray-800">
                            <span className="text-2xl font-black tracking-tighter" style={{ color: 'var(--accent-sidebar)' }}>FHQ</span>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto pb-20">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleNavClick(item.id)}
                                    style={activeView === item.id ? activeNavStyle : {}}
                                    className={`
                                        w-full flex items-center space-x-3 py-4 px-4 rounded-lg transition duration-200
                                        ${activeView === item.id
                                            ? 'text-white shadow-lg'
                                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'}
                                    `}
                                >
                                    {item.icon}
                                    <span className="font-semibold text-lg">{item.label}</span>
                                </button>
                            ))}
                            <div className="pt-4 mt-4 border-t border-gray-800">
                                <button
                                    onClick={() => { onOpenFeedback(); setIsMobileMenuOpen(false); }}
                                    className="w-full flex items-center space-x-3 py-4 px-4 rounded-lg text-blue-400 bg-blue-400/5 transition duration-200"
                                >
                                    <MessageSquare size={24} />
                                    <span className="font-bold text-lg">Send Feedback</span>
                                </button>
                            </div>
                        </nav>
                        <div className="p-6 text-[11px] text-gray-500 border-t border-gray-800 leading-tight bg-gray-950/30">
                            <p className="italic mb-2">All rights reserved. Built as a solo project by Yury Shirokov.</p>
                            <div className="flex space-x-3">
                                <button onClick={() => { setActiveView('privacy'); setIsMobileMenuOpen(false); }} className="hover:text-gray-300 underline">Privacy Policy</button>
                                <span>·</span>
                                <button onClick={() => { setActiveView('terms'); setIsMobileMenuOpen(false); }} className="hover:text-gray-300 underline">Terms of Service</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main content area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-900 relative">
                {/* Mobile Top Bar */}
                <header className="md:hidden bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center space-x-1">
                        <Menu size={24} />
                        <span className="text-xs font-bold uppercase tracking-tight">Menu</span>
                    </button>
                    <span className="text-xl font-black tracking-tighter" style={{ color: 'var(--accent)' }}>Financial HQ</span>
                    <div className="w-16"></div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>

                {/* Mobile Bottom Nav */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-3 flex items-center justify-between z-40 safe-area-pb">
                    {quickNavItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (item.id === 'menu') {
                                    setIsMobileMenuOpen(true);
                                } else {
                                    handleNavClick(item.id);
                                }
                            }}
                            className={`p-2 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${
                                activeView === item.id
                                ? 'scale-110'
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            style={activeView === item.id ? { color: 'var(--accent)' } : {}}
                        >
                            {item.icon}
                            <span className="text-[10px] font-bold mt-0.5 uppercase tracking-tighter">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
};

export default Layout;

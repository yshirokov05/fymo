import React, { useState } from 'react';
import { LayoutDashboard, Wallet, CreditCard, PiggyBank, Settings, DollarSign, Shield, PieChart, Sparkles, Menu, X, Lock, MessageSquare, TrendingDown, BarChart3, TrendingUp, Target } from 'lucide-react';

const Layout = ({ children, activeView, setActiveView, isPremium, onOpenFeedback, capabilities = {} }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Capability-gated nav. Core tabs always show. Secondary tabs only appear when the
    // user has data that populates them — keeps the sidebar tailored and uncluttered.
    // `always` = shown regardless. `when` = boolean key from capabilities object.
    const allNavItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, always: true },
        { id: 'advisor', label: 'AI Analyst', icon: <Sparkles size={20} />, always: true },
        { id: 'budget', label: 'Expenditures', icon: <PieChart size={20} />, always: true },
        { id: 'income', label: 'Income', icon: <TrendingUp size={20} />, always: true },
        { id: 'taxes', label: 'Tax Projection', icon: <DollarSign size={20} />, when: 'hasIncome' },
        { id: 'investments', label: 'Investments', icon: <PiggyBank size={20} />, when: 'hasInvestments' },
        { id: 'insurance', label: 'Insurance', icon: <Shield size={20} />, when: 'hasInsurance' },
        { id: 'goals', label: 'Goals', icon: <Target size={20} />, always: true },
        { id: 'debts', label: 'Debts', icon: <CreditCard size={20} />, when: 'hasDebts' },
        { id: 'checks', label: 'Check Tracker', icon: <DollarSign size={20} />, when: 'hasChecks' },
        { id: 'visualizations', label: 'Visualizations', icon: <BarChart3 size={20} />, when: 'hasAnyFinancialData' },
        { id: 'faq', label: 'Security FAQ', icon: <Lock size={20} />, always: true },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} />, always: true },
    ];

    const navItems = allNavItems.filter(item => {
        // Always show the currently active view (so you can't end up stranded if you
        // delete the last item in a category while viewing its tab).
        if (activeView === item.id) return true;
        if (item.always) return true;
        if (item.when) return !!capabilities[item.when];
        return true;
    });

    // Mobile bottom nav — swap "Vault" for "Goals" when user has no investments so the
    // primary tap target actually matches what they use.
    const quickNavItems = [
        { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={24} /> },
        { id: 'advisor', label: 'AI', icon: <Sparkles size={24} /> },
        { id: 'budget', label: 'Spending', icon: <PieChart size={24} /> },
        capabilities.hasInvestments
            ? { id: 'investments', label: 'Vault', icon: <PiggyBank size={24} /> }
            : { id: 'goals', label: 'Goals', icon: <Target size={24} /> },
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
            <div className="hidden md:flex md:w-56 bg-slate-950 text-white flex-shrink-0 flex-col border-r border-slate-800/60">
                <div className="px-5 py-5 flex items-center justify-between">
                    <span className="text-xl font-black tracking-tighter" style={{ color: 'var(--accent-sidebar)' }}>Fymo</span>
                    {isPremium ? (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[9px] font-black uppercase tracking-widest">Premium</span>
                    ) : (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-500 border border-slate-700/50 rounded-md text-[9px] font-black uppercase tracking-widest">Free</span>
                    )}
                </div>
                <nav className="flex-1 mt-2 px-3 space-y-0.5 overflow-y-auto pb-4 custom-scrollbar">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`
                                w-full flex items-center space-x-3 py-2.5 px-3 rounded-lg transition-all duration-150 text-left
                                ${activeView === item.id
                                    ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 pl-[10px]'
                                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border-l-2 border-transparent'}
                            `}
                        >
                            <span className={activeView === item.id ? 'text-blue-400' : 'text-slate-500'}>{item.icon}</span>
                            <span className={`text-sm ${activeView === item.id ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                        </button>
                    ))}
                    <div className="pt-3 mt-3 border-t border-slate-800/60">
                        <button
                            onClick={onOpenFeedback}
                            className="w-full flex items-center space-x-3 py-2.5 px-3 rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all duration-150 border-l-2 border-transparent group"
                        >
                            <MessageSquare size={20} className="text-slate-500" />
                            <span className="text-sm font-medium">Feedback</span>
                        </button>
                    </div>
                </nav>
                <div className="px-4 py-3 text-[10px] text-slate-600 border-t border-slate-800/60 leading-tight">
                    <p className="mb-1.5">Built by Yury Shirokov</p>
                    <div className="flex space-x-2">
                        <button onClick={() => setActiveView('privacy')} className="hover:text-slate-400 underline">Privacy</button>
                        <span>·</span>
                        <button onClick={() => setActiveView('terms')} className="hover:text-slate-400 underline">Terms</button>
                    </div>
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)}></div>
                    <div className="relative w-full max-w-xs bg-gray-900 text-white flex flex-col h-full shadow-xl">
                        <div className="p-6 flex items-center justify-between border-b border-gray-800">
                            <span className="text-2xl font-black tracking-tighter" style={{ color: 'var(--accent-sidebar)' }}>Fymo</span>
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
                    <span className="text-xl font-black tracking-tighter" style={{ color: 'var(--accent)' }}>Fymo</span>
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

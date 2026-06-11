import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext';
import { Shield, Check, Star, RefreshCw, Activity, Wrench, Trash2, Tag, X, Moon, Sun, Palette, AlertTriangle, ExternalLink } from 'lucide-react';
import PlaidLink from './PlaidLink';
import CategoryRulesManager from './CategoryRulesManager';
import TwoFactorSettings from './TwoFactorSettings';
import MorningBriefSettings from './MorningBriefSettings';
import { track } from '../analytics';
import axios from 'axios';
import { useToast } from './Toast';

const Settings = ({ isGuest, onResetGuest, isPremium, plaidItems, fetchData, handlePlaidSync, onPlaidSuccess, isSyncing, syncMessage, customCategories = [], onSaveCustomCategories }) => {
    const { currentUser, logout } = useAuth();
    const { showToast } = useToast();
    const { isDark, toggleDark, accentId, setAccentId } = useTheme();
    const [health, setHealth] = useState(null);
    const [plaidError, setPlaidError] = useState(null);
    const [updateToken, setUpdateToken] = useState(null);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [isResetLoading, setIsResetLoading] = useState(false);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
    const [showUnsupportedList, setShowUnsupportedList] = useState(false);

    const handleFixConnection = async (institutionName) => {
        try {
            const token = await currentUser.getIdToken();
            const response = await axios.post('/api/create_update_token', { 
                institution_name: institutionName 
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUpdateToken(response.data.link_token);
        } catch (err) {
            showToast("Failed to start update mode: " + (err.response?.data?.error || err.message), "error");
        }
    };

    const handleRemoveInstitution = async (institutionName) => {
        if (!window.confirm(`Are you sure you want to disconnect ${institutionName}? This will also remove associated synced data.`)) return;
        
        try {
            const token = await currentUser.getIdToken();
            await axios.post('/api/remove_institution', { 
                institution_name: institutionName 
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            showToast("Institution disconnected successfully.", "success");
        } catch (err) {
            showToast("Failed to remove institution: " + (err.response?.data?.error || err.message), "error");
        }
    };

    const handleClearOrphanedData = async () => {
        if (!window.confirm("This will remove all synced assets and debts that don't belong to your currently linked institutions. Manual data will be kept. Proceed?")) return;
        
        try {
            const token = await currentUser.getIdToken();
            await axios.put('/api/portfolio', { clear_orphaned_plaid: true }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            showToast("Orphaned data cleared successfully!", "success");
        } catch (err) {
            showToast("Failed to clear orphaned data: " + (err.response?.data?.error || err.message), "error");
        }
    };

    useEffect(() => {
        if (currentUser?.email === 'yshirokov05@gmail.com') {
            currentUser.getIdToken().then(token => {
                axios.get('/api/health', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(res => {
                    setHealth(res.data);
                    setPlaidError("None - Backend is healthy");
                }).catch(() => {});
            });
        }
    }, [currentUser]);

    if (isGuest) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-white/5">
                    <p className="text-lg text-gray-700 dark:text-gray-300 font-medium mb-4">To access settings and premium features, please create an account.</p>
                    <button
                        onClick={onResetGuest}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold"
                    >
                        Create an Account
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Account Settings</h1>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <Shield className="mr-2 text-blue-600" size={20} />
                        Account Information
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Email Address</label>
                            <p className="mt-1 text-gray-900 dark:text-gray-200 font-medium">
                                {currentUser?.email ? currentUser.email.replace(/(.{2}).*(@.*)/, "$1****$2") : 'N/A'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">User ID</label>
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">
                                {currentUser?.uid ? `${currentUser.uid.substring(0, 6)}...${currentUser.uid.substring(currentUser.uid.length - 4)}` : 'N/A'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <Star className="mr-2 text-amber-500" size={20} />
                        Subscription Status
                    </h2>
                    
                    {isPremium ? (
                        <div className="space-y-6">
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-700/30 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex space-x-3">
                                        <div className="bg-green-500 rounded-full p-1 text-white flex-shrink-0">
                                            <Check size={16} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-green-800 dark:text-green-300">Premium Active</h3>
                                            <p className="text-green-700 dark:text-green-400 text-sm">
                                                You have full access to all features, including automatic bank syncing and advanced tax estimation.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const token = await currentUser.getIdToken();
                                                const res = await axios.post('/api/create_portal_session', {}, {
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                window.location.href = res.data.url;
                                            } catch (err) {
                                                showToast("Error: " + (err.response?.data?.error || err.message), "error");
                                            }
                                        }}
                                        className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 border border-blue-200 dark:border-blue-700 hover:border-blue-400 rounded-lg px-3 py-1.5 transition-colors"
                                    >
                                        <ExternalLink size={12} />
                                        Manage Subscription
                                    </button>
                                </div>
                                <p className="mt-3 ml-9 text-xs text-green-600 dark:text-green-500">
                                    Use the billing portal to update your payment method, download invoices, or cancel anytime.
                                </p>
                            </div>

                            <div className="pt-4 border-t">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Bank & Brokerage Sync</h3>
                                <div className="mb-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3">
                                    <div className="flex items-start space-x-3">
                                        <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-amber-900 mb-1">Not every institution works with Plaid</p>
                                            <p className="text-xs text-amber-800 leading-relaxed">
                                                Fymo uses Plaid to sync balances, transactions, and holdings. Plaid covers 12,000+ banks and brokerages — but not all. For unsupported institutions, use <span className="font-bold">Edit Portfolio</span> on the Investments page or manual entry elsewhere. Your totals will still combine correctly.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setShowUnsupportedList(v => !v)}
                                                className="mt-2 text-xs font-bold text-amber-900 underline hover:text-amber-700"
                                            >
                                                {showUnsupportedList ? 'Hide' : 'Show'} commonly unsupported institutions
                                            </button>
                                            {showUnsupportedList && (
                                                <ul className="mt-2 text-xs text-amber-800 space-y-1 list-disc ml-4">
                                                    <li><span className="font-bold">Morgan Stanley</span> — wealth management / E*TRADE legacy accounts</li>
                                                    <li><span className="font-bold">Fidelity 401(k)</span> — employer retirement plans (personal Fidelity accounts work)</li>
                                                    <li><span className="font-bold">Most employer-sponsored 401(k)/403(b)/457</span> — Empower, Principal, Voya, TIAA retirement arms</li>
                                                    <li><span className="font-bold">HSA providers</span> — HealthEquity, Fidelity HSA (limited coverage)</li>
                                                    <li><span className="font-bold">Some credit unions & regional banks</span> — if you don't see yours, try searching by exact name</li>
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <PlaidLink onPlaidSuccess={onPlaidSuccess} updateToken={updateToken} onUpdateReset={() => setUpdateToken(null)} />
                                    {plaidItems.length > 0 && (
                                        <div className="flex items-center space-x-3">
                                            <button 
                                                onClick={handlePlaidSync}
                                                disabled={isSyncing}
                                                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                                                    isSyncing 
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                                }`}
                                            >
                                                <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
                                                <span>{isSyncing ? "Syncing..." : "Manual Sync Now"}</span>
                                            </button>
                                            {syncMessage && (
                                                <div className={`px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm ${syncMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                    {syncMessage.text}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                {plaidItems.length > 0 && (
                                    <div className="mt-6 border rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-gray-50 px-4 py-3 border-b text-sm font-bold text-gray-700 uppercase tracking-wider">Linked Institutions</div>
                                        {plaidItems.map((pi, i) => (
                                            <div key={i} className="px-4 py-4 flex justify-between items-center border-b last:border-0 bg-white hover:bg-gray-50 transition-colors">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900">{pi.institution_name}</span>
                                                    <span className="text-xs text-green-600 font-medium">Connected</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-xs text-gray-400">Last synced: {pi.last_sync ? new Date(pi.last_sync).toLocaleString() : 'Never'}</span>
                                                    <button 
                                                        onClick={() => handleFixConnection(pi.institution_name)}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                        title="Fix Connection"
                                                    >
                                                        <Wrench size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleRemoveInstitution(pi.institution_name)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Remove Connection"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-700/30 rounded-lg p-4">
                                <h3 className="font-semibold text-blue-800 dark:text-blue-300">Free Account</h3>
                                <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                                    Upgrade to Premium to unlock automated bank syncing through Plaid.
                                </p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="p-6 border dark:border-white/10 rounded-xl bg-gray-50 dark:bg-slate-700/50 opacity-60">
                                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-2 text-center">Free Plan</h3>
                                    <p className="text-3xl font-bold mb-4 text-center">$0 <span className="text-sm text-gray-500 font-normal">/ month</span></p>
                                    <ul className="space-y-2 mb-6 text-sm">
                                        <li className="flex items-center text-gray-600"><Check size={14} className="mr-2 text-green-500" /> Manual Data Entry</li>
                                        <li className="flex items-center text-gray-600"><Check size={14} className="mr-2 text-green-500" /> Net Worth Dashboard</li>
                                        <li className="flex items-center text-gray-600"><Check size={14} className="mr-2 text-green-500" /> Basic Tax Estimator</li>
                                    </ul>
                                    <button disabled className="w-full py-2 bg-gray-200 text-gray-500 rounded-lg font-bold">Current Plan</button>
                                </div>

                                <div className="p-6 border-2 border-blue-600 rounded-xl bg-blue-50 relative overflow-hidden shadow-lg">
                                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-3 py-1 font-black rounded-bl-lg uppercase tracking-tighter">Recommended</div>
                                    <h3 className="font-bold text-gray-900 text-lg mb-2 text-center">Premium Plan</h3>
                                    <p className="text-3xl font-bold mb-4 text-center">$9.99 <span className="text-sm text-gray-500 font-normal">/ month</span></p>
                                    <ul className="space-y-2 mb-6 text-sm font-medium">
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Everything in Free</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Automatic Bank Syncing</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Investment Refreshing</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Automated Debt Tracking</li>
                                    </ul>
                                    <button
                                        disabled={isCheckoutLoading}
                                        onClick={async () => {
                                            setIsCheckoutLoading(true);
                                            track('begin_checkout', { value: 9.99, currency: 'USD', items: [{ item_name: 'Fymo Premium' }] });
                                            try {
                                                const token = await currentUser.getIdToken();
                                                const res = await axios.post('/api/create_checkout_session', {}, {
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                window.location.href = res.data.url;
                                            } catch (err) {
                                                showToast('Could not start checkout. Please try again.', 'error');
                                                setIsCheckoutLoading(false);
                                            }
                                        }}
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isCheckoutLoading ? 'Redirecting...' : 'Subscribe — $9.99/mo'}
                                    </button>
                                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">Renews monthly · Cancel anytime from Settings</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Security ── */}
            {!isGuest && (
                <div className="mb-8 space-y-4">
                    <TwoFactorSettings />
                    <MorningBriefSettings />
                </div>
            )}

            {/* ── Theme & Appearance ── */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
                        <Palette className="mr-2 text-indigo-500" size={20} />
                        Appearance
                    </h2>

                    {/* Dark / Light toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl mb-4">
                        <div className="flex items-center space-x-3">
                            {isDark ? <Moon size={20} className="text-indigo-400" /> : <Sun size={20} className="text-amber-500" />}
                            <div>
                                <p className="font-bold text-gray-900 dark:text-gray-100">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Toggle the interface theme</p>
                            </div>
                        </div>
                        <button
                            onClick={toggleDark}
                            role="switch"
                            aria-checked={isDark}
                            aria-label="Toggle dark mode"
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                                isDark ? 'bg-indigo-600' : 'bg-gray-300'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    isDark ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>

                    {/* Accent colour picker */}
                    <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                        <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">Accent Colour</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Changes highlights, active states, and buttons</p>
                        <div className="flex flex-wrap gap-3">
                            {ACCENT_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => setAccentId(preset.id)}
                                    title={preset.label}
                                    className={`flex flex-col items-center gap-1.5 group`}
                                >
                                    <span
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                                            accentId === preset.id ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                                        }`}
                                        style={{ backgroundColor: preset.color }}
                                    >
                                        {accentId === preset.id && (
                                            <Check size={14} className="text-white" strokeWidth={3} />
                                        )}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-500">{preset.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Category Rules ── */}
            {isPremium && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden mb-8">
                    <div className="p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center">
                            <Tag className="mr-2 text-blue-500" size={20} />
                            Category Rules
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                            Automatically assign categories to transactions based on merchant name patterns.
                            Rules are applied on every Plaid sync — set them once and forget.
                        </p>
                        <CategoryRulesManager customCategories={customCategories} />
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <Wrench className="mr-2 text-gray-600 dark:text-gray-400" size={20} />
                        Data Management
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        Use these tools to clear orphaned data or reset your account if things look incorrect.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-gray-100">Clear Orphaned Plaid Data</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Removes assets and debts from institutions you've already disconnected.</p>
                            </div>
                            <button 
                                onClick={handleClearOrphanedData}
                                className="px-4 py-2 border border-amber-200 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-50"
                            >
                                Clear Orphaned
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-gray-100">Clear All Transactions</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Purges your transaction history while keeping assets and budgets.</p>
                            </div>
                            <button 
                                onClick={async () => {
                                    if (!window.confirm("Are you sure? This will permanently delete all transaction history.")) return;
                                    try {
                                        const token = await currentUser.getIdToken();
                                        await axios.put('/api/portfolio', { clear_all_transactions: true }, {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        fetchData();
                                        showToast("Transactions cleared!", "success");
                                    } catch (err) { showToast(err.message, "error"); }
                                }}
                                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50"
                            >
                                Clear Transactions
                            </button>
                        </div>

                        <div className="flex flex-col space-y-4 p-4 bg-red-50 rounded-lg border border-red-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-red-900">Factory Reset Account</h3>
                                    <p className="text-xs text-red-700">Deletes EVERYTHING (assets, incomes, debts, transactions). <span className="font-bold underline italic">Does not cancel subscription.</span></p>
                                </div>
                                <Trash2 className="text-red-300" size={24} />
                            </div>
                            
                            <div className="pt-2 border-t border-red-100">
                                <p className="text-xs text-red-800 mb-2 font-medium">To confirm, please type <span className="font-bold font-mono">RESET</span> below:</p>
                                <div className="flex space-x-2">
                                    <input 
                                        type="text"
                                        value={resetConfirmation}
                                        onChange={(e) => setResetConfirmation(e.target.value)}
                                        placeholder="Type RESET"
                                        className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                                    />
                                    <button 
                                        disabled={resetConfirmation !== 'RESET' || isResetLoading}
                                        onClick={async () => {
                                            if (!window.confirm("FINAL WARNING: This will delete ALL your financial data. This cannot be undone. Proceed?")) return;
                                            setIsResetLoading(true);
                                            try {
                                                const token = await currentUser.getIdToken();
                                                await axios.put('/api/portfolio', { clear_all_data: true }, {
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                setResetConfirmation('');
                                                fetchData();
                                                showToast("Account reset successful.", "success");
                                            } catch (err) { showToast(err.message, "error"); }
                                            setIsResetLoading(false);
                                        }}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all ${
                                            resetConfirmation === 'RESET' && !isResetLoading
                                            ? 'bg-red-600 text-white hover:bg-red-700' 
                                            : 'bg-red-200 text-red-400 cursor-not-allowed'
                                        }`}
                                    >
                                        {isResetLoading ? 'Resetting...' : 'Reset All Data'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-center mt-12 pb-4">
                <button 
                    onClick={logout}
                    className="px-8 py-2 border border-red-200 text-red-600 rounded-lg font-bold hover:bg-red-50 transition-colors"
                >
                    Sign Out
                </button>
            </div>

            {['yshirokov05@gmail.com', 'yshirokov@gmail.com', 'ys05@gmail.com'].includes(currentUser?.email?.toLowerCase()) && (
                <div className="mt-8 p-4 bg-gray-100 rounded-lg border border-gray-200 text-[10px] font-mono text-gray-500">
                    <p className="font-bold mb-1 flex items-center"><Activity size={10} className="mr-1"/> OWNER DEBUG INFO</p>
                    <p>UID: {currentUser.uid}</p>
                    <p>Plaid Configured: {health?.plaid_configured ? 'YES' : 'NO (Action Required)'}</p>
                    <p>Plaid Env: {health?.environment || 'unknown'}</p>
                    <p>Plaid Items Found: {plaidItems?.length || 0}</p>
                    <p>Plaid Token Error: <span className="text-red-500">{plaidError || 'Checking...'}</span></p>
                    <p>Frontend Premium: {isPremium ? 'TRUE' : 'FALSE'}</p>
                </div>
            )}
        </div>
    );
};

export default Settings;

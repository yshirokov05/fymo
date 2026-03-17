import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Check, Star, RefreshCw, Activity, AlertCircle, Wrench, Trash2, Tag, X } from 'lucide-react';
import PlaidLink from './PlaidLink';
import axios from 'axios';

const Settings = ({ isGuest, onResetGuest, isPremium, plaidItems, fetchData, handlePlaidSync, onPlaidSuccess, isSyncing, customCategories = [], onSaveCustomCategories }) => {
    const { currentUser, logout } = useAuth();
    const [health, setHealth] = useState(null);
    const [plaidError, setPlaidError] = useState(null);
    const [updateToken, setUpdateToken] = useState(null);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [isResetLoading, setIsResetLoading] = useState(false);

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
            alert("Failed to start update mode: " + (err.response?.data?.error || err.message));
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
            alert("Institution disconnected successfully.");
        } catch (err) {
            alert("Failed to remove institution: " + (err.response?.data?.error || err.message));
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
            alert("Orphaned data cleared successfully!");
        } catch (err) {
            alert("Failed to clear orphaned data: " + (err.response?.data?.error || err.message));
        }
    };

    useEffect(() => {
        if (currentUser?.email === 'yshirokov05@gmail.com') {
            currentUser.getIdToken().then(token => {
                axios.get('/api/health', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(res => setHealth(res.data)).catch(() => {});
                
                // Try a test token generation to see the error
                axios.post('/api/create_link_token', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(() => setPlaidError("None - Backend is healthy"))
                .catch(err => setPlaidError(err.response?.data?.error || err.message));
            });
        }
    }, [currentUser]);

    if (isGuest) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-lg text-gray-700 font-medium mb-4">To access settings and premium features, please create an account.</p>
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
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                        <Shield className="mr-2 text-blue-600" size={20} />
                        Account Information
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Email Address</label>
                            <p className="mt-1 text-gray-900 font-medium">
                                {currentUser?.email ? currentUser.email.replace(/(.{2}).*(@.*)/, "$1****$2") : 'N/A'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500">User ID</label>
                            <p className="mt-1 text-xs text-gray-400 font-mono">
                                {currentUser?.uid ? `${currentUser.uid.substring(0, 6)}...${currentUser.uid.substring(currentUser.uid.length - 4)}` : 'N/A'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                        <Star className="mr-2 text-amber-500" size={20} />
                        Subscription Status
                    </h2>
                    
                    {isPremium ? (
                        <div className="space-y-6">
                            <div className="bg-green-50 border border-green-100 rounded-lg p-4 flex items-start justify-between">
                                <div className="flex space-x-3">
                                    <div className="bg-green-500 rounded-full p-1 text-white">
                                        <Check size={16} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-green-800">Premium Active</h3>
                                        <p className="text-green-700 text-sm">
                                            You have full access to all features, including automatic bank syncing and advanced tax estimation.
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if (!window.confirm("Are you sure you want to cancel your premium subscription? You will lose access to automated features at the end of your billing cycle.")) return;
                                        try {
                                            const token = await currentUser.getIdToken();
                                            await axios.post('/api/cancel_subscription', {}, {
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            alert("Subscription cancellation request received. Our team will process it shortly.");
                                            fetchData();
                                        } catch (err) { alert("Error: " + (err.response?.data?.error || err.message)); }
                                    }}
                                    className="text-xs font-bold text-red-600 hover:text-red-700 underline"
                                >
                                    Cancel Subscription
                                </button>
                            </div>

                            <div className="pt-4 border-t">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Bank & Brokerage Sync</h3>
                                <div className="flex flex-wrap gap-4">
                                    <PlaidLink onPlaidSuccess={onPlaidSuccess} updateToken={updateToken} onUpdateReset={() => setUpdateToken(null)} />
                                    {plaidItems.length > 0 && (
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
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                <h3 className="font-semibold text-blue-800">Free Account</h3>
                                <p className="text-blue-700 text-sm mt-1">
                                    Upgrade to Premium to unlock automated bank syncing through Plaid.
                                </p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="p-6 border rounded-xl bg-gray-50 opacity-60">
                                    <h3 className="font-bold text-gray-900 text-lg mb-2 text-center">Free Plan</h3>
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
                                    <p className="text-3xl font-bold mb-4 text-center">$5.99 <span className="text-sm text-gray-500 font-normal">/ month</span></p>
                                    <ul className="space-y-2 mb-6 text-sm font-medium">
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Everything in Free</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Automatic Bank Syncing</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Investment Refreshing</li>
                                        <li className="flex items-center text-blue-800"><Check size={14} className="mr-2 text-green-600" /> Automated Debt Tracking</li>
                                    </ul>
                                    <button 
                                        onClick={() => {
                                            const subject = encodeURIComponent("Access Request: Financial Headquarters");
                                            const body = encodeURIComponent("Hi, I'd like to request premium access for my account. My email is: " + (currentUser?.email || ""));
                                            window.location.href = `mailto:yshirokov05@gmail.com?subject=${subject}&body=${body}`;
                                        }}
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                                    >
                                        Request Early Access
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                        <Tag className="mr-2 text-indigo-600" size={20} />
                        Custom Budget Categories
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">Add your own categories like "Hair" or "Nails" to categorize transactions.</p>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                        {customCategories.map((cat, idx) => (
                            <div key={idx} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold flex items-center space-x-2">
                                <span>{cat}</span>
                                <button 
                                    onClick={() => {
                                        if (window.confirm(`Delete category "${cat}"?`)) {
                                            onSaveCustomCategories(customCategories.filter(c => c !== cat));
                                        }
                                    }}
                                    className="hover:text-red-500 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {customCategories.length === 0 && <p className="text-gray-400 text-xs italic">No custom categories added yet.</p>}
                    </div>

                    <div className="flex space-x-2">
                        <input 
                            type="text" 
                            id="new-category-input"
                            placeholder="Add category (e.g. Nails)" 
                            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && e.target.value) {
                                    onSaveCustomCategories([...customCategories, e.target.value]);
                                    e.target.value = '';
                                }
                            }}
                        />
                        <button 
                            onClick={() => {
                                const input = document.getElementById('new-category-input');
                                if (input.value) {
                                    onSaveCustomCategories([...customCategories, input.value]);
                                    input.value = '';
                                }
                            }}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-sm active:scale-95"
                        >
                            Add
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                        <Wrench className="mr-2 text-gray-600" size={20} />
                        Data Management
                    </h2>
                    <p className="text-sm text-gray-600 mb-6">
                        Use these tools to clear orphaned data or reset your account if things look incorrect.
                    </p>
                    
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h3 className="font-bold text-gray-900">Clear Orphaned Plaid Data</h3>
                                <p className="text-xs text-gray-500">Removes assets and debts from institutions you've already disconnected.</p>
                            </div>
                            <button 
                                onClick={handleClearOrphanedData}
                                className="px-4 py-2 border border-amber-200 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-50"
                            >
                                Clear Orphaned
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <h3 className="font-bold text-gray-900">Clear All Transactions</h3>
                                <p className="text-xs text-gray-500">Purges your transaction history while keeping assets and budgets.</p>
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
                                        alert("Transactions cleared!");
                                    } catch (err) { alert(err.message); }
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
                                                alert("Account reset successful.");
                                            } catch (err) { alert(err.message); }
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

            {currentUser?.email === 'yshirokov05@gmail.com' && (
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

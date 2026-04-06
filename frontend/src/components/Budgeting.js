import React, { useState } from 'react';
import Card from './Card';
import axios from 'axios';
import { Plus, Trash2, PieChart, ShoppingCart, Home, Car, Coffee, PlayCircle, Zap, Wrench, ChevronDown, ChevronUp, Tag, CreditCard, X, Search, BarChart2, Star, ChevronLeft, ChevronRight, Calendar, RefreshCw, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { useToast } from './Toast';

const Budgeting = ({ budgets, transactions, onSaveBudgets, currentUser, customCategories = [], onSaveCustomCategories, fetchData, ignoredSubscriptions = [], manualSubscriptions = [], setIgnoredSubscriptions, setManualSubscriptions, ignoredFlexible = [], onUpdateIgnoredFlexible }) => {
    const { showToast } = useToast();
    const [newCategory, setNewCategory] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedBudgets, setEditedBudgets] = useState([...budgets]);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [analysisSearch, setAnalysisSearch] = useState('');
    const [categoryUpdatePending, setCategoryUpdatePending] = useState(null);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [isSavingCategory, setIsSavingCategory] = useState(false);
    
    // Default to current month/year: "2026-04"
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const handleUpdateSubscriptionPrefs = async (newIgnored, newManual) => {
        try {
            const token = await currentUser.getIdToken();
            await axios.post('/api/user/subscription_preferences', {
                ignored_subscription_merchants: newIgnored,
                manual_subscription_merchants: newManual
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state in parent
            if (setIgnoredSubscriptions) setIgnoredSubscriptions(newIgnored);
            if (setManualSubscriptions) setManualSubscriptions(newManual);
        } catch (err) {
            console.error(err);
            showToast("Failed to update preferences", "error");
        } finally {
        }
    };

    // ... (categories and periods logic same)
    const baseCategories = [
        { name: 'Housing', icon: <Home size={16} /> },
        { name: 'Groceries', icon: <ShoppingCart size={16} /> },
        { name: 'Eating Out', icon: <Coffee size={16} /> },
        { name: 'Vehicle Maintenance', icon: <Wrench size={16} /> },
        { name: 'Transportation', icon: <Car size={16} /> },
        { name: 'Personal Care', icon: <Zap size={16} /> },
        { name: 'Entertainment', icon: <PlayCircle size={16} /> },
        { name: 'Utilities', icon: <Zap size={16} /> },
        { name: 'Fixed Subscriptions', icon: <PlayCircle size={16} /> },
        { name: 'Debit Card', icon: <CreditCard size={16} /> },
        { name: 'Other', icon: <PieChart size={16} /> },
    ];
    
    const categories = [...baseCategories, ...customCategories.map(c => ({ name: c, icon: <Tag size={16} /> }))];
    
    const periods = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually'];



    const getTransactionCategory = (transaction) => {
        if (transaction.category && transaction.category !== 'Uncategorized') return transaction.category;
        
        const name = (transaction.name || "").toLowerCase();
        
        // Specific exclusions first
        if (name.includes('vanguard') || name.includes('chase card') || name.includes('payment to') || name.includes('zelle') || name.includes('stradavarius') || name.includes('moose llc') || name.includes('transfer') || name.includes('funding')) return 'Ignore';
        
        // Distinction: Safeway Gas vs Groceries
        if (name.includes('safeway fuel') || name.includes('safeway gas') || name.includes('safeway #') || name.includes('safeway station') || name.includes('safeway pump')) return 'Transportation';
        if (name.includes('safeway') || name.includes('grocer') || name.includes('kroger') || name.includes('trader joe') || name.includes('costco') || name.includes('target') || name.includes('walmart') || name.includes('whole foods') || name.includes('sprouts')) return 'Groceries';
        
        if (name.includes('dining') || name.includes('mcdonald') || name.includes('starbucks') || name.includes('coffee') || name.includes('cal dining') || name.includes('uber eats') || name.includes('doordash') || name.includes('ramen') || name.includes('pizza') || name.includes('grill') || name.includes('wings') || name.includes('cafe') || name.includes('baguette') || name.includes('eataly') || name.includes('in-n-out') || name.includes('mountain mikes') || name.includes('nick the greek') || name.includes('house of three') || name.includes('kiklo')) return 'Eating Out';
        if (name.includes('tire') || name.includes('oil change') || name.includes('mechanic') || name.includes('auto repair') || name.includes('dmv') || name.includes('registration') || name.includes('jiffy lube')) return 'Vehicle Maintenance';
        if (name.includes('parking') || name.includes('garage') || name.includes('car wash') || name.includes('ace parking') || name.includes('uber') || name.includes('lyft') || name.includes('transit') || name.includes('bus') || name.includes('train') || name.includes('gas') || name.includes('chevron') || name.includes('shell') || name.includes('fuel') || name.includes('mobil')) return 'Transportation';
        if (name.includes('hair') || name.includes('nail') || name.includes('salon') || name.includes('barber') || name.includes('massage') || name.includes('spa') || name.includes('great clips') || name.includes('sephora') || name.includes('cvs')) return 'Personal Care';
        if (name.includes('paramount') || name.includes('netflix') || name.includes('hulu') || name.includes('spotify') || name.includes('disney+') || name.includes('openai') || name.includes('chatgpt') || name.includes('martial arts') || name.includes('gym') || name.includes('yalis') || name.includes('heroes') || name.includes('membership')) return 'Fixed Subscriptions';
        if (name.includes('movie') || name.includes('ticket') || name.includes('show') || name.includes('gaming') || name.includes('steam') || name.includes('playstation') || name.includes('nintendo') || name.includes('hobby')) return 'Entertainment';
        if (name.includes('rent') || name.includes('mortgage') || name.includes('hoa') || name.includes('property tax')) return 'Housing';
        if (name.includes('pge') || name.includes('water') || name.includes('utility') || name.includes('comcast') || name.includes('at&t')) return 'Utilities';
        
        return 'Other';
    };

    const handleCategoryChange = async (t, newCategory, createRule = false) => {
        setIsUpdatingCategory(true);
        try {
            const token = await currentUser.getIdToken();
            const res = await axios.put(`/api/transactions/${t.id}/category`, {
                category: newCategory,
                create_rule: createRule,
                merchant_name: t.name
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 200) {
                // IMPORTANT: Fetch first, THEN clear pending to avoid the "snap-back" glitch
                if (fetchData) {
                    await fetchData();
                } else {
                    window.location.reload();
                }
                setCategoryUpdatePending(null);
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to update category: " + (err.response?.data?.error || err.message), "error");
        } finally {
            setIsUpdatingCategory(false);
        }
    };

    const getSpentForCategory = (category, period) => {
        // Find beginning and end of the SELECTED month
        const [year, month] = selectedMonth.split('-').map(Number);
        const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
        
        return transactions
            .filter(t => {
                const tCat = getTransactionCategory(t);
                // Fix: Compare only the date part of ISO strings (YYYY-MM-DD)
                const tDatePart = t.date.split('T')[0];
                return tCat.trim().toLowerCase() === category.trim().toLowerCase() && 
                       tCat !== 'Ignore' && 
                       tDatePart >= startOfMonth && 
                       tDatePart <= endOfMonth;
            })
            .reduce((sum, t) => sum + t.amount, 0);
    };

    // Helper: get previous month spending for a category (for context display)
    const getPrevMonthSpent = (category) => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const prevDate = new Date(year, month - 2, 1);
        const startOfPrev = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1).toISOString().split('T')[0];
        const endOfPrev = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split('T')[0];
        
        return transactions
            .filter(t => {
                const tCat = getTransactionCategory(t);
                const tDatePart = t.date.split('T')[0];
                return tCat.trim().toLowerCase() === category.trim().toLowerCase() && 
                       tCat !== 'Ignore' && 
                       tDatePart >= startOfPrev && 
                       tDatePart <= endOfPrev;
            })
            .reduce((sum, t) => sum + t.amount, 0);
    };

    // Flexible Spending: explicit $0 limit budgets + categories with spending but no hard budget
    const getFlexibleSpending = () => {
        const currentBudgets = isEditing ? editedBudgets : budgets;
        const hardBudgetedCategories = new Set(currentBudgets.filter(b => b.limit_amount > 0).map(b => b.category.trim().toLowerCase()));
        
        const explicitFlexibleBudgets = currentBudgets.filter(b => b.limit_amount === 0 || !b.limit_amount);
        const explicitFlexibleCategoryNames = new Set(explicitFlexibleBudgets.map(b => b.category.trim().toLowerCase()));

        const ignoredSet = new Set(ignoredFlexible.map(c => c.trim().toLowerCase()));
        const categorySpend = {};
        
        const [year, month] = selectedMonth.split('-').map(Number);
        const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
        
        // Seed explicitly tracked categories
        explicitFlexibleBudgets.forEach(b => {
             categorySpend[b.category] = 0;
        });

        transactions.forEach(t => {
            if (t.amount <= 0) return;
            const cat = getTransactionCategory(t);
            if (cat === 'Ignore') return;
            
            if (hardBudgetedCategories.has(cat.toLowerCase())) return; 
            if (ignoredSet.has(cat.toLowerCase()) && !explicitFlexibleCategoryNames.has(cat.toLowerCase())) return; 

            // Fix: Compare only the date part (YYYY-MM-DD)
            const tDatePart = t.date.split('T')[0];
            if (tDatePart >= startOfMonth && tDatePart <= endOfMonth) {
                categorySpend[cat] = (categorySpend[cat] || 0) + t.amount;
            }
        });
        
        const results = Object.entries(categorySpend)
            .map(([name, amount]) => ({ name, amount, isExplicit: explicitFlexibleCategoryNames.has(name.toLowerCase()) }))
            .sort((a, b) => b.amount - a.amount);
            
        console.log(`FLEX-DEBUG [${selectedMonth}]: Spending found: ${results.length} categories. Ignored list: ${ignoredFlexible.length}. Hard Budgets: ${hardBudgetedCategories.size}`);
        return results;
    };

    const getNormalizedMonthlyLimit = (limit_amount, period) => {
        if (!limit_amount) return 0;
        switch (period) {
            case 'Weekly': return limit_amount * (52 / 12);
            case 'Bi-Weekly': return limit_amount * (26 / 12);
            case 'Quarterly': return limit_amount / 3;
            case 'Bi-Annually': return limit_amount / 6;
            case 'Annually': return limit_amount / 12;
            case 'Monthly':
            default: return limit_amount;
        }
    };

    const handleAddBudget = () => {
        setEditedBudgets([...editedBudgets, { id: Date.now().toString(), category: 'Other', limit_amount: 0, period: 'Monthly' }]);
        setIsEditing(true);
    };

    const handleRemoveBudget = (index) => {
        const newBudgets = [...editedBudgets];
        newBudgets.splice(index, 1);
        setEditedBudgets(newBudgets);
    };

    const handleSave = () => {
        onSaveBudgets(editedBudgets);
        setIsEditing(false);
    };

    const getMonthlyAnalysis = () => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const startOfThisMonth = new Date(year, month - 1, 1);
        const startOfLastMonth = new Date(year, month - 2, 1);
        const endOfLastMonth = new Date(year, month - 1, 0);

        const thisMonthStartStr = startOfThisMonth.toISOString().split('T')[0];
        const thisMonthEndStr = new Date(year, month, 0).toISOString().split('T')[0];
        const lastMonthStartStr = startOfLastMonth.toISOString().split('T')[0];
        const lastMonthEndStr = endOfLastMonth.toISOString().split('T')[0];

        const results = {};
        
        transactions.forEach(t => {
            // Only expenses
            if (t.amount <= 0) return;
            
            const cat = getTransactionCategory(t);
            if (cat === 'Ignore') return;

            const matchesSearch = !analysisSearch || t.name.toLowerCase().includes(analysisSearch.toLowerCase());
            if (!matchesSearch) return;

            if (!results[cat]) results[cat] = { name: cat, current: 0, previous: 0 };
            
            if (t.date >= thisMonthStartStr && t.date <= thisMonthEndStr) {
                results[cat].current += t.amount;
            } else if (t.date >= lastMonthStartStr && t.date <= lastMonthEndStr) {
                results[cat].previous += t.amount;
            }
        });

        return Object.values(results).sort((a, b) => b.current - a.current);
    };

    const getSubscriptions = () => {
        const groups = {};
        // Only look at last 90 days for subscription detection
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

        const filteredTxns = transactions.filter(t => 
            t.amount > 0 && 
            t.date >= ninetyDaysAgoStr && 
            getTransactionCategory(t) !== 'Ignore' &&
            !ignoredSubscriptions.some(ignored => ignored.trim() === t.name.trim())
        );

        filteredTxns.forEach(t => {
            const key = `${t.name.toLowerCase()}_${t.amount.toFixed(2)}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });

        const detected = Object.values(groups)
            .filter(group => {
                if (group.length < 2) return false;
                const sortedDates = group.map(t => new Date(t.date)).sort((a,b) => a - b);
                let hasValidGap = false;
                for (let i = 1; i < sortedDates.length; i++) {
                    const diffDays = (sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24);
                    if (diffDays >= 15) hasValidGap = true;
                }
                return hasValidGap;
            })
            .map(group => ({
                name: group[0].name,
                amount: group[0].amount,
                count: group.length,
                lastDate: group.sort((a,b) => b.date.localeCompare(a.date))[0].date,
                isManual: false
            }));

        // Add manual subscriptions if not already detected
        manualSubscriptions.forEach(mName => {
            if (!detected.find(d => d.name === mName)) {
                // Find latest transaction for this merchant
                const mTxns = transactions.filter(t => t.name === mName && t.amount > 0).sort((a,b) => b.date.localeCompare(a.date));
                if (mTxns.length > 0) {
                    detected.push({
                        name: mName,
                        amount: mTxns[0].amount,
                        count: mTxns.length,
                        lastDate: mTxns[0].date,
                        isManual: true
                    });
                }
            }
        });

        return detected.sort((a,b) => b.amount - a.amount);
    };

    const subscriptions = getSubscriptions();
    const totalFixedCommitment = subscriptions.reduce((sum, s) => sum + s.amount, 0);

    const analysisData = getMonthlyAnalysis();

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center space-x-4">
                    <h2 className="text-3xl font-bold text-gray-800">Expenditure Dashboard</h2>
                    
                    <div className="flex items-center bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
                        <button 
                            onClick={() => {
                                const [y, m] = selectedMonth.split('-').map(Number);
                                const d = new Date(y, m - 2, 1);
                                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                            }}
                            className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="px-4 flex items-center space-x-2">
                            <Calendar size={16} className="text-blue-500" />
                            <span className="font-bold text-gray-700 min-w-[120px] text-center">
                                {new Date(selectedMonth + '-02').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                        </div>
                        <button 
                            onClick={() => {
                                const [y, m] = selectedMonth.split('-').map(Number);
                                const d = new Date(y, m, 1);
                                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                            }}
                            className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500 transition-colors"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    {!isEditing ? (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                        >
                            Edit Budgets
                        </button>
                    ) : (
                        <>
                            <button 
                                onClick={() => { setEditedBudgets([...budgets]); setIsEditing(false); }}
                                className="text-gray-500 px-4 py-2 hover:text-gray-700"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave}
                                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold transition-all"
                            >
                                Save Changes
                            </button>
                        </>
                    )}
                    <button 
                        onClick={handleAddBudget}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-bold flex items-center space-x-2"
                    >
                        <Plus size={18} />
                        <span>Add Budget</span>
                    </button>
                </div>
            </div>

            {/* Top Level Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-none shadow-blue-200">
                    <div className="flex items-center justify-between mb-2 opacity-80">
                        <span className="text-[10px] font-black uppercase tracking-widest">Fixed Commitment</span>
                        <PlayCircle size={16} />
                    </div>
                    <div className="text-2xl font-black">${totalFixedCommitment.toFixed(0)}</div>
                    <div className="text-[10px] opacity-70 mt-1 font-bold italic">{subscriptions.length} Subscriptions active</div>
                </Card>

                <Card className="bg-white">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Budget Utilization</span>
                        <PieChart size={16} className="text-blue-500" />
                    </div>
                    {(() => {
                        const totalSpent = budgets.reduce((sum, b) => sum + getSpentForCategory(b.category, b.period), 0);
                        const totalLimit = budgets.reduce((sum, b) => sum + getNormalizedMonthlyLimit(b.limit_amount, b.period), 0);
                        const utilization = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
                        return (
                            <>
                                <div className="text-2xl font-black text-gray-900">{utilization.toFixed(0)}%</div>
                                <div className="w-full bg-gray-100 rounded-full h-1 mt-2">
                                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${utilization}%` }}></div>
                                </div>
                            </>
                        );
                    })()}
                </Card>
                
                <Card className="bg-white md:col-span-2 overflow-hidden relative">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Detected Subscriptions</span>
                        <Tag size={16} className="text-blue-500" />
                    </div>
                    <div className="flex space-x-3 overflow-x-auto pt-2 pr-2 pb-2 scrollbar-none no-scrollbar">
                        {subscriptions.slice(0, 5).map((s, idx) => (
                            <div key={idx} className="flex-shrink-0 bg-gray-50 p-2 rounded-lg border border-gray-100 relative group/sub">
                                <div className="text-[10px] font-black text-gray-900 truncate w-24">{s.name}</div>
                                <div className="text-xs font-bold text-blue-600">${s.amount.toFixed(2)}</div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        console.log("Dismissing subscription:", s.name);
                                        handleUpdateSubscriptionPrefs([...ignoredSubscriptions, s.name], manualSubscriptions.filter(m => m !== s.name));
                                    }}
                                    className="absolute -top-2 -right-2 bg-white shadow-md border border-gray-200 rounded-full p-1 text-gray-400 hover:text-red-500 hover:scale-110 transition-all z-10"
                                    title="Dismiss Subscription"
                                >
                                    <X size={12} />
                                </button>
                                {s.isManual && (
                                    <div className="absolute -bottom-1 -right-1 text-amber-500">
                                        <Star size={8} fill="currentColor" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="flex items-center space-x-2 pb-2">
                <BarChart2 className="text-blue-600" size={20} />
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Hard Budgets</h3>
                <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">Strict Spending Limits</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(isEditing ? editedBudgets : budgets).map((budget, index) => {
                    const spent = getSpentForCategory(budget.category, budget.period);
                    const normalizedLimit = getNormalizedMonthlyLimit(budget.limit_amount, budget.period || 'Monthly');
                    const percent = Math.min(100, (spent / normalizedLimit) * 100) || 0;
                    const isOver = spent > normalizedLimit;
                    const prevSpent = getPrevMonthSpent(budget.category);

                    return (
                        <Card key={budget.id || index} className="relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    {isEditing ? (
                                        <div className="flex flex-col space-y-2">
                                            <select 
                                                value={budget.category}
                                                onChange={(e) => {
                                                    const nb = [...editedBudgets];
                                                    nb[index].category = e.target.value;
                                                    setEditedBudgets(nb);
                                                }}
                                                className="font-bold text-lg bg-gray-50 border-none rounded p-1 focus:ring-2 focus:ring-blue-500 w-full"
                                            >
                                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                            
                                            <select 
                                                value={budget.period || 'Monthly'}
                                                onChange={(e) => {
                                                    const nb = [...editedBudgets];
                                                    nb[index].period = e.target.value;
                                                    setEditedBudgets(nb);
                                                }}
                                                className="text-xs font-semibold text-gray-500 bg-gray-50 border-none rounded p-1 focus:ring-2 focus:ring-blue-500 w-full"
                                            >
                                                {periods.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                    ) : (
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-lg flex items-center">
                                                {categories.find(c => c.name === budget.category)?.icon || <PieChart size={16}/>}
                                                <span className="ml-2">{budget.category}</span>
                                            </h3>
                                            <div className="flex items-center space-x-1">
                                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{budget.period || 'Monthly'}</span>
                                                {(budget.period === 'Monthly' || !budget.period) && (
                                                    <span className="text-[10px] text-gray-300 font-medium">
                                                        ({new Date(selectedMonth + '-02').toLocaleDateString(undefined, {month: 'short'})} 1st - {new Date(selectedMonth.split('-')[0], selectedMonth.split('-')[1], 0).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {isEditing && (
                                    <button onClick={() => handleRemoveBudget(index)} className="text-red-400 hover:text-red-600 p-1">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-baseline space-x-1 mb-4">
                                {isEditing ? (
                                    <div className="flex items-center">
                                        <span className="text-gray-400">$</span>
                                        <input 
                                            type="number"
                                            value={budget.limit_amount === 0 ? '' : budget.limit_amount}
                                            placeholder="0"
                                            onChange={(e) => {
                                                const nb = [...editedBudgets];
                                                nb[index].limit_amount = parseFloat(e.target.value) || 0;
                                                setEditedBudgets(nb);
                                            }}
                                            className="w-24 font-bold text-2xl bg-gray-50 border-none rounded p-1 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-2xl font-black text-gray-900">${spent.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                                        <span className="text-gray-400 text-sm">of ${budget.limit_amount.toLocaleString()}</span>
                                    </>
                                )}
                            </div>
    
                            <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-1000 ${isOver ? 'bg-red-500' : percent > 80 ? 'bg-amber-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${percent}%` }}
                                ></div>
                            </div>
                                
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                                <span className={isOver ? 'text-red-500' : 'text-gray-400'}>
                                    {isOver ? 'Over Limit' : `${percent.toFixed(0)}% Used`}
                                </span>
                                <span className="text-gray-400">
                                    ${Math.max(0, normalizedLimit - spent).toLocaleString(undefined, {maximumFractionDigits: 0})} Left
                                </span>
                            </div>
                            {/* Previous month context */}
                            {!isEditing && prevSpent > 0 && (
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-[10px] text-gray-400 font-medium">Last month</span>
                                    <span className={`text-[10px] font-bold ${prevSpent > normalizedLimit ? 'text-red-500' : 'text-gray-500'}`}>
                                        ${prevSpent.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                    </span>
                                </div>
                            )}
                        </Card>
                    );
                })}
                {!isEditing && budgets.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <PieChart className="mx-auto text-gray-300 mb-4" size={48} />
                        <h3 className="text-lg font-bold text-gray-800">No Hard Budgets Set</h3>
                        <p className="text-gray-500 text-sm max-w-xs mx-auto mt-1 mb-4">
                            Add a budget to set strict spending limits for categories like Eating Out or Entertainment.
                        </p>
                        <div className="flex flex-col items-center space-y-4">
                            <button 
                                onClick={handleAddBudget}
                                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all transform hover:-translate-y-0.5 active:scale-95"
                            >
                                + Create Your First Budget
                            </button>
                            {(() => {
                                // Logic to suggest carrying over if spending exists
                                const anySpending = transactions.length > 0;
                                if (anySpending) {
                                    return (
                                        <button 
                                            onClick={() => {
                                                const counts = {};
                                                transactions.forEach(t => {
                                                    const cat = getTransactionCategory(t);
                                                    if (cat !== 'Uncategorized' && cat !== 'Ignore') {
                                                        counts[cat] = (counts[cat] || 0) + t.amount;
                                                    }
                                                });
                                                const suggested = Object.entries(counts)
                                                    .sort((a,b) => b[1] - a[1])
                                                    .slice(0, 5)
                                                    .map(([cat, amt]) => ({
                                                        id: Date.now().toString() + Math.random(),
                                                        category: cat,
                                                        limit_amount: Math.ceil(amt / 100) * 100,
                                                        period: 'Monthly'
                                                    }));
                                                setEditedBudgets(suggested);
                                                setIsEditing(true);
                                            }}
                                            className="text-gray-500 font-bold text-sm hover:text-blue-600 transition-colors flex items-center"
                                        >
                                            <TrendingUp size={14} className="mr-1" />
                                            Build from March suggested budgets
                                        </button>
                                    );
                                }
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Flexible Spending Section — interactive, shows unbudgeted categories */}
            {(() => {
                const flexibleSpending = getFlexibleSpending();
                // We keep showing the Tracker button even if empty
                return (
                    <div className="flex flex-col mb-8">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center">
                                <TrendingUp size={24} className="mr-2 text-emerald-600" />
                                FLEXIBLE SPENDING
                                <span className="ml-3 px-2 py-0.5 bg-gray-50 text-gray-400 text-[10px] rounded-full font-medium border border-gray-100 flex items-center">
                                    No Budget Set — Tracking Only
                                </span>
                            </h3>
                            <button
                                onClick={() => {
                                    setEditedBudgets([...editedBudgets, { id: Date.now().toString(), category: 'Other', limit_amount: 0, period: 'Monthly' }]);
                                    setIsEditing(true);
                                    // Scroll to edit view if needed, but the view becomes editing mode instantly
                                }}
                                className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors flex items-center"
                                title="Explicitly track a category"
                            >
                                <Plus size={16} className="mr-1" />
                                Add Tracker
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed max-w-2xl">
                            These categories have spending this month but don't have a hard budget. Use these to track variable costs without a strict limit. You can set a budget or hide them anytime.
                            <span className="ml-2 text-[8px] text-gray-300 font-mono">v1.5.2-FINAL-UI</span>
                        </p>
                        
                        {flexibleSpending.length === 0 ? (
                            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <p className="text-gray-500 text-sm font-medium">No flexible spending tracked this month.</p>
                                <p className="text-gray-400 text-xs mt-1">Click "Add Tracker" to track categories without a fixed budget limit.</p>
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {flexibleSpending.map(item => {
                                const prevSpent = getPrevMonthSpent(item.name);
                                const diff = prevSpent > 0 ? ((item.amount - prevSpent) / prevSpent) * 100 : 0;
                                const suggestedLimit = Math.ceil(item.amount / 50) * 50 || 50;

                                return (
                                    <Card key={item.name} className={`p-4 border-l-4 hover:shadow-xl transition-all duration-300 group relative ${item.isExplicit ? 'border-l-indigo-500 bg-indigo-50/10' : 'border-l-emerald-500'}`}>
                                        {item.isExplicit && (
                                            <div className="absolute top-0 right-1/2 translate-x-1/2 -mt-2 bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm">
                                                Manually Tracked
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 flex items-center space-x-1.5 z-20">
                                            <button 
                                                onClick={() => {
                                                    setAnalysisSearch(item.name);
                                                    const el = document.getElementById('recent-transactions');
                                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                                }}
                                                className="p-1.5 text-gray-500 hover:text-blue-600 bg-white/95 rounded-full shadow-lg border border-gray-100 transition-all hover:scale-110 flex items-center justify-center"
                                                title="View History"
                                            >
                                                <Activity size={14} />
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (item.isExplicit) {
                                                        if (window.confirm(`Delete explicit tracking for "${item.name}"?`)) {
                                                            const newBudgets = budgets.filter(b => b.category.toLowerCase() !== item.name.toLowerCase() || b.limit_amount > 0);
                                                            onSaveBudgets(newBudgets);
                                                            // If currently editing, also update editedBudgets
                                                            if (isEditing) {
                                                                setEditedBudgets(editedBudgets.filter(b => b.category.toLowerCase() !== item.name.toLowerCase() || b.limit_amount > 0));
                                                            }
                                                        }
                                                    } else {
                                                        if (window.confirm(`Stop tracking "${item.name}" as flexible spending?`)) {
                                                            onUpdateIgnoredFlexible([...ignoredFlexible, item.name]);
                                                        }
                                                    }
                                                }}
                                                className="p-1.5 text-gray-500 hover:text-red-600 bg-white/95 rounded-full shadow-lg border border-gray-100 transition-all hover:scale-110 flex items-center justify-center"
                                                title={item.isExplicit ? "Delete Tracker" : "Hide from dashboard"}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between mb-3 gap-2">
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-gray-900 flex items-center min-w-0">
                                                    <div className="shrink-0">
                                                        {categories.find(c => c.name === item.name)?.icon || <DollarSign size={16} />}
                                                    </div>
                                                    <span className="ml-2 truncate" title={item.name}>{item.name}</span>
                                                </h4>
                                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-0.5">This Month</div>
                                            </div>
                                            <div className="flex space-x-1 shrink-0">
                                                <button
                                                    onClick={() => {
                                                        // Pre-fill a budget with this category and a suggested limit based on current spending
                                                        const suggestedLimit = Math.ceil(item.amount / 50) * 50; // Round up to nearest 50
                                                        setEditedBudgets([...editedBudgets, { id: Date.now().toString(), category: item.name, limit_amount: suggestedLimit, period: 'Monthly' }]);
                                                        setIsEditing(true);
                                                    }}
                                                    className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center space-x-1 shadow-sm font-bold"
                                                    title="Set as Hard Budget"
                                                >
                                                    <Plus size={14} />
                                                    <span className="text-[10px]">Set Budget</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-2xl font-black text-gray-900">
                                            ${item.amount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                                        </div>
                                        {prevSpent > 0 && (
                                            <div className="mt-2 flex items-center space-x-2 text-[10px]">
                                                <span className="text-gray-400">vs last month: ${prevSpent.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                                <span className={`font-bold px-1.5 py-0.5 rounded-full ${
                                                    diff > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                                }`}>
                                                    {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                                                </span>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                        )}
                    </div>
                );
            })()}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <BarChart2 className="mr-2 text-blue-600" size={24} />
                            Spending Analysis
                        </h2>
                        <p className="text-sm text-gray-500">Compare your spending trends month-over-month.</p>
                    </div>
                    
                    <div className="relative max-w-xs w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text"
                            placeholder="Search merchant or keyword..."
                            value={analysisSearch}
                            onChange={(e) => setAnalysisSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="pb-3 px-2">Category</th>
                                <th className="pb-3 px-2 text-right">This Month</th>
                                <th className="pb-3 px-2 text-right">Last Month</th>
                                <th className="pb-3 px-2 text-right">Trend</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {analysisData.length > 0 ? (
                                analysisData.map((data, idx) => {
                                    const diff = data.current - data.previous;
                                    const percentChange = data.previous > 0 ? (diff / data.previous) * 100 : 0;
                                    const isUp = diff > 0;
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="py-3 px-2">
                                                <div className="flex items-center space-x-2">
                                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-600">
                                                        {categories.find(c => c.name === data.name)?.icon || <Tag size={14} />}
                                                    </div>
                                                    <span className="font-bold text-sm text-gray-800">{data.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-right font-black text-sm text-gray-900">${data.current.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                                            <td className="py-3 px-2 text-right font-bold text-sm text-gray-400">${data.previous.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                                            <td className="py-3 px-2 text-right">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                    data.previous === 0 ? 'bg-gray-100 text-gray-500' : 
                                                    isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                                }`}>
                                                    {data.previous === 0 ? 'NEW' : `${isUp ? '+' : ''}${percentChange.toFixed(0)}%`}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="4" className="py-8 text-center text-gray-400 text-sm italic">
                                        {analysisSearch ? "No spending found matching that keyword." : "No spending data found for these periods."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-8">
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
                                            showToast(`Category "${cat}" removed`, "info");
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
                             value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            disabled={isSavingCategory}
                            placeholder={isSavingCategory ? "Saving..." : "Add category (e.g. Nails)"} 
                            className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none ${isSavingCategory ? 'bg-gray-50 opacity-60' : 'bg-white'}`}
                            onKeyPress={async (e) => {
                                if (e.key === 'Enter' && newCategory.trim() && !isSavingCategory) {
                                    setIsSavingCategory(true);
                                    await onSaveCustomCategories([...customCategories, newCategory.trim()]);
                                    setNewCategory('');
                                    setIsSavingCategory(false);
                                }
                            }}
                        />
                        <button 
                            disabled={isSavingCategory || !newCategory.trim()}
                            onClick={async () => {
                                if (newCategory.trim()) {
                                    setIsSavingCategory(true);
                                    try {
                                        await onSaveCustomCategories([...customCategories, newCategory.trim()]);
                                        setNewCategory('');
                                        showToast(`Category "${newCategory}" added!`, "success");
                                    } catch (err) {
                                        console.error(err);
                                        showToast("Failed to add category: " + (err.response?.data?.error || err.message), "error");
                                    } finally {
                                        setIsSavingCategory(false);
                                    }
                                } else {
                                    showToast("Please enter a category name", "error");
                                }
                            }}
                            className={`bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-sm active:scale-95 ${isSavingCategory || !newCategory.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                        >
                            {isSavingCategory ? '...' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>

            <Card title="Recent Transactions" className="mt-8" id="recent-transactions">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="pb-4 px-2">Date</th>
                                <th className="pb-4 px-2">Merchant</th>
                                <th className="pb-4 px-2">Category</th>
                                <th className="pb-4 px-2 text-right">Amount</th>
                                <th className="pb-4 px-2 w-8"></th>
                                <th className="pb-4 px-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {transactions.length > 0 ? (
                                (showAllTransactions ? transactions : transactions.slice(0, 10)).map((t) => {
                                    const category = getTransactionCategory(t);
                                    const isIgnored = category === 'Ignore';
                                    const isPendingThisT = categoryUpdatePending?.transaction.id === t.id;
                                    const displayCategory = isPendingThisT ? categoryUpdatePending.newCategory : category;

                                    return (
                                        <tr key={t.id} className={`hover:bg-gray-50/50 transition-colors group ${isIgnored ? 'bg-gray-100/50' : ''}`}>
                                            <td className={`py-4 px-2 text-sm ${isIgnored ? 'text-gray-400 italic' : 'text-gray-500'}`}>{t.date}</td>
                                            <td className={`py-4 px-2 text-sm font-bold leading-tight ${isIgnored ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-900'}`}>
                                                {t.name}
                                                {isIgnored && <span className="ml-2 text-[8px] bg-white border border-gray-200 text-gray-400 px-1 rounded uppercase tracking-tighter">Ignored</span>}
                                            </td>
                                            <td className="py-4 px-2 relative">
                                                <select 
                                                    value={displayCategory} 
                                                    onChange={(e) => setCategoryUpdatePending({ transaction: t, newCategory: e.target.value })}
                                                    className={`px-2 py-1 border text-[10px] font-bold uppercase cursor-pointer transition-colors shadow-sm focus:ring-2 focus:ring-blue-500 outline-none rounded-md
                                                        ${isIgnored ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
                                                        ${isPendingThisT ? ' ring-2 ring-blue-500 border-blue-500' : ''}`}
                                                >
                                                    <option value="Uncategorized">UNCATEGORIZED</option>
                                                    {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                    <option value="Ignore">IGNORE</option>
                                                </select>
                                                
                                                {isPendingThisT && (
                                                    <div className="absolute z-[100] mt-2 bg-white border-2 border-blue-600 shadow-2xl rounded-2xl p-5 w-72 -translate-x-1/2 left-1/2">
                                                        <div className="flex items-center space-x-2 mb-3">
                                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                                <Tag size={20} />
                                                            </div>
                                                            <h4 className="text-sm font-black text-gray-900">Update Merchant?</h4>
                                                        </div>
                                                        <p className="text-[11px] text-gray-600 mb-5 leading-relaxed">
                                                            Would you like to apply the <b>{categoryUpdatePending.newCategory}</b> category to <b>all future</b> instances of {t.name}, or just this one?
                                                        </p>
                                                        <div className="flex flex-col space-y-2">
                                                            <button 
                                                                disabled={isUpdatingCategory}
                                                                onClick={() => handleCategoryChange(t, categoryUpdatePending.newCategory, true)}
                                                                className={`w-full text-white text-xs font-black py-3 rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center space-x-2
                                                                    ${isUpdatingCategory ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                            >
                                                                {isUpdatingCategory && <RefreshCw size={14} className="animate-spin" />}
                                                                <span>Update All Future</span>
                                                            </button>
                                                            <button 
                                                                disabled={isUpdatingCategory}
                                                                onClick={() => handleCategoryChange(t, categoryUpdatePending.newCategory, false)}
                                                                className={`w-full bg-white border border-gray-200 text-gray-700 text-xs font-black py-3 rounded-xl hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center space-x-2
                                                                    ${isUpdatingCategory ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {isUpdatingCategory && <RefreshCw size={14} className="animate-spin" />}
                                                                <span>Just This One</span>
                                                            </button>
                                                        </div>
                                                        <button 
                                                            onClick={() => setCategoryUpdatePending(null)}
                                                            className="mt-3 w-full text-[10px] text-gray-400 hover:text-red-500 font-bold py-1 transition-colors uppercase tracking-widest"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className={`py-4 px-2 text-sm font-black text-right ${isIgnored ? 'text-gray-300' : (t.amount > 0 ? 'text-gray-900' : 'text-green-600')}`}>
                                                ${Math.abs(t.amount).toFixed(2)}
                                            </td>
                                            <td className="py-4 px-2 text-center">
                                                <button 
                                                    onClick={() => {
                                                        const isManual = manualSubscriptions.includes(t.name);
                                                        if (isManual) {
                                                            handleUpdateSubscriptionPrefs(ignoredSubscriptions, manualSubscriptions.filter(m => m !== t.name));
                                                        } else {
                                                            handleUpdateSubscriptionPrefs(ignoredSubscriptions.filter(i => i !== t.name), [...manualSubscriptions, t.name]);
                                                        }
                                                    }}
                                                    className={`transition-colors ${manualSubscriptions.includes(t.name) ? 'text-amber-500 hover:text-amber-600' : 'text-gray-200 hover:text-gray-400'}`}
                                                    title={manualSubscriptions.includes(t.name) ? "Remove from Subscriptions" : "Mark as Subscription"}
                                                >
                                                    <Star size={16} fill={manualSubscriptions.includes(t.name) ? "currentColor" : "none"} />
                                                </button>
                                            </td>
                                            <td className="py-4 px-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={async () => {
                                                        if (window.confirm("Delete this transaction?")) {
                                                            try {
                                                                const token = await currentUser.getIdToken();
                                                                await axios.delete(`/api/transactions/${t.id}`, {
                                                                    headers: { Authorization: `Bearer ${token}` }
                                                                });
                                                                fetchData();
                                                            } catch (err) { showToast("Failed to delete", "error"); }
                                                        }
                                                    }}
                                                    className="text-gray-300 hover:text-red-500"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="5" className="py-12 text-center text-gray-400 text-sm italic">
                                        No transactions found. Sync your bank in Settings to see recent activity.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {transactions.length > 10 && (
                    <button 
                        onClick={() => setShowAllTransactions(!showAllTransactions)}
                        className="w-full mt-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                    >
                        {showAllTransactions ? (
                            <><ChevronUp size={18} className="mr-2"/> Show Less</>
                        ) : (
                            <><ChevronDown size={18} className="mr-2"/> View All {transactions.length} Transactions</>
                        )}
                    </button>
                )}
            </Card>
        </div>
    );
};

export default Budgeting;

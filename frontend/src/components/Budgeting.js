import React, { useState } from 'react';
import Card from './Card';
import axios from 'axios';
import { Plus, Trash2, PieChart, ShoppingCart, Home, Car, Coffee, PlayCircle, Zap, Wrench, ChevronDown, ChevronUp, Tag, X } from 'lucide-react';

const Budgeting = ({ budgets, transactions, onSaveBudgets, currentUser, customCategories = [], fetchData }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedBudgets, setEditedBudgets] = useState([...budgets]);
    const [showAllTransactions, setShowAllTransactions] = useState(false);

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
        { name: 'Other', icon: <PieChart size={16} /> },
    ];
    
    const categories = [...baseCategories, ...customCategories.map(c => ({ name: c, icon: <Tag size={16} /> }))];
    
    const periods = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually'];

    const handleAddCustomCategory = () => {
        const name = window.prompt("Enter new category name:");
        if (name && !customCategories.includes(name)) {
            alert("Please add custom categories in Settings.");
        }
    };

    const getTransactionCategory = (transaction) => {
        if (transaction.category && transaction.category !== 'Uncategorized') return transaction.category;
        
        const name = (transaction.name || "").toLowerCase();
        
        // Specific exclusions first
        if (name.includes('vanguard') || name.includes('chase card') || name.includes('payment to') || name.includes('zelle') || name.includes('stradavarius') || name.includes('moose llc') || name.includes('transfer') || name.includes('funding')) return 'Ignore';
        
        // Distinction: Safeway Gas vs Groceries
        if (name.includes('safeway fuel') || name.includes('safeway gas')) return 'Transportation';
        if (name.includes('safeway') || name.includes('grocer') || name.includes('kroger') || name.includes('trader joe') || name.includes('costco') || name.includes('target') || name.includes('walmart') || name.includes('whole foods') || name.includes('sprouts')) return 'Groceries';
        
        if (name.includes('dining') || name.includes('mcdonald') || name.includes('starbucks') || name.includes('coffee') || name.includes('cal dining') || name.includes('uber eats') || name.includes('doordash') || name.includes('ramen') || name.includes('pizza') || name.includes('grill') || name.includes('wings') || name.includes('cafe') || name.includes('baguette') || name.includes('eataly') || name.includes('in-n-out') || name.includes('mountain mikes') || name.includes('nick the greek') || name.includes('house of three') || name.includes('kiklo')) return 'Eating Out';
        if (name.includes('tire') || name.includes('oil change') || name.includes('mechanic') || name.includes('auto repair') || name.includes('dmv') || name.includes('registration') || name.includes('jiffy lube')) return 'Vehicle Maintenance';
        if (name.includes('parking') || name.includes('garage') || name.includes('car wash') || name.includes('ace parking') || name.includes('uber') || name.includes('lyft') || name.includes('transit') || name.includes('bus') || name.includes('train') || name.includes('gas') || name.includes('chevron') || name.includes('shell') || name.includes('fuel') || name.includes('mobil')) return 'Transportation';
        if (name.includes('hair') || name.includes('nail') || name.includes('salon') || name.includes('barber') || name.includes('massage') || name.includes('spa') || name.includes('great clips') || name.includes('sephora') || name.includes('cvs')) return 'Personal Care';
        if (name.includes('paramount') || name.includes('netflix') || name.includes('hulu') || name.includes('spotify') || name.includes('disney+') || name.includes('openai') || name.includes('chatgpt') || name.includes('martial arts') || name.includes('gym') || name.includes('yalis') || name.includes('heroes')) return 'Entertainment';
        if (name.includes('rent') || name.includes('mortgage') || name.includes('hoa') || name.includes('property tax')) return 'Housing';
        if (name.includes('pge') || name.includes('water') || name.includes('utility') || name.includes('comcast') || name.includes('at&t')) return 'Utilities';
        
        return 'Other';
    };

    const handleCategoryChange = async (t, newCategory) => {
        const createRule = window.confirm(`Update all future transactions from "${t.name}" to ${newCategory}?`);
        
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
                if (fetchData) {
                    await fetchData();
                } else {
                    window.location.reload();
                }
            }
        } catch (err) {
            console.error(err);
            alert("Failed to update category: " + (err.response?.data?.error || err.message));
        }
    };

    const getSpentForCategory = (category, period) => {
        // Find beginning of the current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        
        // Filter to only transactions that occurred within the current month matching the category
        return transactions
            .filter(t => {
                const tCat = getTransactionCategory(t);
                return tCat.toLowerCase() === category.toLowerCase() && t.date >= startOfMonth;
            })
            .reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800">Budget Tracker</h2>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(isEditing ? editedBudgets : budgets).map((budget, index) => {
                    const spent = getSpentForCategory(budget.category, budget.period);
                    const normalizedLimit = getNormalizedMonthlyLimit(budget.limit_amount, budget.period || 'Monthly');
                    const percent = Math.min(100, (spent / normalizedLimit) * 100) || 0;
                    const isOver = spent > normalizedLimit;

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
                                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{budget.period || 'Monthly'}</span>
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
                            </Card>
                        );
                    })}
                {!isEditing && budgets.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <PieChart className="mx-auto text-gray-300 mb-4" size={48} />
                        <h3 className="text-lg font-bold text-gray-800">No Budgets Set</h3>
                        <p className="text-gray-500 text-sm max-w-xs mx-auto mt-1">
                            Add a budget category to start tracking your monthly spending.
                        </p>
                        <button 
                            onClick={handleAddBudget}
                            className="mt-4 text-blue-600 font-bold text-sm hover:underline"
                        >
                            + Create Your First Budget
                        </button>
                    </div>
                )}
            </div>

            <Card title="Recent Transactions" className="mt-8">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="pb-4 px-2">Date</th>
                                <th className="pb-4 px-2">Merchant</th>
                                <th className="pb-4 px-2">Category</th>
                                <th className="pb-4 px-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {transactions.filter(t => getTransactionCategory(t) !== 'Ignore').length > 0 ? (
                                (showAllTransactions ? 
                                    transactions.filter(t => getTransactionCategory(t) !== 'Ignore') : 
                                    transactions.filter(t => getTransactionCategory(t) !== 'Ignore').slice(0, 10)
                                ).map((t) => (
                                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="py-4 px-2 text-sm text-gray-500">{t.date}</td>
                                        <td className="py-4 px-2 text-sm font-bold text-gray-900">{t.name}</td>
                                        <td className="py-4 px-2">
                                            <select 
                                                value={getTransactionCategory(t)} 
                                                onChange={(e) => handleCategoryChange(t, e.target.value)}
                                                className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase border-none text-center cursor-pointer hover:bg-gray-200 transition-colors apperaance-none"
                                            >
                                                <option value="Uncategorized">UNCATEGORIZED</option>
                                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                <option value="Ignore">IGNORE</option>
                                            </select>
                                        </td>
                                        <td className={`py-4 px-2 text-sm font-black text-right ${t.amount > 0 ? 'text-gray-900' : 'text-green-600'}`}>
                                            ${Math.abs(t.amount).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="py-12 text-center text-gray-400 text-sm italic">
                                        No transactions found. Sync your bank in Settings to see recent activity.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {transactions.filter(t => getTransactionCategory(t) !== 'Ignore').length > 10 && (
                    <button 
                        onClick={() => setShowAllTransactions(!showAllTransactions)}
                        className="w-full mt-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                    >
                        {showAllTransactions ? (
                            <><ChevronUp size={18} className="mr-2"/> Show Less</>
                        ) : (
                            <><ChevronDown size={18} className="mr-2"/> View All {transactions.filter(t => getTransactionCategory(t) !== 'Ignore').length} Transactions</>
                        )}
                    </button>
                )}
            </Card>
        </div>
    );
};

export default Budgeting;

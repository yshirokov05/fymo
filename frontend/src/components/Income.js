import React, { useState } from 'react';
import Card from './Card';
import TaxDocumentUpload from './TaxDocumentUpload';
import { Plus, Trash2, Calendar, DollarSign, Receipt, TrendingUp, Briefcase, Landmark } from 'lucide-react';

const Income = ({ paystubs, onSavePaystubs, otherIncomes, onSaveOtherIncomes, transactions, investmentHistory = null }) => {
    const [activeTab, setActiveTab] = useState('paystubs'); // 'paystubs' or 'other'
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState(null);
    const [amountType, setAmountType] = useState('NET'); // 'GROSS' or 'NET' for paystubs
    const [selectedMatch, setSelectedMatch] = useState(null);
    
    const [newStub, setNewStub] = useState({
        date: new Date().toISOString().split('T')[0],
        employer: '',
        amount: '',
        tax_withheld: ''
    });

    const incomeTransactions = (transactions || []).filter(t => t.amount < 0); // Plaid uses negative for income often, or positive depending on account. 
    // Usually in our app, expense is positive, income is negative. Let's check common categories.
    const potentialMatches = incomeTransactions.filter(t => {
        const tDate = new Date(t.date);
        const sDate = new Date(newStub.date);
        const diffDays = Math.abs(tDate - sDate) / (1000 * 60 * 60 * 24);
        const amtMatch = Math.abs(Math.abs(t.amount) - parseFloat(newStub.amount)) < 10;
        return diffDays < 14 && amtMatch;
    });

    const [newOther, setNewOther] = useState({
        type: 'DIVIDENDS',
        amount: '',
        description: '',
        year: new Date().getFullYear(),
        is_net: false
    });

    const currentYear = new Date().getFullYear();
    const currentYearPaystubs = paystubs.filter(p => new Date(p.date).getFullYear() === currentYear);
    const currentYearOther = (otherIncomes || []).filter(inc => inc.year === currentYear);
    
    // Aggregates
    const totalGrossStubsYTD = currentYearPaystubs.reduce((sum, p) => sum + p.gross_amount, 0);
    const totalTaxesWithheldYTD = currentYearPaystubs.reduce((sum, p) => sum + (p.tax_withheld || 0), 0);
    const totalOtherIncomeYTD = currentYearOther.reduce((sum, inc) => sum + (inc.amount || 0), 0);
    
    const totalIncomeYTD = totalGrossStubsYTD + totalOtherIncomeYTD;

    const handleUploadSuccess = (data) => {
        const totalTaxes = (data.federal_taxes_withheld || 0) + 
                           (data.state_taxes_withheld || 0) + 
                           (data.social_security_withheld || 0) + 
                           (data.medicare_withheld || 0);
        
        const updateObj = {
            employer: data.employer_name || '',
            amount: data.net_income || data.gross_income || '',
            tax_withheld: totalTaxes || '',
            date: data.pay_date || new Date().toISOString().split('T')[0]
        };

        if (data.net_income) setAmountType('NET');
        else if (data.gross_income) setAmountType('GROSS');

        if (editingId) {
            setEditData(prev => ({ ...prev, ...updateObj }));
        } else {
            setNewStub(prev => ({ ...prev, ...updateObj }));
        }
    };

    const handleAddStub = () => {
        const amt = parseFloat(newStub.amount) || 0;
        const taxes = parseFloat(newStub.tax_withheld) || 0;
        
        let gross, net;
        if (amountType === 'NET') {
            net = amt;
            gross = net + taxes;
        } else {
            gross = amt;
            net = gross - taxes;
        }

        const stub = {
            id: Date.now().toString(),
            date: newStub.date,
            employer: newStub.employer,
            gross_amount: gross,
            tax_withheld: taxes,
            net_amount: net,
            is_net_primary: amountType === 'NET',
            linked_transaction_id: selectedMatch?.transaction_id
        };
        onSavePaystubs([stub, ...paystubs]);
        setIsAdding(false);
        setNewStub({ date: new Date().toISOString().split('T')[0], employer: '', amount: '', tax_withheld: '' });
        setSelectedMatch(null);
    };

    const handleAddOther = () => {
        const amt = parseFloat(newOther.amount) || 0;
        const entry = {
            id: Date.now().toString(),
            income_type: newOther.type,
            amount: amt,
            description: newOther.description,
            year: parseInt(newOther.year),
            is_net: newOther.is_net
        };
        onSaveOtherIncomes([entry, ...(otherIncomes || [])]);
        setIsAdding(false);
        setNewOther({ type: 'DIVIDENDS', amount: '', description: '', year: currentYear, is_net: false });
    };

    const handleDeleteStub = (id) => {
        onSavePaystubs(paystubs.filter(p => p.id !== id));
    };

    const handleDeleteOther = (id) => {
        onSaveOtherIncomes(otherIncomes.filter(inc => inc.id !== id));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Income Forecast</h2>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Comprehensive 2026 Tracking</p>
                </div>
                <button 
                    onClick={() => { setIsAdding(!isAdding); setEditingId(null); }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 font-black flex items-center transition-all shadow-xl shadow-blue-200 active:scale-95"
                >
                    {isAdding ? <Plus size={20} className="mr-2 rotate-45" /> : <Plus size={20} className="mr-2" />}
                    {isAdding ? 'Cancel' : 'Add Income Source'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none shadow-2xl">
                    <div className="p-1">
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Total Income (YTD)</p>
                        <p className="text-3xl font-black">${totalIncomeYTD.toLocaleString()}</p>
                    </div>
                </Card>
                <Card title="W2 Earnings" icon={<Briefcase className="text-blue-500"/>}>
                    <p className="text-2xl font-black text-gray-900">${totalGrossStubsYTD.toLocaleString()}</p>
                </Card>
                <Card title="Investments" icon={<TrendingUp className="text-green-500"/>}>
                    <p className="text-2xl font-black text-gray-900">${totalOtherIncomeYTD.toLocaleString()}</p>
                </Card>
                <Card title="Taxes Paid" icon={<Receipt className="text-red-500"/>}>
                    <p className="text-2xl font-black text-gray-900">${totalTaxesWithheldYTD.toLocaleString()}</p>
                </Card>
            </div>

            {isAdding && (
                <Card className="bg-white border-2 border-blue-600 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Landmark size={120} />
                    </div>
                    
                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-2xl mb-8 w-fit">
                        <button 
                            onClick={() => setActiveTab('paystubs')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'paystubs' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Salary / W2
                        </button>
                        <button 
                            onClick={() => setActiveTab('other')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'other' ? 'bg-white shadow-md text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Dividends & Capital Gains
                        </button>
                    </div>

                    {activeTab === 'paystubs' ? (
                        <div className="space-y-6">
                            <div className="mb-4">
                                <TaxDocumentUpload onUploadSuccess={handleUploadSuccess} />
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setAmountType('GROSS')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${amountType === 'GROSS' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}
                                >
                                    Gross Pay
                                </button>
                                <button 
                                    onClick={() => setAmountType('NET')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${amountType === 'NET' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}
                                >
                                    Net (Deposit)
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Pay date</label>
                                    <input type="date" value={newStub.date} onChange={e => setNewStub({...newStub, date: e.target.value})} className="w-full rounded-xl border-gray-200" />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Employer</label>
                                    <input type="text" placeholder="Acme Inc" value={newStub.employer} onChange={e => setNewStub({...newStub, employer: e.target.value})} className="w-full rounded-xl border-gray-200" />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">{amountType} Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input type="number" value={newStub.amount} onChange={e => setNewStub({...newStub, amount: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 font-bold" />
                                    </div>
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Taxes Withheld</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                        <input type="number" value={newStub.tax_withheld} onChange={e => setNewStub({...newStub, tax_withheld: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 font-bold text-red-600" />
                                    </div>
                                </div>
                            </div>
                            
                            {potentialMatches.length > 0 && (
                                <div className="md:col-span-4 bg-gray-50 p-4 rounded-xl border border-dashed border-gray-300">
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-3 flex items-center">
                                        <Landmark size={12} className="mr-1" /> Potential Bank Matches (Plaid Sync)
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {potentialMatches.map(match => (
                                            <button 
                                                key={match.transaction_id}
                                                onClick={() => setSelectedMatch(selectedMatch?.transaction_id === match.transaction_id ? null : match)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center ${selectedMatch?.transaction_id === match.transaction_id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}
                                            >
                                                {selectedMatch?.transaction_id === match.transaction_id && <Landmark size={12} className="mr-2" />}
                                                {match.date} — {match.name} (${Math.abs(match.amount).toLocaleString()})
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-[10px] text-gray-400 italic font-medium">Linking a transaction marks this record as verified against your bank account.</p>
                                </div>
                            )}

                            <button onClick={handleAddStub} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg uppercase shadow-xl hover:bg-blue-700">Save Salary Entry</button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Income Type</label>
                                    <select value={newOther.type} onChange={e => setNewOther({...newOther, type: e.target.value})} className="w-full rounded-xl border-gray-200 font-bold">
                                        <option value="DIVIDENDS">Dividends</option>
                                        <option value="CAPITAL_GAINS">Capital Gains / Sales</option>
                                        <option value="FIXED_TOTAL">Gift / Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                        <input type="number" value={newOther.amount} onChange={e => setNewOther({...newOther, amount: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 font-bold text-green-600" />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Description</label>
                                    <input type="text" placeholder="e.g. Sold Reddit shares (NVDA profit, etc)" value={newOther.description} onChange={e => setNewOther({...newOther, description: e.target.value})} className="w-full rounded-xl border-gray-200" />
                                </div>
                                <div className="md:col-span-2 flex flex-col justify-end pb-3">
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            checked={newOther.is_net} 
                                            onChange={e => setNewOther({...newOther, is_net: e.target.checked})} 
                                            className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-5 h-5 cursor-pointer"
                                        />
                                        <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">
                                            This is Net Take-Home Pay (Exclude from taxes)
                                        </span>
                                    </label>
                                </div>
                            </div>
                            <button onClick={handleAddOther} className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-lg uppercase shadow-xl hover:bg-green-700">Save Investment Income</button>
                        </div>
                    )}
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card title="W2 Paystub History" className="overflow-hidden">
                        <div className="overflow-x-auto -mx-6">
                            <table className="w-full min-w-[600px]">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                        <th className="py-4 px-6">Date</th>
                                        <th className="py-4 px-6">Employer</th>
                                        <th className="py-4 px-6 text-right">Gross</th>
                                        <th className="py-4 px-6 text-right">Taxes</th>
                                        <th className="py-4 px-6 text-right">Net</th>
                                        <th className="py-4 px-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {currentYearPaystubs.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="py-4 px-6 text-sm text-gray-500">{p.date}</td>
                                            <td className="py-4 px-6 text-sm font-bold text-gray-900 flex items-center">
                                                {p.employer || '—'}
                                                {p.linked_transaction_id && <Landmark size={12} className="ml-2 text-blue-500" title="Linked to bank transaction" />}
                                            </td>
                                            <td className="py-4 px-6 text-sm font-bold text-right text-gray-700">${p.gross_amount.toLocaleString()}</td>
                                            <td className="py-4 px-6 text-sm font-bold text-right text-red-500">-${(p.tax_withheld || 0).toLocaleString()}</td>
                                            <td className="py-4 px-6 text-sm font-black text-right text-green-600">${(p.net_amount || (p.gross_amount - p.tax_withheld)).toLocaleString()}</td>
                                            <td className="py-4 px-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleDeleteStub(p.id)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {currentYearPaystubs.length === 0 && (
                                        <tr>
                                            <td colSpan="6">
                                                <div className="flex flex-col items-center py-12 px-6 text-center">
                                                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                                                        <Receipt size={26} className="text-blue-400" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-700 mb-1">No paystubs yet</p>
                                                    <p className="text-xs text-gray-400 mb-5 max-w-xs">Add your first paystub manually or upload a pay stub PDF to auto-extract your salary and tax withholding.</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setIsAdding(true)}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                                                        >
                                                            <Plus size={14} /> Add Manually
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-1">
                    <Card title="Investments & Other" icon={<TrendingUp size={18} />} className="h-full">
                        <div className="space-y-4">
                            {(otherIncomes || []).map((inc) => (
                                <div key={inc.id} className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 group">
                                    <div>
                                        <p className="text-[10px] font-black text-blue-600 uppercase mb-0.5 flex items-center">
                                            {inc.income_type.replace('_', ' ')}
                                            {inc.is_net && <span className="ml-2 bg-green-100 text-green-700 border border-green-200 px-1.5 py-[1px] rounded-[4px] text-[8px] animate-pulse">NET / POST-TAX</span>}
                                        </p>
                                        <p className="text-sm font-bold text-gray-900">{inc.description || 'Investment Gain'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-green-600">+${inc.amount.toLocaleString()}</p>
                                        <button onClick={() => handleDeleteOther(inc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {(() => {
                                // Support both new period-based and old flat format
                                const ytd = investmentHistory?.periods?.ytd || {
                                    invested: investmentHistory?.ytd_invested || 0,
                                    proceeds: investmentHistory?.ytd_proceeds || 0,
                                    dividends: investmentHistory?.ytd_dividends || 0,
                                };
                                return (
                                <>
                                {currentYearOther.length === 0 && !ytd.dividends && !ytd.proceeds && (
                                    <div className="flex flex-col items-center py-8 text-gray-400">
                                        <DollarSign size={32} className="mb-2 opacity-30" />
                                        <p className="text-sm font-medium">No investment gains recorded.</p>
                                    </div>
                                )}
                                {investmentHistory && (ytd.dividends > 0 || ytd.proceeds > 0) && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Auto-Detected (Plaid) — YTD</p>
                                        {ytd.dividends > 0 && (
                                            <div className="flex justify-between items-center py-2 text-sm">
                                                <div>
                                                    <span className="font-bold text-gray-800">Dividends</span>
                                                    <span className="ml-2 text-[10px] text-blue-500 font-bold uppercase bg-blue-50 px-1.5 py-0.5 rounded-full">Plaid</span>
                                                </div>
                                                <span className="font-black text-green-600">+${ytd.dividends.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        {ytd.proceeds > 0 && ytd.invested > 0 && (() => {
                                            const ytdNetGain = ytd.proceeds - ytd.invested;
                                            const isGain = ytdNetGain >= 0;
                                            return (
                                                <div className="flex justify-between items-center py-2 text-sm border-t border-gray-50">
                                                    <div>
                                                        <span className="font-bold text-gray-800">Realized Trades</span>
                                                        <span className="ml-2 text-[10px] text-blue-500 font-bold uppercase bg-blue-50 px-1.5 py-0.5 rounded-full">Plaid</span>
                                                    </div>
                                                    <span className={`font-black ${isGain ? 'text-green-600' : 'text-red-500'}`}>
                                                        {isGain ? '+' : '-'}${Math.abs(ytdNetGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                        <p className="text-[10px] text-gray-400 mt-1">Proceeds ${ytd.proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Invested ${ytd.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                    </div>
                                )}
                                </>
                                );
                            })()}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Income;

import React, { useState } from 'react';
import Card from './Card';
import TaxDocumentUpload from './TaxDocumentUpload';
import { Plus, Trash2, Calendar, Building, DollarSign, Receipt } from 'lucide-react';

const Earnings = ({ paystubs, onSavePaystubs }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState(null);
    const [amountType, setAmountType] = useState('NET'); // 'GROSS' or 'NET'
    const [newStub, setNewStub] = useState({
        date: new Date().toISOString().split('T')[0],
        employer: '',
        amount: '',
        tax_withheld: ''
    });

    const currentYear = new Date().getFullYear();
    const currentYearPaystubs = paystubs.filter(p => new Date(p.date).getFullYear() === currentYear);
    
    // EXCLUDE net-only stubs from YTD Gross calculation per user request
    const totalGrossYTD = currentYearPaystubs.reduce((sum, p) => {
        const isUnknownGross = p.is_net_primary && (p.tax_withheld || 0) === 0;
        return sum + (isUnknownGross ? 0 : p.gross_amount);
    }, 0);
    
    const totalTaxesYTD = currentYearPaystubs.reduce((sum, p) => sum + (p.tax_withheld || 0), 0);
    const totalNetYTD = currentYearPaystubs.reduce((sum, p) => sum + (p.net_amount || (p.gross_amount - p.tax_withheld)), 0);

    const handleUploadSuccess = (data) => {
        const totalTaxes = (data.federal_taxes_withheld || 0) + 
                           (data.state_taxes_withheld || 0) + 
                           (data.social_security_withheld || 0) + 
                           (data.medicare_withheld || 0);
        
        if (editingId) {
            setEditData(prev => ({
                ...prev,
                employer: data.employer_name || prev.employer,
                gross_amount: data.gross_income || prev.gross_amount,
                tax_withheld: totalTaxes || prev.tax_withheld,
                is_net_primary: false // Uploads usually have gross info
            }));
        } else {
            setAmountType('GROSS');
            setNewStub(prev => ({
                ...prev,
                employer: data.employer_name || prev.employer,
                amount: data.gross_income || prev.amount,
                tax_withheld: totalTaxes || prev.tax_withheld,
            }));
        }
    };

    const handleAdd = () => {
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
            is_net_primary: amountType === 'NET'
        };
        const updated = [stub, ...paystubs];
        onSavePaystubs(updated);
        setIsAdding(false);
        setNewStub({ date: new Date().toISOString().split('T')[0], employer: '', amount: '', tax_withheld: '' });
    };

    const handleStartEdit = (stub) => {
        setEditingId(stub.id);
        const isNet = stub.is_net_primary || (stub.gross_amount === stub.net_amount && (stub.tax_withheld || 0) === 0);
        setAmountType(isNet ? 'NET' : 'GROSS');
        setEditData({ 
            ...stub, 
            amount: isNet ? stub.net_amount : stub.gross_amount 
        });
    };

    const handleSaveEdit = () => {
        const amt = parseFloat(editData.amount) || 0;
        const taxes = parseFloat(editData.tax_withheld) || 0;
        
        let gross, net;
        if (amountType === 'NET') {
            net = amt;
            gross = net + taxes;
        } else {
            gross = amt;
            net = gross - taxes;
        }

        const updated = paystubs.map(p => p.id === editingId ? { 
            ...editData, 
            gross_amount: gross, 
            tax_withheld: taxes, 
            net_amount: net,
            is_net_primary: amountType === 'NET'
        } : p);
        onSavePaystubs(updated);
        setEditingId(null);
        setEditData(null);
    };

    const handleDelete = (id) => {
        const updated = paystubs.filter(p => p.id !== id);
        onSavePaystubs(updated);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800 tracking-tight">Earned Income (YTD)</h2>
                <button 
                    onClick={() => { setIsAdding(!isAdding); setEditingId(null); }}
                    className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 font-bold flex items-center transition-all shadow-lg shadow-blue-200 active:scale-95"
                >
                    {isAdding ? <Receipt size={18} className="mr-2" /> : <Plus size={18} className="mr-2" />}
                    {isAdding ? 'Cancel' : 'Log Paystub'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card title="YTD Gross Pay" icon={<DollarSign className="text-green-500"/>}>
                    <p className="text-3xl font-black text-gray-900">${totalGrossYTD.toLocaleString()}</p>
                </Card>
                <Card title="YTD Taxes Paid" icon={<Receipt className="text-red-500"/>}>
                    <p className="text-3xl font-black text-gray-900">${totalTaxesYTD.toLocaleString()}</p>
                </Card>
                <Card title="Avg. Monthly Net" icon={<Calendar className="text-blue-500"/>}>
                    <p className="text-3xl font-black text-gray-900">
                        ${currentYearPaystubs.length > 0 ? (totalNetYTD / (new Date().getMonth() + 1)).toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                    </p>
                </Card>
            </div>

            {isAdding && (
                <Card title="Log New Paystub" className="bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-xl ring-1 ring-blue-500/10">
                    <div className="mb-6">
                        <TaxDocumentUpload onUploadSuccess={handleUploadSuccess} />
                    </div>
                    <div className="space-y-6">
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setAmountType('GROSS')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${amountType === 'GROSS' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                Gross Amount
                            </button>
                            <button 
                                onClick={() => setAmountType('NET')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${amountType === 'NET' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                Net Amount (Deposit)
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Pay Date</label>
                                <input type="date" value={newStub.date} onChange={e => setNewStub({...newStub, date: e.target.value})} className="w-full rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Employer Name</label>
                                <input type="text" placeholder="e.g. Acme Corp" value={newStub.employer} onChange={e => setNewStub({...newStub, employer: e.target.value})} className="w-full rounded-xl border-gray-200" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Amount ({amountType})</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" placeholder="0.00" value={newStub.amount} onChange={e => setNewStub({...newStub, amount: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 font-bold" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Taxes Withheld</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" placeholder="0.00" value={newStub.tax_withheld} onChange={e => setNewStub({...newStub, tax_withheld: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 font-bold text-red-600" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100 font-bold">
                            <div className="text-sm text-gray-500 uppercase">
                                Estimated {amountType === 'NET' ? 'Gross' : 'Net'} Outcome:
                            </div>
                            <div className={`text-xl ${amountType === 'NET' ? 'text-gray-900' : 'text-green-600'}`}>
                                ${((parseFloat(newStub.amount || 0)) + (amountType === 'NET' ? parseFloat(newStub.tax_withheld || 0) : -parseFloat(newStub.tax_withheld || 0))).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </div>
                        </div>

                        <button onClick={handleAdd} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-lg uppercase tracking-wider hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-[0.98]">
                            Save Paystub Record
                        </button>
                    </div>
                </Card>
            )}

            <Card title="Paystub History" className="overflow-hidden">
                <div className="overflow-x-auto -mx-6">
                    <table className="w-full min-w-[800px]">
                        <thead>
                            <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-widest bg-gray-50/50 border-b border-gray-100">
                                <th className="py-4 px-6">Date</th>
                                <th className="py-4 px-6">Employer</th>
                                <th className="py-4 px-6 text-right">Gross Pay</th>
                                <th className="py-4 px-6 text-right">Taxes</th>
                                <th className="py-4 px-6 text-right">Net Deposit</th>
                                <th className="py-4 px-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paystubs.map((p) => (
                                <React.Fragment key={p.id}>
                                    <tr className={`hover:bg-gray-50/50 transition-colors group ${editingId === p.id ? 'bg-blue-50/30' : ''}`}>
                                        <td className="py-5 px-6 text-sm text-gray-500 font-medium">{p.date}</td>
                                        <td className="py-5 px-6 text-sm font-bold text-gray-900">{p.employer || '—'}</td>
                                        <td className="py-5 px-6 text-sm font-bold text-right text-gray-700">
                                            {p.is_net_primary && (p.tax_withheld || 0) === 0 ? (
                                                <span className="text-gray-300 font-normal italic">Unknown</span>
                                            ) : (
                                                `$${p.gross_amount.toLocaleString()}`
                                            )}
                                        </td>
                                        <td className="py-5 px-6 text-sm font-bold text-right text-red-500">-${(p.tax_withheld || 0).toLocaleString()}</td>
                                        <td className="py-5 px-6 text-sm font-black text-right text-green-600">${(p.net_amount || (p.gross_amount - p.tax_withheld)).toLocaleString()}</td>
                                        <td className="py-5 px-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="flex justify-end space-x-3">
                                                <button onClick={() => handleStartEdit(p)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit Paystub">
                                                    <Receipt size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(p.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete record">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {editingId === p.id && (
                                        <tr className="bg-blue-50/30 border-t-0">
                                            <td colSpan="6" className="px-6 pb-6">
                                                <div className="bg-white p-6 rounded-2xl shadow-inner border border-blue-100 space-y-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-sm font-black text-blue-900 uppercase">Edit Record Logic</h4>
                                                        <div className="flex bg-gray-100 p-1 rounded-lg">
                                                            <button onClick={() => setAmountType('GROSS')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${amountType === 'GROSS' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>Gross Primary</button>
                                                            <button onClick={() => setAmountType('NET')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${amountType === 'NET' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>Net Primary</button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                        <input type="date" value={editData.date} onChange={e => setEditData({...editData, date: e.target.value})} className="rounded-xl border-gray-200 text-sm" />
                                                        <input type="text" placeholder="Employer" value={editData.employer} onChange={e => setEditData({...editData, employer: e.target.value})} className="rounded-xl border-gray-200 text-sm" />
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                                            <input type="number" value={editData.amount} onChange={e => setEditData({...editData, amount: e.target.value})} className="w-full pl-7 rounded-xl border-blue-200 text-sm font-bold bg-blue-50/50" />
                                                        </div>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                                            <input type="number" value={editData.tax_withheld} onChange={e => setEditData({...editData, tax_withheld: e.target.value})} className="w-full pl-7 rounded-xl border-gray-200 text-sm font-bold text-red-500" />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end space-x-3 pt-2">
                                                        <button onClick={() => setEditingId(null)} className="px-5 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                                                        <button onClick={handleSaveEdit} className="px-8 py-2 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all">Save Changes</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            {paystubs.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="py-16 text-center">
                                        <div className="flex flex-col items-center text-gray-300">
                                            <Receipt size={48} className="mb-2 opacity-20" />
                                            <p className="italic font-medium">No paystubs found in your 2026 logs.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Earnings;

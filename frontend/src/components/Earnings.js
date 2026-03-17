import React, { useState } from 'react';
import Card from './Card';
import { Plus, Trash2, Calendar, Building, DollarSign, Receipt } from 'lucide-react';

const Earnings = ({ paystubs, onSavePaystubs }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newStub, setNewStub] = useState({
        date: new Date().toISOString().split('T')[0],
        employer: '',
        gross_amount: '',
        net_amount: '',
        tax_withheld: ''
    });

    const currentYear = new Date().getFullYear();
    const currentYearPaystubs = paystubs.filter(p => new Date(p.date).getFullYear() === currentYear);
    const totalGrossYTD = currentYearPaystubs.reduce((sum, p) => sum + p.gross_amount, 0);
    const totalTaxesYTD = currentYearPaystubs.reduce((sum, p) => sum + (p.tax_withheld || 0), 0);
    const totalNetYTD = currentYearPaystubs.reduce((sum, p) => sum + (p.net_amount || (p.gross_amount - p.tax_withheld)), 0);

    const handleAdd = () => {
        const gross = parseFloat(newStub.gross_amount) || 0;
        const taxes = parseFloat(newStub.tax_withheld) || 0;
        const net = parseFloat(newStub.net_amount) || (gross - taxes);

        const stub = {
            ...newStub,
            id: Date.now().toString(),
            gross_amount: gross,
            tax_withheld: taxes,
            net_amount: net
        };
        const updated = [stub, ...paystubs];
        onSavePaystubs(updated);
        setIsAdding(false);
        setNewStub({ date: new Date().toISOString().split('T')[0], employer: '', gross_amount: '', net_amount: '', tax_withheld: '' });
    };

    const handleDelete = (id) => {
        const updated = paystubs.filter(p => p.id !== id);
        onSavePaystubs(updated);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800">Earned Income (YTD)</h2>
                <button 
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center transition-all shadow-md"
                >
                    <Plus size={18} className="mr-2" />
                    {isAdding ? 'Cancel' : 'Log Paystub'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card title="YTD Gross Pay" icon={<DollarSign className="text-green-500"/>}>
                    <p className="text-2xl font-black text-gray-900">${totalGrossYTD.toLocaleString()}</p>
                </Card>
                <Card title="YTD Taxes Paid" icon={<Receipt className="text-red-500"/>}>
                    <p className="text-2xl font-black text-gray-900">${totalTaxesYTD.toLocaleString()}</p>
                </Card>
                <Card title="Avg. Monthly Net" icon={<Calendar className="text-blue-500"/>}>
                    <p className="text-2xl font-black text-gray-900">
                        ${currentYearPaystubs.length > 0 ? (totalNetYTD / (new Date().getMonth() + 1)).toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                    </p>
                </Card>
            </div>

            {isAdding && (
                <Card title="New Paystub Entry" className="bg-blue-50/50 border-blue-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                            <input type="date" value={newStub.date} onChange={e => setNewStub({...newStub, date: e.target.value})} className="w-full rounded-lg border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employer</label>
                            <input type="text" placeholder="e.g. Apple" value={newStub.employer} onChange={e => setNewStub({...newStub, employer: e.target.value})} className="w-full rounded-lg border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gross Amount</label>
                            <input type="number" placeholder="0.00" value={newStub.gross_amount} onChange={e => setNewStub({...newStub, gross_amount: e.target.value})} className="w-full rounded-lg border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Taxes Withheld</label>
                            <input type="number" placeholder="0.00" value={newStub.tax_withheld} onChange={e => setNewStub({...newStub, tax_withheld: e.target.value})} className="w-full rounded-lg border-gray-200 text-sm" />
                        </div>
                        <button onClick={handleAdd} className="bg-blue-600 text-white py-2.5 rounded-lg font-black text-sm uppercase tracking-wider hover:bg-blue-700 shadow-lg">Save</button>
                    </div>
                </Card>
            )}

            <Card title="Paystub History">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <th className="pb-4 px-2">Date</th>
                                <th className="pb-4 px-2">Employer</th>
                                <th className="pb-4 px-2">Gross</th>
                                <th className="pb-4 px-2">Taxes</th>
                                <th className="pb-4 px-2">Net</th>
                                <th className="pb-4 px-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paystubs.map((p) => (
                                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="py-4 px-2 text-sm text-gray-500">{p.date}</td>
                                    <td className="py-4 px-2 text-sm font-bold text-gray-900">{p.employer || '—'}</td>
                                    <td className="py-4 px-2 text-sm font-bold">${p.gross_amount.toLocaleString()}</td>
                                    <td className="py-4 px-2 text-sm text-red-500">-${(p.tax_withheld || 0).toLocaleString()}</td>
                                    <td className="py-4 px-2 text-sm font-black text-green-600">${(p.net_amount || (p.gross_amount - p.tax_withheld)).toLocaleString()}</td>
                                    <td className="py-4 px-2 text-right">
                                        <button onClick={() => handleDelete(p.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {paystubs.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="py-12 text-center text-gray-400 italic">No paystubs logged for 2026.</td>
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

import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Loader2, CheckCircle, AlertCircle, Trash2, CheckCircle2, DollarSign, Image } from 'lucide-react';

const CheckTracker = ({ 
    outstandingChecks, 
    assets, 
    onDataUpdate, 
    saveUserData 
}) => {
    const { currentUser } = useAuth();
    
    // --- Safe to Spend Calculation ---
    const checkingBalance = assets
        .filter(a => a.asset_type === 'CHECKING')
        .reduce((sum, a) => sum + (a.shares * a.cost_basis), 0);
        
    const pendingChecksTotal = outstandingChecks
        .filter(c => c.status === 'PENDING')
        .reduce((sum, c) => sum + c.amount, 0);
        
    const safeToSpend = checkingBalance - pendingChecksTotal;

    // --- Form State ---
    const [amount, setAmount] = useState('');
    const [payee, setPayee] = useState('');
    const [dateWritten, setDateWritten] = useState(new Date().toISOString().split('T')[0]);
    
    // --- OCR State ---
    const fileInputRef = useRef(null);
    const [ocrStatus, setOcrStatus] = useState('idle'); // idle, uploading, success, error
    const [ocrMessage, setOcrMessage] = useState('');

    const handleAddCheck = (e) => {
        e.preventDefault();
        if (!amount || !payee || !dateWritten) return;
        
        const newCheck = {
            id: crypto.randomUUID(),
            amount: parseFloat(amount),
            payee,
            date_written: dateWritten,
            status: 'PENDING',
            plaid_transaction_id: null
        };
        
        const updatedChecks = [newCheck, ...outstandingChecks];
        onDataUpdate({ outstanding_checks: updatedChecks });
        saveUserData({ outstanding_checks: updatedChecks });
        
        // Reset form
        setAmount('');
        setPayee('');
        setDateWritten(new Date().toISOString().split('T')[0]);
        setOcrStatus('idle');
        setOcrMessage('');
    };

    const handleDeleteCheck = (id) => {
        const updatedChecks = outstandingChecks.filter(c => c.id !== id);
        onDataUpdate({ outstanding_checks: updatedChecks });
        saveUserData({ outstanding_checks: updatedChecks });
    };

    const handleMarkCleared = (id) => {
        const updatedChecks = outstandingChecks.map(c => 
            c.id === id ? { ...c, status: 'CLEARED' } : c
        );
        onDataUpdate({ outstanding_checks: updatedChecks });
        saveUserData({ outstanding_checks: updatedChecks });
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
        if (!allowedTypes.includes(file.type)) {
            setOcrStatus('error');
            setOcrMessage('Please upload a PDF, PNG, or JPEG file.');
            return;
        }

        setOcrStatus('uploading');
        setOcrMessage('Analyzing check image...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('doc_type', 'check');

        try {
            let headers = {};
            if (currentUser) {
                const token = await currentUser.getIdToken(true);
                headers = {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                };
            }

            const response = await axios.post('/api/extract-document', formData, headers);
            
            if (response.data.success && response.data.data) {
                const extracted = response.data.data;
                if (extracted.amount) setAmount(extracted.amount.toString());
                if (extracted.payee) setPayee(extracted.payee);
                if (extracted.date_written) setDateWritten(extracted.date_written);
                
                setOcrStatus('success');
                setOcrMessage('Check details extracted!');
            } else {
                throw new Error(response.data.error || 'Failed to extract data');
            }
        } catch (error) {
            setOcrStatus('error');
            setOcrMessage(error.response?.data?.error || error.message || 'An error occurred.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const pendingChecks = outstandingChecks.filter(c => c.status === 'PENDING');
    const clearedChecks = outstandingChecks.filter(c => c.status === 'CLEARED');

    return (
        <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-gray-800">Outstanding Checks</h2>
            
            {/* Safe to Spend Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card text-center p-6 border-l-4 border-indigo-500">
                    <p className="text-sm font-medium text-gray-500 mb-1">Checking Balance</p>
                    <p className="text-3xl font-bold text-indigo-700">${checkingBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
                <div className="card text-center p-6 border-l-4 border-amber-500">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Pending Checks</p>
                    <p className="text-3xl font-bold text-amber-600">-${pendingChecksTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
                <div className="card text-center p-6 border-l-4 border-green-500 bg-green-50">
                    <div className="flex items-center justify-center space-x-2 text-sm font-medium text-gray-500 mb-1">
                        <CheckCircle size={16} className="text-green-600" />
                        <span>Safe to Spend</span>
                    </div>
                    <p className="text-4xl font-extrabold text-green-700">${safeToSpend.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
            </div>

            {/* Input Form */}
            <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-800">Log a Check</h3>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".pdf, .png, .jpg, .jpeg" 
                        className="hidden" 
                    />
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center space-x-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 py-2 px-4 rounded-md transition-colors"
                    >
                        {ocrStatus === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Image size={16} />}
                        <span>{ocrStatus === 'uploading' ? 'Analyzing...' : 'Scan Check Image'}</span>
                    </button>
                </div>
                <p className="mb-4 text-[10px] text-gray-400 italic">
                    Privacy Notice: Check images are processed securely via Gemini API. Original images are not stored on FHQ servers.
                </p>

                {ocrStatus === 'error' && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center text-sm border border-red-200">
                        <AlertCircle size={16} className="mr-2" />
                        {ocrMessage}
                    </div>
                )}
                {ocrStatus === 'success' && (
                    <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center text-sm border border-green-200">
                        <CheckCircle size={16} className="mr-2" />
                        {ocrMessage}
                    </div>
                )}

                <form onSubmit={handleAddCheck} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payee</label>
                        <input type="text" value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Landlord" className="input-field" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <DollarSign size={16} className="text-gray-400" />
                            </div>
                            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="input-field pl-8" placeholder="0.00" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date Written</label>
                        <input type="date" value={dateWritten} onChange={e => setDateWritten(e.target.value)} className="input-field" required />
                    </div>
                    <button type="submit" className="btn-primary py-2.5 flex justify-center items-center w-full">
                        Add Check
                    </button>
                </form>
            </div>

            {/* Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Pending Checks */}
                <div className="card flex flex-col h-full">
                    <div className="px-6 py-4 border-b border-gray-100 bg-amber-50">
                        <h3 className="font-semibold text-amber-800 flex items-center">
                            <ClockIcon className="mr-2" size={18} /> Pending Checks
                        </h3>
                    </div>
                    <div className="p-0 overflow-y-auto max-h-[400px]">
                        {pendingChecks.length === 0 ? (
                            <p className="text-gray-500 text-center py-6 text-sm">No pending checks.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {pendingChecks.map((check) => (
                                        <tr key={check.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900">{check.payee}</span>
                                                    <span className="text-xs text-gray-500">{check.date_written}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <span className="text-sm font-bold text-gray-900">${check.amount.toFixed(2)}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => handleMarkCleared(check.id)} title="Mark Cleared (Manual)" className="text-green-600 hover:text-green-900 p-1 hover:bg-green-100 rounded transition-colors">
                                                    <CheckCircle2 size={18} />
                                                </button>
                                                <button onClick={() => handleDeleteCheck(check.id)} title="Delete Check" className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Cleared Checks */}
                <div className="card flex flex-col h-full">
                    <div className="px-6 py-4 border-b border-gray-100 bg-green-50">
                        <h3 className="font-semibold text-green-800 flex items-center">
                            <CheckCircle size={18} className="mr-2" /> Cleared Checks
                        </h3>
                    </div>
                    <div className="p-0 overflow-y-auto max-h-[400px]">
                        {clearedChecks.length === 0 ? (
                            <p className="text-gray-500 text-center py-6 text-sm">No cleared checks.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {clearedChecks.map((check) => (
                                        <tr key={check.id} className="hover:bg-gray-50 transition-colors opacity-75">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900 line-through">{check.payee}</span>
                                                    <span className="text-xs text-gray-500">
                                                        Written: {check.date_written}
                                                        {check.plaid_transaction_id && " • Auto-Synced"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <span className="text-sm font-medium text-gray-500">${check.amount.toFixed(2)}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDeleteCheck(check.id)} className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

// Extracted ClockIcon since lucide-react might not have it depending on version (or it's called Clock)
const ClockIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
);

export default CheckTracker;

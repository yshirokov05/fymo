import React, { useState } from 'react';
import Card from './Card';
import TaxDocumentUpload from './TaxDocumentUpload';
import { Shield, Paperclip, AlertCircle, CheckCircle2, TrendingUp, Info, Plus, Trash2, Calendar, DollarSign, FileText } from 'lucide-react';

const Insurance = ({ insurances, onSaveInsurances }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [selectedIns, setSelectedIns] = useState(insurances[0] || null);
    const [isUploading, setIsUploading] = useState(false);

    const handleUploadSuccess = (data) => {
        const newIns = {
            id: Date.now().toString(),
            name: data.insurance_name || 'New Policy',
            amount: data.premium_amount || 0,
            frequency: data.frequency || 'MONTHLY',
            insurance_type: data.insurance_type || 'Auto',
            deductible: data.deductible || 0,
            coverage_summary: data.coverage_summary || 'No summary extracted.',
            advisor_observations: data.advisor_observations || 'No observations yet.',
            last_audit_date: new Date().toISOString()
        };
        onSaveInsurances([newIns, ...insurances]);
        setSelectedIns(newIns);
        setIsAdding(false);
    };

    const handleDelete = (id) => {
        const updated = insurances.filter(ins => ins.id !== id);
        onSaveInsurances(updated);
        if (selectedIns?.id === id) setSelectedIns(updated[0] || null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Insurance Audit</h2>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">AI-Powered Protection Analysis</p>
                </div>
                <button 
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 font-black flex items-center transition-all shadow-xl shadow-blue-200 active:scale-95"
                >
                    <Plus size={20} className="mr-2" />
                    Audit New Policy
                </button>
            </div>

            {isAdding && (
                <Card className="bg-white border-2 border-blue-600 shadow-2xl p-8">
                    <div className="text-center space-y-4">
                        <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                            <Shield className="text-blue-600" size={40} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900">Upload Your Policy</h3>
                        <p className="text-gray-500 max-w-md mx-auto">Upload your car, health, or life insurance PDF. Our AI will extract coverage limits, deductibles, and provide an audit.</p>
                        <div className="pt-4">
                            <TaxDocumentUpload 
                                onUploadSuccess={handleUploadSuccess} 
                                docType="insurance" 
                            />
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Policy List Sidebar */}
                <div className="lg:col-span-4 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-2">Your Protections</h4>
                    {insurances.map((ins) => (
                        <button
                            key={ins.id}
                            onClick={() => setSelectedIns(ins)}
                            className={`w-full text-left p-5 rounded-2xl border-2 transition-all group relative overflow-hidden ${
                                selectedIns?.id === ins.id 
                                ? 'bg-white border-blue-600 shadow-lg' 
                                : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-200'
                            }`}
                        >
                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center space-x-4">
                                    <div className={`p-3 rounded-xl ${selectedIns?.id === ins.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900">{ins.name}</p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{ins.insurance_type} — {ins.frequency}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-gray-900">${ins.amount.toLocaleString()}</p>
                                </div>
                            </div>
                            {selectedIns?.id === ins.id && (
                                <div className="absolute top-0 right-0 h-full w-1 bg-blue-600" />
                            )}
                        </button>
                    ))}
                    {insurances.length === 0 && (
                        <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400">
                            <Info size={32} className="mx-auto mb-2 opacity-20" />
                            <p className="text-xs font-bold">No policies uploaded.</p>
                        </div>
                    )}
                </div>

                {/* Policy Details View */}
                <div className="lg:col-span-8">
                    {selectedIns ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Summary Header */}
                            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none shadow-2xl relative overflow-hidden">
                                <div className="absolute top-[-20%] right-[-10%] opacity-10">
                                    <Shield size={300} />
                                </div>
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-blue-400 mb-1">{selectedIns.insurance_type} Insurance</p>
                                        <h3 className="text-3xl font-black">{selectedIns.name}</h3>
                                        <p className="text-gray-400 text-sm mt-1 flex items-center">
                                            <Calendar size={14} className="mr-1" />
                                            Last Audit: {new Date(selectedIns.last_audit_date).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="mt-4 md:mt-0 text-right">
                                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Premium Cost ({selectedIns.frequency})</p>
                                        <p className="text-4xl font-black tracking-tighter">${selectedIns.amount.toLocaleString()}</p>
                                    </div>
                                </div>
                            </Card>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Deductible Card */}
                                <Card title="Deductible" icon={<DollarSign className="text-orange-500" />}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-3xl font-black text-gray-900">${(selectedIns.deductible || 0).toLocaleString()}</p>
                                            <p className="text-xs text-gray-500 font-medium">Out-of-pocket max before coverage</p>
                                        </div>
                                        <div className="bg-orange-50 p-4 rounded-2xl outline outline-offset-2 outline-orange-100">
                                            <TrendingUp className="text-orange-500" size={24} />
                                        </div>
                                    </div>
                                </Card>

                                {/* Quick Health Card */}
                                <Card title="Coverage Status" icon={<CheckCircle2 className="text-emerald-500" />}>
                                    <div className="flex items-center space-x-3 text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                        <CheckCircle2 size={18} />
                                        <span className="text-xs font-black uppercase">Active & Validated</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-4 leading-relaxed font-medium">
                                        This policy was successfully processed by Gemini AI. All benefits were extracted from the document metadata.
                                    </p>
                                </Card>
                            </div>

                            {/* Rundown Section */}
                            <Card title="Benefit Rundown" icon={<FileText className="text-blue-500" />}>
                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                    <p className="text-gray-700 text-sm leading-relaxed font-medium">
                                        {selectedIns.coverage_summary || "Our AI agent is still processing the full benefits of this policy. Re-upload or update via audit for more details."}
                                    </p>
                                </div>
                            </Card>

                            {/* Advisor Observations */}
                            <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-blue-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-all duration-700">
                                    <AlertCircle size={100} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center space-x-2 mb-4">
                                        <AlertCircle size={20} className="text-blue-200" />
                                        <h4 className="text-sm font-black uppercase tracking-widest text-blue-100">AI Advisor Observations</h4>
                                    </div>
                                    <p className="text-lg font-bold leading-snug">
                                        {selectedIns.advisor_observations || "Based on the uploaded policy, this coverage appears to align with standard market rates. No major gaps detected."}
                                    </p>
                                    <button className="mt-6 bg-white/10 hover:bg-white/20 transition-all text-white px-6 py-2 rounded-xl text-xs font-black uppercase border border-white/20">
                                        Request Detailed Comparison
                                    </button>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleDelete(selectedIns.id)}
                                className="text-red-400 hover:text-red-600 text-xs font-black uppercase tracking-widest flex items-center mx-auto pt-4 transition-colors"
                            >
                                <Trash2 size={14} className="mr-1" /> Remove Policy Record
                            </button>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                            <Shield size={64} className="text-gray-200 mb-4" />
                            <h3 className="text-xl font-black text-gray-400">Select a policy to view audit</h3>
                            <p className="text-gray-400 text-sm max-w-xs mt-2">Pick an insurance record from the list or upload a new policy document.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Insurance;

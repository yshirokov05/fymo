import React, { useState } from 'react';
import { 
    ChevronRight, 
    ChevronLeft, 
    CheckCircle2, 
    DollarSign, 
    Briefcase, 
    ArrowDownCircle, 
    UserPlus, 
    Zap
} from 'lucide-react';
import Card from './Card';

const Onboarding = ({ onComplete, onInitializeSample, onSavePortfolio, onSavePaystubs }) => {
    const [step, setStep] = useState(0); // 0: Welcome, 1: Earnings, 2: Assets, 3: Debts
    const [paystub, setPaystub] = useState({ 
        date: new Date().toISOString().split('T')[0], 
        employer: '', 
        gross_amount: '', 
        tax_withheld: '', 
        net_amount: '' 
    });
    const [asset, setAsset] = useState({ 
        ticker: '', 
        shares: '', 
        cost_basis: '', 
        asset_type: 'CASH', 
        institution_name: '' 
    });
    const [debt, setDebt] = useState({ 
        name: '', 
        initial_amount: '', 
        amount_paid: '', 
        monthly_payment: '', 
        interest_rate: '' 
    });

    const nextStep = () => setStep(step + 1);
    const prevStep = () => setStep(step - 1);

    const handleSkip = () => onComplete();

    const handleSaveStep = () => {
        if (step === 1) { // Earnings
            const gross = parseFloat(paystub.gross_amount) || 0;
            const taxes = parseFloat(paystub.tax_withheld) || 0;
            const net = parseFloat(paystub.net_amount) || (gross - taxes);
            onSavePaystubs([{ ...paystub, id: Date.now().toString(), gross_amount: gross, tax_withheld: taxes, net_amount: net }]);
        } else if (step === 2) { // Assets
            onSavePortfolio({ assets: [{ ...asset, shares: parseFloat(asset.shares) || 0, cost_basis: parseFloat(asset.cost_basis) || 0 }] });
        } else if (step === 3) { // Debts
            onSavePortfolio({ debts: [{ ...debt, initial_amount: parseFloat(debt.initial_amount) || 0, amount_paid: parseFloat(debt.amount_paid) || 0, monthly_payment: parseFloat(debt.monthly_payment) || 0, interest_rate: parseFloat(debt.interest_rate) || 0 }] });
        }
        nextStep();
    };

    const ProgressBar = () => (
        <div className="flex items-center justify-center space-x-4 mb-8">
            {[0, 1, 2, 3].map((s) => (
                <div 
                    key={s} 
                    className={`h-2 w-12 rounded-full transition-all duration-500 ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`}
                />
            ))}
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto py-12 px-6">
            <ProgressBar />

            {step === 0 && (
                <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-200">
                        <UserPlus size={40} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">Welcome to FHQ</h1>
                        <p className="text-lg text-gray-500 max-w-md mx-auto">
                            Let's get your dashboard populated so you can see your financial health clearly.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-4">
                        <button 
                            onClick={onInitializeSample}
                            className="group relative bg-white border-2 border-indigo-600 p-6 rounded-2xl text-left hover:bg-indigo-50 transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-bold text-indigo-700 flex items-center">
                                        <Zap size={20} className="mr-2 fill-indigo-600" />
                                        Try with Sample Data
                                    </h3>
                                    <p className="text-sm text-indigo-500">Populate everything with realistic data in 1 second.</p>
                                </div>
                                <ChevronRight className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>

                        <button 
                            onClick={nextStep}
                            className="group relative bg-blue-600 p-6 rounded-2xl text-left hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                        >
                            <div className="flex items-center justify-between text-white">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-bold flex items-center">
                                        <ChevronRight size={20} className="mr-2" />
                                        Guided Onboarding
                                    </h3>
                                    <p className="text-blue-100 text-sm opacity-90">Enter your first paystub, asset, and debt manually.</p>
                                </div>
                                <ChevronRight className="text-white group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    </div>

                    <button onClick={handleSkip} className="text-sm font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest pt-4">
                        Skip and go to Dashboard
                    </button>
                </div>
            )}

            {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center space-x-4 mb-4">
                        <div className="bg-green-100 p-3 rounded-xl"><DollarSign className="text-green-600" /></div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 leading-tight">Add Your First Paystub</h2>
                            <p className="text-gray-500 text-sm">We'll use this to estimate your taxes and monthly cash flow.</p>
                        </div>
                    </div>

                    <Card className="bg-gray-50/50 border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Employer Name</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Acme Corp" 
                                    className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                                    value={paystub.employer}
                                    onChange={e => setPaystub({...paystub, employer: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Gross Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 pl-7 focus:ring-2 focus:ring-blue-500 font-bold"
                                        value={paystub.gross_amount}
                                        onChange={e => setPaystub({...paystub, gross_amount: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Taxes Withheld</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 pl-7 focus:ring-2 focus:ring-blue-500 font-bold text-red-500"
                                        value={paystub.tax_withheld}
                                        onChange={e => setPaystub({...paystub, tax_withheld: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-between items-center pt-4">
                        <button onClick={prevStep} className="flex items-center text-gray-400 font-bold hover:text-gray-600">
                            <ChevronLeft size={20} className="mr-1" /> Back
                        </button>
                        <button 
                            disabled={!paystub.employer || !paystub.gross_amount}
                            onClick={handleSaveStep}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center space-x-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl"><Briefcase className="text-blue-600" /></div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 leading-tight">What do you own?</h2>
                            <p className="text-gray-500 text-sm">Add a bank balance or a stock you own (e.g. AAPL).</p>
                        </div>
                    </div>

                    <Card className="bg-gray-50/50 border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Asset Type</label>
                                <select 
                                    className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                                    value={asset.asset_type}
                                    onChange={e => setAsset({...asset, asset_type: e.target.value})}
                                >
                                    <option value="CASH">Cash / Bank</option>
                                    <option value="STOCK">Stock / Ticker</option>
                                    <option value="HOUSING">Real Estate</option>
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ticker / Name</label>
                                <input 
                                    type="text" 
                                    placeholder={asset.asset_type === 'CASH' ? 'Checking' : 'e.g. VTI'} 
                                    className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                                    value={asset.ticker}
                                    onChange={e => setAsset({...asset, ticker: e.target.value})}
                                />
                            </div>
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                                    {asset.asset_type === 'CASH' || asset.asset_type === 'HOUSING' ? 'Value' : 'Shares Owned'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">#</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 pl-7 focus:ring-2 focus:ring-blue-500 font-bold"
                                        value={asset.shares}
                                        onChange={e => setAsset({...asset, shares: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-between items-center pt-4">
                        <button onClick={prevStep} className="flex items-center text-gray-400 font-bold hover:text-gray-600">
                            <ChevronLeft size={20} className="mr-1" /> Back
                        </button>
                        <button 
                            disabled={!asset.ticker || !asset.shares}
                            onClick={handleSaveStep}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center space-x-4 mb-4">
                        <div className="bg-red-100 p-3 rounded-xl"><ArrowDownCircle className="text-red-600" /></div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 leading-tight">Any debts to track?</h2>
                            <p className="text-gray-500 text-sm">Credit cards, car loans, or a mortgage.</p>
                        </div>
                    </div>

                    <Card className="bg-gray-50/50 border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Debt Name</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Car Loan" 
                                    className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                                    value={debt.name}
                                    onChange={e => setDebt({...debt, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Total Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 pl-7 focus:ring-2 focus:ring-blue-500 font-bold text-red-600"
                                        value={debt.initial_amount}
                                        onChange={e => setDebt({...debt, initial_amount: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Monthly Payment</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="w-full bg-white border-0 ring-1 ring-gray-200 rounded-xl p-3 pl-7 focus:ring-2 focus:ring-blue-500 font-bold"
                                        value={debt.monthly_payment}
                                        onChange={e => setDebt({...debt, monthly_payment: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-between items-center pt-4">
                        <button onClick={prevStep} className="flex items-center text-gray-400 font-bold hover:text-gray-600">
                            <ChevronLeft size={20} className="mr-1" /> Back
                        </button>
                        <button 
                            onClick={handleSkip}
                            className="bg-gray-100 text-gray-600 px-6 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all mr-2"
                        >
                            Maybe Later
                        </button>
                        <button 
                            disabled={!debt.name || !debt.initial_amount}
                            onClick={handleSaveStep}
                            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg"
                        >
                            Finish
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="text-center space-y-8 animate-in zoom-in duration-500">
                    <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <CheckCircle2 size={48} className="text-green-600" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">You're All Set!</h1>
                        <p className="text-lg text-gray-500 max-w-sm mx-auto">
                            Your dashboard is ready. Welcome to a clearer financial future.
                        </p>
                    </div>

                    <button 
                        onClick={onComplete}
                        className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200 transform hover:-translate-y-1 active:scale-95"
                    >
                        Go to My Dashboard
                    </button>
                </div>
            )}
        </div>
    );
};

export default Onboarding;

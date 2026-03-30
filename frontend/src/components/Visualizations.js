import React, { useState } from 'react';
import WealthGap from './WealthGap';
import DebtSpiral from './DebtSpiral';
import CostOfWaiting from './CostOfWaiting';
import { BarChart3, Clock, TrendingDown } from 'lucide-react';

const Visualizations = () => {
    const [activeTab, setActiveTab] = useState('cost'); // 'wealth', 'cost', 'debt'
    
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Financial Visualizations</h2>
            <p className="text-gray-600 mb-6">Interactive models to understand the mechanics of wealth building and debt spirals.</p>
            
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4 mb-8">
                <button 
                    onClick={() => setActiveTab('cost')}
                    className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'cost' ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    <Clock size={18} />
                    Cost of Waiting
                </button>
                <button 
                    onClick={() => setActiveTab('wealth')}
                    className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'wealth' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    <BarChart3 size={18} />
                    Wealth Gap
                </button>
                <button 
                    onClick={() => setActiveTab('debt')}
                    className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'debt' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    <TrendingDown size={18} />
                    Debt Spiral
                </button>
            </div>
            
            <div className="animate-fade-in">
                {activeTab === 'cost' && <CostOfWaiting />}
                {activeTab === 'wealth' && <WealthGap />}
                {activeTab === 'debt' && <DebtSpiral />}
            </div>
        </div>
    );
};

export default Visualizations;

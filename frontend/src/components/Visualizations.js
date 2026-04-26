import React, { useState } from 'react';
import WealthGap from './WealthGap';
import DebtSpiral from './DebtSpiral';
import CostOfWaiting from './CostOfWaiting';
import CompoundSavings from './CompoundSavings';
import { BarChart3, Clock, TrendingDown, PiggyBank } from 'lucide-react';

const TABS = [
    {
        id: 'cost',
        label: 'Cost of Waiting',
        sub: 'Compound interest by start age',
        icon: <Clock size={16} />,
        activeClass: 'bg-emerald-600 text-white shadow-sm shadow-emerald-200',
        inactiveClass: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-gray-400',
    },
    {
        id: 'savings',
        label: 'Compound Savings',
        sub: 'Project your savings growth',
        icon: <PiggyBank size={16} />,
        activeClass: 'bg-indigo-600 text-white shadow-sm shadow-indigo-200',
        inactiveClass: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-gray-400',
    },
    {
        id: 'wealth',
        label: 'Wealth Gap',
        sub: 'Roth IRA vs taxable brokerage',
        icon: <BarChart3 size={16} />,
        activeClass: 'bg-amber-500 text-white shadow-sm shadow-amber-200',
        inactiveClass: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-gray-400',
    },
    {
        id: 'debt',
        label: 'Debt Spiral',
        sub: 'True cost of minimum payments',
        icon: <TrendingDown size={16} />,
        activeClass: 'bg-red-600 text-white shadow-sm shadow-red-200',
        inactiveClass: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-gray-400',
    },
];

const Visualizations = () => {
    const [activeTab, setActiveTab] = useState('cost');

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Financial Visualizations</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Interactive models to understand the mechanics of wealth building and debt.</p>
            </div>

            {/* Tab strip */}
            <div className="flex flex-wrap gap-2">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 font-bold rounded-xl transition-all text-sm ${
                            activeTab === tab.id ? tab.activeClass : tab.inactiveClass
                        }`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Active tab subtitle */}
            {(() => {
                const tab = TABS.find(t => t.id === activeTab);
                return tab ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium -mt-2">{tab.sub}</p>
                ) : null;
            })()}

            <div>
                {activeTab === 'cost'    && <CostOfWaiting />}
                {activeTab === 'savings' && <CompoundSavings />}
                {activeTab === 'wealth'  && <WealthGap />}
                {activeTab === 'debt'    && <DebtSpiral />}
            </div>
        </div>
    );
};

export default Visualizations;

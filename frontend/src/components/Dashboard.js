import React from 'react';
import AssetTable from './AssetTable';
import DebtTable from './DebtTable';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from './Card';
import { DollarSign, Briefcase, PieChart as PieChartIcon, ArrowDownCircle, Zap } from 'lucide-react';

const COLORS = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', 
    '#82ca9d', '#ffc658', '#ef4444', '#8b5cf6', '#ec4899', 
    '#06b6d4', '#f59e0b', '#10b981', '#6366f1'
];

const DEMO_CHART_DATA = [
    { name: 'Technology', value: 45000, percent: '45.0', assets: [{ ticker: 'AAPL', value: 25000 }, { ticker: 'MSFT', value: 20000 }] },
    { name: 'Financials', value: 25000, percent: '25.0', assets: [{ ticker: 'JPM', value: 15000 }, { ticker: 'V', value: 10000 }] },
    { name: 'Healthcare', value: 20000, percent: '20.0', assets: [{ ticker: 'JNJ', value: 20000 }] },
    { name: 'Cash', value: 10000, percent: '10.0', assets: [{ ticker: 'CASH', value: 10000 }] },
];

const DEMO_DEBT_DATA = [
    { name: 'Mortgage', value: 350000 },
    { name: 'Car Loan', value: 25000 },
    { name: 'Credit Card', value: 5000 },
];

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-4 border rounded shadow-lg z-50">
                <p className="font-bold text-gray-800 border-b pb-1 mb-2">{data.name}: {data.percent}%</p>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                    {data.assets.map((asset, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-600 gap-8">
                            <span className="font-medium">{asset.ticker}</span>
                            <span className="font-mono text-gray-500">${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-2 pt-2 border-t font-bold text-sm text-blue-600 flex justify-between">
                    <span>Total</span>
                    <span>${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>
        );
    }
    return null;
};

const Dashboard = ({ netWorth, assets, debts, taxLiability, hideSummary = false, hideAssetSections = false, showDebtAllocation = false, isGuest = false, hasCompletedOnboarding = true }) => {
    // Separate positive assets from margin debt (negative balances)
    const positiveAssets = assets.filter(asset => {
        const marketPrice = asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 0;
        return (asset.shares * marketPrice) > 0;
    });

    const assetValue = positiveAssets.reduce((acc, asset) => {
        const marketPrice = asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 0;
        return acc + (asset.shares * marketPrice);
    }, 0);

    // Group assets by sector/category for Asset Allocation
    const sectorGroups = positiveAssets.reduce((acc, asset) => {
        const marketPrice = asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 0;
        const value = asset.shares * marketPrice;
        
        const isCashTicker = ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX'].includes(asset.ticker);
        const isCashType = ['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS'].includes(asset.asset_type) || isCashTicker;
        
        const category = isCashType ? 'Cash' : (asset.sector || 'Other');
        
        if (!acc[category]) {
            acc[category] = { name: category, value: 0, assets: [] };
        }
        acc[category].value += value;
        acc[category].assets.push({ ticker: asset.ticker, value });
        return acc;
    }, {});

    const isDemoMode = isGuest || (positiveAssets.length === 0 && !hasCompletedOnboarding);

    const chartData = isDemoMode 
        ? DEMO_CHART_DATA 
        : Object.values(sectorGroups)
            .map(group => ({
                ...group,
                percent: assetValue > 0 ? ((group.value / assetValue) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.value - a.value);

    const marginDebts = assets.filter(asset => {
        const marketPrice = asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 0;
        return (asset.shares * marketPrice) < 0;
    }).map(asset => {
        const marketPrice = asset.current_price || 1.0;
        const balance = Math.abs(asset.shares * marketPrice);
        return {
            name: `Margin: ${asset.ticker}`,
            initial_amount: Math.abs(asset.cost_basis),
            amount_paid: 0,
            remaining_balance: balance,
            monthly_payment: 0,
            interest_rate: 0,
            official_name: asset.official_name || `Margin: ${asset.ticker}`,
            isMargin: true
        };
    });

    const allDebts = [...debts, ...marginDebts];
    const debtValue = allDebts.reduce((acc, debt) => acc + debt.remaining_balance, 0);

    const isDebtDemoMode = isGuest || (allDebts.length === 0 && !hasCompletedOnboarding);

    const debtChartData = isDebtDemoMode
        ? DEMO_DEBT_DATA
        : allDebts.map(debt => ({
            name: debt.name,
            value: debt.remaining_balance
        })).filter(item => item.value > 0);

    return (
        <div className="space-y-8">
            {!hideSummary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card title="Net Worth" icon={<DollarSign className="text-green-500" />}>
                        <p className="text-2xl font-bold">${(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">Assets - Debts</p>
                    </Card>

                    <Card title="Total Assets" icon={<Briefcase className="text-blue-500" />}>
                        <p className="text-2xl font-bold text-blue-600">${(assetValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </Card>

                    <Card title="Total Debts" icon={<ArrowDownCircle className="text-red-500" />}>
                        <p className="text-2xl font-bold text-red-600">${(debtValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </Card>

                    <Card title="Est. Annual Tax" icon={<DollarSign className="text-orange-500" />}>
                        <p className="text-2xl font-bold text-orange-600">${(taxLiability?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">Informative only</p>
                    </Card>
                </div>
            )}

            {isDemoMode && !hideSummary && (
                <div className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
                    <div className="flex items-center space-x-4 text-center md:text-left">
                        <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                            <Zap className="text-yellow-300 fill-yellow-300" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">You're in Demo Mode</h3>
                            <p className="text-blue-100 text-sm opacity-90">Experience FHQ with sample data. Ready to setup your real profile?</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('start-onboarding'))}
                        className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-50 transition-all shadow-md active:scale-95"
                    >
                        Start Guided Setup
                    </button>
                </div>
            )}

            {!hideAssetSections && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card title="Asset Breakdown" icon={<Briefcase className="text-blue-500" />}>
                        <div className="overflow-x-auto">
                            <AssetTable assets={positiveAssets} />
                        </div>
                    </Card>

                    <Card title="Industry Allocation" icon={<PieChartIcon className="text-yellow-500" />}>
                        <div className="h-[400px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="45%"
                                                labelLine={true}
                                                label={({ name, percent }) => `${name} (${percent}%)`}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={isDemoMode ? 0.3 : 1} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={isDemoMode ? () => null : <CustomTooltip />} />
                                            <Legend verticalAlign="bottom" height={36}/>
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                    {isDemoMode && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-gray-300 font-black text-4xl uppercase tracking-widest opacity-20 transform -rotate-12">Example Data</span>
                                        </div>
                                    )}
                                </div>
                    </Card>
                </div>
            )}

            {((showDebtAllocation || allDebts.length > 0) && (!hideAssetSections || showDebtAllocation)) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card title="Debt Details" icon={<ArrowDownCircle className="text-red-500" />}>
                        <div className="overflow-x-auto">
                            <DebtTable debts={allDebts} />
                        </div>
                    </Card>

                    <Card title="Debt Allocation" icon={<PieChartIcon className="text-red-500" />}>
                        <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={debtChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={80}
                                                fill="#ef4444"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                            >
                                                {debtChartData.map((entry, index) => (
                                                    <Cell key={`cell-debt-${index}`} fill={COLORS[(index + 5) % COLORS.length]} opacity={isDebtDemoMode ? 0.3 : 1} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                            <Legend />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                    {isDebtDemoMode && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-gray-300 font-black text-3xl uppercase tracking-widest opacity-20 transform -rotate-12">Example Data</span>
                                        </div>
                                    )}
                                </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

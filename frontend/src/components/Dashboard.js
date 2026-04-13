import React from 'react';
import AssetTable from './AssetTable';
import DebtTable from './DebtTable';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from './Card';
import { DollarSign, Briefcase, PieChart as PieChartIcon, ArrowDownCircle, Zap, TrendingDown, TrendingUp, Shield, BarChart2 } from 'lucide-react';

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

const Dashboard = ({ netWorth, assets, debts, taxLiability, transactions = [], incomes = [], hideSummary = false, hideAssetSections = false, showDebtAllocation = false, isGuest = false, hasCompletedOnboarding = true }) => {
    // --- Financial Health Metrics ---
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const ytdSpend = transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= yearStart)
        .reduce((sum, t) => sum + t.amount, 0);

    const monthlySpend = transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= monthStart)
        .reduce((sum, t) => sum + t.amount, 0);

    const monthlyIncome = incomes.reduce((sum, i) => sum + (i.monthly_income || 0), 0);

    const monthlyCashFlow = monthlyIncome - monthlySpend;
    const savingsRate = monthlyIncome > 0 ? (monthlyCashFlow / monthlyIncome) * 100 : null;

    // Top 3 YTD categories
    const ytdByCategory = {};
    transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= yearStart)
        .forEach(t => {
            const cat = t.category || 'Other';
            ytdByCategory[cat] = (ytdByCategory[cat] || 0) + t.amount;
        });
    const topYtdCategories = Object.entries(ytdByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    // Liquid assets (cash-like) for emergency fund
    const liquidTypes = new Set(['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS']);
    const liquidTickers = new Set(['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX']);
    const liquidValue = assets
        .filter(a => liquidTypes.has(a.asset_type) || liquidTickers.has(a.ticker))
        .reduce((sum, a) => {
            const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
            return sum + (a.shares * price);
        }, 0);
    const emergencyMonths = monthlySpend > 0 ? liquidValue / monthlySpend : null;

    // Portfolio return (non-cash invested assets)
    const allInvestedAssets = assets.filter(a => !liquidTypes.has(a.asset_type) && !liquidTickers.has(a.ticker));
    const totalCurrentValue = allInvestedAssets.reduce((sum, a) => {
        const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
        return sum + Math.max(0, a.shares * price);
    }, 0);
    const totalCostBasis = allInvestedAssets.reduce((sum, a) => sum + (a.cost_basis || 0), 0);
    // basisRatio: how much of the portfolio's current value is "explained" by recorded cost basis.
    // Plaid often sets cost_basis to a tiny non-zero value when real data is unavailable,
    // producing absurd return %s. Require ≥20% coverage before showing the %.
    const basisRatio = totalCurrentValue > 0 ? totalCostBasis / totalCurrentValue : 0;
    const portfolioReturn = totalCostBasis > 0 && basisRatio >= 0.2
        ? ((totalCurrentValue - totalCostBasis) / totalCostBasis) * 100
        : null;

    const hasTransactionData = transactions.length > 0;
    const hasIncomeData = incomes.length > 0;
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
            name: asset.ticker === 'CUR:USD' ? 'Pending Settlement' : `Margin Loan: ${asset.ticker}`,
            initial_amount: Math.abs(asset.cost_basis),
            amount_paid: 0,
            remaining_balance: balance,
            monthly_payment: 0,
            interest_rate: 0,
            official_name: asset.official_name || (asset.ticker === 'CUR:USD' ? 'Pending Settlement' : `Margin Loan: ${asset.ticker}`),
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

                    <Card title="Est. Annual Tax" icon={<DollarSign className={taxLiability?.has_net_only_income ? "text-gray-400" : "text-orange-500"} />}>
                        {taxLiability?.has_net_only_income ? (
                            <>
                                <p className="text-2xl font-bold text-gray-400">N/A</p>
                                <p className="text-xs text-amber-600 mt-1">⚠ Income recorded as net (post-tax) — cannot estimate gross tax liability</p>
                                <p className="text-xs text-gray-400 mt-1">Enter gross income in the Income tab to enable this estimate</p>
                            </>
                        ) : incomes.some(i => i.is_net) ? (
                            <>
                                <p className="text-2xl font-bold text-orange-600">${(taxLiability?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-xs text-yellow-600 mt-1">⚠ Some income is net — estimate may be inaccurate</p>
                            </>
                        ) : (
                            <>
                                <p className="text-2xl font-bold text-orange-600">${(taxLiability?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-xs text-gray-500 mt-1">Informative only</p>
                            </>
                        )}
                    </Card>
                </div>
            )}

            {!hideSummary && (hasTransactionData || hasIncomeData || portfolioReturn !== null) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* YTD Spending */}
                    <Card title="YTD Spending" icon={<TrendingDown className="text-red-400" />}>
                        {hasTransactionData ? (
                            <>
                                <p className="text-2xl font-bold text-red-500">
                                    ${ytdSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">Jan 1 – today</p>
                                {topYtdCategories.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        {topYtdCategories.map(([cat, amt]) => (
                                            <div key={cat} className="flex justify-between text-xs text-gray-600">
                                                <span className="truncate mr-2">{cat}</span>
                                                <span className="font-mono font-semibold shrink-0">${amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-gray-400 mt-1">Link a bank account to track spending</p>
                        )}
                    </Card>

                    {/* Monthly Cash Flow */}
                    <Card title="Monthly Cash Flow" icon={monthlyCashFlow >= 0 ? <TrendingUp className="text-green-500" /> : <TrendingDown className="text-red-400" />}>
                        {(hasTransactionData || hasIncomeData) ? (
                            <>
                                <p className={`text-2xl font-bold ${monthlyCashFlow >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {monthlyCashFlow >= 0 ? '+' : ''}${monthlyCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    <div className="flex justify-between"><span>Income</span><span className="font-semibold text-green-600">${monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                    <div className="flex justify-between"><span>Spending</span><span className="font-semibold text-red-500">${monthlySpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                    {savingsRate !== null && (
                                        <div className="flex justify-between pt-1 border-t border-gray-100"><span>Savings Rate</span><span className={`font-bold ${savingsRate >= 0 ? 'text-green-600' : 'text-red-500'}`}>{savingsRate.toFixed(1)}%</span></div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-400 mt-1">Add income & link bank to see cash flow</p>
                        )}
                    </Card>

                    {/* Emergency Fund */}
                    <Card title="Emergency Fund" icon={<Shield className={emergencyMonths >= 6 ? "text-green-500" : emergencyMonths >= 3 ? "text-yellow-500" : "text-red-400"} />}>
                        {emergencyMonths !== null ? (
                            <>
                                <p className={`text-2xl font-bold ${emergencyMonths >= 6 ? 'text-green-600' : emergencyMonths >= 3 ? 'text-yellow-500' : 'text-red-500'}`}>
                                    {emergencyMonths.toFixed(1)} <span className="text-base font-normal text-gray-500">mo</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    ${liquidValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} liquid ÷ ${monthlySpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                                </p>
                                <p className={`text-xs font-semibold mt-2 ${emergencyMonths >= 6 ? 'text-green-600' : emergencyMonths >= 3 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {emergencyMonths >= 6 ? '✓ Healthy (6+ months)' : emergencyMonths >= 3 ? '⚠ Low (target: 6 mo)' : '✗ Critical (target: 3+ mo)'}
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-400 mt-1">Link a bank account to calculate runway</p>
                        )}
                    </Card>

                    {/* Portfolio Return */}
                    <Card title="Portfolio Return" icon={<BarChart2 className={portfolioReturn !== null ? (portfolioReturn >= 0 ? "text-green-500" : "text-red-400") : "text-gray-400"} />}>
                        {totalCostBasis > 0 ? (
                            <>
                                {portfolioReturn !== null ? (
                                    <p className={`text-2xl font-bold ${portfolioReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
                                    </p>
                                ) : (
                                    <p className="text-2xl font-bold text-gray-400">N/A</p>
                                )}
                                <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    <div className="flex justify-between"><span>Cost Basis</span><span className="font-semibold">${totalCostBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                    <div className="flex justify-between"><span>Current Value</span><span className="font-semibold">${totalCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                    <div className="flex justify-between pt-1 border-t border-gray-100"><span>Gain / Loss</span><span className={`font-bold ${totalCurrentValue >= totalCostBasis ? 'text-green-600' : 'text-red-500'}`}>{totalCurrentValue >= totalCostBasis ? '+' : ''}${(totalCurrentValue - totalCostBasis).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                </div>
                                {portfolioReturn === null && (
                                    <p className="text-xs text-yellow-600 mt-2">⚠ Cost basis data covers {(basisRatio * 100).toFixed(0)}% of portfolio value — return % hidden until Plaid syncs full cost basis</p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-gray-400 mt-1">Add investments with cost basis to track returns</p>
                        )}
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

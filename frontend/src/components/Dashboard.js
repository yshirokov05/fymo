import React, { useState } from 'react';
import AssetTable from './AssetTable';
import DebtTable from './DebtTable';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import Card from './Card';
import ShowMath from './ShowMath';
import { useTheme } from '../context/ThemeContext';
import { DollarSign, Briefcase, PieChart as PieChartIcon, ArrowDownCircle, Zap, TrendingDown, TrendingUp, Shield, BarChart2, Info, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

// Curated palette: Tailwind 500-level hues balanced for both light and dark modes.
// Saturated enough to be distinct, but not the harsh "rainbow recharts defaults" look.
const COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#eab308', // yellow
    '#a855f7', // purple
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
        const color = payload[0].payload.fill || payload[0].color;
        return (
            <div className="bg-white dark:bg-slate-800 px-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 min-w-[200px]">
                <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-100 dark:border-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                    <span className="font-bold text-gray-800 dark:text-slate-100 text-sm">{data.name}</span>
                    <span className="ml-auto text-xs text-gray-500 dark:text-slate-400 font-mono">{data.percent}%</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {data.assets.map((asset, idx) => (
                        <div key={idx} className="flex justify-between text-xs gap-8">
                            <span className="font-medium text-gray-600 dark:text-slate-400">{asset.ticker}</span>
                            <span className="font-mono text-gray-500 dark:text-slate-500">${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 text-sm flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">Total</span>
                    <span className="font-bold text-gray-800 dark:text-slate-100 font-mono">${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>
        );
    }
    return null;
};

const DebtTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const color = payload[0].color;
        return (
            <div className="bg-white dark:bg-slate-800 px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50">
                <div className="flex items-center gap-2 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                    <span className="font-bold text-gray-800 dark:text-slate-100 text-sm">{data.name}</span>
                </div>
                <span className="font-mono text-sm text-red-600 dark:text-red-400 font-bold">
                    ${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        );
    }
    return null;
};

// Compact $ for the donut center label — 12345 → $12.3K, 1234567 → $1.2M
const fmtCompact = (n) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
};

const Dashboard = ({ netWorth, assets, debts, taxLiability, transactions = [], incomes = [], paystubs = [], hideSummary = false, hideAssetSections = false, showDebtAllocation = false, isGuest = false, hasCompletedOnboarding = true, onUpdateCostBasis, investmentHistory = null, portfolioHistory = [], capabilities = null, onOpenEdit = null, onOpenLink = null }) => {
    // Capabilities fallback: if not passed (legacy usage), infer from data we have.
    // Lets us use Dashboard in embedded contexts (Investments tab, Debts tab) without piping.
    const caps = capabilities || {
        hasInvestments: assets.some(a => (a.asset_type === 'STOCK' || a.asset_type === 'CRYPTO') && (a.shares || 0) > 0) || ((investmentHistory?.current_value || 0) > 0),
        hasDebts: debts.length > 0,
        hasIncome: incomes.length > 0 || paystubs.length > 0,
        hasTransactions: transactions.length > 0,
        hasLinkedBank: false,  // can't infer from props
    };
    // --- Financial Health Metrics ---
    // Auto-select the best available period on mount so we never show N/A by default.
    // Preferred order: ytd → 1m → 1w → 1y → 2y → 5y → all
    // If period_returns has no data at all, fall through to 'all' which uses cost-basis.
    const [prPeriod, setPrPeriod] = useState(() => {
        const pr = investmentHistory?.period_returns;
        if (pr) {
            for (const p of ['ytd', '1m', '1w', '1y', '2y', '5y']) {
                if (pr[p] != null) return p;
            }
        }
        return 'all';
    });
    const [prAccount, setPrAccount] = useState('all');
    const [showMath, setShowMath] = useState(false);
    const { isDark } = useTheme();
    // Cell stroke color: matches the card surface so segments separate cleanly without harsh outlines.
    const sliceStroke = isDark ? '#1e293b' : '#ffffff';
    // Total values to display in the donut center (computed from chart data, not cards, so
    // demo-mode totals match the chart even when assetValue is 0).

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const ytdSpend = transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= yearStart && t.category !== 'Ignore')
        .reduce((sum, t) => sum + t.amount, 0);

    const monthlySpend = transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= monthStart && t.category !== 'Ignore')
        .reduce((sum, t) => sum + t.amount, 0);

    // Income from manually-entered sources
    const manualMonthlyIncome = incomes.reduce((sum, i) => sum + (i.monthly_income || 0), 0);
    // Income from Plaid-detected paystubs this month (gross_amount = net deposit for is_net_primary)
    // IMPORTANT: Parse date string as local date parts (not via new Date("YYYY-MM-DD") which
    // is treated as UTC midnight and shifts to the previous day in US timezones, causing the
    // first-of-month paycheck to be excluded from the current month's income calculation.
    const paystubMonthlyIncome = paystubs
        .filter(p => { const [yr, mo] = p.date.split('-').map(Number); return yr === now.getFullYear() && mo - 1 === now.getMonth(); })
        .reduce((sum, p) => sum + (p.is_net_primary ? (p.gross_amount || 0) : (p.net_amount || Math.max(0, (p.gross_amount || 0) - (p.tax_withheld || 0)))), 0);
    const monthlyIncome = manualMonthlyIncome + paystubMonthlyIncome;

    const monthlyCashFlow = monthlyIncome - monthlySpend;
    const savingsRate = monthlyIncome > 0 ? (monthlyCashFlow / monthlyIncome) * 100 : null;

    // Top 3 YTD categories (exclude Ignore — same filter as ytdSpend)
    const ytdByCategory = {};
    transactions
        .filter(t => t.amount > 0 && new Date(t.date) >= yearStart && t.category !== 'Ignore')
        .forEach(t => {
            const cat = t.category || 'Other';
            ytdByCategory[cat] = (ytdByCategory[cat] || 0) + t.amount;
        });
    const topYtdCategories = Object.entries(ytdByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    // Liquid assets (cash-like) for emergency fund
    const liquidTypes = new Set(['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS']);
    // Keep in sync with price_service.py is_cash_ticker list
    const liquidTickers = new Set(['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX']);
    const liquidValue = assets
        .filter(a => liquidTypes.has(a.asset_type) || liquidTickers.has(a.ticker))
        .reduce((sum, a) => {
            const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
            return sum + (a.shares * price);
        }, 0);
    const emergencyMonths = monthlySpend > 0 ? liquidValue / monthlySpend : null;

    // Portfolio return (market-traded investments only).
    // Explicitly whitelisted: STOCK. Everything else — HOUSING, BOND, SALARY, cash-family —
    // is excluded. Real estate is not a portfolio return (compounds differently, often
    // stored with hack shape like shares=450000, cost_basis=1.0 to represent dollar amounts).
    // Cash/savings are liquid, not invested. BOND positions held as individual securities
    // typically arrive with ticker + asset_type=STOCK from Plaid anyway.
    const investedAssetTypes = new Set(['STOCK']);
    const allInvestedAssets = assets.filter(a =>
        investedAssetTypes.has(a.asset_type)
        && !liquidTickers.has(a.ticker)
    );
    const totalCurrentValue = allInvestedAssets.reduce((sum, a) => {
        const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
        return sum + Math.max(0, a.shares * price);
    }, 0);
    // cost_basis is stored as cost-per-share; multiply by shares to get total position cost
    const totalCostBasis = allInvestedAssets.reduce((sum, a) => sum + ((a.cost_basis || 0) * (a.shares || 0)), 0);
    // basisRatio: how much of the portfolio's current value is "explained" by recorded cost basis.
    // Plaid often sets cost_basis to a tiny non-zero value when real data is unavailable,
    // producing absurd return %s. Require ≥50% coverage before showing the % (conservative
    // threshold — partial cost basis data produces wildly misleading numbers).
    const basisRatio = totalCurrentValue > 0 ? totalCostBasis / totalCurrentValue : 0;
    const portfolioReturn = totalCostBasis > 0 && basisRatio >= 0.5
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

    // ── Show Math row builders ──────────────────────────────────────────
    // Group positiveAssets by rough asset class for the Total Assets breakdown
    const assetClassRows = (() => {
        const buckets = { Cash: 0, Investments: 0, 'Real Estate': 0, Retirement: 0, Other: 0 };
        positiveAssets.forEach(a => {
            const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
            const value = a.shares * price;
            const isCashTicker = liquidTickers.has(a.ticker);
            const isCashType = liquidTypes.has(a.asset_type) || isCashTicker;
            if (isCashType) buckets.Cash += value;
            else if (a.asset_type === 'HOUSING') buckets['Real Estate'] += value;
            else if (a.asset_type === 'STOCK' || a.asset_type === 'BOND') buckets.Investments += value;
            else if (a.asset_type === 'SALARY') buckets.Other += value; // edge case
            else buckets.Other += value;
        });
        // Add retirement accounts if they exist (passed separately in some paths)
        return Object.entries(buckets)
            .filter(([_, v]) => v > 0)
            .map(([label, value]) => ({
                label,
                value: `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                indent: true,
            }));
    })();

    const debtBreakdownRows = allDebts
        .filter(d => d.remaining_balance > 0)
        .slice(0, 8) // cap visual length
        .map(d => ({
            label: d.name || d.official_name || 'Debt',
            value: `$${(d.remaining_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            indent: true,
        }));
    if (allDebts.filter(d => d.remaining_balance > 0).length > 8) {
        debtBreakdownRows.push({
            label: `+ ${allDebts.filter(d => d.remaining_balance > 0).length - 8} more`,
            value: '',
            indent: true,
            muted: true,
        });
    }

    const taxBreakdownRows = (() => {
        if (!taxLiability || taxLiability.has_net_only_income) return [];
        const rows = [];
        const fmtMoney = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        // Realized capital gains (Phase C) — show contributions before tax breakdown
        const stG = taxLiability.realized_st_gains || 0;
        const ltG = taxLiability.realized_lt_gains || 0;
        const sellCount = taxLiability.realized_sell_count || 0;
        if (sellCount > 0 && (stG !== 0 || ltG !== 0)) {
            if (stG !== 0) {
                rows.push({
                    label: 'ST capital gains (taxed as ordinary income)',
                    value: fmtMoney(stG),
                    indent: true,
                    muted: true,
                });
            }
            if (ltG !== 0) {
                rows.push({
                    label: 'LT capital gains (preferential rates)',
                    value: fmtMoney(ltG),
                    indent: true,
                    muted: true,
                });
            }
        }

        if (taxLiability.federal) {
            // Show LTCG breakdown when present
            const ltcgTax = taxLiability.fed_ltcg_tax || 0;
            if (ltcgTax > 0) {
                rows.push({
                    label: 'Federal (ordinary income)',
                    value: fmtMoney(taxLiability.fed_ordinary_tax || 0),
                    indent: true,
                });
                rows.push({
                    label: 'Federal (long-term cap gains)',
                    value: fmtMoney(ltcgTax),
                    indent: true,
                });
            } else {
                rows.push({ label: 'Federal', value: fmtMoney(taxLiability.federal), indent: true });
            }
        }
        if (taxLiability.state) rows.push({ label: 'State', value: fmtMoney(taxLiability.state), indent: true });
        if (taxLiability.fica) rows.push({ label: 'FICA (SS + Medicare)', value: fmtMoney(taxLiability.fica), indent: true });
        if (taxLiability.withheld) rows.push({ label: 'Already withheld', value: `-${fmtMoney(taxLiability.withheld)}`, indent: true, muted: true });
        rows.push({ divider: true, label: 'Total liability', value: fmtMoney(taxLiability.total || 0) });
        return rows;
    })();

    const isDebtDemoMode = isGuest || (allDebts.length === 0 && !hasCompletedOnboarding);

    const debtChartData = isDebtDemoMode
        ? DEMO_DEBT_DATA
        : allDebts.map(debt => ({
            name: debt.name,
            value: debt.remaining_balance
        })).filter(item => item.value > 0);

    return (
        <div className="space-y-6">
            {!hideSummary && (
                <div className={`grid grid-cols-1 md:grid-cols-2 ${caps.hasIncome ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
                    <Card title="Net Worth" icon={<DollarSign className="text-green-500" />}>
                        <p className="text-2xl font-bold">${(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            Assets - Debts
                            <Info size={11} className="text-gray-400 cursor-help" title="Sum of all asset market values minus all outstanding debt balances." />
                        </p>
                        {portfolioHistory.length >= 3 && (() => {
                            const first = portfolioHistory[0].value;
                            const last = portfolioHistory[portfolioHistory.length - 1].value;
                            const isUp = last >= first;
                            const pct = first > 0 ? ((last - first) / first * 100).toFixed(1) : null;
                            return (
                                <div className="mt-3 -mx-1">
                                    <div className="flex items-center justify-between mb-1 px-1">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Portfolio trend</span>
                                        {pct !== null && (
                                            <span className={`text-[10px] font-black ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                                                {isUp ? '▲' : '▼'} {Math.abs(pct)}% ({portfolioHistory.length}d)
                                            </span>
                                        )}
                                    </div>
                                    <ResponsiveContainer width="100%" height={52}>
                                        <AreaChart data={portfolioHistory} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                                            <defs>
                                                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <YAxis domain={['auto', 'auto']} hide />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/50 shadow-lg rounded-lg px-2 py-1 text-xs">
                                                            <div className="font-bold text-gray-800 dark:text-slate-200">${d.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                                            <div className="text-gray-400 dark:text-slate-500">{d.date}</div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={isUp ? '#22c55e' : '#ef4444'}
                                                strokeWidth={1.5}
                                                fill="url(#sparkGrad)"
                                                dot={false}
                                                activeDot={{ r: 3 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            );
                        })()}
                        <ShowMath
                            rows={[
                                { label: 'Total Assets', value: `$${(assetValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                                { label: 'Total Debts', value: `-$${(debtValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                                { divider: true, label: 'Net Worth', value: `$${(netWorth || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                            ]}
                            formula="Total Assets − Total Debts"
                        />
                    </Card>

                    <Card title="Total Assets" icon={<Briefcase className="text-blue-500" />}>
                        <p className="text-2xl font-bold text-blue-600">${(assetValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            All linked &amp; manual assets
                            <Info size={11} className="text-gray-400 cursor-help" title="Includes cash, checking, savings, investment holdings, real estate, and any manually entered assets." />
                        </p>
                        {assetClassRows.length > 0 && (
                            <ShowMath
                                rows={[
                                    ...assetClassRows,
                                    { divider: true, label: 'Total Assets', value: `$${(assetValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                                ]}
                                formula="Sum of each asset's (shares × market price)"
                            />
                        )}
                    </Card>

                    <Card title="Total Debts" icon={<ArrowDownCircle className={debtValue === 0 && !isDebtDemoMode ? "text-green-500" : "text-red-500"} />}>
                        {debtValue === 0 && !isDebtDemoMode ? (
                            <>
                                <p className="text-2xl font-bold text-green-600">$0.00</p>
                                <p className="text-xs text-green-600 font-semibold mt-1">🎉 Debt free!</p>
                            </>
                        ) : (
                            <p className="text-2xl font-bold text-red-600">${(debtValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            All linked &amp; manual debts
                            <Info size={11} className="text-gray-400 cursor-help" title="Includes mortgages, car loans, credit cards, margin balances, and any manually entered debts." />
                        </p>
                        {debtBreakdownRows.length > 0 && (
                            <ShowMath
                                rows={[
                                    ...debtBreakdownRows,
                                    { divider: true, label: 'Total Debts', value: `$${(debtValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                                ]}
                                formula="Sum of each debt's remaining balance"
                            />
                        )}
                    </Card>

                    {caps.hasIncome && (
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
                        {taxBreakdownRows.length > 0 && (
                            <ShowMath
                                rows={taxBreakdownRows}
                                formula={
                                    (taxLiability.fed_ltcg_tax || 0) > 0
                                        ? "Federal ordinary brackets + LTCG (0/15/20%) + State + FICA. ST gains added to ordinary income; LT gains stacked on top at preferential rates."
                                        : "Federal (progressive brackets) + State (50-state engine) + FICA (7.65%). Capital gains will appear here once realized."
                                }
                            />
                        )}
                    </Card>
                    )}
                </div>
            )}

            {!hideSummary && (hasTransactionData || hasIncomeData) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                            <div key={cat} className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
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
                                        <div className="flex justify-between pt-1 border-t border-gray-100">
                                            <span className="flex items-center">
                                                Savings Rate
                                                <Info size={12} className="ml-1 text-gray-400 cursor-help" title="Formula: (Income - Valid Spending) / Income. Excludes transfers, debt principal, and 'Ignore' transactions." />
                                            </span>
                                            <span className={`font-bold ${savingsRate >= 0 ? 'text-green-600' : 'text-red-500'}`}>{savingsRate.toFixed(1)}%</span>
                                        </div>
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

                </div>
            )}

            {/* Portfolio Return — only shown when the user actually has investments. */}
            {!hideSummary && caps.hasInvestments && (investmentHistory || portfolioReturn !== null) && (() => {
                const ih = investmentHistory;
                const hasHistory = ih && ih.transaction_count > 0;
                const PERIOD_ORDER = ['1w', '1m', 'ytd', '1y', '2y', '5y', 'all'];
                const PERIOD_LABELS = { '1w': '1W', '1m': '1M', 'ytd': 'YTD', '1y': '1Y', '2y': '2Y', '5y': '5Y', 'all': 'All' };
                const BENCH_NAMES = { spy: 'S&P 500', qqq: 'Nasdaq', dia: 'Dow Jones' };

                // Build account list for dropdown
                const accounts = ih?.by_account
                    ? Object.entries(ih.by_account)
                        .map(([id, data]) => ({ id, ...data }))
                        .filter(a => a.current_value > 0 || (a.periods?.all?.invested || 0) > 0)
                    : [];

                // Helper: get period data from either new or old format
                const getPd = (src, p) => {
                    if (!src) return { invested: 0, proceeds: 0, dividends: 0 };
                    if (src.periods) return src.periods[p] || { invested: 0, proceeds: 0, dividends: 0 };
                    // Old format fallback
                    if (p === 'all') return { invested: src.total_invested || 0, proceeds: src.total_proceeds || 0, dividends: src.total_dividends || 0 };
                    return { invested: 0, proceeds: 0, dividends: 0 };
                };

                const isAll = prAccount === 'all';
                const source = isAll ? ih : ih?.by_account?.[prAccount];
                const curVal = isAll ? (ih?.current_value || totalCurrentValue) : (source?.current_value || 0);

                // All-time data for activity display
                const allD = getPd(source, 'all');
                // Selected period data for activity display
                const selD = getPd(source, prPeriod);

                // ── Consolidated return computation ────────────────────────────────
                // Single source of truth. Three-tier fallback with explicit sanity guards.
                //
                // TIER 1 (preferred): period_returns[pk] — reconstructed from 5yr transaction
                //   history + yfinance historical prices on the backend. True holding-period return.
                // TIER 2: all-time from institution cost basis (ih.total_cost_basis or source.total_cost_basis).
                // TIER 3 (legacy fallback): asset-level cost basis from manual entries.
                //
                // Guards applied to all tiers:
                //   - basisCoverage ≥ 10%  → protects against tiny/missing basis (divide-by-near-zero)
                //   - basisRatio ≤ 5×     → protects against absurd basis (data corruption blow-up)
                //
                // When guards fail we return null + a reason string for the "Show math" panel.

                const SANE_MAX_BASIS_RATIO = 5;   // cost basis more than 5× current value = corrupt
                const MIN_BASIS_COVERAGE = 0.1;   // require ≥10% coverage to trust the %

                const holdingsCostBasis = isAll
                    ? (ih?.total_cost_basis || 0)
                    : (source?.total_cost_basis || 0);

                // Which basis source are we using? Track it for "Show math" transparency.
                let basisSource, costBasisForReturn;
                if (holdingsCostBasis > 0) {
                    basisSource = 'institution';  // from Plaid Holdings
                    costBasisForReturn = holdingsCostBasis;
                } else if (totalCostBasis > 0) {
                    basisSource = 'manual';       // from asset-level manual entries
                    costBasisForReturn = totalCostBasis;
                } else {
                    basisSource = 'none';
                    costBasisForReturn = 0;
                }

                // Sanity guards
                const basisCoverage = curVal > 0 ? costBasisForReturn / curVal : 0;
                const basisRatio = curVal > 0 ? costBasisForReturn / curVal : Infinity;
                const backendRejected = ih?.basis_sanity_flag === 'ratio_exceeded';

                let allTimeRetPct = null;
                let allTimeRetDollar = null;
                let rejectionReason = null;

                if (backendRejected) {
                    rejectionReason = 'Plaid returned a cost basis that exceeds current market value by more than 5× — likely a delisted or exotic holding with bad institution data. Backend rejected it to protect your stats.';
                } else if (costBasisForReturn <= 0) {
                    rejectionReason = 'No cost basis available. Plaid didn\'t provide one and no manual entries were found. Link a brokerage or enter cost per share in the Investments tab.';
                } else if (basisCoverage < MIN_BASIS_COVERAGE) {
                    rejectionReason = `Cost basis (${(basisCoverage * 100).toFixed(1)}% of current value) is too sparse to trust. Need ≥10% coverage for a meaningful %.`;
                } else if (basisRatio > SANE_MAX_BASIS_RATIO) {
                    rejectionReason = `Cost basis ($${costBasisForReturn.toLocaleString(undefined, {maximumFractionDigits: 0})}) is ${basisRatio.toFixed(1)}× current value. Likely a stale or corrupt data entry — open the Investments tab and verify cost-per-share is correct on each holding.`;
                } else {
                    allTimeRetPct = ((curVal - costBasisForReturn) / costBasisForReturn) * 100;
                    allTimeRetDollar = curVal - costBasisForReturn;
                }

                // Period-specific return takes priority when available.
                // If a non-"all" period is selected and we couldn't compute it, show N/A —
                // do NOT silently swap to all-time return. Showing all-time when YTD is
                // selected is misleading; users expect the headline to match the selector.
                const isAllPeriod = prPeriod === 'all';
                const periodRetPct = (!isAllPeriod && ih?.period_returns?.[prPeriod] != null)
                    ? ih.period_returns[prPeriod]
                    : null;
                const hasPeriodReturn = periodRetPct !== null;

                // Coverage metadata: % of portfolio value that was priceable for this period
                const periodCoverage = ih?.period_returns_coverage?.[prPeriod] ?? null;
                const isPartialCoverage = periodCoverage !== null && periodCoverage < 50;

                // ── Portfolio-history fallback ──────────────────────────────────────
                // When the backend's per-ticker yfinance fetch can't price enough holdings
                // for the selected window (most common for 1W when yfinance is throttled),
                // fall back to our own daily portfolio_snapshots. Less mathematically pure
                // than a TWR (mixes cash flows with returns) but vastly better than N/A,
                // and accurate when there are no buys/sells in the period.
                const fallbackPeriodReturn = (() => {
                    if (isAllPeriod || hasPeriodReturn || !portfolioHistory || portfolioHistory.length < 2) {
                        return null;
                    }
                    const latest = portfolioHistory[portfolioHistory.length - 1];
                    if (!latest || !(latest.value > 0)) return null;
                    // Resolve target date for this period
                    const today = new Date();
                    let target;
                    if (prPeriod === 'ytd') {
                        target = new Date(today.getFullYear(), 0, 1);
                    } else {
                        const days = { '1w': 7, '1m': 30, '1y': 365, '2y': 730, '5y': 1825 }[prPeriod];
                        if (!days) return null;
                        target = new Date(today);
                        target.setDate(target.getDate() - days);
                    }
                    const targetStr = target.toISOString().slice(0, 10);
                    // Earliest snapshot on or after target date — only valid if it predates
                    // latest by a meaningful gap, otherwise we'd be dividing today by itself.
                    const start = portfolioHistory.find(h => h.date >= targetStr && h.date < latest.date);
                    if (!start || !(start.value > 0)) return null;
                    return ((latest.value - start.value) / start.value) * 100;
                })();
                const usingFallback = !hasPeriodReturn && fallbackPeriodReturn !== null && !isAllPeriod;
                const periodMissing = !isAllPeriod && !hasPeriodReturn && !usingFallback;

                // Final display values
                let retPct, retDollar, returnLabel, returnTooltip;
                if (periodMissing) {
                    // Honest N/A: backend couldn't compute and we have no snapshot history.
                    retPct = null;
                    retDollar = null;
                    returnLabel = `${PERIOD_LABELS[prPeriod]} unavailable`;
                    returnTooltip = `Couldn't compute ${PERIOD_LABELS[prPeriod]} return — yfinance couldn't price enough holdings and we don't yet have ${PERIOD_LABELS[prPeriod]} of portfolio snapshots. Sync again or try a longer period.`;
                } else if (hasPeriodReturn) {
                    retPct = periodRetPct;
                    retDollar = null;
                    returnLabel = isPartialCoverage
                        ? `${PERIOD_LABELS[prPeriod]} Return (${periodCoverage}% priced)`
                        : `${PERIOD_LABELS[prPeriod]} Return`;
                    returnTooltip = isPartialCoverage
                        ? `Weighted return for ${PERIOD_LABELS[prPeriod]} based on ${periodCoverage}% of your portfolio by value — some holdings (e.g. thinly-traded or OTC stocks) couldn't be priced for this window and are excluded from the weighted average.`
                        : `Weighted holding-period return for ${PERIOD_LABELS[prPeriod]}: each ticker's return is weighted by its current market value. Tickers without pricing data are excluded.`;
                } else if (usingFallback) {
                    retPct = fallbackPeriodReturn;
                    retDollar = null;
                    returnLabel = `${PERIOD_LABELS[prPeriod]} Return (approx)`;
                    returnTooltip = `Backend per-ticker pricing was unavailable for this window, so this is computed from your portfolio-value snapshots: (current value − value at start of period) / start value. Does not account for buys/sells inside the window, so it's an approximation when you've been actively trading.`;
                } else {
                    // All period selected — show cost-basis-based all-time return
                    retPct = allTimeRetPct;
                    retDollar = allTimeRetDollar;
                    returnLabel = retPct !== null ? 'All-Time Unrealized' : 'Return Unavailable';
                    returnTooltip = retPct !== null
                        ? `Unrealized gain on your CURRENT holdings vs ${basisSource === 'institution' ? 'institution-reported' : 'manually entered'} cost basis. This is "what your positions are worth right now vs what you paid for them" — it does NOT include realized gains from past sales or dividends. For a true period-over-period return, click 1W/1M/YTD/etc.`
                        : (rejectionReason || 'Return could not be computed.');
                }
                const pos = (retPct || 0) >= 0;

                // Benchmarks for selected period
                const bench = ih?.benchmarks?.[prPeriod] || {};

                const fmt = (n) => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

                return (
                <Card title="Portfolio Return" icon={<BarChart2 className={retPct !== null ? (pos ? "text-green-500" : "text-red-400") : "text-gray-400"} />}>
                    {hasHistory || totalCostBasis > 0 ? (
                    <>
                        {/* Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
                            <select
                                value={prAccount}
                                onChange={e => setPrAccount(e.target.value)}
                                className="text-xs font-semibold bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-gray-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[220px]"
                            >
                                <option value="all">All Accounts</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <div className="flex flex-wrap gap-1">
                                {PERIOD_ORDER.map(pk => (
                                    <button key={pk} onClick={() => setPrPeriod(pk)}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${prPeriod === pk ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-gray-200'}`}
                                    >{PERIOD_LABELS[pk]}</button>
                                ))}
                            </div>
                        </div>

                        {/* Two-column body */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left — headline return */}
                            <div>
                                {retPct !== null ? (
                                    <p className={`text-3xl font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>
                                        {pos ? '+' : ''}{retPct.toFixed(2)}%
                                    </p>
                                ) : (
                                    <p className="text-3xl font-bold text-gray-500">N/A</p>
                                )}
                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                    {returnLabel}
                                    <Info size={11} className="text-gray-500 cursor-help" title={returnTooltip} />
                                </p>
                                {periodMissing && (
                                    <button
                                        onClick={() => setPrPeriod('all')}
                                        className="text-xs text-blue-400 hover:text-blue-300 mt-1 underline underline-offset-2"
                                    >
                                        See all-time return →
                                    </button>
                                )}

                                {retDollar !== null && (
                                    <p className={`text-base font-bold mt-2 ${retDollar >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {retDollar >= 0 ? '+' : '-'}{fmt(retDollar)}
                                        <span className="text-xs font-normal text-gray-500 ml-1">unrealized</span>
                                    </p>
                                )}

                                {/* Period-specific net activity: proceeds + dividends - invested.
                                    This IS period-aware and changes with the period pill. */}
                                {(() => {
                                    const netPL = (selD.proceeds || 0) + (selD.dividends || 0) - (selD.invested || 0);
                                    if (selD.invested === 0 && selD.proceeds === 0 && selD.dividends === 0) return null;
                                    const plPos = netPL >= 0;
                                    return (
                                        <p className={`text-sm font-semibold mt-1 ${plPos ? 'text-green-400' : 'text-red-400'}`}>
                                            {plPos ? '+' : '-'}{fmt(Math.abs(netPL))}
                                            <span className="text-xs font-normal text-gray-500 ml-1">
                                                net cash deployed ({PERIOD_LABELS[prPeriod]})
                                                <span className="ml-1 cursor-help" title="Cash in minus cash out for this period. A negative number means more was invested than sold — not a loss.">ⓘ</span>
                                            </span>
                                        </p>
                                    );
                                })()}

                                {/* Realized capital gains for the selected period — FIFO-matched */}
                                {(() => {
                                    const rg = ih?.realized_gains;
                                    if (!rg) return null;
                                    const rgPeriod = rg.periods?.[prPeriod];
                                    if (!rgPeriod || rgPeriod.count === 0) return null;
                                    const rgTotal = rgPeriod.total || 0;
                                    const rgPos = rgTotal >= 0;
                                    const rgTooltip = `Realized gain/loss from ${rgPeriod.count} sell${rgPeriod.count !== 1 ? 's' : ''} during ${PERIOD_LABELS[prPeriod]}, computed via FIFO lot matching against your buy history. Short-term: held <1yr (taxed as ordinary income). Long-term: held ≥1yr (lower capital gains rates).${rg.unmatched_count > 0 ? ` Note: ${rg.unmatched_count} sell(s) couldn't be matched to a buy lot — likely transferred-in shares or pre-5y purchases.` : ''}`;
                                    return (
                                        <div className="mt-3 pt-3 border-t border-white/5">
                                            <p className={`text-base font-bold ${rgPos ? 'text-green-500' : 'text-red-500'}`}>
                                                {rgPos ? '+' : '-'}{fmt(Math.abs(rgTotal))}
                                                <span className="text-xs font-normal text-gray-500 ml-1.5 inline-flex items-center gap-1">
                                                    realized ({PERIOD_LABELS[prPeriod]})
                                                    <Info size={10} className="text-gray-500 cursor-help" title={rgTooltip} />
                                                </span>
                                            </p>
                                            {(rgPeriod.st !== 0 || rgPeriod.lt !== 0) && (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {rgPeriod.lt !== 0 && (
                                                        <span className="mr-3">
                                                            <span className="text-gray-400">LT:</span>{' '}
                                                            <span className={rgPeriod.lt >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                {rgPeriod.lt >= 0 ? '+' : '-'}{fmt(Math.abs(rgPeriod.lt))}
                                                            </span>
                                                        </span>
                                                    )}
                                                    {rgPeriod.st !== 0 && (
                                                        <span>
                                                            <span className="text-gray-400">ST:</span>{' '}
                                                            <span className={rgPeriod.st >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                {rgPeriod.st >= 0 ? '+' : '-'}{fmt(Math.abs(rgPeriod.st))}
                                                            </span>
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Total profit summary — only shown for "All" period.
                                    Combines unrealized + realized + dividends for an honest
                                    "how much money has this portfolio made me" number.
                                    The unrealized % alone is misleading for active traders. */}
                                {isAllPeriod && allTimeRetDollar !== null && (() => {
                                    const realizedAll = ih?.realized_gains?.total_realized || 0;
                                    const dividendsAll = ih?.periods?.all?.dividends || 0;
                                    const totalProfit = (allTimeRetDollar || 0) + realizedAll + dividendsAll;
                                    const tpPos = totalProfit >= 0;
                                    const components = [
                                        { label: 'Unrealized', val: allTimeRetDollar || 0 },
                                        { label: 'Realized', val: realizedAll },
                                        { label: 'Dividends', val: dividendsAll },
                                    ].filter(c => Math.abs(c.val) > 0.5);
                                    const totalTooltip = `Total profit = unrealized gain on current holdings + realized gains from past sales + dividends received. Based on your full ${ih?.realized_gains?.earliest_txn_date ? `transaction history since ${ih.realized_gains.earliest_txn_date}` : '5-year transaction window'}.`;
                                    return (
                                        <div className="mt-4 pt-3 border-t border-white/10">
                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
                                                Total Profit (All-Time)
                                                <Info size={10} className="text-gray-500 cursor-help" title={totalTooltip} />
                                            </p>
                                            <p className={`text-xl font-bold ${tpPos ? 'text-green-500' : 'text-red-500'}`}>
                                                {tpPos ? '+' : '-'}{fmt(Math.abs(totalProfit))}
                                            </p>
                                            {components.length > 1 && (
                                                <p className="text-[11px] text-gray-500 mt-0.5">
                                                    {components.map((c, idx) => (
                                                        <span key={c.label}>
                                                            {idx > 0 && <span className="mx-1.5 text-gray-600 dark:text-slate-400">·</span>}
                                                            <span className="text-gray-400">{c.label}: </span>
                                                            <span className={c.val >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                {c.val >= 0 ? '+' : '-'}{fmt(Math.abs(c.val))}
                                                            </span>
                                                        </span>
                                                    ))}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div className="mt-3">
                                    <p className="text-xl font-semibold text-gray-300">{fmt(curVal)}</p>
                                    <p className="text-xs text-gray-500">Current Value</p>
                                </div>

                                {ih?.earliest_date && (
                                    <p className="text-[10px] text-gray-500 mt-4">Since {ih.earliest_date} · {ih.transaction_count} transactions</p>
                                )}

                                {/* Rejection warning — shown when guards tripped (corrupt data path) */}
                                {rejectionReason && !hasPeriodReturn && (
                                    <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                        <p className="text-[11px] text-amber-200 leading-relaxed">{rejectionReason}</p>
                                    </div>
                                )}

                                {/* Show Math — data-forward transparency. Exposes every input behind the % so
                                    users can see exactly how the number was derived. This is the Fymo differentiator
                                    over Monarch/Copilot, which hide the calculation. */}
                                <button
                                    onClick={() => setShowMath(s => !s)}
                                    className="mt-3 flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
                                >
                                    {showMath ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    <span className="font-semibold uppercase tracking-wider">{showMath ? 'Hide' : 'Show'} Math</span>
                                </button>
                                {showMath && (
                                    <div className="mt-2 p-3 bg-black/20 border border-white/5 rounded-lg space-y-1.5 text-[11px] font-mono">
                                        <div className="flex justify-between text-gray-400">
                                            <span>Current Value</span>
                                            <span className="text-gray-200">${curVal.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-400">
                                            <span>Cost Basis ({basisSource})</span>
                                            <span className={costBasisForReturn > 0 ? 'text-gray-200' : 'text-gray-500'}>
                                                {costBasisForReturn > 0 ? `$${costBasisForReturn.toLocaleString(undefined, {maximumFractionDigits: 2})}` : 'unavailable'}
                                            </span>
                                        </div>
                                        {costBasisForReturn > 0 && (() => {
                                            // Coverage is "healthy" when within the sane ratio range.
                                            // A portfolio down on the year NATURALLY has basis > value (coverage > 100%)
                                            // — that's just unrealized losses, not corrupt data. Only flag ⚠ when
                                            // basis is either extremely sparse (< MIN_BASIS_COVERAGE) or absurdly high
                                            // (> SANE_MAX_BASIS_RATIO, caught on the Ratio row).
                                            const coverageHealthy = basisCoverage >= MIN_BASIS_COVERAGE && basisCoverage <= SANE_MAX_BASIS_RATIO;
                                            const ratioHealthy = basisRatio <= SANE_MAX_BASIS_RATIO;
                                            return (
                                                <>
                                                    <div className="flex justify-between text-gray-400">
                                                        <span>Basis Coverage</span>
                                                        <span className={coverageHealthy ? 'text-gray-200' : 'text-amber-400'}>
                                                            {basisCoverage > 100
                                                                ? `${basisCoverage.toExponential(1)}`
                                                                : `${(basisCoverage * 100).toFixed(1)}%`
                                                            } {coverageHealthy ? '✓' : '⚠'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-gray-400">
                                                        <span>Basis / Value Ratio</span>
                                                        <span className={ratioHealthy ? 'text-gray-200' : 'text-red-400'}>
                                                            {basisRatio > 1000 ? basisRatio.toExponential(1) : `${basisRatio.toFixed(2)}×`} {ratioHealthy ? '✓' : '✗'}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                        {hasPeriodReturn && (
                                            <div className="flex justify-between text-gray-400 pt-1.5 mt-1.5 border-t border-white/5">
                                                <span>{PERIOD_LABELS[prPeriod]} Start Value</span>
                                                <span className="text-blue-300">reconstructed</span>
                                            </div>
                                        )}
                                        <div className="pt-1.5 mt-1.5 border-t border-white/5 text-gray-500">
                                            <div className="text-[10px] leading-snug">
                                                Formula: {hasPeriodReturn
                                                    ? '(Current − Period-Start Value) / Period-Start Value × 100'
                                                    : '(Current − Cost Basis) / Cost Basis × 100'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right — period activity + benchmarks */}
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{PERIOD_LABELS[prPeriod]} Activity</p>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Invested</span>
                                        <span className="font-semibold text-gray-200">{fmt(selD.invested)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Proceeds</span>
                                        <span className={`font-semibold ${selD.proceeds > 0 ? 'text-green-500' : 'text-gray-200'}`}>
                                            {selD.proceeds > 0 ? '+' : ''}{fmt(selD.proceeds)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Dividends</span>
                                        <span className={`font-semibold ${selD.dividends > 0 ? 'text-green-500' : 'text-gray-200'}`}>
                                            {selD.dividends > 0 ? '+' : ''}{fmt(selD.dividends)}
                                        </span>
                                    </div>
                                </div>

                                {/* Benchmarks */}
                                {Object.keys(bench).length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-white/10">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Benchmarks ({PERIOD_LABELS[prPeriod]})</p>
                                        <div className="space-y-1.5">
                                            {Object.entries(BENCH_NAMES).map(([k, name]) => {
                                                const v = bench[k];
                                                if (v == null) return null;
                                                return (
                                                    <div key={k} className="flex justify-between text-sm">
                                                        <span className="text-gray-400">{name}</span>
                                                        <span className={`font-semibold ${v >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {v >= 0 ? '+' : ''}{v.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                    ) : (
                        <p className="text-sm text-gray-400 mt-1">Add investments or sync Plaid to track returns</p>
                    )}
                </Card>
                );
            })()}

            {isDemoMode && !hideSummary && (
                <div className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
                    <div className="flex items-center space-x-4 text-center md:text-left">
                        <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                            <Zap className="text-yellow-300 fill-yellow-300" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">You're in Demo Mode</h3>
                            <p className="text-blue-100 text-sm opacity-90">Experience Fymo with sample data. Ready to set up your real profile?</p>
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
                <>
                    {/* Industry Allocation — full-width: donut + sorted category breakdown side by side.
                        Was previously cramped in a half-width column next to a tall Asset Breakdown,
                        which left a giant blank void below the donut and forced the bottom legend
                        into a tiny two-row wrap. */}
                    <Card title="Industry Allocation" icon={<PieChartIcon className="text-yellow-500" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                            <div className="h-[340px] relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={chartData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={false}
                                            outerRadius={140}
                                            innerRadius={92}
                                            paddingAngle={1.5}
                                            stroke={sliceStroke}
                                            strokeWidth={3}
                                            dataKey="value"
                                            isAnimationActive={!isDemoMode}
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={isDemoMode ? 0.35 : 1} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} wrapperStyle={{ outline: 'none' }} />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                                {chartData.length > 0 && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1.5">Total</span>
                                        <span className="text-4xl font-bold text-gray-800 dark:text-slate-100 tabular-nums">
                                            {fmtCompact(chartData.reduce((s, d) => s + (d.value || 0), 0))}
                                        </span>
                                        <span className="text-[11px] text-gray-400 dark:text-slate-500 mt-2 font-medium">
                                            {chartData.length} {chartData.length === 1 ? 'category' : 'categories'}
                                        </span>
                                    </div>
                                )}
                                {isDemoMode && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-gray-300 dark:text-slate-700 font-black text-4xl uppercase tracking-widest opacity-30 transform -rotate-12">Example Data</span>
                                    </div>
                                )}
                            </div>

                            {/* Sorted category breakdown (most → least). Replaces the old bottom legend
                                that recharts kept re-ordering. Source of truth: chartData order. */}
                            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                                {chartData.map((d, i) => {
                                    const color = COLORS[i % COLORS.length];
                                    const pctNum = typeof d.percent === 'string' ? parseFloat(d.percent) : (d.percent || 0);
                                    return (
                                        <div key={d.name}>
                                            <div className="flex items-center gap-2.5 mb-1.5">
                                                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
                                                <span className="text-sm text-gray-700 dark:text-slate-200 font-medium flex-1 truncate">{d.name}</span>
                                                <span className="text-xs text-gray-400 dark:text-slate-500 font-mono tabular-nums w-12 text-right">{pctNum.toFixed(1)}%</span>
                                                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums min-w-[72px] text-right">
                                                    ${(d.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 dark:bg-slate-700/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.max(pctNum, 1.5)}%`, backgroundColor: color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>

                    {/* Asset Breakdown — full-width so the 10-column investments table fits without
                        a horizontal scrollbar at typical desktop widths. */}
                    <Card title="Asset Breakdown" icon={<Briefcase className="text-blue-500" />}>
                        <div className="overflow-x-auto">
                            <AssetTable assets={positiveAssets} onUpdateCostBasis={onUpdateCostBasis} />
                        </div>
                    </Card>
                </>
            )}

            {((showDebtAllocation || allDebts.length > 0) && (!hideAssetSections || showDebtAllocation)) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card title="Debt Details" icon={<ArrowDownCircle className="text-red-500" />}>
                        <div className="overflow-x-auto">
                            <DebtTable debts={allDebts} />
                        </div>
                    </Card>

                    <div className="self-start">
                    <Card title="Debt Allocation" icon={<PieChartIcon className="text-red-500" />}>
                        <div className="h-[320px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={debtChartData}
                                                cx="50%"
                                                cy="45%"
                                                labelLine={false}
                                                outerRadius={104}
                                                innerRadius={62}
                                                paddingAngle={1.5}
                                                stroke={sliceStroke}
                                                strokeWidth={3}
                                                dataKey="value"
                                                label={false}
                                            >
                                                {debtChartData.map((entry, index) => (
                                                    <Cell key={`cell-debt-${index}`} fill={COLORS[(index + 3) % COLORS.length]} opacity={isDebtDemoMode ? 0.35 : 1} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<DebtTooltip />} wrapperStyle={{ outline: 'none' }} />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={56}
                                                iconType="circle"
                                                iconSize={9}
                                                formatter={(value) => (
                                                    <span className="text-[11px] text-gray-600 dark:text-slate-400 font-medium">{value}</span>
                                                )}
                                            />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                    {debtChartData.length > 0 && (
                                        <div className="absolute left-0 right-0 top-[45%] -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-0.5">Total</span>
                                            <span className="text-xl font-bold text-gray-800 dark:text-slate-100 tabular-nums">
                                                {fmtCompact(debtChartData.reduce((s, d) => s + (d.value || 0), 0))}
                                            </span>
                                        </div>
                                    )}
                                    {isDebtDemoMode && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-gray-300 dark:text-slate-700 font-black text-3xl uppercase tracking-widest opacity-30 transform -rotate-12">Example Data</span>
                                        </div>
                                    )}
                                </div>
                    </Card>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

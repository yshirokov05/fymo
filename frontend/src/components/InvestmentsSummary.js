import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Briefcase, DollarSign, Activity } from 'lucide-react';

/**
 * InvestmentsSummary
 * ─────────────────────────────────────────────────────────────────────────────
 * Header panel for the Investments tab. Surfaces the four numbers a user wants
 * to see at a glance — current value, today's change ($ AND %), all-time
 * unrealized gain, cost basis — and a portfolio-value trend chart built from
 * the portfolio_snapshots subcollection.
 *
 * Replaces the prior "Total Asset Value: $X" one-liner above the embedded
 * Dashboard, which had no daily-change visibility and no trend at all.
 */

const LIQUID_TYPES = new Set(['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS']);
const LIQUID_TICKERS = new Set([
    'CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX',
    'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX',
]);

const fmtUsd = (n, { showSign = false, fractionDigits = 2 } = {}) => {
    const sign = showSign && n > 0 ? '+' : (n < 0 ? '-' : '');
    return `${sign}$${Math.abs(n).toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })}`;
};

const fmtPct = (n, { showSign = true, fractionDigits = 2 } = {}) => {
    const sign = showSign && n > 0 ? '+' : (n < 0 ? '-' : '');
    return `${sign}${Math.abs(n).toFixed(fractionDigits)}%`;
};

const TrendTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white dark:bg-slate-800 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl text-xs">
            <div className="font-bold text-gray-800 dark:text-slate-100">
                ${d.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-gray-400 dark:text-slate-500 mt-0.5">{d.date}</div>
        </div>
    );
};

const Stat = ({ label, value, sub, accent = 'neutral', icon }) => {
    const accentClass = {
        positive: 'text-green-600 dark:text-green-400',
        negative: 'text-red-600 dark:text-red-500',
        primary:  'text-blue-600 dark:text-blue-400',
        neutral:  'text-gray-800 dark:text-slate-100',
    }[accent];
    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
                {icon && <span className="text-gray-400 dark:text-slate-500">{icon}</span>}
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">{label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${accentClass} truncate`}>{value}</div>
            {sub && <div className={`text-xs mt-0.5 font-semibold tabular-nums ${accentClass}`}>{sub}</div>}
        </div>
    );
};

const InvestmentsSummary = ({ assets = [], investmentHistory = null, portfolioHistory = [] }) => {
    // Investment positions only — exclude cash, savings, real estate
    const investedAssets = assets.filter(a => {
        const isCashTicker = LIQUID_TICKERS.has(a.ticker);
        const isCashType = LIQUID_TYPES.has(a.asset_type) || isCashTicker;
        const isHousing = a.asset_type === 'HOUSING';
        return !isCashType && !isHousing && (a.shares || 0) > 0;
    });

    // Current market value
    const currentValue = investedAssets.reduce((sum, a) => {
        const price = a.current_price || (a.shares > 0 ? a.cost_basis / a.shares : 0) || 0;
        return sum + Math.max(0, (a.shares || 0) * price);
    }, 0);

    // Daily change: $ from per-share daily_change_usd, % derived from yesterday's value
    const dailyChangeUsd = investedAssets.reduce((sum, a) => {
        return sum + ((a.daily_change_usd || 0) * (a.shares || 0));
    }, 0);
    const yesterdayValue = currentValue - dailyChangeUsd;
    const dailyChangePct = yesterdayValue > 0 ? (dailyChangeUsd / yesterdayValue) * 100 : 0;

    // Cost basis — prefer institution (Plaid Holdings), fall back to per-asset manual entries
    const institutionBasis = investmentHistory?.total_cost_basis || 0;
    const manualBasis = investedAssets.reduce(
        (sum, a) => sum + ((a.cost_basis || 0) * (a.shares || 0)),
        0
    );
    const costBasis = institutionBasis > 0 ? institutionBasis : manualBasis;
    const basisSource = institutionBasis > 0 ? 'institution' : 'manual';

    // All-time unrealized P/L
    const allTimeDollar = currentValue - costBasis;
    const allTimePct = costBasis > 0 ? (allTimeDollar / costBasis) * 100 : 0;
    const hasValidBasis = costBasis > 0 && (costBasis / Math.max(currentValue, 1)) <= 5;

    // Portfolio trend: chart the daily snapshots. We have up to 90 days.
    const hasTrend = portfolioHistory && portfolioHistory.length >= 2;
    const trendFirst = hasTrend ? portfolioHistory[0].value : 0;
    const trendLast = hasTrend ? portfolioHistory[portfolioHistory.length - 1].value : 0;
    const trendUp = trendLast >= trendFirst;
    const trendDollar = trendLast - trendFirst;
    const trendPct = trendFirst > 0 ? (trendDollar / trendFirst) * 100 : 0;
    const trendColor = trendUp ? '#10b981' : '#ef4444';

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
            {/* Stats row */}
            <div className="p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 border-b border-gray-100 dark:border-slate-700/60">
                <Stat
                    label="Portfolio Value"
                    value={fmtUsd(currentValue)}
                    accent="primary"
                    icon={<Briefcase size={12} />}
                />
                <Stat
                    label="Today"
                    value={fmtUsd(dailyChangeUsd, { showSign: true })}
                    sub={yesterdayValue > 0 ? fmtPct(dailyChangePct) : '—'}
                    accent={dailyChangeUsd >= 0 ? 'positive' : 'negative'}
                    icon={dailyChangeUsd >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                />
                <Stat
                    label="All-Time Unrealized"
                    value={hasValidBasis ? fmtUsd(allTimeDollar, { showSign: true }) : '—'}
                    sub={hasValidBasis ? fmtPct(allTimePct) : 'cost basis unavailable'}
                    accent={!hasValidBasis ? 'neutral' : (allTimeDollar >= 0 ? 'positive' : 'negative')}
                    icon={<Activity size={12} />}
                />
                <Stat
                    label={`Cost Basis (${basisSource})`}
                    value={costBasis > 0 ? fmtUsd(costBasis, { fractionDigits: 0 }) : '—'}
                    accent="neutral"
                    icon={<DollarSign size={12} />}
                />
            </div>

            {/* Trend chart — portfolio value over time from daily snapshots */}
            {hasTrend && (
                <div className="px-6 md:px-8 pt-5 pb-6">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">
                                Portfolio Trend
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                {portfolioHistory.length} {portfolioHistory.length === 1 ? 'snapshot' : 'snapshots'}
                                {portfolioHistory[0]?.date && ` since ${portfolioHistory[0].date}`}
                            </div>
                        </div>
                        <div className={`text-right ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-500'}`}>
                            <div className="text-sm font-bold tabular-nums">
                                {fmtUsd(trendDollar, { showSign: true, fractionDigits: 0 })}
                            </div>
                            <div className="text-xs font-semibold tabular-nums">
                                {fmtPct(trendPct)} window
                            </div>
                        </div>
                    </div>
                    <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={portfolioHistory} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                                <defs>
                                    <linearGradient id="portfolioTrendGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="currentColor" className="text-gray-100 dark:text-slate-700/40" strokeDasharray="3 6" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: 'currentColor' }}
                                    className="text-gray-400 dark:text-slate-500"
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={40}
                                    tickFormatter={d => {
                                        const parts = (d || '').split('-');
                                        if (parts.length !== 3) return d;
                                        return `${parts[1]}/${parts[2]}`;
                                    }}
                                />
                                <YAxis
                                    domain={['dataMin', 'dataMax']}
                                    hide
                                />
                                <Tooltip content={<TrendTooltip />} cursor={{ stroke: trendColor, strokeWidth: 1, strokeDasharray: '3 3' }} />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={trendColor}
                                    strokeWidth={2}
                                    fill="url(#portfolioTrendGrad)"
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 2, fill: trendColor, stroke: '#fff' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {!hasTrend && (
                <div className="px-6 md:px-8 py-5 text-xs text-gray-400 dark:text-slate-500">
                    Portfolio trend will appear here once you have at least two daily snapshots. Each sync writes one.
                </div>
            )}
        </div>
    );
};

export default InvestmentsSummary;

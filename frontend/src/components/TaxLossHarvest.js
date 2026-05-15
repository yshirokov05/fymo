import React, { useState } from 'react';
import { TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import InfoTip from './InfoTip';

/**
 * TaxLossHarvest
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays open lots that are currently underwater vs market — the candidates
 * for tax-loss harvesting. Backend (`tax_loss_service.py`) builds the list per
 * sync; this component just renders.
 *
 * Each row is a SPECIFIC lot (buy date + share count + cost), so users see
 * exactly which shares to consider selling. ST vs LT classified.
 *
 * Wash-sale rule NOT enforced — disclaimer rendered prominently.
 */

const fmtMoney = (n, fractionDigits = 2) => {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })}`;
};

const TaxLossHarvest = ({ harvest }) => {
    const [expanded, setExpanded] = useState(true);

    if (!harvest || !harvest.lot_count) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2">
                    <TrendingDown size={18} className="text-gray-400" />
                    <h3 className="font-bold text-gray-900 dark:text-slate-100">Tax-Loss Harvest Opportunities</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                    No underwater lots found. Either everything you hold is in the green
                    (nice!) or your buys are too old to be in the Plaid 5-year window.
                </p>
            </div>
        );
    }

    const { opportunities, total_potential_loss, total_potential_loss_st, total_potential_loss_lt, note } = harvest;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
            <button
                onClick={() => setExpanded(s => !s)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <TrendingDown size={20} className="text-red-500" />
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-slate-100">Tax-Loss Harvest Opportunities</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {opportunities.length} {opportunities.length === 1 ? 'lot' : 'lots'} currently underwater · could realize up to {fmtMoney(Math.abs(total_potential_loss), 0)} in losses
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                            {fmtMoney(total_potential_loss)}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider font-bold">potential loss</div>
                    </div>
                    {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
            </button>

            {expanded && (
                <>
                    <div className="px-6 py-3 bg-amber-50/60 dark:bg-amber-500/5 border-t border-amber-100 dark:border-amber-500/10 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <span>{note}</span>
                    </div>

                    {/* ST/LT breakdown row */}
                    <div className="px-6 py-4 grid grid-cols-2 gap-6 border-t border-gray-100 dark:border-slate-700/60 bg-gray-50/40 dark:bg-slate-800/40">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500 mb-1 flex items-center gap-1">
                                Short-term losses
                                <InfoTip size={10} text="Held under 1 year. Offsets ordinary income up to $3,000/year — the most tax-efficient kind." />
                            </div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                                {fmtMoney(total_potential_loss_st)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500 mb-1 flex items-center gap-1">
                                Long-term losses
                                <InfoTip size={10} text="Held 1+ years. Offsets long-term capital gains first, then ordinary income up to $3,000/year." />
                            </div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                                {fmtMoney(total_potential_loss_lt)}
                            </div>
                        </div>
                    </div>

                    {/* Per-lot table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50/80 dark:bg-slate-800/80 border-t border-b border-gray-100 dark:border-slate-700/60">
                                <tr>
                                    <th className="px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Ticker</th>
                                    <th className="px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Class</th>
                                    <th className="hidden sm:table-cell px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Bought</th>
                                    <th className="hidden md:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Shares</th>
                                    <th className="hidden lg:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cost/Sh</th>
                                    <th className="hidden lg:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Now/Sh</th>
                                    <th className="px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Loss</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/40">
                                {opportunities.map((o, i) => (
                                    <tr key={`${o.ticker}-${o.buy_date}-${i}`} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-slate-100">{o.ticker}</td>
                                        <td className="px-3 md:px-6 py-3 whitespace-nowrap">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                                o.classification === 'LT'
                                                    ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20'
                                                    : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
                                            }`}>
                                                {o.classification === 'LT' ? 'Long-term' : 'Short-term'}
                                            </span>
                                        </td>
                                        <td className="hidden sm:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                                            {o.buy_date}
                                            <span className="ml-1 text-gray-400 dark:text-slate-500">({o.holding_days}d)</span>
                                        </td>
                                        <td className="hidden md:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right tabular-nums text-gray-800 dark:text-slate-200">
                                            {o.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="hidden lg:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right tabular-nums text-gray-500 dark:text-slate-400">
                                            ${o.cost_per_share.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="hidden lg:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                                            ${o.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-red-600 dark:text-red-400 tabular-nums">
                                            {fmtMoney(o.unrealized_loss)}
                                            <div className="text-[10px] font-medium opacity-70">({o.unrealized_loss_pct.toFixed(2)}%)</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default TaxLossHarvest;

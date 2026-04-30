import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info, AlertTriangle } from 'lucide-react';

/**
 * RealizedGainsTable — per-ticker realized capital gains view.
 *
 * Reads `investmentHistory.realized_gains` (computed via FIFO lot matching on the backend).
 * Shows a table sorted by absolute gain magnitude, with expandable rows to see individual
 * sells matched against their buy lots.
 */
const RealizedGainsTable = ({ realizedGains }) => {
    const [expanded, setExpanded] = useState(false);
    const [expandedTicker, setExpandedTicker] = useState(null);

    // OCC option symbol regex: SYMBOL (1-6 chars) + YYMMDD + C/P + STRIKE (8 digits)
    // Used as a defensive client-side fallback in case backend hasn't tagged
    // is_option (e.g. data persisted before the option-detection backend deploy).
    const OPTION_RE = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
    const inferIsOption = (t) => t.is_option || OPTION_RE.test(t.ticker || '');
    const inferUnderlying = (t) => t.underlying || (OPTION_RE.test(t.ticker || '') ? t.ticker.slice(0, t.ticker.length - 15) : null);

    const { stockTickers, optionTickers } = useMemo(() => {
        if (!realizedGains?.by_ticker) return { stockTickers: [], optionTickers: [] };
        const all = Object.entries(realizedGains.by_ticker)
            .map(([ticker, data]) => {
                const enriched = { ticker, ...data };
                // Backfill missing flags from ticker pattern if backend didn't set them
                enriched.is_option = inferIsOption(enriched);
                enriched.underlying = inferUnderlying(enriched);
                return enriched;
            });
        const stocks = all.filter(t => !t.is_option).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
        const options = all.filter(t => t.is_option).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
        return { stockTickers: stocks, optionTickers: options };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [realizedGains]);

    const [optionsExpanded, setOptionsExpanded] = useState(false);

    const fmt = (n) => {
        const sign = n >= 0 ? '+' : '−';
        return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    };
    const fmtCents = (n) => {
        const sign = n >= 0 ? '+' : '−';
        return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (!realizedGains || !realizedGains.sell_count) {
        return null;
    }

    const total = realizedGains.total_realized || 0;
    const totalST = realizedGains.total_st || 0;
    const totalLT = realizedGains.total_lt || 0;
    const totalPos = total >= 0;
    const sellCount = realizedGains.sell_count || 0;
    const unmatchedCount = realizedGains.unmatched_count || 0;
    const earliest = realizedGains.earliest_txn_date;
    // Aggregate fallbacks: if the backend aggregate fields are missing (e.g. stale
    // persisted data from before the option-detection deploy), derive them from
    // the filtered ticker lists so the UI still segregates correctly.
    const stockTotal = realizedGains.stock_total ?? stockTickers.reduce((s, t) => s + (t.total || 0), 0);
    const optionsTotal = realizedGains.options_total ?? optionTickers.reduce((s, t) => s + (t.total || 0), 0);
    const optionsST = realizedGains.options_st ?? optionTickers.reduce((s, t) => s + (t.st || 0), 0);
    const optionsLT = realizedGains.options_lt ?? optionTickers.reduce((s, t) => s + (t.lt || 0), 0);
    const optionsCount = realizedGains.options_count || optionTickers.reduce((s, t) => s + (t.count || 0), 0);
    const optionsTickerCount = optionTickers.length;  // Always derive from filtered list
    const hasOptions = optionsTickerCount > 0;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            {/* Header (always visible) */}
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalPos ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {totalPos ? <TrendingUp className="text-green-600 dark:text-green-400" size={20} /> : <TrendingDown className="text-red-600 dark:text-red-400" size={20} />}
                    </div>
                    <div className="text-left">
                        <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">
                            Realized Capital Gains
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {sellCount} sell{sellCount !== 1 ? 's' : ''} matched
                            {earliest && <span> · since {earliest}</span>}
                            {hasOptions && (
                                <span className="ml-2">
                                    · <span className="text-gray-600 dark:text-gray-300">Stocks: </span>
                                    <span className={stockTotal >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(stockTotal)}</span>
                                    <span className="text-gray-400 dark:text-gray-500"> · </span>
                                    <span className="text-purple-600 dark:text-purple-400">Options: </span>
                                    <span className={optionsTotal >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(optionsTotal)}</span>
                                </span>
                            )}
                            {unmatchedCount > 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <AlertTriangle size={11} />{unmatchedCount} unmatched
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className={`text-xl sm:text-2xl font-bold ${totalPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {fmt(total)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            LT: <span className={totalLT >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(totalLT)}</span>
                            <span className="mx-1.5">·</span>
                            ST: <span className={totalST >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(totalST)}</span>
                        </p>
                    </div>
                    {expanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-gray-100 dark:border-slate-700">
                    {/* Methodology note */}
                    <div className="px-4 sm:px-6 py-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800/30 flex items-start gap-2">
                        <Info size={14} className="text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            Computed via FIFO lot matching on your 5-year Plaid transaction history. Lots held ≥365 days are <strong>long-term</strong> (favorable tax rates). Sells of shares purchased &gt;5 years ago or transferred from another brokerage may appear as <strong>unmatched</strong> — proceeds are tracked but cost basis is unknown.
                        </p>
                    </div>

                    {/* Per-ticker table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-slate-700/40 text-left">
                                    <th className="px-4 sm:px-6 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ticker</th>
                                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Sells</th>
                                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Long-Term</th>
                                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Short-Term</th>
                                    <th className="px-4 sm:px-6 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {stockTickers.map(t => renderTickerRow(t, expandedTicker, setExpandedTicker, fmt, fmtCents))}

                                {/* Options grouping — collapsed by default to keep the view clean */}
                                {hasOptions && (
                                    <React.Fragment>
                                        <tr
                                            onClick={() => setOptionsExpanded(e => !e)}
                                            className="cursor-pointer bg-purple-50/40 dark:bg-purple-900/10 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors border-t-2 border-purple-100 dark:border-purple-800/30"
                                        >
                                            <td className="px-4 sm:px-6 py-3 font-bold text-purple-700 dark:text-purple-300">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {optionsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                    Options Trading
                                                    <span className="text-[10px] text-purple-500 dark:text-purple-400 font-normal">({optionsTickerCount} contracts)</span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{optionsCount}</td>
                                            <td className="px-4 py-3 text-right">
                                                {optionsLT !== 0 ? (
                                                    <span className={`font-semibold ${optionsLT >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(optionsLT)}</span>
                                                ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {optionsST !== 0 ? (
                                                    <span className={`font-semibold ${optionsST >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(optionsST)}</span>
                                                ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                                            </td>
                                            <td className="px-4 sm:px-6 py-3 text-right">
                                                <span className={`font-bold ${optionsTotal >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(optionsTotal)}</span>
                                            </td>
                                        </tr>
                                        {optionsExpanded && (
                                            <tr className="bg-purple-50/20 dark:bg-purple-900/5">
                                                <td colSpan={5} className="px-2">
                                                    <div className="px-2 sm:px-4 py-2 text-[11px] text-purple-700 dark:text-purple-300 italic">
                                                        Each option contract is a unique security (specific strike + expiry). FIFO matching only applies within the same exact contract. Multipliers (1 contract = 100 shares) are honored as Plaid reports them — verify against your brokerage statements before relying on these numbers for tax purposes.
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {optionsExpanded && optionTickers.map(t => renderTickerRow(t, expandedTicker, setExpandedTicker, fmt, fmtCents, true))}
                                    </React.Fragment>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// Extracted row renderer used for both stocks and (when expanded) options.
function renderTickerRow(t, expandedTicker, setExpandedTicker, fmt, fmtCents, isOptionContext = false) {
    const isExpanded = expandedTicker === t.ticker;
    const tPos = t.total >= 0;
    const tickerLabel = isOptionContext && t.underlying
        ? <span><span className="text-purple-500 dark:text-purple-400 mr-1.5">{t.underlying}</span><span className="text-[10px] font-normal text-gray-500">{t.ticker.slice(t.underlying.length)}</span></span>
        : t.ticker;
    return (
        <React.Fragment key={t.ticker}>
            <tr
                onClick={() => setExpandedTicker(isExpanded ? null : t.ticker)}
                className={`cursor-pointer transition-colors ${isOptionContext ? 'hover:bg-purple-50/40 dark:hover:bg-purple-900/10' : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'}`}
            >
                <td className={`px-4 sm:px-6 py-3 font-mono ${isOptionContext ? 'pl-8 sm:pl-10 text-xs' : 'font-bold text-gray-800 dark:text-gray-100'}`}>
                    <span className="inline-flex items-center gap-1.5">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {tickerLabel}
                    </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{t.count}</td>
                <td className="px-4 py-3 text-right">
                    {t.lt !== 0 ? (
                        <span className={`font-semibold ${t.lt >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(t.lt)}</span>
                    ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                    {t.st !== 0 ? (
                        <span className={`font-semibold ${t.st >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(t.st)}</span>
                    ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 sm:px-6 py-3 text-right">
                    <span className={`font-bold ${tPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(t.total)}</span>
                </td>
            </tr>
            {isExpanded && t.sells && t.sells.length > 0 && (
                <tr className="bg-gray-50 dark:bg-slate-900/30">
                    <td colSpan={5} className="px-4 sm:px-6 py-3">
                        <div className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-2 tracking-wide">Individual Sells</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-400 dark:text-gray-500">
                                        <th className="text-left font-medium py-1.5 pr-3">Date</th>
                                        <th className="text-right font-medium py-1.5 px-3">{isOptionContext ? 'Contracts' : 'Shares'}</th>
                                        <th className="text-right font-medium py-1.5 px-3">Proceeds</th>
                                        <th className="text-right font-medium py-1.5 px-3">Cost Basis</th>
                                        <th className="text-right font-medium py-1.5 px-3">LT</th>
                                        <th className="text-right font-medium py-1.5 px-3">ST</th>
                                        <th className="text-right font-medium py-1.5 pl-3">Gain</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {t.sells.map((s, i) => {
                                        const sPos = s.gain >= 0;
                                        return (
                                            <tr key={i} className="text-gray-700 dark:text-gray-300">
                                                <td className="py-1 pr-3 font-mono">{s.date}</td>
                                                <td className="py-1 px-3 text-right">
                                                    {s.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                    {s.unmatched_shares > 0 && (
                                                        <span className="ml-1 text-amber-500" title={`${s.unmatched_shares} unmatched (no buy lot found)`}>*</span>
                                                    )}
                                                </td>
                                                <td className="py-1 px-3 text-right">${s.proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className="py-1 px-3 text-right">${s.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className="py-1 px-3 text-right">
                                                    {s.lt_gain !== 0 ? (
                                                        <span className={s.lt_gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                            {fmtCents(s.lt_gain)}
                                                        </span>
                                                    ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                                                </td>
                                                <td className="py-1 px-3 text-right">
                                                    {s.st_gain !== 0 ? (
                                                        <span className={s.st_gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                            {fmtCents(s.st_gain)}
                                                        </span>
                                                    ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                                                </td>
                                                <td className="py-1 pl-3 text-right font-semibold">
                                                    <span className={sPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                        {fmtCents(s.gain)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {t.sells.some(s => s.unmatched_shares > 0) && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
                                    * Some {isOptionContext ? 'contracts' : 'shares'} couldn't be matched to a buy lot — likely transferred in or purchased &gt;5 years ago.
                                </p>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
}

export default RealizedGainsTable;

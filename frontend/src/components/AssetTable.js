import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Check, X } from 'lucide-react';

const AssetTable = ({ assets, onUpdateCostBasis }) => {
    const [expandedRows, setExpandedRows] = useState({});
    const [editingCostBasis, setEditingCostBasis] = useState(null); // { id, value }

    const startEdit = (e, assetId, currentCostBasis) => {
        e.stopPropagation();
        setEditingCostBasis({ id: assetId, value: currentCostBasis.toString() });
    };

    const confirmEdit = (e, assetId) => {
        e.stopPropagation();
        const val = parseFloat(editingCostBasis?.value);
        if (!isNaN(val) && val >= 0 && onUpdateCostBasis) {
            onUpdateCostBasis(assetId, val);
        }
        setEditingCostBasis(null);
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditingCostBasis(null);
    };

    const toggleRow = (ticker) => {
        setExpandedRows(prev => ({
            ...prev,
            [ticker]: !prev[ticker]
        }));
    };

    const groupAssets = (allAssets) => {
        const grouped = {
            'Cash & Savings': [],
            'Investments': [],
            'Housing': [],
            'Other': []
        };

        const cashSavingsTypes = ['SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS', 'CASH'];
        const investmentTypes = ['STOCK', 'BOND'];
        const housingTypes = ['HOUSING'];
        const cashTickers = ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'];

        allAssets.forEach(asset => {
            const isCashTicker = cashTickers.includes(asset.ticker);
            
            // Respect the asset_type passed from the backend, but VMFXX and friends go to Cash
            if (isCashTicker || cashSavingsTypes.includes(asset.asset_type)) {
                grouped['Cash & Savings'].push(asset);
            } else if (investmentTypes.includes(asset.asset_type)) {
                grouped['Investments'].push(asset);
            } else if (housingTypes.includes(asset.asset_type)) {
                grouped['Housing'].push(asset);
            } else {
                grouped['Other'].push(asset);
            }
        });

        // Consolidate Investments by ticker
        const consolidatedInvestments = {};
        grouped['Investments'].forEach(asset => {
            if (!consolidatedInvestments[asset.ticker]) {
                consolidatedInvestments[asset.ticker] = {
                    ...asset,
                    shares: 0,
                    total_value: 0,
                    total_cost: 0,
                    accounts: []
                };
            }
            const marketPrice = asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 1.0;
            const marketValue = asset.shares * marketPrice;
            const costBasisTotal = asset.shares * asset.cost_basis;

            consolidatedInvestments[asset.ticker].shares += asset.shares;
            consolidatedInvestments[asset.ticker].total_value += marketValue;
            consolidatedInvestments[asset.ticker].total_cost += costBasisTotal;
            consolidatedInvestments[asset.ticker].accounts.push({
                ...asset,
                marketValue,
                marketPrice
            });
        });

        grouped['Investments'] = Object.values(consolidatedInvestments).sort((a, b) => b.total_value - a.total_value);

        return grouped;
    };

    const groupedAssets = groupAssets(assets);

    const renderAssetRow = (asset, isSubRow = false) => {
        const isLiquidAsset = ['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS'].includes(asset.asset_type) ||
                             ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'].includes(asset.ticker);
        const isHousing = asset.asset_type === 'HOUSING';

        const marketPrice = asset.marketPrice || asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 1.0;
        const marketValue = asset.marketValue || (isLiquidAsset || isHousing ? asset.shares : asset.shares * marketPrice);

        const totalCost = asset.total_cost || (asset.shares * asset.cost_basis);
        const gainLoss = marketValue - totalCost;
        const gainLossPercent = (totalCost !== 0) ? (gainLoss / Math.abs(totalCost)) * 100 : 0;

        const hasMultipleAccounts = asset.accounts && asset.accounts.length > 1;
        const isExpanded = expandedRows[asset.ticker];

        const isRetirement = asset.tax_treatment === 'RETIREMENT';
        const treatmentChipClass = isRetirement
            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20'
            : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20';

        return (
            <React.Fragment key={`${asset.ticker}-${asset.institution_name}-${isSubRow ? 'sub' : 'main'}`}>
                <tr className={`${isSubRow ? 'bg-gray-50/70 dark:bg-slate-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'} transition-colors ${hasMultipleAccounts ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500' : ''}`}
                    onClick={() => hasMultipleAccounts && toggleRow(asset.ticker)}
                    {...(hasMultipleAccounts && !isSubRow ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': isExpanded,
                        'aria-label': `${asset.ticker}, ${asset.accounts.length} accounts — ${isExpanded ? 'collapse' : 'expand'}`,
                        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(asset.ticker); } },
                    } : {})}>
                    <td className="hidden sm:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                            {hasMultipleAccounts && !isSubRow && (
                                isExpanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />
                            )}
                            {isLiquidAsset ? 'CASH' : asset.asset_type}
                        </div>
                    </td>
                    <td className={`px-3 md:px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-slate-100 ${isSubRow ? 'pl-8 md:pl-12 font-medium text-gray-600 dark:text-slate-400' : ''}`}>
                        {/* On mobile we have no Type column — show a tiny inline expander chevron here for multi-account rows so the disclosure is still discoverable. */}
                        <div className="flex items-center gap-1.5">
                            {hasMultipleAccounts && !isSubRow && (
                                <span className="sm:hidden text-gray-400">
                                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </span>
                            )}
                            {asset.ticker}
                        </div>
                    </td>
                    <td className="hidden md:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-xs">
                        <span className={`px-2 py-0.5 rounded-md ${treatmentChipClass} font-semibold text-[10px] uppercase tracking-wide`}>
                            {asset.tax_treatment || 'TAXABLE'}
                        </span>
                    </td>
                    <td className="hidden lg:table-cell px-3 md:px-6 py-3 text-xs text-gray-500 dark:text-slate-400 max-w-[140px]">
                        <span className="block truncate" title={isSubRow ? asset.institution_name : (hasMultipleAccounts ? `${asset.accounts.length} Accounts` : (asset.institution_name || 'Manual'))}>
                            {isSubRow ? asset.institution_name : (hasMultipleAccounts ? `${asset.accounts.length} Accounts` : (asset.institution_name || 'Manual'))}
                        </span>
                    </td>

                    <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-slate-200 font-medium tabular-nums">
                        {asset.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </td>

                    {!isHousing ? (
                        <>
                            <td className="hidden md:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-500 dark:text-slate-400 tabular-nums group/cb">
                                {editingCostBasis?.id === asset.plaid_account_id ? (
                                    <div className="flex items-center justify-end space-x-1" onClick={e => e.stopPropagation()}>
                                        <span className="text-gray-400 dark:text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={editingCostBasis.value}
                                            onChange={e => setEditingCostBasis(prev => ({ ...prev, value: e.target.value }))}
                                            aria-label={`Cost per share for ${asset.ticker}`}
                                            className="w-20 text-xs border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-slate-100 text-right"
                                            autoFocus
                                            step="0.01"
                                            min="0"
                                        />
                                        <button onClick={e => confirmEdit(e, asset.plaid_account_id)} aria-label="Save cost basis" className="text-green-600 dark:text-green-400 hover:text-green-800 p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"><Check size={13} aria-hidden="true" /></button>
                                        <button onClick={cancelEdit} aria-label="Cancel edit" className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"><X size={13} aria-hidden="true" /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-end space-x-1">
                                        <span>${asset.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        {onUpdateCostBasis && (
                                            <button
                                                onClick={e => startEdit(e, asset.plaid_account_id, asset.cost_basis)}
                                                className="opacity-0 group-hover/cb:opacity-100 focus:opacity-100 transition-opacity text-gray-300 dark:text-slate-600 hover:text-blue-500 p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                title="Edit cost basis"
                                                aria-label={`Edit cost basis for ${asset.ticker}`}
                                            >
                                                <Pencil size={11} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td className="hidden sm:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                                ${marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`hidden lg:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right font-semibold tabular-nums ${(asset.daily_change_usd || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {(asset.daily_change_usd || 0) >= 0 ? '+' : '-'}${Math.abs((asset.daily_change_usd || 0) * asset.shares).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span className="text-[10px] ml-1 font-medium opacity-70">({(asset.daily_change_percent || 0).toFixed(2)}%)</span>
                            </td>
                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-slate-100 font-bold tabular-nums">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right font-bold tabular-nums ${gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {gainLoss >= 0 ? '+' : '-'}${Math.abs(gainLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <div className="text-[10px] font-medium opacity-70">({gainLossPercent.toFixed(2)}%)</div>
                            </td>
                        </>
                    ) : (
                        <>
                            <td className="hidden md:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-300 dark:text-slate-600">—</td>
                            <td className="hidden sm:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-300 dark:text-slate-600">—</td>
                            <td className="hidden lg:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-300 dark:text-slate-600">—</td>
                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-slate-100 font-bold tabular-nums">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-300 dark:text-slate-600">—</td>
                        </>
                    )}
                </tr>
                {!isSubRow && isExpanded && hasMultipleAccounts &&
                    asset.accounts.map(acc => renderAssetRow(acc, true))
                }
            </React.Fragment>
        );
    };

    const renderAssetGroup = (groupName, assetsInGroup) => {
        if (assetsInGroup.length === 0) {
            return null;
        }

        const isLiquidGroup = groupName === 'Cash & Savings';
        
        const groupTotals = assetsInGroup.reduce((acc, asset) => {
            const isCashTicker = ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'].includes(asset.ticker);
            const isLiquidAsset = ['CASH', 'SAVINGS', 'CHECKING', 'HIGH_YIELD_SAVINGS'].includes(asset.asset_type) || isCashTicker;
            const isHousing = asset.asset_type === 'HOUSING';

            const marketPrice = asset.marketPrice || asset.current_price || (asset.shares > 0 ? asset.cost_basis / asset.shares : 0) || 1.0;
            const marketValue = asset.marketValue || (isLiquidAsset || isHousing ? asset.shares : asset.shares * marketPrice);
            const totalCost = asset.total_cost || (asset.shares * asset.cost_basis);
            const gainLoss = (asset.total_gain !== null && asset.total_gain !== undefined) ? asset.total_gain : (marketValue - totalCost);
            const dailyChange = (asset.daily_change_usd || 0) * asset.shares;

            acc.shares += asset.shares;
            acc.value += marketValue;
            acc.cost += totalCost;
            acc.gainLoss += gainLoss;
            acc.dailyChange += dailyChange;
            return acc;
        }, { shares: 0, value: 0, cost: 0, gainLoss: 0, dailyChange: 0 });

        const groupGainLossPercent = groupTotals.cost !== 0 ? (groupTotals.gainLoss / Math.abs(groupTotals.cost)) * 100 : 0;
        // Daily % is the weighted-average daily change relative to yesterday's close,
        // not to today's value. yesterday = today − daily $ change.
        const groupDailyYesterday = groupTotals.value - groupTotals.dailyChange;
        const groupDailyPercent = groupDailyYesterday > 0 ? (groupTotals.dailyChange / groupDailyYesterday) * 100 : 0;

        // Per-group accent — adds wayfinding without being garish. Bar + count chip share the hue.
        const accentMap = {
            'Cash & Savings': { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
            'Investments':    { bar: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400' },
            'Housing':        { bar: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400' },
            'Other':          { bar: 'bg-slate-400',   text: 'text-slate-600 dark:text-slate-400' },
        };
        const accent = accentMap[groupName] || accentMap['Other'];
        const itemCount = assetsInGroup.length;

        return (
            <div key={groupName} className="mb-6 md:mb-8">
                <div className="flex items-center gap-2.5 mb-3 px-1">
                    <span className={`h-4 w-1 rounded-full ${accent.bar}`}></span>
                    <h2 className="text-xs font-bold text-gray-700 dark:text-slate-200 uppercase tracking-wider">{groupName}</h2>
                    <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className={`ml-auto text-xs font-bold tabular-nums ${accent.text}`}>
                        ${groupTotals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60">
                    <table className="min-w-full divide-y divide-gray-100 dark:divide-slate-700/60">
                        <thead className="bg-gray-50/80 dark:bg-slate-800/80">
                            <tr>
                                {/* Mobile-responsive column hiding: keeps the most decision-critical
                                    columns visible at 375px (Name, Shares, Price, Value, Gain/Loss),
                                    hides secondary metadata until ≥sm/md viewports. */}
                                <th className="hidden sm:table-cell px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                                <th className="px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                                <th className="hidden md:table-cell px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Treatment</th>
                                <th className="hidden lg:table-cell px-3 md:px-6 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Account</th>
                                <th className="px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                                    {isLiquidGroup ? 'Balance' : 'Shares'}
                                </th>
                                {!isLiquidGroup && (
                                    <>
                                        <th className="hidden md:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cost/Sh</th>
                                        <th className="hidden sm:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Price</th>
                                        <th className="hidden lg:table-cell px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Daily</th>
                                        <th className="px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Value</th>
                                        <th className="px-3 md:px-6 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Gain / Loss</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/40">
                    {assetsInGroup.map((asset) => {
                                if (isLiquidGroup) {
                                    const isRetirement = asset.tax_treatment === 'RETIREMENT';
                                    const chip = isRetirement
                                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20'
                                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20';
                                    return (
                                        <tr key={asset.plaid_account_id || asset.ticker} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="hidden sm:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{(['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'].includes(asset.ticker)) ? 'CASH' : asset.asset_type}</td>
                                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-slate-100">{asset.ticker}</td>
                                            <td className="hidden md:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-xs">
                                                <span className={`px-2 py-0.5 rounded-md ${chip} font-semibold text-[10px] uppercase tracking-wide`}>
                                                    {asset.tax_treatment || 'TAXABLE'}
                                                </span>
                                            </td>
                                            <td className="hidden lg:table-cell px-3 md:px-6 py-3 text-xs text-gray-500 dark:text-slate-400 max-w-[140px]">
                                                <span className="block truncate" title={asset.institution_name || 'Manual'}>{asset.institution_name || 'Manual'}</span>
                                            </td>
                                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-slate-100 font-bold tabular-nums">
                                                ${asset.shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                }
                                return renderAssetRow(asset);
                            })}
                        </tbody>
                        {(isLiquidGroup || groupName === 'Investments') && (
                            <tfoot className="bg-gray-50/80 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/60">
                                <tr>
                                    {/* Columns: Type | Name | Treatment | Account | Shares/Balance | [Cost/Sh | Price | Daily | Value | Gain/Loss] */}
                                    {/* colSpan adapts to mobile-hidden columns: at <sm we only render Name + Shares = 2 cols before the value group; at sm 3 cols (Type+Name+Shares — Price reveals here); at md 5 cols. Use responsive utility classes on a single colSpan="4" td: it'll cover the right cells because hidden ones don't render. */}
                                    <td colSpan="4" className="px-3 md:px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                                        Subtotal
                                    </td>
                                    <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-slate-100 font-bold tabular-nums">
                                        {`$${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </td>
                                    {!isLiquidGroup && (
                                        <>
                                            <td className="hidden md:table-cell px-3 md:px-6 py-3"></td>
                                            <td className="hidden sm:table-cell px-3 md:px-6 py-3"></td>
                                            <td className={`hidden lg:table-cell px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right font-bold tabular-nums ${groupTotals.dailyChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {groupTotals.dailyChange >= 0 ? '+' : '-'}${Math.abs(groupTotals.dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                {groupDailyYesterday > 0 && (
                                                    <div className="text-[10px] font-medium opacity-70">
                                                        ({groupDailyPercent >= 0 ? '+' : ''}{groupDailyPercent.toFixed(2)}%)
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-slate-100 font-bold tabular-nums">
                                                ${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`px-3 md:px-6 py-3 whitespace-nowrap text-sm text-right font-bold tabular-nums ${groupTotals.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {groupTotals.gainLoss >= 0 ? '+' : '-'}${Math.abs(groupTotals.gainLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                <div className="text-[10px] font-medium opacity-70">({groupGainLossPercent.toFixed(2)}%)</div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            {renderAssetGroup('Cash & Savings', groupedAssets['Cash & Savings'])}
            {renderAssetGroup('Investments', groupedAssets['Investments'])}
            {renderAssetGroup('Housing', groupedAssets['Housing'])}
            {renderAssetGroup('Other', groupedAssets['Other'])}
        </div>
    );
};

export default AssetTable;

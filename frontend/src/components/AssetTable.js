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

        return (
            <React.Fragment key={`${asset.ticker}-${asset.institution_name}-${isSubRow ? 'sub' : 'main'}`}>
                <tr className={`${isSubRow ? 'bg-gray-50 dark:bg-slate-700/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'} transition-colors ${hasMultipleAccounts ? 'cursor-pointer' : ''}`}
                    onClick={() => hasMultipleAccounts && toggleRow(asset.ticker)}>
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">
                        <div className="flex items-center gap-2">
                            {hasMultipleAccounts && !isSubRow && (
                                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            )}
                            {isLiquidAsset ? 'CASH' : asset.asset_type}
                        </div>
                    </td>
                    <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-gray-100 ${isSubRow ? 'pl-8 md:pl-12' : ''}`}>
                        {asset.ticker}
                    </td>
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                        <span className={`px-2 py-0.5 rounded-full ${asset.tax_treatment === 'RETIREMENT' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'} font-bold text-[10px]`}>
                            {asset.tax_treatment || 'TAXABLE'}
                        </span>
                    </td>
                    <td className="px-3 md:px-6 py-4 text-xs text-gray-500 dark:text-slate-400 max-w-[140px]">
                        <span className="block truncate" title={isSubRow ? asset.institution_name : (hasMultipleAccounts ? `${asset.accounts.length} Accounts` : (asset.institution_name || 'Manual'))}>
                            {isSubRow ? asset.institution_name : (hasMultipleAccounts ? `${asset.accounts.length} Accounts` : (asset.institution_name || 'Manual'))}
                        </span>
                    </td>
                    
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-bold">
                        {asset.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </td>
                    
                    {!isHousing ? (
                        <>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 group/cb">
                                {editingCostBasis?.id === asset.plaid_account_id ? (
                                    <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                                        <span className="text-gray-400 dark:text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={editingCostBasis.value}
                                            onChange={e => setEditingCostBasis(prev => ({ ...prev, value: e.target.value }))}
                                            className="w-20 text-xs border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                            autoFocus
                                            step="0.01"
                                            min="0"
                                        />
                                        <button onClick={e => confirmEdit(e, asset.plaid_account_id)} className="text-green-600 dark:text-green-400 hover:text-green-800 p-0.5"><Check size={13} /></button>
                                        <button onClick={cancelEdit} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-0.5"><X size={13} /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center space-x-1">
                                        <span>${asset.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        {onUpdateCostBasis && (
                                            <button
                                                onClick={e => startEdit(e, asset.plaid_account_id, asset.cost_basis)}
                                                className="opacity-0 group-hover/cb:opacity-100 transition-opacity text-gray-300 dark:text-slate-600 hover:text-blue-500 p-0.5"
                                                title="Edit cost basis"
                                            >
                                                <Pencil size={11} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-bold">
                                ${marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${(asset.daily_change_usd || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {(asset.daily_change_usd || 0) >= 0 ? '+' : ''}${(Math.abs(asset.daily_change_usd || 0) * asset.shares).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span className="text-[10px] ml-1 font-bold opacity-70">({(asset.daily_change_percent || 0).toFixed(2)}%)</span>
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-black">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {gainLoss >= 0 ? '+' : ''}${Math.abs(gainLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <div className="text-[10px] font-bold opacity-70">({gainLossPercent.toFixed(2)}%)</div>
                            </td>
                        </>
                    ) : (
                        <>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300 dark:text-slate-600">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300 dark:text-slate-600">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300 dark:text-slate-600">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-black">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300 dark:text-slate-600">—</td>
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

        return (
            <div key={groupName} className="mb-6 md:mb-8">
                <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100 mb-3 md:mb-4 px-2 md:px-0">{groupName}</h2>
                <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-slate-700 rounded-lg bg-white dark:bg-slate-800">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                        <thead className="bg-gray-50 dark:bg-slate-700/60">
                            <tr>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Treatment</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {isLiquidGroup ? 'Balance' : 'Shares'}
                                </th>
                                {!isLiquidGroup && (
                                    <>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost/Sh</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Daily</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Value</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gain/Loss</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {assetsInGroup.map((asset) => {
                                if (isLiquidGroup) {
                                    return (
                                        <tr key={asset.plaid_account_id || asset.ticker} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">{(['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'TMSXX', 'VBTIX', 'VUSXX', 'SNSXX', 'FZFXX'].includes(asset.ticker)) ? 'CASH' : asset.asset_type}</td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-gray-100">{asset.ticker}</td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                <span className={`px-2 py-0.5 rounded-full ${asset.tax_treatment === 'RETIREMENT' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'} font-bold text-[10px]`}>
                                                    {asset.tax_treatment || 'TAXABLE'}
                                                </span>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 text-xs text-gray-500 dark:text-slate-400 max-w-[140px]">
                                                <span className="block truncate" title={asset.institution_name || 'Manual'}>{asset.institution_name || 'Manual'}</span>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-black">
                                                ${asset.shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                }
                                return renderAssetRow(asset);
                            })}
                        </tbody>
                        {(isLiquidGroup || groupName === 'Investments') && (
                            <tfoot className="bg-gray-50 dark:bg-slate-700/60 border-t-2 border-gray-100 dark:border-slate-600">
                                <tr className="font-black">
                                    {/* Columns: Type | Name | Treatment | Account | Shares/Balance | [Cost/Sh | Price | Daily | Value | Gain/Loss] */}
                                    <td colSpan="4" className="px-3 md:px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                                        {groupName} Total
                                    </td>
                                    {/* Shares / Balance column */}
                                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-black">
                                        {`$${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </td>
                                    {!isLiquidGroup && (
                                        <>
                                            {/* Cost/Sh — blank in totals row (avg cost/sh across different securities is meaningless) */}
                                            <td className="px-3 md:px-6 py-4"></td>
                                            {/* Price — leave blank */}
                                            <td className="px-3 md:px-6 py-4"></td>
                                            {/* Daily */}
                                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${groupTotals.dailyChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {groupTotals.dailyChange >= 0 ? '+' : ''}${Math.abs(groupTotals.dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            {/* Value */}
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-black">
                                                ${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            {/* Gain/Loss */}
                                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${groupTotals.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {groupTotals.gainLoss >= 0 ? '+' : ''}${Math.abs(groupTotals.gainLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                <div className="text-[10px] opacity-70">({groupGainLossPercent.toFixed(2)}%)</div>
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

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const AssetTable = ({ assets }) => {
    const [expandedRows, setExpandedRows] = useState({});

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
        const cashTickers = ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX'];

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
                             ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX'].includes(asset.ticker);
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
                <tr className={`${isSubRow ? 'bg-gray-50' : 'hover:bg-gray-50'} transition-colors ${hasMultipleAccounts ? 'cursor-pointer' : ''}`} 
                    onClick={() => hasMultipleAccounts && toggleRow(asset.ticker)}>
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                        <div className="flex items-center gap-2">
                            {hasMultipleAccounts && !isSubRow && (
                                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            )}
                            {asset.asset_type}
                        </div>
                    </td>
                    <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 ${isSubRow ? 'pl-8 md:pl-12' : ''}`}>
                        {asset.ticker}
                    </td>
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full ${asset.tax_treatment === 'RETIREMENT' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'} font-bold text-[10px]`}>
                            {asset.tax_treatment || 'TAXABLE'}
                        </span>
                    </td>
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {isSubRow ? asset.institution_name : (hasMultipleAccounts ? `${asset.accounts.length} Accounts` : (asset.institution_name || 'Manual'))}
                    </td>
                    
                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                        {asset.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </td>
                    
                    {!isHousing ? (
                        <>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                ${asset.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">
                                ${marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${(asset.daily_change_usd || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {(asset.daily_change_usd || 0) >= 0 ? '+' : ''}${(Math.abs(asset.daily_change_usd || 0) * asset.shares).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span className="text-[10px] ml-1 font-bold opacity-70">({(asset.daily_change_percent || 0).toFixed(2)}%)</span>
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-black">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gainLoss >= 0 ? '+' : ''}${Math.abs(gainLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <div className="text-[10px] font-bold opacity-70">({gainLossPercent.toFixed(2)}%)</div>
                            </td>
                        </>
                    ) : (
                        <>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300">—</td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-black">
                                ${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300">—</td>
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
            const isCashTicker = ['CUR:USD', 'CASH', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX'].includes(asset.ticker);
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
                <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-3 md:mb-4 px-2 md:px-0">{groupName}</h2>
                <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Treatment</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {isLiquidGroup ? 'Balance' : 'Shares'}
                                </th>
                                {!isLiquidGroup && (
                                    <>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost/Sh</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daily</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                                        <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gain/Loss</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                    {assetsInGroup.map((asset) => {
                                if (isLiquidGroup) {
                                    return (
                                        <tr key={asset.plaid_account_id || asset.ticker} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400 uppercase tracking-tight">{asset.asset_type}</td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900">{asset.ticker}</td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                <span className={`px-2 py-0.5 rounded-full ${asset.tax_treatment === 'RETIREMENT' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'} font-bold text-[10px]`}>
                                                    {asset.tax_treatment || 'TAXABLE'}
                                                </span>
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs text-gray-500">{asset.institution_name || 'Manual'}</td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-black">
                                                ${asset.shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                }
                                return renderAssetRow(asset);
                            })}
                        </tbody>
                        {(isLiquidGroup || groupName === 'Investments') && (
                            <tfoot className="bg-gray-50 border-t-2 border-gray-100">
                                <tr className="font-black">
                                    <td colSpan="3" className="px-3 md:px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        {groupName} Total
                                    </td>
                                    <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {isLiquidGroup ? (
                                            `$${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        ) : (
                                            groupTotals.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                        )}
                                    </td>
                                    {!isLiquidGroup && (
                                        <>
                                            <td className="px-3 md:px-6 py-4"></td>
                                            <td className="px-3 md:px-6 py-4"></td>
                                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm ${groupTotals.dailyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {groupTotals.dailyChange >= 0 ? '+' : ''}${Math.abs(groupTotals.dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                ${groupTotals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm ${groupTotals.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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

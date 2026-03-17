import React from 'react';

const DebtTable = ({ debts }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Initial Loan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Paid</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">APY%</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {debts.map((debt) => {
                        const isRevolving = debt.debt_type === 'REVOLVING';
                        return (
                            <tr key={debt.plaid_account_id || debt.name} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <div className="font-bold">{debt.name}</div>
                                    {debt.official_name && debt.official_name !== debt.name && (
                                        <div className="text-[10px] text-gray-400 font-normal uppercase tracking-wider">{debt.official_name}</div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {isRevolving ? '-' : `$${debt.initial_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                                    {isRevolving ? '-' : `$${debt.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold">${debt.remaining_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${debt.monthly_payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-bold">{(debt.interest_rate * 100).toFixed(2)}%</td>
                            </tr>
                        );
                    })}
                </tbody>
                {debts.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-100">
                        <tr className="font-black text-gray-900">
                            <td className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Total Liabilities</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-normal">
                                ${debts.filter(d => d.debt_type !== 'REVOLVING').reduce((sum, d) => sum + (d.initial_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-normal">
                                ${debts.filter(d => d.debt_type !== 'REVOLVING').reduce((sum, d) => sum + (d.amount_paid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-black">
                                ${debts.reduce((sum, d) => sum + (d.remaining_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                ${debts.reduce((sum, d) => sum + (d.monthly_payment || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4"></td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
};

export default DebtTable;
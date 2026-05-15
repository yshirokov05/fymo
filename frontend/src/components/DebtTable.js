import React from 'react';

const fmtMonths = (months) => {
    if (months === null) return null;
    const yrs = Math.floor(months / 12);
    const mo = months % 12;
    if (yrs === 0) return `${mo} mo`;
    if (mo === 0) return `${yrs} yr`;
    return `${yrs} yr ${mo} mo`;
};

const DebtTable = ({ debts }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-700/50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Initial Loan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Amount Paid</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Remaining</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Monthly</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">APY%</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Payoff</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {debts.map((debt) => {
                        const isRevolving = debt.debt_type === 'REVOLVING';

                        // Payoff projection
                        let months = null;
                        let payoffNever = false;
                        if (!isRevolving && debt.monthly_payment > 0 && debt.remaining_balance > 0) {
                            const r = debt.interest_rate / 12;
                            const P = debt.remaining_balance;
                            const M = debt.monthly_payment;
                            if (r === 0) {
                                months = Math.ceil(P / M);
                            } else if (M > r * P) {
                                months = Math.ceil(-Math.log(1 - (r * P / M)) / Math.log(1 + r));
                            } else {
                                payoffNever = true;
                            }
                        }

                        return (
                            <tr key={debt.plaid_account_id || debt.name} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-2.5 text-sm font-medium text-gray-900 dark:text-slate-100 max-w-[160px]">
                                    <div className="font-bold truncate" title={debt.name}>{debt.name}</div>
                                    {debt.official_name && debt.official_name !== debt.name && (
                                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-normal uppercase tracking-wider truncate" title={debt.official_name}>{debt.official_name}</div>
                                    )}
                                </td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                                    {isRevolving || debt.isMargin || !debt.initial_amount
                                        ? <span className="text-gray-300 dark:text-slate-600">—</span>
                                        : `$${debt.initial_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                                    {isRevolving || debt.isMargin || !debt.initial_amount
                                        ? <span className="text-gray-300 dark:text-slate-600">—</span>
                                        : `$${debt.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm text-red-600 dark:text-red-400 font-bold">${debt.remaining_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">${debt.monthly_payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 font-bold">{(debt.interest_rate * 100).toFixed(2)}%</td>
                                <td className="px-6 py-2.5 whitespace-nowrap text-sm">
                                    {isRevolving ? (
                                        <span className="text-gray-400 dark:text-slate-500">—</span>
                                    ) : payoffNever ? (
                                        <span className="text-red-500 dark:text-red-400 font-bold text-xs">Never</span>
                                    ) : months !== null ? (
                                        <span className="font-bold text-blue-600 dark:text-blue-400">{fmtMonths(months)}</span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-slate-500">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                {debts.length > 0 && (
                    <tfoot className="bg-gray-50 dark:bg-slate-700/50 border-t-2 border-gray-100 dark:border-slate-600">
                        <tr className="font-black text-gray-900 dark:text-slate-100">
                            <td className="px-6 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">Total Liabilities</td>
                            <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-400 dark:text-slate-500 font-normal">
                                ${debts.filter(d => d.debt_type !== 'REVOLVING').reduce((sum, d) => sum + (d.initial_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-400 dark:text-slate-500 font-normal">
                                ${debts.filter(d => d.debt_type !== 'REVOLVING').reduce((sum, d) => sum + (d.amount_paid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-2.5 whitespace-nowrap text-sm text-red-600 dark:text-red-400 font-black">
                                ${debts.reduce((sum, d) => sum + (d.remaining_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-2.5 whitespace-nowrap text-sm text-gray-900 dark:text-slate-100">
                                ${debts.reduce((sum, d) => sum + (d.monthly_payment || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-2.5"></td>
                            <td className="px-6 py-2.5"></td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
};

export default DebtTable;

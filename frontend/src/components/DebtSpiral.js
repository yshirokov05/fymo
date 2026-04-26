import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
} from 'recharts';
import { TrendingDown, DollarSign, AlertTriangle, Repeat } from 'lucide-react';

// --- Math Engine: Average Daily Balance Method ---
function simulateDebt(initialBalance, aprPercent, months = 120, extraPayment = 0) {
    const apr = aprPercent / 100;
    let balance = initialBalance;
    let cumulativeInterest = 0;
    const data = [{ month: 0, balance: parseFloat(balance.toFixed(2)), cumulativeInterest: 0 }];

    for (let m = 1; m <= months; m++) {
        if (balance <= 0) {
            data.push({ month: m, balance: 0, cumulativeInterest: parseFloat(cumulativeInterest.toFixed(2)) });
            continue;
        }

        const daysInMonth = 30;
        const dailyRate = apr / 365;
        const interestCharge = balance * dailyRate * daysInMonth;
        const minPayment = Math.max(balance * 0.02, 25);
        const payment = Math.min(minPayment + extraPayment, balance + interestCharge);

        balance = balance + interestCharge - payment;
        cumulativeInterest += interestCharge;
        if (balance < 0.01) balance = 0;

        data.push({
            month: m,
            balance: parseFloat(balance.toFixed(2)),
            cumulativeInterest: parseFloat(cumulativeInterest.toFixed(2)),
        });
    }

    return data;
}

// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl text-sm">
                <p className="text-gray-400 font-bold mb-2">Month {label}</p>
                {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color }} className="font-semibold">
                        {p.name}: <span className="text-white">${p.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// --- Main Component ---
const DebtSpiral = () => {
    const [balance, setBalance] = useState(5000);
    const [apr, setApr] = useState(24.99);
    const [months, setMonths] = useState(60);
    const [extraPayment, setExtraPayment] = useState(0);

    const chartData = useMemo(() => simulateDebt(balance, apr, months, 0), [balance, apr, months]);
    const accelData = useMemo(() => simulateDebt(balance, apr, months, extraPayment), [balance, apr, months, extraPayment]);

    // Min-only stats
    const payoffMonth = chartData.findIndex(d => d.balance === 0);
    const totalMonths = payoffMonth > 0 ? payoffMonth : months;
    const totalInterest = chartData[totalMonths]?.cumulativeInterest ?? chartData[chartData.length - 1]?.cumulativeInterest ?? 0;
    const timesBoughtOver = balance > 0 ? ((totalInterest + balance) / balance).toFixed(1) : 1;
    const stillInDebt = payoffMonth === -1;

    // Accelerated stats
    const accelPayoffMonth = accelData.findIndex(d => d.balance === 0);
    const accelTotalMonths = accelPayoffMonth > 0 ? accelPayoffMonth : months;
    const accelInterest = accelData[accelTotalMonths]?.cumulativeInterest ?? accelData[accelData.length - 1]?.cumulativeInterest ?? 0;
    const interestSaved = Math.max(0, totalInterest - accelInterest);
    const monthsSaved = accelPayoffMonth > 0 && payoffMonth > 0 ? payoffMonth - accelPayoffMonth : 0;

    // Merge min-only and accel into one chart dataset
    const mergedData = chartData.map((d, i) => ({
        ...d,
        balanceAccel: accelData[i]?.balance ?? 0,
        interestAccel: accelData[i]?.cumulativeInterest ?? accelData[accelData.length - 1]?.cumulativeInterest ?? 0,
    }));

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <TrendingDown className="text-red-500" size={32} />
                        Debt Spiral Visualizer
                    </h2>
                    <p className="text-gray-500 mt-1 text-sm">See the true cost of minimum payments. The bank's profit, revealed.</p>
                </div>
            </div>

            {/* Inputs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Current Balance</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                            <input type="number" value={balance} min={100} max={100000}
                                onChange={e => setBalance(parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                            />
                        </div>
                        <input type="range" min={100} max={50000} step={100} value={balance}
                            onChange={e => setBalance(Number(e.target.value))} className="w-full mt-2 accent-red-500" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Avg Credit Card APR</label>
                        <div className="relative">
                            <input type="number" value={apr} min={1} max={50} step={0.01}
                                onChange={e => setApr(parseFloat(e.target.value) || 0)}
                                className="w-full pr-7 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                        </div>
                        <input type="range" min={1} max={40} step={0.5} value={apr}
                            onChange={e => setApr(Number(e.target.value))} className="w-full mt-2 accent-red-500" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Projection Window (Months)</label>
                        <div className="relative">
                            <input type="number" value={months} min={12} max={360} step={12}
                                onChange={e => setMonths(parseInt(e.target.value) || 24)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                            />
                        </div>
                        <input type="range" min={12} max={240} step={12} value={months}
                            onChange={e => setMonths(Number(e.target.value))} className="w-full mt-2 accent-red-500" />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-green-700 uppercase tracking-wider">
                                💚 Extra Monthly Payment
                            </label>
                            <span className="text-xs font-black text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
                                +${extraPayment}/mo
                            </span>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                            <input type="number" value={extraPayment} min={0} max={2000}
                                onChange={e => setExtraPayment(parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-4 py-3 bg-green-50 border border-green-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-green-300 focus:border-green-400 transition-all"
                            />
                        </div>
                        <input type="range" min={0} max={500} step={10} value={extraPayment}
                            onChange={e => setExtraPayment(Number(e.target.value))} className="w-full mt-2 accent-green-500" />
                        <p className="text-[10px] text-gray-400 mt-1">Drag to see how small extra payments slash your payoff timeline</p>
                    </div>
                </div>
            </div>

            {/* Scare Summary */}
            <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-6 text-white shadow-xl shadow-red-200">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={22} className="text-yellow-300 flex-shrink-0" />
                    <h3 className="font-black text-lg uppercase tracking-wider">The Brutal Truth</h3>
                </div>
                <p className="text-red-50 text-base leading-relaxed">
                    If you only pay the minimum on a{' '}
                    <span className="font-black text-white">${Number(balance).toLocaleString()}</span> balance at{' '}
                    <span className="font-black text-white">{apr}% APR</span>, you will pay{' '}
                    <span className="font-black text-yellow-300 text-xl">${totalInterest.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>{' '}
                    in interest{' '}
                    {stillInDebt
                        ? <span>and <span className="font-black text-yellow-200">still not be debt-free</span> after {months} months.</span>
                        : <span>over <span className="font-black text-white">{totalMonths} months</span>.</span>
                    }
                </p>
                <div className="mt-4 flex items-center gap-2 bg-black/20 rounded-xl p-3">
                    <Repeat size={20} className="text-yellow-300 flex-shrink-0" />
                    <p className="font-semibold text-sm text-red-100">
                        You will have effectively bought this item{' '}
                        <span className="text-yellow-300 font-black">{timesBoughtOver}×</span>{' '}
                        over — the bank keeps the rest.
                    </p>
                </div>
            </div>

            {/* Accelerator callout — only show when extra payment > 0 */}
            {extraPayment > 0 && interestSaved > 0 && (
                <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-xl shadow-green-200">
                    <div className="flex items-center gap-2 mb-3">
                        <Repeat size={22} className="text-yellow-300 flex-shrink-0" />
                        <h3 className="font-black text-lg uppercase tracking-wider">Payoff Accelerator</h3>
                    </div>
                    <p className="text-green-50 text-base leading-relaxed">
                        By paying an extra{' '}
                        <span className="font-black text-white">${extraPayment}/mo</span>, you save{' '}
                        <span className="font-black text-yellow-300 text-xl">${interestSaved.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>{' '}
                        in interest
                        {monthsSaved > 0 && (
                            <span> and pay off <span className="font-black text-yellow-300">{monthsSaved} months sooner</span></span>
                        )}.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="bg-black/20 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-green-300 uppercase font-bold tracking-wider mb-1">Interest Saved</p>
                            <p className="text-xl font-black text-white">${interestSaved.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-black/20 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-green-300 uppercase font-bold tracking-wider mb-1">Months Saved</p>
                            <p className="text-xl font-black text-white">{monthsSaved > 0 ? monthsSaved : accelPayoffMonth === -1 ? 'N/A' : '—'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'Original Balance', value: `$${Number(balance).toLocaleString()}`, icon: <DollarSign size={20} />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                    { label: 'Total Interest (Min Only)', value: `$${totalInterest.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: <TrendingDown size={20} />, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
                    { label: 'Payoff Duration (Min Only)', value: stillInDebt ? `${months}+ mo.` : `${totalMonths} mo.`, icon: <AlertTriangle size={20} />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
                ].map((s, i) => (
                    <div key={i} className={`${s.bg} border rounded-2xl p-5 flex items-center gap-4`}>
                        <div className={`${s.color} p-2 rounded-xl bg-white shadow-sm`}>{s.icon}</div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{s.label}</p>
                            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-gray-800 text-lg">Payment Trajectory</h3>
                    {extraPayment > 0 && (
                        <span className="text-xs bg-green-50 border border-green-200 text-green-700 font-bold px-3 py-1 rounded-full">
                            Showing accelerated payoff (+${extraPayment}/mo)
                        </span>
                    )}
                </div>
                <ResponsiveContainer width="100%" height={360}>
                    <LineChart data={mergedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month"
                            label={{ value: 'Month', position: 'insideBottom', offset: -2, fill: '#9ca3af', fontSize: 12 }}
                            tick={{ fill: '#9ca3af', fontSize: 12 }}
                        />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend formatter={(value) => <span className="text-sm font-semibold text-gray-700">{value}</span>} />
                        {payoffMonth > 0 && (
                            <ReferenceLine x={payoffMonth} stroke="#94a3b8" strokeDasharray="4 4"
                                label={{ value: 'Min Paid Off', fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                            />
                        )}
                        {accelPayoffMonth > 0 && extraPayment > 0 && (
                            <ReferenceLine x={accelPayoffMonth} stroke="#22c55e" strokeDasharray="4 4"
                                label={{ value: 'Accel Paid Off', fill: '#22c55e', fontSize: 10, fontWeight: 700 }}
                            />
                        )}
                        <Line type="monotone" dataKey="balance" name="Balance (Min Only)"
                            stroke="#3b82f6" strokeWidth={extraPayment > 0 ? 2 : 3} dot={false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="cumulativeInterest" name="Interest Paid (Min Only)"
                            stroke="#ef4444" strokeWidth={extraPayment > 0 ? 2 : 3} strokeDasharray="6 3" dot={false} activeDot={{ r: 5 }} />
                        {extraPayment > 0 && (
                            <>
                                <Line type="monotone" dataKey="balanceAccel" name={`Balance (+$${extraPayment}/mo)`}
                                    stroke="#22c55e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="interestAccel" name={`Interest Paid (+$${extraPayment}/mo)`}
                                    stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3" dot={false} activeDot={{ r: 5 }} />
                            </>
                        )}
                    </LineChart>
                </ResponsiveContainer>
                <p className="text-center text-xs text-gray-400 mt-3">
                    Average Daily Balance method · Min payment = max(2% of balance, $25) · 24.99% is the current national average APR.
                </p>
            </div>
        </div>
    );
};

export default DebtSpiral;

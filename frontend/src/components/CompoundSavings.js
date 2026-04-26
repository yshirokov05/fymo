import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PiggyBank, DollarSign, Percent, Target } from 'lucide-react';

const fmt = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
};

const CompoundSavings = () => {
    const [monthlyContrib, setMonthlyContrib] = useState(500);
    const [initialBalance, setInitialBalance] = useState(0);
    const [returnRate, setReturnRate] = useState(0.08);
    const [years, setYears] = useState(20);
    const [goalAmount, setGoalAmount] = useState(250000);

    const data = useMemo(() => {
        const rows = [];
        let noGrowth = initialBalance;
        let withGrowth = initialBalance;
        const monthly = returnRate / 12;

        for (let y = 0; y <= years; y++) {
            rows.push({
                year: y,
                withGrowth: Math.round(withGrowth),
                noGrowth: Math.round(noGrowth),
                contributions: Math.round(initialBalance + monthlyContrib * 12 * y),
            });
            // Advance one year
            for (let m = 0; m < 12; m++) {
                withGrowth = withGrowth * (1 + monthly) + monthlyContrib;
                noGrowth += monthlyContrib;
            }
        }
        return rows;
    }, [monthlyContrib, initialBalance, returnRate, years]);

    const final = data[data.length - 1];
    const interestEarned = final.withGrowth - final.contributions;
    const goalYear = data.find(d => d.withGrowth >= goalAmount);
    const totalContributed = final.contributions;

    return (
        <div className="bg-slate-900 text-slate-100 p-6 rounded-xl border border-slate-800 shadow-2xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white flex items-center">
                        <PiggyBank className="mr-2 text-indigo-400" size={26} />
                        Compound Savings Projector
                    </h2>
                    <p className="text-slate-400 text-sm">How much will your savings grow? See how time and returns do the heavy lifting.</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Interest Earned</p>
                    <p className="text-xl font-black text-indigo-400">{fmt(interestEarned)}</p>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-800/30 p-6 rounded-xl border border-slate-800/50">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <DollarSign className="mr-1 h-3 w-3" /> Monthly Contribution
                        </label>
                        <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">${monthlyContrib}/mo</span>
                    </div>
                    <input type="range" min={50} max={5000} step={50} value={monthlyContrib}
                        onChange={e => setMonthlyContrib(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <DollarSign className="mr-1 h-3 w-3" /> Starting Balance
                        </label>
                        <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{fmt(initialBalance)}</span>
                    </div>
                    <input type="range" min={0} max={100000} step={1000} value={initialBalance}
                        onChange={e => setInitialBalance(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Percent className="mr-1 h-3 w-3" /> Annual Return
                        </label>
                        <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{(returnRate * 100).toFixed(1)}%</span>
                    </div>
                    <input type="range" min={0.01} max={0.15} step={0.005} value={returnRate}
                        onChange={e => setReturnRate(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Target className="mr-1 h-3 w-3" /> Savings Goal
                        </label>
                        <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{fmt(goalAmount)}</span>
                    </div>
                    <input type="range" min={10000} max={2000000} step={10000} value={goalAmount}
                        onChange={e => setGoalAmount(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase">Time Horizon</label>
                        <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{years} yrs</span>
                    </div>
                    <input type="range" min={1} max={40} step={1} value={years}
                        onChange={e => setYears(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
                </div>
            </div>

            {/* Chart */}
            <div className="h-[360px] w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="cgGrowth" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="cgContrib" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="year" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}
                            label={{ value: 'Year', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={fmt} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
                        />
                        {goalYear && (
                            <ReferenceLine x={goalYear.year} stroke="#22c55e" strokeDasharray="4 4"
                                label={{ value: `Goal hit: yr ${goalYear.year}`, fill: '#22c55e', fontSize: 10, fontWeight: 700 }} />
                        )}
                        <Area type="monotone" dataKey="contributions" name="Total Contributed"
                            stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#cgContrib)" />
                        <Area type="monotone" dataKey="withGrowth" name="With Compound Growth"
                            stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#cgGrowth)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1">Final Balance</p>
                    <p className="text-2xl font-black text-white">{fmt(final.withGrowth)}</p>
                    <p className="text-slate-400 text-xs mt-1">After {years} years at {(returnRate * 100).toFixed(1)}% return</p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">You Contribute</p>
                    <p className="text-2xl font-black text-white">{fmt(totalContributed)}</p>
                    <p className="text-slate-400 text-xs mt-1">Compound growth adds {fmt(interestEarned)} on top</p>
                </div>
                <div className={`p-4 rounded-xl border ${goalYear ? 'bg-green-500/10 border-green-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                    <p className="text-[10px] font-black uppercase tracking-wider mb-1 text-slate-400">Goal of {fmt(goalAmount)}</p>
                    {goalYear ? (
                        <>
                            <p className="text-2xl font-black text-green-400">Year {goalYear.year}</p>
                            <p className="text-slate-400 text-xs mt-1">You hit your target {years - goalYear.year} yrs early</p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-black text-slate-300">Not reached</p>
                            <p className="text-slate-400 text-xs mt-1">Increase contributions or extend horizon</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompoundSavings;

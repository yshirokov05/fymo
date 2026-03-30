import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Clock, TrendingUp, DollarSign, Percent } from 'lucide-react';

const CostOfWaiting = () => {
    const [monthlyContribution, setMonthlyContribution] = useState(500);
    const [returnRate, setReturnRate] = useState(0.08); // 8% return
    const retirementAge = 65;

    const calculateData = () => {
        const data = [];
        let balance20 = 0;
        let balance30 = 0;
        let balance40 = 0;

        for (let age = 20; age <= retirementAge; age++) {
            if (age > 20) balance20 = balance20 * (1 + returnRate) + (monthlyContribution * 12);
            if (age > 30) balance30 = balance30 * (1 + returnRate) + (monthlyContribution * 12);
            if (age > 40) balance40 = balance40 * (1 + returnRate) + (monthlyContribution * 12);

            data.push({
                age: age,
                StartAt20: Math.round(balance20),
                StartAt30: Math.round(balance30),
                StartAt40: Math.round(balance40),
            });
        }
        return data;
    };

    const data = useMemo(() => calculateData(), [monthlyContribution, returnRate]);

    const final20 = data[data.length - 1].StartAt20;
    const final30 = data[data.length - 1].StartAt30;
    const final40 = data[data.length - 1].StartAt40;

    const costDelay10 = final20 - final30;
    const costDelay20 = final20 - final40;

    const formatCurrency = (val) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
        return `$${val}`;
    };

    return (
        <div className="bg-slate-900 text-slate-100 p-6 rounded-xl border border-slate-800 shadow-2xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white flex items-center">
                        <Clock className="mr-2 text-emerald-500" />
                        The Cost of Waiting
                    </h2>
                    <p className="text-slate-400 text-sm">Visualizing the power of compound interest based on when you start investing.</p>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 bg-slate-800/30 p-6 rounded-xl border border-slate-800/50">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <DollarSign className="mr-2 h-3 w-3" /> Monthly Contribution
                        </label>
                        <span className="text-sm font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">${monthlyContribution}</span>
                    </div>
                    <input 
                        type="range" min="100" max="5000" step="50" 
                        value={monthlyContribution} 
                        onChange={(e) => setMonthlyContribution(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Percent className="mr-2 h-3 w-3" /> Annual Return
                        </label>
                        <span className="text-sm font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">{(returnRate * 100).toFixed(1)}%</span>
                    </div>
                    <input 
                        type="range" min="0.01" max="0.15" step="0.005" 
                        value={returnRate} 
                        onChange={(e) => setReturnRate(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px] w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="color20" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="color30" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="color40" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis 
                            dataKey="age" 
                            stroke="#94a3b8" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false}
                            label={{ value: 'Age', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                        />
                        <YAxis 
                            stroke="#94a3b8" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={formatCurrency}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            formatter={(value) => [`$${value.toLocaleString()}`, '']}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Area type="monotone" dataKey="StartAt20" name="Start at 20" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#color20)" />
                        <Area type="monotone" dataKey="StartAt30" name="Start at 30" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#color30)" />
                        <Area type="monotone" dataKey="StartAt40" name="Start at 40" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#color40)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start space-x-4">
                    <div className="bg-emerald-500 p-2 rounded-lg shrink-0">
                        <TrendingUp className="text-white" size={20} />
                    </div>
                    <div>
                        <h4 className="text-emerald-500 font-bold uppercase text-xs mb-1 tracking-wider">Delaying to 30</h4>
                        <p className="text-slate-100 font-black text-lg">Costs {formatCurrency(costDelay10)}</p>
                        <p className="text-slate-400 text-xs leading-relaxed mt-1">
                            Waiting just 10 years to start investing cuts your final retirement nest egg by more than half.
                        </p>
                    </div>
                </div>

                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-start space-x-4">
                    <div className="bg-rose-500 p-2 rounded-lg shrink-0">
                        <Clock className="text-white" size={20} />
                    </div>
                    <div>
                        <h4 className="text-rose-500 font-bold uppercase text-xs mb-1 tracking-wider">Delaying to 40</h4>
                        <p className="text-slate-100 font-black text-lg">Costs {formatCurrency(costDelay20)}</p>
                        <p className="text-slate-400 text-xs leading-relaxed mt-1">
                            Waiting 20 years to start investing leaves you with only a tiny fraction of what you could have securely built.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CostOfWaiting;

import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Info, TrendingUp, Clock, DollarSign, Calendar, Percent } from 'lucide-react';

const WealthGap = () => {
    // Interactive State
    const [startAge, setStartAge] = useState(20);
    const [monthlyContribution, setMonthlyContribution] = useState(625);
    const [returnRate, setReturnRate] = useState(0.07);
    const retirementAge = 65;

    const annualContribution = monthlyContribution * 12;

    const calculateData = (start, end, contrib, rate) => {
        const years = end - start;
        const data = [];
        let rothBalance = 0;
        let brokeragePreTax = 0;
        const taxDrag = 0.015;
        const capGainsTax = 0.15;
        const effectiveRate = rate - taxDrag;

        for (let i = 0; i <= years; i++) {
            const currentAge = start + i;
            const totalContributed = i * contrib;

            if (i > 0) {
                rothBalance = rothBalance * (1 + rate) + contrib;
                brokeragePreTax = brokeragePreTax * (1 + effectiveRate) + contrib;
            }

            // Brokerage post-tax value (if liquidated at this age)
            const profit = Math.max(0, brokeragePreTax - totalContributed);
            const brokeragePostTax = brokeragePreTax - (profit * capGainsTax);

            data.push({
                age: currentAge,
                roth: Math.round(rothBalance),
                brokerage: Math.round(brokeragePostTax),
                gap: Math.round(rothBalance - brokeragePostTax)
            });
        }
        return data;
    };

    const data = useMemo(() => calculateData(startAge, retirementAge, annualContribution, returnRate), [startAge, retirementAge, annualContribution, returnRate]);
    const delayedData = useMemo(() => calculateData(startAge + 5, retirementAge, annualContribution, returnRate), [startAge, retirementAge, annualContribution, returnRate]);

    // Safety check for empty data
    const lastDataPoint = data[data.length - 1] || { roth: 0, brokerage: 0 };
    const finalRoth = lastDataPoint.roth;
    const finalBrokerage = lastDataPoint.brokerage;
    const wealthGap = finalRoth - finalBrokerage;
    
    const delayedRoth = delayedData.length > 0 ? delayedData[delayedData.length - 1].roth : 0;
    const costOfWaiting = finalRoth - delayedRoth;

    const formatCurrency = (val) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
        return `$${val}`;
    };

    return (
        <div className="bg-slate-900 text-slate-100 p-6 rounded-xl border border-slate-800 shadow-2xl">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white flex items-center">
                        <TrendingUp className="mr-2 text-amber-500" />
                        The Wealth Gap
                    </h2>
                    <p className="text-slate-400 text-sm">Roth IRA vs. Taxable Brokerage over {retirementAge - startAge} years</p>
                </div>
                
                <div className="flex gap-4">
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Final Wealth Gap</p>
                        <p className="text-xl font-black text-amber-500">{formatCurrency(wealthGap)}</p>
                    </div>
                </div>
            </div>

            {/* Controls Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 bg-slate-800/30 p-6 rounded-xl border border-slate-800/50">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Calendar className="mr-2 h-3 w-3" /> Starting Age
                        </label>
                        <span className="text-sm font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">{startAge}</span>
                    </div>
                    <input 
                        type="range" min="18" max="60" step="1" 
                        value={startAge} 
                        onChange={(e) => setStartAge(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <DollarSign className="mr-2 h-3 w-3" /> Monthly Contribution
                        </label>
                        <span className="text-sm font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">${monthlyContribution}</span>
                    </div>
                    <input 
                        type="range" min="0" max="2000" step="50" 
                        value={monthlyContribution} 
                        onChange={(e) => setMonthlyContribution(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center">
                            <Percent className="mr-2 h-3 w-3" /> Annual Return
                        </label>
                        <span className="text-sm font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">{(returnRate * 100).toFixed(1)}%</span>
                    </div>
                    <input 
                        type="range" min="0.01" max="0.15" step="0.005" 
                        value={returnRate} 
                        onChange={(e) => setReturnRate(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>
            </div>

            {/* Chart Section */}
            <div className="h-[400px] w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRoth" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorBrokerage" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
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
                        <Area 
                            type="monotone" 
                            dataKey="roth" 
                            name="Roth IRA" 
                            stroke="#f59e0b" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorRoth)" 
                        />
                        <Area 
                            type="monotone" 
                            dataKey="brokerage" 
                            name="Brokerage" 
                            stroke="#94a3b8" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorBrokerage)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start space-x-4">
                    <div className="bg-amber-500 p-2 rounded-lg shrink-0">
                        <Clock className="text-white" size={20} />
                    </div>
                    <div>
                        <h4 className="text-amber-500 font-bold uppercase text-xs mb-1 tracking-wider">The Cost of Waiting</h4>
                        <p className="text-slate-100 font-black text-lg">-{formatCurrency(costOfWaiting)}</p>
                        <p className="text-slate-400 text-xs leading-relaxed mt-1">
                            By waiting just 5 years to start (Age {startAge + 5} instead of {startAge}), you lose 
                            <span className="text-amber-500 font-bold ml-1">{formatCurrency(costOfWaiting)}</span> in tax-free growth.
                        </p>
                    </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-start space-x-4">
                    <div className="bg-slate-700 p-2 rounded-lg shrink-0">
                        <Info className="text-slate-300" size={20} />
                    </div>
                    <div>
                        <h4 className="text-slate-300 font-bold uppercase text-xs mb-1 tracking-wider">How it works</h4>
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                            The "Wealth Gap" is caused by <span className="text-white font-bold">dividend tax drag (1.5%)</span> and 
                            <span className="text-white font-bold"> Capital Gains tax (15%)</span>. 
                            The Brokerage line reflects the liquidation value after taxes, while the Roth IRA grows and withdrawals 100% tax-free.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WealthGap;

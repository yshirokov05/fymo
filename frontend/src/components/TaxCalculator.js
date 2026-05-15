import React, { useState, useEffect } from 'react';

import TaxDocumentUpload from './TaxDocumentUpload';

const FilingStatus = {
    SINGLE: "Single",
    MARRIED_FILING_JOINTLY: "Married Filing Jointly",
    MARRIED_FILING_SEPARATELY: "Married Filing Separately",
    HEAD_OF_HOUSEHOLD: "Head of Household",
    QUALIFYING_WIDOW: "Qualifying Widow(er)"
};

const USStates = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
    MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
    SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
    WY: "Wyoming"
};

const TaxCalculator = ({
    initialFilingStatus,
    initialState,
    initialEmploymentType = 'W2',
    initialBusinessDeductions = 0,
    initialDependents = 0,
    onSave,
    estimatedFederalTax,
    estimatedStateTax,
    estimatedFicaTax,
    estimatedFedLtcgTax = 0,
    estimatedFedOrdinaryTax = 0,
    realizedStGains = 0,
    realizedLtGains = 0,
    realizedSellCount = 0,
    totalIncome,
    totalWithheldFromPaystubs,
    netPaystubWarning = false,
    selectedYear,
    incomes,
    paystubs = [],
    taxYearDetails = {},
    onUpdateHistoricalIncome
}) => {
    const [filingStatus, setFilingStatus] = useState(initialFilingStatus);
    const [state, setState] = useState(initialState);
    const [employmentType, setEmploymentType] = useState(initialEmploymentType);
    const [businessDeductions, setBusinessDeductions] = useState(initialBusinessDeductions);
    const [dependents, setDependents] = useState(initialDependents);
    const [taxesWithheld, setTaxesWithheld] = useState(0);
    const isHistorical = selectedYear < new Date().getFullYear();
    
    // Find the FIXED_TOTAL income for this year if it exists
    const historicalIncome = incomes?.find(inc => inc.year === selectedYear && inc.income_type === 'FIXED_TOTAL')?.amount || 0;
    const [tempHistorical, setTempHistorical] = useState(historicalIncome);

    useEffect(() => {
        setFilingStatus(initialFilingStatus);
        setState(initialState);
        setEmploymentType(initialEmploymentType);
        setBusinessDeductions(initialBusinessDeductions);
        setDependents(initialDependents);
    }, [initialFilingStatus, initialState, initialEmploymentType, initialBusinessDeductions, initialDependents]);

    useEffect(() => {
        setTempHistorical(historicalIncome);
    }, [historicalIncome, selectedYear]);

    const handleSave = () => {
        onSave({ 
            filing_status: filingStatus, 
            state: state,
            employment_type: employmentType,
            business_deductions: parseFloat(businessDeductions) || 0,
            dependents: parseInt(dependents) || 0
        });
    };

    const handleUploadSuccess = (data) => {
        const totalDocumentTaxes = (data.federal_taxes_withheld || 0) +
                                   (data.state_taxes_withheld || 0) +
                                   (data.social_security_withheld || 0) +
                                   (data.medicare_withheld || 0);
        setTaxesWithheld(prev => prev + totalDocumentTaxes);
    };

    // ── Taxable income sources breakdown ──────────────────────────────────
    const fmt = (n) => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const yearStr = String(selectedYear);
    const grossPaystubs = paystubs.filter(p => p.date && p.date.slice(0, 4) === yearStr && !p.is_net_primary);
    const paystubsByEmployer = {};
    grossPaystubs.forEach(p => {
        const employer = p.employer_name || 'W-2 Wages';
        paystubsByEmployer[employer] = (paystubsByEmployer[employer] || 0) + parseFloat(p.gross_amount || 0);
    });
    const yearManualIncomes = (incomes || []).filter(
        inc => inc.year === selectedYear && !inc.is_net && inc.income_type !== 'FIXED_TOTAL'
    );
    const retirementDeductions = taxYearDetails.retirement_deductions || 0;
    const insuranceDeductions = taxYearDetails.insurance_deductions || 0;
    const netPrimaryDepositsAmt = taxYearDetails.net_primary_deposits || 0;
    const taxableIncome = taxYearDetails.taxable_income || 0;
    const incomeTypeLabel = { ANNUAL_SALARY: 'salary', MONTHLY_SALARY: 'salary', HOURLY: 'wages', DIVIDENDS: 'dividends', CAPITAL_GAINS: 'cap gains' };
    const hasBreakdownData = Object.keys(paystubsByEmployer).length > 0 || yearManualIncomes.length > 0 || realizedStGains !== 0 || realizedLtGains !== 0 || netPrimaryDepositsAmt > 0 || taxableIncome > 0;

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-4">Your Tax Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="filingStatus" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Filing Status</label>
                        <select
                            id="filingStatus"
                            name="filingStatus"
                            value={filingStatus}
                            onChange={(e) => setFilingStatus(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            {Object.entries(FilingStatus).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="state" className="block text-sm font-medium text-gray-700 dark:text-slate-300">State of Residence</label>
                        <select
                            id="state"
                            name="state"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            {Object.entries(USStates).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="employmentType" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Employment Type</label>
                        <select
                            id="employmentType"
                            name="employmentType"
                            value={employmentType}
                            onChange={(e) => setEmploymentType(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            <option value="W2">W-2 Employee</option>
                            <option value="1099">1099 / Contractor</option>
                            <option value="business_owner">Business Owner</option>
                        </select>
                    </div>
                    {(employmentType === '1099' || employmentType === 'business_owner') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Estimated Business Deductions</label>
                            <input 
                                type="number" 
                                value={businessDeductions} 
                                onChange={e => setBusinessDeductions(e.target.value)}
                                className="mt-1 block w-full pl-3 py-2 border-gray-300 rounded-md sm:text-sm border focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="0.00"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Number of Dependents</label>
                        <input 
                            type="number" 
                            min="0"
                            value={dependents} 
                            onChange={e => setDependents(e.target.value)}
                            className="mt-1 block w-full pl-3 py-2 border-gray-300 rounded-md sm:text-sm border focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="0"
                        />
                    </div>
                    {isHistorical && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Annual Taxable Income ({selectedYear})</label>
                            <div className="mt-1 flex space-x-2">
                                <input 
                                    type="number" 
                                    value={tempHistorical} 
                                    onChange={e => setTempHistorical(e.target.value)}
                                    className="block w-full border-gray-300 rounded-md sm:text-sm"
                                    placeholder="Total for year"
                                />
                                <button 
                                    onClick={() => onUpdateHistoricalIncome(tempHistorical)}
                                    className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 px-3 py-1 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-slate-600"
                                >
                                    Set
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        Save Tax Profile
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-4">W-2 / Paystub Data Auto-fill</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Upload documents to verify your already-paid taxes and compute your final return.</p>
                <TaxDocumentUpload onUploadSuccess={handleUploadSuccess} />
                {(taxesWithheld > 0) && (
                    <div className="mt-4 p-4 bg-green-50 rounded-lg text-green-700 border border-green-100 font-medium">
                        Uploaded Taxes Withheld (Credits): <span className="font-bold ml-1">${taxesWithheld.toLocaleString()}</span>
                    </div>
                )}
            </div>

            {hasBreakdownData && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-1">Taxable Income Sources ({selectedYear})</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">How your taxable income was calculated.</p>
                    <div className="space-y-0">
                        {Object.entries(paystubsByEmployer).map(([employer, total]) => (
                            <div key={employer} className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>
                                    <span>{employer}</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">W-2 wages</span>
                                </span>
                                <span className="font-semibold text-gray-800 dark:text-slate-200">+{fmt(total)}</span>
                            </div>
                        ))}
                        {yearManualIncomes.map((inc, i) => (
                            <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                                    <span>{inc.name || 'Other Income'}</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{incomeTypeLabel[inc.income_type] || 'income'}</span>
                                </span>
                                <span className="font-semibold text-gray-800 dark:text-slate-200">+{fmt(inc.amount)}</span>
                            </div>
                        ))}
                        {realizedStGains !== 0 && (
                            <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-orange-400 shrink-0"></span>
                                    <span>Short-term capital gains</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">ordinary income</span>
                                </span>
                                <span className={`font-semibold ${realizedStGains >= 0 ? 'text-gray-800 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}`}>
                                    {realizedStGains >= 0 ? '+' : '-'}{fmt(realizedStGains)}
                                </span>
                            </div>
                        )}
                        {realizedLtGains !== 0 && (
                            <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 shrink-0"></span>
                                    <span>Long-term capital gains</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">pref. rates</span>
                                </span>
                                <span className={`font-semibold ${realizedLtGains >= 0 ? 'text-gray-800 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}`}>
                                    {realizedLtGains >= 0 ? '+' : '-'}{fmt(realizedLtGains)}
                                </span>
                            </div>
                        )}
                        {netPrimaryDepositsAmt > 0 && (
                            <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-500 dark:text-slate-500 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-slate-600 shrink-0"></span>
                                    <span>Net paycheck deposits</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-600 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">already post-tax, not included</span>
                                </span>
                                <span className="font-semibold text-gray-400 dark:text-slate-500 line-through">{fmt(netPrimaryDepositsAmt)}</span>
                            </div>
                        )}
                        {retirementDeductions > 0 && (
                            <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                                    <span>Retirement contributions (401k/IRA)</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">pre-tax deduction</span>
                                </span>
                                <span className="font-semibold text-green-600 dark:text-green-400">-{fmt(retirementDeductions)}</span>
                            </div>
                        )}
                        {insuranceDeductions > 0 && (
                            <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-700/50">
                                <span className="text-gray-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                                    <span>Insurance premiums</span>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">pre-tax deduction</span>
                                </span>
                                <span className="font-semibold text-green-600 dark:text-green-400">-{fmt(insuranceDeductions)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-gray-200 dark:border-slate-600">
                            <span className="font-bold text-gray-900 dark:text-slate-100 text-base">Taxable Income</span>
                            <span className="font-black text-xl text-blue-600 dark:text-blue-400">{fmt(taxableIncome)}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-4">Estimated Tax Liability ({selectedYear})</h3>

                {netPaystubWarning && (
                    <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                        <span className="mt-0.5 shrink-0">⚠️</span>
                        <span>
                            Paychecks were imported as <strong>net deposits</strong> — withholding data missing.
                            Upload a paystub PDF below to auto-fill taxes withheld.
                        </span>
                    </div>
                )}

                <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-700/50">
                        <p className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase mb-1">Projected Total Liability</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-slate-100">${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax).toLocaleString()}</p>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">Federal + State + FICA</p>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-100 dark:border-green-700/50">
                        <p className="text-xs font-black text-green-600 dark:text-green-400 uppercase mb-1">Total Paid YTD (Withholding)</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-slate-100">${((totalWithheldFromPaystubs || 0) + taxesWithheld).toLocaleString()}</p>
                        {((totalWithheldFromPaystubs || 0) + taxesWithheld) === 0 && (
                            <p className="text-[10px] text-amber-600 mt-1">Upload a paystub PDF below to add withholding</p>
                        )}
                    </div>
                </div>
                {/* Realized capital gains breakdown — Phase C */}
                {realizedSellCount > 0 && (realizedStGains !== 0 || realizedLtGains !== 0) && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-700/50 rounded-xl">
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
                            Realized Capital Gains Included ({realizedSellCount} sell{realizedSellCount !== 1 ? 's' : ''})
                        </p>
                        {realizedStGains !== 0 && (
                            <div className="flex justify-between text-sm text-gray-700 dark:text-slate-300">
                                <span>Short-term (taxed as ordinary income)</span>
                                <span className={`font-semibold ${realizedStGains >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                    {realizedStGains >= 0 ? '+' : '-'}${Math.abs(realizedStGains).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}
                        {realizedLtGains !== 0 && (
                            <div className="flex justify-between text-sm text-gray-700 dark:text-slate-300">
                                <span>Long-term (preferential 0/15/20% rates)</span>
                                <span className={`font-semibold ${realizedLtGains >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                    {realizedLtGains >= 0 ? '+' : '-'}${Math.abs(realizedLtGains).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2">
                            Computed via FIFO lot matching across all your linked brokerages.
                        </p>
                    </div>
                )}
                <p className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">Breakdown</p>
                <div className="space-y-1.5">
                    {estimatedFedLtcgTax > 0 ? (
                        <>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600 dark:text-slate-400 pl-3">Federal — Ordinary Income</span>
                                <span className="font-semibold text-red-600 dark:text-red-400">${estimatedFedOrdinaryTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600 dark:text-slate-400 pl-3">Federal — Long-Term Cap Gains</span>
                                <span className="font-semibold text-red-600 dark:text-red-400">${estimatedFedLtcgTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t border-gray-100 dark:border-slate-700 pt-1.5">
                                <span className="font-medium text-gray-800 dark:text-slate-200">Federal Total</span>
                                <span className="font-bold text-red-600 dark:text-red-400">${estimatedFederalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 dark:text-slate-400">Federal</span>
                            <span className="font-bold text-red-600 dark:text-red-400">${estimatedFederalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-slate-400">State</span>
                        <span className="font-bold text-red-600 dark:text-red-400">${estimatedStateTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Payroll (FICA)</span>
                        <span className="font-bold text-red-600 dark:text-red-400">${estimatedFicaTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {((totalWithheldFromPaystubs || 0) + taxesWithheld) > 0 && (
                        <div className="flex justify-between items-center border-t border-gray-100 dark:border-slate-700 pt-2 mt-2 bg-gray-50 dark:bg-slate-700/50 -mx-6 px-6 pb-2 rounded-b-xl">
                            <span className="text-lg font-bold text-gray-800 dark:text-slate-200">Remaining Tax Due/(Refund):</span>
                            <span className={`text-lg font-bold ${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax - (totalWithheldFromPaystubs || 0) - taxesWithheld) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                ${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax - (totalWithheldFromPaystubs || 0) - taxesWithheld).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-4">Note: This is an estimation for informational purposes only and does not constitute tax advice.</p>
            </div>
        </div>
    );
};

export default TaxCalculator;
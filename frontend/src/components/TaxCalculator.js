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
    totalIncome, 
    totalWithheldFromPaystubs,
    selectedYear, 
    incomes, 
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

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Your Tax Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="filingStatus" className="block text-sm font-medium text-gray-700">Filing Status</label>
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
                        <label htmlFor="state" className="block text-sm font-medium text-gray-700">State of Residence</label>
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
                        <label htmlFor="employmentType" className="block text-sm font-medium text-gray-700">Employment Type</label>
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
                            <label className="block text-sm font-medium text-gray-700">Estimated Business Deductions</label>
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
                        <label className="block text-sm font-medium text-gray-700">Number of Dependents</label>
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
                            <label className="block text-sm font-medium text-gray-700">Annual Taxable Income ({selectedYear})</label>
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
                                    className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs font-bold hover:bg-gray-200"
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

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">W-2 / Paystub Data Auto-fill</h3>
                <p className="text-sm text-gray-500 mb-4">Upload documents to verify your already-paid taxes and compute your final return.</p>
                <TaxDocumentUpload onUploadSuccess={handleUploadSuccess} />
                {(taxesWithheld > 0) && (
                    <div className="mt-4 p-4 bg-green-50 rounded-lg text-green-700 border border-green-100 font-medium">
                        Uploaded Taxes Withheld (Credits): <span className="font-bold ml-1">${taxesWithheld.toLocaleString()}</span>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Estimated Tax Liability ({selectedYear})</h3>
                <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-xs font-black text-blue-600 uppercase mb-1">Projected Total Liability</p>
                        <p className="text-2xl font-black text-gray-900">${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax).toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                        <p className="text-xs font-black text-green-600 uppercase mb-1">Total Paid YTD (Withholding)</p>
                        <p className="text-2xl font-black text-gray-900">${(totalWithheldFromPaystubs || 0).toLocaleString()}</p>
                    </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">Detailed Breakdown:</p>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-700">Estimated Federal Tax:</span>
                        <span className="font-bold text-red-600">${estimatedFederalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-700">Estimated State Tax:</span>
                        <span className="font-bold text-red-600">${estimatedStateTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-700">Estimated Payroll Tax (FICA):</span>
                        <span className="font-bold text-red-600">${estimatedFicaTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 mt-2">
                        <span className="text-lg font-bold text-gray-800">Total Estimated Tax:</span>
                        <span className="text-lg font-bold text-red-600">${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {taxesWithheld > 0 && (
                        <div className="flex justify-between items-center border-t pt-2 mt-2 bg-gray-50 -mx-6 px-6 pb-2 rounded-b-xl">
                            <span className="text-lg font-bold text-gray-800">Remaining Tax Due/(Refund):</span>
                            <span className={`text-lg font-bold ${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax - taxesWithheld) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                ${(estimatedFederalTax + estimatedStateTax + estimatedFicaTax - taxesWithheld).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-4">Note: This is an estimation for informational purposes only and does not constitute tax advice.</p>
            </div>
        </div>
    );
};

export default TaxCalculator;
import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Budgeting from './components/Budgeting';
import Income from './components/Income';
import Insurance from './components/Insurance';
import AIAnalyst from './components/AIAnalyst';
import Settings from './components/Settings';
import CheckTracker from './components/CheckTracker';
import EditPortfolio from './components/EditPortfolio';
import TaxCalculator from './components/TaxCalculator';
import Visualizations from './components/Visualizations';
import axios from 'axios';
import Layout from './components/Layout';
import Modal from './components/Modal';
import Login from './components/Login';
import DataPrivacyFAQ from './components/DataPrivacyFAQ';
import Goals from './components/Goals';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import Onboarding from './components/Onboarding';
import FeedbackModal from './components/FeedbackModal';
import StatementUpload from './components/StatementUpload';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './components/Toast';
import { RefreshCw, CreditCard, Upload } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600">Something went wrong.</h1>
          <p className="text-gray-600 mt-2">{this.state.error?.message}</p>
          <button 
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function MainContent({ isGuest, onResetGuest, showOnboarding, setShowOnboarding }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  console.log("FHQ Dashboard v1.2.1 [Final Fix]");
  const [activeView, setActiveView] = useState('dashboard');
  const [netWorth, setNetWorth] = useState(0);
  const [assets, setAssets] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [debts, setDebts] = useState([]);
  const [retirementAccounts, setRetirementAccounts] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [paystubs, setPaystubs] = useState([]);
  const [outstandingChecks, setOutstandingChecks] = useState([]);
  const [selectedTaxYear, setSelectedTaxYear] = useState(2026);
  const [taxDetails, setTaxDetails] = useState({});
  const [plaidItems, setPlaidItems] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [taxLiability, setTaxLiability] = useState({
    total: 0,
    federal: 0,
    state: 0,
    fica: 0,
    withheld: 0,
    has_net_only_income: false
  });
  const [userTaxInfo, setUserTaxInfo] = useState({ filing_status: 'SINGLE', state: 'CA', employment_type: 'W2', business_deductions: 0, dependents: 0 });
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [ignoredSubscriptionMerchants, setIgnoredSubscriptionMerchants] = useState([]);
  const [manualSubscriptionMerchants, setManualSubscriptionMerchants] = useState([]);
  const [ignoredFlexibleCategories, setIgnoredFlexibleCategories] = useState([]);
  const [, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('income');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchData = async () => {
    // Guard: Don't fetch until auth is resolved
    if (!isGuest && !currentUser) {
      return;
    }
    
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken(true);
            headers = {
              headers: { Authorization: `Bearer ${token}` }
            };
        }
        
        // [v1.2.1] Stability Fix: Increased timeout to 45s for production cold starts
        const response = await axios.get('/api/net_worth', {
            ...headers,
            timeout: 45000 
        });
        setAssets(response.data.assets || []);
        setIncomes(response.data.incomes || []);
        setDebts(response.data.debts || []);
        setRetirementAccounts(response.data.retirement_accounts || []);
        setInsurances(response.data.insurances || []);
        setTransactions(response.data.transactions || []);
        setBudgets(response.data.budgets || []);
        setPaystubs(response.data.paystubs || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
        setPlaidItems(response.data.plaid_items || []);
        setNetWorth(response.data.real_time_net_worth);
        setTaxDetails(response.data.tax_details || {});
        
        setIsPremium(response.data.is_subscribed || response.data.is_authorized || false);
        
        setHasCompletedOnboarding(response.data.has_completed_onboarding || false);
        setCustomCategories(response.data.custom_categories || []);
        setIgnoredSubscriptionMerchants(response.data.ignored_subscription_merchants || []);
        setManualSubscriptionMerchants(response.data.manual_subscription_merchants || []);
        setIgnoredFlexibleCategories(response.data.ignored_flexible || []);
        
        const yearData = response.data.tax_details?.[selectedTaxYear] || {
            federal_tax: 0,
            state_tax: 0,
            fica_tax: 0,
            total_tax: 0
        };

        setTaxLiability({
            total: yearData.total_tax,
            federal: yearData.federal_tax,
            state: yearData.state_tax,
            fica: yearData.fica_tax,
            withheld: yearData.total_withheld || 0,
            has_net_only_income: yearData.has_net_only_income || false
        });
        setUserTaxInfo({
            filing_status: response.data.filing_status,
            state: response.data.state,
            employment_type: response.data.employment_type || 'W2',
            business_deductions: response.data.business_deductions || 0,
            dependents: response.data.dependents || 0
        });
        setLoading(false);
        
        // Detect fresh user
        const isFresh = (response.data.assets?.length === 0 && 
                         response.data.incomes?.length === 0 && 
                         response.data.debts?.length === 0 && 
                         response.data.paystubs?.length === 0 &&
                         (response.data.has_completed_onboarding === false));
        if (isFresh) {
          setShowOnboarding(true);
        }
    } catch (error) {
        console.error("fetchData error:", error);
        setError(error.message);
        setLoading(false);
    }
  };

  useEffect(() => {
    if (taxDetails[selectedTaxYear]) {
        const yearData = taxDetails[selectedTaxYear];
        setTaxLiability({
            total: yearData.total_tax,
            federal: yearData.federal_tax,
            state: yearData.state_tax,
            fica: yearData.fica_tax,
            withheld: yearData.total_withheld || 0,
            has_net_only_income: yearData.has_net_only_income || false
        });
    }
  }, [selectedTaxYear, taxDetails]);

  useEffect(() => {
    if (isGuest) {
        // Force premium for guest/demo mode
        setIsPremium(true);
    }
  }, [currentUser, isGuest]);

  useEffect(() => {
    // Only fetch when auth is resolved (currentUser is set) or in guest mode
    if (currentUser || isGuest) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, isGuest]);

  const handleSave = async (portfolioData) => {
    setLoading(true);
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken(true);
            headers = {
              headers: { Authorization: `Bearer ${token}` }
            };
        }
        const response = await axios.put('/api/portfolio', portfolioData, headers);
        // ... (data setting)
        setAssets(response.data.assets || []);
        setIncomes(response.data.incomes || []);
        setDebts(response.data.debts || []);
        setRetirementAccounts(response.data.retirement_accounts || []);
        setInsurances(response.data.insurances || []);
        setTransactions(response.data.transactions || []);
        setBudgets(response.data.budgets || []);
        setPaystubs(response.data.paystubs || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
        setPlaidItems(response.data.plaid_items || []);
        setNetWorth(response.data.real_time_net_worth);
        setTaxDetails(response.data.tax_details || {});
        setIsPremium(response.data.is_subscribed || response.data.is_authorized || false);

        const yearData = response.data.tax_details?.[selectedTaxYear] || {
            federal_tax: 0,
            state_tax: 0,
            fica_tax: 0,
            total_tax: 0
        };

        setTaxLiability({
          total: yearData.total_tax,
          federal: yearData.federal_tax,
          state: yearData.state_tax,
          fica: yearData.fica_tax,
          withheld: yearData.total_withheld || 0
        });
        setUserTaxInfo({
            filing_status: response.data.filing_status,
            state: response.data.state,
            employment_type: response.data.employment_type || 'W2',
            business_deductions: response.data.business_deductions || 0,
            dependents: response.data.dependents || 0
        });
        setIsModalOpen(false);
        setLoading(false);
        setError(null);
    } catch (error) {
        const msg = error.response?.data?.error || error.message;
        showToast(msg, "error");
        setError(msg);
        setLoading(false);
    }
  };

  const handleSaveTaxInfo = async (taxData) => {
    setLoading(true);
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken(true);
            headers = {
              headers: { Authorization: `Bearer ${token}` }
            };
        }
        const response = await axios.put('/api/user_tax_info', taxData, headers);
        setNetWorth(response.data.real_time_net_worth);
        setTaxDetails(response.data.tax_details || {});

        const yearData = response.data.tax_details?.[selectedTaxYear] || {
            federal_tax: 0,
            state_tax: 0,
            fica_tax: 0,
            total_tax: 0
        };

        setTaxLiability({
          total: yearData.total_tax,
          federal: yearData.federal_tax,
          state: yearData.state_tax,
          fica: yearData.fica_tax,
          withheld: yearData.total_withheld || 0
        });
        setUserTaxInfo({
            filing_status: response.data.filing_status,
            state: response.data.state,
            employment_type: response.data.employment_type || 'W2',
            business_deductions: response.data.business_deductions || 0,
            dependents: response.data.dependents || 0
        });
        setLoading(false);
        setError(null);
    } catch (error) {
        const msg = error.response?.data?.error || error.message;
        showToast(msg, "error");
        setError(msg);
        setLoading(false);
    }
  };

  const handlePlaidSuccess = (data) => {
    // If the API returns the full state, we update everything immediately
    if (data && data.assets) {
        setAssets(data.assets);
        setIncomes(data.incomes);
        setDebts(data.debts);
        setRetirementAccounts(data.retirement_accounts || []);
        setInsurances(data.insurances || []);
        setPlaidItems(data.plaid_items || []);
        setBudgets(data.budgets || []);
        setTransactions(data.transactions || []);
        setPaystubs(data.paystubs || []);
        setOutstandingChecks(data.outstanding_checks || []);
        setNetWorth(data.real_time_net_worth);
        setTaxDetails(data.tax_details || {});
        setIsPremium(data.is_subscribed || data.is_authorized || false);
    } else {
        fetchData();
    }
  };

  const handlePlaidSync = async () => {
    setIsSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
        const token = await currentUser.getIdToken(true);
        const response = await axios.post('/api/plaid_sync', {}, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        handlePlaidSuccess(response.data);
        setIsSyncing(false);
        setSyncMessage({ type: 'success', text: '✅ Sync successful!' });
        setTimeout(() => setSyncMessage(null), 5000);
    } catch (error) {
        clearTimeout(timeoutId);
        let msg = error.response?.data?.error || error.message;
        if (error.name === 'CanceledError' || error.name === 'AbortError') {
            msg = "Connection timed out. The server is taking too long to respond. Please try again in 1 minute.";
        }
        setSyncMessage({ type: 'error', text: `❌ Sync failed: ${msg}` });
        setIsSyncing(false);
        setTimeout(() => setSyncMessage(null), 10000); // Leave error visible longer
    }
  };


  const handleSaveCustomCategories = async (cats) => {
      try {
          let headers = {};
          if (!isGuest && currentUser) {
              const token = await currentUser.getIdToken();
              headers = {
                  headers: { Authorization: `Bearer ${token}` }
              };
          }
          const response = await axios.put('/api/portfolio', { custom_categories: cats }, headers);
          setCustomCategories(response.data.custom_categories || []);
          showToast("Categories updated successfully!", "success");
      } catch (err) {
          showToast("Failed to save categories: " + err.message, "error");
      }
  };

  const handleSaveBudgets = async (newBudgets) => {
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken();
            headers = {
                headers: { Authorization: `Bearer ${token}` }
            };
        }
        const response = await axios.put('/api/portfolio', { budgets: newBudgets }, headers);
        // Handle both partial response (budget-only fast path) and full response
        if (response.data.success && response.data.budgets) {
            setBudgets(response.data.budgets);
        } else {
            setBudgets(response.data.budgets || []);
        }
        showToast("Budgets saved successfully!", "success");
    } catch (error) {
        showToast("Failed to save budgets: " + (error.response?.data?.error || error.message), "error");
    }
  };


  const handleUpdateIgnoredFlexible = async (cats) => {
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken();
            headers = { headers: { Authorization: `Bearer ${token}` } };
        }
        const response = await axios.put('/api/portfolio', { ignored_flexible: cats }, headers);
        setIgnoredFlexibleCategories(response.data.ignored_flexible || []);
    } catch (error) {
        showToast("Failed to update ignored categories", "error");
    }
  };

  const handleUpdateHistoricalIncome = async (amount) => {
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken();
            headers = {
                headers: { Authorization: `Bearer ${token}` }
            };
        }
        // Remove ANY existing income for the historical year to avoid duplicates
        const otherIncomes = incomes.filter(inc => inc.year !== selectedTaxYear);
        const newIncome = {
            income_type: 'FIXED_TOTAL',
            amount: parseFloat(amount) || 0,
            year: selectedTaxYear
        };
        const updatedIncomes = [...otherIncomes, newIncome];
        
        const response = await axios.put('/api/portfolio', { incomes: updatedIncomes }, headers);
        
        // Refresh all state from the response
        setAssets(response.data.assets || []);
        setIncomes(response.data.incomes || []);
        setDebts(response.data.debts || []);
        setRetirementAccounts(response.data.retirement_accounts || []);
        setInsurances(response.data.insurances || []);
        setPaystubs(response.data.paystubs || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
        setNetWorth(response.data.real_time_net_worth);
        setTaxDetails(response.data.tax_details || {});
        
        showToast(`Successfully set ${selectedTaxYear} income to $${parseFloat(amount).toLocaleString()}`, "success");
    } catch (error) {
        console.error("Historical update error:", error);
        const msg = error.response?.data?.error || error.message;
        showToast("Failed to update historical income: " + msg, "error");
        setError(msg);
    }
  };

  const openEditModal = (tab = 'income') => {
    setModalTab(tab);
    setIsModalOpen(true);
  };

  const handleInitializeSampleData = async () => {
    setLoading(true);
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken(true);
            headers = {
              headers: { Authorization: `Bearer ${token}` }
            };
        }
        const response = await axios.post('/api/initialize_sample_data', {}, headers);
        setAssets(response.data.assets || []);
        setIncomes(response.data.incomes || []);
        setDebts(response.data.debts || []);
        setRetirementAccounts(response.data.retirement_accounts || []);
        setInsurances(response.data.insurances || []);
        setNetWorth(response.data.real_time_net_worth);
        setTaxDetails(response.data.tax_details || {});
        
        setShowOnboarding(false);
        setLoading(false);
    } catch (error) {
        showToast("Failed to initialize sample data: " + (error.response?.data?.error || error.message), "error");
        setLoading(false);
    }
  };

  if (loading && !isModalOpen) {
    return <Layout activeView={activeView} setActiveView={setActiveView}><div>Loading...</div></Layout>;
  }

  const handleSavePaystubs = async (newPaystubs) => {
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken();
            headers = {
              headers: { Authorization: `Bearer ${token}` }
            };
        }
        const response = await axios.put('/api/portfolio', { paystubs: newPaystubs }, headers);
        setPaystubs(response.data.paystubs || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
        setOutstandingChecks(response.data.outstanding_checks || []);
    } catch (error) {
        setError("Failed to save paystubs: " + error.message);
    }
  };

  
  const handleSaveChecks = async (data) => {
    try {
        let headers = {};
        if (!isGuest && currentUser) {
            const token = await currentUser.getIdToken();
            headers = { headers: { Authorization: `Bearer ${token}` } };
        }
        const response = await axios.put('/api/portfolio', data, headers);
        setOutstandingChecks(response.data.outstanding_checks || []);
    } catch (error) {
        setError("Failed to save checks: " + error.message);
    }
  };

  const renderContent = () => {
    const YearSelector = () => (
        <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg">
            {[2025, 2026].map(year => (
                <button
                    key={year}
                    onClick={() => setSelectedTaxYear(year)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        selectedTaxYear === year 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {year}
                </button>
            ))}
        </div>
    );

    switch (activeView) {
      case 'dashboard':
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold text-gray-800">Financial Dashboard</h2>
                    <div className="flex items-center space-x-4">
                        {syncMessage && (
                            <div className={`px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm ${syncMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {syncMessage.text}
                            </div>
                        )}
                        {plaidItems.length > 0 && (
                            <button 
                                onClick={handlePlaidSync}
                                disabled={isSyncing}
                                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                                    isSyncing 
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                }`}
                            >
                                <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
                                <span>{isSyncing ? "Syncing..." : "Sync Plaid"}</span>
                            </button>
                        )}
                    </div>
                </div>
                <Dashboard
                    netWorth={netWorth}
                    assets={assets}
                    debts={debts}
                    taxLiability={taxLiability}
                    transactions={transactions}
                    incomes={incomes}
                    isGuest={isGuest}
                    hasCompletedOnboarding={hasCompletedOnboarding}
                />
            </div>
        );
      case 'insurance':
          return (
            <Insurance 
              insurances={insurances} 
              onSaveInsurances={(i) => handleSave({ insurances: i })} 
            />
          );
      case 'investments':
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Investment Portfolio</h2>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
               <div className="flex justify-between items-center mb-6">
                  <p className="text-gray-600">Total Asset Value: <span className="font-bold text-blue-600">${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(assets.reduce((acc, a) => acc + (a.shares * (a.current_price || a.cost_basis/a.shares || 0)), 0))}</span></p>
                  <button onClick={() => openEditModal('investments')} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Manage Assets</button>
               </div>
               <Dashboard assets={assets} debts={[]} netWorth={0} hideSummary />
            </div>
          </div>
        );
      case 'debts':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800">Debts & Liabilities</h2>
                <button 
                    onClick={() => setIsUploadOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
                >
                    <Upload size={18} />
                    <span>Import Statement</span>
                </button>
            </div>
               <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                   <div className="flex justify-between items-center mb-8">
                       <div>
                           <h3 className="text-lg font-bold text-gray-800">Total Snapshot</h3>
                           <p className="text-gray-500 text-sm">Overview of your outstanding liabilities.</p>
                       </div>
                       <p className="text-gray-600">Total Debt Balance: <span className="font-bold text-red-600">${debts.reduce((acc, d) => acc + d.remaining_balance, 0).toLocaleString()}</span></p>
                   </div>
                   
                   {debts.length > 0 ? (
                       <Dashboard debts={debts} assets={assets} netWorth={0} hideSummary hideAssetSections={true} showDebtAllocation={true} />
                   ) : (
                       <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                           <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                               <CreditCard className="text-red-500" size={32} />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 mb-2">No Debts Tracked Yet</h3>
                           <p className="text-gray-500 max-w-sm mx-auto mb-8">
                               Add your credit cards, loans, or mortgages to see your debt-to-asset ratio and plan your payoff strategy.
                           </p>
                           <button 
                               onClick={() => openEditModal('debts')} 
                               className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1"
                           >
                               + Add Your First Debt
                           </button>
                       </div>
                   )}
               </div>
          </div>
        );
      case 'budget':
          return (
              <Budgeting
                budgets={budgets}
                transactions={transactions}
                onSaveBudgets={handleSaveBudgets}
                currentUser={currentUser}
                customCategories={customCategories}
                onSaveCustomCategories={handleSaveCustomCategories}
                fetchData={fetchData}
                ignoredSubscriptions={ignoredSubscriptionMerchants}
                manualSubscriptions={manualSubscriptionMerchants}
                setIgnoredSubscriptions={setIgnoredSubscriptionMerchants}
                setManualSubscriptions={setManualSubscriptionMerchants}
                ignoredFlexible={ignoredFlexibleCategories}
                onUpdateIgnoredFlexible={handleUpdateIgnoredFlexible}
                onImportStatement={() => setIsUploadOpen(true)}
              />
          );
      case 'advisor':
          return <AIAnalyst isPremium={isPremium} onUpgrade={() => setActiveView('settings')} />;
      case 'income':
          return (
              <Income 
                paystubs={paystubs} 
                onSavePaystubs={handleSavePaystubs} 
                otherIncomes={incomes}
                onSaveOtherIncomes={(i) => handleSave({ incomes: i })}
                transactions={transactions}
              />
          );
      case 'taxes':
        const yearPaystubs = paystubs.filter(p => new Date(p.date).getFullYear() === selectedTaxYear);
        const totalPaystubsGross = yearPaystubs.reduce((acc, p) => acc + parseFloat(p.gross_amount || 0), 0);
        const totalAnnualIncome = incomes.filter(inc => inc.year === selectedTaxYear).reduce((acc, inc) => acc + inc.amount, 0) + totalPaystubsGross;
        // Warn if any paystub is marked net-primary but has no withholding data
        const hasNetPaystubsWithNoWithholding = yearPaystubs.some(p => p.is_net_primary && !(parseFloat(p.tax_withheld) > 0));
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold text-gray-800">Tax Estimation</h2>
                    <YearSelector />
                </div>
                <TaxCalculator
                    initialFilingStatus={userTaxInfo.filing_status}
                    initialState={userTaxInfo.state}
                    initialEmploymentType={userTaxInfo.employment_type}
                    initialBusinessDeductions={userTaxInfo.business_deductions}
                    initialDependents={userTaxInfo.dependents}
                    onSave={handleSaveTaxInfo}
                    estimatedFederalTax={taxLiability.federal}
                    estimatedStateTax={taxLiability.state}
                    estimatedFicaTax={taxLiability.fica}
                    totalWithheldFromPaystubs={taxLiability.withheld}
                    netPaystubWarning={hasNetPaystubsWithNoWithholding}
                    totalIncome={totalAnnualIncome}
                    selectedYear={selectedTaxYear}
                    incomes={incomes}
                    onUpdateHistoricalIncome={handleUpdateHistoricalIncome}
                />
            </div>
        );
      
      case 'checks':
          return (
              <CheckTracker
                  outstandingChecks={outstandingChecks}
                  assets={assets}
                  onDataUpdate={(data) => { if(data.outstanding_checks) setOutstandingChecks(data.outstanding_checks); }}
                  saveUserData={handleSaveChecks}
              />
          );
      case 'settings':
          return (
              <Settings 
                isGuest={isGuest} 
                onResetGuest={onResetGuest} 
                isPremium={isPremium} 
                plaidItems={plaidItems} 
                fetchData={fetchData} 
                handlePlaidSync={handlePlaidSync}
                onPlaidSuccess={handlePlaidSuccess}
                isSyncing={isSyncing}
                syncMessage={syncMessage}
                customCategories={customCategories}
                onSaveCustomCategories={handleSaveCustomCategories}
              />
          );
      case 'goals':
          return <Goals currentUser={currentUser} />;
      case 'faq':
          return <DataPrivacyFAQ />;
      case 'privacy':
          return <PrivacyPolicy />;
      case 'terms':
          return <TermsOfService />;
      case 'visualizations':
          return <Visualizations />;
      default:
        return <div>Coming Soon...</div>;
    }
  };

  if (showOnboarding) {
    return (
        <Onboarding 
            onComplete={async () => {
                if (!isGuest && currentUser) {
                    try {
                        const token = await currentUser.getIdToken();
                        await axios.put('/api/user/onboarding_complete', {}, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        setHasCompletedOnboarding(true);
                    } catch (err) {
                        console.error("Failed to mark onboarding complete", err);
                    }
                }
                setShowOnboarding(false);
                setActiveView('dashboard'); // Redirect to dashboard after completion
            }} 
            onInitializeSample={handleInitializeSampleData}
            onSavePortfolio={handleSave}
            onSavePaystubs={handleSavePaystubs}
        />
    );
  }

  return (
    <Layout activeView={activeView} setActiveView={setActiveView} isPremium={isPremium} onOpenFeedback={() => setIsFeedbackOpen(true)}>
      {renderContent()}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Edit Portfolio">
        <EditPortfolio 
            onSave={handleSave} 
            assets={assets} 
            incomes={incomes} 
            debts={debts} 
            retirementAccounts={retirementAccounts} 
            insurances={insurances}
            initialTab={modalTab} 
        /> 
      </Modal>
      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        userEmail={currentUser?.email}
        uid={currentUser?.uid || 'guest'}
      />
      <StatementUpload 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        onUploadSuccess={() => fetchData()} 
      />
    </Layout>
  );
}

function App() {
    const { currentUser } = useAuth();
    const [isGuest, setIsGuest] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        const handleGuest = () => setIsGuest(true);
        window.addEventListener('continue-as-guest', handleGuest);
        
        const handleStartOnboarding = () => setShowOnboarding(true);
        window.addEventListener('start-onboarding', handleStartOnboarding);

        return () => {
            window.removeEventListener('continue-as-guest', handleGuest);
            window.removeEventListener('start-onboarding', handleStartOnboarding);
        };
    }, []);

    return (
        <ErrorBoundary>
            {(currentUser || isGuest) ? (
                <MainContent 
                  isGuest={isGuest} 
                  onResetGuest={() => setIsGuest(false)} 
                  showOnboarding={showOnboarding}
                  setShowOnboarding={setShowOnboarding}
                />
            ) : (
                <Login />
            )}
        </ErrorBoundary>
    );
}

export default function Root() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}

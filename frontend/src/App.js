import React, { useState, useEffect, Suspense, lazy } from 'react';
import './App.css';
// Eager imports — these are on the critical initial-paint path or used as
// inline subcomponents on the Dashboard / Investments tabs. Lazy-loading
// them would just defer their fetch by one tick and yield no real win.
import Dashboard from './components/Dashboard';
import InvestmentsSummary from './components/InvestmentsSummary';
import RealizedGainsTable from './components/RealizedGainsTable';
import TaxLossHarvest from './components/TaxLossHarvest';
import PortfolioCalendar from './components/PortfolioCalendar';
import Layout from './components/Layout';
import Modal from './components/Modal';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import FirstRunChecklist from './components/FirstRunChecklist';
import MilestoneCelebration from './components/MilestoneCelebration';
import HealthScoreCard from './components/HealthScoreCard';
import axios from 'axios';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './components/Toast';
import { RefreshCw, CreditCard, Upload, Loader2 } from 'lucide-react';

// Lazy-loaded route components — each ships as its own chunk and is only
// fetched when the user navigates to that view. Big wins on first paint
// since the bundle no longer includes AI Analyst's markdown renderer,
// Visualizations' chart code, EditPortfolio's tab machinery, etc. on
// the initial download.
const Budgeting     = lazy(() => import('./components/Budgeting'));
const Income        = lazy(() => import('./components/Income'));
const Insurance     = lazy(() => import('./components/Insurance'));
const AIAnalyst     = lazy(() => import('./components/AIAnalyst'));
const Settings      = lazy(() => import('./components/Settings'));
const CheckTracker  = lazy(() => import('./components/CheckTracker'));
const EditPortfolio = lazy(() => import('./components/EditPortfolio'));
const TaxCalculator = lazy(() => import('./components/TaxCalculator'));
const Visualizations = lazy(() => import('./components/Visualizations'));
const Subscriptions = lazy(() => import('./components/Subscriptions'));
const DataPrivacyFAQ = lazy(() => import('./components/DataPrivacyFAQ'));
const Goals         = lazy(() => import('./components/Goals'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const FeedbackModal = lazy(() => import('./components/FeedbackModal'));
const StatementUpload = lazy(() => import('./components/StatementUpload'));

// Centered spinner shown while a lazy chunk is loading. Sized to fill the
// content area so the layout doesn't jump as the tab swaps in.
const RouteFallback = () => (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <Loader2 className="text-blue-500 animate-spin" size={32} />
    </div>
);

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
  const [investmentHistory, setInvestmentHistory] = useState(null);
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [taxLiability, setTaxLiability] = useState({
    total: 0,
    federal: 0,
    state: 0,
    fica: 0,
    withheld: 0,
    has_net_only_income: false
  });

  // Single source of truth for the taxLiability state shape — used by every
  // setTaxLiability call site so adding a new field in the future only needs one edit.
  // yearData is what comes back in response.data.tax_details[year].
  const buildTaxLiability = (yearData = {}) => ({
    total: yearData.total_tax || 0,
    federal: yearData.federal_tax || 0,
    state: yearData.state_tax || 0,
    fica: yearData.fica_tax || 0,
    withheld: yearData.total_withheld || 0,
    has_net_only_income: yearData.has_net_only_income || false,
    realized_st_gains: yearData.realized_st_gains || 0,
    realized_lt_gains: yearData.realized_lt_gains || 0,
    realized_sell_count: yearData.realized_sell_count || 0,
    fed_ltcg_tax: yearData.fed_ltcg_tax || 0,
    fed_ordinary_tax: yearData.fed_ordinary_tax || 0,
    // Bases + per-source breakdown for the show-math panel
    fica_wage_base: yearData.fica_wage_base || 0,
    ordinary_taxable_for_fed: yearData.ordinary_taxable_for_fed || 0,
    state_taxable_income: yearData.state_taxable_income || 0,
    standard_deduction: yearData.standard_deduction || 0,
    net_primary_deposits: yearData.net_primary_deposits || 0,
    income_sources: yearData.income_sources || [],
  });
  const [userTaxInfo, setUserTaxInfo] = useState({ filing_status: 'SINGLE', state: 'CA', employment_type: 'W2', business_deductions: 0, dependents: 0 });
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [goalsCount, setGoalsCount] = useState(0);
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
  const [newlyCrossedMilestone, setNewlyCrossedMilestone] = useState(null);

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
        if (response.data.investment_history) setInvestmentHistory(response.data.investment_history);
        if (response.data.newly_crossed_milestone) {
            setNewlyCrossedMilestone(response.data.newly_crossed_milestone);
        }

        setHasCompletedOnboarding(response.data.has_completed_onboarding || false);
        setCustomCategories(response.data.custom_categories || []);

        // Lightweight goals count fetch (non-blocking) so Dashboard checklist
        // reflects reality on initial load without needing to mount Goals tab.
        if (!isGuest && currentUser) {
            axios.get('/api/goals', headers)
                .then(r => setGoalsCount((r.data.goals || []).length))
                .catch(() => {}); // silent — not critical

            // Portfolio history for net worth sparkline (non-blocking)
            axios.get('/api/portfolio_history', headers)
                .then(r => setPortfolioHistory(r.data.history || []))
                .catch(() => {}); // silent — not critical
        }
        setIgnoredSubscriptionMerchants(response.data.ignored_subscription_merchants || []);
        setManualSubscriptionMerchants(response.data.manual_subscription_merchants || []);
        setIgnoredFlexibleCategories(response.data.ignored_flexible || []);
        
        const yearData = response.data.tax_details?.[selectedTaxYear] || {
            federal_tax: 0,
            state_tax: 0,
            fica_tax: 0,
            total_tax: 0
        };

        setTaxLiability(buildTaxLiability(yearData));
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
        setTaxLiability(buildTaxLiability(taxDetails[selectedTaxYear]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Handle Stripe redirect back to the app after checkout or portal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session === 'success') {
      showToast('Welcome to Fymo Premium! Your subscription is now active.', 'success');
      // Strip the query param so it doesn't re-fire on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
      // Re-fetch so isPremium flips to true immediately
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        setTaxLiability(buildTaxLiability(yearData));
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

  const handleUpdateCostBasis = async (assetId, newCostBasisPerShare) => {
    // Optimistic local update so the UI feels instant
    const prevAssets = assets;
    setAssets(prev => prev.map(a =>
        a.plaid_account_id === assetId ? { ...a, cost_basis: newCostBasisPerShare } : a
    ));
    try {
        const headers = isGuest || !currentUser
            ? {}
            : { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
        await axios.patch('/api/asset/cost_basis', {
            plaid_account_id: assetId,
            cost_basis_per_share: newCostBasisPerShare,
        }, headers);
    } catch (err) {
        // Roll back on failure and surface the error
        setAssets(prevAssets);
        const msg = err.response?.data?.error || 'Failed to update cost basis';
        showToast(msg, 'error');
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

        setTaxLiability(buildTaxLiability(yearData));
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
        if (data.investment_history) setInvestmentHistory(data.investment_history);
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
          await axios.put('/api/portfolio', { custom_categories: cats }, headers);
          setCustomCategories(cats);
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

  // ── User capabilities: what features actually apply to THIS user? ──
  // Drives conditional rendering throughout the app so users don't see tabs/cards for
  // features they don't use. "Junk elimination" — if you have no investments, you don't
  // need a Portfolio Return card, an Investments tab, or a Dividends row in Income.
  const capabilities = {
    hasLinkedBank: (plaidItems || []).length > 0,
    hasInvestments:
      (assets || []).some(a => (a.asset_type === 'STOCK' || a.asset_type === 'CRYPTO') && (a.shares || 0) > 0)
      || ((investmentHistory?.current_value || 0) > 0),
    hasDebts: (debts || []).length > 0,
    hasInsurance: (insurances || []).length > 0,
    hasPayroll: (paystubs || []).length > 0,
    hasIncome: (incomes || []).length > 0 || (paystubs || []).length > 0,
    hasChecks: (outstandingChecks || []).length > 0,
    hasTransactions: (transactions || []).length > 0,
    hasAnyFinancialData:
      (assets || []).length > 0 || (debts || []).length > 0 || (incomes || []).length > 0 ||
      (paystubs || []).length > 0 || (insurances || []).length > 0 || (plaidItems || []).length > 0,
  };

  if (loading && !isModalOpen) {
    return <Layout activeView={activeView} setActiveView={setActiveView} capabilities={capabilities}><div>Loading...</div></Layout>;
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

        // Refresh tax projection too — net_primary changes affect what's counted as
        // gross income, so federal/state/FICA need to recompute.
        if (response.data.tax_details) {
            const yearData = response.data.tax_details[selectedTaxYear] || {};
            setTaxLiability(buildTaxLiability(yearData));
        }
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
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Financial Dashboard</h2>
                    <div className="flex items-center gap-2 sm:space-x-4 flex-wrap">
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
                <FirstRunChecklist
                    capabilities={capabilities}
                    isPremium={isPremium}
                    onGoToView={setActiveView}
                    onTrySample={handleInitializeSampleData}
                    hasGoals={goalsCount > 0}
                />
                {!isGuest && (capabilities.hasIncome || capabilities.hasInvestments) && (
                    <HealthScoreCard />
                )}
                <Dashboard
                    netWorth={netWorth}
                    assets={assets}
                    debts={debts}
                    taxLiability={taxLiability}
                    transactions={transactions}
                    incomes={incomes}
                    paystubs={paystubs}
                    isGuest={isGuest}
                    hasCompletedOnboarding={hasCompletedOnboarding}
                    onUpdateCostBasis={handleUpdateCostBasis}
                    investmentHistory={investmentHistory}
                    portfolioHistory={portfolioHistory}
                    capabilities={capabilities}
                    onOpenEdit={openEditModal}
                    onOpenLink={() => setActiveView('settings')}
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
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Investment Portfolio</h2>
              <button onClick={() => openEditModal('investments')} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap self-start sm:self-auto">Manage Assets</button>
            </div>
            {assets.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="text-blue-500" size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No investments tracked yet</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto mb-8">
                  Connect your brokerage via Plaid or manually add holdings to see your portfolio performance, cost basis, and sector allocation.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => openEditModal('investments')}
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                  >
                    + Add Holdings Manually
                  </button>
                  <button
                    onClick={() => setActiveView('settings')}
                    className="border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 px-6 py-2.5 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Connect via Plaid
                  </button>
                </div>
              </div>
            ) : (
              <>
                <InvestmentsSummary
                  assets={assets}
                  investmentHistory={investmentHistory}
                  portfolioHistory={portfolioHistory}
                />
                <PortfolioCalendar />
                <Dashboard
                  assets={assets}
                  debts={[]}
                  netWorth={0}
                  hideSummary
                  investmentHistory={investmentHistory}
                  portfolioHistory={portfolioHistory}
                />
                {investmentHistory?.realized_gains && (
                  <RealizedGainsTable realizedGains={investmentHistory.realized_gains} />
                )}
                {investmentHistory?.tax_loss_harvest && (
                  <TaxLossHarvest harvest={investmentHistory.tax_loss_harvest} />
                )}
              </>
            )}
          </div>
        );
      case 'debts':
        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Debts & Liabilities</h2>
                <button
                    onClick={() => setIsUploadOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium whitespace-nowrap self-start sm:self-auto"
                >
                    <Upload size={18} />
                    <span>Import Statement</span>
                </button>
            </div>
               <div className="bg-white dark:bg-slate-800 p-4 sm:p-8 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
                   <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 sm:mb-8">
                       <div>
                           <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Total Snapshot</h3>
                           <p className="text-gray-500 dark:text-gray-400 text-sm">Overview of your outstanding liabilities.</p>
                       </div>
                       <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base">Total Debt Balance: <span className="font-bold text-red-600">${debts.reduce((acc, d) => acc + d.remaining_balance, 0).toLocaleString()}</span></p>
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
                investmentHistory={investmentHistory}
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
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Tax Estimation</h2>
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
                    estimatedFedLtcgTax={taxLiability.fed_ltcg_tax}
                    estimatedFedOrdinaryTax={taxLiability.fed_ordinary_tax}
                    realizedStGains={taxLiability.realized_st_gains}
                    realizedLtGains={taxLiability.realized_lt_gains}
                    realizedSellCount={taxLiability.realized_sell_count}
                    totalWithheldFromPaystubs={taxLiability.withheld}
                    netPaystubWarning={hasNetPaystubsWithNoWithholding}
                    totalIncome={totalAnnualIncome}
                    selectedYear={selectedTaxYear}
                    incomes={incomes}
                    paystubs={paystubs}
                    taxYearDetails={taxDetails[selectedTaxYear] || {}}
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
          return <Goals currentUser={currentUser} onGoalsCountChange={setGoalsCount} />;
      case 'faq':
          return <DataPrivacyFAQ />;
      case 'privacy':
          return <PrivacyPolicy />;
      case 'terms':
          return <TermsOfService />;
      case 'visualizations':
          return <Visualizations />;
      case 'subscriptions':
          return <Subscriptions />;
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
    <Layout activeView={activeView} setActiveView={setActiveView} isPremium={isPremium} onOpenFeedback={() => setIsFeedbackOpen(true)} capabilities={capabilities}>
      <Suspense fallback={<RouteFallback />}>
        {renderContent()}
      </Suspense>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Edit Portfolio">
        <Suspense fallback={<RouteFallback />}>
          <EditPortfolio
              onSave={handleSave}
              assets={assets}
              incomes={incomes}
              debts={debts}
              retirementAccounts={retirementAccounts}
              insurances={insurances}
              initialTab={modalTab}
          />
        </Suspense>
      </Modal>
      {/* FeedbackModal + StatementUpload are lazy: only their chunk is fetched
          when the modal is actually opened, keeping initial bundle lean. */}
      {isFeedbackOpen && (
        <Suspense fallback={null}>
          <FeedbackModal
            isOpen={isFeedbackOpen}
            onClose={() => setIsFeedbackOpen(false)}
            userEmail={currentUser?.email}
            uid={currentUser?.uid || 'guest'}
          />
        </Suspense>
      )}
      {isUploadOpen && (
        <Suspense fallback={null}>
          <StatementUpload
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onUploadSuccess={() => fetchData()}
          />
        </Suspense>
      )}
      <MilestoneCelebration milestone={newlyCrossedMilestone} />
    </Layout>
  );
}

function App() {
    const { currentUser } = useAuth();
    const [isGuest, setIsGuest] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    // Landing page can deep-link to Privacy / Terms before auth
    const [landingView, setLandingView] = useState(null); // null | 'privacy' | 'terms'

    useEffect(() => {
        const handleGuest = () => setIsGuest(true);
        window.addEventListener('continue-as-guest', handleGuest);

        const handleStartOnboarding = () => setShowOnboarding(true);
        window.addEventListener('start-onboarding', handleStartOnboarding);

        // Events fired by LandingPage footer links
        const handlePrivacy = () => setLandingView('privacy');
        const handleTerms = () => setLandingView('terms');
        window.addEventListener('nav-privacy', handlePrivacy);
        window.addEventListener('nav-terms', handleTerms);

        // Guest mode: "Sign Up Free" CTA from any component resets guest state → LandingPage
        const handleOpenAuth = () => setIsGuest(false);
        window.addEventListener('fymo:open-auth', handleOpenAuth);

        return () => {
            window.removeEventListener('continue-as-guest', handleGuest);
            window.removeEventListener('start-onboarding', handleStartOnboarding);
            window.removeEventListener('nav-privacy', handlePrivacy);
            window.removeEventListener('nav-terms', handleTerms);
            window.removeEventListener('fymo:open-auth', handleOpenAuth);
        };
    }, []);

    if (landingView === 'privacy') {
        return (
            <ErrorBoundary>
                <div className="min-h-screen bg-slate-900 text-white">
                    <div className="p-4">
                        <button onClick={() => setLandingView(null)}
                            className="text-sm text-blue-400 hover:text-blue-300 mb-6 inline-block">
                            ← Back
                        </button>
                    </div>
                    <PrivacyPolicy />
                </div>
            </ErrorBoundary>
        );
    }
    if (landingView === 'terms') {
        return (
            <ErrorBoundary>
                <div className="min-h-screen bg-slate-900 text-white">
                    <div className="p-4">
                        <button onClick={() => setLandingView(null)}
                            className="text-sm text-blue-400 hover:text-blue-300 mb-6 inline-block">
                            ← Back
                        </button>
                    </div>
                    <TermsOfService />
                </div>
            </ErrorBoundary>
        );
    }

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
                <LandingPage />
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

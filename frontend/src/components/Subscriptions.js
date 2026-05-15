import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Repeat, AlertCircle, EyeOff, Eye, TrendingDown, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

/**
 * Subscriptions
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects recurring subscription charges from transaction history and surfaces
 * them in two buckets:
 *   • Active — charged in the last 45 days
 *   • Inactive — last charge >45 days ago (possibly cancelled or forgotten)
 *
 * Backend (`subscription_service.py`) does the cadence + amount-consistency
 * clustering; this component just renders.
 */

const fmtMoney = (n, fractionDigits = 2) => `$${n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
})}`;

const Stat = ({ label, value, accent = 'neutral', icon }) => {
    const accentClass = {
        neutral: 'text-gray-800 dark:text-slate-100',
        warning: 'text-amber-600 dark:text-amber-400',
        critical: 'text-red-600 dark:text-red-400',
    }[accent];
    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
                {icon && <span className="text-gray-400 dark:text-slate-500">{icon}</span>}
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">{label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${accentClass} truncate`}>{value}</div>
        </div>
    );
};

const SubscriptionRow = ({ sub, onIgnore, flagged }) => {
    const daysAgo = sub.days_since_last_charge;
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">{sub.merchant_display}</span>
                    {flagged === 'possibly_cancelled' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 px-2 py-0.5 rounded-md">possibly cancelled</span>
                    )}
                    {flagged === 'possibly_forgotten' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 px-2 py-0.5 rounded-md">possibly forgotten</span>
                    )}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-3 flex-wrap">
                    <span>{sub.category}</span>
                    <span>·</span>
                    <span>{sub.charge_count} charges over {sub.median_cadence_days}d cadence</span>
                    <span>·</span>
                    <span>last: {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}</span>
                </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                    <div className="text-base font-bold tabular-nums text-gray-900 dark:text-slate-100">
                        {fmtMoney(sub.monthly_amount)}<span className="text-xs font-normal text-gray-500 dark:text-slate-400">/mo</span>
                    </div>
                    <div className="text-[11px] tabular-nums text-gray-500 dark:text-slate-400">
                        {fmtMoney(sub.annual_amount, 0)}/yr
                    </div>
                </div>
                {onIgnore && (
                    <button
                        onClick={() => onIgnore(sub)}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700"
                        title="Hide — not a subscription"
                    >
                        <EyeOff size={15} />
                    </button>
                )}
            </div>
        </div>
    );
};

const Subscriptions = () => {
    const { currentUser, isGuest } = useAuth();
    const { showToast } = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showIgnoredManager, setShowIgnoredManager] = useState(false);

    const fetchSubs = useCallback(async () => {
        try {
            const headers = isGuest || !currentUser
                ? {}
                : { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
            const r = await axios.get('/api/subscriptions', headers);
            setData(r.data);
        } catch (err) {
            showToast(err.response?.data?.error || 'Failed to load subscriptions', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [currentUser, isGuest, showToast]);

    useEffect(() => { fetchSubs(); }, [fetchSubs]);

    const handleIgnore = async (sub) => {
        if (isGuest) {
            showToast('Sign in to manage subscriptions', 'warning');
            return;
        }
        try {
            const token = await currentUser.getIdToken();
            await axios.post('/api/subscriptions/ignore',
                { merchant_normalized: sub.merchant_normalized },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            showToast(`Hid "${sub.merchant_display}"`, 'success');
            fetchSubs();
        } catch (err) {
            showToast(err.response?.data?.error || 'Failed to hide subscription', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <RefreshCw className="text-blue-500 animate-spin" size={32} />
            </div>
        );
    }

    const summary = data?.summary || {};
    const active = data?.active || [];
    const inactive = data?.inactive || [];
    const hasAny = active.length > 0 || inactive.length > 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Subscriptions</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        Recurring monthly charges detected from your transaction history.
                    </p>
                </div>
                <button
                    onClick={() => { setRefreshing(true); fetchSubs(); }}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium whitespace-nowrap self-start sm:self-auto disabled:opacity-60"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Summary stats */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-6">
                <Stat
                    label="Active subscriptions"
                    value={summary.active_count || 0}
                    icon={<Repeat size={12} />}
                />
                <Stat
                    label="Monthly total"
                    value={fmtMoney(summary.total_monthly_active || 0, 0)}
                    accent="warning"
                />
                <Stat
                    label="Annual total"
                    value={fmtMoney(summary.total_annual_active || 0, 0)}
                    accent="critical"
                />
                <Stat
                    label="Possibly forgotten"
                    value={summary.inactive_count || 0}
                    accent={summary.inactive_count > 0 ? 'warning' : 'neutral'}
                    icon={<AlertCircle size={12} />}
                />
            </div>

            {!hasAny && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 p-12 text-center">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Repeat className="text-blue-500" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No recurring charges detected</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
                        We didn't find any recurring monthly charges in your transaction history.
                        If you connect a bank account via Plaid, we'll re-scan automatically.
                    </p>
                </div>
            )}

            {active.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 dark:text-slate-100">Active</h3>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{active.length} {active.length === 1 ? 'subscription' : 'subscriptions'}</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                        {active.map(sub => (
                            <SubscriptionRow key={sub.merchant_normalized} sub={sub} onIgnore={handleIgnore} />
                        ))}
                    </div>
                </div>
            )}

            {inactive.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-amber-500/20 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 flex items-center gap-2">
                        <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
                        <h3 className="font-bold text-gray-900 dark:text-slate-100">Possibly cancelled or forgotten</h3>
                        <span className="text-xs text-gray-500 dark:text-slate-400 ml-auto">{inactive.length} {inactive.length === 1 ? 'subscription' : 'subscriptions'}</span>
                    </div>
                    <div className="px-6 py-3 text-xs text-gray-500 dark:text-slate-400 bg-amber-50/30 dark:bg-amber-500/5 border-b border-amber-100 dark:border-amber-500/10">
                        These looked like subscriptions but haven't been charged in over 45 days. Either you cancelled them, or they auto-renew annually — worth checking.
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                        {inactive.map(sub => (
                            <SubscriptionRow key={sub.merchant_normalized} sub={sub} onIgnore={handleIgnore} flagged={sub.flag} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Subscriptions;

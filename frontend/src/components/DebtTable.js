import React, { useState } from 'react';
import axios from 'axios';
import { Sparkles, Loader2, RefreshCw, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Margin loans / settlement balances are debts but NOT credit cards. The backend
 * tags them with a `margin*`-prefixed plaid_account_id (margin_, margin_bal_,
 * margin_calc_); the Dashboard's synthetic ones carry an `isMargin` flag. Either
 * signal means: don't offer the "What is this card?" AI summary or a card rename.
 */
const isMarginDebt = (debt) =>
    debt.isMargin === true ||
    (typeof debt.plaid_account_id === 'string' && debt.plaid_account_id.startsWith('margin'));

/**
 * DebtTable — card-based layout for the user's outstanding debts.
 *
 * Replaces the previous wide table that needed horizontal scrolling on most
 * laptop widths. Each debt renders as its own card; cards stack on mobile and
 * use a 2-column grid on wide screens.
 *
 * Credit-card rows include a "What is this card?" affordance that calls
 * `/api/debts/card_summary` and returns a No-BS AI summary covering annual
 * fee, key perks (with $ value), best uses, weak points, and worth-keeping
 * verdict. Results are cached server-side per (user, official_name) so we
 * don't hit Claude on every render.
 */

const fmtMonths = (months) => {
    if (months === null || months === undefined) return null;
    const yrs = Math.floor(months / 12);
    const mo = months % 12;
    if (yrs === 0) return `${mo} mo`;
    if (mo === 0) return `${yrs} yr`;
    return `${yrs} yr ${mo} mo`;
};

const fmtMoney = (n, opts = {}) =>
    `$${(n || 0).toLocaleString(undefined, {
        minimumFractionDigits: opts.cents === false ? 0 : 2,
        maximumFractionDigits: opts.cents === false ? 0 : 2,
    })}`;

const Stat = ({ label, value, accent = 'text-gray-800 dark:text-slate-100' }) => (
    <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-0.5">
            {label}
        </div>
        <div className={`text-sm font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
);

const DebtCard = ({ debt, onRename }) => {
    const { currentUser, isGuest, promptSignIn } = useAuth();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cardLabel, setCardLabel] = useState('');   // user-typed exact card name
    const [showLabelInput, setShowLabelInput] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(debt.name || '');

    const isMargin = isMarginDebt(debt);
    // Revolving = the balance revolves (card OR margin) — drives payoff/progress display.
    const isRevolving = debt.debt_type === 'REVOLVING';
    // Card = a real credit card (revolving AND not a margin/settlement balance) —
    // the only kind that gets the "What is this card?" AI summary.
    const isCard = isRevolving && !isMargin;
    // Rename is only meaningful for persisted (non-margin) debts, for signed-in users.
    // Plaid often reports only the rewards program ("Ultimate Rewards") rather than
    // the actual card product, so let the user set the real name — it persists and
    // survives Plaid re-sync (manual-name preservation in plaid_service).
    const canRename = !isMargin && !isGuest && typeof onRename === 'function';

    const submitRename = () => {
        const trimmed = nameDraft.trim();
        if (trimmed && trimmed !== debt.name) {
            onRename(debt, trimmed);
        }
        setEditingName(false);
    };

    // Payoff projection (loans only — credit cards have no fixed payoff curve)
    let payoffMonths = null;
    let payoffNever = false;
    if (!isRevolving && debt.monthly_payment > 0 && debt.remaining_balance > 0) {
        const r = (debt.interest_rate || 0) / 12;
        const P = debt.remaining_balance;
        const M = debt.monthly_payment;
        if (r === 0) {
            payoffMonths = Math.ceil(P / M);
        } else if (M > r * P) {
            payoffMonths = Math.ceil(-Math.log(1 - (r * P / M)) / Math.log(1 + r));
        } else {
            payoffNever = true;
        }
    }

    // Progress for non-revolving loans
    const initial = debt.initial_amount || 0;
    const paid = debt.amount_paid || 0;
    const showProgress = !isRevolving && initial > 0 && !isMargin;
    const paidPct = showProgress ? Math.min(100, Math.max(0, (paid / initial) * 100)) : 0;

    // Resolve the most-informative name to display in the small subtitle.
    // We want the FULL official Plaid name (e.g. "Ultimate Rewards® …4321") to
    // be visible — not truncated — so the user can compare it to their wallet.
    const subtitle = debt.official_name && debt.official_name !== debt.name
        ? debt.official_name
        : null;

    const aprLabel = debt.interest_rate
        ? `${(debt.interest_rate * 100).toFixed(2)}%`
        : <span className="text-gray-300 dark:text-slate-600">—</span>;

    const fetchSummary = async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = {};
            if (!isGuest && currentUser) {
                const token = await currentUser.getIdToken(true);
                headers.Authorization = `Bearer ${token}`;
            }
            const res = await axios.post('/api/debts/card_summary', {
                name: debt.name,
                official_name: debt.official_name || debt.name,
                user_label: cardLabel.trim() || undefined,
            }, { headers, timeout: 30000 });
            setSummary(res.data.summary || 'No summary available.');
        } catch (e) {
            const status = e.response?.status;
            if (status === 429) {
                setError('Rate limit reached — try again in a bit.');
            } else if (status === 503) {
                setError('AI service is currently unavailable.');
            } else {
                setError('Could not load summary.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl p-5 hover:shadow-md hover:border-gray-200 dark:hover:border-slate-600 transition-all">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0 flex-1">
                    {editingName ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                type="text"
                                autoFocus
                                value={nameDraft}
                                onChange={e => setNameDraft(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') submitRename();
                                    if (e.key === 'Escape') { setNameDraft(debt.name || ''); setEditingName(false); }
                                }}
                                placeholder="e.g. Chase Sapphire Reserve"
                                className="min-w-0 flex-1 px-2 py-1 text-sm font-bold border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={submitRename}
                                title="Save name"
                                className="shrink-0 text-green-600 dark:text-green-400 hover:text-green-700"
                            >
                                <Check size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setNameDraft(debt.name || ''); setEditingName(false); }}
                                title="Cancel"
                                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 group/name">
                            <span className="font-black text-gray-900 dark:text-slate-100 text-base leading-tight">
                                {debt.name}
                            </span>
                            {canRename && (
                                <button
                                    type="button"
                                    onClick={() => { setNameDraft(debt.name || ''); setEditingName(true); }}
                                    title="Rename card"
                                    className="shrink-0 text-gray-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover/name:opacity-100 focus:opacity-100 transition-opacity"
                                >
                                    <Pencil size={13} />
                                </button>
                            )}
                        </div>
                    )}
                    {subtitle && (
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-1 break-words">
                            {subtitle}
                        </div>
                    )}
                </div>
                <div className="text-right shrink-0">
                    <div className="text-xl font-black text-red-600 dark:text-red-400 tabular-nums">
                        {fmtMoney(debt.remaining_balance)}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-0.5">
                        Remaining
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                <Stat label="APR" value={aprLabel} accent="text-orange-600 dark:text-orange-400" />
                <Stat
                    label={isRevolving ? 'Min payment' : 'Monthly'}
                    value={fmtMoney(debt.monthly_payment)}
                />
                <Stat
                    label="Payoff"
                    value={
                        isRevolving
                            ? <span className="text-gray-400 dark:text-slate-500 font-normal text-xs">Revolving</span>
                            : payoffNever
                                ? <span className="text-red-500 dark:text-red-400">Never</span>
                                : payoffMonths !== null
                                    ? <span className="text-blue-600 dark:text-blue-400">{fmtMonths(payoffMonths)}</span>
                                    : <span className="text-gray-300 dark:text-slate-600">—</span>
                    }
                />
            </div>

            {/* Progress bar — loans only */}
            {showProgress && (
                <div className="mt-4">
                    <div className="flex justify-between items-baseline text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                        <span>Paid {fmtMoney(paid, { cents: false })}</span>
                        <span className="font-black text-gray-700 dark:text-slate-200">{paidPct.toFixed(1)}%</span>
                        <span>of {fmtMoney(initial, { cents: false })}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all"
                            style={{ width: `${paidPct}%` }}
                        />
                    </div>
                </div>
            )}

            {/* AI No-BS card summary — real credit cards only (never margin/settlement) */}
            {isCard && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/60">
                    {!summary && !error && (
                        isGuest ? (
                            <button
                                type="button"
                                onClick={() => promptSignIn()}
                                title="Sign in to use AI features"
                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1.5"
                            >
                                <Sparkles size={12} />
                                <span>Sign in for AI card summary</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={fetchSummary}
                                disabled={loading}
                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {loading
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Sparkles size={12} />}
                                <span>{loading ? 'Analyzing card…' : 'What is this card? (No-BS summary)'}</span>
                            </button>
                        )
                    )}
                    {error && (
                        <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <AlertCircle size={12} className="mt-[1px] shrink-0" />
                            <span>
                                {error}{' '}
                                <button
                                    type="button"
                                    onClick={fetchSummary}
                                    className="underline font-bold hover:no-underline"
                                >
                                    Try again
                                </button>
                            </span>
                        </div>
                    )}
                    {summary && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-black">
                                    <Sparkles size={10} />
                                    <span>No-BS Card Summary</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchSummary}
                                    disabled={loading}
                                    title="Refresh summary"
                                    className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                                >
                                    {loading
                                        ? <Loader2 size={11} className="animate-spin" />
                                        : <RefreshCw size={11} />}
                                </button>
                            </div>
                            <div className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                                {summary}
                            </div>
                            {/* Override: Plaid sometimes only gives the rewards program
                                ("Ultimate Rewards"), so let the user name the exact card. */}
                            {!showLabelInput ? (
                                <button
                                    type="button"
                                    onClick={() => setShowLabelInput(true)}
                                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Not the right card? Tell us the exact one →
                                </button>
                            ) : (
                                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                    <input
                                        type="text"
                                        value={cardLabel}
                                        onChange={e => setCardLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') fetchSummary(); }}
                                        placeholder="e.g. Chase Sapphire Preferred"
                                        className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={fetchSummary}
                                        disabled={loading || !cardLabel.trim()}
                                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        Re-analyze
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const DebtTable = ({ debts = [], onRename }) => {
    if (debts.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500 text-sm">
                No debts recorded.
            </div>
        );
    }

    const totalRemaining = debts.reduce((s, d) => s + (d.remaining_balance || 0), 0);
    const totalMonthly = debts.reduce((s, d) => s + (d.monthly_payment || 0), 0);
    const revolvingCount = debts.filter(d => d.debt_type === 'REVOLVING').length;
    const loanCount = debts.length - revolvingCount;

    return (
        <div>
            {/* Card grid — stacks on mobile, 2-col at lg+ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {debts.map((debt) => (
                    <DebtCard key={debt.plaid_account_id || debt.name} debt={debt} onRename={onRename} />
                ))}
            </div>

            {/* Totals footer */}
            <div className="mt-5 pt-4 border-t-2 border-gray-100 dark:border-slate-700/60 flex flex-wrap items-baseline justify-between gap-4 text-sm">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-black">
                    {debts.length} {debts.length === 1 ? 'account' : 'accounts'}
                    {revolvingCount > 0 && loanCount > 0 && (
                        <span className="ml-2 font-normal text-gray-400 dark:text-slate-500 normal-case">
                            ({revolvingCount} revolving · {loanCount} loan{loanCount !== 1 ? 's' : ''})
                        </span>
                    )}
                </div>
                <div className="flex items-baseline gap-6">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-bold">Monthly</span>
                        <span className="font-black text-gray-700 dark:text-slate-200 tabular-nums">{fmtMoney(totalMonthly)}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-bold">Total remaining</span>
                        <span className="font-black text-red-600 dark:text-red-400 tabular-nums">{fmtMoney(totalRemaining)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DebtTable;

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X, ChevronRight, Sparkles, Link as LinkIcon, DollarSign, Target, Zap } from 'lucide-react';

/**
 * FirstRunChecklist
 * Shown at top of Dashboard when the user is partially set up. Progress-aware:
 * hides itself once everything is checked, and stays dismissed via localStorage.
 *
 * Goal: give new users a clear "what's next" without forcing them back into the
 * full Onboarding flow they already dismissed.
 *
 * Props:
 *   capabilities: object — hasLinkedBank, hasInvestments, hasIncome, hasGoals (optional)
 *   isPremium: bool — gate Plaid step
 *   onGoToView: (viewId) => void — route to the relevant tab
 *   onTrySample: () => void — initialize sample data
 *   hasGoals: bool — optional, passed separately since capabilities doesn't track goals yet
 */
const FirstRunChecklist = ({ capabilities = {}, isPremium, onGoToView, onTrySample, hasGoals = false }) => {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setDismissed(localStorage.getItem('fhq_checklist_dismissed') === '1');
    }, []);

    const steps = [
        isPremium
            ? {
                id: 'link',
                label: 'Link a bank or brokerage',
                sublabel: 'Auto-sync balances, transactions, and holdings via Plaid.',
                done: !!capabilities.hasLinkedBank,
                icon: <LinkIcon size={18} />,
                action: () => onGoToView && onGoToView('settings'),
                actionLabel: 'Link account',
            }
            : {
                id: 'assets',
                label: 'Add your first asset',
                sublabel: 'Cash, stocks, real estate — track what you own.',
                done: !!capabilities.hasInvestments || !!capabilities.hasLinkedBank,
                icon: <LinkIcon size={18} />,
                action: () => onGoToView && onGoToView('investments'),
                actionLabel: 'Add asset',
            },
        {
            id: 'income',
            label: 'Add an income source',
            sublabel: 'Salary, freelance, or paste a paystub — powers tax projections.',
            done: !!capabilities.hasIncome,
            icon: <DollarSign size={18} />,
            action: () => onGoToView && onGoToView('income'),
            actionLabel: 'Add income',
        },
        {
            id: 'goal',
            label: 'Set a financial goal',
            sublabel: 'Emergency fund, house down payment, early retirement — get AI guidance.',
            done: !!hasGoals,
            icon: <Target size={18} />,
            action: () => onGoToView && onGoToView('goals'),
            actionLabel: 'Set goal',
        },
    ];

    const completed = steps.filter(s => s.done).length;
    const allDone = completed === steps.length;
    const hasAnyProgress = completed > 0;

    // Hide entirely once user has dismissed or finished
    if (dismissed || allDone) return null;

    const handleDismiss = () => {
        localStorage.setItem('fhq_checklist_dismissed', '1');
        setDismissed(true);
    };

    const pct = Math.round((completed / steps.length) * 100);

    return (
        <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border border-indigo-100 dark:border-slate-700 rounded-2xl p-5 mb-6 shadow-sm relative">
            <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1 rounded-md hover:bg-white/50"
                title="Dismiss"
            >
                <X size={16} />
            </button>

            <div className="flex items-start space-x-3 mb-4">
                <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 flex-shrink-0">
                    <Sparkles size={20} className="text-white" />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
                        {hasAnyProgress ? `You're ${pct}% set up` : "Let's get your dashboard populated"}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Finish these steps to unlock your full financial picture.
                    </p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mb-4 overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>

            <div className="space-y-2">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                            step.done
                                ? 'bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30'
                                : 'bg-white/60 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500/30'
                        }`}
                    >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {step.done ? (
                                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                            ) : (
                                <Circle size={20} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-bold ${step.done ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                                    {step.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {step.sublabel}
                                </p>
                            </div>
                        </div>
                        {!step.done && (
                            <button
                                onClick={step.action}
                                className="flex-shrink-0 ml-3 flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                <span>{step.actionLabel}</span>
                                <ChevronRight size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Sample data escape hatch */}
            {!hasAnyProgress && onTrySample && (
                <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Just exploring? Load realistic sample data to see every feature.
                    </p>
                    <button
                        onClick={onTrySample}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-lg border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-slate-600 transition-colors"
                    >
                        <Zap size={12} />
                        <span>Try with sample data</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default FirstRunChecklist;

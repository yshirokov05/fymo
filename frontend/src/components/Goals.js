import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Target, Plus, Trash2, Sparkles, ChevronDown, ChevronUp, CheckCircle2, Clock, TrendingUp, PiggyBank, CreditCard, Wallet, Loader2, AlertCircle, Edit3, X, Check } from 'lucide-react';

const GOAL_TYPES = [
    { id: 'savings',        label: 'Savings',         icon: <PiggyBank size={16} />,   color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
    { id: 'emergency_fund', label: 'Emergency Fund',  icon: <Wallet size={16} />,      color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
    { id: 'debt_payoff',    label: 'Debt Payoff',     icon: <CreditCard size={16} />,  color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
    { id: 'investment',     label: 'Investment',      icon: <TrendingUp size={16} />,  color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
    { id: 'custom',         label: 'Custom',          icon: <Target size={16} />,      color: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300' },
];

const typeInfo = Object.fromEntries(GOAL_TYPES.map(t => [t.id, t]));

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const monthsUntil = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    const target = new Date(dateStr);
    const diff = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
    return diff;
};

const formatGuidance = (text) => {
    if (!text) return null;
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map((line, i) => {
        const trimmed = line.trim();
        const isBold = trimmed.startsWith('**') && trimmed.includes('**', 2);
        const isNumbered = /^\d+\./.test(trimmed);
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');

        let content = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
        if (isBullet) content = content.replace(/^[-•]\s*/, '');

        return (
            <p
                key={i}
                className={`${isNumbered ? 'font-medium text-gray-800 dark:text-gray-100 mt-2' : isBullet ? 'pl-4 before:content-["•"] before:mr-2 before:text-blue-500' : 'text-gray-600 dark:text-gray-300'} text-sm leading-relaxed`}
                dangerouslySetInnerHTML={{ __html: content }}
            />
        );
    });
};

const GoalCard = ({ goal, onUpdate, onDelete }) => {
    const { currentUser } = useAuth();
    const [expanded, setExpanded] = useState(false);
    const [guidance, setGuidance] = useState(null);
    const [loadingGuidance, setLoadingGuidance] = useState(false);
    const [guidanceError, setGuidanceError] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editCurrent, setEditCurrent] = useState(goal.current_amount || 0);

    const progress = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0;
    const remaining = Math.max((goal.target_amount || 0) - (goal.current_amount || 0), 0);
    const months = monthsUntil(goal.target_date);
    const info = typeInfo[goal.type] || typeInfo['custom'];
    const isComplete = progress >= 100;

    const fetchGuidance = async () => {
        if (!currentUser) return;
        setLoadingGuidance(true);
        setGuidanceError(null);
        try {
            const token = await currentUser.getIdToken();
            const res = await axios.post('/api/goals/ai_guidance', { goal }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setGuidance(res.data.guidance);
        } catch (err) {
            setGuidanceError(err.response?.data?.error || 'Could not load guidance. Try again later.');
        } finally {
            setLoadingGuidance(false);
        }
    };

    const saveProgress = async () => {
        await onUpdate(goal.id, { current_amount: parseFloat(editCurrent) || 0 });
        setEditing(false);
    };

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border ${isComplete ? 'border-green-300 dark:border-green-700' : 'border-gray-100 dark:border-slate-700'} overflow-hidden transition-all`}>
            {/* Header */}
            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3 min-w-0">
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${info.color}`}>
                            {info.icon}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight">{goal.name}</h3>
                                {isComplete && (
                                    <span className="flex items-center space-x-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                        <CheckCircle2 size={12} /> <span>Complete</span>
                                    </span>
                                )}
                            </div>
                            <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>
                                {info.label}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                        <button
                            onClick={() => setExpanded(e => !e)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        >
                            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                        <button
                            onClick={() => onDelete(goal.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Progress */}
                <div className="mt-4 space-y-2">
                    <div className="flex justify-between items-end text-sm">
                        <div className="flex items-center space-x-2">
                            {editing ? (
                                <div className="flex items-center space-x-1">
                                    <span className="text-gray-500 dark:text-gray-400 text-xs">$</span>
                                    <input
                                        type="number"
                                        value={editCurrent}
                                        onChange={e => setEditCurrent(e.target.value)}
                                        className="w-28 text-sm font-bold border border-blue-400 rounded px-2 py-0.5 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none"
                                        autoFocus
                                    />
                                    <button onClick={saveProgress} className="p-1 text-green-600 hover:text-green-700"><Check size={16} /></button>
                                    <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-1">
                                    <span className="font-bold text-gray-800 dark:text-gray-100">{fmt(goal.current_amount)}</span>
                                    <button onClick={() => { setEditCurrent(goal.current_amount); setEditing(true); }} className="p-0.5 text-gray-300 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400 transition-colors">
                                        <Edit3 size={13} />
                                    </button>
                                </div>
                            )}
                            <span className="text-gray-400 dark:text-gray-500">of {fmt(goal.target_amount)}</span>
                        </div>
                        <span className={`font-bold text-sm ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                            {Math.round(progress)}%
                        </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                        <span>{fmt(remaining)} remaining</span>
                        {goal.target_date && (
                            <span className="flex items-center space-x-1">
                                <Clock size={11} />
                                <span>
                                    {months !== null
                                        ? months <= 0 ? 'Deadline passed' : `${months} month${months !== 1 ? 's' : ''} left`
                                        : goal.target_date}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded section */}
            {expanded && (
                <div className="border-t border-gray-100 dark:border-slate-700 px-5 pb-5 pt-4 space-y-4">
                    {goal.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">"{goal.notes}"</p>
                    )}

                    {/* AI Guidance */}
                    <div>
                        {!guidance && !loadingGuidance && (
                            <button
                                onClick={fetchGuidance}
                                className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                            >
                                <Sparkles size={16} />
                                <span>Get AI Guidance</span>
                            </button>
                        )}
                        {loadingGuidance && (
                            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                                <Loader2 size={16} className="animate-spin text-blue-500" />
                                <span>Analyzing your goal...</span>
                            </div>
                        )}
                        {guidanceError && (
                            <div className="flex items-center space-x-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                                <AlertCircle size={16} />
                                <span>{guidanceError}</span>
                            </div>
                        )}
                        {guidance && (
                            <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 border border-violet-200 dark:border-violet-700/50 rounded-xl p-4 space-y-2">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center space-x-2 text-violet-700 dark:text-violet-300">
                                        <Sparkles size={15} />
                                        <span className="text-xs font-bold uppercase tracking-wider">AI Guidance</span>
                                    </div>
                                    <button onClick={() => { setGuidance(null); fetchGuidance(); }} className="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300">Refresh</button>
                                </div>
                                <div className="space-y-1.5">{formatGuidance(guidance)}</div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1 italic">
                                    For informational purposes only. Not financial advice.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const NewGoalForm = ({ onSave, onCancel }) => {
    const [form, setForm] = useState({
        name: '',
        type: 'savings',
        target_amount: '',
        current_amount: '',
        target_date: '',
        notes: '',
    });

    const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

    // Listen for starter chip pre-fills from the empty state
    useEffect(() => {
        const handler = (e) => {
            const { label, type, amount } = e.detail;
            const cleanName = label.replace(/^[^\w\s]+\s*/, ''); // strip emoji
            setForm(f => ({ ...f, name: cleanName, type: type || f.type, target_amount: amount?.toString() || f.target_amount }));
        };
        window.addEventListener('prefill-goal', handler);
        return () => window.removeEventListener('prefill-goal', handler);
    }, []);
    const valid = form.name.trim() && parseFloat(form.target_amount) > 0;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-blue-200 dark:border-blue-700/50 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                <Target size={18} className="text-blue-600 dark:text-blue-400" />
                <span>New Goal</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Goal Name *</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={e => set('name', e.target.value)}
                        placeholder="e.g. 6-month emergency fund"
                        maxLength={100}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Type</label>
                    <select
                        value={form.type}
                        onChange={e => set('type', e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {GOAL_TYPES.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target Amount *</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input
                            type="number"
                            value={form.target_amount}
                            onChange={e => set('target_amount', e.target.value)}
                            placeholder="10,000"
                            min="0"
                            className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Current Progress</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                        <input
                            type="number"
                            value={form.current_amount}
                            onChange={e => set('current_amount', e.target.value)}
                            placeholder="0"
                            min="0"
                            className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target Date</label>
                    <input
                        type="date"
                        value={form.target_date}
                        onChange={e => set('target_date', e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Notes (optional)</label>
                    <textarea
                        value={form.notes}
                        onChange={e => set('notes', e.target.value)}
                        placeholder="Why this goal matters to you..."
                        rows={2}
                        maxLength={500}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={() => valid && onSave(form)}
                    disabled={!valid}
                    className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Add Goal
                </button>
            </div>
        </div>
    );
};

const Goals = ({ currentUser, onGoalsCountChange }) => {
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState(null);

    // Notify parent (App.js) of current goals count so the Dashboard checklist
    // can reflect reality. Fires on every change (fetch, create, delete).
    useEffect(() => {
        if (onGoalsCountChange) onGoalsCountChange(goals.length);
    }, [goals.length, onGoalsCountChange]);

    const getToken = async () => {
        if (!currentUser) return null;
        return await currentUser.getIdToken();
    };

    const fetchGoals = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await axios.get('/api/goals', { headers: { Authorization: `Bearer ${token}` } });
            setGoals(res.data.goals || []);
        } catch (err) {
            setError('Could not load goals.');
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => { fetchGoals(); }, [fetchGoals]);

    const handleAdd = async (form) => {
        try {
            const token = await getToken();
            const res = await axios.post('/api/goals', {
                ...form,
                target_amount: parseFloat(form.target_amount) || 0,
                current_amount: parseFloat(form.current_amount) || 0,
            }, { headers: { Authorization: `Bearer ${token}` } });
            setGoals(prev => [...prev, res.data.goal]);
            setShowForm(false);
        } catch (err) {
            if (err.response?.status === 401) {
                setError('sign_up_required');
                setShowForm(false);
            } else {
                setError('Failed to create goal.');
            }
        }
    };

    const handleUpdate = async (goalId, updates) => {
        try {
            const token = await getToken();
            await axios.put(`/api/goals/${goalId}`, updates, { headers: { Authorization: `Bearer ${token}` } });
            setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updates } : g));
        } catch (err) {
            setError('Failed to update goal.');
        }
    };

    const handleDelete = async (goalId) => {
        try {
            const token = await getToken();
            await axios.delete(`/api/goals/${goalId}`, { headers: { Authorization: `Bearer ${token}` } });
            setGoals(prev => prev.filter(g => g.id !== goalId));
        } catch (err) {
            setError('Failed to delete goal.');
        }
    };

    const completedCount = goals.filter(g => g.target_amount > 0 && g.current_amount >= g.target_amount).length;
    const totalTarget = goals.reduce((s, g) => s + (g.target_amount || 0), 0);
    const totalSaved = goals.reduce((s, g) => s + Math.min(g.current_amount || 0, g.target_amount || 0), 0);

    return (
        <div className="space-y-6 max-w-3xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Goals</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Set financial goals and get AI-powered guidance on how to reach them.</p>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shrink-0 self-start sm:self-auto"
                >
                    <Plus size={16} />
                    <span>New Goal</span>
                </button>
            </div>

            {/* Summary bar */}
            {goals.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 text-center shadow-sm">
                        <div className="text-2xl font-black text-gray-800 dark:text-gray-100">{goals.length}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wider">Active Goals</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 text-center shadow-sm">
                        <div className="text-2xl font-black text-green-600 dark:text-green-400">{completedCount}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wider">Completed</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 text-center shadow-sm">
                        <div className="text-lg font-black text-blue-600 dark:text-blue-400">{totalTarget > 0 ? Math.round(totalSaved / totalTarget * 100) : 0}%</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wider">Overall Progress</div>
                    </div>
                </div>
            )}

            {error === 'sign_up_required' ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1">
                        <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center shrink-0">
                            <Target size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-blue-800 dark:text-blue-200">Create an account to save goals</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">You're in demo mode. Sign up for free to track goals and get AI-powered guidance.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => { setError(null); window.dispatchEvent(new CustomEvent('fymo:open-auth', { detail: { mode: 'signup' } })); }}
                            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Sign Up Free
                        </button>
                        <button onClick={() => setError(null)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
                    </div>
                </div>
            ) : error ? (
                <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-700/50">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
            ) : null}

            {showForm && <NewGoalForm onSave={handleAdd} onCancel={() => setShowForm(false)} />}

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                </div>
            ) : goals.length === 0 && !showForm ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="text-center pt-12 pb-8 px-6">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Target size={32} className="text-blue-500" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Set your first goal</h3>
                        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-6 max-w-xs mx-auto">AI will build a personalized savings plan and track your progress automatically.</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus size={16} />
                            <span>Create Your First Goal</span>
                        </button>
                    </div>
                    <div className="border-t border-gray-100 dark:border-slate-700 px-6 py-4 bg-gray-50 dark:bg-slate-900/50">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Popular goals to get started</p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { label: '🏦 Emergency Fund', type: 'emergency_fund', amount: 15000 },
                                { label: '🏠 House Down Payment', type: 'savings', amount: 60000 },
                                { label: '💳 Pay Off Credit Card', type: 'debt_payoff', amount: 5000 },
                                { label: '📈 Invest $10K', type: 'investment', amount: 10000 },
                                { label: '✈️ Vacation Fund', type: 'savings', amount: 3000 },
                            ].map(s => (
                                <button
                                    key={s.label}
                                    onClick={() => {
                                        setShowForm(true);
                                        // slight delay so form mounts before we try to pre-fill
                                        setTimeout(() => window.dispatchEvent(new CustomEvent('prefill-goal', { detail: s })), 50);
                                    }}
                                    className="text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {goals.map(goal => (
                        <GoalCard
                            key={goal.id}
                            goal={goal}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-600 text-center pt-2">
                AI guidance is for informational purposes only and does not constitute financial advice.
            </p>
        </div>
    );
};

export default Goals;

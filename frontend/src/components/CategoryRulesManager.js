import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { Plus, Trash2, Edit2, Check, X, Tag, AlertTriangle, RefreshCw } from 'lucide-react';

// Fallback list — used only if /api/config/categories fails to load.
// Source of truth is backend/category_mapping.json (served via /api/config/categories).
const FALLBACK_CATEGORIES = [
    'Housing', 'Groceries', 'Eating Out', 'Vehicle Maintenance', 'Transportation',
    'Personal Care', 'Entertainment', 'Utilities', 'Fixed Subscriptions', 'Debit Card',
    'Shopping', 'Healthcare', 'Travel', 'Education', 'Income', 'Investment',
    'Transfers', 'Tax', 'Service', 'Other',
];

const MAX_RULES = 100;

const CategoryRulesManager = ({ customCategories = [] }) => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();

    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null); // rule id being edited
    const [editForm, setEditForm] = useState({ merchant_name: '', category: '' });
    const [showAddForm, setShowAddForm] = useState(false);
    const [serverCategories, setServerCategories] = useState(null);
    const [addForm, setAddForm] = useState({ merchant_name: '', category: FALLBACK_CATEGORIES[0] });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // Fetch the canonical category list from backend on mount.
    useEffect(() => {
        axios.get('/api/config/categories')
            .then(res => {
                // category_mapping.json is keyed by category name; "Ignore" is internal-only.
                const cats = Object.keys(res.data || {}).filter(c => c !== 'Ignore');
                if (cats.length > 0) setServerCategories(cats);
            })
            .catch(() => { /* fall back silently to FALLBACK_CATEGORIES */ });
    }, []);

    const baseCategories = serverCategories || FALLBACK_CATEGORIES;
    const allCategories = [...new Set([...baseCategories, ...customCategories])];

    const loadRules = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const token = await currentUser.getIdToken();
            const res = await axios.get('/api/custom_rules', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRules(res.data.rules || []);
        } catch (err) {
            showToast('Failed to load category rules.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentUser, showToast]);

    useEffect(() => { loadRules(); }, [loadRules]);

    // ── Add new rule ─────────────────────────────────────────────────────────
    const handleAdd = async () => {
        const merchant = addForm.merchant_name.trim();
        if (!merchant) { showToast('Enter a merchant name or keyword.', 'error'); return; }
        setSaving(true);
        try {
            const token = await currentUser.getIdToken();
            const res = await axios.post('/api/custom_rules',
                { merchant_name: merchant, category: addForm.category, apply_retroactive: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const { rule, affected_transactions } = res.data;
            setRules(prev => [rule, ...prev]);
            setAddForm({ merchant_name: '', category: baseCategories[0] });
            setShowAddForm(false);
            showToast(
                `Rule created${affected_transactions > 0 ? ` · applied to ${affected_transactions} existing transaction${affected_transactions !== 1 ? 's' : ''}` : ''}`,
                'success'
            );
        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            showToast(`Error: ${msg}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Start editing ────────────────────────────────────────────────────────
    const startEdit = (rule) => {
        setEditingId(rule.id);
        setEditForm({ merchant_name: rule.merchant_name, category: rule.category });
    };

    const cancelEdit = () => { setEditingId(null); setEditForm({ merchant_name: '', category: '' }); };

    // ── Save edit ────────────────────────────────────────────────────────────
    const handleSaveEdit = async (ruleId) => {
        if (!editForm.merchant_name.trim()) { showToast('Merchant name cannot be empty.', 'error'); return; }
        setSaving(true);
        try {
            const token = await currentUser.getIdToken();
            const res = await axios.put(`/api/custom_rules/${ruleId}`,
                { merchant_name: editForm.merchant_name.trim(), category: editForm.category, apply_retroactive: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...res.data.rule } : r));
            setEditingId(null);
            showToast(
                `Rule updated${res.data.affected_transactions > 0 ? ` · re-applied to ${res.data.affected_transactions} transaction${res.data.affected_transactions !== 1 ? 's' : ''}` : ''}`,
                'success'
            );
        } catch (err) {
            showToast(`Error: ${err.response?.data?.error || err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ───────────────────────────────────────────────────────────────
    const handleDelete = async (ruleId, merchantName) => {
        if (!window.confirm(`Delete rule for "${merchantName}"?\n\nExisting transactions keep their current category — only future syncs will be affected.`)) return;
        setDeletingId(ruleId);
        try {
            const token = await currentUser.getIdToken();
            await axios.delete(`/api/custom_rules/${ruleId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRules(prev => prev.filter(r => r.id !== ruleId));
            showToast('Rule deleted.', 'success');
        } catch (err) {
            showToast(`Error: ${err.response?.data?.error || err.message}`, 'error');
        } finally {
            setDeletingId(null);
        }
    };

    // ── Empty state ──────────────────────────────────────────────────────────
    const EmptyState = () => (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            <Tag size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No category rules yet</p>
            <p className="text-sm mt-1 max-w-xs mx-auto">
                Rules auto-categorize future transactions. You can also create rules here proactively — e.g. always put "VENMO" into Transfers.
            </p>
            <button
                onClick={() => setShowAddForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
                <Plus size={14} /> Create your first rule
            </button>
        </div>
    );

    return (
        <div>
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Rules auto-assign a category to any transaction whose name contains the pattern. Applied on every Plaid sync.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={loadRules}
                        disabled={loading}
                        title="Refresh"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
                        disabled={rules.length >= MAX_RULES}
                        title={rules.length >= MAX_RULES ? `Rule limit reached (${MAX_RULES})` : 'Add a new rule'}
                        className="flex items-center gap-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 transition-colors"
                    >
                        <Plus size={14} /> Add Rule
                    </button>
                </div>
            </div>

            {/* Add rule form */}
            {showAddForm && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-xl">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">New rule</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                Merchant keyword <span className="text-gray-400">(case-insensitive, partial match)</span>
                            </label>
                            <input
                                type="text"
                                value={addForm.merchant_name}
                                onChange={e => setAddForm(f => ({ ...f, merchant_name: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAddForm(false); }}
                                placeholder="e.g. STARBUCKS, UBER, Amazon"
                                className="w-full border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                autoFocus
                            />
                        </div>
                        <div className="sm:w-44">
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Category</label>
                            <select
                                value={addForm.category}
                                onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={handleAdd}
                                disabled={saving}
                                className="flex items-center gap-1 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition-colors"
                            >
                                <Check size={14} /> Save
                            </button>
                            <button
                                onClick={() => setShowAddForm(false)}
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 transition-colors"
                            >
                                <X size={14} /> Cancel
                            </button>
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <AlertTriangle size={11} /> Rule will be applied retroactively to all matching existing transactions.
                    </p>
                </div>
            )}

            {/* Rules table */}
            {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading rules…</div>
            ) : rules.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-white/5 text-left">
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pattern</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Matches</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                            {rules.map(rule => (
                                <tr key={rule.id} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    {editingId === rule.id ? (
                                        // ── Edit row ─────────────────────────────────────────
                                        <>
                                            <td className="px-4 py-2">
                                                <input
                                                    value={editForm.merchant_name}
                                                    onChange={e => setEditForm(f => ({ ...f, merchant_name: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(rule.id); if (e.key === 'Escape') cancelEdit(); }}
                                                    className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                    autoFocus
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <select
                                                    value={editForm.category}
                                                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                                    className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                >
                                                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-2" />
                                            <td className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => handleSaveEdit(rule.id)}
                                                        disabled={saving}
                                                        className="flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-2.5 py-1 transition-colors"
                                                    >
                                                        <Check size={12} /> Save
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 transition-colors"
                                                    >
                                                        <X size={12} /> Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        // ── Display row ───────────────────────────────────────
                                        <>
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-xs bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                                                    {rule.merchant_name}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                                                    <Tag size={11} className="text-blue-400" />
                                                    {rule.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-xs font-semibold ${rule.match_count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                                                    {rule.match_count > 0 ? `${rule.match_count} txn${rule.match_count !== 1 ? 's' : ''}` : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEdit(rule)}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                        title="Edit rule"
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(rule.id, rule.merchant_name)}
                                                        disabled={deletingId === rule.id}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                                        title="Delete rule"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {rules.length > 0 && (
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    {rules.length} of {MAX_RULES} rule{rules.length !== 1 ? 's' : ''} · Rules apply on every Plaid sync. More specific patterns win over generic ones (e.g. "STARBUCKS RESERVE" beats "STARBUCKS").
                </p>
            )}
        </div>
    );
};

export default CategoryRulesManager;

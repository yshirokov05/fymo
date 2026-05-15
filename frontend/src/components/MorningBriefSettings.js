import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Mail, Send, Loader2, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

/**
 * MorningBriefSettings
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings card to enable/disable the daily morning brief email and trigger
 * a test send. Backend scheduled function (Cloud Scheduler @ 13:00 UTC daily)
 * picks up users with `morning_brief_email.enabled = True` and emails them
 * the same brief shown in-app.
 *
 * Requires RESEND_API_KEY in Cloud Functions secrets. If unset, send_test
 * returns a clear "not configured" error and the test button is disabled.
 */

const MorningBriefSettings = () => {
    const { currentUser, isGuest } = useAuth();
    const { showToast } = useToast();
    const [prefs, setPrefs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);

    const headers = useCallback(async () => {
        if (isGuest || !currentUser) return {};
        return { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
    }, [currentUser, isGuest]);

    const fetchPrefs = useCallback(async () => {
        try {
            const h = await headers();
            const r = await axios.get('/api/morning_brief/preferences', h);
            setPrefs(r.data);
        } catch {/* silent */} finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

    const toggleEnabled = async (next) => {
        setSaving(true);
        try {
            const h = await headers();
            await axios.put('/api/morning_brief/preferences', { enabled: next, email: prefs?.email }, h);
            setPrefs(p => ({ ...p, enabled: next }));
            showToast(next ? 'Daily brief email enabled' : 'Daily brief email disabled', 'success');
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to update preference', 'error');
        } finally {
            setSaving(false);
        }
    };

    const sendTest = async () => {
        setSending(true);
        try {
            const h = await headers();
            const r = await axios.post('/api/morning_brief/send_test', {}, h);
            showToast(`Test brief sent to ${r.data.sent_to}`, 'success');
        } catch (e) {
            showToast(e.response?.data?.error || 'Test send failed', 'error');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
                <Loader2 className="text-blue-500 animate-spin" size={20} />
            </div>
        );
    }
    if (isGuest) return null;

    const emailConfigured = !!prefs?.send_test_available;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
            <div className="flex items-start gap-3 mb-4">
                <Mail size={22} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Daily Morning Brief Email</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        Get your AI-generated financial brief delivered daily at 6am ET. Same content as the in-app brief — market pulse, your money, and an actionable focus for the day.
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
                        Delivering to: <span className="font-mono">{prefs?.email || 'your account email'}</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/40 rounded-lg">
                <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Daily delivery</span>
                <button
                    onClick={() => toggleEnabled(!prefs?.enabled)}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                        prefs?.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
                    }`}
                    aria-pressed={!!prefs?.enabled}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {!emailConfigured && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs">
                    <Info size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-amber-800 dark:text-amber-300">
                        Email provider not configured yet. The toggle works, but no emails will go out until <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">RESEND_API_KEY</code> is added to Cloud Functions secrets.
                    </span>
                </div>
            )}

            {emailConfigured && (
                <button
                    onClick={sendTest}
                    disabled={sending}
                    className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-60"
                >
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {sending ? 'Sending…' : "Send me today's brief now (test)"}
                </button>
            )}
        </div>
    );
};

export default MorningBriefSettings;

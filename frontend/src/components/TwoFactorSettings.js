import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldAlert, Copy, Check, AlertTriangle, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

/**
 * TwoFactorSettings
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings card for enabling/disabling TOTP-based 2FA. Three flow stages:
 *
 *   1. Status — shows enabled / not enabled, recovery codes remaining
 *   2. Enroll — QR code + first-code verification + recovery codes display
 *   3. Disable — confirm with current code or recovery code
 *
 * NOTE: This is step-up authentication — it does NOT currently gate the
 * Firebase Auth login itself. Full login enforcement is a follow-up.
 */

const RecoveryCodes = ({ codes }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        try {
            navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {/* no-op */}
    };
    return (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mt-4">
            <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                    <div className="text-sm font-bold text-amber-900 dark:text-amber-200">Save these recovery codes</div>
                    <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                        Each can be used once if you lose access to your authenticator app. You won't be shown these again.
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {codes.map((c, i) => (
                    <code key={i} className="bg-white dark:bg-slate-800 px-3 py-2 rounded-md border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-200 tabular-nums">
                        {c}
                    </code>
                ))}
            </div>
            <button
                onClick={copy}
                className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors"
            >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy all codes'}
            </button>
        </div>
    );
};

const TwoFactorSettings = () => {
    const { currentUser, isGuest } = useAuth();
    const { showToast } = useToast();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [enrolling, setEnrolling] = useState(false);
    const [enrollment, setEnrollment] = useState(null);   // { otpauth_uri, recovery_codes }
    const [verifyCode, setVerifyCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [disabling, setDisabling] = useState(false);
    const [disableCode, setDisableCode] = useState('');

    const headers = useCallback(async () => {
        if (isGuest || !currentUser) return {};
        return { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
    }, [currentUser, isGuest]);

    const fetchStatus = useCallback(async () => {
        try {
            const h = await headers();
            const r = await axios.get('/api/2fa/status', h);
            setStatus(r.data);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const startEnrollment = async () => {
        setEnrolling(true);
        try {
            const h = await headers();
            const r = await axios.post('/api/2fa/setup', {}, h);
            setEnrollment(r.data);
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to start enrollment', 'error');
            setEnrolling(false);
        }
    };

    const submitVerify = async () => {
        if (!verifyCode.trim()) return;
        setSubmitting(true);
        try {
            const h = await headers();
            await axios.post('/api/2fa/verify_setup', { code: verifyCode.trim() }, h);
            showToast('Two-factor authentication enabled', 'success');
            setEnrolling(false);
            setEnrollment(null);
            setVerifyCode('');
            fetchStatus();
        } catch (e) {
            showToast(e.response?.data?.error || 'Invalid code', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const submitDisable = async () => {
        if (!disableCode.trim()) return;
        setSubmitting(true);
        try {
            const h = await headers();
            await axios.post('/api/2fa/disable', { code: disableCode.trim() }, h);
            showToast('Two-factor authentication disabled', 'success');
            setDisabling(false);
            setDisableCode('');
            fetchStatus();
        } catch (e) {
            showToast(e.response?.data?.error || 'Invalid code', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
                <Loader2 className="text-blue-500 animate-spin" size={20} />
            </div>
        );
    }

    if (isGuest) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
            <div className="flex items-start gap-3 mb-4">
                {status?.enabled ? (
                    <ShieldCheck size={22} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                ) : (
                    <ShieldAlert size={22} className="text-amber-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        Adds a six-digit code from an authenticator app (Google Authenticator, Authy, 1Password) for sensitive actions on your account.
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
                        {status?.enabled
                            ? `Enabled · ${status.recovery_codes_remaining} recovery codes remaining`
                            : 'Not enabled — recommended for any account with linked bank data.'}
                    </p>
                </div>
            </div>

            {/* Enrollment in-progress */}
            {enrolling && enrollment && (
                <div className="mt-4 border-t border-gray-100 dark:border-slate-700 pt-5">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-shrink-0">
                            <div className="bg-white dark:bg-white p-3 rounded-lg inline-block">
                                <QRCodeSVG value={enrollment.otpauth_uri} size={160} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <ol className="text-sm text-gray-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
                                <li>Open your authenticator app (Google Authenticator, Authy, 1Password, etc.)</li>
                                <li>Scan the QR code on the left</li>
                                <li>Enter the 6-digit code your app shows below to confirm</li>
                            </ol>
                            <div className="mt-4 flex items-center gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    placeholder="123 456"
                                    value={verifyCode}
                                    onChange={e => setVerifyCode(e.target.value.replace(/\s/g, ''))}
                                    className="w-32 text-center font-mono text-lg tracking-widest px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-900 dark:text-slate-100"
                                    autoFocus
                                />
                                <button
                                    onClick={submitVerify}
                                    disabled={submitting || verifyCode.length < 6}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                                >
                                    {submitting ? 'Verifying…' : 'Confirm & Enable'}
                                </button>
                                <button
                                    onClick={() => { setEnrolling(false); setEnrollment(null); setVerifyCode(''); }}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-2"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <RecoveryCodes codes={enrollment.recovery_codes} />
                </div>
            )}

            {/* Disable confirmation */}
            {disabling && (
                <div className="mt-4 border-t border-gray-100 dark:border-slate-700 pt-5">
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg mb-4">
                        <AlertTriangle size={16} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-800 dark:text-red-300">Confirm with your current authenticator code or a recovery code to disable 2FA.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="6-digit code or recovery code"
                            value={disableCode}
                            onChange={e => setDisableCode(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <button
                            onClick={submitDisable}
                            disabled={submitting || !disableCode.trim()}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                            {submitting ? 'Disabling…' : 'Disable'}
                        </button>
                        <button
                            onClick={() => { setDisabling(false); setDisableCode(''); }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-2"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Default actions */}
            {!enrolling && !disabling && (
                <div className="mt-4 flex flex-wrap gap-3">
                    {status?.enabled ? (
                        <button
                            onClick={() => setDisabling(true)}
                            className="bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                        >
                            Disable 2FA
                        </button>
                    ) : (
                        <button
                            onClick={startEnrollment}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm shadow-sm"
                        >
                            Enable 2FA
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default TwoFactorSettings;

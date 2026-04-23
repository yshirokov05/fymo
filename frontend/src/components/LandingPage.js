import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    BarChart2, Link2, Sparkles, Calculator, ShieldCheck,
    ChevronRight, X, TrendingUp, TrendingDown, Eye,
    ArrowRight, Check, Star
} from 'lucide-react';

// ─── Tiny reusable pieces ────────────────────────────────────────────────────

const Pill = ({ children, color = 'blue' }) => {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        green: 'bg-green-500/10 text-green-400 border-green-500/20',
        purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${colors[color]}`}>
            {children}
        </span>
    );
};

// ─── Hero mock dashboard card ─────────────────────────────────────────────────
const MockDashboard = () => (
    <div className="relative w-full max-w-lg mx-auto select-none pointer-events-none">
        {/* Glow */}
        <div className="absolute -inset-4 bg-blue-600/20 rounded-3xl blur-2xl" />
        <div className="relative bg-slate-800/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900/60">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400/70" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400/70" />
                    <div className="w-2 h-2 rounded-full bg-green-400/70" />
                </div>
                <span className="text-xs text-gray-500 font-mono">wealthstack.app</span>
                <div className="w-12" />
            </div>

            {/* Cards row 1 */}
            <div className="p-4 grid grid-cols-2 gap-3">
                <div className="bg-slate-900/80 rounded-xl p-3 border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Net Worth</p>
                    <p className="text-lg font-bold text-white">$247,830</p>
                    <p className="text-xs text-green-400 mt-0.5">+$12,440 YTD</p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Portfolio Return</p>
                    <p className="text-lg font-bold text-green-400">+8.34%</p>
                    <p className="text-xs text-gray-500 mt-0.5">vs S&P +4.21%</p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Cash Flow (YTD)</p>
                    <p className="text-lg font-bold text-white">$18,240</p>
                    <p className="text-xs text-blue-400 mt-0.5">Savings rate 34%</p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Est. Tax Bill</p>
                    <p className="text-lg font-bold text-white">$14,820</p>
                    <p className="text-xs text-gray-500 mt-0.5">Effective 18.2%</p>
                </div>
            </div>

            {/* Show math strip */}
            <div className="mx-4 mb-4 rounded-xl bg-slate-900/60 border border-white/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Eye size={12} className="text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">SHOW MATH</span>
                </div>
                <div className="space-y-1.5">
                    {[
                        ['Assets', '$312,450'],
                        ['Debts', '−$64,620'],
                        ['Net Worth', '$247,830'],
                    ].map(([label, val]) => (
                        <div key={label} className="flex justify-between text-xs">
                            <span className="text-gray-500">{label}</span>
                            <span className={`font-mono font-semibold ${label === 'Net Worth' ? 'text-white' : 'text-gray-400'}`}>{val}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI bar */}
            <div className="mx-4 mb-4 rounded-xl bg-blue-600/10 border border-blue-500/20 p-3 flex items-start gap-2">
                <Sparkles size={14} className="text-blue-400 mt-0.5 shrink-0" />
                <div>
                    <p className="text-xs text-blue-300 font-semibold">AI Analyst</p>
                    <p className="text-xs text-gray-400 mt-0.5">"Your biggest spending increase this month is dining (+$340). At your current savings rate you'll hit your emergency fund goal in 4 months."</p>
                </div>
            </div>
        </div>
    </div>
);

// ─── Auth modal ───────────────────────────────────────────────────────────────
const AuthModal = ({ onClose, defaultSignup = false }) => {
    const [isSignup, setIsSignup] = useState(defaultSignup);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, signup, loginWithGoogle, resetPassword } = useAuth();

    const handleGoogle = async () => {
        setError(''); setLoading(true);
        try { await loginWithGoogle(); }
        catch (err) { setError('Google sign-in failed: ' + err.message); }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(''); setLoading(true);
        try {
            if (isSignup) await signup(email, password);
            else await login(email, password);
        } catch (err) {
            setError((isSignup ? 'Sign up failed: ' : 'Sign in failed: ') + err.message);
        }
        setLoading(false);
    };

    const handleForgot = async () => {
        if (!email) { setError('Enter your email first.'); return; }
        try {
            setError(''); setMessage(''); setLoading(true);
            await resetPassword(email);
            setMessage('Password reset email sent — check your inbox.');
        } catch (err) { setError('Reset failed: ' + err.message); }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative bg-slate-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-8">
                <button onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors">
                    <X size={20} />
                </button>

                <div className="mb-6 text-center">
                    <span className="text-2xl font-black tracking-tight text-white">Wealth<span className="text-blue-400">stack</span></span>
                    <p className="text-sm text-gray-400 mt-1">{isSignup ? 'Create your free account' : 'Welcome back'}</p>
                </div>

                {error && <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
                {message && <div className="mb-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{message}</div>}

                <button onClick={handleGoogle} disabled={loading}
                    className="flex items-center justify-center w-full gap-2 bg-white text-gray-700 hover:bg-gray-50 font-medium rounded-xl py-2.5 mb-4 transition-colors text-sm">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-4 h-4" />
                    Continue with Google
                </button>

                <div className="relative flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-gray-500">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <input type="email" required placeholder="Email address" value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-slate-900/60 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    <input type="password" required placeholder="Password" value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-slate-900/60 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    <button type="submit" disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                        {loading ? 'Please wait…' : (isSignup ? 'Create account' : 'Sign in')}
                    </button>
                </form>

                <div className="mt-4 flex flex-col items-center gap-2 text-sm">
                    <button onClick={() => { setIsSignup(!isSignup); setError(''); setMessage(''); }}
                        className="text-blue-400 hover:text-blue-300 transition-colors">
                        {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                    {!isSignup && (
                        <button onClick={handleForgot} disabled={loading}
                            className="text-gray-500 hover:text-gray-300 transition-colors text-xs">
                            Forgot password?
                        </button>
                    )}
                </div>

                <div className="mt-5 pt-4 border-t border-white/5 text-center">
                    <button onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('continue-as-guest')); }}
                        className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
                        Continue as guest with sample data →
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Feature card ─────────────────────────────────────────────────────────────
const Feature = ({ icon, title, desc, color = 'blue' }) => {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-green-500/10 text-green-400',
        purple: 'bg-purple-500/10 text-purple-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };
    return (
        <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}>
                {icon}
            </div>
            <h3 className="text-white font-semibold text-base mb-2">{title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
        </div>
    );
};

// ─── Step card ────────────────────────────────────────────────────────────────
const Step = ({ num, title, desc }) => (
    <div className="flex gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">{num}</div>
        <div>
            <h4 className="text-white font-semibold mb-1">{title}</h4>
            <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
        </div>
    </div>
);

// ─── Main landing page ────────────────────────────────────────────────────────
const LandingPage = () => {
    const [authModal, setAuthModal] = useState(null); // null | 'signin' | 'signup'

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {authModal && (
                <AuthModal
                    defaultSignup={authModal === 'signup'}
                    onClose={() => setAuthModal(null)}
                />
            )}

            {/* ── Nav ── */}
            <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-900/80 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                    <span className="text-xl font-black tracking-tight">
                        Wealth<span className="text-blue-400">stack</span>
                    </span>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button onClick={() => setAuthModal('signin')}
                            className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5">
                            Sign in
                        </button>
                        <button onClick={() => setAuthModal('signup')}
                            className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-1.5 transition-colors">
                            Get started free
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Left copy */}
                    <div>
                        <Pill color="blue">
                            <Sparkles size={11} />
                            AI-powered · Bank sync via Plaid
                        </Pill>
                        <h1 className="mt-5 text-4xl sm:text-5xl font-black tracking-tight leading-tight">
                            Your complete<br />
                            financial picture.<br />
                            <span className="text-blue-400">Nothing hidden.</span>
                        </h1>
                        <p className="mt-5 text-lg text-gray-400 leading-relaxed max-w-lg">
                            Wealthstack connects all your accounts, tracks every dollar, and explains every number — so you always know exactly where you stand.
                        </p>
                        <div className="mt-8 flex flex-col sm:flex-row gap-3">
                            <button onClick={() => setAuthModal('signup')}
                                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-6 py-3 transition-colors">
                                Start for free <ArrowRight size={16} />
                            </button>
                            <button onClick={() => window.dispatchEvent(new CustomEvent('continue-as-guest'))}
                                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-xl px-6 py-3 transition-colors">
                                Try with sample data
                            </button>
                        </div>
                        <p className="mt-4 text-xs text-gray-500">No credit card required to start. Premium $9.99/mo.</p>

                        {/* Trust badges */}
                        <div className="mt-8 flex flex-wrap gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-green-400" />Bank-grade encryption</span>
                            <span className="flex items-center gap-1.5"><Link2 size={13} className="text-blue-400" />Plaid-powered sync</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-purple-400" />Read-only access</span>
                        </div>
                    </div>

                    {/* Right — mock dashboard */}
                    <div className="lg:pl-4">
                        <MockDashboard />
                    </div>
                </div>
            </section>

            {/* ── Divider ── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            {/* ── Features ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
                <div className="text-center mb-12">
                    <Pill color="purple"><Star size={11} />Why Wealthstack</Pill>
                    <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight">
                        Built differently than<br />every other finance app
                    </h2>
                    <p className="mt-4 text-gray-400 max-w-lg mx-auto">
                        Most apps show you numbers. Wealthstack shows you <em>how</em> those numbers were calculated — and what they actually mean for you.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Feature
                        color="blue"
                        icon={<Eye size={20} />}
                        title="Show Math on everything"
                        desc="Every metric — net worth, portfolio return, tax estimate — comes with a line-by-line breakdown. No black boxes, ever."
                    />
                    <Feature
                        color="green"
                        icon={<Link2 size={20} />}
                        title="All accounts, one place"
                        desc="Plaid connects your checking, savings, investments, and credit cards automatically. Everything stays in sync."
                    />
                    <Feature
                        color="purple"
                        icon={<Sparkles size={20} />}
                        title="AI that knows your money"
                        desc="Ask anything: 'How much did I spend on food last month?' or 'How is my portfolio doing vs the S&P 500?' Get real answers."
                    />
                    <Feature
                        color="orange"
                        icon={<Calculator size={20} />}
                        title="50-state tax projection"
                        desc="See your real federal + state tax bill updated in real time as your income and deductions change throughout the year."
                    />
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-20">
                <div className="bg-slate-800/40 border border-white/5 rounded-3xl p-8 sm:p-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <Pill color="green"><TrendingUp size={11} />How it works</Pill>
                            <h2 className="mt-4 text-3xl font-black tracking-tight">Up and running in minutes</h2>
                            <p className="mt-3 text-gray-400 text-sm mb-8">No spreadsheets, no manual data entry, no waiting.</p>
                            <div className="space-y-6">
                                <Step num={1} title="Create your free account"
                                    desc="Sign up with Google or email. No credit card required." />
                                <Step num={2} title="Connect your accounts"
                                    desc="Link your bank, brokerage, and credit cards via Plaid's secure, read-only connection. Takes about 60 seconds." />
                                <Step num={3} title="See your full picture"
                                    desc="Net worth, cash flow, portfolio return vs benchmarks, tax projection — all updated automatically." />
                            </div>
                        </div>

                        {/* Mini stats column */}
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Net Worth Tracked', val: '$247,830', sub: 'Across 4 accounts', color: 'text-white', icon: <TrendingUp size={16} className="text-green-400" /> },
                                { label: 'Portfolio Return', val: '+8.34%', sub: 'vs S&P +4.21% YTD', color: 'text-green-400', icon: <BarChart2 size={16} className="text-blue-400" /> },
                                { label: 'Emergency Fund', val: '3.4 months', sub: 'Target: 6 months', color: 'text-yellow-400', icon: <ShieldCheck size={16} className="text-yellow-400" /> },
                                { label: 'Annual Tax Est.', val: '$14,820', sub: 'Effective rate 18.2%', color: 'text-white', icon: <Calculator size={16} className="text-purple-400" /> },
                            ].map(({ label, val, sub, color, icon }) => (
                                <div key={label} className="bg-slate-900/60 border border-white/5 rounded-2xl p-4">
                                    <div className="mb-2">{icon}</div>
                                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                                    <p className={`text-lg font-bold ${color}`}>{val}</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Pricing ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
                <div className="text-center mb-12">
                    <Pill color="blue">Pricing</Pill>
                    <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight">Simple, honest pricing</h2>
                    <p className="mt-3 text-gray-400">Start free, upgrade when you need more.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
                    {/* Free */}
                    <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-1">Free</h3>
                        <p className="text-3xl font-black text-white mb-1">$0</p>
                        <p className="text-sm text-gray-500 mb-6">Forever free</p>
                        <ul className="space-y-3 mb-8">
                            {[
                                'Full dashboard with sample data',
                                'Manual asset & debt entry',
                                'Goals tracking',
                                'Tax projection preview',
                            ].map(f => (
                                <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                                    <Check size={14} className="text-gray-500 mt-0.5 shrink-0" /> {f}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setAuthModal('signup')}
                            className="w-full border border-white/10 hover:bg-white/5 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                            Get started free
                        </button>
                    </div>

                    {/* Premium */}
                    <div className="relative bg-blue-600/10 border border-blue-500/30 rounded-2xl p-6">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">Most popular</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Premium</h3>
                        <p className="text-3xl font-black text-white mb-1">$9.99<span className="text-base font-normal text-gray-400">/mo</span></p>
                        <p className="text-sm text-gray-500 mb-6">Everything in Free, plus:</p>
                        <ul className="space-y-3 mb-8">
                            {[
                                'Bank sync via Plaid (all accounts)',
                                'AI Financial Analyst (unlimited chat)',
                                'Real portfolio return vs benchmarks',
                                'Investment transaction history (5yr)',
                                'Morning & Health AI briefs',
                                'Automated transaction categorization',
                            ].map(f => (
                                <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                                    <Check size={14} className="text-blue-400 mt-0.5 shrink-0" /> {f}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setAuthModal('signup')}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                            Start free · upgrade anytime
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Final CTA ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
                <div className="bg-gradient-to-br from-blue-600/20 via-blue-700/10 to-transparent border border-blue-500/20 rounded-3xl p-10 sm:p-16 text-center">
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
                        Know exactly where<br />every dollar stands.
                    </h2>
                    <p className="text-gray-400 mb-8 max-w-md mx-auto">
                        Join users who stopped guessing and started understanding their finances.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => setAuthModal('signup')}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-8 py-3 transition-colors">
                            Get started free <ArrowRight size={16} />
                        </button>
                        <button onClick={() => window.dispatchEvent(new CustomEvent('continue-as-guest'))}
                            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-xl px-8 py-3 transition-colors">
                            Try with sample data
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="border-t border-white/5 py-8">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
                    <span className="font-bold text-gray-400">Wealth<span className="text-blue-400">stack</span></span>
                    <div className="flex gap-6">
                        <button onClick={() => window.dispatchEvent(new CustomEvent('nav-privacy'))} className="hover:text-gray-400 transition-colors">Privacy Policy</button>
                        <button onClick={() => window.dispatchEvent(new CustomEvent('nav-terms'))} className="hover:text-gray-400 transition-colors">Terms of Service</button>
                    </div>
                    <span>© {new Date().getFullYear()} Wealthstack. All rights reserved.</span>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;

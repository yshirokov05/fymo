import React, { useState } from 'react';
import { Shield, Lock, Database, Info, EyeOff, Sparkles, CreditCard, Trash2, Server, ChevronDown, ChevronUp, AlertTriangle, Globe } from 'lucide-react';

const FAQItem = ({ icon, iconBg, iconColor, question, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
                <div className="flex items-center space-x-4">
                    <div className={`${iconBg} p-2.5 rounded-lg ${iconColor} shrink-0`}>
                        {icon}
                    </div>
                    <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 pr-4">{question}</h3>
                </div>
                <div className="text-gray-400 shrink-0">
                    {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
            </button>
            {open && (
                <div className="px-6 pb-6 pt-0 text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-3 border-t border-gray-100 dark:border-slate-700">
                    <div className="pt-4">{children}</div>
                </div>
            )}
        </div>
    );
};

const SectionHeader = ({ title }) => (
    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-8 mb-3 px-1">{title}</h3>
);

const DataPrivacyFAQ = () => {
    return (
        <div className="space-y-1 max-w-4xl mx-auto pb-12">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-slate-700 pb-4">Security & Privacy FAQ</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-3">
                    Complete transparency about how Wealthstack handles your data. Click any question to expand.
                </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 flex items-start space-x-3">
                <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <p className="text-blue-700 dark:text-blue-300 text-sm">
                    Wealthstack is a solo-built app by Yury Shirokov. There is no VC backing, no ad model, and no data brokering. The only revenue source is Premium subscriptions.
                </p>
            </div>

            <SectionHeader title="Bank Connections" />

            <FAQItem
                icon={<Shield size={20} />}
                iconBg="bg-blue-100 dark:bg-blue-900/40"
                iconColor="text-blue-600 dark:text-blue-400"
                question="Will Wealthstack ever see my bank username or password?"
            >
                <p><strong className="text-gray-800 dark:text-gray-100">No — never.</strong> Bank connections are handled exclusively through <strong>Plaid</strong>, a third-party service used by thousands of apps (Venmo, Robinhood, Betterment, etc.). When you link an account, you log in directly through Plaid's secure portal. Wealthstack never sees, intercepts, or stores your banking credentials.</p>
                <p>Plaid issues Wealthstack a limited-scope <strong>access token</strong> — a long random string — that can only read balances and transactions. That's it.</p>
            </FAQItem>

            <FAQItem
                icon={<Database size={20} />}
                iconBg="bg-purple-100 dark:bg-purple-900/40"
                iconColor="text-purple-600 dark:text-purple-400"
                question="Can this app transfer or move my money?"
            >
                <p><strong className="text-gray-800 dark:text-gray-100">No.</strong> The Plaid tokens granted to Wealthstack use <strong>read-only product scopes</strong> (transactions, balances, investments, liabilities). These scopes do not include payment initiation or transfer capabilities. The app is architecturally incapable of moving money — not just by policy, but by what the API token is permitted to do.</p>
            </FAQItem>

            <FAQItem
                icon={<Globe size={20} />}
                iconBg="bg-teal-100 dark:bg-teal-900/40"
                iconColor="text-teal-600 dark:text-teal-400"
                question="What exactly does Plaid send to Wealthstack?"
            >
                <p>After linking, Plaid sends:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li>Account names, types, and balances</li>
                    <li>Transaction history (merchant name, date, amount, category)</li>
                    <li>Investment holdings (ticker, shares, market value, cost basis if available)</li>
                    <li>Liability balances (credit cards, mortgages, student loans)</li>
                </ul>
                <p className="mt-2">Wealthstack stores this data in your Firestore document, associated with your user ID. Plaid's own data practices are governed by <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Plaid's End User Privacy Policy</a>.</p>
            </FAQItem>

            <SectionHeader title="Data Storage & Encryption" />

            <FAQItem
                icon={<Lock size={20} />}
                iconBg="bg-green-100 dark:bg-green-900/40"
                iconColor="text-green-600 dark:text-green-400"
                question="Is my data encrypted?"
            >
                <p>Yes, at two layers:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li><strong className="text-gray-800 dark:text-gray-100">Plaid access tokens</strong> are encrypted at rest using <strong>Fernet (AES-128-CBC)</strong> before being written to Firestore. Even if someone obtained a raw database export, the tokens would be mathematically scrambled and useless.</li>
                    <li><strong className="text-gray-800 dark:text-gray-100">All data in transit</strong> is encrypted via TLS/HTTPS — enforced by Firebase Hosting and Google Cloud Functions.</li>
                </ul>
                <p className="mt-2">Your financial figures themselves (balances, transactions) are stored as plaintext fields in your Firestore document, protected by Firebase Security Rules (see below).</p>
            </FAQItem>

            <FAQItem
                icon={<Server size={20} />}
                iconBg="bg-indigo-100 dark:bg-indigo-900/40"
                iconColor="text-indigo-600 dark:text-indigo-400"
                question="Where is my data stored? Who has physical access?"
            >
                <p>All data is stored in <strong>Google Firebase (Firestore)</strong>, hosted in Google's US data centers. Google Cloud operates under SOC 2, ISO 27001, and other enterprise security certifications.</p>
                <p className="mt-2">Firebase Security Rules ensure that only an authenticated request carrying <strong>your Firebase UID</strong> can read or write your document. The backend uses the Firebase Admin SDK (for server-side operations), which bypasses client-facing rules — but all backend routes require a valid Firebase auth token, and every write is scoped to the requesting user's UID.</p>
            </FAQItem>

            <FAQItem
                icon={<EyeOff size={20} />}
                iconBg="bg-rose-100 dark:bg-rose-900/40"
                iconColor="text-rose-600 dark:text-rose-400"
                question="Can the app owner (Yury) see my financial data?"
            >
                <p>Technically, as the Firebase project owner, I have admin-level access to the Firestore database. I want to be upfront about that.</p>
                <p className="mt-2"><strong className="text-gray-800 dark:text-gray-100">In practice:</strong> I do not browse user data. There are no internal dashboards that surface individual user finances. The only scenario where I would ever look at a specific user document is if they contacted me about a bug and explicitly granted permission.</p>
                <p className="mt-2">If this level of admin access is a concern, you can use Wealthstack in <strong>manual-entry mode only</strong> (no Plaid connection) — in which case you control exactly what data enters the system.</p>
            </FAQItem>

            <SectionHeader title="AI Features" />

            <FAQItem
                icon={<Sparkles size={20} />}
                iconBg="bg-amber-100 dark:bg-amber-900/40"
                iconColor="text-amber-600 dark:text-amber-400"
                question="What data is sent to the AI Analyst?"
            >
                <p>When you use the <strong>AI Analyst</strong> feature, a financial summary is constructed from your data and sent to <strong>Google Gemini</strong> (Google's AI model). This summary includes:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li>Net worth, asset totals by category</li>
                    <li>Monthly income and expense totals</li>
                    <li>Debt balances and types</li>
                    <li>Tax estimate figures</li>
                    <li>Investment allocation summary</li>
                </ul>
                <p className="mt-2"><strong className="text-gray-800 dark:text-gray-100">What is NOT sent:</strong> Your name, email, account numbers, transaction merchant details, or any directly identifying information. The data is sanitized before being passed to the model.</p>
                <p className="mt-2">Google's data handling for Gemini API calls is governed by <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Google's Generative AI Terms</a>. Wealthstack uses the API tier, which means data is not used to train Google's models.</p>
            </FAQItem>

            <FAQItem
                icon={<AlertTriangle size={20} />}
                iconBg="bg-amber-100 dark:bg-amber-900/40"
                iconColor="text-amber-600 dark:text-amber-400"
                question="Is the AI giving me financial advice?"
            >
                <p><strong className="text-gray-800 dark:text-gray-100">No.</strong> The AI Analyst provides general financial <em>information and education</em> based on your numbers. It is not a licensed financial advisor, registered investment adviser (RIA), CPA, or attorney.</p>
                <p className="mt-2">AI outputs should be used as a starting point for your own research, not as a basis for specific investment, tax, or legal decisions. Always consult a licensed professional before acting on any financial guidance.</p>
            </FAQItem>

            <SectionHeader title="Payments & Subscriptions" />

            <FAQItem
                icon={<CreditCard size={20} />}
                iconBg="bg-green-100 dark:bg-green-900/40"
                iconColor="text-green-600 dark:text-green-400"
                question="Does Wealthstack store my credit card information?"
            >
                <p><strong className="text-gray-800 dark:text-gray-100">No.</strong> All payment processing is handled by <strong>Stripe</strong>, one of the most trusted payment processors in the world. When you enter card details, they go directly to Stripe's servers — Wealthstack never sees or stores your card number, CVV, or billing address.</p>
                <p className="mt-2">Wealthstack only stores a Stripe Customer ID and subscription status (active/inactive) in your Firestore document.</p>
            </FAQItem>

            <SectionHeader title="Your Rights & Data Deletion" />

            <FAQItem
                icon={<Trash2 size={20} />}
                iconBg="bg-red-100 dark:bg-red-900/40"
                iconColor="text-red-600 dark:text-red-400"
                question="How do I delete my data?"
            >
                <p>You have two options:</p>
                <ul className="list-disc list-inside space-y-2 mt-1">
                    <li><strong className="text-gray-800 dark:text-gray-100">Factory Reset</strong> — Settings → Factory Reset Account. This wipes all your financial data (assets, debts, transactions, income, etc.) while keeping your account active.</li>
                    <li><strong className="text-gray-800 dark:text-gray-100">Full Account Deletion</strong> — Email <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">yshirokov05@gmail.com</a> to request complete deletion of your account and all associated data. Requests are fulfilled within 30 days.</li>
                </ul>
                <p className="mt-2">To disconnect bank accounts without deleting your account: Settings → Data Management → Clear Orphaned Plaid Data, or use the disconnect option per account in Settings.</p>
            </FAQItem>

            <FAQItem
                icon={<Shield size={20} />}
                iconBg="bg-blue-100 dark:bg-blue-900/40"
                iconColor="text-blue-600 dark:text-blue-400"
                question="What are my rights under CCPA / GDPR?"
            >
                <p>Wealthstack is primarily intended for US residents, but we respect global privacy principles:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li><strong className="text-gray-800 dark:text-gray-100">Right to access</strong> — You can view all data stored about you (it's all visible in-app).</li>
                    <li><strong className="text-gray-800 dark:text-gray-100">Right to deletion</strong> — See above. We honor deletion requests promptly.</li>
                    <li><strong className="text-gray-800 dark:text-gray-100">Right to portability</strong> — Your data is not currently exportable via the UI. Contact us and we can provide a raw export.</li>
                    <li><strong className="text-gray-800 dark:text-gray-100">No selling of data</strong> — Your data is never sold to or shared with third parties for marketing purposes.</li>
                </ul>
            </FAQItem>

            <div className="mt-8 bg-gray-50 dark:bg-slate-800/50 p-6 rounded-xl text-center border border-gray-200 dark:border-slate-700">
                <Info className="inline-block text-gray-400 mb-2" size={28} />
                <p className="text-gray-700 dark:text-gray-200 font-semibold">Still have questions?</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Reach out directly at{' '}
                    <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">yshirokov05@gmail.com</a>
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                    You can also review the full{' '}
                    <span className="text-blue-500 dark:text-blue-400">Privacy Policy</span> and{' '}
                    <span className="text-blue-500 dark:text-blue-400">Terms of Service</span> in the sidebar footer.
                </p>
            </div>
        </div>
    );
};

export default DataPrivacyFAQ;

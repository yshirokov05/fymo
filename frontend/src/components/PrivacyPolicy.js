import React from 'react';
import { Shield, Database, Lock, Eye, Mail, Trash2, RefreshCw } from 'lucide-react';

const Section = ({ icon, title, children }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center space-x-3 mb-3">
            <div className="text-blue-600 dark:text-blue-400">{icon}</div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h3>
        </div>
        <div className="text-gray-600 dark:text-gray-300 leading-relaxed space-y-2 text-sm">
            {children}
        </div>
    </div>
);

const PrivacyPolicy = () => {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <div>
                <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-slate-700 pb-4">Privacy Policy</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Effective Date: April 10, 2026 · Last Updated: April 10, 2026</p>
                <p className="text-gray-600 dark:text-gray-300 mt-4 leading-relaxed">
                    Fymo ("Fymo", "we", "our", or "us") is operated by Yury Shirokov as a solo project. This Privacy Policy describes what data we collect, why we collect it, how it is stored and protected, and your rights regarding that data. By using Fymo, you agree to the practices described in this policy.
                </p>
            </div>

            <div className="space-y-4">
                <Section icon={<Database size={22} />} title="What Data We Collect">
                    <p><strong className="text-gray-800 dark:text-gray-100">Account data:</strong> Your email address and a unique user ID, provided by Google Firebase Authentication when you sign in.</p>
                    <p><strong className="text-gray-800 dark:text-gray-100">Financial data you enter:</strong> Assets, debts, income sources, insurance policies, budgets, and paystubs that you manually input into the app.</p>
                    <p><strong className="text-gray-800 dark:text-gray-100">Bank-synced data (if you connect via Plaid):</strong> Account balances, transaction history, and investment holdings fetched through your linked financial institutions. We never see or store your bank username or password.</p>
                    <p><strong className="text-gray-800 dark:text-gray-100">Billing data:</strong> If you subscribe, Stripe processes your payment. We store only your Stripe customer ID and subscription ID — never your full card number.</p>
                    <p><strong className="text-gray-800 dark:text-gray-100">Usage data:</strong> Basic request logs (timestamps, error messages) used solely for debugging. No behavioral analytics or tracking cookies.</p>
                </Section>

                <Section icon={<Lock size={22} />} title="How We Store and Protect Your Data">
                    <p>All user data is stored in <strong className="text-gray-800 dark:text-gray-100">Google Cloud Firestore</strong>, a managed database hosted in the United States with encryption at rest and in transit provided by Google.</p>
                    <p>Plaid access tokens — the most sensitive piece of data we hold — are <strong className="text-gray-800 dark:text-gray-100">encrypted at rest using AES-128 (Fernet)</strong> before being written to the database. Even in the event of a raw database breach, these tokens are cryptographically useless without the encryption key.</p>
                    <p>Firestore security rules enforce strict per-user data isolation: your data is only accessible by your authenticated user ID. No other user or admin can read your financial data through the app interface.</p>
                </Section>

                <Section icon={<Eye size={22} />} title="How We Use Your Data">
                    <p>We use your data exclusively to provide the Fymo service to you:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>Displaying your net worth, budgets, tax estimates, and financial summaries</li>
                        <li>Syncing transactions and balances from your linked bank accounts via Plaid</li>
                        <li>Generating AI-powered financial insights via Anthropic&apos;s Claude API (your data is sent to Claude solely to produce your personalized summary — Anthropic does not use API inputs to train their models under our commercial API agreement)</li>
                        <li>Processing your subscription payment via Stripe</li>
                    </ul>
                    <p className="mt-2"><strong className="text-gray-800 dark:text-gray-100">We do not sell, rent, share, or monetize your personal or financial data in any form.</strong></p>
                </Section>

                <Section icon={<Shield size={22} />} title="Third-Party Services">
                    <p>Fymo uses the following third-party services, each subject to their own privacy policies:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li><strong className="text-gray-800 dark:text-gray-100">Google Firebase & Firestore</strong> — Authentication and database hosting (Google Privacy Policy)</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Plaid</strong> — Bank account connectivity (Plaid Privacy Policy). Plaid is subject to its own data practices with your financial institution.</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Stripe</strong> — Payment processing (Stripe Privacy Policy)</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Anthropic Claude API</strong> — AI financial guidance and document extraction (paystubs, statements, insurance PDFs, check images). Data sent to Claude is limited to a sanitized financial summary or the uploaded document, and is not used for model training per Anthropic's API terms.</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Yahoo Finance</strong> — Real-time asset price lookups (no personal data sent)</li>
                    </ul>
                </Section>

                <Section icon={<RefreshCw size={22} />} title="Data Retention">
                    <p>Your data is retained for as long as your account is active. If you use the "Factory Reset Account" feature in Settings, all your financial data is permanently deleted from our database.</p>
                    <p>If you wish to have your entire account and all associated data deleted, contact us at the email below and we will process it within 30 days.</p>
                </Section>

                <Section icon={<Trash2 size={22} />} title="Your Rights (CCPA / GDPR)">
                    <p>Depending on where you live, you may have the following rights regarding your data:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li><strong className="text-gray-800 dark:text-gray-100">Right to access:</strong> Request a copy of the data we hold about you</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Right to deletion:</strong> Request permanent deletion of your account and all associated data</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Right to portability:</strong> Request your financial data in a portable format</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Right to opt out:</strong> Disconnect your bank accounts at any time via the Settings page</li>
                    </ul>
                    <p className="mt-2">California residents: Under CCPA, you have the right to know what personal information we collect and the right to request its deletion. We do not sell personal information.</p>
                </Section>

                <Section icon={<Mail size={22} />} title="Contact">
                    <p>For any privacy-related questions, data requests, or concerns, contact:</p>
                    <p className="mt-2">
                        <strong className="text-gray-800 dark:text-gray-100">Yury Shirokov</strong><br />
                        <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">yshirokov05@gmail.com</a>
                    </p>
                    <p className="mt-2 text-xs text-gray-500">We will respond to all verified data requests within 30 days.</p>
                </Section>
            </div>

            <p className="text-xs text-gray-400 text-center pt-4">
                This policy may be updated periodically. Continued use of Fymo after changes constitutes acceptance of the revised policy.
            </p>
        </div>
    );
};

export default PrivacyPolicy;

import React from 'react';
import { FileText, AlertTriangle, CreditCard, XCircle, Scale, Mail } from 'lucide-react';

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

const TermsOfService = () => {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <div>
                <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-slate-700 pb-4">Terms of Service</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Effective Date: June 2, 2026 · Last Updated: June 2, 2026</p>
                <p className="text-gray-600 dark:text-gray-300 mt-4 leading-relaxed">
                    These Terms of Service ("Terms") govern your use of PerfinLab, operated by Yury Shirokov. By creating an account or using the service, you agree to be bound by these Terms. If you do not agree, do not use the service.
                </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5">
                <div className="flex items-start space-x-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={22} />
                    <div>
                        <h3 className="font-bold text-amber-800 dark:text-amber-300">Important Disclaimer</h3>
                        <p className="text-amber-700 dark:text-amber-400 text-sm mt-1 leading-relaxed">
                            PerfinLab provides financial <strong>information and organizational tools only</strong>. Nothing in this application constitutes financial advice, investment advice, tax advice, or legal advice. All tax estimates are informational approximations only. Always consult a licensed financial advisor, CPA, or attorney before making financial decisions.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <Section icon={<FileText size={22} />} title="1. The Service">
                    <p>PerfinLab is a personal finance management tool that allows users to track net worth, budgets, income, debts, investments, and taxes in one place. Features include optional bank account syncing via Plaid, AI-generated financial summaries, and tax estimation tools.</p>
                    <p>We reserve the right to modify, suspend, or discontinue any part of the service at any time. We will make reasonable efforts to provide advance notice of significant changes.</p>
                </Section>

                <Section icon={<FileText size={22} />} title="2. Eligibility & Account">
                    <p>You must be at least 18 years old and a resident of the United States to use PerfinLab. By using the service, you represent that you meet these requirements.</p>
                    <p>You are responsible for maintaining the security of your account credentials. You agree to notify us immediately of any unauthorized access to your account.</p>
                    <p>You may not use the service for any unlawful purpose or in any way that could damage, disable, or impair the service.</p>
                </Section>

                <Section icon={<CreditCard size={22} />} title="3. Subscription & Billing">
                    <p>PerfinLab offers a free tier and a Premium subscription at <strong className="text-gray-800 dark:text-gray-100">$9.99/month</strong>, billed via Stripe.</p>
                    <p className="mt-2"><strong className="text-gray-800 dark:text-gray-100">Automatic renewal:</strong> Your Premium subscription <strong className="text-gray-800 dark:text-gray-100">automatically renews every month</strong> and your payment method is charged $9.99 each billing cycle until you cancel. There is no fixed end date unless you cancel.</p>
                    <p className="mt-2"><strong className="text-gray-800 dark:text-gray-100">How to cancel:</strong> Open <em>Settings → Manage Subscription</em> to launch the Stripe customer portal, where you can cancel in one click at any time, for any reason — no email or phone call required. You can do this immediately after subscribing.</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>When you cancel, you keep Premium access through the end of the current paid period; you are not charged again afterward.</li>
                        <li>We do not provide prorated refunds for partial billing periods, except where required by law.</li>
                        <li>Pricing may change with at least 30 days' notice. Continued use after a price change constitutes acceptance.</li>
                        <li>Failed payments may result in suspension of Premium features until the payment method is updated.</li>
                    </ul>
                    <p className="mt-2">All payment processing is handled by Stripe. PerfinLab does not store your credit card information.</p>
                </Section>

                <Section icon={<AlertTriangle size={22} />} title="4. No Financial, Tax, or Legal Advice">
                    <p>PerfinLab is an informational tool, not a licensed financial institution, registered investment adviser, tax preparer, or law firm.</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li><strong className="text-gray-800 dark:text-gray-100">Tax estimates</strong> are calculated using publicly available tax tables and are approximations only. They may not reflect your actual tax liability.</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">AI-generated insights</strong> are educational in nature and are not personalized investment recommendations. They do not constitute advice from a registered investment adviser.</li>
                        <li><strong className="text-gray-800 dark:text-gray-100">Net worth, budget, and portfolio calculations</strong> depend entirely on the accuracy of data you provide or that is synced from third-party sources.</li>
                    </ul>
                    <p className="mt-2">You acknowledge that all financial decisions are made at your own risk and discretion.</p>
                </Section>

                <Section icon={<FileText size={22} />} title="5. Bank Connectivity (Plaid)">
                    <p>Bank account linking is provided through Plaid Technologies, Inc. By connecting a bank account, you also agree to <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Plaid's End User Privacy Policy</a>.</p>
                    <p>PerfinLab receives read-only access to your account balances and transactions. We cannot initiate transfers or move money.</p>
                    <p>You may disconnect your bank accounts at any time via Settings → Data Management → Clear Orphaned Plaid Data, or by contacting us directly.</p>
                </Section>

                <Section icon={<Scale size={22} />} title="6. Limitation of Liability">
                    <p>To the maximum extent permitted by applicable law, PerfinLab and its operator (Yury Shirokov) shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>Financial losses resulting from reliance on app-generated data, estimates, or AI insights</li>
                        <li>Data loss due to service interruptions, bugs, or third-party failures</li>
                        <li>Inaccuracies in synced bank data provided by Plaid or financial institutions</li>
                        <li>Unauthorized access to your account resulting from your failure to protect your credentials</li>
                    </ul>
                    <p className="mt-2">Our total liability to you for any claim arising from these Terms or your use of the service shall not exceed the amount you paid us in the 3 months preceding the claim.</p>
                </Section>

                <Section icon={<XCircle size={22} />} title="7. Termination">
                    <p>You may delete your account at any time via Settings → Factory Reset Account, or by emailing us.</p>
                    <p>We reserve the right to suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or abuse the service. In the event of termination for cause, no refund will be issued.</p>
                    <p>Upon termination, your data will be deleted from our systems within 30 days, except where retention is required by law.</p>
                </Section>

                <Section icon={<FileText size={22} />} title="8. Intellectual Property">
                    <p>PerfinLab, including its code, design, branding, and content, is the intellectual property of Yury Shirokov. You may not copy, reproduce, distribute, or create derivative works without explicit written permission.</p>
                    <p>The financial data you enter remains yours. We claim no ownership over your personal financial data.</p>
                </Section>

                <Section icon={<Scale size={22} />} title="9. Copyright Complaints & Takedown">
                    <p>We respect intellectual-property rights. If you believe any content made available through PerfinLab infringes your copyright, send a written notice to <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">yshirokov05@gmail.com</a> that includes:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>Your physical or electronic signature;</li>
                        <li>Identification of the copyrighted work you claim has been infringed;</li>
                        <li>Identification of the material that is claimed to be infringing and where it is located on the service;</li>
                        <li>Your contact information (address, telephone number, and email);</li>
                        <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law; and</li>
                        <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on the owner's behalf.</li>
                    </ul>
                    <p className="mt-2">We will review valid notices and remove or disable access to allegedly infringing material where appropriate, and may terminate the accounts of repeat infringers. We will respond to counter-notices in accordance with applicable law.</p>
                </Section>

                <Section icon={<Scale size={22} />} title="10. Governing Law">
                    <p>These Terms are governed by the laws of the State of California, United States, without regard to conflict of law principles. Any disputes shall be resolved in the courts of California.</p>
                </Section>

                <Section icon={<Mail size={22} />} title="11. Contact">
                    <p>For questions about these Terms, contact:</p>
                    <p className="mt-2">
                        <strong className="text-gray-800 dark:text-gray-100">Yury Shirokov — PerfinLab</strong><br />
                        <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">yshirokov05@gmail.com</a><br />
                        <span className="text-gray-500 dark:text-gray-400">[MAILING ADDRESS — add a PO box or business address before launch]</span>
                    </p>
                </Section>
            </div>

            <p className="text-xs text-gray-400 text-center pt-4">
                These Terms may be updated periodically. Continued use of PerfinLab after changes constitutes acceptance of the revised Terms.
            </p>
        </div>
    );
};

export default TermsOfService;

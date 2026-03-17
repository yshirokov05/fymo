import React from 'react';
import { Shield, Lock, Database, Info, EyeOff } from 'lucide-react';

const DataPrivacyFAQ = () => {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">Data Privacy & Security FAQ</h2>
            
            <p className="text-gray-600 text-lg">
                We take your financial data security seriously. Here is exactly how your data is handled, stored, and protected within Financial HQ.
            </p>

            <div className="space-y-6 mt-8">
                {/* Plaid Connection */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-start space-x-4">
                        <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Will the owner or app be able to see my bank logins?</h3>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                <strong className="text-gray-800">No. Absolutely not.</strong> Financial HQ does not see, touch, or store your banking usernames or passwords. All bank connections are securely handled via <strong>Plaid</strong>, the industry standard gateway used by Venmo, Betterment, and thousands of other financial apps.
                            </p>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                When you link an account, you authenticate directly with your bank through a secure Plaid portal. Plaid then gives Financial HQ a restricted, read-only "access token" to sync your balances and transactions.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Owner Access */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-start space-x-4">
                        <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
                            <EyeOff size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Who can see my financial data?</h3>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                <strong>Only you.</strong> Financial HQ is built on Google's Firebase infrastructure with strict cryptographic rules. Your data is isolated to your specific user ID. The platform owner cannot view your personal Net Worth, Transactions, Assets, or Debts unless you specifically share your screen with them.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Encryption at Rest */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-start space-x-4">
                        <div className="bg-green-100 p-3 rounded-full text-green-600">
                            <Lock size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Is my data encrypted?</h3>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                Yes. The most sensitive pieces of information (like your Plaid access tokens) are <strong>encrypted at rest</strong> using industry-standard AES encryption (Fernet) in the database. 
                            </p>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                This means that even in the highly unlikely event of a raw database breach, the tokens are completely mathematically scrambled and useless to attackers.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Read-only Access */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-start space-x-4">
                        <div className="bg-purple-100 p-3 rounded-full text-purple-600">
                            <Database size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Can this app move my money?</h3>
                            <p className="mt-2 text-gray-600 leading-relaxed">
                                <strong>No.</strong> The Plaid access tokens granted to Financial HQ are strictly <strong>read-only</strong>. The app can read your balances and transaction history to help you budget and plan, but it fundamentally lacks the permissions required to initiate transfers or move any money.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
            
            <div className="mt-8 bg-gray-50 p-6 rounded-xl text-center border border-gray-200">
                <Info className="inline-block text-gray-400 mb-2" size={32} />
                <p className="text-gray-600 font-medium">Have more questions?</p>
                <p className="text-sm text-gray-500 mt-1">
                    Feel free to reach out to the project owner at {' '}
                    <a href="mailto:yshirokov05@gmail.com" className="text-blue-600 font-bold hover:underline">yshirokov05@gmail.com</a>
                    {' '} for any specific technical concerns regarding data security.
                </p>
            </div>
        </div>
    );
};

export default DataPrivacyFAQ;

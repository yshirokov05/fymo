import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useToast } from './Toast';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { track } from '../analytics';
import { CreditCard, RefreshCw, AlertCircle, Info } from 'lucide-react';

const PlaidLink = ({ onPlaidSuccess, updateToken, onUpdateReset, showHelper = true }) => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [linkToken, setLinkToken] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [pendingOpen, setPendingOpen] = useState(false);
    const hasFetched = useRef(false);

    const generateLinkToken = useCallback(async () => {
        if (isGenerating || hasFetched.current) return;

        setIsGenerating(true);
        setError(null);

        const timeoutId = setTimeout(() => {
            if (!hasFetched.current) {
                setIsGenerating(false);
                setError("Connection timed out. Please check if Plaid keys are set up in the backend.");
            }
        }, 45000);

        try {
            const token = await currentUser.getIdToken();
            const response = await axios.post('/api/create_link_token', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            clearTimeout(timeoutId);
            if (response.data.link_token) {
                setLinkToken(response.data.link_token);
                hasFetched.current = true;
            } else {
                throw new Error("No link token returned from server");
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Error generating link token:', err);
            setError(err.response?.data?.error || err.message);
            setPendingOpen(false);
        } finally {
            setIsGenerating(false);
        }
    }, [currentUser, isGenerating]);

    const onSuccess = useCallback(async (public_token, metadata) => {
        try {
            const token = await currentUser.getIdToken();
            const response = await axios.post('/api/set_access_token', {
                public_token,
                metadata
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (onPlaidSuccess) {
                track('plaid_link_success', { institution: metadata?.institution?.name || 'unknown' });
                onPlaidSuccess(response.data);
                showToast("Account connected successfully!", "success");
            }
        } catch (error) {
            console.error('Error exchanging public token:', error);
            showToast("Failed to connect account: " + (error.response?.data?.error || error.message), "error");
        }
    }, [currentUser, onPlaidSuccess, showToast]);

    // usePlaidLink must be called before any useEffect that references open/ready
    const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

    // Sync an externally-provided update token (e.g. "Fix Connection" flow)
    useEffect(() => {
        if (updateToken) {
            setLinkToken(updateToken);
        }
    }, [updateToken]);

    // Auto-open after an update token is ready
    useEffect(() => {
        if (ready && updateToken && linkToken === updateToken) {
            open();
            if (onUpdateReset) onUpdateReset();
        }
    }, [ready, updateToken, linkToken, open, onUpdateReset]);

    // Auto-open after user-initiated token fetch completes
    // (pendingOpen is only set true when the user explicitly clicks the button)
    useEffect(() => {
        if (ready && pendingOpen && linkToken && !updateToken) {
            setPendingOpen(false);
            open();
        }
    }, [ready, pendingOpen, linkToken, updateToken, open]);

    if (error) {
        return (
            <div className="flex flex-col space-y-2">
                <button
                    onClick={() => { hasFetched.current = false; setPendingOpen(true); generateLinkToken(); }}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all"
                >
                    <AlertCircle size={18} />
                    <span>Retry Connection</span>
                </button>
                <p className="text-[10px] text-red-400 font-medium px-1 max-w-[200px] truncate">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-2">
            <button
                onClick={() => {
                    if (ready && linkToken) {
                        open();
                    } else {
                        setPendingOpen(true);
                        generateLinkToken();
                    }
                }}
                disabled={isGenerating}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold transition-all duration-200 transform active:scale-95 ${
                    !isGenerating
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 shadow-lg hover:shadow-indigo-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                }`}
            >
                {isGenerating ? (
                    <RefreshCw size={18} className="animate-spin" />
                ) : (
                    <CreditCard size={18} />
                )}
                <span>{isGenerating ? 'Initializing...' : 'Link Financial Accounts'}</span>
            </button>
            {showHelper && (
                <div className="flex items-start space-x-1.5 text-[11px] text-gray-500 max-w-xs">
                    <Info size={12} className="mt-0.5 flex-shrink-0" />
                    <span>Secured by Plaid. Don't see your bank? Some employer 401(k)s and brokerages aren't supported — you can add them manually.</span>
                </div>
            )}
        </div>
    );
};

export default PlaidLink;

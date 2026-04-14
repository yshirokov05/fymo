import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useToast } from './Toast';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CreditCard, RefreshCw, AlertCircle } from 'lucide-react';

const PlaidLink = ({ onPlaidSuccess, updateToken, onUpdateReset }) => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [linkToken, setLinkToken] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const hasFetched = useRef(false);

    // If an update token is provided from parent, use it
    useEffect(() => {
        if (updateToken) {
            setLinkToken(updateToken);
        }
    }, [updateToken]);

    // Track whether the user has intentionally clicked "Link" so we know to
    // auto-open the Plaid dialog once the token arrives.
    const [pendingOpen, setPendingOpen] = useState(false);

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

    // Auto-open Plaid dialog once the token is ready — but ONLY if the user
    // explicitly clicked the button (pendingOpen). This prevents Plaid from
    // sending a verification SMS the moment the Settings page loads.
    useEffect(() => {
        if (ready && pendingOpen && linkToken && !updateToken) {
            setPendingOpen(false);
            open();
        }
    }, [ready, pendingOpen, linkToken, updateToken, open]);

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
                onPlaidSuccess(response.data);
                showToast("Account connected successfully!", "success");
            }
        } catch (error) {
            console.error('Error exchanging public token:', error);
            showToast("Failed to connect account: " + (error.response?.data?.error || error.message), "error");
        }
    }, [currentUser, onPlaidSuccess, showToast]);

    const config = {
        token: linkToken,
        onSuccess,
    };

    const { open, ready } = usePlaidLink(config);

    // Auto-open if we received an update token
    useEffect(() => {
        if (ready && updateToken && linkToken === updateToken) {
            open();
            if (onUpdateReset) onUpdateReset();
        }
    }, [ready, updateToken, linkToken, open, onUpdateReset]);

    if (error) {
        return (
            <div className="flex flex-col space-y-2">
                <button
                    onClick={() => { hasFetched.current = false; generateLinkToken(); }}
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
                ready && !isGenerating
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
    );
};

export default PlaidLink;

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    sendEmailVerification
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { track } from '../analytics';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Guest/demo mode. Toggled by global window events so any component can
    // enter ("continue-as-guest") or exit ("fymo:open-auth") guest mode.
    // Exposed via useAuth() so AI-feature entry points can gate themselves.
    const [isGuest, setIsGuest] = useState(false);

    // Send a guest to the auth screen. Reuses the existing global event that
    // App.js already listens for to drop guest mode and show the LandingPage.
    function promptSignIn(mode = 'signup') {
        window.dispatchEvent(new CustomEvent('fymo:open-auth', { detail: { mode } }));
    }

    function signup(email, password) {
        return createUserWithEmailAndPassword(auth, email, password)
            .then((cred) => {
                track('sign_up', { method: 'password' });
                // Fire the verification email so AI features (gated on
                // email_verified server-side) can be unlocked. Best-effort.
                try { sendEmailVerification(cred.user); } catch (_e) { /* non-fatal */ }
                return cred;
            });
    }

    function resendVerification() {
        if (auth.currentUser) {
            return sendEmailVerification(auth.currentUser);
        }
        return Promise.reject(new Error('Not signed in'));
    }

    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password)
            .then((cred) => { track('login', { method: 'password' }); return cred; });
    }

    function loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        return signInWithPopup(auth, provider)
            .then((cred) => {
                // isNewUser distinguishes a first-time Google signup from a returning login
                const isNew = cred?._tokenResponse?.isNewUser;
                track(isNew ? 'sign_up' : 'login', { method: 'google' });
                return cred;
            });
    }

    function logout() {
        return signOut(auth);
    }

    function resetPassword(email) {
        return sendPasswordResetEmail(auth, email);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            // A signed-in user is never a guest.
            if (user) setIsGuest(false);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        const handleGuest = () => setIsGuest(true);
        const handleOpenAuth = () => setIsGuest(false);
        window.addEventListener('continue-as-guest', handleGuest);
        window.addEventListener('fymo:open-auth', handleOpenAuth);
        return () => {
            window.removeEventListener('continue-as-guest', handleGuest);
            window.removeEventListener('fymo:open-auth', handleOpenAuth);
        };
    }, []);

    const value = {
        currentUser,
        isGuest,
        promptSignIn,
        login,
        signup,
        loginWithGoogle,
        logout,
        resetPassword,
        resendVerification
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

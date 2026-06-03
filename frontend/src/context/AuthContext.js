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
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
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

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ACCENT_PRESETS = [
    { id: 'blue',   label: 'Ocean',    color: '#2563eb', light: '#eff6ff', dark: '#1d4ed8', sidebar: '#3b82f6' },
    { id: 'violet', label: 'Violet',   color: '#7c3aed', light: '#f5f3ff', dark: '#6d28d9', sidebar: '#8b5cf6' },
    { id: 'emerald',label: 'Emerald',  color: '#059669', light: '#ecfdf5', dark: '#047857', sidebar: '#10b981' },
    { id: 'rose',   label: 'Rose',     color: '#e11d48', light: '#fff1f2', dark: '#be123c', sidebar: '#f43f5e' },
    { id: 'amber',  label: 'Amber',    color: '#d97706', light: '#fffbeb', dark: '#b45309', sidebar: '#f59e0b' },
];

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem('fhq-theme') === 'dark'; } catch { return false; }
    });
    const [accentId, setAccentId] = useState(() => {
        try { return localStorage.getItem('fhq-accent') || 'blue'; } catch { return 'blue'; }
    });

    const accent = ACCENT_PRESETS.find(a => a.id === accentId) || ACCENT_PRESETS[0];

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        try { localStorage.setItem('fhq-theme', isDark ? 'dark' : 'light'); } catch {}
    }, [isDark]);

    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--accent', accent.color);
        root.style.setProperty('--accent-light', accent.light);
        root.style.setProperty('--accent-dark', accent.dark);
        root.style.setProperty('--accent-sidebar', accent.sidebar);
        try { localStorage.setItem('fhq-accent', accentId); } catch {}
    }, [accentId, accent]);

    const toggleDark = () => setIsDark(d => !d);

    return (
        <ThemeContext.Provider value={{ isDark, toggleDark, accentId, setAccentId, accent }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

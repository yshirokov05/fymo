/**
 * Thin GA4 event wrapper. gtag is loaded in public/index.html (G-DPMJ663964).
 * Every call is best-effort and null-safe — analytics must never break the app
 * or throw. Use track() at conversion-funnel milestones so we can see where
 * users drop (signup → bank link → subscribe).
 */
export function track(event, params = {}) {
    try {
        // Honor the CCPA/CPRA "Do Not Sell or Share" opt-out — no events when set.
        if (isAnalyticsOptedOut()) return;
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', event, params);
        }
    } catch (_e) {
        /* swallow — analytics is non-critical */
    }
}

/** True if the user opted out OR the browser sends a Global Privacy Control signal. */
export function isAnalyticsOptedOut() {
    try {
        if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true) return true;
        return localStorage.getItem('fymo-analytics-optout') === '1';
    } catch { return false; }
}

/** Set the opt-out flag. Reloads so Google's ga-disable kill-switch takes effect. */
export function setAnalyticsOptOut(optOut) {
    try {
        if (optOut) localStorage.setItem('fymo-analytics-optout', '1');
        else localStorage.removeItem('fymo-analytics-optout');
        window.location.reload();
    } catch (_e) { /* no-op */ }
}

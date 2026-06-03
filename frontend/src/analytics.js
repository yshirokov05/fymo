/**
 * Thin GA4 event wrapper. gtag is loaded in public/index.html (G-DPMJ663964).
 * Every call is best-effort and null-safe — analytics must never break the app
 * or throw. Use track() at conversion-funnel milestones so we can see where
 * users drop (signup → bank link → subscribe).
 */
export function track(event, params = {}) {
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', event, params);
        }
    } catch (_e) {
        /* swallow — analytics is non-critical */
    }
}

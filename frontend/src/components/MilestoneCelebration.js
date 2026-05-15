import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, X } from 'lucide-react';

/**
 * MilestoneCelebration
 * ─────────────────────────────────────────────────────────────────────────────
 * Fires once when the user crosses a new net-worth milestone (or hits debt-free).
 * Backend marks the highest crossed milestone on the user doc, so this only
 * triggers the first time a threshold is passed — no spam on subsequent reloads.
 *
 * Usage:
 *   <MilestoneCelebration milestone={netWorthData?.newly_crossed_milestone} />
 *
 * When `milestone` becomes a positive number, a confetti burst fires and a
 * dismissible modal appears with a personalized headline.
 */

const MILESTONE_COPY = {
    10_000:      { headline: "First $10K!",       sub: "The hardest milestone. Real progress starts here." },
    25_000:      { headline: "$25K Net Worth",    sub: "You're stacking it. Keep going." },
    50_000:      { headline: "$50K Net Worth",    sub: "Halfway to six figures." },
    100_000:     { headline: "Six Figures!",      sub: "$100K — a major milestone. Most never get here." },
    250_000:     { headline: "Quarter Million",   sub: "$250K. Your money is doing serious work for you." },
    500_000:     { headline: "Half a Million",    sub: "$500K. The next $500K compounds faster than the first." },
    1_000_000:   { headline: "Millionaire 🎉",    sub: "$1M net worth. You did it." },
    2_500_000:   { headline: "$2.5M Net Worth",   sub: "Top 5% of US households." },
    5_000_000:   { headline: "$5M Net Worth",     sub: "Generational wealth territory." },
    10_000_000:  { headline: "$10M Net Worth",    sub: "0.1% club. Spectacular." },
};

const fireConfetti = () => {
    // Two bursts from the bottom corners for symmetric coverage
    const baseDefaults = {
        startVelocity: 35,
        spread: 60,
        ticks: 80,
        zIndex: 9999,
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'],
    };
    confetti({ ...baseDefaults, particleCount: 80, angle: 60,  origin: { x: 0, y: 0.7 } });
    confetti({ ...baseDefaults, particleCount: 80, angle: 120, origin: { x: 1, y: 0.7 } });
    // Trailing fanfare burst from center
    setTimeout(() => {
        confetti({ ...baseDefaults, particleCount: 120, spread: 90, origin: { x: 0.5, y: 0.5 } });
    }, 400);
};

const formatMilestone = (m) => {
    if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(m % 1_000_000 === 0 ? 0 : 1)}M`;
    if (m >= 1_000) return `$${(m / 1_000).toFixed(0)}K`;
    return `$${m}`;
};

const MilestoneCelebration = ({ milestone }) => {
    const [visible, setVisible] = useState(false);
    const [active, setActive] = useState(null);

    useEffect(() => {
        if (!milestone || typeof milestone !== 'number' || milestone <= 0) return;
        // Guard against re-firing on hot reload by checking sessionStorage
        const seenKey = `fymo-milestone-${milestone}-seen`;
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, '1');

        setActive(milestone);
        setVisible(true);
        // Slight delay so the modal animates in before confetti fires
        setTimeout(fireConfetti, 200);
    }, [milestone]);

    if (!visible || !active) return null;

    const copy = MILESTONE_COPY[active] || {
        headline: `${formatMilestone(active)} Net Worth!`,
        sub: 'A new high water mark for your portfolio.',
    };

    return (
        <div
            className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setVisible(false)}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-3xl shadow-2xl border-2 border-blue-200/50 dark:border-blue-500/30 p-8 md:p-10 max-w-md w-full text-center relative animate-pop-in"
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={() => setVisible(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                    aria-label="Dismiss"
                >
                    <X size={20} />
                </button>
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-5 shadow-lg shadow-amber-500/30">
                    <Trophy className="text-white" size={40} fill="white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-slate-100 mb-2">
                    {copy.headline}
                </h2>
                <p className="text-base text-gray-600 dark:text-slate-300 mb-6">
                    {copy.sub}
                </p>
                <button
                    onClick={() => setVisible(false)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                    Keep going →
                </button>
            </div>

            {/* Tailwind doesn't ship these by default — defined in index.css */}
            <style>{`
                @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
                @keyframes pop-in {
                    0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
                    60%  { opacity: 1; transform: scale(1.03) translateY(0); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.25s ease-out forwards; }
                .animate-pop-in  { animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
            `}</style>
        </div>
    );
};

export default MilestoneCelebration;

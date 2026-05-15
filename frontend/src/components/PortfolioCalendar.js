import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Calendar, DollarSign, TrendingUp, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * PortfolioCalendar
 * ─────────────────────────────────────────────────────────────────────────────
 * Upcoming dividend ex-dates and earnings dates for the user's current
 * holdings, in the next 30 days. Backend (`calendar_service.py`) fetches
 * from yfinance and caches per ticker for 12 hours.
 *
 * Lives on the Investments tab.
 */

const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso + 'T12:00:00Z');
        const today = new Date();
        const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
        const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = d.getUTCDate();
        let suffix = '';
        if (diffDays === 0) suffix = ' (today)';
        else if (diffDays === 1) suffix = ' (tomorrow)';
        else if (diffDays > 0 && diffDays <= 7) suffix = ` (in ${diffDays}d)`;
        return `${month} ${day}${suffix}`;
    } catch {
        return iso;
    }
};

const PortfolioCalendar = () => {
    const { currentUser, isGuest } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetch = useCallback(async () => {
        try {
            const headers = isGuest || !currentUser
                ? {}
                : { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
            const r = await axios.get('/api/portfolio/calendar?days=30', headers);
            setData(r.data);
        } catch {
            // Silent
        } finally {
            setLoading(false);
        }
    }, [currentUser, isGuest]);

    useEffect(() => { fetch(); }, [fetch]);

    if (loading || !data) return null;

    const dividends = data.dividends || [];
    const earnings = data.earnings || [];
    if (dividends.length === 0 && earnings.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center gap-2">
                <Calendar size={18} className="text-blue-500" />
                <h3 className="font-bold text-gray-900 dark:text-slate-100">Next 30 Days</h3>
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                    {dividends.length + earnings.length} {dividends.length + earnings.length === 1 ? 'event' : 'events'}
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-slate-700/60">
                {/* Dividends */}
                <div>
                    <div className="px-6 py-3 bg-emerald-50/40 dark:bg-emerald-500/5 border-b border-gray-100 dark:border-slate-700/60 flex items-center gap-2">
                        <DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Dividends</span>
                        {dividends.length > 0 && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto tabular-nums">
                                {dividends.length}
                            </span>
                        )}
                    </div>
                    {dividends.length === 0 ? (
                        <div className="px-6 py-4 text-xs text-gray-500 dark:text-slate-400">
                            No dividends scheduled in the next 30 days.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                            {dividends.map((d, i) => (
                                <div key={`${d.ticker}-${i}`} className="px-6 py-3 flex items-center hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{d.ticker}</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                            ex-date: {fmtDate(d.ex_date)}
                                            {d.yield_pct && <span className="ml-2 text-gray-400 dark:text-slate-500">· yield {d.yield_pct.toFixed(2)}%</span>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {d.estimated_total != null ? (
                                            <>
                                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                    +${d.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <div className="text-[10px] text-gray-400 dark:text-slate-500 tabular-nums">
                                                    ${d.amount_per_share?.toFixed(4)} × {d.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-xs text-gray-400 dark:text-slate-500">amount tbd</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Earnings */}
                <div>
                    <div className="px-6 py-3 bg-blue-50/40 dark:bg-blue-500/5 border-b border-gray-100 dark:border-slate-700/60 flex items-center gap-2">
                        <TrendingUp size={14} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Earnings</span>
                        {earnings.length > 0 && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto tabular-nums">
                                {earnings.length}
                            </span>
                        )}
                    </div>
                    {earnings.length === 0 ? (
                        <div className="px-6 py-4 text-xs text-gray-500 dark:text-slate-400">
                            No earnings reports scheduled in the next 30 days.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                            {earnings.map((e, i) => (
                                <div key={`${e.ticker}-${i}`} className="px-6 py-3 flex items-center hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{e.ticker}</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{fmtDate(e.date)}</div>
                                    </div>
                                    {e.eps_estimate != null && (
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                                ${e.eps_estimate.toFixed(2)}
                                            </div>
                                            <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">EPS est.</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="px-6 py-2.5 bg-gray-50/60 dark:bg-slate-800/40 border-t border-gray-100 dark:border-slate-700/60 text-[11px] text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
                <Info size={11} />
                Estimates based on most recent dividend + analyst consensus. yfinance data, 12h cache.
            </div>
        </div>
    );
};

export default PortfolioCalendar;

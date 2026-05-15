import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { useAuth } from '../context/AuthContext';
import InfoTip from './InfoTip';

/**
 * HealthScoreCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard card showing the user's Financial Health Score (0-100) with:
 *  • Total score with color-coded ring
 *  • Four component breakdown (savings rate, emergency fund, debt ratio, diversification)
 *  • 90-day trend sparkline from health_score_snapshots
 *
 * Backend computes everything in health_score_service.py — this component
 * just fetches and renders.
 */

const scoreColor = (score) => {
    if (score >= 80) return { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-500', ring: 'stroke-green-500' };
    if (score >= 60) return { text: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500',  ring: 'stroke-blue-500' };
    if (score >= 40) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', ring: 'stroke-amber-500' };
    return                  { text: 'text-red-600 dark:text-red-400',     bg: 'bg-red-500',   ring: 'stroke-red-500' };
};

const scoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Healthy';
    if (score >= 40) return 'Building';
    if (score >= 20) return 'Vulnerable';
    return 'Critical';
};

// Human-friendly label for the savings-rate `source` enum from
// health_score_service.py. Keep these short — they render in a tight row.
const SAVINGS_SOURCE_LABEL = {
    '90d': '90d',
    '90d_with_baseline': '90d · baseline',
    'insufficient_income': 'income not detected',
    'no_income': 'no income',
    'none': 'no data',
};

const fmtComponentValue = (key, comp) => {
    const v = comp.value;
    if (key === 'savings_rate') {
        if (v == null) {
            // Render the reason rather than just "—", so the user knows why.
            return SAVINGS_SOURCE_LABEL[comp.source] || '—';
        }
        return `${v.toFixed(1)}% (${SAVINGS_SOURCE_LABEL[comp.source] || comp.source})`;
    }
    if (key === 'emergency_fund') {
        if (v == null) return '—';
        return `${v.toFixed(1)} mo`;
    }
    if (key === 'debt_ratio') {
        if (v == null) return '—';
        return `${v.toFixed(1)}%`;
    }
    if (key === 'diversification') {
        return `${comp.count} ${comp.count === 1 ? 'category' : 'categories'}`;
    }
    return String(v ?? '—');
};

const ComponentRow = ({ k, comp }) => {
    const pct = (comp.score / comp.max) * 100;
    const accent = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div>
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-gray-700 dark:text-slate-200 flex-1 truncate">{comp.label}</span>
                <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">{fmtComponentValue(k, comp)}</span>
                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums w-12 text-right">
                    {comp.score}/{comp.max}
                </span>
                <InfoTip size={11} text={comp.description} />
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-slate-700/40 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const TrendTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white dark:bg-slate-800 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl text-xs">
            <div className="font-bold text-gray-800 dark:text-slate-100">{d.score}</div>
            <div className="text-gray-400 dark:text-slate-500 mt-0.5">{d.date}</div>
        </div>
    );
};

const HealthScoreCard = () => {
    const { currentUser, isGuest } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const fetchScore = useCallback(async () => {
        try {
            const headers = isGuest || !currentUser
                ? {}
                : { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } };
            const r = await axios.get('/api/health_score', headers);
            setData(r.data);
        } catch {
            // Silent — non-critical card
        } finally {
            setLoading(false);
        }
    }, [currentUser, isGuest]);

    useEffect(() => { fetchScore(); }, [fetchScore]);

    if (loading || !data?.current) return null;

    const current = data.current;
    const history = data.history || [];
    const colors = scoreColor(current.score);
    const label = scoreLabel(current.score);

    // SVG ring math
    const ringRadius = 54;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const dashOffset = ringCircumference * (1 - current.score / 100);

    const hasTrend = history.length >= 2;
    const trendDelta = hasTrend ? (history[history.length - 1].score - history[0].score) : 0;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
            <div className="p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-6">
                {/* Score ring */}
                <div className="flex items-center gap-5">
                    <div className="relative flex-shrink-0">
                        <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
                            <circle cx="65" cy="65" r={ringRadius} strokeWidth="9"
                                    className="stroke-gray-100 dark:stroke-slate-700/60" fill="none" />
                            <circle cx="65" cy="65" r={ringRadius} strokeWidth="9"
                                    className={`${colors.ring} transition-all duration-700`} fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={ringCircumference}
                                    strokeDashoffset={dashOffset} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-3xl font-black tabular-nums ${colors.text}`}>{current.score}</span>
                            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">/ 100</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500 mb-1 flex items-center gap-1">
                            Financial Health
                            <InfoTip size={11} text="Aggregate of four equally-weighted 25-point components: savings rate, emergency fund, debt-to-asset ratio, and diversification. Snapshotted daily." />
                        </div>
                        <div className={`text-xl font-bold ${colors.text}`}>{label}</div>
                        {hasTrend && trendDelta !== 0 && (
                            <div className={`text-xs mt-1 font-semibold ${trendDelta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {trendDelta > 0 ? '▲' : '▼'} {Math.abs(trendDelta)} points ({history.length}d)
                            </div>
                        )}
                    </div>
                </div>

                {/* Trend sparkline */}
                {hasTrend && (
                    <div className="flex-1 min-w-0 h-20">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id="healthScoreGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="currentColor" stopOpacity={0.25} className={colors.text} />
                                        <stop offset="95%" stopColor="currentColor" stopOpacity={0} className={colors.text} />
                                    </linearGradient>
                                </defs>
                                <YAxis domain={[0, 100]} hide />
                                <Tooltip content={<TrendTooltip />} cursor={false} />
                                <Area
                                    type="monotone"
                                    dataKey="score"
                                    stroke={current.score >= 80 ? '#10b981' : current.score >= 60 ? '#3b82f6' : current.score >= 40 ? '#f59e0b' : '#ef4444'}
                                    strokeWidth={2}
                                    fill="url(#healthScoreGrad)"
                                    dot={false}
                                    activeDot={{ r: 3 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Expand toggle */}
                <button
                    onClick={() => setExpanded(s => !s)}
                    className="self-stretch md:self-center flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/40 rounded-lg transition-colors flex-shrink-0"
                >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Breakdown
                </button>
            </div>

            {expanded && (
                <div className="px-6 md:px-7 pb-6 pt-2 border-t border-gray-100 dark:border-slate-700/60 space-y-4">
                    {Object.entries(current.components).map(([k, comp]) => (
                        <ComponentRow key={k} k={k} comp={comp} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default HealthScoreCard;

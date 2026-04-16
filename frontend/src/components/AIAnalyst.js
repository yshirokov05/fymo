import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Send, Bot, Sparkles, Loader2, Lock, TrendingUp, RefreshCw, Sun, Moon, Sunset, BarChart2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// ── Sub-components ──────────────────────────────────────────────────────────

const TypingDots = () => (
    <div className="flex items-center space-x-1.5 px-4 py-3">
        {[0, 1, 2].map(i => (
            <span
                key={i}
                className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
            />
        ))}
    </div>
);

const BriefSkeleton = () => (
    <div className="space-y-3 animate-pulse">
        <div className="h-3.5 bg-gray-100 rounded-full w-3/4" />
        <div className="h-3.5 bg-gray-100 rounded-full w-full" />
        <div className="h-3.5 bg-gray-100 rounded-full w-5/6" />
        <div className="h-3.5 bg-gray-100 rounded-full w-2/3" />
        <div className="h-3.5 bg-gray-100 rounded-full w-3/4 mt-4" />
        <div className="h-3.5 bg-gray-100 rounded-full w-full" />
        <div className="h-3.5 bg-gray-100 rounded-full w-4/5" />
    </div>
);

const MarketSkeleton = () => (
    <div className="space-y-3 animate-pulse">
        {[90, 75, 85, 65].map((w, i) => (
            <div key={i} className="h-3 bg-gray-700/60 rounded-full" style={{ width: `${w}%` }} />
        ))}
    </div>
);

const BriefIcon = ({ type }) => {
    const map = {
        morning:   <Sun size={18} className="text-amber-400" />,
        afternoon: <BarChart2 size={18} className="text-blue-400" />,
        evening:   <Sunset size={18} className="text-orange-400" />,
        night:     <Moon size={18} className="text-indigo-400" />,
    };
    return map[type] || map.morning;
};

// ── Main Component ───────────────────────────────────────────────────────────

const AIAnalyst = ({ isPremium, onUpgrade }) => {
    const { currentUser } = useAuth();

    const [brief, setBrief] = useState('');
    const [newsBrief, setNewsBrief] = useState('');
    const [isLoadingBrief, setIsLoadingBrief] = useState(true);
    const [isLoadingNews, setIsLoadingNews] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const [messages, setMessages] = useState([]);
    const [briefType, setBriefType] = useState('morning');
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => { scrollToBottom(); }, [messages]);

    // Set time-of-day greeting
    useEffect(() => {
        const h = new Date().getHours();
        const type = h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : h >= 22 || h < 5 ? 'night' : 'morning';
        const greet = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' }[type];
        setBriefType(type);
        setMessages([{
            role: 'assistant',
            content: `${greet}! I'm your FHQ AI Analyst, powered by Claude Sonnet. I've reviewed your portfolio, recent transactions, and today's market conditions. What would you like to explore?`
        }]);
    }, []);

    // Fetch brief in two stages
    useEffect(() => {
        if (!isPremium || !currentUser) return;

        const fetchBrief = async () => {
            setIsLoadingBrief(true);
            setIsLoadingNews(false);
            setNewsBrief('');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            try {
                const token = await currentUser.getIdToken();

                // Stage 1 — Financial overview
                const ovRes = await axios.get('/api/health_brief?section=overview', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                    timeout: 60000,
                });
                setBrief(ovRes.data.brief || '');
                if (ovRes.data.brief_type) setBriefType(ovRes.data.brief_type);
                setIsLoadingBrief(false);

                // Stage 2 — Market pulse
                setIsLoadingNews(true);
                const mkRes = await axios.get('/api/health_brief?section=news', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                    timeout: 45000,
                });
                setNewsBrief(mkRes.data.brief || '');
            } catch (err) {
                let msg = 'Analysis temporarily unavailable. Please retry.';
                if (err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('aborted')) {
                    msg = 'Analysis timed out — retry in 30 seconds.';
                } else if (err.response?.data?.error) {
                    msg = err.response.data.error;
                }
                setBrief(msg);
            } finally {
                clearTimeout(timeoutId);
                setIsLoadingBrief(false);
                setIsLoadingNews(false);
            }
        };

        fetchBrief();
    }, [currentUser, isPremium, retryCount]);

    // Chat send — accepts either a submit event or a plain string (quick prompt)
    const handleSend = async (eventOrString) => {
        if (typeof eventOrString !== 'string') eventOrString?.preventDefault();
        const msg = typeof eventOrString === 'string' ? eventOrString : input.trim();
        if (!msg || isLoading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: msg }]);
        setIsLoading(true);

        try {
            const token = await currentUser?.getIdToken();
            const res = await axios.post('/api/ask_advisor', { prompt: msg }, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.advice }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting right now. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const BRIEF_LABELS = {
        morning: 'Morning Brief',
        afternoon: 'Mid-Day Update',
        evening: 'Evening Review',
        night: 'Night Audit',
    };

    const QUICK_PROMPTS = [
        'Analyze my liquidity',
        'Review my investment allocation',
        'How much can I safely invest?',
        'Optimize my tax strategy',
        'Identify my insurance gaps',
    ];

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 pb-12">

            {/* ── Header ── */}
            <div className="bg-gradient-to-br from-gray-900 via-blue-950 to-indigo-950 rounded-2xl p-6 shadow-xl border border-blue-900/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="bg-blue-500/20 border border-blue-500/30 p-3 rounded-2xl shadow-inner">
                            <Sparkles className="text-blue-400" size={26} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">FHQ AI Analyst</h2>
                            <p className="text-blue-300/70 text-sm mt-0.5">Powered by Claude Sonnet · Real-time financial intelligence</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {isPremium ? (
                            <span className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-black uppercase tracking-widest rounded-full">
                                {BRIEF_LABELS[briefType] || 'Live'}
                            </span>
                        ) : (
                            <span className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center">
                                <Lock size={9} className="mr-1" /> Premium
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Brief + Market Pulse ── */}
            {isPremium && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Health Brief — 3 cols */}
                    <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                            <div className="flex items-center space-x-3">
                                <BriefIcon type={briefType} />
                                <h3 className="font-black text-gray-900 text-lg tracking-tight">
                                    {BRIEF_LABELS[briefType] || 'AI Brief'}
                                </h3>
                                {!isLoadingBrief && brief && (
                                    <span className="px-2 py-0.5 bg-green-50 border border-green-100 text-green-600 text-[8px] font-black uppercase tracking-widest rounded-full">
                                        Live
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setRetryCount(c => c + 1)}
                                title="Refresh brief"
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <RefreshCw size={14} className={isLoadingBrief ? 'animate-spin' : ''} />
                            </button>
                        </div>
                        <div className="p-6 flex-1">
                            {isLoadingBrief ? (
                                <BriefSkeleton />
                            ) : (
                                <div className="prose prose-sm prose-blue max-w-none text-gray-700 leading-relaxed
                                    [&_strong]:text-gray-900 [&_strong]:font-black
                                    [&_p]:mb-3 [&_p:last-child]:mb-0
                                    [&_ul]:mt-2 [&_li]:mb-1">
                                    <ReactMarkdown>{brief}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Market Pulse — 2 cols */}
                    <div className="lg:col-span-2 bg-gray-900 rounded-2xl overflow-hidden shadow-xl border border-gray-800 flex flex-col">
                        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-700/50">
                            <div className="flex items-center space-x-3">
                                <TrendingUp className="text-emerald-400" size={18} />
                                <h3 className="font-black text-white text-lg tracking-tight">Market Pulse</h3>
                            </div>
                            {!isLoadingNews && newsBrief && (
                                <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    Live
                                </span>
                            )}
                        </div>
                        <div className="p-6 flex-1">
                            {(isLoadingNews || (isLoadingBrief && !newsBrief)) ? (
                                <MarketSkeleton />
                            ) : newsBrief ? (
                                <div className="prose prose-invert prose-sm max-w-none leading-relaxed
                                    [&_strong]:text-white [&_strong]:font-black
                                    [&_p]:text-gray-300 [&_p]:mb-3 [&_p:last-child]:mb-0
                                    [&_code]:text-emerald-400 [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:rounded">
                                    <ReactMarkdown>{newsBrief}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="text-gray-600 text-sm">Awaiting brief to complete...</p>
                            )}
                        </div>
                    </div>

                </div>
            )}

            {/* ── Chat ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                {/* Chat header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="bg-gray-900 p-2 rounded-xl">
                            <Bot className="text-white" size={16} />
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900 text-sm">AI Consultation</h3>
                            <p className="text-[11px] text-gray-400">Ask about your portfolio, taxes, budget, or goals</p>
                        </div>
                    </div>
                    {isPremium && (
                        <span className="text-[9px] text-gray-400 font-medium uppercase tracking-widest">
                            {messages.length - 1} exchange{messages.length !== 2 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Messages */}
                <div className={`overflow-y-auto p-6 space-y-5 bg-gray-50/40 relative ${!isPremium ? 'max-h-[260px] overflow-hidden' : 'h-[420px]'}`}>
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex items-end gap-2.5 max-w-[82%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Avatar */}
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm ${
                                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white'
                                }`}>
                                    {m.role === 'user' ? 'Y' : 'AI'}
                                </div>
                                {/* Bubble */}
                                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                    m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                                }`}>
                                    <ReactMarkdown className="prose prose-sm max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ul>li]:mb-0.5">
                                        {m.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex items-end gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-[10px] font-black text-white shadow-sm">AI</div>
                                <div className="bg-white rounded-2xl rounded-bl-sm border border-gray-100 shadow-sm">
                                    <TypingDots />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Premium gate */}
                    {!isPremium && (
                        <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-white via-white/95 to-transparent flex items-end justify-center pb-6">
                            <div className="text-center max-w-xs px-4">
                                <div className="inline-flex bg-blue-100 p-3 rounded-full mb-3">
                                    <Lock className="text-blue-600" size={20} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 mb-1">Premium Required</h3>
                                <p className="text-gray-500 text-xs mb-4 leading-relaxed">
                                    Unlock the AI Brief and unlimited consultation powered by Claude Sonnet.
                                </p>
                                <button
                                    onClick={onUpgrade}
                                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 flex items-center mx-auto"
                                >
                                    <Sparkles size={14} className="mr-2" /> Upgrade to Premium
                                </button>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Quick prompts — visible early in conversation */}
                {isPremium && !isLoading && messages.length < 4 && (
                    <div className="px-4 pt-3 pb-2 bg-white border-t border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Quick asks</p>
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(p)}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white transition-all border border-transparent hover:border-blue-600 active:scale-95"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input bar */}
                <form
                    onSubmit={handleSend}
                    className="p-4 bg-white border-t border-gray-100 flex items-center gap-3"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={isPremium ? 'Ask about your portfolio, taxes, budget, or anything financial...' : 'Upgrade to unlock AI consultation'}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isLoading || !isPremium}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim() || !isPremium}
                        className={`p-3.5 rounded-xl transition-all ${
                            !isLoading && input.trim() && isPremium
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-95'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </form>
            </div>

        </div>
    );
};

export default AIAnalyst;

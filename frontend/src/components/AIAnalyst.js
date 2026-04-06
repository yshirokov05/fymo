import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Send, Bot, User, Sparkles, Loader2, Lock, Activity, Coffee } from 'lucide-react';
import Card from './Card';
import ReactMarkdown from 'react-markdown';

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

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const hour = new Date().getHours();
        let greeting = "Good morning!";
        let type = "morning";

        if (hour >= 12 && hour < 17) {
            greeting = "Good afternoon!";
            type = "afternoon";
        } else if (hour >= 17 && hour < 22) {
            greeting = "Good evening!";
            type = "evening";
        } else if (hour >= 22 || hour < 5) {
            greeting = "Good night!";
            type = "night";
        }

        setBriefType(type);
        setMessages([
            { role: 'assistant', content: `${greeting} I'm your AI Analyst. I've reviewed your latest transactions, checks, and market conditions. How can I assist you with your goals?` }
        ]);
    }, []);

    useEffect(() => {
        const fetchBrief = async () => {
            setIsLoadingBrief(true);
            setIsLoadingNews(false);
            setNewsBrief('');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.warn("[v2.1] AI Analyst: Request timed out at 120s mark. Forcing abort.");
                controller.abort();
            }, 120000); 

            try {
                if (!currentUser) return;
                const token = await currentUser.getIdToken();
                
                // Stage 1: Fetch Overview
                const overviewRes = await axios.get('/api/health_brief?section=overview', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                    timeout: 60000 // Increased to 60s for cold starts
                });
                setBrief(overviewRes.data.brief);
                if (overviewRes.data.brief_type) setBriefType(overviewRes.data.brief_type);
                setIsLoadingBrief(false);

                // Stage 2: Fetch News (only if Stage 1 finished successfully)
                setIsLoadingNews(true);
                const newsRes = await axios.get('/api/health_brief?section=news', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                    timeout: 45000 
                });
                setNewsBrief(newsRes.data.brief);
            } catch (error) {
                console.error("Failed to fetch brief:", error);
                
                let errorMsg = "Unable to generate your brief at this time. Please check your connection.";
                if (error.name === 'AbortError' || error.name === 'CanceledError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
                    errorMsg = "The analysis timed out. We've increased the limit, but your data may be too large. Please try again in 30 seconds.";
                } else if (error.response?.status === 500) {
                    errorMsg = "The AI Analyst encountered a server error. We've logged this for review.";
                } else if (error.response?.data?.error) {
                    errorMsg = error.response.data.error;
                }
                
                setBrief(errorMsg);
            } finally {
                clearTimeout(timeoutId);
                setIsLoadingBrief(false);
                setIsLoadingNews(false);
            }
        };
        
        if (isPremium && currentUser) {
            fetchBrief();
        }
        
        return () => {
            // Optional: Component unmount cleanup
            // We don't want to abort EVERY time if it's just a minor re-render, 
            // but for safety, we'll let existing requests finish unless component is truly gone.
        };
    }, [currentUser, isPremium, retryCount]);

    const handleRetryBrief = () => setRetryCount(prev => prev + 1);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            let headers = {};
            if (currentUser) {
                const token = await currentUser.getIdToken();
                headers = { headers: { Authorization: `Bearer ${token}` } };
            }

            const response = await axios.post('/api/ask_advisor', { prompt: userMessage }, headers);
            setMessages(prev => [...prev, { role: 'assistant', content: response.data.advice }]);
        } catch (error) {
            console.error('AI Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble analyzing right now. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto flex flex-col space-y-8 pb-12">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 flex items-center">
                        <Activity className="mr-3 text-blue-600" size={32} />
                        AI Analyst
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Personalized financial insights and strategy.</p>
                </div>
                {!isPremium && (
                    <div className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold uppercase tracking-wider border border-red-100 flex items-center">
                        <Lock size={12} className="mr-1" /> Premium Only
                    </div>
                )}
            </div>

            {/* AI Brief Section - Self-contained scroll so it doesn't push chat off screen */}
            {isPremium && (
                <div className="flex-none max-h-[40%] overflow-y-auto custom-scrollbar rounded-xl shadow-lg border border-blue-50">
                    <Card className="p-5 border-l-4 border-l-blue-600 bg-white shadow-none">
                        <div className="flex items-center space-x-2 border-b border-gray-100 pb-4 mb-4">
                            {briefType === 'morning' && <Coffee className="text-amber-600" size={24} />}
                            {briefType === 'afternoon' && <Sparkles className="text-blue-500" size={24} />}
                            {briefType === 'evening' && <Activity className="text-indigo-600" size={24} />}
                            {briefType === 'night' && <div className="text-gray-800"><Bot size={24} /></div>}
                            
                            <h3 className="text-xl font-bold text-gray-800 capitalize">
                                The {briefType} Brief
                            </h3>
                        </div>
                        {isLoadingBrief ? (
                            <div className="flex items-center space-x-3 text-gray-500">
                                <Loader2 className="animate-spin" size={20} />
                                <span className="font-medium animate-pulse">Analyzing liquidity, goals, and taxes...</span>
                            </div>
                        ) : (
                            <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed font-medium">
                                <ReactMarkdown>{brief}</ReactMarkdown>
                                
                                {/* Stage 2: News Section */}
                                {isLoadingNews ? (
                                    <div className="mt-4 flex items-center space-x-3 text-blue-500 bg-blue-50 py-2 px-3 rounded-lg border border-blue-100">
                                        <Loader2 className="animate-spin" size={16} />
                                        <span className="text-sm font-bold uppercase tracking-tight animate-pulse">Reading the headlines...</span>
                                    </div>
                                ) : newsBrief ? (
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        <ReactMarkdown>{newsBrief}</ReactMarkdown>
                                    </div>
                                ) : null}

                                {typeof brief === 'string' && (brief.includes("timed out") || brief.includes("Error") || brief.includes("404")) && (
                                    <button 
                                        onClick={handleRetryBrief}
                                        className="mt-4 text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-md hover:bg-blue-100 transition-colors font-bold uppercase tracking-wider flex items-center"
                                    >
                                        <Activity size={12} className="mr-1" /> Retry Analysis
                                    </button>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* Interactive Chat Section - Fixed height with internal scrolling for messages */}
            <Card className="flex-none flex flex-col p-0 overflow-hidden border-none shadow-xl bg-white relative h-[650px] shadow-blue-100/50 mb-8">
                <div className={`flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50 ${!isPremium ? 'max-h-[300px] overflow-hidden' : ''}`}>
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm ${m.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-gray-800 mr-3'}`}>
                                    {m.role === 'user' ? <User size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
                                </div>
                                <div className={`p-4 rounded-2xl text-md leading-relaxed ${
                                    m.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md' 
                                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-200 shadow-sm'
                                }`}>
                                    <ReactMarkdown className="prose prose-sm max-w-none">{m.content}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!isPremium && (
                        <div className="absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-white via-white/90 to-transparent flex items-center justify-center p-6 text-center">
                            <div className="max-w-sm flex flex-col items-center">
                                <div className="bg-blue-100 p-3 rounded-full mb-4">
                                    <Lock className="text-blue-600" size={24} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tight">Premium Features</h3>
                                <p className="text-gray-500 mb-4 text-xs font-medium leading-relaxed">
                                    Upgrade to access the Morning Brief and unlimited AI Consultation.
                                </p>
                                <button 
                                    onClick={onUpgrade}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center text-sm"
                                >
                                    <Sparkles size={16} className="mr-2" />
                                    Upgrade Context Engine
                                </button>
                            </div>
                        </div>
                    )}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex items-center bg-white p-4 rounded-2xl rounded-tl-none border border-gray-200 shadow-sm">
                                <Loader2 size={16} className="animate-spin mr-2 text-blue-600" />
                                <span className="text-sm text-gray-500 font-medium italic">Running deep analysis...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Suggested Prompts */}
                {isPremium && !isLoading && messages.length < 3 && (
                    <div className="px-4 py-2 bg-white flex flex-wrap gap-2">
                        {[
                            "Analyze my liquidity",
                            "Review my insurance coverage",
                            "Check my progress toward 2026 goals",
                            "How much can I safely invest today?"
                        ].map((prompt, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    setInput(prompt);
                                    // Auto-send if user clicks
                                    handleSend({ preventDefault: () => {}, target: { value: prompt } });
                                }}
                                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input Area */}
                <form 
                    onSubmit={handleSend} 
                    className="p-4 bg-white border-t border-gray-100 flex items-center space-x-4"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Discuss your morning brief, set new goals, or ask financial questions..."
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-inner"
                        disabled={isLoading || !isPremium}
                    />
                    <button 
                        type="submit"
                        disabled={isLoading || !input.trim() || !isPremium}
                        className={`p-4 rounded-xl transition-all ${
                            isLoading || !input.trim() || !isPremium
                            ? 'bg-gray-100 text-gray-400' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-95'
                        }`}
                    >
                        <Send size={20} />
                    </button>
                </form>
            </Card>
        </div>
    );
};

export default AIAnalyst;

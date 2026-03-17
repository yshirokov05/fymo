import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Send, Bot, User, Sparkles, Loader2, Lock } from 'lucide-react';
import Card from './Card';

const Advisor = ({ isPremium, onUpgrade }) => {
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState(isPremium ? [
        { role: 'assistant', content: "Hello! I'm your Financial HQ AI Advisor. I have access to your linked accounts, budgets, and tax data. How can I help you grow your wealth today?" }
    ] : [
        { role: 'assistant', content: "Hello! I'm your Financial HQ AI Advisor. I have access to your linked accounts, budgets, and tax data. How can I help you grow your wealth today?" },
        { role: 'user', content: "Can I afford a $500/month car payment based on my current budget?" },
        { role: 'assistant', content: "Based on your February transactions and your current $1,200 monthly surplus, you can comfortably afford a $500 payment. However, keep in mind this would reduce your annual savings rate from 18% to 11%." }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const token = await currentUser.getIdToken();
            const response = await axios.post('/api/ask_advisor', { prompt: userMessage }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setMessages(prev => [...prev, { role: 'assistant', content: response.data.advice }]);
        } catch (error) {
            console.error('AI Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting to my brain right now. Please try again in a moment." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 flex items-center">
                        <Sparkles className="mr-2 text-blue-600" />
                        AI Financial Advisor
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Personalized guidance based on your real-time data.</p>
                </div>
                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider border border-blue-100">
                    Beta
                </div>
            </div>

            <Card className="flex-1 flex flex-col p-0 overflow-hidden border-none shadow-xl bg-white relative">
                {/* Chat Messages */}
                <div className={`flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30 ${!isPremium ? 'max-h-[300px] overflow-hidden' : ''}`}>
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${m.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-gray-200 mr-3'}`}>
                                    {m.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-gray-600" />}
                                </div>
                                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                    m.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md' 
                                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-100 shadow-sm'
                                }`}>
                                    <div className="whitespace-pre-wrap">{m.content}</div>
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
                                <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tight">Premium Only</h3>
                                <p className="text-gray-500 mb-4 text-xs font-medium leading-relaxed">
                                    Upgrade to get personalized insights based on your real-time data.
                                </p>
                                <button 
                                    onClick={onUpgrade}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center text-sm"
                                >
                                    <Sparkles size={16} className="mr-2" />
                                    Upgrade to Premium
                                </button>
                            </div>
                        </div>
                    )}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex items-center bg-white p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm">
                                <Loader2 size={16} className="animate-spin mr-2 text-blue-600" />
                                <span className="text-sm text-gray-500 font-medium italic">Analyzing your finances...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex items-center space-x-4">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g., 'Can I afford a $500 monthly car payment?'"
                        className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className={`p-3 rounded-xl transition-all ${
                            isLoading || !input.trim() 
                            ? 'bg-gray-100 text-gray-400' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-95'
                        }`}
                    >
                        <Send size={20} />
                    </button>
                </form>
            </Card>
            
            <p className="text-center text-[10px] text-gray-400">
                FHQ Advisor provides estimations based on current data. Always consult a certified professional for legal or tax advice.
            </p>
        </div>
    );
};

export default Advisor;

import React, { useState } from 'react';
import axios from 'axios';
import { useToast } from './Toast';
import { X, Send, AlertTriangle, MessageSquare, Lightbulb } from 'lucide-react';

const FeedbackModal = ({ isOpen, onClose, userEmail, uid }) => {
  const { showToast } = useToast();
  const [topic, setTopic] = useState('BUG');
  const [content, setContent] = useState('');
  const [severity, setSeverity] = useState('LOW');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await axios.post('/api/feedback', {
        topic,
        content,
        severity
      });
      if (response.data.success) {
        setSubmitted(true);
        showToast("Feedback submitted! Thank you.", "success");
        setTimeout(() => {
          setSubmitted(false);
          setContent('');
          onClose();
        }, 2000);
      }
    } catch (error) {
      showToast("Failed to submit feedback: " + (error.response?.data?.error || error.message), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transform animate-in zoom-in-95 duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <MessageSquare size={24} />
            <h2 className="text-xl font-bold">Share Your Feedback</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {submitted ? (
            <div className="py-12 text-center space-y-4">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-green-600">
                <Send size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">Thank You!</h3>
              <p className="text-gray-500">Your feedback has been received. We'll look into it right away.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Topic</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'BUG', label: 'Bug', icon: <AlertTriangle size={16} />, color: 'text-red-600', bg: 'bg-red-50' },
                    { id: 'FEATURE', label: 'Feature', icon: <Lightbulb size={16} />, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                    { id: 'OTHER', label: 'Other', icon: <MessageSquare size={16} />, color: 'text-blue-600', bg: 'bg-blue-50' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTopic(t.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                        topic === t.id 
                          ? `border-blue-500 ${t.bg} shadow-md` 
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <span className={t.color}>{t.icon}</span>
                      <span className="text-xs font-bold mt-1 text-gray-700">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="LOW">Low - Nuance/Typo</option>
                  <option value="MEDIUM">Medium - Minor issue</option>
                  <option value="HIGH">High - Broken feature</option>
                  <option value="CRITICAL">Critical - Data loss / Crash</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Description</label>
                <textarea
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${
                    isSubmitting 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 hover:-translate-y-1 active:translate-y-0'
                  }`}
                >
                  {isSubmitting ? (
                    'Submitting...'
                  ) : (
                    <>
                      <span>Send Feedback</span>
                      <Send size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;

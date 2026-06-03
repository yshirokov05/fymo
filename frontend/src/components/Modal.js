import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children }) => {
    // A11y: close on Escape (WCAG 2.1.2 — no keyboard trap) while open.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Dialog'}
        >
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h3 className="text-xl sm:text-2xl font-semibold dark:text-gray-100">{title}</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 p-1 -m-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <X size={24} aria-hidden="true" />
                    </button>
                </div>
                <div className="overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;

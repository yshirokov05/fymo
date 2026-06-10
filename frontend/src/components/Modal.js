import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

const Modal = ({ isOpen, onClose, title, children }) => {
    const modalRef = useRef(null);
    const previousFocusRef = useRef(null);

    // Save the element that had focus before the modal opened; restore it on unmount.
    useEffect(() => {
        if (!isOpen) return;
        previousFocusRef.current = document.activeElement;
        return () => {
            previousFocusRef.current?.focus();
        };
    }, [isOpen]);

    // Move focus into the modal on open.
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
        if (focusable.length > 0) {
            focusable[0].focus();
        } else {
            modalRef.current.focus();
        }
    }, [isOpen]);

    // Escape key + focus trap.
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
                return;
            }
            if (e.key !== 'Tab' || !modalRef.current) return;
            const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTORS));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4"
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? 'modal-title' : undefined}
                aria-label={!title ? 'Dialog' : undefined}
                tabIndex={-1}
                className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col"
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h3 id="modal-title" className="text-xl sm:text-2xl font-semibold dark:text-gray-100">{title}</h3>
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

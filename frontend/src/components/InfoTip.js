import React from 'react';
import { Info } from 'lucide-react';

/**
 * InfoTip — small info icon with a real browser tooltip.
 *
 * Why this exists:
 *   lucide-react renders icons as <svg>. The `title` attribute on an SVG is NOT
 *   a hover tooltip — browsers only honour `title` on HTML elements (or a
 *   <title> CHILD element inside SVG, which lucide doesn't emit by default).
 *   Wrapping the icon in a <span title="..."> gives us a native tooltip that
 *   actually shows the text on hover. The `cursor-help` class alone produces
 *   only the question-mark cursor — which is what users were seeing.
 *
 * Usage:
 *   <InfoTip text="Sum of assets minus debts." />
 *   <InfoTip text="..." size={12} className="text-gray-500" />
 */
const InfoTip = ({ text, size = 11, className = '' }) => {
    if (!text) return null;
    return (
        <span
            title={text}
            aria-label={text}
            className={`inline-flex items-center cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ${className}`}
        >
            <Info size={size} aria-hidden="true" />
        </span>
    );
};

export default InfoTip;

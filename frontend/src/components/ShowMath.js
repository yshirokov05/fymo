import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ShowMath — collapsible transparency panel for Dashboard cards.
 *
 * Shows users exactly how each headline number is computed.
 * This is FHQ's Monarch-differentiating feature: data-forward transparency
 * instead of "trust me, the number is right."
 *
 * Props:
 *   rows: [{ label, value, indent?: bool, divider?: bool, muted?: bool, healthy?: bool|null, section?: bool, note?: string }]
 *   formula: string (optional) — the expression in plain text
 *   className: additional wrapper classes
 *
 * Row variants:
 *   - section:true     → renders as a small uppercase header that groups subsequent rows
 *                       (e.g. "Income subject to tax" / "Estimated tax")
 *   - divider:true     → thin horizontal rule
 *   - note:"..."       → small italic sub-line under the value (e.g. "7.65% × $5,359 wages")
 */
const ShowMath = ({ rows = [], formula = null, className = '' }) => {
    const [open, setOpen] = useState(false);

    if (!rows || rows.length === 0) return null;

    return (
        <div className={`mt-3 ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
                {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                <span>{open ? 'Hide math' : 'Show math'}</span>
            </button>

            {open && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700 rounded-lg font-mono text-[11px] space-y-1">
                    {rows.map((row, i) => (
                        <React.Fragment key={i}>
                            {row.divider && <div className="border-t border-gray-200 dark:border-slate-700 my-1" />}
                            {row.section ? (
                                <div className={`text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 ${i > 0 ? 'pt-2 mt-1 border-t border-gray-200 dark:border-slate-700' : ''}`}>
                                    {row.label}
                                </div>
                            ) : (
                                <div className={`flex justify-between items-start ${row.indent ? 'pl-3' : ''}`}>
                                    <span className={row.muted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}>
                                        {row.label}
                                    </span>
                                    <span className="text-right">
                                        <span className={`${row.muted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100 font-semibold'}`}>
                                            {row.value}
                                            {row.healthy === true && <span className="text-green-500 ml-1">✓</span>}
                                            {row.healthy === false && <span className="text-amber-500 ml-1">⚠</span>}
                                        </span>
                                        {row.note && (
                                            <span className="block text-[9px] text-gray-400 dark:text-gray-500 italic mt-0.5 font-normal">{row.note}</span>
                                        )}
                                    </span>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                    {formula && (
                        <div className="pt-2 mt-2 border-t border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400">
                            <span className="text-[10px] uppercase tracking-wider">Formula:</span>{' '}
                            <span>{formula}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ShowMath;

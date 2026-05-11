import React from 'react';

const Card = ({ children, title, icon, className = "", id = "" }) => {
    return (
        <div id={id} className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-6 relative ${className}`}>
            {title && (
                <div className="flex items-center mb-4">
                    {icon && <div className="mr-2.5 flex-shrink-0">{icon}</div>}
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-widest">{title}</h3>
                </div>
            )}
            <div>
                {children}
            </div>
        </div>
    );
};

export default Card;

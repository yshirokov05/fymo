import React from 'react';

const Card = ({ children, title, icon, className = "", id = "" }) => {
    return (
        <div id={id} className={`bg-white rounded-lg shadow-md p-6 relative ${className}`}>
            <div className="flex items-center mb-4">
                {icon && <div className="mr-3">{icon}</div>}
                <h3 className="text-xl font-semibold">{title}</h3>
            </div>
            <div>
                {children}
            </div>
        </div>
    );
};

export default Card;

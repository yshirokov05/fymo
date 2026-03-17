import React from 'react';

const Card = ({ children, title, icon }) => {
    return (
        <div className="bg-white rounded-lg shadow-md p-6">
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

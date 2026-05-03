import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TaxDocumentUpload = ({ onUploadSuccess, docType = 'tax' }) => {
    const { currentUser } = useAuth();
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [message, setMessage] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
        if (!allowedTypes.includes(file.type)) {
            setStatus('error');
            setMessage('Please upload a PDF, PNG, or JPEG file.');
            return;
        }

        setStatus('uploading');
        setMessage('Analyzing document with Gemini AI...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('doc_type', docType);

        try {
            let headers = {};
            if (currentUser) {
                const token = await currentUser.getIdToken(true);
                headers = {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                };
            }

            const response = await axios.post('/api/extract-document', formData, headers);
            
            if (response.data.success && response.data.data) {
                setStatus('success');
                setMessage('Data extracted successfully!');
                if (onUploadSuccess) onUploadSuccess(response.data.data);
                
                // Reset after 3 seconds
                setTimeout(() => {
                    setStatus('idle');
                    setMessage('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }, 3000);
            } else {
                throw new Error(response.data.error || 'Failed to extract data');
            }
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || error.message || 'An error occurred during extraction.');
            setTimeout(() => {
                setStatus('idle');
                setMessage('');
                if (fileInputRef.current) fileInputRef.current.value = '';
            }, 5000);
        }
    };

    return (
        <div className="w-full">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf, .png, .jpg, .jpeg" 
                className="hidden" 
            />
            
            {status === 'idle' && (
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center space-x-2 w-full py-2 px-4 border border-indigo-200 shadow-sm text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    <Upload size={18} />
                    <span>Auto-fill via Document Upload (Option)</span>
                </button>
            )}

            {status === 'uploading' && (
                <div className="flex items-center justify-center space-x-2 w-full py-2 px-4 border border-blue-200 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-50 transition-colors">
                    <Loader2 className="animate-spin" size={18} />
                    <span>{message}</span>
                </div>
            )}

            {status === 'success' && (
                <div className="flex items-center justify-center space-x-2 w-full py-2 px-4 border border-green-200 shadow-sm text-sm font-medium rounded-md text-green-700 bg-green-50 transition-colors">
                    <CheckCircle size={18} />
                    <span>{message}</span>
                </div>
            )}

            {status === 'error' && (
                <div className="flex items-center justify-center space-x-2 w-full py-2 px-4 border border-red-200 shadow-sm text-sm font-medium rounded-md text-red-700 bg-red-50 transition-colors">
                    <AlertCircle size={18} />
                    <span className="truncate max-w-[200px]" title={message}>{message}</span>
                    <button onClick={() => fileInputRef.current?.click()} className="ml-2 underline text-red-600 hover:text-red-800">Retry</button>
                </div>
            )}
            <p className="mt-2 text-[10px] text-gray-400 text-center italic">
                Privacy Notice: Documents are processed securely via Anthropic's Claude API for one-shot extraction only — we keep the extracted fields, not the file.
            </p>
        </div>
    );
};

export default TaxDocumentUpload;

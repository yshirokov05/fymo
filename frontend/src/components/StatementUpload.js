import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const StatementUpload = ({ isOpen, onClose, onUploadSuccess }) => {
    const { currentUser } = useAuth();
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [message, setMessage] = useState('');
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        const allowedTypes = ['text/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (selectedFile && (allowedTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv'))) {
            setFile(selectedFile);
            setStatus('idle');
            setMessage('');
        } else {
            setFile(null);
            setMessage('Please select a valid CSV, PDF, or Image file.');
            setStatus('error');
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setStatus('uploading');
        const formData = new FormData();
        formData.append('file', file);

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

            const response = await axios.post('/api/upload_statement', formData, headers);
            
            if (response.data.success) {
                setStatus('success');
                setMessage(response.data.message);
                if (onUploadSuccess) onUploadSuccess(response.data);
                setTimeout(() => {
                    onClose();
                    setFile(null);
                    setStatus('idle');
                }, 2000);
            } else {
                setStatus('error');
                setMessage(response.data.error || 'Upload failed.');
            }
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || 'An error occurred during upload.');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in duration-300">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
                            <Upload className="text-white" size={20} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800">Upload Statement</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors text-gray-500 hover:text-gray-800">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                            ${file ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'}
                        `}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept=".csv, .pdf, .png, .jpg, .jpeg" 
                            className="hidden" 
                        />
                        
                        {file ? (
                            <div className="flex flex-col items-center animate-in zoom-in duration-300">
                                <div className="bg-blue-100 p-4 rounded-2xl mb-4">
                                    <FileText className="text-blue-600" size={32} />
                                </div>
                                <p className="font-bold text-gray-800 text-center truncate max-w-[250px]">{file.name}</p>
                                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center">
                                <div className="bg-gray-100 p-4 rounded-2xl mb-4 group-hover:bg-blue-100 transition-colors">
                                    <Upload className="text-gray-400 group-hover:text-blue-500 transition-colors" size={32} />
                                </div>
                                <p className="font-bold text-gray-700">Click to Select File</p>
                                <p className="text-sm text-gray-400 mt-2">Upload any Bank Statement (CSV, PDF, or Image)</p>
                            </div>
                        )}
                    </div>

                    {status === 'success' && (
                        <div className="mt-6 p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center space-x-3 animate-in slide-in-from-top-2 duration-300">
                            <CheckCircle className="text-green-500 shrink-0" size={20} />
                            <p className="text-sm font-medium text-green-700">{message}</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="mt-6 p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center space-x-3 animate-in slide-in-from-top-2 duration-300">
                            <AlertCircle className="text-red-500 shrink-0" size={20} />
                            <p className="text-sm font-medium text-red-700">{message}</p>
                        </div>
                    )}

                    <div className="mt-8 flex space-x-3">
                        <button 
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            disabled={!file || status === 'uploading' || status === 'success'}
                            onClick={handleUpload}
                            className={`
                                flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center space-x-2
                                ${!file || status === 'uploading' || status === 'success' 
                                    ? 'bg-gray-300 shadow-none cursor-not-allowed' 
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}
                            `}
                        >
                            {status === 'uploading' ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    <span>{file?.name.endsWith('.csv') ? 'Importing...' : 'AI Analyzing Text...'}</span>
                                </>
                            ) : (
                                <>
                                    <Upload size={20} />
                                    <span>{file?.name.endsWith('.csv') ? 'Import Selected File' : 'Extract with Gemini AI'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
                
                <div className="bg-gray-50 p-4 border-t border-gray-100 text-center">
                    <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">Secure AES-256 Encryption at Rest</p>
                </div>
            </div>
        </div>
    );
};

export default StatementUpload;

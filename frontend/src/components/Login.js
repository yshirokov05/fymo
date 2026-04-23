import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const [message, setMessage] = useState('');
    
    const { login, signup, loginWithGoogle, resetPassword } = useAuth();

    async function handleGoogleLogin() {
        setError('');
        setLoading(true);
        try {
            await loginWithGoogle();
        } catch (err) {
            setError('Failed to log in with Google: ' + err.message);
        }
        setLoading(false);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignup) {
                await signup(email, password);
            } else {
                await login(email, password);
            }
        } catch (err) {
            setError('Failed to ' + (isSignup ? 'sign up' : 'login') + ': ' + err.message);
        }
        setLoading(false);
    }

    async function handleForgotPassword() {
        if (!email) {
            setError('Please enter your email address to reset your password.');
            return;
        }

        try {
            setMessage('');
            setError('');
            setLoading(true);
            await resetPassword(email);
            setMessage('Check your inbox for further instructions.');
        } catch (err) {
            setError('Failed to reset password: ' + err.message);
        }
        setLoading(false);
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <div className="bg-blue-600 text-white px-4 py-3 text-center text-sm font-semibold tracking-wide shadow-md">
                Wealthstack — Personal Finance Dashboard
            </div>
            
            <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {isSignup ? 'Create your account' : 'Sign in to your account'}
                    </h2>
                </div>
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}
                {message && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">{message}</div>}
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                name="email"
                                type="email"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <input
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            disabled={loading}
                            type="submit"
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            {isSignup ? 'Sign Up' : 'Sign In'}
                        </button>
                    </div>
                </form>

                {!isSignup && (
                    <div className="text-center mt-2">
                        <button 
                            onClick={handleForgotPassword}
                            disabled={loading}
                            className="bg-transparent border-0 text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:underline underline-offset-2"
                        >
                            Forgot your password?
                        </button>
                    </div>
                )}

                <div className="text-center space-y-4 pt-4">
                    <button 
                        onClick={() => setIsSignup(!isSignup)} 
                        className="block w-full text-blue-600 hover:text-blue-500 font-medium"
                    >
                        {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                    </button>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or</span>
                        </div>
                    </div>

                    <button 
                        onClick={handleGoogleLogin}
                        className="flex items-center justify-center w-full text-gray-700 bg-white border border-gray-300 py-2 rounded-md hover:bg-gray-50 font-medium"
                    >
                        <img 
                            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                            alt="Google logo" 
                            className="w-5 h-5 mr-2"
                        />
                        Sign in with Google
                    </button>

                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('continue-as-guest'))}
                        className="block w-full text-gray-600 hover:text-gray-900 font-medium border border-gray-300 py-2 rounded-md hover:bg-gray-50"
                    >
                        Continue as Guest
                    </button>
                </div>
            </div>
        </div>
    </div>
);
};

export default Login;

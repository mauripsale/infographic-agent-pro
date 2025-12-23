import React from 'react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onApiKeyClick: () => void;
  hasApiKey: boolean;
}

const Header: React.FC<HeaderProps> = ({ onApiKeyClick, hasApiKey }) => {
  const { user, signInWithGoogle, logout } = useAuth();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center">
          <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <h1 className="ml-2 text-xl font-bold text-gray-900">Infographic Agent Pro</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onApiKeyClick}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              hasApiKey 
                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 animate-pulse'
            }`}
          >
            {hasApiKey ? 'API Key Configured' : 'Set Gemini API Key'}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 hidden sm:block">{user.displayName}</span>
              <img 
                src={user.photoURL || 'https://via.placeholder.com/32'} 
                alt="User" 
                className="h-8 w-8 rounded-full border border-gray-300"
              />
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

import React from 'react';
import { ModelType } from '../types';

interface HeaderProps {
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
  isGenerating: boolean;
  isSignedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onManageApiKey: () => void;
}

export const Header: React.FC<HeaderProps> = ({ selectedModel, setSelectedModel, isGenerating, isSignedIn, onSignIn, onSignOut, onManageApiKey }) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
          Infographic Agent Pro
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onManageApiKey}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500"
          title="Change your Gemini API Key"
        >
          Manage API Key
        </button>

        <div className="h-6 w-px bg-slate-800"></div>

        <div className="flex bg-slate-800 rounded-full p-1 border border-slate-700">
          <button
            onClick={() => setSelectedModel(ModelType.FLASH)}
            disabled={isGenerating}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedModel === ModelType.FLASH 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2.5 Flash
          </button>
          <button
            onClick={() => setSelectedModel(ModelType.PRO)}
            disabled={isGenerating}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedModel === ModelType.PRO 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3 Pro
          </button>
        </div>
        
        <div className="h-6 w-px bg-slate-800"></div>

        {isSignedIn ? (
          <button
            onClick={onSignOut}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={onSignIn}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all bg-blue-600 text-white"
          >
            Sign In with Google
          </button>
        )}
      </div>
    </header>
  );
};

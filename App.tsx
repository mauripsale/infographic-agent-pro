
import React, { useState, useRef } from 'react';
import { Header } from './components/Header';
import { SlideCard } from './components/SlideCard';
import { ModelType, SlidePrompt, DetailLevel, GenerationConfig } from './types';
import { parseBatchPrompt } from './utils/promptParser';
import { generateInfographicImage, generateScriptFromSource } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'source' | 'script'>('source');
  const [sourceInput, setSourceInput] = useState('');
  const [scriptInput, setScriptInput] = useState('');
  const [groundingChunks, setGroundingChunks] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.FLASH);
  const [slides, setSlides] = useState<SlidePrompt[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [config, setConfig] = useState<GenerationConfig>({
    slideCount: 5,
    detailLevel: DetailLevel.BASIC,
    style: ''
  });

  const generationRef = useRef<boolean>(false);

  const checkAndGetApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }
  };

  const handleDraftScript = async () => {
    if (!sourceInput.trim()) {
      setError("Please provide some source text or URLs first.");
      return;
    }
    
    setIsDrafting(true);
    setError(null);
    setGroundingChunks([]);
    try {
      await checkAndGetApiKey();
      const result = await generateScriptFromSource(sourceInput, config);
      setScriptInput(result.text);
      setGroundingChunks(result.groundingChunks || []);
      setActiveTab('script');
    } catch (err: any) {
      if (err.message === 'API_KEY_RESET_REQUIRED' && window.aistudio) {
        setError("Session expired. Please re-select your API key.");
        await window.aistudio.openSelectKey();
      } else {
        setError(err.message);
      }
    } finally {
      setIsDrafting(false);
    }
  };

  const handleGenerateImages = async () => {
    if (isGenerating) return;
    
    setError(null);
    const parsedSlides = parseBatchPrompt(scriptInput);
    if (parsedSlides.length === 0) {
      setError("No infographic slides detected. Make sure the script follows the header format.");
      return;
    }

    setSlides(parsedSlides);
    setIsGenerating(true);
    generationRef.current = true;

    try {
      await checkAndGetApiKey();
      
      for (let i = 0; i < parsedSlides.length; i++) {
        if (!generationRef.current) break;

        setSlides(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'generating' } : s
        ));

        try {
          const slidePrompt = `Title: ${parsedSlides[i].title}\nContext: ${parsedSlides[i].rawContent}`;
          const imageUrl = await generateInfographicImage(slidePrompt, selectedModel);
          
          setSlides(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'completed', imageUrl } : s
          ));
        } catch (err: any) {
          if (err.message === 'API_KEY_RESET_REQUIRED' && window.aistudio) {
            setError("Session expired. Please re-select your API key.");
            await window.aistudio.openSelectKey();
            break;
          }
          
          setSlides(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'failed', error: err.message } : s
          ));
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
      generationRef.current = false;
    }
  };

  const cancelGeneration = () => {
    generationRef.current = false;
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Header 
        selectedModel={selectedModel} 
        setSelectedModel={setSelectedModel} 
        isGenerating={isGenerating || isDrafting}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Settings Sidebar */}
          <section className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-24">
              <h2 className="text-lg font-bold text-slate-100 mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Generation Settings
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Number of Slides</label>
                  <input 
                    type="range" min="1" max="15" step="1"
                    value={config.slideCount}
                    onChange={(e) => setConfig({...config, slideCount: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between mt-2 text-sm text-slate-200">
                    <span>1</span>
                    <span className="font-bold text-blue-400">{config.slideCount} Slides</span>
                    <span>15</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Detail Level</label>
                  <select 
                    value={config.detailLevel}
                    onChange={(e) => setConfig({...config, detailLevel: e.target.value as DetailLevel})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={DetailLevel.SUPER_SIMPLE}>Super Simple</option>
                    <option value={DetailLevel.BASIC}>Basic</option>
                    <option value={DetailLevel.SEMI_DETAILED}>Semi-Detailed</option>
                    <option value={DetailLevel.DETAILED}>Detailed</option>
                    <option value={DetailLevel.SUPER_DETAILED}>Super Detailed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Visual Style (Optional)</label>
                  <input 
                    type="text"
                    placeholder="e.g. Cyberpunk, Minimalist, Hand-drawn..."
                    value={config.style}
                    onChange={(e) => setConfig({...config, style: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Input Workflow Area */}
          <section className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="flex border-b border-slate-800">
                <button 
                  onClick={() => setActiveTab('source')}
                  className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'source' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  1. Source Content / URLs
                </button>
                <button 
                  onClick={() => setActiveTab('script')}
                  className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'script' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  2. Review Script
                </button>
              </div>

              <div className="p-6">
                {activeTab === 'source' ? (
                  <div className="space-y-4">
                    <textarea
                      value={sourceInput}
                      onChange={(e) => setSourceInput(e.target.value)}
                      placeholder="Paste your source text here or a list of URLs (one per line)..."
                      className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 font-sans text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />
                    <button 
                      onClick={handleDraftScript}
                      disabled={isDrafting || !sourceInput.trim()}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      {isDrafting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Drafting Presentation...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          Generate Presentation Script
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <textarea
                      value={scriptInput}
                      onChange={(e) => setScriptInput(e.target.value)}
                      placeholder="Your generated script will appear here. You can manually edit it before generating images."
                      className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />

                    {/* Grounding Sources Display as required by Gemini Search rules */}
                    {groundingChunks.length > 0 && (
                      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-800/50">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          Grounding Sources
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {groundingChunks.map((chunk, i) => (
                            chunk.web && (
                              <a 
                                key={i}
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full text-[10px] text-blue-400 hover:bg-slate-700 hover:text-blue-300 transition-colors flex items-center gap-1.5"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {chunk.web.title || chunk.web.uri}
                              </a>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4">
                      <button 
                        onClick={() => setActiveTab('source')}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-all"
                      >
                        Back to Source
                      </button>
                      <button 
                        onClick={handleGenerateImages}
                        disabled={isGenerating || !scriptInput.trim()}
                        className="flex-[2] py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-900/20"
                      >
                        {isGenerating ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Generating Infographics...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Generate Batch Graphics
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Gallery Section */}
        {slides.length > 0 && (
          <section className="space-y-6 pt-10 border-t border-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                Final Presentation
                <span className="text-sm font-medium bg-slate-900 px-3 py-1 rounded-full text-slate-400 border border-slate-800">
                  {slides.filter(s => s.status === 'completed').length} / {slides.length} Ready
                </span>
              </h2>
              {isGenerating && (
                <button onClick={cancelGeneration} className="text-sm text-red-500 hover:text-red-400 font-bold underline">
                  Stop Generation
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slides.map((slide, i) => (
                <SlideCard key={`${slide.index}-${i}`} slide={slide} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="p-12 text-center text-slate-600 text-xs border-t border-slate-900 mt-auto bg-slate-950">
        Infographic Agent Pro • Transform any content into visual stories • Powered by Gemini 3.0
      </footer>
    </div>
  );
};

export default App;
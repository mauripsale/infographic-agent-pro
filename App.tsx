


import React, { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import { Header } from './components/Header';
import { SlideCard } from './components/SlideCard';
import { ApiKeyModal } from './components/ApiKeyModal';
import { PresentationView } from './components/PresentationView';
import { ModelType, SlidePrompt, DetailLevel, GenerationConfig, AspectRatio, Language } from './types';
import { parseBatchPrompt } from './utils/promptParser';
import { generateInfographicImage, generateScriptFromSource, getApiKey, setApiKey } from './services/geminiService';
import { onAuthStateChangedHelper, signInWithGoogle, signOut, createPresentation, uploadImageToDrive, makeFilePublic, addSlide } from './services/firebaseService';
import { User } from 'firebase/auth';
import { readFileAsText, readPdfAsText } from './utils/fileReader';

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
  const [parallelGeneration, setParallelGeneration] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [presentationUrl, setPresentationUrl] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isPresentationViewOpen, setIsPresentationViewOpen] = useState(false);
  const [presentationStartIndex, setPresentationStartIndex] = useState(0);

  const handleOpenPresentation = (index: number) => {
    setPresentationStartIndex(index);
    setIsPresentationViewOpen(true);
  };

  const [config, setConfig] = useState<GenerationConfig>({
    slideCount: 5,
    detailLevel: DetailLevel.BASIC,
    style: '',
    aspectRatio: AspectRatio.SIXTEEN_NINE,
    language: Language.ENGLISH,
  });

  const generationRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChangedHelper((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      setError('Error signing in with Google.');
    }
  };

  const handleSignOut = () => {
    signOut();
  };

  const handleExport = async () => {
    setIsExporting(true);
    setPresentationUrl(null);
    setError(null);

    try {
      const presentation = await createPresentation("My Infographic Presentation");
      const presentationId = presentation.presentationId;

      const imageUploadPromises = slides.map((slide, index) => {
        return uploadImageToDrive(slide.imageUrl!, `slide-${index}.png`)
          .then(file => makeFilePublic(file.id));
      });

      const uploadedImages = await Promise.all(imageUploadPromises);

      const addSlidePromises = slides.map((slide, index) => {
        return addSlide(presentationId, slide, uploadedImages[index].webContentLink);
      });

      await Promise.all(addSlidePromises);

      setPresentationUrl(`https://docs.google.com/presentation/d/${presentationId}`);
    } catch (err: any) {
      setError(`Export failed: ${err.message}. Make sure you have entered your Firebase configuration in firebaseConfig.ts.`);
    } finally {
      setIsExporting(false);
    }
  };

  const checkAndSetApiKey = async (): Promise<boolean> => {
    const key = getApiKey();
    if (!key) {
      setIsApiKeyModalOpen(true);
      return false;
    }
    return true;
  };

  const handleSaveApiKey = (apiKey: string) => {
    setApiKey(apiKey);
    setIsApiKeyModalOpen(false);
  };

  const handleApiError = (err: any) => {
    if (err.message === 'API_KEY_REQUIRED' || err.message === 'API_KEY_INVALID') {
      setError('Your API Key is missing or invalid. Please enter a valid key.');
      setIsApiKeyModalOpen(true);
    } else {
      setError(err.message);
    }
  };

  const handleDraftScript = async () => {
    if (!sourceInput.trim()) {
      setError("Please provide some source text or URLs first.");
      return;
    }
    
    if (!(await checkAndSetApiKey())) return;

    setIsDrafting(true);
    setError(null);
    setGroundingChunks([]);
    try {
      const result = await generateScriptFromSource(sourceInput, config);
      setScriptInput(result.text);
      setGroundingChunks(result.groundingChunks || []);
      setActiveTab('script');
    } catch (err: any) {
      handleApiError(err);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleGenerateImages = async () => {
    if (isGenerating) return;
    if (!(await checkAndSetApiKey())) return;
    
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
      if (parallelGeneration) {
        setSlides(prev => prev.map(s => ({ ...s, status: 'generating' })));
        
        const promises = parsedSlides.map((slide, i) => 
          generateInfographicImage(
            `Title: ${slide.title}\nContext: ${slide.rawContent}`,
            selectedModel,
            config.aspectRatio,
          )
          .then(imageUrl => {
            if (!generationRef.current) return;
            setSlides(prev => prev.map((s, idx) => 
              idx === i ? { ...s, status: 'completed', imageUrl } : s
            ));
          })
          .catch(err => {
            if (!generationRef.current) return;
            
            let errorMessage = err.message;
            if (err.message === 'GENERATION_BLOCKED_BY_SAFETY') {
              errorMessage = "Content blocked by safety filters. Try rephrasing the prompt.";
            } else if (err.message === 'NO_IMAGE_DATA_RETURNED') {
              errorMessage = "No image generated. Please try again.";
            } else if (err.message === 'API_KEY_REQUIRED' || err.message === 'API_KEY_INVALID') {
               handleApiError(err);
               // Don't mark as failed, just stop to let user enter key
               return; 
            }

            setSlides(prev => prev.map((s, idx) => 
              idx === i ? { ...s, status: 'failed', error: errorMessage } : s
            ));
          })
        );
        
        await Promise.all(promises);

      } else { // Sequential Generation
        for (let i = 0; i < parsedSlides.length; i++) {
          if (!generationRef.current) break;

          setSlides(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'generating' } : s
          ));

          try {
            const slidePrompt = `Title: ${parsedSlides[i].title}\nContext: ${parsedSlides[i].rawContent}`;
            const imageUrl = await generateInfographicImage(slidePrompt, selectedModel, config.aspectRatio);
            
            setSlides(prev => prev.map((s, idx) => 
              idx === i ? { ...s, status: 'completed', imageUrl } : s
            ));
          } catch (err: any) {
            let errorMessage = err.message;
            
            if (err.message === 'GENERATION_BLOCKED_BY_SAFETY') {
              errorMessage = "Content blocked by safety filters. Try rephrasing.";
            } else if (err.message === 'API_KEY_REQUIRED' || err.message === 'API_KEY_INVALID') {
               handleApiError(err);
               break; // Stop sequential generation on auth error
            }

            setSlides(prev => prev.map((s, idx) => 
              idx === i ? { ...s, status: 'failed', error: errorMessage } : s
            ));
            
            // In sequential mode, we might want to continue to the next slide even if one fails for safety reasons
            if (err.message !== 'GENERATION_BLOCKED_BY_SAFETY' && err.message !== 'NO_IMAGE_DATA_RETURNED') {
               // For unknown critical errors, maybe stop? 
               // For now, let's continue to be robust.
            }
          }
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

  const handleDownloadPdf = () => {
    const [ratioWidth, ratioHeight] = config.aspectRatio.split(':').map(Number);
    const orientation = ratioWidth > ratioHeight ? 'landscape' : 'portrait';

    const doc = new jsPDF({
      orientation,
      unit: 'px',
      format: [ratioWidth * 100, ratioHeight * 100] 
    });

    slides.forEach((slide, index) => {
      if (slide.imageUrl) {
        if (index > 0) {
          doc.addPage([ratioWidth * 100, ratioHeight * 100], orientation);
        }
        doc.addImage(slide.imageUrl, 'PNG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
      }
    });

    doc.save('presentation.pdf');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await readPdfAsText(file);
      } else {
        text = await readFileAsText(file);
      }
      setSourceInput(text);
    } catch (error) {
      setError('Failed to read file.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Header 
        selectedModel={selectedModel} 
        setSelectedModel={setSelectedModel} 
        isGenerating={isGenerating || isDrafting}
        isSignedIn={!!user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onManageApiKey={() => setIsApiKeyModalOpen(true)}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={handleSaveApiKey}
      />

      <PresentationView 
        slides={slides}
        isOpen={isPresentationViewOpen}
        onClose={() => setIsPresentationViewOpen(false)}
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Aspect Ratio</label>
                  <select 
                    value={config.aspectRatio}
                    onChange={(e) => setConfig({...config, aspectRatio: e.target.value as AspectRatio})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={AspectRatio.SIXTEEN_NINE}>16:9 (Widescreen)</option>
                    <option value={AspectRatio.FOUR_THREE}>4:3 (Standard)</option>
                    <option value={AspectRatio.SQUARE}>1:1 (Square)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Language</label>
                  <select
                    value={config.language}
                    onChange={(e) => setConfig({ ...config, language: e.target.value as Language })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={Language.ENGLISH}>English</option>
                    <option value={Language.ITALIAN}>Italian</option>
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
              
                <div className="flex items-center justify-between pt-2">
                  <label htmlFor="parallel-toggle" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Parallel Generation</label>
                  <button
                    id="parallel-toggle"
                    onClick={() => setParallelGeneration(!parallelGeneration)}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
                      parallelGeneration ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                        parallelGeneration ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
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
                    <div className="flex gap-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-3 bg-slate-800 hover:.bg-slate-700 rounded-xl font-bold"
                      >
                        Upload Document
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".txt,.md,.pdf"
                      />
                      <button 
                        onClick={handleDraftScript}
                        disabled={isDrafting || !sourceInput.trim()}
                        className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                      >
                        {isDrafting ? 'Drafting...' : 'Generate Presentation Script'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <textarea
                      value={scriptInput}
                      onChange={(e) => setScriptInput(e.target.value)}
                      placeholder="Your generated script will appear here."
                      className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />

                    {groundingChunks.length > 0 && (
                      <div className="p-4 bg-slate-800/50 rounded-xl">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Grounding Sources</h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {groundingChunks.map((chunk, i) => (
                            chunk.web && (
                              <a 
                                key={i}
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-slate-900 px-2 py-1 rounded-full text-xs text-blue-400 hover:bg-slate-700"
                              >
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
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold"
                      >
                        Back
                      </button>
                      <button 
                        onClick={handleGenerateImages}
                        disabled={isGenerating || !scriptInput.trim()}
                        className="flex-[2] py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl font-bold"
                      >
                        {isGenerating ? 'Generating...' : 'Generate Graphics'}
                      </button>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="mt-4 p-4 bg-red-900/20 border-red-500/50 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {slides.length > 0 && (
          <section className="space-y-6 pt-10 border-t border-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-100">
                Final Presentation
              </h2>
              <div className="flex items-center gap-4">
                {isGenerating && (
                  <button onClick={cancelGeneration} className="text-sm text-red-500 hover:text-red-400 font-bold">
                    Stop
                  </button>
                )}
                 <div className="relative group">
                  <button
                    onClick={handleExport}
                    disabled={!user || isExporting || slides.some(s => s.status !== 'completed')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {isExporting ? 'Exporting...' : 'Export to Google Slides'}
                  </button>
                  {slides.some(s => s.status !== 'completed') &&
                    <div className="absolute bottom-full mb-2 w-48 p-2 bg-slate-700 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                      Please wait for all slides to be generated before exporting.
                    </div>
                  }
                </div>
                 <button
                    onClick={() => setIsPresentationViewOpen(true)}
                    disabled={slides.some(s => s.status !== 'completed')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    Fullscreen
                  </button>
                 <button
                    onClick={handleDownloadPdf}
                    disabled={slides.some(s => s.status !== 'completed')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50"
                  >
                    Download as PDF
                  </button>
              </div>
            </div>
            <p className="text-sm text-slate-400">
                Note: To download as a PPT, first export to Google Slides and then use the "File &gt; Download" option in Google Slides.
            </p>

            {presentationUrl && (
              <div className="mt-4 p-4 bg-green-900/20 border-green-500/50 rounded-xl text-green-400 text-sm">
                Presentation created! <a href={presentationUrl} target="_blank" rel="noopener noreferrer" className="underline">View it here</a>.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slides.map((slide, i) => (
                <SlideCard 
                  key={`${slide.index}-${i}`} 
                  slide={slide} 
                  onRegenerate={async (s) => {
                    if (isGenerating) return;
                    
                    // Optimistic update
                    setSlides(prev => prev.map(item => 
                      item.index === s.index ? { ...item, status: 'generating', error: undefined } : item
                    ));

                    try {
                      const imageUrl = await generateInfographicImage(
                        `Title: ${s.title}\nContext: ${s.rawContent}`,
                        selectedModel,
                        config.aspectRatio // Using current config might be risky if changed, but acceptable UX
                      );
                      
                      setSlides(prev => prev.map(item => 
                        item.index === s.index ? { ...item, status: 'completed', imageUrl } : item
                      ));
                    } catch (err: any) {
                      let errorMessage = err.message;
                      if (err.message === 'GENERATION_BLOCKED_BY_SAFETY') {
                        errorMessage = "Content blocked by safety filters.";
                      } else if (err.message === 'NO_IMAGE_DATA_RETURNED') {
                        errorMessage = "No image returned.";
                      } else if (err.message === 'API_KEY_REQUIRED') {
                        setIsApiKeyModalOpen(true);
                        errorMessage = "API Key required.";
                      }

                      setSlides(prev => prev.map(item => 
                        item.index === s.index ? { ...item, status: 'failed', error: errorMessage } : item
                      ));
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="p-12 text-center text-slate-600 text-xs border-t border-slate-900 mt-auto bg-slate-950">
        Infographic Agent Pro • Transform any content into visual stories • Powered by Gemini 3.0 <br/>
        by Maurizio Ipsale, GDE AI/Cloud
      </footer>
    </div>
  );
};

export default App;
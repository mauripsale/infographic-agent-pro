import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { SlideCard } from './components/SlideCard';
import { Separator } from './components/common/Separator';
import { generateScriptFromSource, generateInfographicImage, getApiKey, setApiKey } from './services/geminiService';
import { parseBatchPrompt } from './utils/promptParser';
import { readFileAsText, readPdfAsText } from './utils/fileReader';
import { SlidePrompt, ModelType, DetailLevel, AspectRatio, GenerationConfig, Language } from './types';
import { useAuth } from './context/AuthContext';

// --- Icon Components for better readability ---

const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const ResetIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
  </svg>
);

const ImagesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

const ErrorIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
  </svg>
);

function App() {
  const { user, loading } = useAuth();
  const [sourceContent, setSourceContent] = useState('');
  const [slides, setSlides] = useState<SlidePrompt[]>([]);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig>({
    slideCount: 5,
    detailLevel: DetailLevel.SEMI_DETAILED,
    style: 'professional, clean, aesthetic',
    aspectRatio: AspectRatio.SIXTEEN_NINE,
    language: Language.ENGLISH,
    model: 'gemini-2.5-flash'
  });

  useEffect(() => {
    setHasApiKey(!!getApiKey());
  }, []);

  const handleApiKeySave = (key: string) => {
    setApiKey(key);
    setHasApiKey(true);
    setIsApiKeyModalOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let text = '';
    try {
      if (file.type === 'application/pdf') {
        text = await readPdfAsText(file);
      } else {
        text = await readFileAsText(file);
      }
      setSourceContent(text);
    } catch (err) {
      console.error("File read error", err);
      setGlobalError("Failed to read file.");
    }
    // Reset file input so same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateScript = async () => {
    if (!sourceContent.trim()) return;
    
    // Check API Key
    if (!getApiKey()) {
      setIsApiKeyModalOpen(true);
      return;
    }

    setIsGeneratingScript(true);
    setSlides([]); // Clear previous slides
    setGlobalError(null);

    try {
      const result = await generateScriptFromSource(sourceContent, generationConfig);
      const parsedSlides = parseBatchPrompt(result.text);
      setSlides(parsedSlides);
    } catch (error) {
      console.error("Script generation failed:", error);
      setGlobalError("Failed to generate script. Please check your API Key and try again.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateImage = async (index: number, prompt: string) => {
    // Check API Key
    if (!getApiKey()) {
      setIsApiKeyModalOpen(true);
      return;
    }

    // Optimistic update
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, status: 'generating' } : s));

    try {
      const imageUrl = await generateInfographicImage(
        prompt, 
        ModelType.FLASH,
        generationConfig.aspectRatio
      );
      
      setSlides(prev => prev.map((s, i) => 
        i === index ? { ...s, status: 'completed', imageUrl } : s
      ));
    } catch (error: any) {
      console.error(`Image generation failed for slide ${index}:`, error);
      const errorMessage = error?.message || 'Generation failed';
      setSlides(prev => prev.map((s, i) => 
        i === index ? { ...s, status: 'failed', error: errorMessage } : s
      ));
    }
  };

  const handleGenerateAllImages = async () => {
    if (!getApiKey()) {
      setIsApiKeyModalOpen(true);
      return;
    }
    
    // Trigger generation for all slides that are not already completed or generating
    const slidesToGenerate = slides.map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.status !== 'completed' && slide.status !== 'generating');

    // Launch all requests in parallel (Flash is fast)
    await Promise.all(slidesToGenerate.map(({ slide, index }) => 
      handleGenerateImage(index, slide.rawContent)
    ));
  };

  const handleRegenerateSlide = async (index: number) => {
    const slide = slides[index];
    if (slide) {
        // Use the original rawContent as prompt for regeneration
        await handleGenerateImage(index, slide.rawContent);
    }
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to start over? Current progress will be lost.")) {
      setSourceContent('');
      setSlides([]);
      setGlobalError(null);
      setSelectedImage(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onApiKeyClick={() => setIsApiKeyModalOpen(true)} hasApiKey={hasApiKey} />
      
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {!user ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Welcome to Infographic Agent Pro
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Please sign in with your Google account to start creating amazing infographics from your documents.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {globalError && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ErrorIcon />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      {globalError}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Input Section - Only show if no slides generated yet */}
            {slides.length === 0 && (
              <section className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Source Content</h2>
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".txt,.md,.pdf"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2"
                    >
                      <UploadIcon />
                      Upload File
                    </button>
                  </div>
                </div>
                
                <textarea
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                  placeholder="Paste your document text, article, or notes here... OR upload a file (PDF/TXT)"
                  className="w-full h-48 p-4 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                />
                
                <Separator />

                {/* Configuration Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Slide Count
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={generationConfig.slideCount}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, slideCount: parseInt(e.target.value) || 5 }))}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Detail Level
                    </label>
                    <select
                      value={generationConfig.detailLevel}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, detailLevel: e.target.value as DetailLevel }))}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {Object.values(DetailLevel).map((level) => (
                        <option key={level} value={level}>
                          {level.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Aspect Ratio
                    </label>
                    <select
                      value={generationConfig.aspectRatio}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, aspectRatio: e.target.value as AspectRatio }))}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {Object.values(AspectRatio).map((ratio) => (
                        <option key={ratio} value={ratio}>{ratio}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Language
                    </label>
                    <select
                      value={generationConfig.language}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, language: e.target.value as Language }))}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value={Language.ENGLISH}>English</option>
                      <option value={Language.ITALIAN}>Italiano</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript || !sourceContent.trim()}
                    className={`px-6 py-2 rounded-md text-white font-medium ${
                      isGeneratingScript || !sourceContent.trim()
                        ? 'bg-indigo-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {isGeneratingScript ? 'Generating Script...' : 'Generate Script'}
                  </button>
                </div>
              </section>
            )}

            {/* Slides Grid Section */}
            {slides.length > 0 && (
              <section className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={handleReset}
                      className="text-gray-500 hover:text-gray-700 font-medium text-sm flex items-center gap-1"
                    >
                      <ResetIcon />
                      Start Over
                    </button>
                    <div className="h-6 w-px bg-gray-300 hidden md:block" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Generated Infographics</h2>
                      <div className="text-sm text-gray-500">
                        {slides.filter(s => s.status === 'completed').length} of {slides.length} completed
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleGenerateAllImages}
                    disabled={!slides.some(s => s.status === 'pending' || s.status === 'failed')}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImagesIcon />
                    Generate All Images
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {slides.map((slide, index) => (
                    <SlideCard
                      key={index}
                      slide={slide}
                      onRegenerate={() => handleRegenerateSlide(index)}
                      onViewFull={(s) => setSelectedImage(s.imageUrl || null)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={handleApiKeySave}
      />

      {selectedImage && (
        <ImagePreviewModal
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}

export default App;
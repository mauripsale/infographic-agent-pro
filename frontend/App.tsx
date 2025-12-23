import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ImagePreviewModal from './components/ImagePreviewModal';
import ApiKeyModal from './components/ApiKeyModal';
import PresentationView from './components/PresentationView';
import Separator from './components/common/Separator';
import { generateScriptFromSource, generateInfographicImage, getApiKey, setApiKey } from './services/geminiService';
import { parseBatchPrompt } from './utils/promptParser';
import { SlidePrompt, ModelType, DetailLevel, AspectRatio, GenerationConfig, Language } from './types';
import { useAuth } from './context/AuthContext';

function App() {
  const { user, loading } = useAuth();
  const [sourceContent, setSourceContent] = useState('');
  const [slides, setSlides] = useState<SlidePrompt[]>([]);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
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

  const handleRegenerateSlide = async (index: number) => {
    const slide = slides[index];
    if (slide) {
        // Use the original rawContent as prompt for regeneration
        await handleGenerateImage(index, slide.rawContent);
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
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      {globalError}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Input Section */}
            <section className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Source Content</h2>
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="Paste your document text, article, or notes here..."
                className="w-full h-48 p-4 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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

            {/* Presentation View (Grid of Slides) */}
            {slides.length > 0 && (
              <PresentationView 
                slides={slides} 
                onImageClick={setSelectedImage}
                onRegenerateSlide={handleRegenerateSlide}
              />
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
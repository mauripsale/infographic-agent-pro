
import React, { useState } from 'react';
import { SlidePrompt } from '../types';
import { ImagePreviewModal } from './ImagePreviewModal';

interface SlideCardProps {
  slide: SlidePrompt;
  onRegenerate?: (slide: SlidePrompt) => void;
  onViewFull?: (slide: SlidePrompt) => void;
}

export const SlideCard: React.FC<SlideCardProps> = ({ slide, onRegenerate, onViewFull }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewFull = () => {
    if (onViewFull) {
      onViewFull(slide);
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl flex flex-col group transition-all hover:border-slate-500 relative">
        <div className="relative aspect-video bg-slate-900 flex items-center justify-center cursor-pointer" onClick={slide.imageUrl ? handleViewFull : undefined}>
          {slide.imageUrl ? (
            <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
          ) : slide.status === 'generating' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-slate-400">Dreaming up slide {slide.index}...</p>
            </div>
          ) : slide.status === 'failed' ? (
            <div className="text-center px-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 mx-auto mb-2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-sm text-red-400 font-medium">Generation Failed</p>
              <p className="text-xs text-slate-500 mt-1">{slide.error}</p>
            </div>
          ) : (
            <div className="text-slate-600 italic text-sm">Waiting to start...</div>
          )}
          
          <div className="absolute top-2 right-2 flex gap-2">
             {/* Regenerate Button */}
             {onRegenerate && (slide.status === 'completed' || slide.status === 'failed') && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerate(slide);
                }}
                title="Regenerate this slide"
                className="bg-black/60 hover:bg-blue-600 backdrop-blur-md p-1.5 rounded text-white border border-white/20 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              </button>
            )}
            <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white border border-white/20">
              {slide.index} / {slide.total}
            </div>
          </div>
        </div>
        
        <div className="p-4 flex-1">
          <h3 className="font-semibold text-slate-200 line-clamp-1 group-hover:text-blue-400 transition-colors">
            {slide.title}
          </h3>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
            {slide.rawContent.substring(0, 100)}...
          </p>
        </div>

        {slide.imageUrl && (
          <div className="p-4 pt-0">
            <button 
              onClick={handleViewFull}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              View Full Image
            </button>
          </div>
        )}
      </div>

      {isModalOpen && slide.imageUrl && (
        <ImagePreviewModal imageUrl={slide.imageUrl} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
};

// components/PresentationView.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { SlidePrompt } from '../types';

interface PresentationViewProps {
  slides: SlidePrompt[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

export const PresentationView: React.FC<PresentationViewProps> = ({ 
  slides, 
  isOpen, 
  onClose,
  initialIndex = 0 
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Sync internal state with prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? slides.length - 1 : prev - 1));
  }, [slides.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToPrevious, goToNext, onClose]);

  if (!isOpen || slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] backdrop-blur-sm" onClick={onClose}>
      
      {/* Top Controls */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10" onClick={e => e.stopPropagation()}>
        <div className="text-white text-sm font-medium opacity-80">
          {currentIndex + 1} / {slides.length}
        </div>
        <button 
          onClick={onClose} 
          className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all"
          title="Close (Esc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12" onClick={(e) => e.stopPropagation()}>
        
        {/* Navigation Buttons */}
        <button 
          onClick={goToPrevious} 
          className="absolute left-4 z-20 text-white/50 hover:text-white bg-black/20 hover:bg-black/50 rounded-full p-3 transition-all hidden md:block"
          title="Previous Slide (Left Arrow)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <button 
          onClick={goToNext} 
          className="absolute right-4 z-20 text-white/50 hover:text-white bg-black/20 hover:bg-black/50 rounded-full p-3 transition-all hidden md:block"
          title="Next Slide (Right Arrow)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {/* Main Content */}
        <div className="w-full h-full flex flex-col items-center justify-center max-w-7xl mx-auto">
          {currentSlide && currentSlide.imageUrl ? (
            <img
              src={currentSlide.imageUrl}
              alt={currentSlide.title}
              className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
            />
          ) : (
            <div className="text-white/50 italic">Image not available</div>
          )}
          
          <div className="mt-6 text-center max-w-2xl px-4">
            <h2 className="text-white text-xl font-bold mb-2">{currentSlide?.title}</h2>
            <p className="text-white/70 text-sm md:text-base">{currentSlide?.rawContent}</p>
          </div>
        </div>

      </div>
    </div>
  );
};

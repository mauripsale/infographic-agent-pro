// components/PresentationView.tsx
import React, { useState } from 'react';
import { SlidePrompt } from '../types';

interface PresentationViewProps {
  slides: SlidePrompt[];
  isOpen: boolean;
  onClose: () => void;
}

export const PresentationView: React.FC<PresentationViewProps> = ({ slides, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen) {
    return null;
  }

  const goToPrevious = () => {
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? slides.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = () => {
    const isLastSlide = currentIndex === slides.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white text-4xl font-bold">&times;</button>
        
        <div className="w-11/12 h-5/6 relative">
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`absolute top-0 left-0 w-full h-full transition-opacity duration-500 ${index === currentIndex ? 'opacity-100' : 'opacity-0'}`}
            >
              <img
                src={slide.imageUrl}
                alt={slide.title}
                className="w-full h-full object-contain"
              />
            </div>
          ))}
        </div>

        <button onClick={goToPrevious} className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 rounded-full p-2 text-3xl">❮</button>
        <button onClick={goToNext} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 rounded-full p-2 text-3xl">❯</button>
      </div>
    </div>
  );
};

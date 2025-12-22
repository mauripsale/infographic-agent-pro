// components/ImagePreviewModal.tsx
import React from 'react';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="relative p-4 bg-slate-900 rounded-lg shadow-xl max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the image/modal content
      >
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 bg-red-600 hover:bg-red-700 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold z-10"
          aria-label="Close image preview"
        >
          &times;
        </button>
        <img 
          src={imageUrl} 
          alt="Full-size slide preview" 
          className="max-w-full max-h-[85vh] object-contain rounded"
        />
      </div>
    </div>
  );
};

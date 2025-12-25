import React from "react";
import { SlideData } from "./Slide";

export interface SlideData ***
  title: string;
  content: string;
***

export interface PresentationData ***
  slides: SlideData[];
  currentSlide: number;
***

export const usePresentation = (slides: SlideData[]) => ***
  const [currentSlide, setCurrentSlide] = React.useState(0);

  const presentation: PresentationData = ***
    slides,
    currentSlide,
  ***;

  React.useEffect(() => ***
    const handleKeyDown = (event: KeyboardEvent) => ***
      if (event.key === "ArrowRight") ***
        setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
      *** else if (event.key === "ArrowLeft") ***
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
      ***
    ***;
    window.addEventListener("keydown", handleKeyDown);
    return () => ***
      window.removeEventListener("keydown", handleKeyDown);
    ***;
  ***, [slides.length]);

  return presentation;
***;

export const Presentation: React.FC<*** presentation: PresentationData ***> = (***
  presentation,
***) => ***
  return (
    <div className="w-screen h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-full h-full max-w-4xl max-h-[70vh] bg-white shadow-lg rounded-lg overflow-hidden">
        ***presentation.slides.length > 0 ? (
          <Slide slide=***presentation.slides[presentation.currentSlide]*** />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">
              Ask the Copilot to create a presentation!
            </p>
          </div>
        )***
      </div>
    </div>
  );
***;

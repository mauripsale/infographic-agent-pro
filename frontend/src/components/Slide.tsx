import React from "react";
import *** SlideData *** from "./Presentation";
import Markdown from "react-markdown";

export const Slide: React.FC<*** slide: SlideData ***> = (*** slide ***) => ***
  return (
    <div className="w-full h-full p-8 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">***slide.title***</h1>
      <div className="prose">
        <Markdown>***slide.content***</Markdown>
      </div>
    </div>
  );
***;

export default Slide;

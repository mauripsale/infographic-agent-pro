"use client";

import {
  CopilotKit,
  useCopilotAction,
} from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import {
  Presentation,
  usePresentation,
  SlideData,
} from "../components/Presentation";
import { Slide } from "../components/Slide";
import "./globals.css";
import React, { useState } from "react";

export default function InfoAgent() {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const presentation = usePresentation(slides);
  const [apiKey, setApiKey] = useState("");
  const [downloadLink, setDownloadLink] = useState<string | null>(null);

  useCopilotAction({
    name: "showSlides",
    description: "Show a presentation to the user.",
    parameters: [
      {
        name: "slides",
        type: "object[]",
        description: "The slides to show.",
        attributes: [
          {
            name: "title",
            type: "string",
            description: "The title of the slide.",
          },
          {
            name: "content",
            type: "string",
            description: "The content of the slide, as markdown.",
          },
        ],
      },
      {
        name: "pptx_file_path",
        type: "string",
        description: "The path to the generated PPTX file.",
      },
    ],
    handler: async ({ slides, pptx_file_path }: { slides?: SlideData[]; pptx_file_path?: string }) => {
      if (slides) {
        setSlides(slides);
      }
      if (pptx_file_path) {
        setDownloadLink(pptx_file_path);
      }
    },
  });

  return (
    <CopilotKit
      runtimeUrl="http://localhost:8080/api/chat"
      headers={{
        "google-api-key": apiKey,
      }}
    >
      <div className="relative">
        <Presentation presentation={presentation} />
        <div className="absolute top-4 right-4 flex flex-col items-end space-y-2">
          {!apiKey ? (
            <input
              type="text"
              placeholder="Enter your Google API Key"
              className="p-2 border rounded"
              onChange={(e) => setApiKey(e.target.value)}
            />
          ) : (
            <p className="text-sm text-gray-500">API Key is set</p>
          )}
          {downloadLink && (
            <a
              href={downloadLink}
              download
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Download Presentation
            </a>
          )}
        </div>
        <CopilotPopup
          instructions="Help the user create a presentation."
          defaultOpen={true}
          labels={{
            initial: "Make a presentation",
          }}
        />
      </div>
    </CopilotKit>
  );
}

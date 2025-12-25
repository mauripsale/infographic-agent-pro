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
    ],
    handler: async ({ slides }: { slides: SlideData[] }) => {
      console.log(slides);
      setSlides(slides);
    },
  });

  return (
    <CopilotKit
      headers={{
        "google-api-key": apiKey,
      }}
    >
      <div className="relative">
        <Presentation presentation={presentation} />
        <div className="absolute top-4 right-4">
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

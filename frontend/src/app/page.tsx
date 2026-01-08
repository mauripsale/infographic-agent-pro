"use client";

import React, { useState, useEffect } from "react";
import "./globals.css";

// --- A2UI Types ---
interface ComponentDef {
  id: string;
  component: string;
  children?: string[] | { path: string; componentId: string };
  child?: string;
  text?: string | { path: string };
  action?: { name: string; context?: any };
  [key: string]: any;
}

interface SurfaceState {
  components: Record<string, ComponentDef>;
  dataModel: any;
}

// --- A2UI Renderer ---
const A2UIRenderer = ({
  surfaceState,
  componentId,
}: {
  surfaceState: SurfaceState;
  componentId: string;
}) => {
  const comp = surfaceState.components[componentId];
  if (!comp) return null;

  // Resolve Text (simple data binding support)
  const resolveText = (text: string | { path: string } | undefined) => {
    if (!text) return "";
    if (typeof text === "string") return text;
    // Simple path resolution (assumes top-level keys for now)
    if (text.path && text.path.startsWith("/")) {
        // Very basic JSON pointer implementation
        const key = text.path.substring(1); 
        return surfaceState.dataModel[key] || "";
    }
    return "";
  };

  switch (comp.component) {
    case "Column":
      return (
        <div className="flex flex-col space-y-4">
          {comp.children && Array.isArray(comp.children) &&
            comp.children.map((childId) => (
              <A2UIRenderer
                key={childId}
                surfaceState={surfaceState}
                componentId={childId}
              />
            ))}
        </div>
      );
    case "Text":
      return <p className="text-gray-800">{resolveText(comp.text)}</p>;
    case "Button":
      return (
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          onClick={() => {
            if (comp.action && comp.action.name === "download") {
                window.location.href = process.env.NEXT_PUBLIC_API_URL 
                    ? `${process.env.NEXT_PUBLIC_API_URL}${comp.action.context.url}`
                    : `http://localhost:8080${comp.action.context.url}`;
            }
          }}
        >
          <A2UIRenderer
            surfaceState={surfaceState}
            componentId={comp.child!}
          />
        </button>
      );
    default:
      return <div className="text-red-500">Unknown component: {comp.component}</div>;
  }
};

export default function A2UIAgent() {
  const [query, setQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<SurfaceState>({
    components: {},
    dataModel: {},
  });
  const [rootComponentId, setRootComponentId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStreaming(true);
    setSurfaceState({ components: {}, dataModel: {} }); // Reset state
    setRootComponentId(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://infographic-agent-backend-218788847170.us-central1.run.app";
      const response = await fetch(`${apiUrl}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, session_id: "demo-session" }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            processA2UIMessage(msg);
          } catch (err) {
            console.error("Error parsing JSONL line:", err);
          }
        }
      }
    } catch (error) {
      console.error("Stream error:", error);
    } finally {
      setIsStreaming(false);
    }
  };

  const processA2UIMessage = (msg: any) => {
    if (msg.createSurface) {
      console.log("Surface created:", msg.createSurface.surfaceId);
    }
    if (msg.updateComponents) {
      const newComponents = { ...surfaceState.components }; // Need functional update ideally
      msg.updateComponents.components.forEach((c: ComponentDef) => {
        newComponents[c.id] = c;
        if (c.id === "root") setRootComponentId("root");
      });
      setSurfaceState((prev) => ({ ...prev, components: { ...prev.components, ...newComponents } }));
    }
    if (msg.updateDataModel) {
       // Simplified update logic (only supports top level replace for demo)
       if (msg.updateDataModel.op === "replace" && msg.updateDataModel.path === "/") {
           setSurfaceState(prev => ({...prev, dataModel: msg.updateDataModel.value}));
       }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-900">
          Infographic Agent (A2UI)
        </h1>

        <form onSubmit={handleSubmit} className="mb-8 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe your presentation..."
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isStreaming ? "Generating..." : "Generate"}
          </button>
        </form>

        <div className="border-t pt-6 min-h-[300px]">
          {rootComponentId ? (
            <A2UIRenderer
              surfaceState={surfaceState}
              componentId={rootComponentId}
            />
          ) : (
            <p className="text-center text-gray-400 mt-10">
              Your generated presentation will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

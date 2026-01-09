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

// --- A2UI Renderer Component ---
const A2UIRenderer = ({
  surfaceState,
  componentId,
}: {
  surfaceState: SurfaceState;
  componentId: string;
}) => {
  const comp = surfaceState.components[componentId];
  if (!comp) return null;

  const resolveText = (text: string | { path: string } | undefined) => {
    if (!text) return "";
    if (typeof text === "string") return text;
    if (text.path && text.path.startsWith("/")) {
        const key = text.path.substring(1); 
        return surfaceState.dataModel[key] || "";
    }
    return "";
  };

  switch (comp.component) {
    case "Column":
      return (
        <div className="flex flex-col space-y-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
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
      const isHeader = comp.id.includes("header") || comp.id.includes("title");
      return (
        <p className={`${isHeader ? "text-2xl font-bold text-slate-900" : "text-lg text-slate-600"} leading-relaxed`}>
          {resolveText(comp.text)}
        </p>
      );
    case "Button":
      return (
        <button
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 transform hover:scale-105 active:scale-95"
          onClick={() => {
            if (comp.action && comp.action.name === "download") {
                window.location.href = `https://infographic-agent-backend-218788847170.us-central1.run.app${comp.action.context.url}`;
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
      return null;
  }
};

export default function App() {
  const [query, setQuery] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<SurfaceState>({
    components: {},
    dataModel: {},
  });
  const [rootComponentId, setRootComponentId] = useState<string | null>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem("google_api_key");
    if (storedKey) setApiKey(storedKey);
    else setShowSettings(true); // Show settings if no key
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("google_api_key", apiKey);
    setShowSettings(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    setIsStreaming(true);
    setSurfaceState({ components: {}, dataModel: {} });
    setRootComponentId(null);

    try {
      const response = await fetch("https://infographic-agent-backend-218788847170.us-central1.run.app/agent/stream", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey 
        },
        body: JSON.stringify({ query, session_id: "session-" + Date.now() }),
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
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) {
              try {
                processA2UIMessage(JSON.parse(line));
              } catch (e) {
                console.error("Error parsing message", e);
              }
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
    if (msg.updateComponents) {
      setSurfaceState((prev) => {
        const nextComponents = { ...prev.components };
        msg.updateComponents.components.forEach((c: any) => {
          nextComponents[c.id] = c;
          if (c.id === "root") setRootComponentId("root");
        });
        return { ...prev, components: nextComponents };
      });
    }
    if (msg.updateDataModel && msg.updateDataModel.path === "/") {
      setSurfaceState(prev => ({...prev, dataModel: msg.updateDataModel.value}));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header / Navbar */}
      <nav className="w-full border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </div>
            <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                INFO<span className="text-indigo-600">AGENT</span> PRO
            </span>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition flex items-center gap-2 px-4 py-2 rounded-full hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            {apiKey ? "Manage API Key" : "Add API Key"}
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Settings Modal-ish Panel */}
        {showSettings && (
            <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in fade-in zoom-in duration-300">
                <h2 className="text-sm font-bold text-indigo-900 uppercase tracking-widest mb-4">Configuration</h2>
                <form onSubmit={handleSaveKey} className="flex gap-3">
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Google Gemini API Key"
                        className="flex-1 p-3 bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md transition">
                        Save Key
                    </button>
                </form>
            </div>
        )}

        {/* Hero / Hero Input */}
        <section className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">What do you want to present today?</h2>
            <form onSubmit={handleSubmit} className="relative group">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="E.g. The history of space exploration in 5 slides..."
                    className="w-full p-6 pr-40 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-lg text-slate-800 placeholder-slate-400"
                    disabled={isStreaming}
                />
                <button
                    type="submit"
                    disabled={isStreaming || !apiKey}
                    className="absolute right-3 top-3 bottom-3 bg-indigo-600 text-white px-8 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all"
                >
                    {isStreaming ? "Thinking..." : "Generate"}
                </button>
            </form>
        </section>

        {/* Results Area */}
        <section className="bg-white border border-slate-200 rounded-3xl p-8 min-h-[400px] shadow-sm">
          {rootComponentId ? (
            <div className="animate-fade-in-up">
                <A2UIRenderer
                surfaceState={surfaceState}
                componentId={rootComponentId}
                />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[350px] text-slate-400">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <p className="font-medium">Waiting for your brilliant idea...</p>
                <p className="text-sm opacity-60 mt-1 text-center max-w-[250px]">Your dynamic UI will be streamed here as it's generated.</p>
            </div>
          )}
          {isStreaming && !rootComponentId && (
              <div className="flex flex-col items-center gap-4 mt-10">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-indigo-600 font-bold text-sm animate-pulse uppercase tracking-widest">Waking up the agent...</span>
              </div>
          )}
        </section>
      </main>

      <footer className="py-10 text-center text-slate-400 text-xs">
          Powered by Google ADK & A2UI Protocol • Built with Gemini 2.5
      </footer>
    </div>
  );
}
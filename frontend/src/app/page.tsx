"use client";

import React, { useState, useEffect, useRef } from "react";
import "./globals.css";

// Icons
const MonitorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 7h4"/><path d="M3 3h4"/></svg>;

// A2UI Renderer
const A2UIRenderer = ({ surfaceState, componentId }: { surfaceState: any; componentId: string }) => {
  const comp = surfaceState.components[componentId];
  if (!comp) return null;
  switch (comp.component) {
    case "Column": return <div className="flex flex-col gap-4">{comp.children?.map((id: string) => <A2UIRenderer key={id} surfaceState={surfaceState} componentId={id} />)}</div>;
    case "Text": return <p className="text-slate-300">{comp.text}</p>;
    case "Image": return <img src={comp.src} className="rounded-lg border border-slate-700 w-full" alt="Generated" />;
    default: return null;
  }
};

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [query, setQuery] = useState("");
  const [modelType, setModelType] = useState<"flash" | "pro">("flash");
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [script, setScript] = useState<any>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<any>({ components: {}, dataModel: {} });
  
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = localStorage.getItem("google_api_key");
    if (key) setApiKey(key);
  }, []);

  const handleStream = async (targetPhase: "script" | "graphics", currentScript?: any) => {
    setIsStreaming(true);
    if (targetPhase === "script") setPhase("review");
    else setPhase("graphics");

    // Auto-scroll to results
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
    try {
      const res = await fetch("https://infographic-agent-backend-218788847170.us-central1.run.app/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "X-GenAI-Model": selectedModel },
        body: JSON.stringify({ query, phase: targetPhase, script: currentScript, session_id: "s1" }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.updateComponents) {
            setSurfaceState((prev: any) => {
              const nextComps = { ...prev.components };
              msg.updateComponents.components.forEach((c: any) => nextComps[c.id] = c);
              return { ...prev, components: nextComps };
            });
          }
          if (msg.updateDataModel && msg.updateDataModel.value?.script) {
            setScript(msg.updateDataModel.value.script);
          }
        }
      }
    } catch (e) { console.error(e); } finally { setIsStreaming(false); }
  };

  const handleSlideChange = (id: string, field: string, value: string) => {
    setScript((prev: any) => ({
      ...prev,
      slides: prev.slides.map((s: any) => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      {/* Fixed Header */}
      <header className="sticky top-0 h-16 border-b border-slate-800 bg-[#030712]/90 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><MonitorIcon /></div>
          <span className="text-lg font-bold text-slate-50 tracking-tight">Infographic Agent Pro</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-1 rounded-full border border-slate-800 flex">
            <button onClick={() => setModelType("flash")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "flash" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>2.5 Flash</button>
            <button onClick={() => setModelType("pro")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "pro" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>3 Pro</button>
          </div>
          <input type="password" placeholder="API Key" value={apiKey} onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("google_api_key", e.target.value); }} className="bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5 text-xs text-slate-300 w-32 focus:w-64 transition-all outline-none" />
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 pt-10 flex flex-col gap-12">
        
        {/* SECTION 1: INPUT */}
        <section className="grid grid-cols-12 gap-8">
          {/* Sidebar */}
          <aside className="col-span-3 bg-[#111827] rounded-2xl border border-slate-800 p-6 flex flex-col gap-8 shadow-xl h-fit">
            <div className="flex items-center gap-2 text-slate-100 font-semibold border-b border-slate-800 pb-4">
              <SettingsIcon /><span className="uppercase tracking-wider text-xs">Generation Settings</span>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Slides</span>
                <span className="text-blue-400 font-bold">{numSlides}</span>
              </div>
              <input type="range" min="1" max="30" value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer accent-blue-600" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Visual Style</label>
              <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. Cyberpunk, Sketch..." className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none" />
            </div>
          </aside>

          {/* Main Area */}
          <div className="col-span-9 flex flex-col gap-6">
            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 shadow-inner min-h-[300px]">
              <textarea 
                value={query} 
                onChange={(e) => setQuery(e.target.value)} 
                placeholder="Paste your source text here..." 
                className="w-full h-full bg-transparent resize-none outline-none text-slate-300 text-lg font-mono placeholder-slate-700"
              />
            </div>
            <button 
              onClick={() => handleStream("script")}
              disabled={isStreaming || !query}
              className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isStreaming && phase === "review" ? "Generating Script..." : <><SparklesIcon /> Generate Presentation Script</>}
            </button>
          </div>
        </section>

        {/* SECTION 2: RESULTS (Review & Graphics) */}
        {(phase !== "input" || isStreaming) && (
          <section ref={resultsRef} className="mt-10 border-t border-slate-800 pt-12 animate-fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">Final Presentation</h2>
              {phase === "review" && script && (
                <button onClick={() => handleStream("graphics", script)} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-lg font-bold">Generate Graphics</button>
              )}
            </div>

            {/* Script Review Editor */}
            {phase === "review" && script && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {script.slides.map((s: any) => (
                  <div key={s.id} className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-blue-500 uppercase">{s.id}</span>
                      <button className="text-slate-500 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                    </div>
                    <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent font-bold text-white outline-none" />
                    <textarea value={s.image_prompt} onChange={(e) => handleSlideChange(s.id, "image_prompt", e.target.value)} className="bg-slate-900/50 p-2 text-xs text-slate-400 rounded outline-none h-24 resize-none" />
                  </div>
                ))}
              </div>
            )}

            {/* Graphics Rendering Area (A2UI) */}
            {phase === "graphics" && (
              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-8 shadow-2xl">
                <A2UIRenderer surfaceState={surfaceState} componentId="root" />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import "./globals.css";

// Constants
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://infographic-agent-backend-218788847170.us-central1.run.app";

// Interfaces
interface Slide {
  id: string;
  title: string;
  image_prompt: string;
  description?: string;
}

interface A2UIComponent {
  id: string;
  component: string;
  src?: string;
  text?: string;
  status?: "waiting" | "generating" | "success" | "error";
  children?: string[];
  [key: string]: any;
}

// Icons
const MonitorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 7h4"/><path d="M3 3h4"/></svg>;
const FileUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>;

// A2UI Renderer
const A2UIRenderer = ({ surfaceState, componentId }: { surfaceState: any; componentId: string }) => {
  const comp = surfaceState.components[componentId];
  if (!comp) return null;
  switch (comp.component) {
    case "Column": return <div className="flex flex-col gap-4 w-full">{comp.children?.map((id: string) => <A2UIRenderer key={id} surfaceState={surfaceState} componentId={id} />)}</div>;
    case "Text": return <p className="text-slate-300">{comp.text}</p>;
    case "Image": return <img src={comp.src} className="rounded-lg border border-slate-700 w-full shadow-2xl" alt="Generated" />;
    default: return null;
  }
};

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [query, setQuery] = useState("");
  const [modelType, setModelType] = useState<"flash" | "pro">("flash");
  
  // Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3 - Average");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [language, setLanguage] = useState("English");
  const [isParallel, setIsParallel] = useState(false);
  
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [script, setScript] = useState<any>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<any>({ components: {}, dataModel: {} });
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // UX State
  const [visiblePrompts, setVisiblePrompts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const key = localStorage.getItem("google_api_key");
    if (key) setApiKey(key);
  }, []);

  const handleStream = async (targetPhase: "script" | "graphics", currentScript?: any) => {
    setIsStreaming(true);
    
    // RESET LOGIC
    if (targetPhase === "script") {
        setPhase("review");
        setScript({
            slides: Array.from({ length: numSlides }).map((_, i) => ({
                id: `loading_${i}`,
                title: "Generating...",
                image_prompt: "..."
            }))
        });
        setSurfaceState({ components: {}, dataModel: {} });
        setVisiblePrompts({});
    } else {
        setPhase("graphics");
    }

    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
    
    let effectiveQuery = query;
    if (targetPhase === "script") {
        effectiveQuery = `[GENERATION SETTINGS] Slides: ${numSlides}, Style: ${style || "Professional"}, Detail: ${detailLevel}, AR: ${aspectRatio}, Lang: ${language}\n\n[USER REQUEST]\n${query}`;
    }

    let payloadScript = currentScript;
    if (targetPhase === "graphics" && payloadScript) {
        if (!payloadScript.global_settings) payloadScript.global_settings = {};
        payloadScript.global_settings.aspect_ratio = aspectRatio;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "X-GenAI-Model": selectedModel },
        body: JSON.stringify({ query: effectiveQuery, phase: targetPhase, script: payloadScript, session_id: "s1" }),
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
          try {
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
          } catch(e) { console.error("JSON Parse Error", e); }
        }
      }
    } catch (e) { console.error(e); } finally { setIsStreaming(false); }
  };

  const startScriptGen = () => {
    if (script || Object.keys(surfaceState.components).length > 0) {
        setShowConfirm(true);
    } else {
        handleStream("script");
    }
  };

  const handleExport = async (fmt: "zip" | "pdf") => {
    if (!surfaceState.components) return;
    setIsExporting(true);
    const imgUrls = Object.values(surfaceState.components)
        .filter((c: any) => c.component === "Image")
        .map((c: any) => (c as A2UIComponent).src?.replace(BACKEND_URL, "")); 

    if (imgUrls.length === 0) {
        alert("No images generated yet.");
        setIsExporting(false);
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/agent/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({ images: imgUrls, format: fmt })
        });
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank");
        else alert("Export failed.");
    } catch(e) { console.error(e); alert("Export error"); }
    finally { setIsExporting(false); }
  };

  const handleSlideChange = (id: string, field: string, value: string) => {
    setScript((prev: any) => ({
      ...prev,
      slides: prev.slides.map((s: Slide) => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const togglePrompt = (id: string) => {
      setVisiblePrompts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative">
      
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Start New Presentation?</h3>
                <p className="text-slate-400 mb-6">Current results will be cleared. Export your images first if you want to keep them.</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-slate-300 hover:text-white font-medium">Cancel</button>
                    <button onClick={() => { setShowConfirm(false); handleStream("script"); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">Start New</button>
                </div>
            </div>
        </div>
      )}

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

      <div className="max-w-7xl mx-auto px-6 pt-10 flex flex-col gap-12">
        <section className="grid grid-cols-12 gap-8">
          <aside className="col-span-3 bg-[#111827] rounded-2xl border border-slate-800 p-6 flex flex-col gap-6 shadow-xl h-fit">
            <div className="flex items-center gap-2 text-slate-100 font-semibold border-b border-slate-800 pb-4"><SettingsIcon /><span className="uppercase tracking-wider text-xs">Settings</span></div>
            <div>
              <div className="flex justify-between text-sm mb-3"><span>Slides</span><span className="text-blue-400 font-bold">{numSlides}</span></div>
              <input type="range" min="1" max="30" value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer accent-blue-600" />
            </div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Detail</label><select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option>1 - Super Simple</option><option>2 - Basic</option><option>3 - Average</option><option>4 - Detailed</option><option>5 - Super Detailed</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Format</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option value="16:9">16:9 (Wide)</option><option value="4:3">4:3 (Standard)</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Lang</label><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option>English</option><option>Italian</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Style</label><input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. Minimalist" className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none" /></div>
          </aside>

          <div className="col-span-9 flex flex-col gap-6">
            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 min-h-[300px]">
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe your infographic topic..." className="w-full h-full bg-transparent resize-none outline-none text-slate-300 text-lg font-mono" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => alert("Soon!")} className="w-[20%] bg-slate-900 border border-slate-700 text-slate-300 py-4 rounded-xl flex items-center justify-center gap-2 transition-all"><FileUpIcon /> Upload</button>
              <button onClick={startScriptGen} disabled={isStreaming || !query} className="w-[80%] bg-blue-600 py-4 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">{isStreaming && phase === "review" ? "Generating..." : <><SparklesIcon /> Generate Script</>}</button>
            </div>
          </div>
        </section>

        {(phase !== "input" || isStreaming) && (
          <section ref={resultsRef} className="mt-10 border-t border-slate-800 pt-12 animate-fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">Production Grid</h2>
              <div className="flex gap-4">
                {phase === "graphics" && !isStreaming && (
                    <><button onClick={() => handleExport("zip")} disabled={isExporting} className="bg-slate-800 px-4 py-2 rounded-lg text-sm transition-colors">ZIP</button>
                    <button onClick={() => handleExport("pdf")} disabled={isExporting} className="bg-slate-800 px-4 py-2 rounded-lg text-sm transition-colors">PDF</button></>
                )}
                {phase === "review" && script && (<button onClick={() => handleStream("graphics", script)} className="bg-green-600 px-8 py-3 rounded-lg font-bold shadow-lg">Generate Graphics</button>)}
              </div>
            </div>

            {script && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {script.slides.map((s: Slide) => {
                  const cardComp = surfaceState.components[`card_${s.id}`] as A2UIComponent | undefined;
                  const imageComponent = surfaceState.components[`img_${s.id}`] as A2UIComponent | undefined;
                  const isGenerating = cardComp?.status === "generating";
                  const hasError = cardComp?.status === "error";
                  const showPrompt = visiblePrompts[s.id] || !imageComponent;

                  return (
                  <div key={s.id} className={`bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl relative overflow-hidden ${isGenerating ? "ring-2 ring-blue-500/50" : ""}`}>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 z-10 relative">
                      <span className="text-xs font-bold text-blue-500 uppercase">{s.id}</span>
                      {imageComponent && (
                          <button onClick={() => togglePrompt(s.id)} className={`text-xs flex items-center gap-1 ${showPrompt ? "text-blue-400" : "text-slate-500"}`}>
                              <span>{showPrompt ? "Hide" : "Prompt"}</span>
                          </button>
                      )}
                    </div>
                    <div className="flex-1 min-h-[200px] flex flex-col gap-3">
                        {imageComponent && !showPrompt ? (
                            <div className="animate-fade-in h-full"><img src={imageComponent.src} className="w-full h-full object-cover rounded-lg" alt={s.title} /></div>
                        ) : (
                            <div className="flex flex-col gap-2 h-full">
                                <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent font-bold text-white outline-none" />
                                <textarea value={s.image_prompt} onChange={(e) => handleSlideChange(s.id, "image_prompt", e.target.value)} className="bg-slate-900/50 p-2 text-xs text-slate-400 rounded outline-none flex-1 resize-none" />
                            </div>
                        )}
                    </div>
                    {isGenerating && (
                        <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-20 animate-pulse">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            <span className="text-xs font-bold text-blue-400 uppercase">Sketching...</span>
                        </div>
                    )}
                    {hasError && (
                         <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center z-20"><span className="text-xs font-bold text-red-200">FAILED</span></div>
                    )}
                  </div>
                )})
              }
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
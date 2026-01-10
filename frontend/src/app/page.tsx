"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 7h4"/><path d="M3 3h4"/></svg>;
const FileUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>;
const RefreshIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
const ChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>;
const ChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;

// --- Shared Stream Helper ---
const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, onMessage: (msg: any) => void) => {
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
                onMessage(msg);
            } catch (e) {
                console.error("JSON Parse Error in Stream:", e, "Line:", line);
            }
        }
    }
};

// --- A2UI Renderer ---
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // UX State
  const [visiblePrompts, setVisiblePrompts] = useState<Record<string, boolean>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const key = localStorage.getItem("google_api_key");
    if (key) setApiKey(key);
  }, []);

  // --- Keyboard Nav for Lightbox ---
  const navigateLightbox = useCallback((dir: number) => {
      if (!script || lightboxIndex === null) return;
      const newIndex = lightboxIndex + dir;
      if (newIndex >= 0 && newIndex < script.slides.length) {
          setLightboxIndex(newIndex);
      }
  }, [script, lightboxIndex]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (lightboxIndex === null) return;
          if (e.key === "ArrowLeft") navigateLightbox(-1);
          if (e.key === "ArrowRight") navigateLightbox(1);
          if (e.key === "Escape") setLightboxIndex(null);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, navigateLightbox]); 

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsStreaming(false);
      }
  };

  const retrySlide = async (slideId: string) => {
      const slide = script.slides.find((s: Slide) => s.id === slideId);
      if (!slide) return;
      
      setSurfaceState((prev: any) => ({
          ...prev,
          components: {
              ...prev.components,
              [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "generating", text: "Retrying..." }
          }
      }));

      // Determine model based on current selection
      const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";

      try {
          const res = await fetch(`${BACKEND_URL}/agent/regenerate_slide`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json", 
                  "x-goog-api-key": apiKey,
                  "X-GenAI-Model": selectedModel // FIXED: Send selected model
              },
              body: JSON.stringify({
                  slide_id: slideId, 
                  image_prompt: slide.image_prompt,
                  aspect_ratio: aspectRatio 
              })
          });
          
          await processStream(res.body!.getReader(), (msg) => {
              if (msg.updateComponents) {
                  setSurfaceState((prev: any) => {
                      const nextComps = { ...prev.components };
                      msg.updateComponents.components.forEach((c: any) => nextComps[c.id] = c);
                      return { ...prev, components: nextComps };
                  });
              }
          });

      } catch (e) {
          console.error("Retry failed", e);
          setSurfaceState((prev: any) => ({
              ...prev,
              components: {
                  ...prev.components,
                  [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "error", text: "Retry Failed" }
              }
          }));
      }
  };

  const handleStream = async (targetPhase: "script" | "graphics", currentScript?: any) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    
    if (targetPhase === "script") {
        setPhase("review");
        setScript({
            slides: Array.from({ length: numSlides }).map((_, i) => ({
                id: `loading_${i}`,
                title: "Generating…",
                image_prompt: "…"
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
        effectiveQuery = `
[GENERATION SETTINGS]
Slides: ${numSlides}
Style: ${style || "Professional"}
Detail Level: ${detailLevel}
Aspect Ratio: ${aspectRatio}
Language: ${language}

[USER REQUEST]
${query}`;
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
        signal: abortController.signal
      });
      
      await processStream(res.body!.getReader(), (msg) => {
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
      });

    } catch (e: any) { 
        if (e.name !== 'AbortError') console.error("Stream error:", e); 
    } finally { 
        setIsStreaming(false); 
        abortControllerRef.current = null;
    }
  };

  const startScriptGen = () => {
    if (script || Object.keys(surfaceState.components).length > 0) {
        setShowConfirm(true);
    } else {
        handleStream("script");
    }
  };

  const handleExport = async (fmt: "zip" | "pdf") => {
    if (!surfaceState.components || !script) return; // Need script for ordering
    setIsExporting(true);
    
    // FIXED: Build ordered list based on script slides
    const imgUrls = script.slides.map((s: Slide) => {
        const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
        return comp ? comp.src?.replace(BACKEND_URL, "") : null;
    }).filter((url: string | null) => url !== null);

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
    } catch(e) { console.error("Export error:", e); alert("Export error"); }
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
      
      {/* Lightbox Modal */}
      {lightboxIndex !== null && script && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl animate-fade-in focus:outline-none">
              <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all z-20">
                  <XIcon />
              </button>
              
              <button onClick={() => navigateLightbox(-1)} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 transition-all z-20 hidden md:block">
                  <ChevronLeft />
              </button>
              
              <button onClick={() => navigateLightbox(1)} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 transition-all z-20 hidden md:block">
                  <ChevronRight />
              </button>

              <div className="w-full h-full p-4 md:p-20 flex flex-col items-center justify-center">
                  {(() => {
                      const slide = script.slides[lightboxIndex];
                      const imgComp = surfaceState.components[`img_${slide.id}`] as A2UIComponent;
                      return imgComp ? (
                          <div className="relative w-full h-full max-w-7xl flex items-center justify-center group">
                              <img src={imgComp.src} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt={slide.title} />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4 md:p-6 backdrop-blur-md translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{slide.title}</h2>
                                  <p className="text-sm text-slate-300 max-w-4xl line-clamp-3">{slide.description || slide.image_prompt}</p>
                              </div>
                          </div>
                      ) : (
                          <div className="text-slate-500 animate-pulse">Image not ready...</div>
                      );
                  })()}
              </div>
              
              {/* Mobile Swipe Hints (Invisible touch areas) */}
              <div className="absolute inset-y-0 left-0 w-24 md:hidden z-10" onClick={() => navigateLightbox(-1)}></div>
              <div className="absolute inset-y-0 right-0 w-24 md:hidden z-10" onClick={() => navigateLightbox(1)}></div>
          </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Start New Presentation?</h3>
                <p className="text-slate-400 mb-6">You have unsaved content. Starting a new generation will clear your current script and images.</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-slate-300 hover:text-white font-medium">Cancel</button>
                    <button onClick={() => { setShowConfirm(false); handleStream("script"); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">Start New</button>
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 h-16 border-b border-slate-800 bg-[#030712]/90 backdrop-blur-md z-40 flex items-center justify-between px-6">
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pt-10 flex flex-col gap-12">
        <section className="grid grid-cols-12 gap-8">
          <aside className="col-span-3 bg-[#111827] rounded-2xl border border-slate-800 p-6 flex flex-col gap-6 shadow-xl h-fit">
            <div className="flex items-center gap-2 text-slate-100 font-semibold border-b border-slate-800 pb-4">
              <SettingsIcon /><span className="uppercase tracking-wider text-xs">Settings</span>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-3"><span className="text-slate-400">Slides</span><span className="text-blue-400 font-bold bg-blue-900/30 px-2 py-0.5 rounded text-xs">{numSlides}</span></div>
              <input type="range" min="1" max="30" value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer accent-blue-600" />
            </div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Detail</label><select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option>1 - Super Simple</option><option>2 - Basic</option><option>3 - Average</option><option>4 - Detailed</option><option>5 - Super Detailed</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Format</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option value="16:9">16:9 (Wide)</option><option value="4:3">4:3 (Standard)</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Lang</label><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option>English</option><option>Italian</option></select></div>
            <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Style</label><input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. Minimalist" className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none" /></div>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800"><span className="text-sm text-slate-300">Parallel Gen</span><div onClick={() => setIsParallel(!isParallel)} className={`w-10 h-5 rounded-full relative cursor-pointer border transition-colors ${isParallel ? "bg-blue-600/20 border-blue-500" : "bg-slate-800 border-slate-700"}`><div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isParallel ? "right-1 bg-blue-500" : "left-1 bg-slate-500"}`}></div></div></div>
          </aside>

          <div className="col-span-9 flex flex-col gap-6">
            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 shadow-inner min-h-[300px]">
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe your topic..." className="w-full h-full bg-transparent resize-none outline-none text-slate-300 text-lg font-mono placeholder-slate-700" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => alert("Soon!")} className="w-[20%] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium py-4 rounded-xl flex items-center justify-center gap-2 transition-all"><FileUpIcon /> Upload</button>
              <button onClick={startScriptGen} disabled={isStreaming || !query} className="w-[80%] bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2">{isStreaming && phase === "review" ? "Generating..." : <><SparklesIcon /> Generate Script</>}</button>
            </div>
          </div>
        </section>

        {(phase !== "input" || isStreaming) && (
          <section ref={resultsRef} className="mt-10 border-t border-slate-800 pt-12 animate-fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">Final Presentation</h2>
              <div className="flex gap-4">
                {isStreaming && (<button onClick={handleStop} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg animate-pulse flex items-center gap-2">STOP</button>)}
                {phase === "graphics" && !isStreaming && (
                    <><button onClick={() => handleExport("zip")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold">ZIP</button>
                    <button onClick={() => handleExport("pdf")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold">PDF</button></>
                )}
                {phase === "review" && script && (<button onClick={() => handleStream("graphics", script)} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-900/20">Generate Graphics</button>)}
              </div>
            </div>

            {script && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {script.slides.map((s: Slide, idx: number) => {
                  const cardComp = surfaceState.components[`card_${s.id}`];
                  const imageComponent = surfaceState.components[`img_${s.id}`];
                  const isGenerating = cardComp?.status === "generating";
                  const hasError = cardComp?.status === "error";
                  const isLoadingScript = s.id.startsWith("loading_");
                  
                  if (isLoadingScript) return <div key={s.id} className="bg-[#111827] border border-slate-800 rounded-xl p-4 h-64 animate-pulse"></div>;

                  return (
                  <div key={s.id} className={`bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl transition-all relative overflow-hidden group ${isGenerating ? "ring-2 ring-blue-500" : ""}`}>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 z-10 relative">
                      <span className="text-xs font-bold text-blue-500 uppercase">{s.id}</span>
                      {imageComponent && <button onClick={() => togglePrompt(s.id)} className="text-slate-500 hover:text-white text-[10px] uppercase">Prompt</button>}
                    </div>
                    <div className="flex-1 flex flex-col gap-3">
                        {imageComponent && !visiblePrompts[s.id] ? (
                            <div className="relative group min-h-[200px] bg-slate-900 rounded-lg overflow-hidden animate-fade-in flex items-center justify-center cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                                <img src={imageComponent.src} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={s.title} />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <EyeIcon /> <span className="ml-2 font-bold text-white">View</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 h-full">
                                <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent font-bold text-white outline-none border-b border-transparent focus:border-blue-500" />
                                <textarea value={s.image_prompt} onChange={(e) => handleSlideChange(s.id, "image_prompt", e.target.value)} className="bg-slate-900/50 p-2 text-xs text-slate-400 rounded outline-none h-32 resize-none border border-transparent focus:border-blue-500 custom-scrollbar" />
                            </div>
                        )}
                    </div>
                    {isGenerating && <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-20 animate-pulse"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div><span className="text-xs font-bold text-blue-400">DRAWING...</span></div>}
                    {hasError && <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center z-20"><span className="text-xs font-bold text-red-200">FAILED</span><button onClick={() => retrySlide(s.id)} className="mt-2 text-[10px] underline text-white">Retry</button></div>}
                    
                    {/* Hover Footer */}
                    {imageComponent && !visiblePrompts[s.id] && (
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 right-4 z-10">
                            <button onClick={(e) => { e.stopPropagation(); retrySlide(s.id); }} className="bg-slate-800 p-2 rounded-full hover:bg-white/10 text-white transition-colors" title="Regenerate">
                                <RefreshIcon />
                            </button>
                        </div>
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

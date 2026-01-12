"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";

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

// Icons (Standardized sizes for mobile)
const MonitorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 7h4"/><path d="M3 3h4"/></svg>;
const FileUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>;
const RefreshIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
const ChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>;
const ChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
const MaximizeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>;
const PaintBrushIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.375 2.625a3.875 3.875 0 0 0-5.5 0l-9 9a3.875 3.875 0 0 0 0 5.5l3.375 3.375a3.875 3.875 0 0 0 5.5 0l9-9a3.875 3.875 0 0 0 0-5.5l-3.375-3.375Z"/><path d="M14.5 6.5 17.5 9.5"/><path d="m2 22 5-5"/></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>;
const GoogleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
const KeyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
const ChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const ChevronUp = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>;

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

export default function App() {
  const { user, loading: authLoading, login, logout, getToken } = useAuth();
  
  const [query, setQuery] = useState("");
  const [modelType, setModelType] = useState<"flash" | "pro">("flash");
  
  // Settings & Auth State
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); 
  const [showSettings, setShowSettings] = useState(false);
  const [inputApiKey, setInputApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  
  // Mobile UX
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // Generation Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3 - Average");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [language, setLanguage] = useState("English");
  
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [script, setScript] = useState<any>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<any>({ components: {}, dataModel: {} });
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  
  // UX State
  const [visiblePrompts, setVisiblePrompts] = useState<Record<string, boolean>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Check for API Key on auth load
  useEffect(() => {
    if (user) checkSettings();
  }, [user]);

  const checkSettings = async () => {
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/settings`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await res.json();
          setHasApiKey(data.has_api_key);
          if (!data.has_api_key) setShowSettings(true); // Force open if missing
      } catch (e) {
          console.error("Failed to check settings", e);
      }
  };

  const saveSettings = async () => {
      if (!inputApiKey.startsWith("AIza")) {
          alert("Invalid API Key format. Must start with 'AIza'.");
          return;
      }
      setIsSavingKey(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/settings`, {
              method: "POST",
              headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}` 
              },
              body: JSON.stringify({ api_key: inputApiKey })
          });
          if (res.ok) {
              setHasApiKey(true);
              setShowSettings(false);
              setInputApiKey(""); 
              alert("API Key saved securely!");
          } else {
              const err = await res.json();
              alert(`Error: ${err.detail}`);
          }
      } catch (e) {
          console.error("Save failed", e);
          alert("Failed to save API Key.");
      } finally {
          setIsSavingKey(false);
      }
  };

  // Lightbox Navigation
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

  const toggleFullscreen = () => {
      if (!lightboxRef.current) return;
      if (!document.fullscreenElement) {
          lightboxRef.current.requestFullscreen().catch(err => console.error(err));
      } else {
          document.exitFullscreen();
      }
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsStreaming(false);
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setUploadedFile(e.target.files[0]);
          if (!query) setQuery(`Summarize ${e.target.files[0].name} into an infographic presentation.`);
      }
  };

  const retrySlide = async (slideId: string) => {
      if (!hasApiKey) { setShowSettings(true); return; }
      const slide = script.slides.find((s: Slide) => s.id === slideId);
      if (!slide) return;
      
      setSurfaceState((prev: any) => ({
          ...prev,
          components: {
              ...prev.components,
              [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "generating", text: "Generating..." }
          }
      }));

      const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
      const token = await getToken();

      try {
          const res = await fetch(`${BACKEND_URL}/agent/regenerate_slide`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json", 
                  "X-GenAI-Model": selectedModel,
                  "Authorization": `Bearer ${token}`
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
    if (!hasApiKey) { setShowSettings(true); return; }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    const token = await getToken();
    
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
    let fileContentId = null;

    if (targetPhase === "script" && uploadedFile) {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        try {
            const uploadRes = await fetch(`${BACKEND_URL}/agent/upload`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            const uploadData = await uploadRes.json();
            if (uploadData.file_id) fileContentId = uploadData.file_id;
            else throw new Error("Upload failed");
        } catch (e) {
            console.error("Upload failed", e);
            alert("Document upload failed. Proceeding with text only.");
        }
    }

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
        headers: {
            "Content-Type": "application/json", 
            "X-GenAI-Model": selectedModel,
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            query: effectiveQuery, 
            phase: targetPhase, 
            script: payloadScript, 
            session_id: "s1",
            file_id: fileContentId
        }),
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
    if (!hasApiKey) { setShowSettings(true); return; }
    if (script || Object.keys(surfaceState.components).length > 0) {
        setShowConfirm(true);
    } else {
        handleStream("script");
    }
  };

  const handleExport = async (fmt: "zip" | "pdf") => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (!surfaceState.components || !script) return;
    setIsExporting(true);
    const token = await getToken();
    
    const imgUrls = script.slides.map((s: Slide) => {
        const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
        return comp ? comp.src : null;
    }).filter((url: string | null) => url !== null);

    if (imgUrls.length === 0) {
        alert("No images generated yet.");
        setIsExporting(false);
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/agent/export`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ images: imgUrls, format: fmt })
        });
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank");
        else alert("Export failed. Please check server logs.");
    } catch(e) { 
        console.error("Export error:", e);
        alert("Network error during export. Try again.");
    }
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

  if (authLoading) return <div className="min-h-screen bg-[#030712] flex items-center justify-center text-white font-bold animate-pulse">Loading Identity...</div>;
  
  if (!user) {
      return (
          <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-[#111827] border border-slate-800 p-10 rounded-3xl shadow-2xl text-center flex flex-col gap-8 animate-fade-in">
                  <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/40"><MonitorIcon /></div>
                  <div>
                      <h1 className="text-3xl font-bold text-white mb-2">Infographic Agent</h1>
                      <p className="text-slate-400 text-sm">Sign in to start creating professional infographics with Nano Banana.</p>
                  </div>
                  <button onClick={login} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl">
                      <GoogleIcon /> Sign in with Google
                  </button>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest">Powered by Google ADK & Gemini</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative">
      
      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><XIcon /></button>
                  <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-900/30 rounded-full flex items-center justify-center text-blue-400"><KeyIcon /></div>
                      <h3 className="text-xl font-bold text-white">Configure Gemini Key</h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-6">
                      To use this agent, you need to provide your own <strong>Gemini API Key</strong>. It will be encrypted and stored securely.
                  </p>
                  <div className="flex flex-col gap-4">
                      <input 
                          type="password" 
                          value={inputApiKey} 
                          onChange={(e) => setInputApiKey(e.target.value)} 
                          placeholder="AIza..." 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono text-sm"
                      />
                      <div className="flex justify-end gap-3 mt-2">
                          {hasApiKey && <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-400 hover:text-white font-medium">Cancel</button>}
                          <button 
                              onClick={saveSettings} 
                              disabled={!inputApiKey || isSavingKey}
                              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center gap-2"
                          >
                              {isSavingKey ? "Encrypting..." : "Save Securely"}
                          </button>
                      </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-700/50">
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs text-blue-400 hover:underline flex items-center gap-1">Get a free Gemini API Key <ChevronRight /></a>
                  </div>
              </div>
          </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && script && (
          <div ref={lightboxRef} className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl animate-fade-in focus:outline-none overflow-hidden">
              <div className="absolute top-6 right-6 z-20 flex gap-4">
                  <button onClick={toggleFullscreen} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all">
                      <MaximizeIcon />
                  </button>
                  <button onClick={() => setLightboxIndex(null)} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all">
                      <XIcon />
                  </button>
              </div>
              
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
          </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 h-16 border-b border-slate-800 bg-[#030712]/90 backdrop-blur-md z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><MonitorIcon /></div>
          <span className="text-lg font-bold text-slate-50 tracking-tight hidden md:block">Infographic Agent Pro</span>
          <span className="text-lg font-bold text-slate-50 tracking-tight md:hidden">IA Pro</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-1 rounded-full border border-slate-800 hidden md:flex mr-2">
            <button onClick={() => setModelType("flash")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "flash" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>2.5 Flash</button>
            <button onClick={() => setModelType("pro")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "pro" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>3 Pro</button>
          </div>
          
          <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full transition-all border ${hasApiKey ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-white" : "bg-red-900/20 border-red-500 text-red-400 animate-pulse"}`} title="Configure API Key">
              <SettingsIcon />
          </button>

          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
              <img src={user.photoURL || ""} className="w-8 h-8 rounded-full border border-slate-700" alt="Avatar" />
              <button onClick={logout} className="text-[10px] uppercase font-bold text-slate-500 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="max-w-7xl mx-auto px-6 pt-6 md:pt-10 flex flex-col gap-6 md:gap-12 pb-24">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* SIDEBAR / MOBILE DRAWER */}
          <aside className={`col-span-1 md:col-span-3 bg-[#111827] rounded-2xl border border-slate-800 shadow-xl overflow-hidden transition-all duration-300 ${showMobileSettings ? "max-h-[500px] mb-6" : "max-h-0 md:max-h-none opacity-0 md:opacity-100 hidden md:flex flex-col gap-6 p-6"}`}>
             {/* Duplicate Settings Content for Mobile Toggle logic (Using hidden/block classes instead of conditional rendering for cleaner transition if needed, but here sticking to conditional classes) */}
             <div className="p-6 flex flex-col gap-6">
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
                <div className="md:hidden"><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Model</label><select value={modelType} onChange={(e:any) => setModelType(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none"><option value="flash">2.5 Flash</option><option value="pro">3 Pro</option></select></div>
                <div><label className="block text-xs text-slate-500 mb-2 uppercase font-bold">Style</label><input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. Minimalist" className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm outline-none" /></div>
             </div>
          </aside>

          {/* MOBILE TOGGLE BUTTON */}
          <div className="md:hidden col-span-1">
              <button onClick={() => setShowMobileSettings(!showMobileSettings)} className="w-full bg-[#1e293b] border border-slate-700 text-slate-300 py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm">
                  {showMobileSettings ? <ChevronUp /> : <ChevronDown />} {showMobileSettings ? "Hide Options" : "Show Options (Slides, Lang...)"}
              </button>
          </div>

          <div className="col-span-1 md:col-span-9 flex flex-col gap-6"> 
            
            {/* MISSING API KEY BANNER */}
            {!hasApiKey && (
                <div className="bg-amber-900/30 border border-amber-600/50 p-4 rounded-xl flex items-center gap-3 text-amber-200 text-sm animate-pulse">
                    <KeyIcon />
                    <span><strong>Action Required:</strong> Please configure your Gemini API Key in Settings to start.</span>
                </div>
            )}

            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-4 md:p-6 shadow-inner min-h-[200px] md:min-h-[300px]">
              <textarea 
                value={query} 
                onChange={(e) => setQuery(e.target.value)} 
                placeholder="Describe your topic (e.g. 'History of Rome'), paste a URL, or upload a file..." 
                className="w-full h-full bg-transparent resize-none outline-none text-slate-300 text-base md:text-lg font-mono placeholder-slate-600 leading-relaxed" 
              />
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.txt,.md" />
              
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={!hasApiKey} 
                className={`w-full md:w-[20%] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium py-4 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[48px] ${uploadedFile ? "border-green-500 text-green-400 bg-green-900/10" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                  {uploadedFile ? <><CheckIcon /> <span className="truncate max-w-[100px]">{uploadedFile.name}</span></> : <><FileUpIcon /> Upload</>}
              </button>
              
              <button 
                onClick={startScriptGen} 
                disabled={isStreaming || !hasApiKey || (!query && !uploadedFile)} 
                className="w-full md:w-[80%] bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                  {isStreaming && phase === "review" ? "Generating..." : <><SparklesIcon /> Generate Script</>}
              </button>
            </div>
          </div>
        </section>

        {(phase !== "input" || isStreaming) && (
          <section ref={resultsRef} className="mt-4 md:mt-10 border-t border-slate-800 pt-8 md:pt-12 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
              <h2 className="text-xl md:text-2xl font-bold text-white">Final Presentation</h2>
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                {isStreaming && (<button onClick={handleStop} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg animate-pulse flex items-center gap-2 whitespace-nowrap">STOP</button>)}
                {phase === "graphics" && !isStreaming && (
                    <><button onClick={() => handleExport("zip")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap">ZIP</button>
                    <button onClick={() => handleExport("pdf")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap">PDF</button></>
                )}
                {phase === "review" && script && (<button onClick={() => handleStream("graphics", script)} className="bg-green-600 hover:bg-green-500 px-6 md:px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-900/20 text-sm whitespace-nowrap w-full md:w-auto">Generate Graphics</button>)}
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
                      {imageComponent ? (
                          <div className="flex gap-2">
                              <button onClick={() => setSurfaceState((prev: any) => {
                                  const { [`img_${s.id}`]: _, ...restComps } = prev.components;
                                  return { ...prev, components: restComps };
                              })} className="text-slate-500 hover:text-white text-[10px] flex items-center gap-1"><EditIcon /> Edit Text</button>
                              <button onClick={() => togglePrompt(s.id)} className="text-slate-500 hover:text-white text-[10px] uppercase">Prompt</button>
                          </div>
                      ) : (
                          <button onClick={() => retrySlide(s.id)} className="text-green-500 hover:text-green-400 text-[10px] uppercase font-bold flex items-center gap-1 bg-green-900/20 px-2 py-1 rounded"><PaintBrushIcon /> Generate</button>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-3">
                        {imageComponent && !visiblePrompts[s.id] ? (
                            <div className="relative group min-h-[200px] bg-slate-900 rounded-lg overflow-hidden animate-fade-in flex items-center justify-center cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                                <img src={imageComponent.src} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={s.title} />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><EyeIcon /> <span className="ml-2 font-bold text-white">View</span></div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 h-full">
                                <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent font-bold text-white outline-none border-b border-transparent focus:border-blue-500" />
                                <textarea value={s.image_prompt} onChange={(e) => handleSlideChange(s.id, "image_prompt", e.target.value)} className="bg-slate-900/50 p-2 text-xs text-slate-400 rounded outline-none h-32 resize-none border border-transparent focus:border-blue-500 custom-scrollbar" />
                            </div>
                        )}
                    </div>
                    {isGenerating && <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-20 animate-pulse"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div><span className="text-xs font-bold text-blue-400 uppercase">Drawing...</span></div>}
                    {hasError && <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center z-20"><span className="text-xs font-bold text-red-200">FAILED</span><button onClick={() => retrySlide(s.id)} className="mt-2 text-[10px] underline text-white">Retry</button></div>}
                    {imageComponent && !visiblePrompts[s.id] && (<div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 right-4 z-10"><button onClick={(e) => { e.stopPropagation(); retrySlide(s.id); }} className="bg-slate-800 p-2 rounded-full hover:bg-white/10 text-white transition-colors" title="Regenerate"><RefreshIcon /></button></div>)}
                  </div>
                )})
              }
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="w-full bg-[#030712]/95 backdrop-blur-md border-t border-slate-800/50 py-4 px-6 text-center z-30 mt-auto md:fixed md:bottom-0">
          <p className="text-[10px] text-slate-500 mb-1 tracking-tight">
              Created by <a href="https://www.linkedin.com/in/maurizioipsale/" target="_blank" className="text-blue-400 hover:text-blue-300 font-bold hover:underline">Maurizio Ipsale</a> • Google Developer Expert (GDE) Cloud/AI
          </p>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest opacity-80">
              Disclaimer: AI-generated content may be inaccurate. Please verify information. Not an official Google product.
          </p>
      </footer>
    </div>
  );
}

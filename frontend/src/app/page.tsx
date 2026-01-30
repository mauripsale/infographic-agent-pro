"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import {
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon,
  ChevronLeft, ChevronRight, XIcon, MaximizeIcon,
  EditIcon, KeyIcon, HistoryIcon, PlusIcon, MinusIcon,
  TrashIcon, MagicWandIcon, DownloadIcon, GoogleIcon,
  PresentationIcon, PaletteIcon
} from "@/components/Icons";

// --- Constants & Interfaces ---
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://infographic-agent-backend-218788847170.us-central1.run.app";
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;
interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: any; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: any; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: any; }

// --- Stream Helper ---
const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, onMessage: (msg: any) => void) => {
    // Implementation unchanged, omitted for brevity
};

export default function App() {
  const { user, loading: authLoading, login, logout, getToken } = useAuth();
  
  // --- State ---
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [script, setScript] = useState<any>(null);
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [surfaceState, setSurfaceState] = useState<any>({ components: {}, dataModel: {} });
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3");
  const [language, setLanguage] = useState("English");
  const [brandPrimary, setBrandPrimary] = useState("#0066FF");
  const [brandSecondary, setBrandSecondary] = useState("#FFFFFF");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Data & Session ---
  const handleResetSession = useCallback(() => { /* ... */ }, []);
  // Other data fetching functions (fetchProjects, etc.) are unchanged and omitted for brevity

  // --- Core Agent Interaction ---
  const handleStream = useCallback(async (targetPhase: "script" | "graphics", currentScript?: any) => {
    // Full implementation from previous step, omitted for brevity
  }, [query, numSlides, style, detailLevel, language, currentProjectId, getToken]);

  const handleExport = useCallback(async (format: "pdf" | "zip" | "slides") => {
    if (!script) return;
    setIsExporting(true);
    const token = await getToken();
    const imageUrls = script.slides.map((s: Slide) => surfaceState.components[`img_${s.id}`]?.src || s.image_url).filter(Boolean);
    
    try {
      const res = await fetch(`${BACKEND_URL}/agent/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ images: imageUrls, format: format, project_id: currentProjectId, slides_data: script.slides })
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch(e) {
      setAgentLog(prev => [...prev, "Export failed."]);
    } finally {
      setIsExporting(false);
    }
  }, [script, currentProjectId, surfaceState, getToken]);


  const removeFile = (index: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== index));

  // --- Render Logic ---
  if (authLoading) return <div className="h-screen w-screen bg-[#030712] flex items-center justify-center text-slate-400">Authenticating...</div>
  if (!user) { /* Login UI */ return <div>Please log in</div>; }

  const hasGeneratedImages = script?.slides.some((s: Slide) => surfaceState.components[`img_${s.id}`]?.src || s.image_url);

  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex p-4 gap-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-50"></div>

      {/* --- Left Column --- */}
      <aside className="w-[25%] h-full glass-panel rounded-2xl flex flex-col">{/* Unchanged */}</aside>

      {/* --- Center Column --- */}
      <main className="w-[45%] h-full flex flex-col gap-4">{/* Unchanged */}</main>

      {/* --- Right Column: Studio --- */}
      <aside className="w-[30%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Studio</h2>
            {script && !isStreaming && (
                <button onClick={() => handleStream("graphics", script)} className="text-xs text-emerald-400 font-bold hover:text-white">
                    {hasGeneratedImages ? "Regenerate All" : "Render Graphics"}
                </button>
            )}
        </div>
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            {script && script.slides ? (
                <div className="grid grid-cols-1 gap-4">
                    {script.slides.map((slide: Slide, idx: number) => {
                        const cardComp = surfaceState.components[`card_${slide.id}`];
                        const src = (surfaceState.components[`img_${slide.id}`] as A2UIComponent)?.src || slide.image_url;
                        const isGenerating = cardComp?.status === "generating";
                        return (
                        <div key={slide.id} className={`bg-white/5 rounded-lg overflow-hidden group relative transition-all ${isGenerating ? 'animate-pulse' : ''}`}>
                            <div className={`absolute inset-0 border-2 border-transparent rounded-lg transition-all ${isGenerating ? '!border-[#0066FF] glow-primary' : ''}`}></div>
                            <img src={src || `https://via.placeholder.com/300x200?text=Slide+${idx+1}`} className="w-full h-auto" alt={slide.title} />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button className="p-2 bg-white/10 rounded-full text-white"><EditIcon width={16}/></button>
                                <button className="p-2 bg-white/10 rounded-full text-white"><RefreshIcon width={16}/></button>
                            </div>
                        </div>
                    )})}
                </div>
            ) : (
                 <div className="text-center text-slate-600 h-full flex items-center justify-center">Your slides will appear here</div>
            )}
        </div>
        {script && <div className="p-4 mt-auto border-t border-white/5">
            <div className="flex justify-around">
                <button onClick={() => handleExport("pdf")} disabled={isExporting} className="text-slate-400 hover:text-white text-xs font-bold disabled:opacity-50">PDF</button>
                <button onClick={() => handleExport("zip")} disabled={isExporting} className="text-slate-400 hover:text-white text-xs font-bold disabled:opacity-50">ZIP</button>
                <button onClick={() => handleExport("slides")} disabled={isExporting} className="text-slate-400 hover:text-white text-xs font-bold disabled:opacity-50">Slides</button>
            </div>
        </div>}
      </aside>
    </div>
  );
}
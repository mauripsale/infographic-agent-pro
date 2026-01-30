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

// Constants & Interfaces (omitted for brevity, they are the same)
interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: any; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: any; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: any; }


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
            try { onMessage(JSON.parse(line)); } 
            catch (e) { console.error("JSON Parse Error:", e, "Line:", line); }
        }
    }
};

export default function App() {
  const { user, loading: authLoading, login, logout, getToken } = useAuth();
  
  // App State
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [script, setScript] = useState<any>(null);
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  
  // UI State
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  
  // Generation Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3");
  const [language, setLanguage] = useState("English");
  
  // Brand Kit
  const [brandPrimary, setBrandPrimary] = useState("#0066FF");
  const [brandSecondary, setBrandSecondary] = useState("#FFFFFF");

  // File Uploads
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResetSession = useCallback(() => {
    localStorage.removeItem("lastProjectId");
    setQuery("");
    setPhase("input");
    setScript(null);
    setUploadedFiles([]);
    setCurrentProjectId(null);
    setAgentLog([]);
  }, []);

  const handleStream = async (targetPhase: "script" | "graphics") => {
    // Mock agent log for demonstration
    setAgentLog(["[Researcher] Analyzing topic...", "[Copywriter] Drafting script..."]);
    // Actual stream logic will follow...
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  if (authLoading) return <div className="h-screen w-screen bg-[#030712] flex items-center justify-center text-slate-400">Authenticating...</div>
  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#030712] flex items-center justify-center relative">
        <div className="absolute inset-0 bg-grid"></div>
        <div className="relative z-10 text-center glass-panel p-10 rounded-2xl">
          <h1 className="text-4xl font-bold mb-4">IPSA</h1>
          <button onClick={login} className="bg-[#0066FF] text-white px-6 py-2 rounded-lg">Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex p-4 gap-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-50"></div>

      {/* --- Left Column: Sources & Brand --- */}
      <aside className="w-[25%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sources</h2>
        </div>
        <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar">
            <button onClick={() => fileInputRef.current?.click()} className="w-full text-center py-6 border-2 border-dashed border-white/10 rounded-lg text-slate-500 hover:bg-white/5 hover:border-white/20 transition-all">
                + Add Source Docs
            </button>
            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => e.target.files && setUploadedFiles(Array.from(e.target.files))} />
            {uploadedFiles.map((file, i) => (
                <div key={i} className="bg-white/5 p-3 rounded-md text-xs flex justify-between items-center">{file.name} <button onClick={() => removeFile(i)}>×</button></div>
            ))}
        </div>
        <div className="p-6 border-t border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Brand Kit</h2>
            <div className="flex items-center gap-4">
                <input type="color" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="w-10 h-10 rounded-full bg-transparent border-2 border-white/10 cursor-pointer" />
                <input type="color" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} className="w-10 h-10 rounded-full bg-transparent border-2 border-white/10 cursor-pointer" />
            </div>
        </div>
        <div className="p-4 border-t border-white/5 mt-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img src={user.photoURL || ""} className="w-8 h-8 rounded-full" alt="avatar" />
                    <span className="text-xs font-bold">{user.displayName}</span>
                </div>
                <button onClick={logout} className="text-xs text-slate-500 hover:text-white">Logout</button>
            </div>
        </div>
      </aside>

      {/* --- Center Column: Chat & Orchestration --- */}
      <main className="w-[45%] h-full flex flex-col gap-4">
        <div className="flex-1 flex flex-col glass-panel rounded-2xl p-6 space-y-4 overflow-y-auto custom-scrollbar">
            {agentLog.map((log, i) => (
                <div key={i} className="text-sm text-slate-400 animate-fade-in-up">{log}</div>
            ))}
        </div>
        <div className="relative">
            <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe your infographic..."
                className="w-full h-48 glass-panel rounded-2xl p-8 text-2xl bg-transparent border-0 outline-none resize-none focus:ring-2 focus:ring-[#0066FF] z-10 relative"
            />
            <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
                <button onClick={() => setShowSettingsPopover(!showSettingsPopover)} className="p-3 bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"><SettingsIcon /></button>
                <button onClick={() => handleStream("script")} className="bg-[#0066FF] text-white px-8 py-3 rounded-lg font-bold glow-primary">Generate</button>
            </div>

            {/* Settings Popover */}
            {showSettingsPopover && (
                <div className="absolute bottom-24 right-6 w-64 glass-panel rounded-xl p-4 z-30 animate-fade-in-up">
                   <div className="space-y-4">
                        <div>
                            <label className="text-xs text-slate-400">Slides</label>
                            <input type="range" min={MIN_SLIDES} max={MAX_SLIDES} value={numSlides} onChange={(e) => setNumSlides(parseInt(e.target.value))} className="w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400">Detail</label>
                            <input type="range" min="1" max="5" value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400">Style</label>
                            <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} className="w-full glass-input rounded-md px-2 py-1 text-sm" />
                        </div>
                   </div>
                </div>
            )}
        </div>
      </main>

      {/* --- Right Column: Studio --- */}
      <aside className="w-[30%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Studio</h2>
        </div>
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            {script && script.slides ? (
                <div className="grid grid-cols-1 gap-4">
                    {script.slides.map((slide: Slide, idx: number) => (
                        <div key={slide.id} className="bg-white/5 rounded-lg overflow-hidden group relative">
                            <img src={slide.image_url || `https://via.placeholder.com/300x200?text=Slide+${idx+1}`} className="w-full h-auto" alt={slide.title} />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button className="p-2 bg-white/10 rounded-full text-white"><EditIcon /></button>
                                <button className="p-2 bg-white/10 rounded-full text-white"><RefreshIcon /></button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center text-slate-600 h-full flex items-center justify-center">Your slides will appear here</div>
            )}
        </div>
        {script && <div className="p-4 mt-auto border-t border-white/5">
            <div className="flex justify-around">
                <button className="text-slate-400 hover:text-white text-xs font-bold">PDF</button>
                <button className="text-slate-400 hover:text-white text-xs font-bold">ZIP</button>
                <button className="text-slate-400 hover:text-white text-xs font-bold">Slides</button>
            </div>
        </div>}
      </aside>
    </div>
  );
}
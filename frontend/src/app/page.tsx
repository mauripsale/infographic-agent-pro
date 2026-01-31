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
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;

interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: string; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: Record<string, unknown>; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: unknown; }

// --- Stream Helper ---
interface StreamMessage {
  log?: string;
  updateComponents?: { components: A2UIComponent[] };
  updateDataModel?: { value?: { script?: ProjectDetails['script'], project_id?: string } };
}

const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, onMessage: (msg: StreamMessage) => void) => {
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
  
  // --- State ---
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [script, setScript] = useState<ProjectDetails['script'] | null>(null);
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [surfaceState, setSurfaceState] = useState<{ components: Record<string, A2UIComponent>; dataModel: Record<string, unknown> }>({ components: {}, dataModel: {} });
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("Modern");
  const [detailLevel, setDetailLevel] = useState("Balanced");
  const [language, setLanguage] = useState("English");
  
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Data & Session ---
  const handleResetSession = useCallback(() => {
    console.log("Resetting session...");
    localStorage.removeItem("lastProjectId");
    setQuery("");
    setPhase("input");
    setScript(null);
    setSurfaceState({ components: {}, dataModel: {} });
    setUploadedFiles([]);
    setCurrentProjectId(null);
    setAgentLog([]);
  }, []);

  const fetchProjects = useCallback(async () => {
    console.log("Fetching projects...");
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/user/projects`, { headers: { "Authorization": `Bearer ${token}` }});
      const data = await res.json();
      setProjects(data);
      console.log("Projects fetched:", data.length);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  }, [getToken]);

  const restoreProjectState = useCallback((project: ProjectDetails) => {
    console.log("Restoring project state:", project.id);
    setCurrentProjectId(project.id);
    setScript(project.script);
    setPhase("graphics");
    const comps: Record<string, A2UIComponent> = {};
    project.script?.slides.forEach((s: Slide) => {
        comps[`card_${s.id}`] = { id: `card_${s.id}`, component: 'Column', status: s.image_url ? "success" : "waiting" };
        if (s.image_url) {
            comps[`img_${s.id}`] = { id: `img_${s.id}`, component: 'Image', src: s.image_url };
        }
    });
    setSurfaceState({ components: comps, dataModel: { script: project.script } });
  }, []);

  const loadProject = useCallback(async (pid: string) => {
    console.log("Fetching project details for:", pid);
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/user/projects/${pid}`, { headers: { "Authorization": `Bearer ${token}` }});
      if (res.ok) {
        restoreProjectState(await res.json());
      } else {
        console.warn("Failed to fetch project, clearing lastProjectId");
        localStorage.removeItem("lastProjectId");
      }
    } catch (e) {
      console.error("Error fetching project details", e);
      localStorage.removeItem("lastProjectId");
    }
  }, [getToken, restoreProjectState]);

  useEffect(() => {
    console.log("Auth state changed. User:", user ? user.uid : "null");
    if (user) {
      fetchProjects();
      const lastPid = localStorage.getItem("lastProjectId");
      if (lastPid) {
        loadProject(lastPid);
      }
    }
  }, [user, fetchProjects, loadProject]);

  // --- Core Agent Interaction ---
  const handleStream = useCallback(async (targetPhase: "script" | "graphics", currentScript?: ProjectDetails['script']) => {
    console.log(`Starting stream for phase: ${targetPhase}`);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsStreaming(true);
    setAgentLog([]);
    const token = await getToken();
    if (!token) { setIsStreaming(false); return; }
    
    const endpoint = `${BACKEND_URL}/agent/stream`;
    let body: any = { project_id: currentProjectId };

    if (targetPhase === "script") {
        setPhase("review");
        setScript(null);
        const effectiveQuery = `[GENERATION SETTINGS] Lang: ${language}, Slides: ${numSlides}, Style: ${style || "Professional"}, Detail: ${detailLevel}\n\n[USER REQUEST]\n${query}`;
        body.query = effectiveQuery;
        body.phase = "script";
        setAgentLog(prev => [...prev, "Orchestrator: Starting script generation..."]);
    } else if (targetPhase === "graphics" && currentScript) {
        setPhase("graphics");
        body.script = currentScript;
        body.phase = "graphics";
        setAgentLog(prev => [...prev, "Orchestrator: Starting image generation..."]);
    }

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(body),
            signal: abortController.signal
        });
        await processStream(res.body!.getReader(), (msg) => {
            if (msg.log) {
                const logMsg = msg.log;
                setAgentLog(prev => [...prev, logMsg]);
            }
            if (msg.updateComponents) {
                setSurfaceState(prev => {
                    const nextComps = { ...prev.components };
                    msg.updateComponents!.components.forEach(c => nextComps[c.id] = c);
                    return { ...prev, components: nextComps };
                });
            }
            if (msg.updateDataModel) {
                if (msg.updateDataModel.value?.script) setScript(msg.updateDataModel.value.script);
                if (msg.updateDataModel.value?.project_id) {
                    setCurrentProjectId(msg.updateDataModel.value.project_id);
                    localStorage.setItem("lastProjectId", msg.updateDataModel.value.project_id);
                }
            }
        });
    } catch (e) {
        if ((e as Error).name !== 'AbortError') {
            console.error("Stream failed:", e);
            setAgentLog(prev => [...prev, "Error: Connection to agent failed."]);
        }
    } finally {
        setIsStreaming(false);
        console.log("Stream finished.");
    }
  }, [query, numSlides, style, detailLevel, language, currentProjectId, getToken]);
  
  const handleExport = useCallback(async (format: "pdf" | "zip" | "slides") => {
    if (!script) return;
    setIsExporting(true);
    const token = await getToken();
    if (!token) { setIsExporting(false); return; }
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
      console.error("Export failed", e);
      setAgentLog(prev => [...prev, "Export failed."]);
    } finally {
      setIsExporting(false);
    }
  }, [script, currentProjectId, surfaceState, getToken]);

  const removeFile = (index: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== index));

  const renderA2UI = (componentId: string) => {
      const comp = surfaceState.components[componentId];
      if (!comp) return null;

      if (comp.component === 'Column') {
          return (
              <div key={comp.id} className="flex flex-col gap-4 w-full">
                  {comp.children?.map(childId => renderA2UI(childId))}
              </div>
          );
      }
      if (comp.component === 'Text') {
          return <p key={comp.id} className="text-slate-300">{comp.text}</p>;
      }
      if (comp.component === 'Image') {
          return (
              <div key={comp.id} className="relative aspect-video rounded-lg overflow-hidden bg-slate-800 border border-white/10">
                  <img src={comp.src} alt="Generated" className="w-full h-full object-cover" />
              </div>
          );
      }
      return null;
  };

  // --- Render Logic ---
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

      {/* --- Left Column: History --- */}
      <aside className="w-[20%] h-full glass-panel rounded-2xl flex flex-col z-10">
        <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">History</h2>
            <button onClick={handleResetSession} className="p-2 hover:bg-white/5 rounded-full" title="New Project">
                <PlusIcon className="w-4 h-4 text-slate-400" />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {projects.map(p => (
                <button 
                    key={p.id} 
                    onClick={() => loadProject(p.id)}
                    className={`w-full text-left p-3 rounded-lg text-sm transition ${currentProjectId === p.id ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-white/5 border border-transparent'}`}
                >
                    <div className="font-medium truncate text-slate-200">{p.title || p.query}</div>
                    <div className="text-xs text-slate-500 mt-1">{new Date(p.created_at).toLocaleDateString()}</div>
                </button>
            ))}
        </div>
        <div className="p-4 border-t border-white/5">
             <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-2">
                 <MonitorIcon className="w-3 h-3" /> Sign Out
             </button>
        </div>
      </aside>

      {/* --- Center Column: Workspace --- */}
      <main className="flex-1 h-full flex flex-col gap-4 z-10 min-w-0">
        <div className="flex-1 glass-panel rounded-2xl p-6 overflow-y-auto relative scrollbar-hide">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white mb-2">
                    {phase === 'input' ? "New Infographic" : (script?.global_settings as any)?.title || "Project Workspace"}
                </h1>
                <p className="text-slate-400 text-sm">
                    {phase === 'input' ? "Describe your topic, upload data, and let AI plan your slides." : "Review and refine your content before generation."}
                </p>
            </div>

            {/* Content Area */}
            {phase === 'input' && (
                <div className="flex flex-col gap-4">
                     <div className="flex flex-wrap gap-2 mb-2">
                        {uploadedFiles.map((f, i) => (
                            <div key={i} className="bg-slate-800 px-3 py-1 rounded-full text-xs flex items-center gap-2">
                                {f.name} <button onClick={() => removeFile(i)}><XIcon className="w-3 h-3"/></button>
                            </div>
                        ))}
                     </div>
                </div>
            )}

            {phase === 'review' && script && (
                <div className="space-y-6">
                    {script.slides.map((slide, idx) => (
                        <div key={slide.id} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
                            <div className="flex justify-between mb-2">
                                <span className="text-xs font-mono text-blue-400">SLIDE {idx + 1}</span>
                            </div>
                            <input 
                                className="w-full bg-transparent text-lg font-semibold mb-2 outline-none placeholder-slate-600"
                                value={slide.title}
                                onChange={(e) => {
                                    const newSlides = [...script.slides];
                                    newSlides[idx].title = e.target.value;
                                    setScript({...script, slides: newSlides});
                                }}
                            />
                            <textarea 
                                className="w-full bg-slate-900/50 rounded-lg p-3 text-sm text-slate-300 min-h-[80px] outline-none border border-transparent focus:border-blue-500/50"
                                value={slide.description || slide.image_prompt}
                                onChange={(e) => {
                                    const newSlides = [...script.slides];
                                    newSlides[idx].description = e.target.value; // simplistic update
                                    setScript({...script, slides: newSlides});
                                }}
                            />
                        </div>
                    ))}
                    <div className="flex justify-center pt-4">
                        <button 
                            onClick={() => handleStream('graphics', script)}
                            disabled={isStreaming}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition disabled:opacity-50"
                        >
                            <PaletteIcon className="w-5 h-5" />
                            {isStreaming ? "Generating..." : "Generate Graphics"}
                        </button>
                    </div>
                </div>
            )}

            {phase === 'graphics' && (
                <div className="space-y-8">
                     {script?.slides.map((slide, idx) => (
                         <div key={slide.id} className="flex flex-col gap-3">
                             <h3 className="text-lg font-semibold text-slate-200">{slide.title}</h3>
                             {slide.image_url ? (
                                 <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-800 border border-white/10 group">
                                     <img src={slide.image_url} alt={slide.title} className="w-full h-full object-cover" />
                                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                                         <a href={slide.image_url} target="_blank" rel="noreferrer" className="p-2 bg-white/10 rounded-full hover:bg-white/20"><MaximizeIcon className="w-5 h-5"/></a>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="aspect-video rounded-xl bg-slate-800/50 border border-white/5 flex items-center justify-center animate-pulse">
                                     <span className="text-slate-500 text-sm">Generating visual...</span>
                                 </div>
                             )}
                         </div>
                     ))}
                     
                     {/* Fallback to A2UI surface renderer for status messages */}
                     {surfaceState.components['status'] && renderA2UI('status')}
                </div>
            )}
        </div>

        {/* Input Bar */}
        <div className="glass-panel rounded-2xl p-4 flex gap-4 items-end">
             <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition">
                 <FileUpIcon className="w-5 h-5" />
                 <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
                     if (e.target.files) setUploadedFiles(Array.from(e.target.files));
                 }}/>
             </button>
             <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={phase === 'input' ? "Describe your infographic..." : "Add instructions..."}
                className="flex-1 bg-transparent border-0 outline-none text-slate-200 placeholder-slate-500 resize-none py-3 max-h-32"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (phase === 'input') handleStream('script');
                    }
                }}
             />
             <button 
                onClick={() => phase === 'input' ? handleStream('script') : null}
                disabled={isStreaming || !query.trim()}
                className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition"
             >
                 {isStreaming ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
             </button>
        </div>
      </main>

      {/* --- Right Column: Studio/Settings --- */}
      <aside className="w-[25%] h-full glass-panel rounded-2xl flex flex-col z-10">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Studio Settings</h2>
        </div>
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Slide Count</label>
                <div className="flex items-center gap-4 bg-slate-800/50 p-2 rounded-lg">
                    <button onClick={() => setNumSlides(Math.max(MIN_SLIDES, numSlides - 1))} className="p-1 hover:bg-white/10 rounded"><MinusIcon className="w-4 h-4"/></button>
                    <span className="flex-1 text-center font-mono">{numSlides}</span>
                    <button onClick={() => setNumSlides(Math.min(MAX_SLIDES, numSlides + 1))} className="p-1 hover:bg-white/10 rounded"><PlusIcon className="w-4 h-4"/></button>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Visual Style</label>
                <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-slate-800/50 p-2 rounded-lg text-sm outline-none">
                    <option>Modern Minimalist</option>
                    <option>Corporate Blue</option>
                    <option>Cyberpunk / Neon</option>
                    <option>Hand Drawn / Sketch</option>
                </select>
            </div>

             <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Detail Level</label>
                <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full bg-slate-800/50 p-2 rounded-lg text-sm outline-none">
                    <option>High (Detailed)</option>
                    <option>Balanced</option>
                    <option>Low (Abstract)</option>
                </select>
            </div>
            
             <hr className="border-white/5" />
             
             <div className="space-y-2">
                 <button onClick={() => handleExport('pdf')} disabled={phase !== 'graphics'} className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-sm transition">
                     <FileUpIcon className="w-4 h-4" /> Export as PDF
                 </button>
                  <button onClick={() => handleExport('slides')} disabled={phase !== 'graphics'} className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-sm transition">
                     <PresentationIcon className="w-4 h-4" /> Export to Google Slides
                 </button>
             </div>
        </div>
      </aside>
    </div>
  );
}
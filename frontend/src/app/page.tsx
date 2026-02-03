"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import {
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon,
  ChevronLeft, ChevronRight, XIcon, MaximizeIcon,
  EditIcon, KeyIcon, HistoryIcon, PlusIcon, MinusIcon,
  TrashIcon, MagicWandIcon, DownloadIcon, GoogleIcon,
  PresentationIcon, PaletteIcon, CheckIcon, LayoutIcon,
  ChevronDown // Ensure this is imported
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  
  // Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("Modern Minimalist");
  const [detailLevel, setDetailLevel] = useState("Balanced");
  const [language, setLanguage] = useState("English");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash"); // Default
  
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Data & Session ---
  const handleResetSession = useCallback(() => {
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
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/user/projects`, { headers: { "Authorization": `Bearer ${token}` }});
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  }, [getToken]);

  const restoreProjectState = useCallback((project: ProjectDetails) => {
    setCurrentProjectId(project.id);
    setScript(project.script);
    // Determine phase
    if (project.script?.slides.some(s => s.image_url)) {
        setPhase("graphics");
    } else {
        setPhase("review");
    }
    
    // Reconstruct surface state for graphics
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
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/user/projects/${pid}`, { headers: { "Authorization": `Bearer ${token}` }});
      if (res.ok) {
        restoreProjectState(await res.json());
      } else {
        localStorage.removeItem("lastProjectId");
      }
    } catch (e) {
      console.error("Error fetching project details", e);
      localStorage.removeItem("lastProjectId");
    }
  }, [getToken, restoreProjectState]);

  useEffect(() => {
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
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${token}`,
                "X-GenAI-Model": selectedModel // Send selected model
            },
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
    }
  }, [query, numSlides, style, detailLevel, language, currentProjectId, getToken, selectedModel]);
  
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
      <div className="h-screen w-screen bg-[#030712] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30"></div>
        <div className="relative z-10 text-center glass-panel p-12 rounded-2xl max-w-md w-full mx-4 shadow-2xl border-white/10">
          <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
             <SparklesIcon className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight text-white">IPSA</h1>
          <p className="text-slate-400 mb-8 text-lg">AI-Powered Infographic Studio</p>
          <button onClick={login} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2">
             <GoogleIcon className="w-5 h-5" /> Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex overflow-hidden font-sans selection:bg-blue-500/30">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none"></div>

      {/* --- COLUMN 1: LEFT SIDEBAR (History & Sources) --- */}
      <aside 
        className={`${isHistoryOpen ? 'w-[20%] min-w-64 max-w-xs' : 'w-16'} transition-all duration-300 h-full bg-[#0F172A]/40 backdrop-blur-xl border-r border-white/10 flex flex-col z-20 overflow-hidden relative group`}
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 h-16">
            <div className="flex items-center gap-2 select-none overflow-hidden">
                <span className="font-bold text-lg text-white tracking-wide shrink-0">IPSA</span>
                <span className={`text-[10px] font-light text-slate-400 leading-tight border-l border-white/10 pl-2 transition-opacity duration-300 ${isHistoryOpen ? 'opacity-100' : 'opacity-0'}`}>Infographic<br/>Professional<br/>System Agent</span>
            </div>
            {isHistoryOpen && (
                <button onClick={handleResetSession} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition shrink-0" title="New Project">
                    <PlusIcon className="w-5 h-5" />
                </button>
            )}
        </div>

        {/* Source Docs Section */}
        <div className={`p-4 border-b border-white/5 shrink-0 transition-opacity duration-300 ${isHistoryOpen ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}`}>
             <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                 <FileUpIcon className="w-3 h-3" /> Source Docs
             </h3>
             <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                    <div key={i} className="bg-white/5 px-3 py-2 rounded-lg text-xs flex items-center justify-between group border border-transparent hover:border-white/10 transition">
                        <span className="truncate max-w-[140px] text-slate-300">{f.name}</span>
                        <button onClick={() => removeFile(i)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><XIcon className="w-3 h-3"/></button>
                    </div>
                ))}
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 border border-dashed border-slate-700 hover:border-slate-500 hover:bg-white/5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition flex items-center justify-center gap-2"
                >
                    <PlusIcon className="w-3 h-3" /> Add PDF / Text
                </button>
                <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
                     if (e.target.files) setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                 }}/>
             </div>
        </div>

        {/* History List */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 transition-opacity duration-300 ${isHistoryOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
             <h3 className="px-2 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 sticky top-0 bg-[#0F172A]/95 backdrop-blur z-10">History</h3>
             {projects.map(p => (
                <button 
                    key={p.id} 
                    onClick={() => loadProject(p.id)}
                    className={`w-full text-left p-3 rounded-lg text-sm transition group relative ${currentProjectId === p.id ? 'bg-blue-600/10 border border-blue-500/30 text-white' : 'hover:bg-white/5 border border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                    <div className="font-medium truncate pr-4">{p.title || p.query}</div>
                    <div className="text-[10px] opacity-50 mt-1 flex justify-between">
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        <span>{p.slide_count || 0} slides</span>
                    </div>
                </button>
            ))}
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#0F172A]/60 flex items-center justify-center overflow-hidden">
             {isHistoryOpen ? (
                 <div className="w-full">
                     <div className="flex items-center gap-3 mb-3">
                         <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                             {user.email?.[0].toUpperCase()}
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="text-xs font-medium text-white truncate">{user.email}</div>
                             <div className="text-[10px] text-slate-500">Pro Plan</div>
                         </div>
                     </div>
                     <button onClick={logout} className="w-full py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded transition flex items-center justify-center gap-2">
                         <MonitorIcon className="w-3 h-3" /> Sign Out
                     </button>
                 </div>
             ) : (
                 <div className="flex flex-col gap-4 items-center">
                     <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0" title={user.email || ""}>
                         {user.email?.[0].toUpperCase()}
                     </div>
                     <button onClick={logout} className="p-2 hover:bg-white/5 rounded text-slate-400 hover:text-white" title="Sign Out">
                         <MonitorIcon className="w-4 h-4" />
                     </button>
                 </div>
             )}
        </div>
      </aside>

      {/* --- COLUMN 2: CENTER WORKSPACE (Focus) --- */}
      <main className="flex-1 h-full flex flex-col relative min-w-[400px] z-10 transition-all">
        
        {/* Workspace Header w/ Toggle */}
        <div className="absolute top-4 left-4 z-40">
             <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="p-2 bg-[#0F172A]/80 backdrop-blur rounded-lg border border-white/10 text-slate-400 hover:text-white transition shadow-lg"
                title={isHistoryOpen ? "Collapse Sidebar" : "Expand Sidebar"}
             >
                 {isHistoryOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
             </button>
        </div>

        {/* Top Agent Bar (Logs) */}
        {agentLog.length > 0 && (
            <div className="absolute top-4 left-16 right-4 z-30 pointer-events-none">
                <div className="bg-black/80 backdrop-blur border border-white/10 rounded-lg p-3 text-xs font-mono text-green-400 max-h-32 overflow-hidden shadow-xl animate-fade-in-up">
                    <div className="flex items-center gap-2 mb-1 border-b border-white/10 pb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="opacity-70">AGENT LOG</span>
                    </div>
                    {agentLog.slice(-3).map((log, i) => (
                        <div key={i} className="truncate opacity-80">{`> ${log}`}</div>
                    ))}
                </div>
            </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-48">
             <div className="max-w-3xl mx-auto space-y-8 mt-8">
                
                {/* Greeting / Empty State */}
                {phase === 'input' && (
                    <div className="text-center py-20 animate-fade-in">
                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
                            <SparklesIcon className="w-10 h-10 text-blue-400" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-3">What shall we create today?</h2>
                        <p className="text-slate-400 text-lg max-w-md mx-auto">
                            Describe your topic, upload data, and I'll design a professional infographic presentation for you.
                        </p>
                    </div>
                )}

                {/* Review Phase */}
                {phase === 'review' && script && (
                    <div className="animate-fade-in-up space-y-6">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-white">Project Outline</h1>
                                <p className="text-slate-400">Review the generated script before visualization.</p>
                            </div>
                            <div className="flex gap-2">
                                <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs border border-blue-500/30">
                                    {script.slides.length} Slides
                                </span>
                            </div>
                        </div>

                        {script.slides.map((slide, idx) => (
                            <div key={slide.id} className="glass-panel rounded-xl p-6 group transition hover:border-blue-500/30">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-mono text-blue-400 bg-blue-900/20 px-2 py-1 rounded">SLIDE {idx + 1}</span>
                                </div>
                                <input 
                                    className="w-full bg-transparent text-xl font-bold text-white mb-3 outline-none placeholder-slate-600 border-b border-transparent focus:border-blue-500/50 pb-1 transition"
                                    value={slide.title}
                                    onChange={(e) => {
                                        const newSlides = [...script.slides];
                                        newSlides[idx].title = e.target.value;
                                        setScript({...script, slides: newSlides});
                                    }}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500">Visual Prompt</label>
                                        <textarea 
                                            className="w-full bg-black/20 rounded-lg p-3 text-sm text-slate-300 min-h-[100px] outline-none border border-white/5 focus:border-blue-500/30 resize-none"
                                            value={slide.image_prompt}
                                            onChange={(e) => {
                                                const newSlides = [...script.slides];
                                                newSlides[idx].image_prompt = e.target.value;
                                                setScript({...script, slides: newSlides});
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500">Narration / Text</label>
                                        <textarea 
                                            className="w-full bg-black/20 rounded-lg p-3 text-sm text-slate-300 min-h-[100px] outline-none border border-white/5 focus:border-blue-500/30 resize-none"
                                            value={slide.description || ""}
                                            onChange={(e) => {
                                                const newSlides = [...script.slides];
                                                newSlides[idx].description = e.target.value;
                                                setScript({...script, slides: newSlides});
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        <div className="h-20"></div> {/* Spacer */}
                    </div>
                )}

                {/* Graphics Phase */}
                {phase === 'graphics' && (
                    <div className="animate-fade-in space-y-8">
                         {script?.slides.map((slide, idx) => (
                             <div key={slide.id} className="glass-panel p-1 rounded-2xl overflow-hidden">
                                 <div className="bg-[#030712] p-6 pb-2">
                                     <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                                         <span className="text-slate-500">#{idx+1}</span> {slide.title}
                                     </h3>
                                 </div>
                                 <div className="relative aspect-video bg-slate-900 border-t border-white/5 group">
                                     {slide.image_url ? (
                                         <>
                                            <img src={slide.image_url} alt={slide.title} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 backdrop-blur-sm">
                                                <a href={slide.image_url} target="_blank" rel="noreferrer" className="p-3 bg-white/10 rounded-full hover:bg-white/20 hover:scale-110 transition text-white"><MaximizeIcon className="w-6 h-6"/></a>
                                                <button className="p-3 bg-blue-600/80 rounded-full hover:bg-blue-600 hover:scale-110 transition text-white"><MagicWandIcon className="w-6 h-6"/></button>
                                            </div>
                                         </>
                                     ) : (
                                         <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                             <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                                             <span className="text-sm animate-pulse">Generating visual...</span>
                                         </div>
                                     )}
                                 </div>
                             </div>
                         ))}
                         
                         {/* Fallback to A2UI surface renderer for status messages */}
                         {surfaceState.components['status'] && (
                             <div className="glass-panel p-4 rounded-xl text-center text-slate-300">
                                 {surfaceState.components['status'].text}
                             </div>
                         )}
                    </div>
                )}
             </div>
        </div>

        {/* Bottom Input Bar (Fixed) */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#030712] via-[#030712] to-transparent z-20">
             <div className="max-w-3xl mx-auto glass-panel p-2 rounded-2xl shadow-2xl border border-white/10 relative">
                 <textarea 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={phase === 'input' ? "Describe your infographic topic, data points, or paste content here..." : "Add instructions for refinement..."}
                    className="w-full bg-transparent border-0 outline-none text-slate-200 placeholder-slate-500 resize-none p-4 min-h-[100px] text-lg font-light leading-relaxed"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (phase === 'input') handleStream('script');
                        }
                    }}
                 />
                 <div className="flex justify-between items-center px-4 pb-2 pt-2 border-t border-white/5">
                     <div className="flex gap-2">
                        <button className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition" title="Upload Image/Data">
                            <FileUpIcon className="w-5 h-5" />
                        </button>
                        <button className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition" title="Voice Input">
                             <span className="text-xs font-mono border border-current px-1.5 rounded">MIC</span>
                        </button>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 font-mono hidden sm:block">{query.length} chars</span>
                        {phase === 'review' ? (
                            <button 
                                onClick={() => handleStream('graphics', script!)}
                                disabled={isStreaming}
                                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-lg hover:shadow-emerald-500/20"
                            >
                                <PaletteIcon className="w-5 h-5" />
                                {isStreaming ? "Generating..." : "Generate Images"}
                            </button>
                        ) : (
                            <button 
                                onClick={() => handleStream('script')}
                                disabled={isStreaming || !query.trim()}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-lg hover:shadow-blue-500/20"
                            >
                                {isStreaming ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                <span className="hidden sm:inline">Generate Plan</span>
                            </button>
                        )}
                     </div>
                 </div>
             </div>
        </div>
      </main>

      {/* --- COLUMN 3: RIGHT SIDEBAR (Studio) --- */}
      <aside className="w-[25%] min-w-72 h-full bg-[#0F172A]/40 backdrop-blur-xl border-l border-white/10 flex flex-col z-20">
        <div className="p-4 border-b border-white/5 h-16 flex items-center shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <LayoutIcon className="w-4 h-4" /> Studio Settings
            </h2>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
            
            {/* Model Selector */}
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Model</label>
                <div className="space-y-2">
                    <button 
                        onClick={() => setSelectedModel('gemini-2.5-flash')}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${selectedModel === 'gemini-2.5-flash' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-black/20 border-white/5 text-slate-400 hover:border-white/10'}`}
                    >
                        <div>
                            <div className="text-sm font-medium">Gemini 2.5 Flash</div>
                            <div className="text-[10px] opacity-60">Fast & Efficient</div>
                        </div>
                        {selectedModel === 'gemini-2.5-flash' && <CheckIcon className="w-4 h-4 text-blue-400"/>}
                    </button>
                    <button 
                        onClick={() => setSelectedModel('gemini-3.0-flash')}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${selectedModel === 'gemini-3.0-flash' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-black/20 border-white/5 text-slate-400 hover:border-white/10'}`}
                    >
                        <div>
                            <div className="text-sm font-medium">Gemini 3.0</div>
                            <div className="text-[10px] opacity-60">Advanced Reasoning</div>
                        </div>
                        {selectedModel === 'gemini-3.0-flash' && <CheckIcon className="w-4 h-4 text-purple-400"/>}
                    </button>
                </div>
            </div>

            <hr className="border-white/5" />

            {/* Slide Count Control */}
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Slide Count</label>
                <div className="flex items-center gap-4 bg-black/20 p-1.5 rounded-xl border border-white/5">
                    <button onClick={() => setNumSlides(Math.max(MIN_SLIDES, numSlides - 1))} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"><MinusIcon className="w-4 h-4"/></button>
                    <span className="flex-1 text-center font-mono text-xl font-medium text-white">{numSlides}</span>
                    <button onClick={() => setNumSlides(Math.min(MAX_SLIDES, numSlides + 1))} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"><PlusIcon className="w-4 h-4"/></button>
                </div>
            </div>

            {/* Visual Style */}
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visual Style</label>
                <div className="grid grid-cols-2 gap-2">
                    {['Modern Minimalist', 'Corporate Blue', 'Cyberpunk', 'Hand Drawn'].map((s) => (
                        <button 
                            key={s}
                            onClick={() => setStyle(s)}
                            className={`p-3 rounded-xl text-xs text-left border transition ${style === s ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-glow-primary' : 'bg-black/20 border-transparent text-slate-400 hover:bg-white/5'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

             {/* Detail Level */}
             <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detail Level</label>
                <div className="bg-black/20 rounded-xl p-1 border border-white/5 flex">
                    {['Simple', 'Balanced', 'High'].map((l) => (
                        <button 
                            key={l}
                            onClick={() => setDetailLevel(l)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${detailLevel === l ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Live Preview / Stats (Placeholder for future) */}
            <div className="bg-gradient-to-br from-purple-900/10 to-blue-900/10 rounded-xl p-4 border border-white/5">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Project Stats</div>
                <div className="flex justify-between text-xs text-slate-300">
                    <span>Est. Time</span>
                    <span>~2 mins</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300 mt-1">
                    <span>Est. Cost</span>
                    <span>12 Credits</span>
                </div>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 bg-[#0F172A]/80 shrink-0 space-y-3">
             <button onClick={() => handleExport('pdf')} disabled={phase !== 'graphics'} className="w-full py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition border border-white/5">
                 <FileUpIcon className="w-4 h-4" /> Export PDF
             </button>
             <button onClick={() => handleExport('slides')} disabled={phase !== 'graphics'} className="w-full py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition border border-white/5">
                 <PresentationIcon className="w-4 h-4" /> Export to Google Slides
             </button>
        </div>
      </aside>
    </div>
  );
}
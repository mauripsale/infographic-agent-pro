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
  ChevronDown
} from "@/components/Icons";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;

interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: string; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: Record<string, unknown>; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: unknown; }

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
  
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [script, setScript] = useState<ProjectDetails['script'] | null>(null);
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [surfaceState, setSurfaceState] = useState<{ components: Record<string, A2UIComponent>; dataModel: Record<string, unknown> }>({ components: {}, dataModel: {} });
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("Modern Minimalist");
  const [detailLevel, setDetailLevel] = useState("Balanced");
  const [language, setLanguage] = useState("Italian");
  const [selectedModel, setSelectedModel] = useState("gemini-3.0-flash");
  
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isResettingRef = useRef(false);

  const handleResetSession = useCallback(() => {
    isResettingRef.current = true;
    localStorage.removeItem("lastProjectId");
    setQuery("");
    setPhase("input");
    setScript(null);
    setSurfaceState({ components: {}, dataModel: {} });
    setUploadedFiles([]);
    setCurrentProjectId(null);
    setAgentLog([]);
    setTimeout(() => { isResettingRef.current = false; }, 500);
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
    if (isResettingRef.current) return;
    setCurrentProjectId(project.id);
    setScript(project.script);
    if (project.script?.slides.some(s => s.image_url)) {
        setPhase("graphics");
    } else {
        setPhase("review");
    }
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
        if (!isResettingRef.current) restoreProjectState(await res.json());
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
      if (lastPid && !isResettingRef.current) {
        loadProject(lastPid);
      }
    }
  }, [user, fetchProjects, loadProject]);

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
        const effectiveQuery = `TOPIC: ${query}\n\nCONSTRAINTS:\n- Language: ${language}\n- Slides: ${numSlides}\n- Style: ${style || "Professional"}\n- Detail Level: ${detailLevel}`;
        body.query = effectiveQuery;
        body.phase = "script";
    } else if (targetPhase === "graphics") {
        if (!currentScript) { setIsStreaming(false); return; }
        setPhase("graphics");
        body.script = currentScript;
        body.phase = "graphics";
    }

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${token}`,
                "X-GenAI-Model": selectedModel 
            },
            body: JSON.stringify(body),
            signal: abortController.signal
        });
        await processStream(res.body!.getReader(), (msg) => {
            if (msg.log) setAgentLog(prev => [...prev, msg.log!]);
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
        }
    } finally {
        setIsStreaming(false);
    }
  }, [query, numSlides, style, detailLevel, language, currentProjectId, getToken, selectedModel]);
  
  if (authLoading) return <div className="h-screen w-screen bg-[#030712] flex items-center justify-center text-slate-400">Authenticating...</div>
  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#030712] flex items-center justify-center relative overflow-hidden">
        <button onClick={login} className="bg-blue-600 text-white px-6 py-3 rounded-xl">Sign In with Google</button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex overflow-hidden font-sans">
      
      {/* Sidebar: History */}
      <aside className={`${isHistoryOpen ? 'w-64' : 'w-20'} transition-all bg-[#0F172A] border-r border-white/10 flex flex-col shrink-0`}>
        <div className="p-4 flex justify-between items-center h-16 border-b border-white/5">
            <span className="font-bold tracking-tight">IPSA</span>
            <button onClick={handleResetSession} className="p-2 hover:bg-white/5 rounded text-slate-400 hover:text-white transition"><PlusIcon className="w-5 h-5"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {projects.map(p => (
                <button key={p.id} onClick={() => loadProject(p.id)} className={`w-full text-left p-3 rounded-lg mb-1 text-xs transition ${currentProjectId === p.id ? 'bg-blue-600/20 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                    <div className="truncate font-medium">{p.title || p.query}</div>
                    <div className="text-[10px] opacity-40 mt-1">{new Date(p.created_at).toLocaleDateString()}</div>
                </button>
            ))}
        </div>
        
        {/* User Footer */}
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#0F172A]/60">
             {isHistoryOpen ? (
                 <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                         {user.email?.[0].toUpperCase()}
                     </div>
                     <div className="flex-1 min-w-0">
                         <div className="text-xs font-medium text-white truncate">{user.email}</div>
                         <button onClick={logout} className="text-[10px] text-slate-500 hover:text-white transition">Sign Out</button>
                     </div>
                 </div>
             ) : (
                 <button onClick={logout} className="p-2 hover:bg-white/5 rounded text-slate-400 hover:text-white w-full flex justify-center" title="Sign Out">
                     <MonitorIcon className="w-5 h-5" />
                 </button>
             )}
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        
        {/* Top Logs */}
        {agentLog.length > 0 && (
            <div className="p-2 bg-black/40 border-b border-white/5 font-mono text-[10px] text-green-500 flex items-center gap-2 overflow-hidden">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0"></div>
                <div className="truncate italic">{agentLog[agentLog.length - 1]}</div>
            </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 pb-48 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-12">
                
                {phase === 'input' && (
                    <div className="text-center py-32 space-y-6">
                        <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto border border-blue-500/20">
                            <SparklesIcon className="w-10 h-10 text-blue-400" />
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Cosa creiamo oggi?</h2>
                        <p className="text-slate-400 text-lg max-w-md mx-auto font-light">Descrivi l'argomento e IPSA progetterà l'infografica perfetta.</p>
                    </div>
                )}

                {phase === 'review' && script && (
                    <div className="animate-fade-in space-y-6">
                        <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                            <h1 className="text-2xl font-bold text-white">Project Outline</h1>
                            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded-md">{script.slides.length} Slides</span>
                        </div>
                        {script.slides.map((s, i) => (
                            <div key={s.id} className="bg-white/5 p-6 rounded-2xl border border-white/10 group transition hover:border-blue-500/30">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-4">Slide {i+1}</span>
                                <input 
                                    className="w-full bg-transparent text-xl font-bold text-white mb-3 outline-none border-b border-transparent focus:border-blue-500/50" 
                                    value={s.title} 
                                    onChange={e => {
                                        const n = [...script.slides]; n[i].title = e.target.value; setScript({...script, slides:n});
                                    }}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Visual Prompt</label>
                                        <textarea className="w-full bg-black/20 rounded-xl p-3 text-sm text-slate-300 min-h-[120px] outline-none border border-white/5 focus:border-blue-500/30 resize-none" value={s.image_prompt} onChange={e => {
                                            const n = [...script.slides]; n[i].image_prompt = e.target.value; setScript({...script, slides:n});
                                        }} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Speaker Notes</label>
                                        <textarea className="w-full bg-black/20 rounded-xl p-3 text-sm text-slate-400 min-h-[120px] outline-none border border-white/5 focus:border-blue-500/30 resize-none" value={s.description || ""} onChange={e => {
                                            const n = [...script.slides]; n[i].description = e.target.value; setScript({...script, slides:n});
                                        }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {phase === 'graphics' && (
                    <div className="grid grid-cols-1 gap-12 animate-fade-in">
                         {script?.slides.map((s, i) => (
                             <div key={s.id} className="space-y-4">
                                 <div className="flex justify-between items-center">
                                     <h3 className="text-lg font-semibold text-slate-200">{i+1}. {s.title}</h3>
                                 </div>
                                 <div className="aspect-video bg-slate-900 rounded-3xl overflow-hidden relative border border-white/5 shadow-2xl">
                                     {s.image_url ? (
                                         <img src={s.image_url} className="w-full h-full object-cover" />
                                     ) : (
                                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                                             <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                             <span className="text-sm text-slate-400 font-light tracking-wide animate-pulse">Generazione grafica in corso...</span>
                                         </div>
                                     )}
                                 </div>
                                 <p className="text-sm text-slate-500 italic px-2">{s.image_prompt.substring(0, 150)}...</p>
                             </div>
                         ))}
                    </div>
                )}
            </div>
        </div>

        {/* Floating Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pointer-events-none">
            <div className="max-w-3xl mx-auto bg-[#1E293B]/80 backdrop-blur-2xl border border-white/10 p-4 rounded-3xl shadow-3xl pointer-events-auto flex flex-col gap-4">
                <textarea 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    className="bg-transparent border-0 outline-none text-white text-lg placeholder-slate-500 resize-none px-2 min-h-[60px]"
                    placeholder="Di cosa parliamo oggi?"
                />
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                    <div className="flex gap-2">
                         <div className="px-3 py-1.5 bg-black/40 rounded-full flex items-center gap-2 border border-white/5">
                             <GlobeIcon className="w-3.5 h-3.5 text-slate-400" />
                             <select value={language} onChange={e => setLanguage(e.target.value)} className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer">
                                 <option value="Italian">Italiano</option>
                                 <option value="English">English</option>
                                 <option value="Spanish">Español</option>
                             </select>
                         </div>
                         <div className="px-3 py-1.5 bg-black/40 rounded-full flex items-center gap-2 border border-white/5">
                             <MonitorIcon className="w-3.5 h-3.5 text-slate-400" />
                             <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer">
                                 <option value="gemini-3.0-flash">Gemini 3.0</option>
                                 <option value="gemini-2.5-flash">Gemini 2.5</option>
                             </select>
                         </div>
                    </div>
                    {phase === 'review' ? (
                        <button onClick={() => handleStream('graphics', script!)} disabled={isStreaming} className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50">
                            {isStreaming ? "Creazione in corso..." : "Genera Immagini"}
                        </button>
                    ) : (
                        <button onClick={() => handleStream('script')} disabled={isStreaming || !query.trim()} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
                            {isStreaming ? <RefreshIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4"/>}
                            <span>Crea Piano</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
      </main>

      {/* Right Sidebar: Quick Settings */}
      <aside className="w-80 bg-[#0F172A] border-l border-white/10 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <LayoutIcon className="w-3 h-3" /> Impostazioni Progetto
              </h3>
              
              <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Numero Slide</label>
                  <div className="flex items-center gap-4 bg-black/20 p-1 rounded-xl border border-white/5">
                      <button onClick={() => setNumSlides(Math.max(1, numSlides-1))} className="p-2 hover:bg-white/5 rounded text-slate-400">-</button>
                      <span className="flex-1 text-center font-mono font-bold">{numSlides}</span>
                      <button onClick={() => setNumSlides(Math.min(20, numSlides+1))} className="p-2 hover:bg-white/5 rounded text-slate-400">+</button>
                  </div>
              </div>

              <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Stile Visuale</label>
                  <div className="grid grid-cols-1 gap-2">
                      {['Modern Minimalist', 'Cyberpunk', 'Hand Drawn', 'Corporate Blue'].map(s => (
                          <button key={s} onClick={() => setStyle(s)} className={`text-left px-4 py-2.5 rounded-xl text-xs border transition ${style === s ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-black/20 border-transparent text-slate-400 hover:text-slate-200'}`}>
                              {s}
                          </button>
                      ))}
                  </div>
              </div>
          </div>

          <div className="mt-auto bg-gradient-to-br from-blue-600/10 to-purple-600/10 p-4 rounded-2xl border border-blue-500/20 space-y-2">
              <div className="text-[10px] font-bold text-blue-400 uppercase">Sistema ADK Nativo</div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                  Sessione gestita via Firestore con persistenza degli eventi per una memoria contestuale infinita.
              </p>
          </div>
      </aside>
    </div>
  );
}
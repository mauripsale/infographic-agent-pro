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
  const [language, setLanguage] = useState("English");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  
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
        // Improved Query Format
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
  
  const removeFile = (index: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== index));

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
      <aside className={`${isHistoryOpen ? 'w-64' : 'w-20'} transition-all bg-[#0F172A] border-r border-white/10 flex flex-col`}>
        <div className="p-4 flex justify-between items-center">
            <span className="font-bold">IPSA</span>
            <button onClick={handleResetSession} className="p-2 hover:bg-white/5 rounded"><PlusIcon className="w-5 h-5"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
            {projects.map(p => (
                <button key={p.id} onClick={() => loadProject(p.id)} className={`w-full text-left p-2 rounded mb-1 text-sm ${currentProjectId === p.id ? 'bg-blue-600/20' : ''}`}>
                    {p.title || p.query}
                </button>
            ))}
        </div>
        
        {/* RESTORED USER FOOTER UI */}
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#0F172A]/60 flex items-center justify-center overflow-hidden">
             {isHistoryOpen ? (
                 <div className="w-full">
                     <div className="flex items-center gap-3 mb-3">
                         <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                             {user.email?.[0].toUpperCase()}
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="text-xs font-medium text-white truncate">{user.email}</div>
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

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 pb-48">
            <div className="max-w-3xl mx-auto">
                {agentLog.length > 0 && (
                    <div className="bg-black/50 p-3 rounded mb-4 font-mono text-xs text-green-400">
                        {agentLog.slice(-1)[0]}
                    </div>
                )}

                {phase === 'review' && script && (
                    <div className="space-y-4">
                        {script.slides.map((s, i) => (
                            <div key={s.id} className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h3 className="font-bold mb-2">{s.title}</h3>
                                <p className="text-xs text-slate-400">{s.image_prompt}</p>
                            </div>
                        ))}
                    </div>
                )}

                {phase === 'graphics' && (
                    <div className="grid grid-cols-1 gap-6">
                         {script?.slides.map(s => (
                             <div key={s.id} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                 <h3 className="text-sm font-medium mb-3">{s.title}</h3>
                                 <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                                     {s.image_url ? <img src={s.image_url} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center animate-pulse">Generating...</div>}
                                 </div>
                             </div>
                         ))}
                    </div>
                )}
            </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#030712] to-transparent">
            <div className="max-w-3xl mx-auto bg-slate-900 border border-white/10 p-4 rounded-2xl flex flex-col gap-3">
                <textarea 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    className="bg-transparent border-0 outline-none text-white resize-none"
                    placeholder="Enter your topic..."
                />
                <div className="flex justify-between items-center">
                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="bg-black/50 text-xs rounded p-1">
                        <option value="gemini-2.5-flash">Gemini 2.5</option>
                        <option value="gemini-3.0-flash">Gemini 3.0</option>
                    </select>
                    {phase === 'review' ? (
                        <button onClick={() => handleStream('graphics', script!)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Generate Images</button>
                    ) : (
                        <button onClick={() => handleStream('script')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Generate Plan</button>
                    )}
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}

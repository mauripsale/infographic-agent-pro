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

// Constants
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://infographic-agent-backend-218788847170.us-central1.run.app";
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;

// Interfaces
interface Slide {
  id: string;
  title: string;
  image_prompt: string;
  description?: string;
  image_url?: string;
}

interface ProjectSummary {
  id: string;
  title?: string;
  query: string;
  status: string;
  slide_count?: number;
  created_at: any;
}

interface ProjectDetails extends ProjectSummary {
  script: {
    slides: Slide[];
    global_settings?: any;
  };
  export_pdf_url?: string;
  export_zip_url?: string;
}

type Project = ProjectSummary;

interface A2UIComponent {
  id: string;
  component: string;
  src?: string;
  text?: string;
  status?: "waiting" | "generating" | "success" | "error" | "skipped";
  children?: string[];
  [key: string]: any;
}

// --- UI Components ---
const SegmentedControl = ({ options, value, onChange, label }: { options: string[], value: string, onChange: (val: string) => void, label: string }) => (
  <div className="mb-6">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block pl-1">{label}</label>
    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 overflow-hidden">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 py-2.5 text-[10px] font-bold rounded-lg transition-all duration-300 ${value === opt 
            ? 'bg-[#0066FF] text-white shadow-lg shadow-blue-600/20'
            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

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
  const { 
    user, 
    loading: authLoading, 
    login, 
    logout, 
    getToken, 
    getGoogleAccessToken,
    grantSlidesPermissions,
    hasSlidesPermissions 
  } = useAuth();
  
  const [query, setQuery] = useState("");
  const [modelType, setModelType] = useState<"flash" | "pro">("flash");
  
  // Settings & Auth State
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); 
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [inputApiKey, setInputApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  
  // Mobile UX
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Generation Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3"); // Default to average (1-5 scale)
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [language, setLanguage] = useState("English");
  
  // Brand Kit State
  const [brandPrimary, setBrandPrimary] = useState("");
  const [brandSecondary, setBrandSecondary] = useState("");
  
  const [phase, setPhase] = useState<"input" | "review" | "graphics">("input");
  const [script, setScript] = useState<any>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [surfaceState, setSurfaceState] = useState<any>({ components: {}, dataModel: {} });
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brandingInputRef = useRef<HTMLInputElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Multi-Upload State
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [brandingFiles, setBrandingFiles] = useState<File[]>([]);
  
  // UX State
  const [visiblePrompts, setVisiblePrompts] = useState<Record<string, boolean>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Refine State
  const [refiningSlideId, setRefiningSlideId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // --- Helpers ---
  const parseQueryToSettings = (fullQuery: string) => {
      const settingsRegex = /\ \[GENERATION SETTINGS\] Slides: (\d+), Style: (.*?), Detail: (.*?), AR: (.*?), Lang: (.*)\n\n\[USER REQUEST\]\n([\s\S]*)/;
      const match = fullQuery.match(settingsRegex);
      if (match) {
          return {
              numSlides: parseInt(match[1]),
              style: match[2],
              detailLevel: match[3],
              aspectRatio: match[4],
              language: match[5],
              userPrompt: match[6].trim()
          };
      }
      return { userPrompt: fullQuery };
  };

  const getCleanTitle = (p: ProjectSummary) => {
      if (p.title) return p.title;
      const settings = parseQueryToSettings(p.query);
      const title = settings.userPrompt;
      return title.length > 60 ? title.substring(0, 57) + "..." : title || "Untitled Project";
  };

  const formatDate = (timestamp: { seconds: number } | string | Date | null | undefined): string => {
      if (!timestamp) return "Unknown date";
      try {
          if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
              return new Date((timestamp as any).seconds * 1000).toLocaleDateString(undefined, { 
                  month: 'short', day: 'numeric'
              });
          }
          const dateObj = new Date(timestamp as any);
          if (isNaN(dateObj.getTime())) return "Invalid date";
          return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch (e) {
          return "Invalid date";
      }
  };

  const fetchProjects = useCallback(async () => {
      setIsLoadingHistory(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/projects`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await res.json();
          setProjects(data);
      } catch (e) {
          console.error("Failed to fetch projects", e);
      } finally {
          setIsLoadingHistory(false);
      }
  }, [getToken]);

  const checkSettings = useCallback(async () => {
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/settings`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await res.json();
          setHasApiKey(data.has_api_key);
          if (!data.has_api_key) setShowSettings(true); 
      } catch (e) {
          console.error("Failed to check settings", e);
      }
  }, [getToken]);

  const restoreProjectState = useCallback((fullProject: ProjectDetails) => {
      setCurrentProjectId(fullProject.id);
      const settings = parseQueryToSettings(fullProject.query || "");
      if (settings.numSlides) setNumSlides(settings.numSlides);
      if (settings.style) setStyle(settings.style);
      if (settings.detailLevel) setDetailLevel(settings.detailLevel);
      if (settings.aspectRatio) setAspectRatio(settings.aspectRatio);
      if (settings.language) setLanguage(settings.language);
      
      setQuery(settings.userPrompt || "");
      setScript(fullProject.script);
      setPhase("graphics");
      
      const comps: any = {
          "root": { id: "root", component: "Column", children: ["status", "grid"] },
          "status": { id: "status", component: "Text", text: "Restored Session" },
          "grid": { id: "grid", component: "Column", children: fullProject.script?.slides.map((s: any) => `card_${s.id}`) || [] }
      };
      
      fullProject.script?.slides.forEach((s: any, idx: number) => {
          if (s.image_url) {
              comps[`card_${s.id}`] = { id: `card_${s.id}`, component: "Column", children: [`title_${s.id}`, `img_${s.id}`], status: "success" };
              comps[`title_${s.id}`] = { id: `title_${s.id}`, component: "Text", text: `${idx+1}. ${s.title}` };
              comps[`img_${s.id}`] = { id: `img_${s.id}`, component: "Image", src: s.image_url };
          } else {
              comps[`card_${s.id}`] = { id: `card_${s.id}`, component: "Text", text: "Waiting...", status: "waiting" };
          }
      });
      
      setSurfaceState({ components: comps, dataModel: { script: fullProject.script } });
  }, []);

  const fetchDetailsDirectly = useCallback(async (pid: string) => {
      if (!pid || pid === "undefined" || pid === "null") return;
      setIsLoadingHistory(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/projects/${pid}`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
              const fullProject: ProjectDetails = await res.json();
              restoreProjectState(fullProject);
          } else {
              localStorage.removeItem("lastProjectId"); 
          }
      } catch (e) {
          console.error("Auto-resume failed", e);
          localStorage.removeItem("lastProjectId");
      } finally {
          setIsLoadingHistory(false);
      }
  }, [getToken, restoreProjectState]);

  useEffect(() => {
    if (user) {
        checkSettings();
        fetchProjects();
        const lastPid = localStorage.getItem("lastProjectId");
        if (lastPid && lastPid !== "undefined" && lastPid !== "null") {
            fetchDetailsDirectly(lastPid);
        }
    }
  }, [user, checkSettings, fetchProjects, fetchDetailsDirectly]);

  const loadProject = async (projectSummary: ProjectSummary) => {
      setIsLoadingHistory(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/projects/${projectSummary.id}`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          if (!res.ok) throw new Error("Failed to load project details");
          const fullProject: ProjectDetails = await res.json();
          restoreProjectState(fullProject);
          localStorage.setItem("lastProjectId", fullProject.id);
          setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      } catch (e) {
          console.error("Load Project Error", e);
          alert("Failed to load project details.");
      } finally {
          setIsLoadingHistory(false);
      }
  };

  const handleResetSession = () => {
      localStorage.removeItem("lastProjectId");
      setQuery("");
      setPhase("input");
      setScript(null);
      setSurfaceState({ components: {}, dataModel: {} });
      setUploadedFiles([]);
      setBrandingFiles([]);
      setCurrentProjectId(null); // CRITICAL: Ensure backend creates new ID
      setVisiblePrompts({});
      setShowResetConfirm(false);
  };

  const resetGenerationOnly = () => {
      setPhase("input");
      setScript(null);
      setSurfaceState({ components: {}, dataModel: {} });
      setCurrentProjectId(null); // ALSO CRITICAL
      setVisiblePrompts({});
      setShowResetConfirm(false);
      setTimeout(() => handleStream("script"), 100);
  };

  const handleLogout = useCallback(async () => {
    localStorage.removeItem("lastProjectId");
    handleResetSession();
    await logout();
  }, [logout]);

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsStreaming(false);
          setSurfaceState((prev: any) => {
              const newComps = { ...prev.components };
              let changed = false;
              Object.keys(newComps).forEach(key => {
                  if (newComps[key].status === "generating") {
                      newComps[key] = { ...newComps[key], status: "error", text: "Stopped" };
                      changed = true;
                  }
              });
              return changed ? { ...prev, components: newComps } : prev;
          });
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const newFiles = Array.from(e.target.files);
          setUploadedFiles(prev => [...prev, ...newFiles]);
          if (!query && newFiles.length > 0) {
              setQuery(`Summarize ${newFiles[0].name} into an infographic presentation.`);
          }
      }
  };

  const handleBrandingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const newFiles = Array.from(e.target.files);
          setBrandingFiles(prev => [...prev, ...newFiles]);
      }
  };

  const removeFile = (type: 'source' | 'brand', index: number) => {
      if (type === 'source') {
          setUploadedFiles(prev => prev.filter((_, i) => i !== index));
      } else {
          setBrandingFiles(prev => prev.filter((_, i) => i !== index));
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
              [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "generating", text: "Drawing..." }
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
                  aspect_ratio: aspectRatio,
                  project_id: currentProjectId
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
      } catch (e) { console.error("Retry failed", e); }
  };

  const handleRefine = async (slide: Slide) => {
      if (!refineInstruction) return;
      setIsRefining(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/agent/refine_text`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({
                  slide_id: slide.id,
                  current_title: slide.title,
                  current_description: slide.description,
                  instruction: refineInstruction,
                  project_id: currentProjectId
              })
          });
          if (!res.ok) throw new Error("Refinement failed");
          const refinedData = await res.json();
          setScript((prev: any) => ({
              ...prev,
              slides: prev.slides.map((s: Slide) => s.id === slide.id ? { ...s, title: refinedData.title, description: refinedData.description } : s)
          }));
          setRefiningSlideId(null);
          setRefineInstruction("");
      } catch (e) { console.error("Refine Error", e); alert("Failed to refine text."); } finally { setIsRefining(false); }
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
        setScript({ slides: Array.from({ length: numSlides }).map((_, i) => ({ id: `loading_${i}`, title: "Generating…", image_prompt: "…" })) });
        setSurfaceState({ components: {}, dataModel: {} });
        setVisiblePrompts({});
        // Force reset project ID if we are starting fresh (redundant but safe)
        if (!currentProjectId) {
            localStorage.removeItem("lastProjectId");
        }
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

        const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        const fileIds: string[] = [];
        const allFiles = [...uploadedFiles, ...brandingFiles];
        
        for (const f of allFiles) {
            const formData = new FormData();
            formData.append("file", f);
            try {
                const uploadRes = await fetch(`${BACKEND_URL}/agent/upload`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
                const uploadData = await uploadRes.json();
                if (uploadData.file_id) fileIds.push(uploadData.file_id);
            } catch (e) { console.error(e); }
        }

        const effectiveQuery = `[GENERATION SETTINGS] Slides: ${numSlides}, Style: ${style || "Professional"}, Detail: ${detailLevel}, AR: ${aspectRatio}, Lang: ${language}
Brand Colors: Primary=${brandPrimary || "N/A"}, Secondary=${brandSecondary || "N/A"}\n\n[USER REQUEST]\n${query}`;

        try {
            const res = await fetch(`${BACKEND_URL}/agent/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-GenAI-Model": selectedModel, "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ query: effectiveQuery, phase: "script", project_id: currentProjectId, file_ids: fileIds }),
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
                if (msg.updateDataModel) {
                    if (msg.updateDataModel.value?.script) setScript(msg.updateDataModel.value.script);
                    if (msg.updateDataModel.value?.project_id) {
                        setCurrentProjectId(msg.updateDataModel.value.project_id);
                        localStorage.setItem("lastProjectId", msg.updateDataModel.value.project_id);
                    }
                }
            });
        } catch (e: any) { } finally { setIsStreaming(false); fetchProjects(); }
        return;
    }

    if (targetPhase === "graphics" && currentScript) {
        setPhase("graphics");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        const pendingSlides = (currentScript.slides || []).filter((s: Slide) => !s.image_url);
        if (pendingSlides.length === 0) { setIsStreaming(false); return; }

        try {
            for (let i = 0; i < pendingSlides.length; i += 3) {
                if (abortController.signal.aborted) break;
                const batchSlides = pendingSlides.slice(i, i + 3);
                const isFirstBatch = i === 0;
                await fetch(`${BACKEND_URL}/agent/stream`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-GenAI-Model": selectedModel, "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ phase: "graphics", script: { ...currentScript, slides: batchSlides }, project_id: currentProjectId, skip_grid_init: !isFirstBatch }),
                    signal: abortController.signal
                }).then(async (res) => {
                    await processStream(res.body!.getReader(), (msg) => {
                        if (msg.updateComponents) {
                            setSurfaceState((prev: any) => {
                                const nextComps = { ...prev.components };
                                msg.updateComponents.components.forEach((c: any) => nextComps[c.id] = c);
                                return { ...prev, components: nextComps };
                            });
                            msg.updateComponents.components.forEach((c: any) => {
                                if (c.component === "Image" && c.src) {
                                    const sid = c.id.replace("img_", "");
                                    setScript((prev: any) => ({ ...prev, slides: prev.slides.map((s: Slide) => s.id === sid ? { ...s, image_url: c.src } : s) }));
                                }
                            });
                        }
                    });
                });
            }
        } catch (e: any) { } finally { setIsStreaming(false); fetchProjects(); }
    }
  };

  const startScriptGen = () => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (script || Object.keys(surfaceState.components).length > 0) setShowConfirm(true);
    else handleStream("script");
  };

  const handleExport = async (fmt: "zip" | "pdf" | "slides" | "pdf_handout") => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (!script) return;
    setIsExporting(true);
    const token = await getToken();
    
    if (fmt === "slides") {
        try {
            let googleToken = await getGoogleAccessToken();
            if (!hasSlidesPermissions || !googleToken) googleToken = await grantSlidesPermissions();
            if (!googleToken) { setIsExporting(false); return; }
            const slidesPayload = script.slides.map((s: Slide) => {
                const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
                return { title: s.title, description: s.description, image_url: comp ? comp.src : (s.image_url || null) };
            });
            const res = await fetch(`${BACKEND_URL}/agent/export_slides`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ google_token: googleToken, title: query.substring(0, 50) || "Infographic", slides: slidesPayload }) });
            const data = await res.json();
            if (data.url) window.open(data.url, "_blank");
        } catch (e) { } finally { setIsExporting(false); }
        return;
    }
    const imgUrls = script.slides.map((s: Slide) => (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url).filter(Boolean);
    if (imgUrls.length === 0) { alert("No images generated yet."); setIsExporting(false); return; }
    try {
        const res = await fetch(`${BACKEND_URL}/agent/export`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ images: imgUrls, format: fmt, project_id: currentProjectId, slides_data: script.slides.map((s: Slide) => ({ title: s.title, description: s.description || s.image_prompt })) }) });
        const data = await res.json();
        if (data.url) {
            const link = document.createElement('a');
            link.href = data.url.startsWith("/") ? `${BACKEND_URL}${data.url}` : data.url;
            link.target = '_blank';
            link.click();
        }
    } catch(e) { } finally { setIsExporting(false); }
  };

  const handleSlideChange = (id: string, field: string, value: string) => {
    setScript((prev: any) => ({ ...prev, slides: prev.slides.map((s: Slide) => s.id === id ? { ...s, [field]: value } : s) }));
  };

  const togglePrompt = (id: string) => { setVisiblePrompts(prev => ({ ...prev, [id]: !prev[id] })); };

  // Lightbox Navigation
  const navigateLightbox = useCallback((dir: number) => {
      if (!script || lightboxIndex === null) return;
      const newIndex = lightboxIndex + dir;
      if (newIndex >= 0 && newIndex < script.slides.length) setLightboxIndex(newIndex);
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
      if (!document.fullscreenElement) lightboxRef.current.requestFullscreen().catch(err => console.error(err));
      else document.exitFullscreen();
  };

  const saveSettings = async () => {
      if (!inputApiKey.startsWith("AIza")) { alert("Invalid Gemini Key format."); return; }
      setIsSavingKey(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/user/settings`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ api_key: inputApiKey }) });
          if (res.ok) { setHasApiKey(true); setShowSettings(false); setInputApiKey(""); }
      } catch (e) { console.error(e); } finally { setIsSavingKey(false); }
  };

  if (authLoading) return <div className="min-h-screen bg-[#030712] flex items-center justify-center text-white font-bold animate-pulse">Loading Identity...</div>;
  
  if (!user) {
      return (
          <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 relative overflow-hidden">
              <div className="absolute inset-0 z-0 bg-grid pointer-events-none"></div>
              <div className="max-w-md w-full glass-panel p-10 rounded-3xl shadow-2xl text-center flex flex-col gap-8 animate-fade-in relative z-10">
                  <div className="mx-auto w-16 h-16 bg-[#0066FF] rounded-2xl flex items-center justify-center text-white shadow-lg glow-primary"><MonitorIcon /></div>
                  <div>
                      <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">IPSA</h1>
                      <p className="text-[#0066FF] font-bold text-sm uppercase tracking-[0.3em] mb-6">Visual Architect</p>
                      <p className="text-slate-400 text-base max-w-sm mx-auto leading-relaxed">Transform complex technical insights into stunning narratives.</p>
                  </div>
                  <button onClick={login} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl">
                      <GoogleIcon /> Sign in with Google
                  </button>
              </div>
          </div>
      );
  }

  const hasGeneratedImages = script?.slides.some((s: Slide) => (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 z-0 bg-grid pointer-events-none"></div>

      {/* FLOATING EXPORT DOCK */}
      {script && !isStreaming && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-full px-8 py-4 flex items-center gap-6 animate-fade-in-up shadow-2xl border border-white/10 backdrop-blur-xl">
              <button onClick={() => handleExport("zip")} disabled={isExporting} className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all group relative" title="Download ZIP">
                  <FileUpIcon className="w-5 h-5" />
                  <span className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">ZIP ARCHIVE</span>
              </button>
              <button onClick={() => handleExport("pdf")} disabled={isExporting} className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all group relative" title="Download PDF">
                  <DownloadIcon className="w-5 h-5" />
                  <span className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">PDF HANDOUT</span>
              </button>
              <div className="w-px h-8 bg-white/10"></div>
              <button onClick={() => handleExport("slides")} disabled={isExporting} className="flex items-center gap-3 px-6 py-3 bg-[#fbbc04]/10 hover:bg-[#fbbc04]/20 text-[#fbbc04] rounded-full font-bold text-xs transition-all border border-[#fbbc04]/20 hover:border-[#fbbc04]/40 hover:shadow-[0_0_20px_rgba(251,188,4,0.2)]">
                  <PresentationIcon className="w-4 h-4" /> Google Slides
              </button>
          </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 h-24 z-40 flex items-center justify-between px-8 bg-gradient-to-b from-[#030712] via-[#030712]/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
            <div className="w-10 h-10 bg-[#0066FF] rounded-xl flex items-center justify-center text-white shadow-lg glow-primary"><MonitorIcon /></div>
            <div className="flex flex-col">
                <span className="text-xl font-black text-white tracking-tighter">IPSA</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#0066FF] font-bold">Visual Architect</span>
            </div>
        </div>
        <div className="flex items-center gap-4 pointer-events-auto">
            <button onClick={() => setShowResetConfirm(true)} className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all border-0"><PlusIcon /></button>
            <button onClick={() => setShowRightSidebar(!showRightSidebar)} className={`w-10 h-10 rounded-full glass-panel flex items-center justify-center transition-all border-0 ${showRightSidebar ? 'text-[#0066FF] bg-blue-500/10' : 'text-slate-400 hover:text-white'}`}><HistoryIcon /></button>
            <button onClick={() => setShowSettings(true)} className={`w-10 h-10 rounded-full glass-panel flex items-center justify-center transition-all border-0 ${hasApiKey ? 'text-slate-400 hover:text-white' : 'text-red-400 animate-pulse'}`}><SettingsIcon /></button>
            
            {/* User Menu */}
            <div className="relative group">
                <div className="w-10 h-10 rounded-full glass-panel overflow-hidden border border-white/10 ml-2 cursor-pointer">
                    <img src={user.photoURL || ""} className="w-full h-full object-cover" alt="Avatar" />
                </div>
                <div className="absolute right-0 top-12 w-32 bg-black/90 glass-panel rounded-xl p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto border border-white/10">
                    <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs font-bold text-red-400 hover:bg-white/5 rounded-lg">Log Out</button>
                </div>
            </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative z-10 px-6 pb-6 gap-6">
        
        {/* LEFT SIDEBAR (SETTINGS) */}
        <aside className="w-[340px] glass-panel rounded-3xl flex flex-col transition-all duration-500 transform translate-x-0">
            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                
                {/* Model Selector Pille */}
                <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 mb-8">
                    <button onClick={() => setModelType("flash")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${modelType === "flash" ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}>⚡ Flash</button>
                    <button onClick={() => setModelType("pro")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${modelType === "pro" ? "bg-[#0066FF] text-white shadow-lg shadow-blue-900/50" : "text-slate-500 hover:text-slate-300"}`}>💎 Pro</button>
                </div>

                <div className="mb-8">
                    <div className="flex justify-between mb-4 px-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Slide Count</label>
                        <input 
                            type="number" 
                            min={MIN_SLIDES} 
                            max={MAX_SLIDES} 
                            value={numSlides} 
                            onChange={(e) => {
                                const num = parseInt(e.target.value, 10);
                                if (!isNaN(num)) setNumSlides(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, num)));
                            }}
                            className="bg-transparent w-12 text-right outline-none text-[#0066FF] font-mono font-bold text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-white/5">
                        <button onClick={() => setNumSlides(Math.max(MIN_SLIDES, numSlides - 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-400 transition-colors"><MinusIcon width={14}/></button>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden relative">
                            <div className="h-full bg-[#0066FF] absolute top-0 left-0 transition-all duration-300" style={{ width: `${((numSlides - MIN_SLIDES) / (MAX_SLIDES - MIN_SLIDES)) * 100}%` }}></div>
                        </div>
                        <input type="range" min={MIN_SLIDES} max={MAX_SLIDES} value={numSlides} onChange={(e) => setNumSlides(parseInt(e.target.value))} className="absolute opacity-0 w-full" />
                        <button onClick={() => setNumSlides(Math.min(MAX_SLIDES, numSlides + 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-400 transition-colors"><PlusIcon width={14}/></button>
                    </div>
                </div>

                <SegmentedControl label="Detail Level" options={["1", "2", "3", "4", "5"]} value={detailLevel} onChange={setDetailLevel} />
                <SegmentedControl label="Aspect Ratio" options={["16:9", "4:3", "9:16"]} value={aspectRatio} onChange={setAspectRatio} />
                <SegmentedControl label="Language" options={["English", "Italian"]} value={language} onChange={setLanguage} />

                <div className="mb-8">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block pl-1">Visual Style</label>
                    <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Minimalist, Tech, Noir..." className="w-full glass-input rounded-xl px-4 py-3 text-sm outline-none placeholder-slate-600" />
                </div>

                <div className="pt-8 border-t border-white/5">
                     <div className="flex items-center gap-2 mb-6"><PaletteIcon className="text-[#0066FF]"/><span className="text-[10px] font-bold text-white uppercase tracking-widest">Brand Kit</span></div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5"><div className="w-6 h-6 rounded-lg overflow-hidden border border-white/10 relative"><input type="color" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"/></div><input type="text" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#Primary" className="w-full bg-transparent text-[10px] font-mono outline-none text-slate-300"/></div>
                        <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5"><div className="w-6 h-6 rounded-lg overflow-hidden border border-white/10 relative"><input type="color" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"/></div><input type="text" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} placeholder="#Sec" className="w-full bg-transparent text-[10px] font-mono outline-none text-slate-300"/></div>
                     </div>
                </div>
            </div>
        </aside>

        {/* CENTER STAGE */}
        <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-32">
                <div className={`transition-all duration-700 ease-out max-w-4xl mx-auto ${phase === 'input' ? 'mt-[12vh]' : 'mt-0'}`}>
                    <div className="relative group">
                        {/* Decorative Gradient - MUST have pointer-events-none to not block clicks */}
                        <div className={`absolute -inset-1 bg-gradient-to-r from-[#0066FF] to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 pointer-events-none ${phase !== 'input' ? 'hidden' : ''}`}></div>
                        
                        <div 
                            className={`glass-panel rounded-3xl p-1 transition-all duration-500 border-0 relative z-10 ${phase !== 'input' ? 'h-24 flex items-center cursor-pointer hover:bg-white/5' : 'h-64'}`}
                            onClick={() => phase !== 'input' && setPhase('input')}
                        >
                            <textarea 
                                value={query} 
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => setPhase('input')}
                                placeholder="What are we building today?"
                                className={`w-full h-full bg-transparent border-0 text-slate-100 placeholder-slate-600 text-2xl p-8 outline-none resize-none font-medium z-20 relative pointer-events-auto ${phase !== 'input' ? 'cursor-pointer text-lg' : ''}`}
                            />
                            {phase !== 'input' && (
                                <div className="pr-8 flex flex-col gap-2 relative z-30">
                                     <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"><EditIcon/></button>
                                </div>
                            )}
                        </div>
                    </div>

                    {phase === 'input' && (
                        <div className="mt-8 flex flex-wrap gap-4 items-center justify-between animate-fade-in-up">
                            <div className="flex gap-3">
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all"><FileUpIcon /> Sources</button>
                                <button onClick={() => brandingInputRef.current?.click()} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all"><PaletteIcon /> Assets</button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} multiple />
                                <input type="file" ref={brandingInputRef} className="hidden" onChange={handleBrandingUpload} multiple />
                            </div>
                            <button onClick={startScriptGen} disabled={isStreaming || !hasApiKey} className="px-10 py-4 bg-[#0066FF] hover:bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-xl glow-primary transition-all flex items-center gap-3 disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95">
                                <SparklesIcon className="w-5 h-5"/> GENERATE
                            </button>
                        </div>
                    )}
                    
                    {/* File Chips */}
                    {(uploadedFiles.length > 0 || brandingFiles.length > 0) && phase === 'input' && (
                        <div className="mt-6 flex flex-wrap gap-2 animate-fade-in">
                            {uploadedFiles.map((f,i) => <span key={i} className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-2 uppercase tracking-wide">{f.name} <button onClick={() => removeFile('source', i)}>×</button></span>)}
                            {brandingFiles.map((f,i) => <span key={i} className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 flex items-center gap-2 uppercase tracking-wide">{f.name} <button onClick={() => removeFile('brand', i)}>×</button></span>)}
                        </div>
                    )}
                </div>

                {/* RESULTS GRID */}
                {(phase !== 'input' || isStreaming) && (
                    <div className="mt-16 max-w-[1400px] mx-auto animate-fade-in">
                        <div className="flex items-center justify-between mb-10 px-2">
                            <h2 className="text-3xl font-black text-white tracking-tighter">Preview</h2>
                            {script && !isStreaming && <button onClick={() => handleStream("graphics", script)} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/20 text-xs tracking-wide uppercase transition-all hover:scale-105">{hasGeneratedImages ? "Regenerate All" : "Render Graphics"}</button>}
                            {isStreaming && <button onClick={handleStop} className="px-6 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl font-bold text-xs uppercase animate-pulse">STOP GENERATION</button>}
                        </div>

                        {isStreaming && !script && (
                           <div className="w-full glass-panel rounded-3xl p-20 flex flex-col items-center justify-center text-center border-0">
                               <div className="w-20 h-20 border-4 border-[#0066FF] border-t-transparent rounded-full animate-spin mb-8"></div>
                               <h3 className="text-2xl font-black text-white mb-3">Architecting...</h3>
                               <p className="text-slate-400 font-medium">Analyzing content and defining flow.</p>
                           </div>
                        )}

                        {script && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                                {script.slides.map((s: Slide, idx: number) => {
                                    const cardComp = surfaceState.components[`card_${s.id}`];
                                    const src = (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url;
                                    const isGenerating = cardComp?.status === "generating";
                                    return (
                                        <div key={s.id} className="group relative perspective-1000">
                                            <div className="relative glass-panel rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-black/50 transition-all duration-500 border-0 bg-[#050a15]/80 hover:-translate-y-2">
                                                
                                                {/* Header - Always Visible */}
                                                <div className="absolute top-4 left-4 z-20">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/5">Slide {idx + 1}</span>
                                                </div>

                                                {/* Hover Actions Toolbar */}
                                                <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-[-10px] group-hover:translate-y-0">
                                                    <button onClick={() => { setRefiningSlideId(s.id); setRefineInstruction(""); }} className="p-2 rounded-lg bg-black/60 backdrop-blur-md text-slate-300 hover:text-[#0066FF] hover:bg-white/10 transition-colors border border-white/5" title="Magic Refine"><MagicWandIcon width={16} /></button>
                                                    <button onClick={() => togglePrompt(s.id)} className="p-2 rounded-lg bg-black/60 backdrop-blur-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors border border-white/5" title="Edit Prompt"><EditIcon width={16} /></button>
                                                </div>

                                                <div className="aspect-video w-full bg-black/50 relative flex items-center justify-center overflow-hidden">
                                                    {isGenerating && <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 backdrop-blur-sm"><div className="w-10 h-10 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin"></div></div>}
                                                    {src && !visiblePrompts[s.id] ? (
                                                        <div className="w-full h-full relative cursor-zoom-in" onClick={() => setLightboxIndex(idx)}>
                                                            <img src={src} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={s.title} />
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-8 w-full h-full flex flex-col justify-center text-center">
                                                            {refiningSlideId === s.id ? (
                                                                <div className="flex flex-col gap-4 animate-fade-in h-full justify-center">
                                                                    <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent border-b border-white/10 text-lg font-bold text-white outline-none pb-2 text-center focus:border-[#0066FF]" />
                                                                    <textarea value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="How should we change this?" className="bg-white/5 rounded-xl p-4 text-xs text-slate-300 resize-none outline-none h-24" />
                                                                    <div className="flex justify-center gap-3">
                                                                        <button onClick={() => setRefiningSlideId(null)} className="text-xs font-bold text-slate-500 hover:text-white px-4 py-2">Cancel</button>
                                                                        <button onClick={() => handleRefine(s)} disabled={isRefining} className="px-6 py-2 bg-[#0066FF] rounded-lg text-xs font-bold text-white shadow-lg hover:bg-blue-600">{isRefining ? "..." : "Apply"}</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-4">
                                                                    <h4 className="font-bold text-white text-xl leading-tight max-w-xs">{s.title}</h4>
                                                                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs line-clamp-4">{s.description || s.image_prompt}</p>
                                                                    {!src && <button onClick={() => retrySlide(s.id)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-[#0066FF] border border-blue-500/30 hover:border-blue-500/50 transition-all uppercase tracking-wide mt-4">Generate Visual</button>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>

        {/* RIGHT SIDEBAR (History) */}
        <aside className={`w-[320px] glass-panel rounded-3xl flex flex-col transition-all duration-500 transform ${showRightSidebar ? "translate-x-0" : "translate-x-[120%] hidden xl:flex w-0 opacity-0"}`}>
            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-6 mb-6">
                    <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-slate-400 uppercase"><HistoryIcon className="text-slate-500" /><span>History</span></div>
                    <button onClick={() => fetchProjects()} disabled={isLoadingHistory} className={`text-slate-500 hover:text-white transition-colors ${isLoadingHistory ? 'animate-spin' : ''}`}><RefreshIcon width={14} /></button>
                </div>
                <div className="space-y-4">
                    {projects.map(p => (
                        <div key={p.id} onClick={() => loadProject(p)} className={`p-5 rounded-2xl border transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-lg duration-300 ${currentProjectId === p.id ? 'bg-[#0066FF]/10 border-blue-500/50' : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'}`}>
                            <h4 className={`text-sm font-bold mb-3 line-clamp-2 leading-snug ${currentProjectId === p.id ? 'text-[#0066FF]' : 'text-slate-200 group-hover:text-white'}`}>{getCleanTitle(p)}</h4>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{formatDate(p.created_at)}</span>
                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md tracking-wider ${p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{p.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
      </div>

      {/* CONFIRM / SETTINGS MODALS */}
      {showConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
              <div className="glass-panel p-10 rounded-3xl max-w-sm w-full text-center border border-amber-500/20 shadow-2xl shadow-amber-900/20">
                  <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-6"><RefreshIcon width={32} /></div>
                  <h3 className="text-2xl font-black text-white mb-2">Regenerate?</h3>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">This will overwrite the current plan.</p>
                  <div className="flex gap-4">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={() => { setShowConfirm(false); handleStream("script"); }} className="flex-1 py-3.5 rounded-xl bg-[#0066FF] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg glow-primary">Confirm</button>
                  </div>
              </div>
          </div>
      )}

      {showSettings && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
              <div className="glass-panel p-10 rounded-3xl max-w-md w-full relative border border-slate-700/50 shadow-2xl">
                  <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><XIcon /></button>
                  <div className="flex items-center gap-4 mb-8">
                      <div className="w-14 h-14 bg-[#0066FF]/20 rounded-2xl flex items-center justify-center text-[#0066FF] border border-blue-500/20"><KeyIcon width={24} /></div>
                      <div>
                          <h3 className="text-2xl font-black text-white">API Key</h3>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Secure Storage</p>
                      </div>
                  </div>
                  <div className="flex flex-col gap-6">
                      <input type="password" value={inputApiKey} onChange={(e) => setInputApiKey(e.target.value)} placeholder="AIza..." className="w-full glass-input rounded-xl p-4 text-white font-mono text-sm" />
                      <button onClick={saveSettings} disabled={!inputApiKey || isSavingKey} className="py-4 bg-[#0066FF] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-bold shadow-xl glow-primary tracking-wide uppercase text-xs">
                          {isSavingKey ? "Saving..." : "Save Securely"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && script && (
          <div ref={lightboxRef} className="fixed inset-0 z-[100] bg-[#020617]/95 flex items-center justify-center backdrop-blur-xl animate-fade-in focus:outline-none overflow-hidden">
              <div className="absolute top-8 right-8 z-20 flex gap-4">
                  <button onClick={toggleFullscreen} className="text-white/50 hover:text-white p-3 rounded-xl hover:bg-white/10 transition-all"><MaximizeIcon /></button>
                  <button onClick={() => setLightboxIndex(null)} className="text-white/50 hover:text-white p-3 rounded-xl hover:bg-white/10 transition-all"><XIcon /></button>
              </div>
              <button onClick={() => navigateLightbox(-1)} className="absolute left-8 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-6 rounded-2xl hover:bg-white/5 z-20 hidden md:block transition-all"><ChevronLeft width={32} /></button>
              <button onClick={() => navigateLightbox(1)} className="absolute right-8 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-6 rounded-2xl hover:bg-white/5 z-20 hidden md:block transition-all"><ChevronRight width={32} /></button>
              <div className="w-full h-full p-4 md:p-24 flex flex-col items-center justify-center">
                  {(() => {
                      const slide = script.slides[lightboxIndex];
                      const src = (surfaceState.components[`img_${slide.id}`] as A2UIComponent)?.src || slide.image_url;
                      return src ? (
                          <div className="relative w-full h-full max-w-7xl flex flex-col items-center justify-center group">
                              <img src={src} className="max-w-full max-h-[85%] object-contain shadow-2xl shadow-black/80 rounded-lg" alt={slide.title} />
                              <div className="mt-8 text-center max-w-2xl glass-panel p-8 rounded-2xl border border-white/5">
                                  <h2 className="text-3xl font-black text-white mb-3">{slide.title}</h2>
                                  <p className="text-slate-300 text-sm leading-relaxed">{slide.description || slide.image_prompt}</p>
                              </div>
                          </div>
                      ) : <div className="text-slate-500 animate-pulse font-bold tracking-widest">RENDERING...</div>;
                  })()}
              </div>
          </div>
      )}

      {showResetConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
              <div className="glass-panel p-10 rounded-3xl max-w-sm w-full text-center border border-red-500/20 shadow-2xl shadow-red-900/20">
                  <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6"><TrashIcon width={32} /></div>
                  <h3 className="text-2xl font-black text-white mb-2">New Project?</h3>
                  <p className="text-slate-400 text-sm mb-8">Current progress will be lost.</p>
                  <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest">Cancel</button>
                        <button onClick={resetGenerationOnly} className="flex-1 py-3.5 rounded-xl bg-[#0066FF] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg">Restart</button>
                      </div>
                      <button onClick={handleResetSession} className="w-full py-3.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-900/20 font-bold text-xs uppercase tracking-widest transition-all">Full Reset</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

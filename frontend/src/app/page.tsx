"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import {
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon,
  ChevronLeft, ChevronRight, XIcon, MaximizeIcon,
  EditIcon, CheckIcon, GoogleIcon, KeyIcon, ChevronDown, ChevronUp,
  PresentationIcon, PaletteIcon, HistoryIcon, PlusIcon, MinusIcon,
  TrashIcon, MagicWandIcon, DownloadIcon
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
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Generation Settings
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("");
  const [detailLevel, setDetailLevel] = useState("3 - Average");
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
      setQuery("");
      setPhase("input");
      setScript(null);
      setSurfaceState({ components: {}, dataModel: {} });
      setUploadedFiles([]);
      setBrandingFiles([]);
      setCurrentProjectId(null);
      setVisiblePrompts({});
      setShowResetConfirm(false);
  };

  const resetGenerationOnly = () => {
      setPhase("input");
      setScript(null);
      setSurfaceState({ components: {}, dataModel: {} });
      setCurrentProjectId(null);
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
        setCurrentProjectId(null);
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
                  <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg glow-blue"><MonitorIcon /></div>
                  <div>
                      <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">IPSA</h1>
                      <p className="text-blue-400 font-bold text-sm uppercase tracking-[0.3em] mb-6">Your Visual Data Architect</p>
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
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-full px-6 py-3 flex items-center gap-4 animate-fade-in-up shadow-2xl border border-white/10">
              <button onClick={() => handleExport("zip")} disabled={isExporting} className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all group relative" title="Download ZIP">
                  <FileUpIcon className="w-5 h-5" />
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">ZIP</span>
              </button>
              <button onClick={() => handleExport("pdf")} disabled={isExporting} className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all group relative" title="Download PDF">
                  <DownloadIcon className="w-5 h-5" />
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">PDF</span>
              </button>
              <div className="w-px h-6 bg-white/10 mx-2"></div>
              <button onClick={() => handleExport("slides")} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 bg-[#fbbc04]/20 hover:bg-[#fbbc04]/30 text-[#fbbc04] rounded-full font-bold text-xs transition-all border border-[#fbbc04]/30">
                  <PresentationIcon className="w-4 h-4" /> Google Slides
              </button>
          </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 h-20 z-40 flex items-center justify-between px-8 bg-gradient-to-b from-[#030712] to-transparent pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg glow-blue"><MonitorIcon /></div>
            <div className="flex flex-col">
                <span className="text-xl font-black text-white tracking-tighter">IPSA</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Visual Architect</span>
            </div>
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
            <button onClick={() => setShowResetConfirm(true)} className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"><PlusIcon /></button>
            <button onClick={() => setShowRightSidebar(!showRightSidebar)} className={`w-10 h-10 rounded-full glass-panel flex items-center justify-center transition-all ${showRightSidebar ? 'text-blue-400 border-blue-500/50' : 'text-slate-400 hover:text-white'}`}><HistoryIcon /></button>
            <button onClick={() => setShowSettings(true)} className={`w-10 h-10 rounded-full glass-panel flex items-center justify-center transition-all ${hasApiKey ? 'text-slate-400 hover:text-white' : 'text-red-400 animate-pulse'}`}><SettingsIcon /></button>
            <div className="w-10 h-10 rounded-full glass-panel overflow-hidden border border-white/10 ml-2">
                <img src={user.photoURL || ""} className="w-full h-full object-cover" alt="Avatar" />
            </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative z-10 px-4 pb-4 gap-4">
        
        {/* LEFT SIDEBAR */}
        <aside className={`w-[320px] glass-panel rounded-3xl flex flex-col transition-all duration-500 transform ${showMobileSettings ? "translate-x-0 absolute inset-y-4 z-50 left-4" : "-translate-x-[120%] absolute md:relative md:translate-x-0"}`}>
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    <span>Model</span>
                    <div className="flex bg-black/20 p-1 rounded-lg">
                        <button onClick={() => setModelType("flash")} className={`px-3 py-1 rounded-md transition-all ${modelType === "flash" ? "bg-white/10 text-white shadow" : "text-slate-500"}`}>Fast</button>
                        <button onClick={() => setModelType("pro")} className={`px-3 py-1 rounded-md transition-all ${modelType === "pro" ? "bg-blue-500/20 text-blue-400 shadow" : "text-slate-500"}`}>Pro</button>
                    </div>
                </div>

                <section>
                    <div className="flex justify-between mb-3"><label className="text-xs font-bold text-slate-400 uppercase">Slides</label><span className="text-blue-400 font-mono text-sm">{numSlides}</span></div>
                    <div className="flex items-center gap-2 glass-input p-1 rounded-xl">
                        <button onClick={() => setNumSlides(Math.max(MIN_SLIDES, numSlides - 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-400"><MinusIcon width={14}/></button>
                        <input type="range" min={MIN_SLIDES} max={MAX_SLIDES} value={numSlides} onChange={(e) => setNumSlides(parseInt(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none accent-blue-500" />
                        <button onClick={() => setNumSlides(Math.min(MAX_SLIDES, numSlides + 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-400"><PlusIcon width={14}/></button>
                    </div>
                </section>

                <div className="space-y-5">
                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Detail</label><select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full glass-input rounded-xl px-4 py-3 text-sm outline-none appearance-none cursor-pointer"><option>1 - Simple</option><option>2 - Basic</option><option>3 - Average</option><option>4 - Detailed</option><option>5 - Super</option></select></div>
                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Style</label><input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Minimalist, Tech..." className="w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" /></div>
                </div>

                <div className="pt-6 border-t border-white/5">
                     <div className="flex items-center gap-2 mb-4"><PaletteIcon className="text-blue-400"/><span className="text-xs font-bold text-white uppercase tracking-widest">Brand Kit</span></div>
                     <div className="space-y-3">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10"><input type="color" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="w-full h-full scale-150 cursor-pointer"/></div><input type="text" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#Primary" className="flex-1 glass-input rounded-xl px-3 py-2 text-xs font-mono"/></div>
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10"><input type="color" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} className="w-full h-full scale-150 cursor-pointer"/></div><input type="text" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} placeholder="#Secondary" className="flex-1 glass-input rounded-xl px-3 py-2 text-xs font-mono"/></div>
                     </div>
                </div>
            </div>
        </aside>

        {/* CENTER STAGE */}
        <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24">
                <div className={`transition-all duration-700 ease-out max-w-4xl mx-auto ${phase === 'input' ? 'mt-[10vh]' : 'mt-0'}`}>
                    <div className="relative group">
                        <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 ${phase !== 'input' ? 'hidden' : ''}`}></div>
                        <div className={`glass-panel rounded-3xl p-1 transition-all duration-500 ${phase !== 'input' ? 'h-32 flex items-center' : 'h-64'}`}>
                            <textarea 
                                value={query} onChange={(e) => setQuery(e.target.value)} 
                                placeholder="What are we building today?"
                                className="w-full h-full bg-transparent border-0 text-slate-100 placeholder-slate-500 text-lg md:text-xl p-6 outline-none resize-none"
                            />
                            {phase !== 'input' && (
                                <div className="pr-6 flex flex-col gap-2">
                                     <button onClick={() => setPhase('input')} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition-colors"><EditIcon/></button>
                                </div>
                            )}
                        </div>
                    </div>

                    {phase === 'input' && (
                        <div className="mt-6 flex flex-wrap gap-4 items-center justify-between animate-fade-in-up">
                            <div className="flex gap-3">
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-3 rounded-xl glass-input text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5"><FileUpIcon /> Add Source</button>
                                <button onClick={() => brandingInputRef.current?.click()} className="flex items-center gap-2 px-4 py-3 rounded-xl glass-input text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5"><PaletteIcon /> Brand Assets</button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} multiple />
                                <input type="file" ref={brandingInputRef} className="hidden" onChange={handleBrandingUpload} multiple />
                            </div>
                            <button onClick={startScriptGen} disabled={isStreaming || !hasApiKey} className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all flex items-center gap-3 disabled:opacity-50 disabled:shadow-none">
                                <SparklesIcon className="w-5 h-5"/> Generate Presentation
                            </button>
                        </div>
                    )}
                    
                    {/* File Chips */}
                    {(uploadedFiles.length > 0 || brandingFiles.length > 0) && phase === 'input' && (
                        <div className="mt-4 flex flex-wrap gap-2 animate-fade-in">
                            {uploadedFiles.map((f,i) => <span key={i} className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20 flex items-center gap-2">{f.name} <button onClick={() => removeFile('source', i)}>×</button></span>)}
                            {brandingFiles.map((f,i) => <span key={i} className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20 flex items-center gap-2">{f.name} <button onClick={() => removeFile('brand', i)}>×</button></span>)}
                        </div>
                    )}
                </div>

                {/* RESULTS GRID */}
                {(phase !== 'input' || isStreaming) && (
                    <div className="mt-12 max-w-6xl mx-auto animate-fade-in">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Preview</h2>
                            {script && !isStreaming && <button onClick={() => handleStream("graphics", script)} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 text-sm">{hasGeneratedImages ? "Regenerate Graphics" : "Generate Graphics"}</button>}
                            {isStreaming && <button onClick={handleStop} className="px-6 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl font-bold text-sm animate-pulse">STOP GENERATION</button>}
                        </div>

                        {isStreaming && !script && (
                           <div className="w-full glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center">
                               <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                               <h3 className="text-xl font-bold text-white mb-2">Architecting Structure...</h3>
                               <p className="text-slate-400">Analyzing content and defining slide flow.</p>
                           </div>
                        )}

                        {script && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                                {script.slides.map((s: Slide, idx: number) => {
                                    const cardComp = surfaceState.components[`card_${s.id}`];
                                    const src = (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url;
                                    const isGenerating = cardComp?.status === "generating";
                                    return (
                                        <div key={s.id} className="group relative">
                                            <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                                            <div className="relative glass-panel rounded-3xl p-4 h-full flex flex-col gap-4 hover:translate-y-[-4px] transition-all duration-300">
                                                <div className="flex justify-between items-center z-10">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg">{s.id}</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { setRefiningSlideId(s.id); setRefineInstruction(""); }} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"><MagicWandIcon width={14} /></button>
                                                        <button onClick={() => togglePrompt(s.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"><EditIcon width={14} /></button>
                                                    </div>
                                                </div>

                                                <div className="flex-1 rounded-2xl overflow-hidden bg-black/40 relative min-h-[200px] flex items-center justify-center">
                                                    {isGenerating && <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 backdrop-blur-sm"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
                                                    {src && !visiblePrompts[s.id] ? (
                                                        <img src={src} onClick={() => setLightboxIndex(idx)} className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform duration-700" alt={s.title} />
                                                    ) : (
                                                        <div className="p-6 w-full h-full flex flex-col justify-center">
                                                            {refiningSlideId === s.id ? (
                                                                <div className="flex flex-col gap-3 animate-fade-in h-full">
                                                                    <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-transparent border-b border-white/10 text-sm font-bold text-white outline-none pb-2 focus:border-blue-500" />
                                                                    <textarea value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="Refinement instruction..." className="flex-1 bg-white/5 rounded-xl p-3 text-xs text-slate-300 resize-none outline-none" />
                                                                    <div className="flex justify-end gap-2">
                                                                        <button onClick={() => setRefiningSlideId(null)} className="text-xs text-slate-500 hover:text-white">Cancel</button>
                                                                        <button onClick={() => handleRefine(s)} disabled={isRefining} className="px-3 py-1 bg-blue-600 rounded-lg text-xs font-bold text-white">{isRefining ? "..." : "Apply"}</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <h4 className="font-bold text-white text-lg mb-2 leading-tight">{s.title}</h4>
                                                                    <p className="text-xs text-slate-400 leading-relaxed overflow-hidden line-clamp-5">{s.description || s.image_prompt}</p>
                                                                    {!src && <button onClick={() => retrySlide(s.id)} className="mt-auto self-start px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-blue-400 border border-blue-500/20">Generate Visual</button>}
                                                                </>
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
        <aside className={`w-[300px] glass-panel rounded-3xl flex flex-col transition-all duration-500 transform ${showRightSidebar ? "translate-x-0" : "translate-x-[120%] hidden xl:flex w-0 opacity-0"}`}>
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-200 uppercase"><HistoryIcon /><span>HISTORY</span></div>
                    <button onClick={() => fetchProjects()} disabled={isLoadingHistory} className={`text-slate-500 hover:text-white transition-colors ${isLoadingHistory ? 'animate-spin' : ''}`}><RefreshIcon width={14} /></button>
                </div>
                <div className="space-y-3">
                    {projects.map(p => (
                        <div key={p.id} onClick={() => loadProject(p)} className={`p-4 rounded-2xl border transition-all cursor-pointer group ${currentProjectId === p.id ? 'bg-blue-600/10 border-blue-500/50' : 'bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10'}`}>
                            <h4 className={`text-xs font-bold mb-2 line-clamp-2 leading-tight ${currentProjectId === p.id ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>{getCleanTitle(p)}</h4>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">{formatDate(p.created_at)}</span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${p.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>{p.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
      </div>

      {/* CONFIRM / SETTINGS MODALS */}
      {showResetConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="glass-panel p-8 rounded-3xl max-w-sm w-full text-center border border-red-500/20 shadow-2xl shadow-red-900/20">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6"><TrashIcon /></div>
                  <h3 className="text-xl font-bold text-white mb-2">Start Fresh?</h3>
                  <div className="flex gap-3 mt-6">
                      <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm">Cancel</button>
                      <button onClick={handleResetSession} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm">Reset</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

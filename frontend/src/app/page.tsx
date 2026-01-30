"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import {
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon,
  ChevronLeft, ChevronRight, XIcon, MaximizeIcon,
  EditIcon, CheckIcon, GoogleIcon, KeyIcon, ChevronDown, ChevronUp,
  PresentationIcon, PaletteIcon, HistoryIcon, PlusIcon, MinusIcon,
  TrashIcon, MagicWandIcon
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

  // --- Helper: Parse Query Settings ---
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

  // --- Helper: Clean Title for History ---
  const getCleanTitle = (p: ProjectSummary) => {
      if (p.title) return p.title;
      // Fallback for legacy projects
      const settings = parseQueryToSettings(p.query);
      const title = settings.userPrompt;
      return title.length > 60 ? title.substring(0, 57) + "..." : title || "Untitled Project";
  };

  // --- Date Formatter ---
  const formatDate = (timestamp: { seconds: number } | string | Date | null | undefined): string => {
      if (!timestamp) return "Unknown date";
      try {
          // Firestore Timestamp (seconds, nanoseconds)
          if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
              return new Date((timestamp as any).seconds * 1000).toLocaleDateString(undefined, { 
                  month: 'short', day: 'numeric'
              });
          }
          // ISO String or other
          const dateObj = new Date(timestamp as any);
          if (isNaN(dateObj.getTime())) return "Invalid date";
          
          return dateObj.toLocaleDateString(undefined, {
               month: 'short', day: 'numeric'
          });
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
          if (!data.has_api_key) setShowSettings(true); // Force open if missing
      } catch (e) {
          console.error("Failed to check settings", e);
      }
  }, [getToken]);

  const restoreProjectState = useCallback((fullProject: ProjectDetails) => {
      setCurrentProjectId(fullProject.id);
      
      // Parse settings from query
      const settings = parseQueryToSettings(fullProject.query || "");
      if (settings.numSlides) setNumSlides(settings.numSlides);
      if (settings.style) setStyle(settings.style);
      if (settings.detailLevel) setDetailLevel(settings.detailLevel);
      if (settings.aspectRatio) setAspectRatio(settings.aspectRatio);
      if (settings.language) setLanguage(settings.language);
      
      setQuery(settings.userPrompt || "");
      setScript(fullProject.script);
      setPhase("graphics");
      
      // Reconstruct surface components from script
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
      // On resume, don't necessarily hide the sidebar if it was open
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
              localStorage.removeItem("lastProjectId"); // Invalid ID
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
        
        // Auto-Resume Last Session
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
          
          // Save for auto-resume
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
      // Immediately start stream after reset
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
          
          // Force update stalled components
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

      } catch (e) {
          console.error("Retry failed", e);
      }
  };

  const handleRefine = async (slide: Slide) => {
      if (!refineInstruction) return;
      setIsRefining(true);
      try {
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/agent/refine_text`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json", 
                  "Authorization": `Bearer ${token}`
              },
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
              slides: prev.slides.map((s: Slide) => 
                  s.id === slide.id ? { ...s, title: refinedData.title, description: refinedData.description } : s
              )
          }));
          
          setRefiningSlideId(null);
          setRefineInstruction("");
      } catch (e) {
          console.error("Refine Error", e);
          alert("Failed to refine text.");
      } finally {
          setIsRefining(false);
      }
  };

  const handleStream = async (targetPhase: "script" | "graphics", currentScript?: any) => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    const token = await getToken();
    
    // --- PHASE 1: SCRIPT GENERATION (Single Request) ---
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
        setCurrentProjectId(null);

        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

        const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        
        // Upload files logic...
        const fileIds: string[] = [];
        const allFiles = [...uploadedFiles, ...brandingFiles];
        
        for (const f of allFiles) {
            const formData = new FormData();
            formData.append("file", f);
            try {
                const uploadRes = await fetch(`${BACKEND_URL}/agent/upload`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.file_id) fileIds.push(uploadData.file_id);
            } catch (e) { console.error(e); }
        }

        const effectiveQuery = `[GENERATION SETTINGS] Slides: ${numSlides}, Style: ${style || "Professional"}, Detail: ${detailLevel}, AR: ${aspectRatio}, Lang: ${language}
Brand Colors: Primary=${brandPrimary || "N/A"}, Secondary=${brandSecondary || "N/A"}\n\n[USER REQUEST]\n${query}`;

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
                    phase: "script", 
                    project_id: currentProjectId,
                    file_ids: fileIds
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
                if (msg.updateDataModel) {
                    if (msg.updateDataModel.value?.script) setScript(msg.updateDataModel.value.script);
                    if (msg.updateDataModel.value?.project_id) {
                        setCurrentProjectId(msg.updateDataModel.value.project_id);
                        localStorage.setItem("lastProjectId", msg.updateDataModel.value.project_id);
                    }
                }
            });
        } catch (e: any) { } finally { 
            setIsStreaming(false); 
            fetchProjects(); 
        }
        return;
    }

    // --- PHASE 2: GRAPHICS GENERATION (Batched Requests) ---
    if (targetPhase === "graphics" && currentScript) {
        setPhase("graphics");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

        const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        
        // Identify slides needing generation (those without image_url or with placeholders)
        // We use the current script passed in argument as source of truth
        const pendingSlides = (currentScript.slides || []).filter((s: Slide) => !s.image_url);
        
        if (pendingSlides.length === 0) {
            setIsStreaming(false);
            return;
        }

        try {
            for (let i = 0; i < pendingSlides.length; i += 3) {
                if (abortController.signal.aborted) break;

                const batchSlides = pendingSlides.slice(i, i + 3);
                const isFirstBatch = i === 0;
                
                // Create a partial script for this batch
                const batchScript = {
                    ...currentScript,
                    slides: batchSlides
                };

                await fetch(`${BACKEND_URL}/agent/stream`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json", 
                        "X-GenAI-Model": selectedModel,
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        phase: "graphics", 
                        script: batchScript, 
                        project_id: currentProjectId,
                        skip_grid_init: !isFirstBatch // Critical: only init grid once
                    }),
                    signal: abortController.signal
                }).then(async (res) => {
                    await processStream(res.body!.getReader(), (msg) => {
                        if (msg.updateComponents) {
                            setSurfaceState((prev: any) => {
                                const nextComps = { ...prev.components };
                                msg.updateComponents.components.forEach((c: any) => {
                                    // Protect skipped slides from being overwritten by delayed backend responses
                                    const currentComp = prev.components[c.id];
                                    if (currentComp?.status === "skipped") {
                                        return; // Ignore update if user skipped this slide
                                    }
                                    // Special handling: if backend sends "waiting" status for cards, 
                                    // ensure we don't overwrite "success" cards from previous batches.
                                    nextComps[c.id] = c;
                                });
                                return { ...prev, components: nextComps };
                            });
                            
                            // Capture Image URLs to update local script state for next batch logic?
                            // Actually, processStream updates surfaceState (visuals).
                            // We also need to update 'script' state so if user stops and resumes, we know what's done.
                            // The backend sends components with 'src'. We can extract that.
                            msg.updateComponents.components.forEach((c: any) => {
                                if (c.component === "Image" && c.src) {
                                    // Extract slide ID from component ID "img_{id}"
                                    const sid = c.id.replace("img_", "");
                                    setScript((prevScript: any) => ({
                                        ...prevScript,
                                        slides: prevScript.slides.map((s: Slide) => 
                                            s.id === sid ? { ...s, image_url: c.src } : s
                                        )
                                    }));
                                }
                            });
                        }
                    });
                });
            }
        } catch (e: any) { } finally { 
            setIsStreaming(false); 
            fetchProjects(); 
        }
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

  const handleExport = async (fmt: "zip" | "pdf" | "slides" | "pdf_handout") => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (!script) return;
    setIsExporting(true);
    const token = await getToken();
    
    // --- GOOGLE SLIDES EXPORT ---
    if (fmt === "slides") {
        try {
            let googleToken = await getGoogleAccessToken();

            if (!hasSlidesPermissions || !googleToken) {
                googleToken = await grantSlidesPermissions();
            }

            if (!googleToken) { setIsExporting(false); return; }

            const slidesPayload = script.slides.map((s: Slide) => {
                const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
                return {
                    title: s.title,
                    description: s.description,
                    image_url: comp ? comp.src : (s.image_url || null)
                };
            });

            const res = await fetch(`${BACKEND_URL}/agent/export_slides`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ google_token: googleToken, title: query.substring(0, 50) || "Infographic", slides: slidesPayload })
            });
            
            const data = await res.json();
            if (data.url) window.open(data.url, "_blank");

        } catch (e) { } finally { setIsExporting(false); }
        return;
    }

    // --- ZIP/PDF EXPORT ---
    const imgUrls = script.slides.map((s: Slide) => {
        const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
        return comp ? comp.src : (s.image_url || null);
    }).filter((url: string | null) => url !== null);

    if (imgUrls.length === 0) { alert("No images generated yet."); setIsExporting(false); return; }

    try {
        const res = await fetch(`${BACKEND_URL}/agent/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ 
                images: imgUrls, format: fmt, project_id: currentProjectId,
                slides_data: script.slides.map((s: Slide) => ({ title: s.title, description: s.description || s.image_prompt }))
            })
        });
        const data = await res.json();
        if (data.url) {
            // Use hidden anchor to bypass popup blockers and avoid permission-change reloads
            const link = document.createElement('a');
            link.href = data.url.startsWith("/") ? `${BACKEND_URL}${data.url}` : data.url;
            link.target = '_blank';
            link.click();
        }
    } catch(e) { } finally { setIsExporting(false); }
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

  const skipSlide = (slideId: string) => {
      setSurfaceState((prev: any) => ({
          ...prev,
          components: {
              ...prev.components,
              [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "skipped", text: "Skipped" }
          }
      }));
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

  const saveSettings = async () => {
      if (!inputApiKey.startsWith("AIza")) {
          alert("Invalid Gemini Key format.");
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
          }
      } catch (e) { console.error(e); } finally { setIsSavingKey(false); }
  };

  if (authLoading) return <div className="min-h-screen bg-[#030712] flex items-center justify-center text-white font-bold animate-pulse">Loading Identity...</div>;
  
  if (!user) {
      return (
          <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 relative overflow-hidden">
              {/* Background Grid Overlay */}
              <div className="absolute inset-0 z-0 bg-grid pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]">
              </div>
              
              <div className="max-w-md w-full bg-[#111827]/80 backdrop-blur-xl border border-slate-800 p-10 rounded-3xl shadow-2xl text-center flex flex-col gap-8 animate-fade-in relative z-10">
                  <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/40"><MonitorIcon /></div>
                  <div>
                      <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">IPSA</h1>
                      <p className="text-blue-400 font-bold text-sm uppercase tracking-[0.3em] mb-6">Your Visual Data Architect</p>
                      <p className="text-slate-400 text-base max-w-sm mx-auto leading-relaxed">Transform complex technical insights into stunning narratives.</p>
                  </div>
                  <button onClick={login} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl">
                      <GoogleIcon /> Sign in with Google
                  </button>
              </div>
          </div>
      );
  }

  const hasGeneratedImages = script?.slides.some((s: Slide) => (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 relative overflow-hidden flex flex-col">
      
      {/* Background Grid Overlay */}
      <div className="absolute inset-0 z-0 bg-grid pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]">
      </div>

      {/* MODALS */}
      {showResetConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-red-900/30 p-8 rounded-2xl max-w-sm w-full shadow-2xl relative text-center">
                  <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4"><TrashIcon /></div>
                  <h3 className="text-xl font-bold text-white mb-2">New Project?</h3>
                  <p className="text-slate-400 text-sm mb-6">This will reset the current session. &quot;Confirm Reset&quot; clears everything.</p>
                  <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all">Cancel</button>
                        <button onClick={resetGenerationOnly} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all">Restart</button>
                      </div>
                      <button onClick={handleResetSession} className="w-full px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-900 text-red-400 rounded-lg font-medium text-xs transition-all">Fully Reset</button>
                  </div>
              </div>
          </div>
      )}

      {showConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-amber-900/30 p-8 rounded-2xl max-w-sm w-full shadow-2xl relative text-center">
                  <div className="w-16 h-16 bg-amber-900/20 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-4"><RefreshIcon /></div>
                  <h3 className="text-xl font-bold text-white mb-2">Regenerate Script?</h3>
                  <p className="text-slate-400 text-sm mb-6">This will overwrite the current plan.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all">Cancel</button>
                    <button onClick={() => { setShowConfirm(false); handleStream("script"); }} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all">Confirm</button>
                  </div>
              </div>
          </div>
      )}

      {showSettings && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><XIcon /></button>
                  <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-900/30 rounded-full flex items-center justify-center text-blue-400"><KeyIcon /></div>
                      <h3 className="text-xl font-bold text-white">Gemini Key</h3>
                  </div>
                  <div className="flex flex-col gap-4">
                      <input type="password" value={inputApiKey} onChange={(e) => setInputApiKey(e.target.value)} placeholder="AIza..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono text-sm" />
                      <button onClick={saveSettings} disabled={!inputApiKey || isSavingKey} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold">
                          {isSavingKey ? "Saving..." : "Save Securely"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && script && (
          <div ref={lightboxRef} className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl animate-fade-in focus:outline-none overflow-hidden">
              <div className="absolute top-6 right-6 z-20 flex gap-4">
                  <button onClick={toggleFullscreen} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10"><MaximizeIcon /></button>
                  <button onClick={() => setLightboxIndex(null)} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10"><XIcon /></button>
              </div>
              <button onClick={() => navigateLightbox(-1)} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 z-20 hidden md:block"><ChevronLeft /></button>
              <button onClick={() => navigateLightbox(1)} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 z-20 hidden md:block"><ChevronRight /></button>
              <div className="w-full h-full p-4 md:p-20 flex flex-col items-center justify-center">
                  {(() => {
                      const slide = script.slides[lightboxIndex];
                      const src = (surfaceState.components[`img_${slide.id}`] as A2UIComponent)?.src || slide.image_url;
                      return src ? (
                          <div className="relative w-full h-full max-w-7xl flex flex-col items-center justify-center group">
                              <img src={src} className="max-w-full max-h-[80%] object-contain shadow-2xl rounded-lg" alt={slide.title} />
                              <div className="mt-6 text-center max-w-3xl">
                                  <h2 className="text-2xl font-bold text-white mb-2">{slide.title}</h2>
                                  <p className="text-slate-300 text-sm">{slide.description || slide.image_prompt}</p>
                              </div>
                          </div>
                      ) : <div className="text-slate-500 animate-pulse">Rendering...</div>;
                  })()}
              </div>
          </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 h-16 border-b border-slate-800 bg-[#030712]/90 backdrop-blur-md z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="IPSA" className="w-8 h-8 rounded-lg" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-slate-50 tracking-tight leading-none">IPSA</span>
            <span className="text-[9px] uppercase tracking-widest text-blue-400 font-bold hidden md:block mt-1">Data Architect</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowResetConfirm(true)} className="px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold flex items-center gap-2">
              <PlusIcon /> <span className="hidden sm:inline">New Project</span>
          </button>
          <button onClick={() => setShowRightSidebar(!showRightSidebar)} className={`p-2 rounded-full border transition-all ${showRightSidebar ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`} title="History">
              <HistoryIcon />
          </button>
          <div className="bg-slate-900 p-1 rounded-full border border-slate-800 hidden md:flex">
            <button onClick={() => setModelType("flash")} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${modelType === "flash" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400"}`}>Flash</button>
            <button onClick={() => setModelType("pro")} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${modelType === "pro" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400"}`}>Pro</button>
          </div>
          <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full border ${hasApiKey ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-white" : "bg-red-900/20 border-red-500 text-red-400 animate-pulse"}`}><SettingsIcon /></button>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
              <img src={user.photoURL || ""} className="w-8 h-8 rounded-full border border-slate-700" alt="Avatar" />
              <button onClick={handleLogout} className="text-[10px] uppercase font-bold text-slate-500 hover:text-white">Logout</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* LEFT SIDEBAR (Settings) */}
        <aside className={`w-[300px] h-full z-30 flex flex-col glass-panel border-r border-slate-800 transition-all absolute md:relative ${showMobileSettings ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-200 border-b border-slate-800/50 pb-4"><SettingsIcon /><span>SETTINGS</span></div>
                
                <section>
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs text-slate-500 uppercase tracking-wide font-bold">Slides</label>
                        <input type="number" min={MIN_SLIDES} max={MAX_SLIDES} value={numSlides} onChange={(e) => setNumSlides(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Number(e.target.value))))} className="w-10 bg-transparent text-right font-mono text-sm font-bold text-blue-400 outline-none" />
                    </div>
                    <div className="flex items-center gap-3 glass-input p-2 rounded-lg">
                        <button onClick={() => setNumSlides(prev => Math.max(MIN_SLIDES, prev - 1))} className="p-1 text-gray-400 hover:text-white transition-colors active:scale-95"><MinusIcon width={14} height={14} /></button>
                        <input type="range" min={MIN_SLIDES} max={MAX_SLIDES} value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none accent-blue-500" />
                        <button onClick={() => setNumSlides(prev => Math.min(MAX_SLIDES, prev + 1))} className="p-1 text-gray-400 hover:text-white transition-colors active:scale-95"><PlusIcon width={14} height={14} /></button>
                    </div>
                </section>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Detail</label>
                        <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full glass-input rounded-lg py-2 px-3 text-sm outline-none appearance-none cursor-pointer">
                            <option>1 - Simple</option><option>2 - Basic</option><option>3 - Average</option><option>4 - Detailed</option><option>5 - Super</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Format</label>
                        <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full glass-input rounded-lg py-2 px-3 text-sm outline-none appearance-none cursor-pointer">
                            <option value="16:9">16:9 Wide</option><option value="4:3">4:3 Std</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Lang</label>
                        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full glass-input rounded-lg py-2 px-3 text-sm outline-none appearance-none cursor-pointer">
                            <option>English</option><option>Italian</option>
                        </select>
                    </div>
                </div>
                
                <div className="pt-4 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-4 uppercase tracking-wide"><PaletteIcon /><span>Brand Kit</span></div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <input type="text" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="Primary" className="flex-1 glass-input rounded-lg py-2 px-3 text-xs outline-none font-mono" />
                            <div className="w-8 h-8 rounded-lg border border-white/10 relative overflow-hidden"><input type="color" value={brandPrimary || "#3b82f6"} onChange={(e) => setBrandPrimary(e.target.value)} className="absolute inset-0 scale-150" /></div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>

        {/* CORE CONTENT AREA */}
        <main className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
                {!hasApiKey && (
                    <div className="mb-6 bg-amber-900/30 border border-amber-600/50 p-4 rounded-xl flex items-center gap-3 text-amber-200 text-sm animate-pulse">
                        <KeyIcon /><span>Configure Gemini API Key in Settings to start.</span>
                    </div>
                )}

                <div className={`flex-1 flex flex-col transition-all duration-500 ${phase !== 'input' ? 'flex-none h-48' : ''}`}>
                    <div className="w-full h-full relative group">
                        <div className="absolute inset-0 glass-panel rounded-2xl opacity-50 group-focus-within:opacity-80 transition-opacity"></div>
                        <textarea 
                            value={query} onChange={(e) => setQuery(e.target.value)} 
                            placeholder="Describe your topic, paste a URL, or upload files..." 
                            className="w-full h-full bg-transparent border-0 text-slate-200 placeholder-slate-600 text-lg leading-relaxed resize-none p-6 outline-none relative z-10" 
                        />
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-3">
                    {uploadedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 glass-panel rounded-xl animate-fade-in">
                            {uploadedFiles.map((f, i) => (
                                <div key={`s-${i}`} className="bg-green-900/20 border border-green-500/30 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-green-400">
                                    <FileUpIcon /> <span className="max-w-[150px] truncate">{f.name}</span>
                                    <button onClick={() => removeFile('source', i)} className="hover:text-white font-black">×</button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} multiple />
                        <input type="file" ref={brandingInputRef} className="hidden" onChange={handleBrandingUpload} multiple />
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 hover:bg-white/10 py-3 rounded-xl border border-white/10 text-sm text-gray-300 transition-all"><FileUpIcon className="w-5 h-5" />Source Docs</button>
                        <button onClick={() => brandingInputRef.current?.click()} className="flex items-center justify-center gap-2 hover:bg-white/10 py-3 rounded-xl border border-white/10 text-sm text-gray-300 transition-all"><PaletteIcon className="w-5 h-5" />Brand Kit</button>
                    </div>
                    <button onClick={startScriptGen} disabled={isStreaming || !hasApiKey || (!query && uploadedFiles.length === 0)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all">
                        {isStreaming && phase === "review" ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                        <span>{isStreaming && phase === "review" ? "Architecting..." : "Generate Script"}</span>
                    </button>
                </div>

                {(phase !== "input" || isStreaming) && (
                <section ref={resultsRef} className="mt-8 border-t border-slate-800/50 pt-8 pb-20">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-bold text-white">Final Presentation</h2>
                        <div className="flex gap-2">
                            {isStreaming && <button onClick={handleStop} className="bg-red-600 px-6 py-2 rounded-lg font-bold text-sm">STOP</button>}
                            {!isStreaming && script && (
                                <>
                                <button onClick={() => handleExport("zip")} disabled={isExporting} className="bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold">ZIP</button>
                                <button onClick={() => handleExport("pdf")} disabled={isExporting} className="bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold">PDF</button>
                                <button onClick={() => handleExport("slides")} disabled={isExporting} className="bg-[#fbbc04]/20 border border-[#fbbc04]/50 text-[#fbbc04] px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><PresentationIcon /> Slides</button>
                                <button onClick={() => handleStream("graphics", script)} className="bg-green-600 px-6 py-2 rounded-lg font-bold text-sm shadow-lg">{hasGeneratedImages ? "Regenerate Remaining" : "Generate Graphics"}</button>
                                </>
                            )}
                        </div>
                    </div>
                    {script && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {script.slides.map((s: Slide, idx: number) => {
                            const cardComp = surfaceState.components[`card_${s.id}`];
                            const src = (surfaceState.components[`img_${s.id}`] as A2UIComponent)?.src || s.image_url;
                            const isGenerating = cardComp?.status === "generating";
                            return (
                                <div key={s.id} className={`glass-panel p-4 flex flex-col gap-3 rounded-2xl relative overflow-hidden group ${isGenerating ? "ring-2 ring-blue-500" : ""}`}>
                                    <div className="flex justify-between items-center border-b border-slate-800/50 pb-2 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-blue-500 uppercase">{s.id}</span>
                                            <button onClick={() => { setRefiningSlideId(s.id); setRefineInstruction(""); }} className="text-slate-500 hover:text-blue-400 transition-colors" title="Magic Refine"><MagicWandIcon width={12} /></button>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => togglePrompt(s.id)} className="text-[9px] uppercase font-bold text-slate-500 hover:text-white">Prompt</button>
                                            <button onClick={() => skipSlide(s.id)} className="text-[9px] uppercase font-bold text-slate-500 hover:text-red-400">Skip</button>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-3 min-h-[200px] justify-center items-center">
                                        {src && !visiblePrompts[s.id] ? <img src={src} className="w-full h-full object-cover rounded-lg cursor-pointer" onClick={() => setLightboxIndex(idx)} alt={s.title} /> : 
                                        <div className="flex flex-col gap-2 w-full h-full p-2">
                                            {refiningSlideId === s.id ? (
                                                <div className="flex flex-col gap-2 animate-fade-in">
                                                    <input value={s.title} onChange={(e) => handleSlideChange(s.id, "title", e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white" />
                                                    <textarea value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="E.g. Make it more professional" className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-slate-400 h-16" />
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => setRefiningSlideId(null)} className="text-[9px] text-slate-500">Cancel</button>
                                                        <button onClick={() => handleRefine(s)} disabled={isRefining} className="px-3 py-1 bg-blue-600 rounded text-[9px] font-bold text-white">Refine</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="font-bold text-white text-sm">{s.title}</span>
                                                    <p className="text-[10px] text-slate-400 line-clamp-6">{s.description || s.image_prompt}</p>
                                                </>
                                            )}
                                        </div>}
                                    </div>
                                    {isGenerating && (
                                        <div className="absolute inset-0 bg-[#030712]/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                                            <span className="text-[10px] font-bold text-blue-400 uppercase">Drawing...</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    )}
                </section>
                )}
            </div>
        </main>

        {/* RIGHT SIDEBAR (History) */}
        <aside className={`w-[280px] h-full z-30 flex flex-col glass-panel border-l border-slate-800 transition-all duration-300 ${showRightSidebar ? "translate-x-0" : "translate-x-full hidden lg:flex w-0 border-none"}`}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-200"><HistoryIcon /><span>HISTORY</span></div>
                    <button onClick={() => fetchProjects()} disabled={isLoadingHistory} className={`text-slate-500 hover:text-white transition-colors ${isLoadingHistory ? 'animate-spin' : ''}`}><RefreshIcon width={14} /></button>
                </div>
                <div className="flex flex-col gap-3">
                    {projects.length === 0 ? <p className="text-center text-[10px] text-slate-600 py-10 uppercase tracking-widest">No history</p> : 
                    projects.map(p => (
                        <div key={p.id} onClick={() => loadProject(p)} className={`p-3 rounded-xl border transition-all cursor-pointer group ${currentProjectId === p.id ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}>
                            <h4 className={`text-xs font-bold mb-2 line-clamp-2 leading-tight ${currentProjectId === p.id ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>{getCleanTitle(p)}</h4>
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">{formatDate(p.created_at)}</span>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${p.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{p.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
      </div>

      <footer className="w-full bg-[#030712]/95 backdrop-blur-md border-t border-slate-800/50 py-3 px-6 text-center z-30">
          <p className="text-[10px] text-slate-500 tracking-tight">Created by <a href="https://www.linkedin.com/in/maurizioipsale/" className="text-blue-400 font-bold">Maurizio Ipsale</a> • GDE Cloud/AI</p>
      </footer>
    </div>
  );
}
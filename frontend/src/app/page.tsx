"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import { 
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon, 
  EyeIcon, ChevronLeft, ChevronRight, XIcon, MaximizeIcon, PaintBrushIcon, 
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

// State compatibility
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

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [showHistory, setShowHistory] = useState(false);
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
      // Use [\s\S]* instead of . with /s flag for better compatibility
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
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
              });
          }
          // ISO String or other
          const dateObj = new Date(timestamp as any);
          if (isNaN(dateObj.getTime())) return "Invalid date";
          
          return dateObj.toLocaleDateString(undefined, {
               month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
          });
      } catch (e) {
          return "Invalid date";
      }
  };

  const fetchProjects = async () => {
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
  };

  // Check for API Key on auth load & Auto-Resume
  useEffect(() => {
    if (user) {
        checkSettings();
        fetchProjects();
        
        // Auto-Resume Last Session
        const lastPid = localStorage.getItem("lastProjectId");
        if (lastPid && lastPid !== "undefined" && lastPid !== "null") {
            // We need to fetch the summary first or just try to load by ID directly?
            // To reuse loadProject, we need a summary object. 
            // Or we can just fetch details directly. Let's do direct fetch.
            fetchDetailsDirectly(lastPid);
        }
    }
  }, [user]);

  const fetchDetailsDirectly = async (pid: string) => {
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
  };

  const restoreProjectState = (fullProject: ProjectDetails) => {
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
      setShowHistory(false);
      // Don't auto-scroll on resume, it might be jarring
  };

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
          
          // Force update stalled components
          setSurfaceState((prev: any) => {
              const newComps = { ...prev.components };
              let changed = false;
              Object.keys(newComps).forEach(key => {
                  if (newComps[key].status === "generating") {
                      newComps[key] = { ...newComps[key], status: "error", text: "Stopped by user" };
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
          setSurfaceState((prev: any) => ({
              ...prev,
              components: {
                  ...prev.components,
                  [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "error", text: "Retry Failed" }
              }
          }));
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
          alert("Failed to refine text. Try again.");
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
        let fileIds: string[] = [];
        const allFiles = [...uploadedFiles, ...brandingFiles];
        
        const uploadFile = async (file: File) => {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const uploadRes = await fetch(`${BACKEND_URL}/agent/upload`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.file_id) return uploadData.file_id;
                else throw new Error("Upload failed");
            } catch (e) {
                console.error(`Upload failed for ${file.name}`, e);
                return null;
            }
        };

        for (const f of allFiles) {
            const fid = await uploadFile(f);
            if (fid) fileIds.push(fid);
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
                    session_id: "s1",
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
        } catch (e: any) { 
            if (e.name !== 'AbortError') console.error("Script stream error:", e); 
        } finally { 
            setIsStreaming(false); 
            abortControllerRef.current = null;
            fetchProjects(); 
        }
        return;
    }

    // --- PHASE 2: GRAPHICS GENERATION (Batched Requests) ---
    if (targetPhase === "graphics" && currentScript) {
        setPhase("graphics");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

        if (!currentScript.global_settings) currentScript.global_settings = {};
        currentScript.global_settings.aspect_ratio = aspectRatio;

        const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        
        // Identify slides needing generation (those without image_url or with placeholders)
        // We use the current script passed in argument as source of truth
        const allSlides = currentScript.slides || [];
        const pendingSlides = allSlides.filter((s: Slide) => !s.image_url);
        
        if (pendingSlides.length === 0) {
            setIsStreaming(false);
            return;
        }

        const BATCH_SIZE = 3;
        
        try {
            for (let i = 0; i < pendingSlides.length; i += BATCH_SIZE) {
                if (abortController.signal.aborted) break;

                const batchSlides = pendingSlides.slice(i, i + BATCH_SIZE);
                const isFirstBatch = i === 0;
                
                // Create a partial script for this batch
                const batchScript = {
                    ...currentScript,
                    slides: batchSlides
                };

                // Update UI to show waiting state for this batch immediately (optional, handled by backend too)
                // But we want to ensure other slides stay visible.
                
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
                        session_id: "s1",
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
                            const comps = msg.updateComponents.components;
                            comps.forEach((c: any) => {
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
        } catch (e: any) {
            if (e.name !== 'AbortError') console.error("Graphics stream error:", e);
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
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

  const handleConfirmRegenerate = () => {
      setShowConfirm(false);
      handleStream("script");
  };

  const handleExport = async (fmt: "zip" | "pdf" | "slides" | "pdf_handout") => {
    if (!hasApiKey) { setShowSettings(true); return; }
    if (!surfaceState.components || !script) return;
    setIsExporting(true);
    const token = await getToken();
    
    // --- GOOGLE SLIDES EXPORT ---
    if (fmt === "slides") {
        try {
            let googleToken = await getGoogleAccessToken();

            if (!hasSlidesPermissions || !googleToken) {
                const newToken = await grantSlidesPermissions();
                if (!newToken) {
                    alert("Google Slides export requires Drive permissions. Please grant them to continue.");
                    setIsExporting(false);
                    return;
                }
                googleToken = newToken;
            }

            if (!googleToken) {
                alert("Failed to retrieve Google Access Token. Please sign in again.");
                setIsExporting(false);
                return;
            }

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
                headers: {
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${token}` 
                },
                body: JSON.stringify({
                    google_token: googleToken, 
                    title: query.substring(0, 50) || "Infographic Presentation",
                    slides: slidesPayload
                })
            });
            
            const data = await res.json();
            if (data.url) window.open(data.url, "_blank");
            else alert(`Export failed: ${data.error || "Unknown error"}`);

        } catch (e) {
            console.error("Slides Export Error:", e);
            alert("Failed to export to Google Slides.");
        } finally {
            setIsExporting(false);
        }
        return;
    }

    // --- ZIP/PDF EXPORT ---
    const imgUrls = script.slides.map((s: Slide) => {
        const comp = surfaceState.components[`img_${s.id}`] as A2UIComponent;
        return comp ? comp.src : (s.image_url || null);
    }).filter((url: string | null) => url !== null);

    if (imgUrls.length === 0) {
        alert("No images generated yet.");
        setIsExporting(false);
        return;
    }

    // Prep text data for handout
    const slidesData = script.slides.map((s: Slide) => ({
        title: s.title,
        description: s.description || s.image_prompt // Fallback
    }));

    try {
        const res = await fetch(`${BACKEND_URL}/agent/export`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ 
                images: imgUrls, 
                format: fmt, 
                project_id: currentProjectId,
                slides_data: slidesData 
            })
        });
        const data = await res.json();
        if (data.url) {
            // Use hidden anchor to bypass popup blockers and avoid permission-change reloads
            const link = document.createElement('a');
            let downloadUrl = data.url;
            // Fix: If URL is relative (from backend static), prepend backend host
            if (downloadUrl.startsWith("/")) {
                downloadUrl = `${BACKEND_URL}${downloadUrl}`;
            }
            link.href = downloadUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            // Force filename if backend didn't provide Content-Disposition, helps browser treat as download
            if (fmt.startsWith('pdf')) link.download = `presentation-${new Date().getTime()}.pdf`;
            else if (fmt === 'zip') link.download = `presentation-${new Date().getTime()}.zip`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
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

  // --- Handlers for UX Controls ---
  const handleLogout = async () => {
    localStorage.removeItem("lastProjectId");
    handleResetSession();
    await logout();
  };

  const skipSlide = (slideId: string) => {
      setSurfaceState((prev: any) => ({
          ...prev,
          components: {
              ...prev.components,
              [`card_${slideId}`]: { ...prev.components[`card_${slideId}`], status: "skipped", text: "Skipped by user" }
          }
      }));
  };

  if (authLoading) return <div className="min-h-screen bg-[#030712] flex items-center justify-center text-white font-bold animate-pulse">Loading Identity...</div>;
  
  if (!user) {
      return (
          <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 relative overflow-hidden">
              {/* Background Grid Overlay */}
              <div className="absolute inset-0 z-0 bg-grid pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]"></div>
              
              <div className="max-w-md w-full bg-[#111827]/80 backdrop-blur-xl border border-slate-800 p-10 rounded-3xl shadow-2xl text-center flex flex-col gap-8 animate-fade-in relative z-10">
                  <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/40"><MonitorIcon /></div>
                  <div>
                      <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">IPSA</h1>
                      <div className="flex flex-col gap-1 mb-6">
                        <p className="text-blue-400 font-bold text-sm uppercase tracking-[0.3em]">Your Visual Data Architect</p>
                        <p className="text-slate-500 font-medium text-[10px] uppercase tracking-widest">Infographic Presentation Sales Agent</p>
                      </div>
                      <p className="text-slate-400 text-base max-w-sm mx-auto leading-relaxed">
                        Transform complex technical insights into stunning, high-impact visual narratives in seconds.
                      </p>
                  </div>
                  <button onClick={login} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl">
                      <GoogleIcon /> Sign in with Google
                  </button>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest">Powered by Google ADK & Gemini</p>
              </div>
          </div>
      );
  }

  const hasGeneratedImages = script?.slides.some((s: Slide) => {
      const comp = surfaceState.components[`img_${s.id}`];
      return comp?.src || s.image_url;
  });

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative overflow-hidden flex flex-col">
      
      {/* Background Grid Overlay */}
      <div className="absolute inset-0 z-0 bg-grid pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]"></div>

      {/* RESET CONFIRMATION MODAL */}
      {showResetConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-red-900/30 p-8 rounded-2xl max-w-sm w-full shadow-2xl relative text-center">
                  <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                      <TrashIcon />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">New Project?</h3>
                  <p className="text-slate-400 text-sm mb-6">
                      This will reset the current session.<br/>
                      <span className="text-xs text-red-400">"Confirm Reset" clears everything. "Restart Generation" keeps your files.</span>
                  </p>
                  <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all">Cancel</button>
                        <button onClick={resetGenerationOnly} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all">Restart Generation</button>
                      </div>
                      <button onClick={handleResetSession} className="w-full px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-900 text-red-400 rounded-lg font-medium text-xs transition-all">Fully Reset Project</button>
                  </div>
              </div>
          </div>
      )}

      {/* REGENERATE SCRIPT CONFIRMATION MODAL (For existing scripts) */}
      {showConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-amber-900/30 p-8 rounded-2xl max-w-sm w-full shadow-2xl relative text-center">
                  <div className="w-16 h-16 bg-amber-900/20 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-4">
                      <RefreshIcon />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Regenerate Script?</h3>
                  <p className="text-slate-400 text-sm mb-6">
                      You already have a script. Generating a new one will <span className="text-amber-400 font-bold">overwrite</span> the current plan and slide text.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all">Cancel</button>
                    <button 
                        onClick={handleConfirmRegenerate} 
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all"
                    >
                        Confirm
                    </button>
                  </div>
              </div>
          </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in px-4">
              <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-2xl max-w-2xl w-full shadow-2xl relative max-h-[80vh] flex flex-col">
                  <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><XIcon /></button>
                  <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-900/30 rounded-full flex items-center justify-center text-blue-400"><HistoryIcon /></div>
                      <h3 className="text-xl font-bold text-white">Project History</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                      {isLoadingHistory ? (
                          <div className="flex items-center justify-center py-20 text-slate-500 animate-pulse">Loading past works...</div>
                      ) : projects.length === 0 ? (
                          <div className="text-center py-20 text-slate-500">No projects found. Start creating!</div>
                      ) : (
                          <div className="flex flex-col gap-3">
                              {projects.map(p => (
                                  <div key={p.id} onClick={() => loadProject(p)} className="bg-slate-900 hover:bg-slate-800 border border-slate-700 p-4 rounded-xl cursor-pointer transition-all group">
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="font-bold text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{getCleanTitle(p)}</h4>
                                          <span className="text-[10px] text-slate-500 uppercase">{formatDate(p.created_at)}</span>
                                      </div>
                                      <div className="flex gap-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                                          <span>{p.slide_count || 0} Slides</span>
                                          <span className={p.status === 'completed' ? 'text-green-500' : 'text-amber-500'}>{p.status}</span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

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
                      const src = imgComp?.src || slide.image_url;
                      return src ? (
                          <div className="relative w-full h-full max-w-7xl flex items-center justify-center group">
                              <img src={src} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt={slide.title} />
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
          <img src="/logo.png" alt="IPSA Logo" className="w-8 h-8 rounded-lg" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-slate-50 tracking-tight leading-none">IPSA</span>
            <span className="text-[9px] uppercase tracking-widest text-blue-400 font-bold hidden md:block mt-1">Your Visual Data Architect</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold" title="Start New Project">
              <PlusIcon /> <span className="hidden sm:inline">New Project</span>
          </button>
          
          <div className="hidden lg:flex flex-col items-end mr-4">
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Infographic Presentation Sales Agent</span>
          </div>
          
          <button onClick={() => setShowHistory(true)} className="p-2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all" title="View History">
              <HistoryIcon />
          </button>

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

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* SIDEBAR (Settings) */}
        <aside className={`w-[320px] h-full z-30 flex flex-col glass-panel border-r border-slate-800 transition-all duration-300 absolute md:relative ${showMobileSettings ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-200 border-b border-slate-800/50 pb-4">
                    <SettingsIcon />
                    <span>SETTINGS</span>
                </div>

                {/* Slides Control */}
                <section>
                    <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wide font-bold">Slides</label>
                    <div className="flex items-center justify-between glass-input rounded-lg mb-3">
                        <button onClick={() => setNumSlides(prev => Math.max(1, prev - 1))} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-l-lg transition-colors">
                            <PlusIcon className="rotate-45" />
                        </button>
                        <span className="text-sm font-medium text-blue-400">{numSlides}</span>
                        <button onClick={() => setNumSlides(prev => Math.min(30, prev + 1))} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-r-lg transition-colors">
                            <PlusIcon />
                        </button>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${(numSlides / 30) * 100}%` }}></div>
                    </div>
                </section>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Detail</label>
                        <div className="relative">
                            <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full glass-input rounded-lg py-2.5 px-3 text-sm appearance-none cursor-pointer focus:ring-0 outline-none">
                                <option>1 - Super Simple</option>
                                <option>2 - Basic</option>
                                <option>3 - Average</option>
                                <option>4 - Detailed</option>
                                <option>5 - Super Detailed</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"><ChevronDown /></div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Format</label>
                        <div className="relative">
                            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full glass-input rounded-lg py-2.5 px-3 text-sm appearance-none cursor-pointer focus:ring-0 outline-none">
                                <option value="16:9">16:9 (Wide)</option>
                                <option value="4:3">4:3 (Standard)</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"><ChevronDown /></div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Lang</label>
                        <div className="relative">
                            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full glass-input rounded-lg py-2.5 px-3 text-sm appearance-none cursor-pointer focus:ring-0 outline-none">
                                <option>English</option>
                                <option>Italian</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"><ChevronDown /></div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs text-slate-500 mb-1.5 uppercase font-bold tracking-wide">Style</label>
                    <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. Minimalist" className="w-full glass-input rounded-lg py-2.5 px-3 text-sm outline-none" />
                </div>
                
                {/* BRAND KIT */}
                <div className="pt-4 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-4 uppercase tracking-wide">
                        <PaletteIcon />
                        <span>Brand Kit</span>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-1 uppercase font-bold">Primary Color</label>
                            <div className="flex items-center gap-2">
                                <input type="text" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#0066FF" className="flex-1 glass-input rounded-lg py-2 px-3 text-xs outline-none font-mono" />
                                <div className="relative w-8 h-8 rounded-lg border border-white/10 overflow-hidden">
                                    <input type="color" value={brandPrimary || "#3b82f6"} onChange={(e) => setBrandPrimary(e.target.value)} className="absolute inset-0 scale-150 cursor-pointer" />
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-1 uppercase font-bold">Secondary Color</label>
                            <div className="flex items-center gap-2">
                                <input type="text" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} placeholder="#1E293B" className="flex-1 glass-input rounded-lg py-2 px-3 text-xs outline-none font-mono" />
                                <div className="relative w-8 h-8 rounded-lg border border-white/10 overflow-hidden">
                                    <input type="color" value={brandSecondary || "#1e293b"} onChange={(e) => setBrandSecondary(e.target.value)} className="absolute inset-0 scale-150 cursor-pointer" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="h-10"></div>
            </div>
        </aside>

          {/* MOBILE TOGGLE BUTTON */}
          <div className="md:hidden col-span-1">
              <button onClick={() => setShowMobileSettings(!showMobileSettings)} className="w-full bg-[#1e293b] border border-slate-700 text-slate-300 py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm">
                  {showMobileSettings ? <ChevronUp /> : <ChevronDown />} {showMobileSettings ? "Hide Options" : "Show Options (Slides, Lang...)"}
              </button>
          </div>

        {/* CORE CONTENT AREA */}
        <main className="flex-1 flex flex-col relative p-4 md:p-6 overflow-y-auto custom-scrollbar">
            
            {/* MISSING API KEY BANNER */}
            {!hasApiKey && (
                <div className="mb-6 bg-amber-900/30 border border-amber-600/50 p-4 rounded-xl flex items-center gap-3 text-amber-200 text-sm animate-pulse z-10">
                    <KeyIcon />
                    <span><strong>Action Required:</strong> Please configure your Gemini API Key in Settings to start.</span>
                </div>
            )}

            {/* Central Text Area (Glassmorphism Style) */}
            <div className={`flex-1 flex flex-col pt-4 px-2 min-h-[300px] md:min-h-[400px] transition-all duration-500 ${phase !== 'input' ? 'flex-none h-48' : ''}`}>
                <div className="w-full h-full relative group">
                    <div className="absolute inset-0 glass-panel rounded-2xl opacity-50 pointer-events-none group-focus-within:opacity-80 transition-opacity"></div>
                    <textarea 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                        placeholder="Describe your topic (e.g. 'History of Rome'), paste a URL, or upload files..." 
                        className="w-full h-full bg-transparent border-0 text-slate-200 placeholder-slate-600 text-lg leading-relaxed resize-none p-6 outline-none relative z-10 focus:ring-0" 
                    />
                </div>
            </div>

            {/* Bottom Actions Floating Section */}
            <div className="mt-4 flex flex-col gap-3">
                {/* File Uploads Display */}
                {(uploadedFiles.length > 0 || brandingFiles.length > 0) && (
                    <div className="flex flex-wrap gap-2 p-3 glass-panel rounded-xl animate-fade-in">
                        {uploadedFiles.map((f, i) => (
                            <div key={`s-${i}`} className="bg-green-900/20 border border-green-500/30 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-green-400 shadow-sm transition-all group">
                                <FileUpIcon /> <span className="max-w-[150px] truncate">{f.name}</span>
                                <button onClick={() => removeFile('source', i)} className="hover:text-white ml-1 font-black">×</button>
                            </div>
                        ))}
                        {brandingFiles.map((f, i) => (
                            <div key={`b-${i}`} className="bg-blue-900/20 border border-blue-500/30 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-blue-400 shadow-sm transition-all group">
                                <PaletteIcon /> <span className="max-w-[150px] truncate">{f.name}</span>
                                <button onClick={() => removeFile('brand', i)} className="hover:text-white ml-1 font-black">×</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Secondary Actions Row */}
                <div className="grid grid-cols-2 gap-3">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.txt,.md" multiple />
                    <input type="file" ref={brandingInputRef} className="hidden" onChange={handleBrandingUpload} accept=".pdf,.txt,.md,.png,.jpg,.jpeg" multiple />
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={!hasApiKey} 
                        className="flex items-center justify-center gap-2 hover:bg-white/10 py-3 rounded-xl transition-all active:scale-95 group bg-transparent border border-white/10 disabled:opacity-50"
                    >
                        <FileUpIcon className="w-5 h-5" />
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white">Source Docs</span>
                    </button>

                    <button 
                        onClick={() => brandingInputRef.current?.click()} 
                        disabled={!hasApiKey} 
                        className="flex items-center justify-center gap-2 hover:bg-white/10 py-3 rounded-xl transition-all active:scale-95 group bg-transparent border border-white/10 disabled:opacity-50"
                    >
                        <PaletteIcon className="w-5 h-5" />
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white">Brand Guide</span>
                    </button>
                </div>

                {/* Primary Generate Action */}
                <button 
                    onClick={startScriptGen} 
                    disabled={isStreaming || !hasApiKey || (!query && uploadedFiles.length === 0)} 
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all active:scale-95 disabled:opacity-50"
                >
                    {isStreaming && phase === "review" ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Architecting...</span>
                        </>
                    ) : (
                        <>
                            <SparklesIcon className="w-5 h-5" />
                            <span>Generate Script</span>
                        </>
                    )}
                </button>
            </div>

            {/* RESULTS SECTION */}
            {(phase !== "input" || isStreaming) && (
            <section ref={resultsRef} className="mt-8 border-t border-slate-800/50 pt-12 animate-fade-in pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Final Presentation</h2>
                    <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2">
                        {isStreaming && (<button onClick={handleStop} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg animate-pulse flex items-center gap-2 whitespace-nowrap">STOP</button>)}
                        {!isStreaming && script && (
                            <>
                            <button type="button" onClick={() => handleExport("zip")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap">ZIP</button>
                            <button type="button" onClick={() => handleExport("pdf")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap">PDF</button>
                            <button type="button" onClick={() => handleExport("pdf_handout")} disabled={isExporting} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap">Handout</button>
                            <button type="button" onClick={() => handleExport("slides")} disabled={isExporting} className="bg-[#fbbc04]/20 hover:bg-[#fbbc04]/30 border border-[#fbbc04]/50 text-[#fbbc04] px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap flex items-center gap-2">
                                <PresentationIcon /> Google Slides
                            </button>
                            </>
                        )}
                        {script && !isStreaming && (
                            <button onClick={() => handleStream("graphics", script)} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-900/20 text-sm whitespace-nowrap">
                                {hasGeneratedImages ? "Generate Remaining" : "Generate Graphics"}
                            </button>
                        )}
                    </div>
                </div>

                {isStreaming && phase === "review" && !script && (
                    <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-2xl">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                        <h3 className="text-xl font-bold text-white mb-2 animate-pulse">Architecting your story...</h3>
                        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Analyzing Data • Structuring • Planning</p>
                    </div>
                )}

                {script && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {script.slides.map((s: Slide, idx: number) => {
                    const cardComp = surfaceState.components[`card_${s.id}`];
                    const imageComponent = surfaceState.components[`img_${s.id}`];
                    const isGenerating = cardComp?.status === "generating";
                    const isSkipped = cardComp?.status === "skipped";
                    const src = imageComponent?.src || s.image_url;

                    return (
                    <div key={s.id} className={`glass-panel p-4 flex flex-col gap-3 rounded-2xl shadow-xl transition-all relative overflow-hidden group ${isGenerating ? "ring-2 ring-blue-500" : ""} ${isSkipped ? "opacity-50 grayscale" : ""}`}>
                        <div className="flex justify-between items-center border-b border-slate-800/50 pb-2 z-10 relative">
                            <span className="text-xs font-bold text-blue-500 uppercase">{s.id}</span>
                            <div className="flex gap-2">
                                {src ? (
                                    <button onClick={() => togglePrompt(s.id)} className="text-slate-500 hover:text-white text-[10px] uppercase font-bold">Prompt</button>
                                ) : (
                                    <button onClick={() => retrySlide(s.id)} className="text-green-500 hover:text-green-400 text-[10px] uppercase font-bold flex items-center gap-1 bg-green-900/10 px-2 py-1 rounded">Generate</button>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 min-h-[200px] justify-center items-center">
                            {src && !visiblePrompts[s.id] ? (
                                <img src={src} className="w-full h-full object-cover rounded-lg cursor-pointer" onClick={() => setLightboxIndex(idx)} alt={s.title} />
                            ) : (
                                <div className="flex flex-col gap-2 w-full h-full">
                                    <span className="font-bold text-white text-sm">{s.title}</span>
                                    <p className="text-[10px] text-slate-400 leading-relaxed overflow-hidden line-clamp-6">{s.description || s.image_prompt}</p>
                                </div>
                            )}
                        </div>
                        {isGenerating && (
                            <div className="absolute inset-0 bg-[#030712]/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Drawing...</span>
                            </div>
                        )}
                    </div>
                    )})}
                </div>
                )}
            </section>
            )}
        </main>
      </div>

      <footer className="w-full bg-[#030712]/95 backdrop-blur-md border-t border-slate-800/50 py-4 px-6 text-center z-30 mt-auto md:fixed md:bottom-0">
          <p className="text-[10px] text-slate-500 mb-1 tracking-tight">
              Created by <a href="https://www.linkedin.com/in/maurizioipsale/" target="_blank" className="text-blue-400 hover:text-blue-300 font-bold hover:underline">Maurizio Ipsale</a> • Google Developer Expert (GDE) Cloud/AI
          </p>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest opacity-80">
              Disclaimer: AI-generated content may be inaccurate. IPSA is not an official Google product.
          </p>
      </footer>
    </div>
  );
}

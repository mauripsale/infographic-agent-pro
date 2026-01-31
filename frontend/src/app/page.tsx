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
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;
interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: string; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: Record<string, unknown>; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: unknown; }

// --- Stream Helper ---
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
      const res = await fetch(`${BACKEND_URL}/user/projects`, { headers: { "Authorization": `Bearer ${token}` } });
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
    const comps: any = {};
    project.script?.slides.forEach((s: any) => {
        comps[`card_${s.id}`] = { id: `card_${s.id}`, status: s.image_url ? "success" : "waiting" };
        if (s.image_url) comps[`img_${s.id}`] = { id: `img_${s.id}`, src: s.image_url };
    });
    setSurfaceState({ components: comps, dataModel: { script: project.script } });
  }, []);

  const fetchProjectDetails = useCallback(async (pid: string) => {
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
      if (lastPid && lastPid !== "undefined") {
        fetchProjectDetails(lastPid);
      }
    }
  }, [user, fetchProjects, fetchProjectDetails]);

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
            if (msg.log) setAgentLog(prev => [...prev, msg.log]);
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

  const hasGeneratedImages = script?.slides.some((s: Slide) => surfaceState.components[`img_${s.id}`]?.src || s.image_url);

  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex p-4 gap-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-50"></div>

      {/* Left, Center, and Right Column JSX follows... */}
      {/* This part is the same as the fully-featured static layout from before */}
    </div>
  );
}

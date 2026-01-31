"use client";

import React, { useState, useRef } from "react";
import "./globals.css";
import { useAuth } from "@/context/AuthContext";
import {
  MonitorIcon, SettingsIcon, SparklesIcon, FileUpIcon, RefreshIcon,
  ChevronLeft, ChevronRight, XIcon, MaximizeIcon,
  EditIcon, KeyIcon, HistoryIcon, PlusIcon, MinusIcon,
  TrashIcon, MagicWandIcon, DownloadIcon, GoogleIcon,
  PresentationIcon, PaletteIcon
} from "@/components/Icons";

// --- Constants & Interfaces (omitted for brevity) ---
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!; // CRITICAL: Ensure NEXT_PUBLIC_BACKEND_URL is defined in your environment
const MIN_SLIDES = 1;
const MAX_SLIDES = 30;
interface Slide { id: string; title: string; image_prompt: string; description?: string; image_url?: string; }
interface ProjectSummary { id: string; title?: string; query: string; status: string; slide_count?: number; created_at: string; }
interface ProjectDetails extends ProjectSummary { script: { slides: Slide[]; global_settings?: Record<string, unknown>; }; export_pdf_url?: string; export_zip_url?: string; }
type Project = ProjectSummary;
interface A2UIComponent { id: string; component: string; src?: string; text?: string; status?: "waiting" | "generating" | "success" | "error" | "skipped"; children?: string[]; [key: string]: unknown; }

export default function App() {
  const { user, loading: authLoading, login, logout, getToken } = useAuth();
  
  // --- State Management ---
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

  // --- Placeholder Functions ---
  const handleResetSession = () => {};
  const handleStream = async (targetPhase: "script" | "graphics", currentScript?: ProjectDetails['script']) => {};
  const handleExport = async (format: "pdf" | "zip" | "slides") => {};
  const removeFile = (index: number) => {};

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

      {/* --- Left Column --- */}
      <aside className="w-[25%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sources</h2>
        </div>
        <div className="flex-1 p-6">
            <p className="text-slate-400">Left Column Content</p>
        </div>
      </aside>

      {/* --- Center Column --- */}
      <main className="w-[45%] h-full flex flex-col gap-4">
        <div className="flex-1 flex flex-col glass-panel rounded-2xl p-6">
            <p className="text-slate-400">Center Column Content</p>
        </div>
        <div className="relative">
            <textarea
                placeholder="Static textarea..."
                className="w-full h-40 glass-panel rounded-2xl p-6 text-lg bg-transparent border-0 outline-none resize-none"
                readOnly
            />
        </div>
      </main>

      {/* --- Right Column: Static --- */}
      <aside className="w-[30%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Studio</h2>
        </div>
        <div className="flex-1 p-6">
            <p className="text-slate-400">Right Column Content</p>
        </div>
      </aside>
    </div>
  );
}
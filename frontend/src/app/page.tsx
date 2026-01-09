"use client";

import React, { useState, useEffect } from "react";
import "./globals.css";

// --- Icons (Lucide-React style using SVG) ---
const MonitorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const FileUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 7h4"/><path d="M3 3h4"/></svg>;

// --- A2UI Types & Renderer ---
interface ComponentDef { id: string; component: string; children?: string[]; text?: any; action?: any; [key: string]: any; }
interface SurfaceState { components: Record<string, ComponentDef>; dataModel: any; }

const A2UIRenderer = ({ surfaceState, componentId }: { surfaceState: SurfaceState; componentId: string }) => {
  const comp = surfaceState.components[componentId];
  if (!comp) return null;

  const resolveText = (text: any) => {
    if (typeof text === 'string') return text;
    if (text?.path && text.path.startsWith('/')) return surfaceState.dataModel[text.path.substring(1)] || "";
    return "";
  };

  switch (comp.component) {
    case "Column":
      return <div className="flex flex-col gap-8 w-full">{comp.children?.map(id => <A2UIRenderer key={id} surfaceState={surfaceState} componentId={id} />)}</div>;
    case "Text":
      const isHeader = comp.id.includes("header");
      return <p className={`${isHeader ? "text-xl font-bold text-white mb-2" : "text-slate-300 text-lg leading-relaxed"}`}>{resolveText(comp.text)}</p>;
    case "Image":
      return <div className="rounded-xl overflow-hidden border border-slate-700 shadow-2xl transition-all hover:ring-2 hover:ring-blue-500/50"><img src={comp.src} alt="Infographic" className="w-full h-auto object-cover" /></div>;
    case "Button":
      return (
        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20"
          onClick={() => { if(comp.action?.name === 'download') window.open(`https://infographic-agent-backend-218788847170.us-central1.run.app${comp.action.context.url}`, '_blank'); }}>
          <A2UIRenderer surfaceState={surfaceState} componentId={comp.child} />
        </button>
      );
    default: return null;
  }
};

export default function App() {
  // State
  const [query, setQuery] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelType, setModelType] = useState<"flash" | "pro">("flash");
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("Modern Minimalist");
  const [detailLevel, setDetailLevel] = useState("Standard");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [language, setLanguage] = useState("English");
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"input" | "results">("input");
  
  // A2UI State
  const [surfaceState, setSurfaceState] = useState<SurfaceState>({ components: {}, dataModel: {} });
  const [rootComponentId, setRootComponentId] = useState<string | null>(null);

  useEffect(() => {
    const key = localStorage.getItem("google_api_key");
    if (key) setApiKey(key);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    localStorage.setItem("google_api_key", e.target.value);
  };

  const handleGenerate = async () => {
    if (!apiKey) { alert("Please enter API Key (top right)"); return; }
    setIsStreaming(true);
    setActiveTab("results");
    setSurfaceState({ components: {}, dataModel: {} });
    setRootComponentId(null);

    // Prepare prompt with settings
    const settingsContext = `
[GENERATION SETTINGS]
- Target Slide Count: ${numSlides}
- Visual Style: ${style}
- Detail Level: ${detailLevel}
- Aspect Ratio: ${aspectRatio}
- Output Language: ${language}
`;
    const fullQuery = `${settingsContext}\n\n[USER REQUEST]\n${query}`;
    const selectedModel = modelType === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";

    try {
      const res = await fetch("https://infographic-agent-backend-218788847170.us-central1.run.app/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "X-GenAI-Model": selectedModel },
        body: JSON.stringify({ query: fullQuery, session_id: "sess-" + Date.now() }),
      });
      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) if (line.trim()) processMsg(JSON.parse(line));
      }
    } catch (e) { console.error(e); } finally { setIsStreaming(false); }
  };

  const processMsg = (msg: any) => {
    if (msg.updateComponents) {
      setSurfaceState(prev => {
        const next = { ...prev.components };
        msg.updateComponents.components.forEach((c: any) => { next[c.id] = c; if (c.id === "root") setRootComponentId("root"); });
        return { ...prev, components: next };
      });
    }
    if (msg.updateDataModel && msg.updateDataModel.path === "/") setSurfaceState(prev => ({ ...prev, dataModel: msg.updateDataModel.value }));
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 border-b border-slate-800 bg-[#030712]/90 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><MonitorIcon /></div>
          <span className="text-lg font-bold text-slate-50 tracking-tight">Infographic Agent Pro</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-1 rounded-full border border-slate-800 flex">
            <button onClick={() => setModelType("flash")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "flash" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>2.5 Flash</button>
            <button onClick={() => setModelType("pro")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${modelType === "pro" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>3 Pro</button>
          </div>
          
          <input 
            type="password" 
            placeholder="API Key" 
            value={apiKey} 
            onChange={handleApiKeyChange}
            className="bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5 text-xs text-slate-300 w-32 focus:w-64 transition-all focus:border-blue-500 outline-none placeholder-slate-600"
          />
        </div>
      </header>

      <div className="pt-24 pb-12 px-6 max-w-7xl mx-auto grid grid-cols-12 gap-8 h-[calc(100vh-6rem)]">
        
        {/* Sidebar Left - Settings */}
        <aside className="col-span-12 lg:col-span-3 bg-[#111827] rounded-2xl border border-slate-800 p-6 flex flex-col h-full shadow-xl">
          <div className="flex items-center gap-2 mb-6 text-slate-100 font-semibold border-b border-slate-800 pb-4">
            <SettingsIcon /><span className="uppercase tracking-wider text-xs">Generation Settings</span>
          </div>

          <div className="space-y-8 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {/* Slider */}
            <div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Number of Slides</span>
                <span className="text-blue-400 font-bold bg-blue-900/30 px-2 py-0.5 rounded text-xs">{numSlides} Slides</span>
              </div>
              <input type="range" min="1" max="15" value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>

            {/* Selects */}
            <div className="space-y-5">
              <div>
                <label className="block text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Visual Style</label>
                <div className="relative">
                    <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none appearance-none">
                    <option>Modern Minimalist</option>
                    <option>Cyberpunk Neon</option>
                    <option>Corporate Professional</option>
                    <option>Hand Drawn Sketch</option>
                    <option>Futuristic 3D</option>
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>

               <div>
                <label className="block text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Detail Level</label>
                <div className="relative">
                    <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none appearance-none">
                    <option>Standard</option>
                    <option>High Detail</option>
                    <option>Simplified</option>
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Aspect Ratio</label>
                <div className="relative">
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none appearance-none">
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="4:3">4:3 (Standard)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="9:16">9:16 (Portrait)</option>
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Language</label>
                <div className="relative">
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none appearance-none">
                    <option>English</option>
                    <option>Italian</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>
            </div>

            {/* Switch */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
              <span className="text-sm text-slate-300 font-medium">Parallel Generation</span>
              <div className="w-10 h-5 bg-blue-900/30 rounded-full relative cursor-pointer border border-blue-500/30">
                <div className="w-3 h-3 bg-blue-500 rounded-full absolute top-1 right-1 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="col-span-12 lg:col-span-9 flex flex-col h-full gap-6">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button onClick={() => setActiveTab("input")} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "input" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
              <FileUpIcon /> 1. Source Content
            </button>
            <button onClick={() => setActiveTab("results")} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "results" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
              <SparklesIcon /> 2. Review Results {isStreaming && <span className="flex h-2 w-2 relative ml-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
            </button>
          </div>

          <div className="flex-1 bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden shadow-inner">
            {activeTab === "input" ? (
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Paste your source text here or a list of URLs to analyze for your infographic..."
                className="w-full h-full bg-transparent resize-none outline-none text-slate-300 placeholder-slate-700 text-lg leading-relaxed font-mono custom-scrollbar"
              />
            ) : (
              <div className="h-full overflow-y-auto pr-4 custom-scrollbar">
                {rootComponentId ? (
                  <div className="max-w-4xl mx-auto py-4">
                     <A2UIRenderer surfaceState={surfaceState} componentId={rootComponentId} />
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-6">
                    <div className="w-24 h-24 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center animate-pulse">
                      <SparklesIcon />
                    </div>
                    <div className="text-center">
                        <p className="text-lg font-medium text-slate-500">Generated content will appear here</p>
                        <p className="text-sm text-slate-700 mt-2">Start by entering content in the Source tab</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-4 h-16">
            <button className="w-[20%] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium rounded-xl flex items-center justify-center gap-2 transition-all hover:border-slate-600 text-sm">
              <FileUpIcon /> Upload Doc
            </button>
            <button 
              onClick={handleGenerate}
              disabled={isStreaming || !query}
              className="w-[80%] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 text-base hover:scale-[1.01] active:scale-[0.99]"
            >
              {isStreaming ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-blue-200" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  Processing Request...
                </>
              ) : (
                <>
                  <SparklesIcon /> Generate Infographics
                </>
              )}
            </button>
          </div>

        </main>
      </div>
    </div>
  );
}
"use client";

import React from "react";
import "./globals.css";
import { MonitorIcon, SettingsIcon, SparklesIcon } from "@/components/Icons";

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#030712] text-slate-200 flex p-4 gap-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-50"></div>

      {/* --- Left Column: Static --- */}
      <aside className="w-[25%] h-full glass-panel rounded-2xl flex flex-col">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sources</h2>
        </div>
        <div className="flex-1 p-6">
            <p className="text-slate-400">Left Column Content</p>
        </div>
      </aside>

      {/* --- Center Column: Static --- */}
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
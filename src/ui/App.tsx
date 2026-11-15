import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Pipeline from './pages/Pipeline';
import Results from './pages/Results';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/75 border-b border-white/[0.08]">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <img
                src="/logo.jpg"
                alt="GhostLink"
                className="w-8 h-8 rounded-[22%] object-cover ring-1 ring-white/15 shadow-sm transition-transform duration-200 group-hover:scale-[1.03]"
              />
              <span className="text-[17px] font-semibold tracking-tight text-white">
                GhostLink
              </span>
            </Link>
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.05] text-zinc-400 border border-white/[0.08]">
              Autonomous Modernization Engine
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {!isHome && (
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New Modernization
              </Link>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-400 bg-white/[0.03] border border-white/[0.08]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Kiroween 2026
            </span>
          </div>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pipeline/:jobId" element={<Pipeline />} />
          <Route path="/results/:jobId" element={<Results />} />
        </Routes>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>GhostLink — Multi-Agent Legacy Code Archaeology &amp; Modernization</span>
          <span className="text-zinc-600">Archaeology · Documentation · Modernizer · Property Tests · Deploy</span>
        </div>
      </footer>
    </div>
  );
}

import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Pipeline from './pages/Pipeline';
import Results from './pages/Results';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--ghost-dark)' }}>
      <nav className="border-b border-purple-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold specter-glow hover:opacity-80 transition-opacity">
          👻 GhostLink
        </Link>
        <div className="flex items-center gap-4 text-sm text-purple-300">
          {!isHome && (
            <Link to="/" className="hover:text-white transition-colors">
              ← New Job
            </Link>
          )}
          <span className="text-purple-600">Kiroween 2026</span>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pipeline/:jobId" element={<Pipeline />} />
          <Route path="/results/:jobId" element={<Results />} />
        </Routes>
      </main>
    </div>
  );
}

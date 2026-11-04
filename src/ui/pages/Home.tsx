import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FileUpload from '../components/FileUpload';

type TargetStack = 'typescript' | 'python' | 'go';
type SourceLanguage = 'php' | 'asp' | 'vb6' | 'cobol' | 'delphi';

interface UploadedFile {
  name: string;
  content: string;
  language: string;
}

const LANG_LABELS: Record<SourceLanguage, string> = {
  php: 'PHP 4/5',
  asp: 'Classic ASP (VBScript)',
  vb6: 'Visual Basic 6',
  cobol: 'COBOL',
  delphi: 'Delphi / Pascal'
};

const STACK_LABELS: Record<TargetStack, string> = {
  typescript: 'TypeScript / Node.js',
  python: 'Python 3',
  go: 'Go'
};

export default function Home() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('php');
  const [targetStack, setTargetStack] = useState<TargetStack>('typescript');
  const [pushToGithub, setPushToGithub] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please upload at least one legacy code file.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const uploadedFiles: UploadedFile[] = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          content: await f.text(),
          language: sourceLanguage
        }))
      );

      const body = {
        files: uploadedFiles,
        targetStack,
        pushToGithub,
        githubRepo: pushToGithub ? githubRepo : undefined
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json() as { error?: unknown };
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create job');
      }

      const data = await res.json() as { data: { jobId: string } };
      navigate(`/pipeline/${data.data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 pt-8">
        <h1 className="text-6xl font-bold specter-glow">👻 GhostLink</h1>
        <p className="text-2xl text-purple-300">Raise your legacy code from the dead</p>
        <p className="text-bone-dim text-sm max-w-lg mx-auto">
          Multi-agent AI pipeline: archaeology → documentation → modernization → tests → deployment
        </p>
      </div>

      {/* Form */}
      <form onSubmit={(e) => { void handleSubmit(e); }} className="ghost-card space-y-6">
        <h2 className="text-xl font-bold text-purple-200">🧟 Upload Legacy Code</h2>

        <FileUpload onFilesChange={setFiles} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-purple-300">
              Source Language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value as SourceLanguage)}
              className="ghost-input w-full"
            >
              {(Object.keys(LANG_LABELS) as SourceLanguage[]).map((lang) => (
                <option key={lang} value={lang}>{LANG_LABELS[lang]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-purple-300">
              Target Stack
            </label>
            <select
              value={targetStack}
              onChange={(e) => setTargetStack(e.target.value as TargetStack)}
              className="ghost-input w-full"
            >
              {(Object.keys(STACK_LABELS) as TargetStack[]).map((stack) => (
                <option key={stack} value={stack}>{STACK_LABELS[stack]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* GitHub toggle */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                pushToGithub ? 'bg-emerald-600' : 'bg-purple-800'
              }`}
              onClick={() => setPushToGithub((v) => !v)}
              role="checkbox"
              aria-checked={pushToGithub}
              tabIndex={0}
              onKeyDown={(e) => e.key === ' ' && setPushToGithub((v) => !v)}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                  pushToGithub ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </div>
            <span className="text-sm text-purple-300">🐙 Push to GitHub</span>
          </label>

          {pushToGithub && (
            <input
              type="text"
              placeholder="GitHub repository name (e.g. my-modernized-app)"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              className="ghost-input w-full"
            />
          )}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || files.length === 0}
          className="ghost-btn-green w-full text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '🌀 Summoning pipeline...' : '⚡ Modernize Code'}
        </button>
      </form>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: '🏺', title: 'Archaeology Agent', desc: 'Extracts business rules, functions, and side effects from legacy code' },
          { icon: '📜', title: 'Documentation Agent', desc: 'Generates living docs and Mermaid data flow diagrams' },
          { icon: '⚗️', title: 'Modernizer Agent', desc: 'Rewrites to TypeScript, Python, or Go with annotated decisions' },
          { icon: '🧪', title: 'Test Agent', desc: 'Property-based tests with fast-check or hypothesis' },
          { icon: '🚀', title: 'Deploy Agent', desc: 'Dockerfile, docker-compose, and GitHub Actions CI' },
          { icon: '🐙', title: 'GitHub MCP', desc: 'Auto-creates repo and opens PR with decision log' }
        ].map(({ icon, title, desc }) => (
          <div key={title} className="ghost-card text-center space-y-2">
            <div className="text-3xl">{icon}</div>
            <h3 className="font-bold text-purple-200 text-sm">{title}</h3>
            <p className="text-xs text-purple-400">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

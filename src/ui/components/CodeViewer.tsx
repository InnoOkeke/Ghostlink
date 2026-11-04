import React, { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

interface CodeViewerProps {
  code: string;
  language: string;
  filename: string;
}

export default function CodeViewer({ code, language, filename }: CodeViewerProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      // Reset to prevent double-highlighting
      codeRef.current.removeAttribute('data-highlighted');
      codeRef.current.className = `language-${language}`;
      codeRef.current.textContent = code;
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="ghost-card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-purple-900/60 border-b border-purple-700">
        <div className="flex items-center gap-2">
          <span className="text-purple-400 text-sm">📄</span>
          <span className="text-sm font-mono text-purple-200">{filename}</span>
          <span className="text-xs text-purple-600 bg-purple-900 px-2 py-0.5 rounded">{language}</span>
        </div>
        <button
          onClick={() => { void handleCopy(); }}
          className="text-xs text-purple-400 hover:text-white transition-colors px-3 py-1 rounded border border-purple-700 hover:border-purple-500"
          aria-label="Copy code to clipboard"
        >
          {copied ? '✅ Copied!' : '📋 Copy'}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto max-h-96">
        <pre className="m-0 p-4 text-sm leading-relaxed">
          <code ref={codeRef} className={`language-${language}`}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onFilesChange: (files: File[]) => void;
}

const MAX_FILE_SIZE = 500 * 1024; // 500KB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ onFilesChange }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const processFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;

      const validFiles: File[] = [];
      const newErrors: string[] = [];

      Array.from(newFiles).forEach((file) => {
        if (file.size > MAX_FILE_SIZE) {
          newErrors.push(`${file.name}: exceeds 500KB limit (${formatBytes(file.size)})`);
        } else {
          validFiles.push(file);
        }
      });

      setErrors(newErrors);
      const merged = [...files, ...validFiles].slice(0, 10);
      setFiles(merged);
      onFilesChange(merged);
    },
    [files, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesChange(updated);
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
          dragOver
            ? 'border-emerald-400 bg-emerald-900/20 shadow-lg shadow-emerald-900/30'
            : 'border-purple-600 hover:border-purple-400 bg-purple-950/30'
        }`}
        role="button"
        aria-label="Upload legacy code files"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            document.getElementById('file-input')?.click();
          }
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".php,.asp,.bas,.vb,.cbl,.cob,.pas,.dpr,.txt"
          className="hidden"
          onChange={handleFileInput}
          aria-label="File input"
        />
        <div className="text-4xl mb-3">{dragOver ? '👻' : '📂'}</div>
        <p className="text-purple-300 font-medium">
          {dragOver ? 'Drop to summon!' : 'Drag & drop legacy code files here'}
        </p>
        <p className="text-purple-500 text-sm mt-1">
          or click to browse · Max 500KB per file · Up to 10 files
        </p>
        <p className="text-purple-600 text-xs mt-2">
          Supports: .php, .asp, .bas, .vb, .cbl, .cob, .pas, .dpr
        </p>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err) => (
            <p key={err} className="text-red-400 text-xs">⚠️ {err}</p>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-purple-400">{files.length} file{files.length !== 1 ? 's' : ''} ready:</p>
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between bg-purple-900/40 border border-purple-700 rounded-lg px-4 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-purple-300">📄</span>
                <span className="text-white truncate">{file.name}</span>
                <span className="text-purple-500 shrink-0">{formatBytes(file.size)}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                className="text-red-400 hover:text-red-300 ml-2 shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

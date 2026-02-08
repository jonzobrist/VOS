'use client';

import { useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile, uploadRaw } from '@/lib/api';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const router = useRouter();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.md')) {
      setUploadStatus('Only .md files accepted');
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    setIsUploading(true);
    setUploadStatus(`Processing ${file.name}...`);
    try {
      const result = await uploadFile(file);
      setUploadStatus('Starting review...');
      router.push(`/documents/${result.document_id}?autoReview=true`);
    } catch {
      setIsUploading(false);
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.md'));
    if (files.length === 0) {
      setUploadStatus('Drop a markdown file');
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    await handleFile(files[0]);
  }, [router]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  }, [router]);

  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) return;
    setIsUploading(true);
    setUploadStatus('Creating document...');
    try {
      const result = await uploadRaw(pasteContent);
      router.push(`/documents/${result.document_id}?autoReview=true`);
    } catch {
      setIsUploading(false);
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const personas = [
    { name: "Devil's Advocate", color: '#ef4444' },
    { name: 'Supportive Editor', color: '#22c55e' },
    { name: 'Technical Architect', color: '#3b82f6' },
    { name: 'Casual Reader', color: '#eab308' },
    { name: 'Security Reviewer', color: '#f97316' },
    { name: 'Accessibility', color: '#8b5cf6' },
    { name: 'Executive', color: '#06b6d4' },
  ];

  return (
    <main
      className="min-h-screen relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: isDragging
          ? 'linear-gradient(135deg, #0c0c14 0%, #1a1a2e 50%, #0c0c14 100%)'
          : 'linear-gradient(135deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)',
        transition: 'background 0.4s ease',
      }}
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${isDragging ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        {/* Title */}
        <div className="text-center mb-12">
          <h1
            className="text-[10vw] md:text-[100px] font-black tracking-[-0.04em] leading-[0.85] mb-3"
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              background: isDragging
                ? 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)'
                : 'linear-gradient(135deg, #f5f5f5 0%, #666 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              transition: 'all 0.4s ease',
            }}
          >
            VOS
          </h1>
          <p className={`text-xs tracking-[0.4em] uppercase transition-colors duration-300 ${isDragging ? 'text-indigo-300' : 'text-neutral-500'}`}>
            Voxora &middot; Opinari &middot; Scrutara
          </p>
        </div>

        {showPaste ? (
          /* Paste mode */
          <div className="w-full max-w-2xl">
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Paste your markdown here..."
              className="w-full h-64 bg-[#12121a] border border-[#2a2a3a] rounded-xl p-4 text-sm font-mono text-[#c4c4d4] placeholder-[#555] resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              autoFocus
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => { setShowPaste(false); setPasteContent(''); }}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={!pasteContent.trim() || isUploading}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                Review Document
              </button>
            </div>
          </div>
        ) : (
          /* Drop zone */
          <label
            className={`relative w-full max-w-2xl aspect-[16/8] rounded-2xl cursor-pointer flex flex-col items-center justify-center transition-all duration-300
              ${isDragging ? 'scale-[1.02]' : ''} ${isUploading ? 'pointer-events-none' : ''}`}
            style={{
              border: '1px dashed',
              borderColor: isDragging ? 'rgba(129, 140, 248, 0.6)' : 'rgba(64, 64, 64, 0.6)',
              background: isDragging ? 'rgba(99, 102, 241, 0.04)' : 'rgba(255, 255, 255, 0.01)',
              boxShadow: isDragging ? '0 0 60px rgba(99, 102, 241, 0.1)' : 'none',
            }}
          >
            <input type="file" accept=".md" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isUploading} />

            {isUploading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-neutral-400 text-sm tracking-wide">{uploadStatus}</span>
              </div>
            ) : (
              <>
                <div className={`mb-4 transition-all duration-300 ${isDragging ? 'scale-110 opacity-100' : 'opacity-40'}`}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={isDragging ? '#818cf8' : '#666'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="12" y2="12" />
                    <line x1="15" y1="15" x2="12" y2="12" />
                  </svg>
                </div>
                <p className={`text-lg font-medium tracking-tight transition-colors duration-300 ${isDragging ? 'text-indigo-300' : 'text-neutral-300'}`}>
                  {isDragging ? 'Release to start review' : 'Drop a markdown file'}
                </p>
                <p className="text-neutral-500 text-sm mt-1.5">or click to browse</p>
                {uploadStatus && <p className="absolute bottom-6 text-amber-500/80 text-sm">{uploadStatus}</p>}
              </>
            )}
          </label>
        )}

        {/* Toggle paste mode */}
        {!showPaste && !isUploading && (
          <button onClick={() => setShowPaste(true)} className="mt-6 text-sm text-neutral-500 hover:text-indigo-400 transition-colors">
            or paste markdown directly
          </button>
        )}

        {/* Info */}
        <p className={`mt-10 text-neutral-500 text-sm max-w-md text-center leading-relaxed transition-opacity duration-500 ${isDragging ? 'opacity-30' : 'opacity-100'}`}>
          Your document will be reviewed by <span className="text-neutral-400">7 AI personas</span> simultaneously.
          Watch feedback appear in real-time.
        </p>

        {/* Persona dots */}
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 items-center transition-opacity duration-500 ${isDragging ? 'opacity-0' : 'opacity-60'}`}>
          {personas.map((p) => (
            <div key={p.name} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-[9px] text-neutral-500 tracking-wide uppercase">{p.name}</span>
            </div>
          ))}
        </div>

        {/* Nav link */}
        <a href="/documents" className={`absolute top-5 right-6 text-xs text-neutral-500 hover:text-neutral-300 transition-colors tracking-wide uppercase ${isDragging ? 'opacity-0' : 'opacity-100'}`}>
          Documents
        </a>
      </div>
    </main>
  );
}

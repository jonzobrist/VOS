'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/config';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const router = useRouter();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.md')) {
      setUploadStatus('Only .md files accepted');
      setTimeout(() => setUploadStatus(null), 3000);
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/reviews/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      return await response.json();
    } catch (error) {
      console.error('Upload error:', error);
      return null;
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

    setIsUploading(true);
    setUploadStatus(`Processing ${files[0].name}...`);

    const result = await processFile(files[0]);
    if (result) {
      setUploadStatus('Starting review...');
      router.push(`/documents/${result.document_id}?autoReview=true`);
    } else {
      setIsUploading(false);
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 3000);
    }
  }, [router]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.md')) {
      setUploadStatus('Only .md files accepted');
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Processing ${file.name}...`);

    const result = await processFile(file);
    if (result) {
      setUploadStatus('Starting review...');
      router.push(`/documents/${result.document_id}?autoReview=true`);
    } else {
      setIsUploading(false);
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 3000);
    }
  }, [router]);

  return (
    <main 
      className="min-h-screen relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: isDragging 
          ? 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #0c0c0c 100%)'
          : 'linear-gradient(135deg, #0a0a0a 0%, #111118 50%, #0a0a0a 100%)',
        transition: 'background 0.4s ease',
      }}
    >
      {/* Subtle grid texture */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow when dragging */}
      <div 
        className={`absolute inset-0 transition-opacity duration-500 ${isDragging ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        
        {/* Title - stark, editorial */}
        <div className="text-center mb-16">
          <h1 
            className="text-[12vw] md:text-[120px] font-black tracking-[-0.04em] leading-[0.85] mb-4"
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              background: isDragging 
                ? 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)'
                : 'linear-gradient(135deg, #f5f5f5 0%, #888 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              transition: 'all 0.4s ease',
            }}
          >
            VOS
          </h1>
          <p 
            className={`text-xs tracking-[0.4em] uppercase transition-colors duration-400 ${
              isDragging ? 'text-indigo-300' : 'text-neutral-400'
            }`}
          >
            Document Review · AI Personas
          </p>
        </div>

        {/* The drop zone - this IS the interface */}
        <label 
          className={`
            relative w-full max-w-2xl aspect-[16/9] rounded-2xl cursor-pointer
            flex flex-col items-center justify-center
            transition-all duration-400 ease-out
            ${isDragging 
              ? 'scale-[1.02] border-indigo-500/60' 
              : 'border-neutral-800/60 hover:border-neutral-700'
            }
            ${isUploading ? 'pointer-events-none' : ''}
          `}
          style={{
            border: '1px dashed',
            borderColor: isDragging ? 'rgba(129, 140, 248, 0.6)' : 'rgba(64, 64, 64, 0.6)',
            background: isDragging 
              ? 'rgba(99, 102, 241, 0.04)'
              : 'rgba(255, 255, 255, 0.01)',
            boxShadow: isDragging 
              ? '0 0 60px rgba(99, 102, 241, 0.1), inset 0 0 60px rgba(99, 102, 241, 0.03)'
              : 'none',
          }}
        >
          <input
            type="file"
            accept=".md"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-neutral-400 text-sm tracking-wide">{uploadStatus}</span>
            </div>
          ) : (
            <>
              {/* Drop indicator */}
              <div className={`
                mb-6 transition-all duration-300
                ${isDragging ? 'scale-110 opacity-100' : 'opacity-40'}
              `}>
                <svg 
                  width="48" 
                  height="48" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke={isDragging ? '#818cf8' : '#666'}
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-colors duration-300"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="12" y2="12" />
                  <line x1="15" y1="15" x2="12" y2="12" />
                </svg>
              </div>

              <p className={`
                text-lg font-medium tracking-tight transition-colors duration-300
                ${isDragging ? 'text-indigo-300' : 'text-neutral-300'}
              `}>
                {isDragging ? 'Release to start review' : 'Drop a markdown file'}
              </p>
              
              <p className="text-neutral-500 text-sm mt-2">
                or click to browse
              </p>

              {uploadStatus && (
                <p className="absolute bottom-8 text-amber-500/80 text-sm">
                  {uploadStatus}
                </p>
              )}
            </>
          )}
        </label>

        {/* Subtle explainer */}
        <div className={`
          mt-16 text-center max-w-md transition-opacity duration-500
          ${isDragging ? 'opacity-30' : 'opacity-100'}
        `}>
          <p className="text-neutral-500 text-sm leading-relaxed">
            Your document will be reviewed by AI personas — each with their own perspective. 
            <span className="text-neutral-400"> Watch feedback appear in real-time.</span>
          </p>
        </div>

        {/* Persona indicators - subtle, at the bottom */}
        <div className={`
          absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-6 items-center
          transition-opacity duration-500 ${isDragging ? 'opacity-0' : 'opacity-70'}
        `}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-[10px] text-neutral-500 tracking-wide uppercase">Devil&apos;s Advocate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-neutral-500 tracking-wide uppercase">Supportive Editor</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[10px] text-neutral-500 tracking-wide uppercase">Technical Critic</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500" />
            <span className="text-[10px] text-neutral-500 tracking-wide uppercase">Casual Reader</span>
          </div>
        </div>

        {/* Link to existing documents - very subtle */}
        <a 
          href="/documents"
          className={`
            absolute top-6 right-6 text-xs text-neutral-500 hover:text-neutral-300 
            transition-colors tracking-wide uppercase
            ${isDragging ? 'opacity-0' : 'opacity-100'}
          `}
        >
          Documents →
        </a>
      </div>
    </main>
  );
}

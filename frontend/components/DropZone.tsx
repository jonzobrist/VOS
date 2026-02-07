'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/config';

interface DropZoneProps {
  onUploadComplete?: (documentId: string) => void;
}

export default function DropZone({ onUploadComplete }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const router = useRouter();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.md')) {
      alert('Only .md (Markdown) files are supported');
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/reviews/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setIsUploading(true);
    setUploadProgress('Processing files...');

    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.md'));
    
    if (files.length === 0) {
      setIsUploading(false);
      setUploadProgress(null);
      alert('No .md files found. Please drop Markdown files only.');
      return;
    }

    for (const file of files) {
      setUploadProgress(`Uploading ${file.name}...`);
      const result = await processFile(file);
      
      if (result) {
        setUploadProgress(`Starting review of "${result.title}"...`);
        
        if (onUploadComplete) {
          onUploadComplete(result.document_id);
        }
        
        // Navigate to document review page
        router.push(`/documents/${result.document_id}?autoReview=true`);
        return;
      }
    }

    setIsUploading(false);
    setUploadProgress(null);
  }, [router, onUploadComplete]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress('Processing files...');

    for (const file of Array.from(files)) {
      setUploadProgress(`Uploading ${file.name}...`);
      const result = await processFile(file);
      
      if (result) {
        setUploadProgress(`Starting review of "${result.title}"...`);
        router.push(`/documents/${result.document_id}?autoReview=true`);
        return;
      }
    }

    setIsUploading(false);
    setUploadProgress(null);
  }, [router]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative min-h-[400px] rounded-2xl border-2 border-dashed
        flex flex-col items-center justify-center
        transition-all duration-300 cursor-pointer
        ${isDragging 
          ? 'border-indigo-400 bg-indigo-500/10 scale-[1.02]' 
          : 'border-slate-600 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50'
        }
        ${isUploading ? 'pointer-events-none opacity-75' : ''}
      `}
    >
      <input
        type="file"
        accept=".md"
        multiple
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      
      {isUploading ? (
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-slate-300">{uploadProgress}</p>
        </div>
      ) : (
        <>
          <div className="text-6xl mb-4">
            {isDragging ? '📥' : '📄'}
          </div>
          <h3 className="text-xl font-semibold mb-2 text-slate-200">
            {isDragging ? 'Drop your file here!' : 'Drop a Markdown file to start'}
          </h3>
          <p className="text-slate-400 mb-4">
            or click to browse
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="px-2 py-1 bg-slate-700 rounded">.md</span>
            <span>files supported</span>
          </div>
          <p className="mt-6 text-xs text-slate-600 max-w-md text-center">
            Drop your document and watch as AI personas review it in real-time.
            Each reviewer brings their own perspective and expertise.
          </p>
        </>
      )}
    </div>
  );
}

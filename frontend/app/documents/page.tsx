'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchDocuments, uploadFile, type Document } from '@/lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.md')) return;
    try {
      const result = await uploadFile(file);
      router.push(`/documents/${result.document_id}?autoReview=true`);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-xs tracking-wide uppercase mb-3 inline-block transition-colors">
              VOS
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          </div>
          <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors cursor-pointer">
            + Upload
            <input type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#12121a] rounded-xl p-5 border border-[#2a2a3a] animate-pulse">
                <div className="h-5 bg-[#1a1a25] rounded w-1/3 mb-3" />
                <div className="h-3 bg-[#1a1a25] rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 opacity-30">
              <svg className="w-16 h-16 mx-auto text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-neutral-500 mb-4">No documents yet</p>
            <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
              Upload your first document
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="block bg-[#12121a] hover:bg-[#16161f] rounded-xl p-5 border border-[#2a2a3a] hover:border-[#3a3a4a] transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#e4e4ec] group-hover:text-white transition-colors truncate">
                      {doc.title}
                    </h3>
                    {doc.description && (
                      <p className="text-neutral-500 text-sm mt-1 truncate">{doc.description}</p>
                    )}
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-xs text-neutral-500">{formatDate(doc.created_at)}</div>
                    {doc.review_count > 0 && (
                      <div className="text-xs text-indigo-400 mt-1">
                        {doc.review_count} review{doc.review_count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

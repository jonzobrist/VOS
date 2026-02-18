'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  fetchDocuments, uploadFile, archiveDocument, restoreDocument, deleteDocument,
  type Document,
} from '@/lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const router = useRouter();

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await fetchDocuments(showArchived);
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    setLoading(true);
    setSelectedIds(new Set());
    loadDocuments();
  }, [loadDocuments]);

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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)));
    }
  };

  const handleArchive = async (id: string) => {
    setActionLoading(id);
    try {
      await archiveDocument(id);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      await loadDocuments();
    } finally { setActionLoading(null); }
  };

  const handleRestore = async (id: string) => {
    setActionLoading(id);
    try {
      await restoreDocument(id);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      await loadDocuments();
    } finally { setActionLoading(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this document and all its reviews?')) return;
    setActionLoading(id);
    try {
      await deleteDocument(id);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      await loadDocuments();
    } finally { setActionLoading(null); }
  };

  const handleBulkArchive = async () => {
    setActionLoading('bulk');
    try {
      await Promise.all([...selectedIds].map(id => archiveDocument(id)));
      setSelectedIds(new Set());
      await loadDocuments();
    } finally { setActionLoading(null); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Permanently delete ${selectedIds.size} document(s) and all their reviews?`)) return;
    setActionLoading('bulk');
    try {
      await Promise.all([...selectedIds].map(id => deleteDocument(id)));
      setSelectedIds(new Set());
      await loadDocuments();
    } finally { setActionLoading(null); }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Show archived toggle */}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                showArchived
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-[#1a1a25] text-neutral-400 hover:text-neutral-300 border border-[#2a2a3a]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              {showArchived ? 'Showing archived' : 'Show archived'}
            </button>
            <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors cursor-pointer">
              + Upload
              <input type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-[#12121a] rounded-xl border border-indigo-500/30 animate-slide-in">
            <span className="text-xs text-indigo-400 font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkArchive}
              disabled={actionLoading === 'bulk'}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
            >
              Archive selected
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={actionLoading === 'bulk'}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40"
            >
              Delete selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

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
            <p className="text-neutral-500 mb-4">
              {showArchived ? 'No documents found' : 'No documents yet'}
            </p>
            {!showArchived && (
              <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
                Upload your first document
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select all row */}
            {documents.length > 1 && (
              <div className="flex items-center gap-3 px-5 py-2">
                <button
                  onClick={toggleSelectAll}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    selectedIds.size === documents.length
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-[#3a3a4a] hover:border-[#5a5a6a]'
                  }`}
                >
                  {selectedIds.size === documents.length && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  )}
                </button>
                <span className="text-xs text-neutral-500">Select all</span>
              </div>
            )}

            {documents.map((doc) => {
              const isSelected = selectedIds.has(doc.id);
              const isLoading = actionLoading === doc.id;

              return (
                <div
                  key={doc.id}
                  className={`group flex items-start gap-3 bg-[#12121a] rounded-xl p-5 border transition-all ${
                    doc.is_archived
                      ? 'border-[#2a2a3a] opacity-50'
                      : isSelected
                        ? 'border-indigo-500/40 bg-indigo-500/5'
                        : 'border-[#2a2a3a] hover:border-[#3a3a4a] hover:bg-[#16161f]'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(doc.id)}
                    className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600'
                        : 'border-[#3a3a4a] hover:border-[#5a5a6a]'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                      </svg>
                    )}
                  </button>

                  {/* Document info - clickable to navigate */}
                  <Link
                    href={`/documents/${doc.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-semibold transition-colors truncate ${
                            doc.is_archived ? 'text-neutral-500' : 'text-[#e4e4ec] group-hover:text-white'
                          }`}>
                            {doc.title}
                          </h3>
                          {doc.is_archived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium flex-shrink-0">
                              ARCHIVED
                            </span>
                          )}
                        </div>
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

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.is_archived ? (
                      <button
                        onClick={() => handleRestore(doc.id)}
                        disabled={isLoading}
                        title="Restore"
                        className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchive(doc.id)}
                        disabled={isLoading}
                        title="Archive"
                        className="p-1.5 rounded-md text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={isLoading}
                      title="Delete"
                      className="p-1.5 rounded-md text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-40"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

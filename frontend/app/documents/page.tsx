'use client';

import { useState, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/config';

interface Document {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/documents/`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
              ← Back
            </Link>
            <h1 className="text-3xl font-bold">Documents</h1>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors"
          >
            {showUpload ? 'Show Documents' : '+ New Document'}
          </button>
        </div>

        {showUpload ? (
          <>
            {/* Drop Zone */}
            <DropZone />

            {/* Instructions */}
            <div className="mt-8 grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                <div className="text-lg mb-2">1️⃣</div>
                <p className="text-slate-400">Drop your <code className="text-indigo-400">.md</code> file</p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                <div className="text-lg mb-2">2️⃣</div>
                <p className="text-slate-400">AI personas start reviewing instantly</p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                <div className="text-lg mb-2">3️⃣</div>
                <p className="text-slate-400">Watch comments appear in real-time</p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Document List */}
            {loading ? (
              <div className="text-center py-12 text-slate-400">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">No documents yet</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  Upload your first document →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="block bg-slate-800/50 hover:bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{doc.title}</h3>
                        <p className="text-slate-400 text-sm mt-1">{doc.description}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>{formatDate(doc.created_at)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

import { API_BASE_URL } from './config';

export interface Document {
  id: string;
  title: string;
  description?: string;
  content: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  review_count: number;
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  system_prompt: string;
  tone: string;
  focus_areas: string[];
  color: string;
}

export interface Comment {
  id: string;
  content: string;
  persona_id: string;
  persona_name: string;
  persona_color: string;
  start_line: number;
  end_line: number;
  created_at: string;
}

export interface ReviewSummary {
  id: string;
  document_id: string;
  persona_ids: string[];
  status: string;
  created_at: string;
  completed_at?: string;
  comment_count: number;
}

export interface PersonaStatus {
  persona_id: string;
  persona_name: string;
  persona_color: string;
  status: 'queued' | 'running' | 'completed';
}

export interface MetaCommentSource {
  persona_id: string;
  persona_name: string;
  persona_color: string;
  original_content: string;
}

export interface MetaComment {
  id: string;
  content: string;
  start_line: number;
  end_line: number;
  sources: MetaCommentSource[];
  category: string;
  priority: string;
  created_at: string;
}

export async function fetchDocuments(includeArchived = false): Promise<Document[]> {
  const params = includeArchived ? '?include_archived=true' : '';
  const res = await fetch(`${API_BASE_URL}/api/v1/documents/${params}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function archiveDocument(id: string): Promise<Document> {
  const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}/archive`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to archive document');
  return res.json();
}

export async function restoreDocument(id: string): Promise<Document> {
  const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}/restore`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to restore document');
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete document');
}

export async function fetchDocument(id: string): Promise<Document> {
  const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

export async function fetchPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/personas/`);
  if (!res.ok) throw new Error('Failed to fetch personas');
  return res.json();
}

export async function uploadFile(file: File): Promise<{ document_id: string; title: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function uploadRaw(content: string, title?: string): Promise<{ document_id: string; title: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/upload/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title }),
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function fetchReviews(docId: string): Promise<ReviewSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/reviews`);
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

export async function fetchLatestComments(docId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/reviews/latest/comments`);
  if (!res.ok) return [];
  return res.json();
}

export async function synthesizeMetaReview(docId: string, reviewId: string): Promise<MetaComment[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/reviews/${reviewId}/meta`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to synthesize meta review');
  return res.json();
}

export async function fetchMetaComments(docId: string, reviewId: string): Promise<MetaComment[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/reviews/${reviewId}/meta`);
  if (!res.ok) return [];
  return res.json();
}

export function startReviewStream(
  docId: string,
  personaIds: string[],
  onEvent: (event: {
    type: string;
    persona_id?: string;
    persona_name?: string;
    persona_color?: string;
    status?: string;
    comment?: Comment;
    total_comments?: number;
    review_id?: string;
  }) => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/reviews/${docId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_ids: personaIds }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('Failed to start review');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data);
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onError(err);
      }
    }
  })();

  return controller;
}
